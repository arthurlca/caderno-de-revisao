// Servidor estático para testar localmente e pela rede Wi-Fi.
// Uso: npm run serve   (porta: PORT=8080 por padrão)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, normalize, extname, sep } from 'node:path';
import { ROOT } from './assets.mjs';

const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};
const BLOCKED = /^(tests|tools|node_modules|\.git)(\/|$)/;

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    const rel = normalize(path || 'index.html');
    if (rel.startsWith('..') || BLOCKED.test(rel.split(sep).join('/'))) { res.writeHead(404).end(); return; }
    let file = join(ROOT, rel);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
    console.log(`200 ${req.url}`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    console.log(`404 ${req.url}`);
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nCaderno de Revisão em http://localhost:${PORT}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  na rede:  http://${i.address}:${PORT}`);
    }
  }
  console.log('\nCtrl+C para parar.\n');
});
