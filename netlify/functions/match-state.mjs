// GET /api/match-state?code=...&playerId=...
// The polling endpoint. Returns the caller's own full board, the
// opponent's board as colors only (no letters), and - only once the
// match is decided - the word, both scores, and the result.

import {
    computeScore, decideWinner, playerFinished, matchExpired,
    normalizeCode, isValidCode, jsonResponse, errorResponse
} from './lib/game.mjs';
import { readMeta, readPlayer, slotFor } from './lib/store.mjs';

export default async (req) => {
    const url = new URL(req.url);
    const code = normalizeCode(url.searchParams.get('code'));
    if (!isValidCode(code)) return errorResponse('Invalid room code');

    const meta = await readMeta(code);
    if (!meta) return errorResponse('Room not found', 404);

    const slot = slotFor(meta, url.searchParams.get('playerId'));
    if (!slot) return errorResponse('Not a player in this match', 403);
    const oppSlot = slot === 'p1' ? 'p2' : 'p1';

    const now = Date.now();
    const [p1, p2] = await Promise.all([readPlayer(code, 'p1'), readPlayer(code, 'p2')]);
    const me = slot === 'p1' ? p1 : p2;
    const opp = slot === 'p1' ? p2 : p1;

    // Phase of the match, computed at read time
    let status;
    const expired = matchExpired(meta, p1, p2, now);
    const meDone = me ? playerFinished(me) : false;
    const oppDone = opp ? playerFinished(opp) : false;

    if (!meta.p2Id) {
        status = expired ? 'expired' : 'waiting';
    } else if (now < meta.startAt) {
        status = 'countdown';
    } else if (meDone && oppDone) {
        status = 'finished';
    } else if (expired) {
        // One side walked away: whoever finished wins by forfeit.
        // Neither finished: the match just dies.
        status = (meDone || oppDone) ? 'finished' : 'expired';
    } else {
        status = 'active';
    }

    const response = {
        status,
        startAt: meta.startAt,
        serverNow: now,
        nextCode: meta.nextCode,
        you: me ? {
            rows: me.rows.map(r => ({ guess: r.guess, pattern: r.pattern })),
            solved: Boolean(me.solvedAt),
            failed: me.failed === true,
            finished: meDone
        } : null,
        opponent: (meta.p2Id && opp) ? {
            patterns: opp.rows.map(r => r.pattern),
            guessCount: opp.rows.length,
            solved: Boolean(opp.solvedAt),
            failed: opp.failed === true,
            finished: oppDone
        } : null
    };

    if (status === 'finished') {
        // Forfeit case: score the walked-away side as unfinished (0)
        const myScore = computeScore(me, meta.startAt);
        const oppScore = oppDone ? computeScore(opp, meta.startAt) : computeScore({ rows: opp.rows, solvedAt: null }, meta.startAt);
        const winner = decideWinner(
            slot === 'p1' ? myScore : oppScore,
            slot === 'p1' ? oppScore : myScore
        );
        response.word = meta.word;
        response.forfeit = expired && !(meDone && oppDone);
        response.yourScore = myScore;
        response.opponentScore = oppScore;
        response.opponentRows = opp.rows.map(r => ({ guess: r.guess, pattern: r.pattern }));
        response.result = winner === 'draw' ? 'draw'
            : (winner === slot ? 'win' : 'loss');
    }

    return jsonResponse(response);
};

export const config = { path: '/api/match-state' };
