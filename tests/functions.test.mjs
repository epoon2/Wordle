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
import { readMeta, writeMeta } from '../netlify/functions/lib/store.mjs';

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
    const { readPlayer, writePlayer } = await import('../netlify/functions/lib/store.mjs');
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
