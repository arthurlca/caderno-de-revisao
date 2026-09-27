// Peças compartilhadas entre as telas: linhas das listas, histórico, questões e fluxos de criação.

import * as db from '../data/db.js';
import { letterOf } from '../core/quiz-import.js';
import { historySummary, errorReport, wrongsOf, attemptsOf, sessionErrorItems } from '../core/review.js';
import { clock, dateTime, shortDate, duration, plural, slug, isoDay } from '../core/format.js';
import { h, icon, toast, actionSheet } from './dom.js';
import { exportReportPdf } from './files.js';

/** Pastas, cadernos, número de questões e última nota de cada caderno. */
export async function loadOverview() {
  const [folders, notebooks, questions, sessions] = await Promise.all([
    db.listFolders(), db.listNotebooks(), db.allQuestions(), db.allSessions(),
  ]);
  const qCount = new Map();
  for (const q of questions) qCount.set(q.notebookId, (qCount.get(q.notebookId) || 0) + 1);
  const lastScore = new Map();
  for (const s of [...sessions].sort((a, b) => a.finishedAt - b.finishedAt)) lastScore.set(`${s.scope}:${s.scopeId}`, s);
  const notebooksIn = (folderId) => notebooks.filter((n) => n.folderId === folderId);
  const folderQuestionCount = (folderId) => notebooksIn(folderId).reduce((acc, n) => acc + (qCount.get(n.id) || 0), 0);
  return { folders, notebooks, qCount, lastScore, notebooksIn, folderQuestionCount, totalQuestions: questions.length, totalSessions: sessions.length };
}

const scoreBadge = (s) => s && h('span', { class: `score-pill ${scoreClass(s.score)}`, title: `Última revisão: ${s.score}%` }, `${s.score}%`);

export function scoreClass(score) {
  return score >= 70 ? 'hi' : score >= 50 ? 'mid' : 'lo';
}

export function notebookRow(nb, count, last) {
  const sub = [plural(count || 0, 'questão', 'questões'), last && `última: ${last.score}% em ${shortDate(last.finishedAt)}`].filter(Boolean).join(' · ');
  return h('li', {}, h('a', { class: 'item', href: `#/nb/${nb.id}` },
    h('span', { class: 'item-icon' }, icon('notebook')),
    h('div', { class: 'item-main' },
      h('div', { class: 'item-title' }, nb.name),
      h('div', { class: 'item-sub' }, sub)),
    scoreBadge(last)));
}

export function folderRow(folder, nNotebooks, nQuestions, last) {
  const sub = nNotebooks ? `${plural(nNotebooks, 'caderno', 'cadernos')} · ${plural(nQuestions, 'questão', 'questões')}` : 'vazia';
  return h('li', {}, h('a', { class: 'item', href: `#/folder/${folder.id}` },
    h('span', { class: 'item-icon' }, icon('folder')),
    h('div', { class: 'item-main' },
      h('div', { class: 'item-title' }, folder.name),
      h('div', { class: 'item-sub' }, sub)),
    scoreBadge(last)));
}

/** Nova pasta: tela com o nome e os CSVs (cada arquivo vira um caderno). */
export function createFolderFlow(app) {
  app.navigate('#/new-folder');
}

/** Gera o PDF com os erros de uma revisão. Resolve com false se não houver erros. */
export async function exportSessionPdf(session, questions, name) {
  const items = sessionErrorItems(session, questions);
  if (!items.length) {
    toast(session.correct === session.total ? 'Nenhum erro nesta revisão' : 'As questões erradas foram excluídas');
    return false;
  }
  return exportReportPdf(`revisao-${slug(name)}-${isoDay(session.finishedAt)}.pdf`, {
    title: name,
    subtitle: `Erros da revisão de ${dateTime(session.finishedAt)} · nota ${session.score}% (${session.correct}/${session.total}) · ${duration(session.durationMs)}`,
    items, mode: 'session',
  });
}

/** Botão que desabilita a si mesmo enquanto a ação roda. */
function busyButton(props, children, action) {
  const btn = h('button', {
    type: 'button', ...props,
    onclick: async () => { btn.disabled = true; try { await action(); } finally { btn.disabled = false; } },
  }, children);
  return btn;
}

/** Escolhe uma pasta de destino. Resolve com o id, null (fora de pastas) ou undefined (cancelado). */
export async function pickFolder(currentFolderId) {
  const folders = await db.listFolders();
  const actions = [
    ...folders.filter((f) => f.id !== currentFolderId).map((f) => ({ label: f.name, value: f.id })),
    currentFolderId ? { label: 'Fora de pastas', value: '__root__' } : null,
  ].filter(Boolean);
  if (!actions.length) { toast('Crie uma pasta primeiro'); return undefined; }
  const choice = await actionSheet({ title: 'Mover para…', actions });
  if (choice == null) return undefined;
  return choice === '__root__' ? null : choice;
}

/**
 * Painel "Últimas revisões": gráfico das notas, resumo e tabela, com o PDF dos erros
 * de cada revisão. `questions` são as questões atuais do caderno/pasta.
 */
