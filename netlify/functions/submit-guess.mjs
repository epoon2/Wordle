// POST /api/submit-guess  { code, playerId, guess }
// Validates and scores a guess entirely server-side and returns only the
// color pattern - the solution never leaves the server here. Each call
// writes only the calling player's own blob, so two players submitting
// at the same instant can never overwrite each other.

import {
    scoreGuess, isValidGuess, normalizeCode, isValidCode,
    playerFinished, matchExpired, MAX_GUESSES,
    jsonResponse, errorResponse
} from './lib/game.mjs';
import { readMeta, readPlayer, writePlayer, slotFor } from './lib/store.mjs';

export default async (req) => {
    if (req.method !== 'POST') return errorResponse('POST required', 405);

    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    if (!isValidCode(code)) return errorResponse('Invalid room code');

    const meta = await readMeta(code);
    if (!meta) return errorResponse('Room not found', 404);

    const slot = slotFor(meta, body.playerId);
    if (!slot) return errorResponse('Not a player in this match', 403);

    const now = Date.now();
    if (!meta.startAt) return errorResponse('Match has not started yet');
    if (now < meta.startAt) return errorResponse('Countdown still running');

    const [p1, p2] = await Promise.all([readPlayer(code, 'p1'), readPlayer(code, 'p2')]);
    if (matchExpired(meta, p1, p2, now)) return errorResponse('Match has expired', 410);

    const me = slot === 'p1' ? p1 : p2;
    if (playerFinished(me)) return errorResponse('You have already finished');

    if (!isValidGuess(body.guess)) return errorResponse('Not in word list');
    const guess = body.guess.toUpperCase();

    const pattern = scoreGuess(guess, meta.word);
    me.rows.push({ guess, pattern, t: now });

    const solved = guess === meta.word;
    if (solved) {
        me.solvedAt = now;
    } else if (me.rows.length >= MAX_GUESSES) {
        me.failed = true;
    }

    await writePlayer(code, slot, me);

    return jsonResponse({
        pattern,
        solved,
        failed: me.failed,
        rowsUsed: me.rows.length,
        finished: playerFinished(me)
    });
};

export const config = { path: '/api/submit-guess' };
