// Unit tests for the server game library, including a parity check that
// proves the server scores guesses identically to the client in src/app.js.
// Run from the repo root:  node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    scoreGuess, computeScore, decideWinner, randomCode, isValidCode,
    normalizeCode, isValidGuess, playerFinished, evaluateMatch, MAX_GUESSES
} from '../netlify/functions/lib/game.mjs';

// ----- scoreGuess: the classic double-letter cases -----

const CASES = [
    // [guess, solution, expected]
    ['CRANE', 'CRANE', ['correct', 'correct', 'correct', 'correct', 'correct']],
    ['AUDIO', 'CRANE', ['present', 'absent', 'absent', 'absent', 'absent']],
    // Two Ls in guess, two in solution, plus an exact E
    ['ALLEY', 'LAPEL', ['present', 'present', 'present', 'correct', 'absent']],
    // Guess has double letter, solution has one, one is exact
    ['SPOON', 'SNOOP', ['correct', 'present', 'correct', 'correct', 'present']],
    // Guess repeats a letter more times than the solution contains it:
    // one exact E, one present E, the third E must go absent
    ['EERIE', 'THREE', ['present', 'absent', 'correct', 'absent', 'correct']],
    // No letters at all
    ['LYMPH', 'CRANE', ['absent', 'absent', 'absent', 'absent', 'absent']],
    // Exact match consumes the letter before a 'present' can claim it
    ['MAMMA', 'MADAM', ['correct', 'correct', 'present', 'absent', 'present']]
];

for (const [guess, solution, expected] of CASES) {
    test(`scoreGuess ${guess} vs ${solution}`, () => {
        assert.deepEqual(scoreGuess(guess, solution), expected);
    });
}

// ----- Parity with the client implementation in src/app.js -----

test('server scoreGuess matches the client scoreGuess exactly', () => {
    const appJs = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
    const start = appJs.indexOf('function scoreGuess(');
    assert.ok(start !== -1, 'client scoreGuess not found in src/app.js');
    // Slice out the client function body by brace matching
    let depth = 0, end = -1;
    for (let i = appJs.indexOf('{', start); i < appJs.length; i++) {
        if (appJs[i] === '{') depth++;
        if (appJs[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const clientScoreGuess = new Function(`return (${appJs.slice(start, end)})`)();

    // A deterministic pseudo-random sweep over the two word lists
    const words = ['CRANE', 'LAPEL', 'SNOOP', 'THREE', 'MADAM', 'ABACK', 'BANAL',
                   'LLAMA', 'ALLEY', 'SPOON', 'EERIE', 'GEESE', 'VIVID', 'ONION'];
    let checked = 0;
    for (const solution of words) {
        for (const guess of words) {
            assert.deepEqual(
                scoreGuess(guess, solution),
                clientScoreGuess(guess, solution),
                `parity mismatch for ${guess} vs ${solution}`
            );
            checked++;
        }
    }
    assert.equal(checked, words.length * words.length);
});

// ----- Scoring formula -----

test('score: solve in 2 at 45 seconds', () => {
    const player = { rows: [{ t: 0 }, { t: 45000 }], solvedAt: 45000 };
    const s = computeScore(player, 0);
    assert.equal(s.solveBonus, 600);
    assert.equal(s.guessPoints, 500);
    assert.equal(s.speedBonus, 255);
    assert.equal(s.total, 1355);
});

test('score: solve in 6 slower than 300s gets no speed bonus', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ t: i * 60000 }));
    const s = computeScore({ rows, solvedAt: 400000 }, 0);
    assert.equal(s.guessPoints, 100);
    assert.equal(s.speedBonus, 0);
    assert.equal(s.total, 700);
});

test('score: failing scores zero', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ t: i * 1000 }));
    const s = computeScore({ rows, solvedAt: null, failed: true }, 0);
    assert.equal(s.total, 0);
    assert.equal(s.solved, false);
});

