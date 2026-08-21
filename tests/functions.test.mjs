// Integration tests for the multiplayer API handlers, run directly against
// the function modules with the in-memory Blobs shim in node_modules.
// Run from the repo root:  node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import createMatch from '../netlify/functions/create-match.mjs';
import joinMatch from '../netlify/functions/join-match.mjs';
import submitGuess from '../netlify/functions/submit-guess.mjs';
import matchState from '../netlify/functions/match-state.mjs';
import rematch from '../netlify/functions/rematch.mjs';
import { readMeta, writeMeta, readPlayer, writePlayer } from '../netlify/functions/lib/store.mjs';

const BASE = 'http://localhost';

async function call(handler, { method = 'POST', path = '/', body, query } = {}) {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
    const req = new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const res = await handler(req);
    return { status: res.status, body: await res.json() };
}

const state = (code, playerId) =>
    call(matchState, { method: 'GET', query: { code, playerId } });

// Make a match already past its countdown so guesses are accepted
async function makeStartedMatch(word) {
    const created = (await call(createMatch, {})).body;
    const joined = (await call(joinMatch, { body: { code: created.code } })).body;
    const meta = await readMeta(created.code);
    meta.startAt = Date.now() - 1000;
    if (word) meta.word = word;
    await writeMeta(created.code, meta);
    return { code: created.code, p1: created.playerId, p2: joined.playerId, word: meta.word };
}

test('full match: both solve, faster fewer-guess player wins', async () => {
    const { code, p1, p2, word } = await makeStartedMatch('CRANE');
    assert.equal(word, 'CRANE');

    // p1 misses once then solves (2 guesses); p2 solves immediately (1 guess)
    let r = (await call(submitGuess, { body: { code, playerId: p1, guess: 'AUDIO' } })).body;
    assert.deepEqual(r.pattern, ['present', 'absent', 'absent', 'absent', 'absent']);
    assert.equal(r.solved, false);

    r = (await call(submitGuess, { body: { code, playerId: p2, guess: 'CRANE' } })).body;
    assert.equal(r.solved, true);

    // Mid-match state for p1: opponent finished, colors only, no word leak
    let s = (await state(code, p1)).body;
    assert.equal(s.status, 'active');
    assert.equal(s.opponent.solved, true);
    assert.equal(s.opponent.guessCount, 1);
    assert.ok(!('word' in s), 'word must not leak before the match ends');
    assert.ok(!JSON.stringify(s.opponent).includes('"guess"'), 'opponent letters must not leak');

    r = (await call(submitGuess, { body: { code, playerId: p1, guess: 'CRANE' } })).body;
    assert.equal(r.solved, true);

    // Finished: word revealed, p2 wins (1 guess beats 2)
    s = (await state(code, p1)).body;
    assert.equal(s.status, 'finished');
    assert.equal(s.word, 'CRANE');
    assert.equal(s.result, 'loss');
    assert.ok(s.opponentScore.total > s.yourScore.total);

    const s2 = (await state(code, p2)).body;
    assert.equal(s2.result, 'win');
    assert.equal(s2.yourScore.guesses, 1);
    assert.equal(s2.yourScore.solveBonus, 600);
    assert.equal(s2.yourScore.guessPoints, 600);
});

test('a player who fails all six guesses scores zero', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    for (let i = 0; i < 6; i++) {
        const r = (await call(submitGuess, { body: { code, playerId: p1, guess: 'LYMPH' } })).body;
        if (i < 5) assert.equal(r.failed, false);
        else assert.equal(r.failed, true);
    }
    // Seventh guess rejected
    const rejected = await call(submitGuess, { body: { code, playerId: p1, guess: 'LYMPH' } });
    assert.equal(rejected.status, 400);

    await call(submitGuess, { body: { code, playerId: p2, guess: 'CRANE' } });
    const s = (await state(code, p1)).body;
    assert.equal(s.status, 'finished');
    assert.equal(s.result, 'loss');
    assert.equal(s.yourScore.total, 0);
});

