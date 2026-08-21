// POST /api/create-match
// Creates a room with a fresh code and a server-chosen solution word.
// The word is stored server-side only and never appears in any response
// until the match is over.

import { randomCode, randomSolution, newSeries, jsonResponse, errorResponse } from './lib/game.mjs';
import { readMeta, writeMeta, writePlayer, emptyPlayer } from './lib/store.mjs';

export default async (req) => {
    if (req.method !== 'POST') return errorResponse('POST required', 405);

    // Retry on the (unlikely) event of a code collision with a live match
    let code = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = randomCode();
        if (!(await readMeta(candidate))) {
            code = candidate;
            break;
        }
    }
    if (!code) return errorResponse('Could not allocate a room code, try again', 503);

    const playerId = crypto.randomUUID();
    const meta = {
        code,
        word: randomSolution(),
        createdAt: Date.now(),
        startAt: null,
        p1Id: playerId,
        p2Id: null,
        nextCode: null,
        series: newSeries()
    };

    await writeMeta(code, meta);
    await writePlayer(code, 'p1', emptyPlayer());

    return jsonResponse({ code, playerId, role: 'p1' });
};

export const config = { path: '/api/create-match' };
