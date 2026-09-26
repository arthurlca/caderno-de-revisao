import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildReport, pdfSafe } from '../js/core/pdf-report.js';

// O bundle UMD, carregado como módulo, se registra em globalThis.jspdf (como no navegador)
await import('../vendor/jspdf.umd.min.js');
const { jsPDF } = globalThis.jspdf;

const item = (i, extra = {}) => ({
  question: `Pergunta ${i}: o objeto da contabilidade é “qual”? Ação, coração e pão.`,
  options: ['Patrimônio', 'Lucro', 'Os ativos', 'As aziendas', 'As demonstrações contábeis — todas'],
  answer: 0,
  explanation: 'Segundo o CPC 00, o objeto da contabilidade é o patrimônio. '.repeat(i % 3 + 1),
  attempts: 5, wrongs: 5 - (i % 5),
  ...extra,
});

test('pdfSafe troca caracteres fora do Latin-1', () => {
  assert.equal(pdfSafe('“a” – b… ’c’ ✓ ação'), '"a" - b... \'c\' v ação');
  assert.equal(pdfSafe('emoji 😀 fim'), 'emoji  fim');
});

test('gera PDF de histórico com várias páginas e texto legível', () => {
  const items = Array.from({ length: 30 }, (_, i) => item(i + 1));
  const doc = buildReport(jsPDF, { title: 'Contabilidade', subtitle: 'Questões erradas', generatedAt: Date.UTC(2026, 8, 26), items });
  const pages = doc.getNumberOfPages();
  assert.ok(pages > 3, `páginas: ${pages}`);
  const buf = Buffer.from(doc.output('arraybuffer'));
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');

  // Se o pdftotext existir, confere acentos e marcações
  const dir = mkdtempSync(join(tmpdir(), 'caderno-'));
  const file = join(dir, 'r.pdf');
  writeFileSync(file, buf);
  if (process.env.KEEP_PDF) writeFileSync(process.env.KEEP_PDF, buf);
  const r = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  if (r.status === 0) {
    assert.match(r.stdout, /Ação, coração e pão/);
    assert.match(r.stdout, /A\) Patrimônio\s+\(correta\)/);
    assert.match(r.stdout, /Errou 5 de 5 vezes \(100% de erro\)/);
    assert.match(r.stdout, /EXPLICAÇÃO/);
    assert.match(r.stdout, new RegExp(`Caderno de Revisão · Contabilidade\\s+1\\s*/\\s*${pages}`));
  }
});

test('PDF da revisão marca a resposta escolhida; lista vazia não quebra', () => {
  const doc = buildReport(jsPDF, { title: 'T', generatedAt: 0, items: [item(1, { chosen: 2 })], mode: 'session' });
  assert.equal(doc.getNumberOfPages(), 1);
  const empty = buildReport(jsPDF, { title: 'T', generatedAt: 0, items: [] });
  assert.equal(empty.getNumberOfPages(), 1);
  const huge = buildReport(jsPDF, { title: 'T', generatedAt: 0, items: [item(1, { explanation: 'x '.repeat(6000) })] });
  assert.ok(huge.getNumberOfPages() >= 2);
});