export function historyPanel(sessions, { emptyText = 'Nenhuma revisão ainda.', questions = [], name = '' } = {}) {
  const sum = historySummary(sessions);
  if (!sum) {
    return h('section', { class: 'panel' }, h('h2', {}, 'Últimas revisões'), h('p', { class: 'muted small m0' }, emptyText));
  }
  const pts = [...sum.last].reverse(); // da mais antiga para a mais recente
  const label = pts.map((s) => `${shortDate(s.finishedAt)}: ${s.score}%`).join(', ');
  const delta = sum.delta == null ? null
    : h('span', { class: `delta ${sum.delta > 0 ? 'up' : sum.delta < 0 ? 'down' : ''}` },
      sum.delta > 0 ? `▲ ${sum.delta} pts` : sum.delta < 0 ? `▼ ${-sum.delta} pts` : '= igual');

  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' }, h('h2', {}, pts.length === 1 ? 'Última revisão' : `Últimas ${pts.length} revisões`), delta),
    h('div', { class: 'chart', role: 'img', 'aria-label': `Notas: ${label}` },
      pts.map((s, i) => h('div', {
        class: `col ${i === pts.length - 1 ? 'latest' : ''}`,
        title: `${dateTime(s.finishedAt)}\n${s.score}% · ${s.correct}/${s.total} acertos · ${clock(s.durationMs)}`,
      },
      h('div', { class: 'track' },
        h('i', { style: `height:${Math.max(s.score, 1.5)}%` }),
        h('b', { style: `bottom:calc(${Math.max(s.score, 1.5)}% + 4px)` }, `${s.score}%`)),
      h('span', {}, shortDate(s.finishedAt))))),
    h('div', { class: 'tiles three' },
      h('div', { class: 'tile' }, h('b', {}, `${sum.avg}%`), h('span', {}, 'média')),
      h('div', { class: 'tile' }, h('b', {}, `${sum.best}%`), h('span', {}, 'melhor')),
      h('div', { class: 'tile' }, h('b', {}, clock(sum.avgTime)), h('span', {}, 'tempo médio'))),
    h('table', { class: 'hist' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Data'), h('th', {}, 'Nota'), h('th', {}, 'Acertos'), h('th', {}, 'Tempo'),
        h('th', { class: 'col-pdf' }, 'PDF'))),
      h('tbody', {}, sum.last.map((s) => h('tr', {},
        h('td', {}, dateTime(s.finishedAt)),
        h('td', {}, h('b', { class: `score-text ${scoreClass(s.score)}` }, `${s.score}%`)),
        h('td', {}, `${s.correct}/${s.total}`),
        h('td', {}, duration(s.durationMs)),
        h('td', { class: 'col-pdf' }, busyButton({
          class: 'tb-btn icon-btn', disabled: s.correct === s.total,
          'aria-label': `PDF dos erros da revisão de ${dateTime(s.finishedAt)}`,
          title: s.correct === s.total ? 'Sem erros nesta revisão' : 'Baixar PDF dos erros desta revisão',
        }, icon('download'), () => exportSessionPdf(s, questions, name))))))),
    sum.total > sum.last.length && h('p', { class: 'muted small m0' }, `${plural(sum.total, 'revisão feita', 'revisões feitas')} no total.`),
  );
}

/** Uma alternativa em modo leitura (lista de questões, resultado). */
export function optionLine(text, letter, { correct = false, chosen = false } = {}) {
  return h('li', { class: `opt-read ${correct ? 'correct' : ''} ${chosen && !correct ? 'wrong' : ''}` },
    h('span', { class: 'opt-letter' }, letter),
    h('span', { class: 'opt-text' }, text),
    correct && h('span', { class: 'opt-mark' }, icon('check')),
    chosen && !correct && h('span', { class: 'opt-mark' }, icon('cross')));
}

/** Questão expansível: enunciado, alternativas com a correta marcada e explicação. */
export function questionDetails(q, { chosen = null, extra = null, open = false } = {}) {
  const stat = attemptsOf(q) ? `errou ${wrongsOf(q)}/${attemptsOf(q)}` : 'nunca respondida';
  return h('details', { class: 'qd', open },
    h('summary', {},
      h('span', { class: 'qd-text' }, q.question),
      h('span', { class: `badge ${wrongsOf(q) ? 'bad' : ''}` }, stat)),
    h('div', { class: 'qd-body' },
      h('ol', { class: 'opts-read' }, q.options.map((o, i) => optionLine(o, letterOf(q, i), { correct: i === q.answer, chosen: i === chosen }))),
      q.explanation && h('div', { class: 'expl' }, h('b', {}, 'Explicação'), h('p', {}, q.explanation)),
      extra));
}

/** Botão que gera o PDF com todas as questões já erradas (as mais erradas primeiro). */
export function errorsPdfButton({ title, subtitle, questions, label = 'PDF de erros' }) {
  const errors = errorReport(questions);
  const btn = h('button', {
    type: 'button', class: 'btn btn-block', disabled: !errors.length,
    onclick: async () => {
      btn.disabled = true;
      try {
        await exportReportPdf(`erros-${slug(title)}-${isoDay(Date.now())}.pdf`, { title, subtitle, items: errors, mode: 'history' });
      } finally { btn.disabled = false; }
    },
  }, icon('download'), errors.length ? `${label} (${plural(errors.length, 'questão', 'questões')})` : `${label}: nenhum erro ainda`);
  return btn;
}
