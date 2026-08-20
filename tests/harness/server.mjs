// Local dev/test server: serves the static site and mounts the Netlify
// functions at their /api/* routes, storing matches in the in-memory
// Blobs shim. Lets the whole multiplayer stack run with plain node:
//
//   node tests/harness/server.mjs [port]
//
// Then open http://localhost:8888/multiplayer.html in two windows.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import createMatch from '../../netlify/functions/create-match.mjs';
import joinMatch from '../../netlify/functions/join-match.mjs';
import submitGuess from '../../netlify/functions/submit-guess.mjs';
import matchState from '../../netlify/functions/match-state.mjs';
import rematch from '../../netlify/functions/rematch.mjs';
import { readMeta } from '../../netlify/functions/lib/store.mjs';

// Test-only endpoint (harness only, never deployed): reveal a match's word
// so end-to-end tests can play a deliberate win or loss.
async function testWord(req) {
    const code = new URL(req.url).searchParams.get('code');
    const meta = await readMeta(code);
    return new Response(JSON.stringify({ word: meta ? meta.word : null }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

const ROUTES = {
    '/api/_test/word': testWord,
    '/api/create-match': createMatch,
    '/api/join-match': joinMatch,
    '/api/submit-guess': submitGuess,
    '/api/match-state': matchState,
    '/api/rematch': rematch
};

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.txt': 'text/plain', '.json': 'application/json', '.svg': 'image/svg+xml'
};

const ROOT = new URL('../../', import.meta.url).pathname;
const PORT = Number(process.argv[2] || 8888);

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // API routes -> function handlers (web Request in, web Response out)
    const handler = ROUTES[url.pathname];
    if (handler) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const request = new Request(url, {
            method: req.method,
            headers: req.headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : body
        });
        try {
            const response = await handler(request);
            res.writeHead(response.status, Object.fromEntries(response.headers));
            res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
            console.error(e);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal error' }));
        }
        return;
    }

    // Static files
    let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end(); return;
    }
    try {
        const content = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        res.end(content);
    } catch (e) {
        res.writeHead(404); res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`Wordle dev server: http://localhost:${PORT}`);
});
