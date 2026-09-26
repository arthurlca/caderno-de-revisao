// Importação de questões: pergunta | opcoes | resposta | explicacao
//
// - O separador (|, tab, ; ou ,) é detectado sozinho.
// - A coluna de opções é uma lista: ['A - Patrimônio','B - Lucro'] (aspas retas,
//   curvas ’ ou duplas), JSON, ou apenas "A) ...; B) ...".
// - A resposta pode ser a letra (A), o número (1) ou o texto da alternativa.
// - Com separador vírgula e a lista sem aspas de CSV, as colunas extras criadas
//   pelas vírgulas da lista são remontadas.

import { parseDelimited } from './csv.js';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 5;
export const LETTERS = 'ABCDE';
const DELIMITERS = ['|', '\t', ';', ','];
const QUOTES = '\'"‘’“”´`';
const PREFIX = /^([A-Ea-e])\s*[-–—).:]\s*/;

/** Normaliza para comparar: sem acentos, maiúsculas e espaços repetidos. */
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Lê a coluna de opções e devolve a lista de textos (ainda com prefixos "A - "). */
export function splitOptions(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const a = JSON.parse(s);
      if (Array.isArray(a)) return a.map((x) => String(x).trim()).filter(Boolean);
    } catch { /* não é JSON: segue */ }
  }
  s = s.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
  if (!s) return [];
  if (QUOTES.includes(s[0])) return splitQuoted(s);
  return splitPlain(s);
}

// Itens entre aspas. A aspa de fechamento é a que vem seguida de vírgula,
// ponto e vírgula ou fim; assim apóstrofos no meio ("d'água") não quebram o item.
function splitQuoted(s) {
  const items = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /[\s,;]/.test(s[i])) i++;
    if (i >= s.length) break;
    if (!QUOTES.includes(s[i])) { // item sem aspas no meio da lista
      let j = i;
      while (j < s.length && s[j] !== ',' && s[j] !== ';') j++;
      items.push(s.slice(i, j).trim());
      i = j;
      continue;
    }
    let end = -1;
    for (let j = i + 1; j < s.length; j++) {
      if (!QUOTES.includes(s[j])) continue;
      let k = j + 1;
      while (s[k] === ' ') k++;
      if (k >= s.length || s[k] === ',' || s[k] === ';') { end = j; break; }
    }
    if (end === -1) { items.push(s.slice(i + 1).trim()); break; }
    items.push(s.slice(i + 1, end).trim());
    i = end + 1;
  }
  return items.filter(Boolean);
}

// Sem aspas: se houver prefixos A, B, C... separa por eles (as vírgulas do texto
// ficam preservadas); senão, separa por ";" ou ",".
function splitPlain(s) {
  const re = /(^|[,;]\s*)([A-Ea-e])\s*[-–—).:]\s+/g;
  const cuts = [];
  let last = -1;
  for (const m of s.matchAll(re)) {
    const pos = LETTERS.indexOf(m[2].toUpperCase());
    if (pos <= last) continue; // letras em ordem crescente (A, B… ou C, E do Certo/Errado)
    cuts.push({ at: m.index, text: m.index + m[1].length });
    last = pos;
  }
  if (cuts.length >= MIN_OPTIONS && cuts[0].at === 0) {
    return cuts.map((c, i) => s.slice(c.text, i + 1 < cuts.length ? cuts[i + 1].at : s.length).trim()).filter(Boolean);
  }
  const sep = s.includes(';') ? ';' : ',';
  return s.split(sep).map((x) => x.trim()).filter(Boolean);
}

/**
 * Tira os prefixos "A - ", "B) "... quando todas as opções os têm, com letras em
 * ordem crescente. Não precisam ser seguidas: "C - Certo", "E - Errado" (estilo Cespe).
 * @returns {{texts: string[], letters: string[]|null}}
 */
export function stripPrefixes(options) {
  const letters = [];
  let last = -1;
  for (const o of options) {
    const m = PREFIX.exec(o);
    const pos = m ? LETTERS.indexOf(m[1].toUpperCase()) : -1;
    if (!m || pos <= last || !o.slice(m[0].length).trim()) return { texts: options, letters: null };
    letters.push(LETTERS[pos]);
    last = pos;
  }
  return { texts: options.map((o) => o.replace(PREFIX, '').trim()), letters };
}

/** Letra exibida para a alternativa i (a do arquivo, ou A, B, C… pela posição). */
export function letterOf(q, i) {
  return q.letters?.[i] ?? LETTERS[i];
}

/** true quando as letras do arquivo são as padrão (A, B, C… em sequência). */
const defaultLetters = (letters) => letters.every((l, i) => l === LETTERS[i]);

/**
 * Índice da alternativa correta, ou -1. Com `letters` (prefixos do arquivo), a letra
 * da resposta é procurada entre elas; sem, vale a posição (A = 1ª).
 */
