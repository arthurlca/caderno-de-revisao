// Lista os arquivos que o service worker precisa guardar (compartilhado por bump e testes).

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['css', 'js', 'vendor', 'icons'];
const EXT = /\.(js|mjs|css|png|webmanifest|html)$/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : EXT.test(e.name) ? [p] : [];
  });
}

/** Arquivos que existem no disco e devem estar no cache, como "./caminho". */
export function diskAssets() {
  const files = DIRS.flatMap((d) => walk(join(ROOT, d)));
  files.push(join(ROOT, 'index.html'), join(ROOT, 'manifest.webmanifest'));
  return files.map((f) => './' + relative(ROOT, f).split(sep).join('/')).sort();
}

/** ASSETS declarados no sw.js. */
export function swAssets(src = readFileSync(join(ROOT, 'sw.js'), 'utf8')) {
  const m = /const ASSETS = \[([\s\S]*?)\];/.exec(src);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}
