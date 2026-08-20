// POST /api/rematch  { code, playerId }
// Creates a successor match with a fresh word and links it from the old
// match's meta, so the other player's polling picks it up and follows.
// If both players click rematch at nearly the same moment, the double
// read-after-write check below makes both clients converge on one code.

import { randomCode, randomSolution, normalizeCode, isValidCode, jsonResponse, errorResponse } from './lib/game.mjs';
import { readMeta, writeMeta, writePlayer, emptyPlayer, slotFor } from './lib/store.mjs';

export default async (req) => {
    if (req.method !== 'POST') return errorResponse('POST required', 405);

    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    if (!isValidCode(code)) return errorResponse('Invalid room code');

    const meta = await readMeta(code);
    if (!meta) return errorResponse('Room not found', 404);

    const slot = slotFor(meta, body.playerId);
    if (!slot) return errorResponse('Not a player in this match', 403);

    // Someone already started the rematch: just report where to go
    if (meta.nextCode) return jsonResponse({ nextCode: meta.nextCode });

    // Create the successor room with this caller as its host
    const nextCode = randomCode();
    const playerId = crypto.randomUUID();
    await writeMeta(nextCode, {
        code: nextCode,
        word: randomSolution(),
        createdAt: Date.now(),
        startAt: null,
        p1Id: playerId,
        p2Id: null,
        nextCode: null
    });
    await writePlayer(nextCode, 'p1', emptyPlayer());

    // Link it, then confirm the link survived a concurrent rematch call
    meta.nextCode = nextCode;
    await writeMeta(code, meta);
    const confirmed = await readMeta(code);
    if (confirmed.nextCode !== nextCode) {
        // The other player's rematch won the race - follow theirs
        return jsonResponse({ nextCode: confirmed.nextCode });
    }

    return jsonResponse({ nextCode, playerId, role: 'p1' });
};

export const config = { path: '/api/rematch' };
