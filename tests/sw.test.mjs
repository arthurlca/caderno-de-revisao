import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, diskAssets, swAssets } from '../tools/assets.mjs';

test('sw.js guarda exatamente os arquivos do app', () => {
  const declared = swAssets();
  assert.equal(declared[0], './');
  for (const a of declared.slice(1)) assert.ok(existsSync(join(ROOT, a)), `falta no disco: ${a}`);
  assert.deepEqual(declared.slice(1).sort(), diskAssets(), 'lista do sw.js desatualizada: rode npm run bump');
});

test('manifest aponta para ícones existentes e usa caminhos relativos', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.short_name.length <= 12);
  for (const i of m.icons) {
    assert.ok(!i.src.startsWith('/'), 'caminho relativo (funciona em subpasta do GitHub Pages)');
    assert.ok(existsSync(join(ROOT, i.src)), i.src);
  }
  const apple = readFileSync(join(ROOT, 'icons/apple-touch-icon.png'));
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
});

test('index.html tem as meta tags do iOS', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const s of ['viewport-fit=cover', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style', 'apple-touch-icon', 'manifest.webmanifest']) {
    assert.ok(html.includes(s), s);
  }
});

test('todos os módulos do app têm sintaxe válida', () => {
  // Um erro de sintaxe em qualquer tela deixa o app inteiro em branco
  for (const a of diskAssets().filter((f) => /\.m?js$/.test(f))) {
    const r = spawnSync(process.execPath, ['--check', join(ROOT, a)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${a}:\n${r.stderr}`);
  }
  const sw = spawnSync(process.execPath, ['--check', join(ROOT, 'sw.js')], { encoding: 'utf8' });
  assert.equal(sw.status, 0, sw.stderr);
});

test('imports relativos de todos os módulos apontam para arquivos existentes', () => {
  for (const a of diskAssets().filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, a), 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
      const target = join(ROOT, a, '..', m[1]);
      assert.ok(existsSync(target), `${a} importa ${m[1]}`);
    }
  }
});