export function resolveAnswer(answer, rawOptions, texts, letters = null) {
  const a = String(answer ?? '').trim().replace(/^[[('"‘’“”]+|[\])'"‘’“”.]+$/g, '').trim();
  if (!a) return -1;
  const letter = /^(?:letra\s+|alternativa\s+)?([A-Ea-e])(?:\s*[-–—).:].*)?$/i.exec(a);
  if (letter) {
    const L = letter[1].toUpperCase();
    const idx = letters ? letters.indexOf(L) : LETTERS.indexOf(L);
    return idx < texts.length ? idx : -1;
  }
  if (/^[1-5]$/.test(a)) {
    const idx = Number(a) - 1;
    return idx < texts.length ? idx : -1;
  }
  const k = fold(a);
  let idx = texts.findIndex((t) => fold(t) === k);
  if (idx === -1) idx = rawOptions.findIndex((t) => fold(t) === k);
  return idx;
}

/** Remonta as 4 colunas de uma linha. Devolve null se não der. */
function toColumns(fields, delimiter) {
  const f = fields.map((x) => x.trim());
  if (f.length < 3) return null;
  if (f.length <= 4) return [f[0], f[1], f[2], f[3] ?? ''];
  // Junta os campos originais (sem trim) para preservar os espaços depois das vírgulas
  const join = (a, b) => fields.slice(a, b).join(delimiter).trim();
  const s = f.findIndex((x, i) => i > 0 && x.startsWith('['));
  if (s > 0) {
    const e = f.findIndex((x, i) => i >= s && x.endsWith(']'));
    if (e >= s && e + 1 < f.length) return [join(0, s), join(s, e + 1), f[e + 1], join(e + 2)];
  }
  return [f[0], f[1], f[2], join(3)];
}

function isHeader(cols) {
  return /^(pergunta|questao|question|enunciado)/.test(fold(cols[0])) && /(opc|alternativ|option)/.test(fold(cols[1]));
}

/** Converte uma linha em questão ou explica por que não deu. */
export function rowToQuestion(cols) {
  const [question, optionsRaw, answer, explanation] = cols;
  if (!question) return { error: 'pergunta vazia' };
  const raw = splitOptions(optionsRaw);
  if (raw.length < MIN_OPTIONS) return { error: `menos de ${MIN_OPTIONS} alternativas` };
  if (raw.length > MAX_OPTIONS) return { error: `mais de ${MAX_OPTIONS} alternativas (${raw.length})` };
  const { texts, letters } = stripPrefixes(raw);
  const idx = resolveAnswer(answer, raw, texts, letters);
  if (idx < 0) return { error: answer ? `resposta "${answer}" não corresponde a nenhuma alternativa` : 'sem resposta' };
  const q = { question: clean(question), options: texts.map(clean), answer: idx, explanation: clean(explanation || '') };
  if (letters && !defaultLetters(letters)) q.letters = letters;
  return { question: q };
}

const clean = (s) => s.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n').trim();

function parseWith(text, delimiter) {
  const rows = parseDelimited(text, delimiter);
  const questions = [];
  const skipped = [];
  let line = 1;
  let first = true;
  for (const r of rows) {
    const rowLine = line;
    line += r.reduce((acc, f) => acc + (f.match(/\n/g) || []).length, 0) + 1;
    if (!r.some((f) => f.trim())) continue; // linha em branco
    const cols = toColumns(r, delimiter);
    if (first && cols && isHeader(cols)) { first = false; continue; }
    first = false;
    if (!cols) { skipped.push({ line: rowLine, reason: 'menos de 3 colunas' }); continue; }
    const res = rowToQuestion(cols);
    if (res.error) skipped.push({ line: rowLine, reason: res.error });
    else questions.push(res.question);
  }
  return { questions, skipped, delimiter };
}

/**
 * Lê o texto de um arquivo de questões.
 * @returns {{questions: {question: string, options: string[], answer: number, explanation: string}[],
 *            skipped: {line: number, reason: string}[], delimiter: string}}
 */
export function parseQuestions(text) {
  const src = String(text).replace(/^﻿/, '');
  let best = null;
  for (const d of DELIMITERS) {
    const r = parseWith(src, d);
    // Empates ficam com o primeiro da lista (| > tab > ; > ,)
    if (!best || r.questions.length > best.questions.length) best = r;
  }
  return best;
}

/** Chave para detectar perguntas repetidas. */
export function questionKey(q) {
  return fold(q.question);
}

/** Separa as questões novas das que já existem (ou se repetem no próprio lote). */
export function dedupe(questions, existing = []) {
  const seen = new Set(existing.map(questionKey));
  const toAdd = [], duplicates = [];
  for (const q of questions) {
    const k = questionKey(q);
    if (seen.has(k)) duplicates.push(q);
    else { seen.add(k); toAdd.push(q); }
  }
  return { toAdd, duplicates };
}

/** Nome sugerido para o caderno a partir do arquivo. */
export function nameFromFile(fileName) {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
}

/** CSV de exemplo (modelo para download). */
export const SAMPLE_CSV = [
  'pergunta|opcoes|resposta|explicacao',
  "O objeto da contabilidade é:|['A - Patrimônio','B - Lucro','C - Os ativos','D - As aziendas','E - As demonstrações contábeis']|A|Segundo o CPC 00, o objeto da contabilidade é o patrimônio.",
  "Ativo = Passivo + Patrimônio Líquido é a equação:|['A - do resultado','B - fundamental do patrimônio','C - do fluxo de caixa']|B|É a equação fundamental da contabilidade (equação patrimonial).",
  "Receitas aumentam o patrimônio líquido.|['A - Certo','B - Errado']|A|Receitas geram aumento do PL; despesas geram redução.",
].join('\n') + '\n';
