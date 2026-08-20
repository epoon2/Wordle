// Blob storage layout for matches. The layout is what makes concurrent
// play safe without transactions: each player only ever writes their own
// blob, and the shared meta blob is written only at create, join, and
// rematch time. Finish detection is computed at read time from the two
// player blobs, so there is no read-modify-write race on shared state.
//
//   matches/{code}/meta  { code, word, createdAt, startAt, p1Id, p2Id, nextCode }
//   matches/{code}/p1    { rows: [{ guess, pattern, t }], solvedAt, failed }
//   matches/{code}/p2    same shape

import { getStore } from '@netlify/blobs';

function store() {
    // Strong consistency: a game is exactly the case where a stale read
    // (a guess that "disappears") is worse than the extra latency.
    return getStore({ name: 'matches', consistency: 'strong' });
}

export async function readMeta(code) {
    return store().get(`${code}/meta`, { type: 'json' });
}

export async function writeMeta(code, meta) {
    await store().setJSON(`${code}/meta`, meta);
}

export async function readPlayer(code, slot) {
    return store().get(`${code}/${slot}`, { type: 'json' });
}

export async function writePlayer(code, slot, player) {
    await store().setJSON(`${code}/${slot}`, player);
}

export function emptyPlayer() {
    return { rows: [], solvedAt: null, failed: false };
}

// Which slot does this playerId occupy? Returns 'p1' | 'p2' | null.
export function slotFor(meta, playerId) {
    if (playerId && meta.p1Id === playerId) return 'p1';
    if (playerId && meta.p2Id === playerId) return 'p2';
    return null;
}
