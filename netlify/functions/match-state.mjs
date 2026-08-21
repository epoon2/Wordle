// GET /api/match-state?code=...&playerId=...
// The polling endpoint. Returns the caller's own full board, the
// opponent's board as colors only (no letters), and - only once the
// match is decided - the word, both scores, and the result.

import {
    evaluateMatch, seriesOf, tallyWith,
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

    const verdict = evaluateMatch(meta, p1, p2, now);
    const status = verdict.status;

    // The series score, told from this caller's side. It always covers
    // every round whose result is known, so it gains the current round the
    // moment that round is decided - the same tally rematch will store on
    // the successor room, which is why both screens can never disagree.
    const series = seriesOf(meta);
    const tally = tallyWith(series, verdict.winner);

    const response = {
        status,
        startAt: meta.startAt,
        serverNow: now,
        series: {
            round: series.round,
            you: tally.wins[series.sides[slot]],
            opponent: tally.wins[series.sides[oppSlot]],
            draws: tally.draws
        },
        nextCode: meta.nextCode,
        you: me ? {
            rows: me.rows.map(r => ({ guess: r.guess, pattern: r.pattern })),
            solved: Boolean(me.solvedAt),
            failed: me.failed === true,
            finished: slot === 'p1' ? verdict.p1Done : verdict.p2Done
        } : null,
        opponent: (meta.p2Id && opp) ? {
            patterns: opp.rows.map(r => r.pattern),
            guessCount: opp.rows.length,
            solved: Boolean(opp.solvedAt),
            failed: opp.failed === true,
            finished: slot === 'p1' ? verdict.p2Done : verdict.p1Done
        } : null
    };

    if (status === 'finished') {
        response.word = meta.word;
        response.forfeit = verdict.forfeit;
        response.yourScore = verdict.scores[slot];
        response.opponentScore = verdict.scores[oppSlot];
        response.opponentRows = opp.rows.map(r => ({ guess: r.guess, pattern: r.pattern }));
        response.result = verdict.winner === 'draw' ? 'draw'
            : (verdict.winner === slot ? 'win' : 'loss');
    }

    return jsonResponse(response);
};

export const config = { path: '/api/match-state' };