test('server rejects: invalid words, wrong players, early guesses, full rooms', async () => {
    const created = (await call(createMatch, {})).body;

    // Guessing before anyone joins / before start
    let r = await call(submitGuess, { body: { code: created.code, playerId: created.playerId, guess: 'CRANE' } });
    assert.equal(r.status, 400);

    const joined = (await call(joinMatch, { body: { code: created.code } })).body;

    // Countdown still running
    r = await call(submitGuess, { body: { code: created.code, playerId: created.playerId, guess: 'CRANE' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Countdown/);

    const meta = await readMeta(created.code);
    meta.startAt = Date.now() - 1000;
    await writeMeta(created.code, meta);

    // Not a real word
    r = await call(submitGuess, { body: { code: created.code, playerId: created.playerId, guess: 'ZZZZZ' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /word list/);

    // Not a player in this match
    r = await call(submitGuess, { body: { code: created.code, playerId: 'intruder', guess: 'CRANE' } });
    assert.equal(r.status, 403);
    r = await state(created.code, 'intruder');
    assert.equal(r.status, 403);

    // Third player cannot join
    r = await call(joinMatch, { body: { code: created.code } });
    assert.equal(r.status, 409);

    // Unknown room
    r = await call(joinMatch, { body: { code: 'ABCDEF' } });
    assert.equal(r.status, 404);

    assert.ok(joined.playerId);
});

test('simultaneous submissions from the two players never lose a guess', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    // Both players submit at the same instant, four rounds in a row.
    // Per-player blobs make cross-player concurrency safe by design.
    const guesses = ['AUDIO', 'LYMPH', 'BANAL', 'SPOON'];
    for (let i = 0; i < guesses.length; i++) {
        await Promise.all([
            call(submitGuess, { body: { code, playerId: p1, guess: guesses[i], rowIndex: i } }),
            call(submitGuess, { body: { code, playerId: p2, guess: guesses[i], rowIndex: i } })
        ]);
    }
    const s = (await state(code, p1)).body;
    assert.equal(s.you.rows.length, 4);
    assert.equal(s.opponent.guessCount, 4);
});

test('a duplicate double-submit cannot corrupt or double-count a row', async () => {
    const { code, p1 } = await makeStartedMatch('CRANE');
    // Double Enter: two identical submissions for the same row at once.
    // At least one succeeds; the rowIndex check stops any later replay.
    await Promise.all([
        call(submitGuess, { body: { code, playerId: p1, guess: 'AUDIO', rowIndex: 0 } }),
        call(submitGuess, { body: { code, playerId: p1, guess: 'AUDIO', rowIndex: 0 } })
    ]);
    let s = (await state(code, p1)).body;
    assert.equal(s.you.rows.length, 1);

    // A stale replay of row 0 is now rejected outright
    const replay = await call(submitGuess, { body: { code, playerId: p1, guess: 'BANAL', rowIndex: 0 } });
    assert.equal(replay.status, 409);

    // And the properly sequenced next row still works
    const next = await call(submitGuess, { body: { code, playerId: p1, guess: 'BANAL', rowIndex: 1 } });
    assert.equal(next.status, 200);
    s = (await state(code, p1)).body;
    assert.equal(s.you.rows.length, 2);
});

test('forfeit: an abandoned match finishes in favor of the finished player', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    await call(submitGuess, { body: { code, playerId: p1, guess: 'CRANE' } });

    // Age every timestamp past the TTL
    const meta = await readMeta(code);
    meta.createdAt -= 11 * 60 * 1000;
    meta.startAt -= 11 * 60 * 1000;
    await writeMeta(code, meta);
    const player1 = await readPlayer(code, 'p1');
    player1.rows.forEach(row => { row.t -= 11 * 60 * 1000; });
    player1.solvedAt -= 11 * 60 * 1000;
    await writePlayer(code, 'p1', player1);

    const s = (await state(code, p1)).body;
    assert.equal(s.status, 'finished');
    assert.equal(s.forfeit, true);
    assert.equal(s.result, 'win');

    const s2 = (await state(code, p2)).body;
    assert.equal(s2.result, 'loss');
});

test('rematch: second requester converges on the first rematch room', async () => {
    const { code, p1, p2, word } = await makeStartedMatch('CRANE');
    await call(submitGuess, { body: { code, playerId: p1, guess: 'CRANE' } });
    await call(submitGuess, { body: { code, playerId: p2, guess: 'CRANE' } });

    const first = (await call(rematch, { body: { code, playerId: p1 } })).body;
    assert.ok(first.nextCode);
    assert.ok(first.playerId, 'first requester hosts the new room');

    const second = (await call(rematch, { body: { code, playerId: p2 } })).body;
    assert.equal(second.nextCode, first.nextCode);
    assert.ok(!second.playerId, 'second requester is told to join, not host');

    // The old match's state now advertises the rematch
    const s = (await state(code, p2)).body;
    assert.equal(s.nextCode, first.nextCode);

    // And the new room has a fresh word (with 2308 solutions a collision
    // is possible but wildly unlikely; just check the room is playable)
    const joined = (await call(joinMatch, { body: { code: first.nextCode } })).body;
    assert.ok(joined.playerId);
    assert.ok(joined.startAt > Date.now());
    const newMeta = await readMeta(first.nextCode);
    assert.equal(typeof newMeta.word, 'string');
    assert.equal(newMeta.word.length, 5);
    assert.ok(word.length === 5);
});

// ----- Best-of-N series across a chain of rematches -----

// Play a decided round: p1 solves in 1, p2 fails out, so p1 wins.
async function playRound(code, p1, p2, word, winnerSlot = 'p1') {
    const winner = winnerSlot === 'p1' ? p1 : p2;
    const loser = winnerSlot === 'p1' ? p2 : p1;
    await call(submitGuess, { body: { code, playerId: winner, guess: word } });
    for (let i = 0; i < 6; i++) {
        await call(submitGuess, { body: { code, playerId: loser, guess: 'LYMPH' } });
    }
}

// Take the winner of a finished round into the next one, returning the
// successor room with both players seated and its countdown already over.
async function startRematch(code, requesterId, otherId) {
    const first = (await call(rematch, { body: { code, playerId: requesterId } })).body;
    const second = (await call(rematch, { body: { code, playerId: otherId } })).body;
    assert.equal(second.nextCode, first.nextCode);
    const joined = (await call(joinMatch, { body: { code: first.nextCode } })).body;
    const meta = await readMeta(first.nextCode);
    meta.startAt = Date.now() - 1000;
    meta.word = 'CRANE';
    await writeMeta(first.nextCode, meta);
    return { code: first.nextCode, host: first.playerId, guest: joined.playerId };
}

test('series: a new room starts at round 1 with an empty tally', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    const s = (await state(code, p1)).body;
    assert.deepEqual(s.series, { round: 1, you: 0, opponent: 0, draws: 0 });
    const s2 = (await state(code, p2)).body;
    assert.deepEqual(s2.series, { round: 1, you: 0, opponent: 0, draws: 0 });
});

test('series: the finished round counts immediately and both sides agree', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    await playRound(code, p1, p2, 'CRANE', 'p1');

    const winner = (await state(code, p1)).body;
    const loser = (await state(code, p2)).body;
    assert.equal(winner.result, 'win');
    assert.deepEqual(winner.series, { round: 1, you: 1, opponent: 0, draws: 0 });
    assert.deepEqual(loser.series, { round: 1, you: 0, opponent: 1, draws: 0 });
});