test('winner: higher total wins, ties break on guesses then time', () => {
    const a = { total: 1000, solved: true, guesses: 3, seconds: 60 };
    const b = { total: 900, solved: true, guesses: 3, seconds: 20 };
    assert.equal(decideWinner(a, b), 'p1');
    const c = { total: 1000, solved: true, guesses: 2, seconds: 90 };
    assert.equal(decideWinner(a, c), 'p2');            // fewer guesses
    const d = { total: 1000, solved: true, guesses: 3, seconds: 30 };
    assert.equal(decideWinner(a, d), 'p2');            // faster
    assert.equal(decideWinner(a, { ...a }), 'draw');
    // Both failed
    const f = { total: 0, solved: false, guesses: 6, seconds: null };
    assert.equal(decideWinner(f, { ...f }), 'draw');
});

// ----- Codes, validation, finish detection -----

test('room codes are 6 chars, valid, and avoid 0/O/1/I', () => {
    for (let i = 0; i < 200; i++) {
        const code = randomCode();
        assert.equal(code.length, 6);
        assert.ok(isValidCode(code), code);
        assert.ok(!/[01OI]/.test(code), code);
    }
    assert.equal(normalizeCode('  abc234 '), 'ABC234');
    assert.ok(!isValidCode('ABC10Z'));
});

test('guess validation', () => {
    assert.ok(isValidGuess('crane'));
    assert.ok(isValidGuess('CRANE'));
    assert.ok(!isValidGuess('zzzzz'));
    assert.ok(!isValidGuess('cran'));
    assert.ok(!isValidGuess('cranes'));
    assert.ok(!isValidGuess(null));
});

test('playerFinished', () => {
    assert.ok(playerFinished({ rows: [], solvedAt: 5, failed: false }));
    assert.ok(playerFinished({ rows: [], solvedAt: null, failed: true }));
    assert.ok(playerFinished({ rows: Array(MAX_GUESSES).fill({}), solvedAt: null, failed: false }));
    assert.ok(!playerFinished({ rows: [{}], solvedAt: null, failed: false }));
});

// ----- evaluateMatch: the shared read-time verdict -----

const started = (over = {}) => ({
    code: 'ABCDEF', word: 'CRANE', createdAt: 1000, startAt: 2000,
    p1Id: 'one', p2Id: 'two', nextCode: null, ...over
});
const solvedIn = (guesses, at) => ({
    rows: Array.from({ length: guesses }, (_, i) => ({ t: 2000 + i })),
    solvedAt: at, failed: false
});

test('evaluateMatch reports the phase of a match', () => {
    const empty = { rows: [], solvedAt: null, failed: false };
    assert.equal(evaluateMatch(started({ p2Id: null, startAt: null }), empty, null, 3000).status, 'waiting');
    assert.equal(evaluateMatch(started(), empty, empty, 1500).status, 'countdown');
    assert.equal(evaluateMatch(started(), empty, empty, 3000).status, 'active');
    // Nobody finished and the TTL has passed: the match just dies
    assert.equal(evaluateMatch(started(), empty, empty, 2000 + 11 * 60 * 1000).status, 'expired');
});

test('evaluateMatch decides a finished match and flags forfeits', () => {
    const meta = started();
    const winner = solvedIn(2, 5000);
    const loser = solvedIn(4, 9000);
    const decided = evaluateMatch(meta, winner, loser, 10000);
    assert.equal(decided.status, 'finished');
    assert.equal(decided.winner, 'p1');
    assert.equal(decided.forfeit, false);
    assert.ok(decided.scores.p1.total > decided.scores.p2.total);

    // p2 walked away: p1 wins by forfeit and p2 scores zero
    const late = 2000 + 11 * 60 * 1000;
    const abandoned = evaluateMatch(meta, winner, { rows: [], solvedAt: null, failed: false }, late);
    assert.equal(abandoned.status, 'finished');
    assert.equal(abandoned.forfeit, true);
    assert.equal(abandoned.winner, 'p1');
    assert.equal(abandoned.scores.p2.total, 0);
});
