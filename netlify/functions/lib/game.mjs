// Core multiplayer game logic, shared by all functions.
// scoreGuess mirrors the client implementation in src/app.js exactly;
// a parity test in tests/ keeps the two in sync.

import { SOLUTION_WORDS, VALID_WORDS } from './words.mjs';

export const MAX_GUESSES = 6;
export const COUNTDOWN_MS = 5000;      // delay between join and start
export const MATCH_TTL_MS = 10 * 60 * 1000; // inactivity forfeit window

// Score a guess against a solution.
// Returns an array of 'correct' | 'present' | 'absent', one per letter.
export function scoreGuess(guess, solution) {
    const wordCopy = solution.split('');
    const guessUpper = guess.toUpperCase();
    const results = Array(5).fill('absent');

    // First pass: check for correct letters
    for (let i = 0; i < 5; i++) {
        if (guessUpper[i] === solution[i]) {
            results[i] = 'correct';
            wordCopy[i] = null; // Mark as used
        }
    }

    // Second pass: check for present letters
    for (let i = 0; i < 5; i++) {
        if (results[i] !== 'correct') {
            const letterIndex = wordCopy.indexOf(guessUpper[i]);
            if (letterIndex !== -1) {
                results[i] = 'present';
                wordCopy[letterIndex] = null; // Mark as used
            }
        }
    }

    return results;
}

export function isValidGuess(word) {
    return typeof word === 'string'
        && /^[A-Za-z]{5}$/.test(word)
        && VALID_WORDS.has(word.toUpperCase());
}

export function randomSolution() {
    return SOLUTION_WORDS[Math.floor(Math.random() * SOLUTION_WORDS.length)];
}

// Room codes: 6 characters from an alphabet with no 0/O/1/I lookalikes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
}

export function normalizeCode(code) {
    return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export function isValidCode(code) {
    return /^[A-Z2-9]{6}$/.test(code) && ![...code].some(c => !CODE_ALPHABET.includes(c));
}

// Scoring. All dials in one place:
//   solve bonus     600 for getting the word at all (0 on a fail)
//   guess points    (7 - guesses used) * 100, so 600 down to 100
//   speed bonus     max(0, 300 - full seconds elapsed), from server clocks
// Guesses outweigh raw speed on purpose - guessing well beats typing fast.
export function computeScore(player, startAt) {
    if (!player.solvedAt) {
        return { solved: false, total: 0, solveBonus: 0, guessPoints: 0, speedBonus: 0, guesses: player.rows.length, seconds: null };
    }
    const guesses = player.rows.length;
    const seconds = Math.max(0, Math.floor((player.solvedAt - startAt) / 1000));
    const solveBonus = 600;
    const guessPoints = (7 - guesses) * 100;
    const speedBonus = Math.max(0, 300 - seconds);
    return { solved: true, total: solveBonus + guessPoints + speedBonus, solveBonus, guessPoints, speedBonus, guesses, seconds };
}

// Decide the round from two finished score objects.
// Returns 'p1' | 'p2' | 'draw'. Tiebreaks: fewer guesses, then faster.
export function decideWinner(s1, s2) {
    if (s1.total !== s2.total) return s1.total > s2.total ? 'p1' : 'p2';
    if (s1.solved && s2.solved) {
        if (s1.guesses !== s2.guesses) return s1.guesses < s2.guesses ? 'p1' : 'p2';
        if (s1.seconds !== s2.seconds) return s1.seconds < s2.seconds ? 'p1' : 'p2';
    }
    return 'draw';
}

// A player is finished once they have solved, used all rows, or forfeited.
export function playerFinished(player) {
    return Boolean(player.solvedAt) || player.failed === true || player.rows.length >= MAX_GUESSES;
}

export function matchExpired(meta, p1, p2, now) {
    const lastActivity = Math.max(
        meta.createdAt,
        meta.startAt || 0,
        ...(p1 ? p1.rows.map(r => r.t) : [0]),
        ...(p2 ? p2.rows.map(r => r.t) : [0])
    );
    return now - lastActivity > MATCH_TTL_MS;
}

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
}

export function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}
