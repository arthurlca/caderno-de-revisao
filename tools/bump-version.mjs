// Atualiza VERSION e ASSETS no sw.js antes de publicar.
// A versão é um hash do conteúdo de todos os arquivos, então só muda quando algo mudou.
// Uso: npm run bump

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, diskAssets } from './assets.mjs';

const swPath = join(ROOT, 'sw.js');
let sw = readFileSync(swPath, 'utf8');

const assets = diskAssets();
const hash = createHash('sha256');
for (const a of assets) hash.update(a).update(readFileSync(join(ROOT, a)));
const version = hash.digest('hex').slice(0, 10);

const list = ['./', ...assets].map((a) => `  '${a}',`).join('\n');
sw = sw
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = [\n${list}\n];`);
writeFileSync(swPath, sw);
console.log(`sw.js: VERSION = ${version} (${assets.length + 1} arquivos no cache)`);
