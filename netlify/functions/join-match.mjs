// POST /api/join-match  { code }
// Registers player 2 and arms a synchronized start a few seconds out,
// so both clients count down to the same server timestamp.

import { normalizeCode, isValidCode, jsonResponse, errorResponse, COUNTDOWN_MS, MATCH_TTL_MS } from './lib/game.mjs';
import { readMeta, writeMeta, writePlayer, emptyPlayer } from './lib/store.mjs';

export default async (req) => {
    if (req.method !== 'POST') return errorResponse('POST required', 405);

    const body = await req.json().catch(() => ({}));
    const code = normalizeCode(body.code);
    if (!isValidCode(code)) return errorResponse('Invalid room code');

    const meta = await readMeta(code);
    if (!meta) return errorResponse('Room not found', 404);
    if (meta.p2Id) return errorResponse('Room is already full', 409);
    if (Date.now() - meta.createdAt > MATCH_TTL_MS) return errorResponse('Room has expired', 410);

    const playerId = crypto.randomUUID();
    meta.p2Id = playerId;
    meta.startAt = Date.now() + COUNTDOWN_MS;
    await writeMeta(code, meta);
    await writePlayer(code, 'p2', emptyPlayer());

    // Two people joining the same code at once is a last-write-wins race
    // on meta, so re-read and confirm this player actually got the seat.
    const confirmed = await readMeta(code);
    if (confirmed.p2Id !== playerId) return errorResponse('Room is already full', 409);

    return jsonResponse({ code, playerId, role: 'p2', startAt: confirmed.startAt });
};

export const config = { path: '/api/join-match' };
