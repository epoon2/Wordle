// Installs an in-memory @netlify/blobs shim into node_modules so the
// function handlers can run locally (tests and the dev harness) with no
// npm install and no Netlify credentials. Idempotent; refuses to touch a
// real installed @netlify/blobs package.
//
//   node tests/harness/install-shim.mjs

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'node_modules', '@netlify', 'blobs');
const marker = '0.0.0-local-shim';

if (existsSync(join(dir, 'package.json'))) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (pkg.version !== marker) {
        console.log('Real @netlify/blobs is installed; leaving it alone.');
        process.exit(0);
    }
}

mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: '@netlify/blobs',
    version: marker,
    type: 'module',
    main: 'index.js',
    exports: { '.': './index.js' }
}, null, 2));

writeFileSync(join(dir, 'index.js'), `// Local in-memory shim of @netlify/blobs for tests and the dev harness.
// Only the surface the functions use: getStore().get/setJSON.
const stores = new Map();
export function getStore(options) {
  const name = typeof options === 'string' ? options : options.name;
  if (!stores.has(name)) stores.set(name, new Map());
  const data = stores.get(name);
  return {
    async get(key, opts) {
      if (!data.has(key)) return null;
      const raw = data.get(key);
      return opts && opts.type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) { data.set(key, JSON.stringify(value)); },
    async set(key, value) { data.set(key, String(value)); },
    async delete(key) { data.delete(key); }
  };
}
`);

console.log('Blobs shim installed at node_modules/@netlify/blobs');