test('series: the successor room inherits the tally and both players see it', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    await playRound(code, p1, p2, 'CRANE', 'p1');

    // The loser asks for the rematch, so the slots swap in round 2 - the
    // tally has to follow the players, not the p1/p2 seats.
    const round2 = await startRematch(code, p2, p1);
    const hostView = (await state(round2.code, round2.host)).body;   // was p2
    const guestView = (await state(round2.code, round2.guest)).body; // was p1
    assert.deepEqual(hostView.series, { round: 2, you: 0, opponent: 1, draws: 0 });
    assert.deepEqual(guestView.series, { round: 2, you: 1, opponent: 0, draws: 0 });

    // Round 2 goes to the round 1 loser: the series is level at 1-1
    await playRound(round2.code, round2.host, round2.guest, 'CRANE', 'p1');
    assert.deepEqual((await state(round2.code, round2.host)).body.series,
        { round: 2, you: 1, opponent: 1, draws: 0 });
    assert.deepEqual((await state(round2.code, round2.guest)).body.series,
        { round: 2, you: 1, opponent: 1, draws: 0 });

    // ...and round 3 starts from 1-1
    const round3 = await startRematch(round2.code, round2.guest, round2.host);
    assert.deepEqual((await state(round3.code, round3.host)).body.series,
        { round: 3, you: 1, opponent: 1, draws: 0 });
    assert.deepEqual((await state(round3.code, round3.guest)).body.series,
        { round: 3, you: 1, opponent: 1, draws: 0 });
});

test('series: draws are carried separately from wins', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    // Both fail out: equal zero scores, so the round is a draw
    for (let i = 0; i < 6; i++) {
        await call(submitGuess, { body: { code, playerId: p1, guess: 'LYMPH' } });
        await call(submitGuess, { body: { code, playerId: p2, guess: 'LYMPH' } });
    }
    const s = (await state(code, p1)).body;
    assert.equal(s.result, 'draw');
    assert.deepEqual(s.series, { round: 1, you: 0, opponent: 0, draws: 1 });

    const round2 = await startRematch(code, p1, p2);
    assert.deepEqual((await state(round2.code, round2.host)).body.series,
        { round: 2, you: 0, opponent: 0, draws: 1 });
});

test('series: a forfeit win counts, and a dead round counts for nobody', async () => {
    const { code, p1, p2 } = await makeStartedMatch('CRANE');
    await call(submitGuess, { body: { code, playerId: p1, guess: 'CRANE' } });
    const aged = await readMeta(code);
    aged.createdAt -= 11 * 60 * 1000;
    aged.startAt -= 11 * 60 * 1000;
    await writeMeta(code, aged);
    const player1 = await readPlayer(code, 'p1');
    player1.rows.forEach(row => { row.t -= 11 * 60 * 1000; });
    player1.solvedAt -= 11 * 60 * 1000;
    await writePlayer(code, 'p1', player1);

    assert.deepEqual((await state(code, p1)).body.series, { round: 1, you: 1, opponent: 0, draws: 0 });
    const round2 = await startRematch(code, p1, p2);
    assert.deepEqual((await state(round2.code, round2.host)).body.series,
        { round: 2, you: 1, opponent: 0, draws: 0 });

    // Bailing out of an undecided round advances the round but no score
    const round3 = await startRematch(round2.code, round2.host, round2.guest);
    assert.deepEqual((await state(round3.code, round3.host)).body.series,
        { round: 3, you: 1, opponent: 0, draws: 0 });
});
