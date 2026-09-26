// Monta o PDF de revisão de erros com o jsPDF (recebido como parâmetro, para
// funcionar tanto no navegador quanto nos testes do Node).

import { LETTERS } from './quiz-import.js';
import { errorRate, wrongsOf, attemptsOf } from './review.js';
import { dateTime } from './format.js';

// As fontes padrão do PDF só têm os caracteres do Latin-1 (acentos do português ok).
const REPLACE = [
  [/[‘’‚′´`]/g, "'"], [/[“”„″]/g, '"'], [/[–—−]/g, '-'], [/…/g, '...'],
  [/[•▪●◦]/g, '-'], [/[  -​ ]/g, ' '], [/\t/g, '    '],
  [/≤/g, '<='], [/≥/g, '>='], [/≠/g, '!='], [/→/g, '->'], [/←/g, '<-'], [/✓|✔/g, 'v'], [/✗|✘/g, 'x'],
];

export function pdfSafe(s) {
  let t = String(s ?? '').normalize('NFC');
  for (const [re, r] of REPLACE) t = t.replace(re, r);
  return t.replace(/[^\n\x20-\x7e\xa1-\xff]/g, '');
}

const A4 = { w: 210, h: 297 };
const M = 16; // margem (mm)
const PT = 0.3528; // mm por ponto
const INK = [23, 23, 31], MUTED = [103, 103, 121], GOOD = [21, 128, 61], BAD = [185, 28, 28], BRAND = [15, 118, 110];
const EXPL_BG = [236, 246, 245];

/**
 * @param {Function} JsPDF  construtor do jsPDF
 * @param {{title: string, subtitle?: string, generatedAt: number,
 *          items: {question: string, options: string[], answer: number, explanation?: string,
 *                  wrongs?: number, attempts?: number, chosen?: number}[],
 *          mode: 'history'|'session'}} r
 *   mode 'history': mostra "Errou N de M vezes"; 'session': marca a alternativa escolhida.
 */
export function buildReport(JsPDF, { title, subtitle, generatedAt, items, mode = 'history' }) {
  const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
  const width = A4.w - 2 * M;
  let y = M;

  const lh = (size) => size * PT * 1.32;
  const setFont = (size, style = 'normal', color = INK) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const newPage = () => { doc.addPage(); y = M; };
  const ensure = (h) => { if (y + h > A4.h - M - 6) newPage(); };
  const lines = (text, size, style, w) => {
    setFont(size, style);
    return doc.splitTextToSize(pdfSafe(text), w);
  };
  /** Escreve um parágrafo quebrando linhas e páginas. */
  const para = (text, { size = 10.5, style = 'normal', color = INK, indent = 0, after = 1.5 } = {}) => {
    const ls = lines(text, size, style, width - indent);
    for (const l of ls) {
      ensure(lh(size));
      setFont(size, style, color);
      doc.text(l, M + indent, y + size * PT);
      y += lh(size);
    }
    y += after;
  };

  // Cabeçalho
  setFont(18, 'bold', BRAND);
  for (const l of lines(title, 18, 'bold', width)) { doc.text(l, M, y + 18 * PT); y += lh(18); }
  y += 1;
  para(subtitle || '', { size: 10, color: MUTED, after: 0.5 });
  para(`Gerado em ${dateTime(generatedAt)} · ${items.length} ${items.length === 1 ? 'questão' : 'questões'}`, { size: 10, color: MUTED, after: 4 });
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.6);
  doc.line(M, y, M + width, y);
  y += 6;

  if (!items.length) para('Nenhum erro registrado. Bom trabalho!', { size: 12 });

  items.forEach((q, n) => {
    // Pergunta e o começo das alternativas ficam juntos na mesma página
    const qLines = lines(`${n + 1}. ${q.question}`, 12, 'bold', width);
    ensure(qLines.length * lh(12) + 2 * lh(10.5) + 6);
    para(`${n + 1}. ${q.question}`, { size: 12, style: 'bold', after: 1 });

    if (mode === 'history') {
      const pct = Math.round(errorRate(q) * 100);
      para(`Errou ${wrongsOf(q)} de ${attemptsOf(q)} ${attemptsOf(q) === 1 ? 'vez' : 'vezes'} (${pct}% de erro)`, { size: 9.5, color: BAD, after: 2 });
    }

    q.options.forEach((opt, i) => {
      const isRight = i === q.answer;
      const isChosen = mode === 'session' && i === q.chosen && !isRight;
      const tag = isRight ? '   (correta)' : isChosen ? '   (sua resposta)' : '';
      para(`${LETTERS[i]}) ${opt}${tag}`, {
        size: 10.5, indent: 4, after: 1,
        style: isRight ? 'bold' : 'normal',
        color: isRight ? GOOD : isChosen ? BAD : INK,
      });
    });
    y += 1.5;

    if (q.explanation) {
      const size = 10.5, pad = 3;
      const eLines = lines(q.explanation, size, 'normal', width - 2 * pad - 2);
      const head = lh(9.5) + 1;
      const boxH = head + eLines.length * lh(size) + 2 * pad;
      if (boxH < A4.h - 2 * M - 10) {
        ensure(boxH);
        doc.setFillColor(...EXPL_BG);
        doc.rect(M, y, width, boxH, 'F');
        doc.setFillColor(...BRAND);
        doc.rect(M, y, 1.2, boxH, 'F');
        let yy = y + pad;
        setFont(9.5, 'bold', BRAND);
        doc.text('EXPLICAÇÃO', M + pad + 2, yy + 9.5 * PT);
        yy += head;
        setFont(size, 'normal', INK);
        for (const l of eLines) { doc.text(l, M + pad + 2, yy + size * PT); yy += lh(size); }
        y += boxH + 2;
      } else {
        para('EXPLICAÇÃO', { size: 9.5, style: 'bold', color: BRAND, after: 0.5 });
        para(q.explanation, { size });
      }
    }

    y += 3;
    if (n < items.length - 1) {
      ensure(4);
      doc.setDrawColor(222, 222, 231);
      doc.setLineWidth(0.3);
      doc.line(M, y, M + width, y);
      y += 5;
    }
  });

  // Rodapé com numeração
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    setFont(8.5, 'normal', MUTED);
    doc.text(pdfSafe(`Caderno de Revisão · ${title}`).slice(0, 90), M, A4.h - 8);
    doc.text(`${p} / ${pages}`, A4.w - M, A4.h - 8, { align: 'right' });
  }
  return doc;
}
