// Caderno: iniciar revisão, histórico das últimas 5, PDF de erros e lista de questões.

import * as db from '../data/db.js';
import { wrongsOf, mostWrongFirst } from '../core/review.js';
import { fold } from '../core/quiz-import.js';
import { plural } from '../core/format.js';
import { h, icon, toast, promptDialog, actionSheet, confirmDialog } from './dom.js';
import { historyPanel, errorsPdfButton, questionDetails, pickFolder } from './common.js';

async function menu(app, nb, hasHistory) {
  const choice = await actionSheet({
    title: nb.name,
    actions: [
      { label: 'Adicionar questões (CSV)', value: 'import' },
      { label: 'Renomear caderno', value: 'rename' },
      { label: 'Mover para pasta', value: 'move' },
      hasHistory && { label: 'Zerar histórico e erros', value: 'reset', danger: true },
      { label: 'Excluir caderno', value: 'delete', danger: true },
    ].filter(Boolean),
  });
  if (choice === 'import') app.navigate(`#/nb/${nb.id}/import`);
  if (choice === 'rename') {
    const name = await promptDialog({ title: 'Renomear caderno', value: nb.name });
    if (name) { await db.renameNotebook(nb.id, name); toast('Caderno renomeado'); app.navigate(location.hash); }
  }
  if (choice === 'move') {
    const folderId = await pickFolder(nb.folderId);
    if (folderId !== undefined) { await db.moveNotebook(nb.id, folderId); toast('Caderno movido'); app.navigate(location.hash); }
  }
  if (choice === 'reset') {
    if (!await confirmDialog({
      title: 'Zerar histórico?', message: 'Apaga as revisões deste caderno e a contagem de acertos e erros das questões. As questões continuam.',
      confirmLabel: 'Zerar', danger: true,
    })) return;
    await db.resetNotebookHistory(nb.id);
    toast('Histórico zerado');
    app.navigate(location.hash);
  }
  if (choice === 'delete') {
    if (!await confirmDialog({
      title: 'Excluir caderno?', message: `"${nb.name}", as questões e todo o histórico serão apagados. Não dá para desfazer.`,
      confirmLabel: 'Excluir', danger: true,
    })) return;
    await db.deleteNotebook(nb.id);
    toast('Caderno excluído');
    app.navigate(nb.folderId ? `#/folder/${nb.folderId}` : '#/', { replace: true });
  }
}

function questionsSection(app, questions) {
  if (!questions.length) return null;
  let sort = 'order';
  let query = '';
  const list = h('div', { class: 'qlist' });
  const count = h('p', { class: 'muted small m0' });

  const draw = () => {
    const k = fold(query);
    let qs = k ? questions.filter((q) => fold(`${q.question} ${q.options.join(' ')} ${q.explanation}`).includes(k)) : questions;
    if (sort === 'wrong') qs = qs.filter((q) => wrongsOf(q) > 0).sort(mostWrongFirst);
    count.textContent = plural(qs.length, 'questão', 'questões');
    list.replaceChildren(...qs.slice(0, 300).map((q) => questionDetails(q, {
      extra: h('button', {
        type: 'button', class: 'btn btn-danger-ghost btn-sm',
        onclick: async () => {
          if (!await confirmDialog({ title: 'Excluir questão?', message: q.question.slice(0, 200), confirmLabel: 'Excluir', danger: true })) return;
          await db.deleteQuestion(q.id);
          toast('Questão excluída');
          app.navigate(location.hash);
        },
      }, 'Excluir questão'),
    })));
    if (qs.length > 300) list.append(h('p', { class: 'muted small center' }, 'Mostrando 300. Use a busca para encontrar as outras.'));
  };
  draw();

  return h('section', {},
    h('h2', { class: 'section-title' }, 'Questões'),
    h('div', { class: 'stack' },
      h('input', { type: 'search', class: 'input', placeholder: 'Buscar nas questões', 'aria-label': 'Buscar nas questões', oninput: (e) => { query = e.target.value; draw(); } }),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Filtro' },
        ...[['order', 'Todas'], ['wrong', 'Mais erradas']].map(([v, label]) => h('button', {
          type: 'button', 'aria-pressed': String(v === sort),
          onclick: (e) => { sort = v; for (const b of e.target.parentNode.children) b.setAttribute('aria-pressed', String(b === e.target)); draw(); },
        }, label))),
      count,
      list));
}

/** Iniciar revisão: todas as questões ou só algumas (sorteadas). */
function startPanel(app, id, total) {
  if (total < 2) {
    return h('a', { class: 'btn btn-primary btn-lg btn-block', href: `#/review/nb/${id}` }, icon('play'), 'Iniciar revisão');
  }
  let some = false;
  let n = Math.min(10, total - 1);
  const out = h('output', { class: 'range-value' }, n);
  const range = h('input', {
    type: 'range', min: 1, max: total - 1, value: n, 'aria-label': 'Número de questões',
    oninput: (e) => { n = Number(e.target.value); update(); },
  });
  const picker = h('label', { class: 'field' }, h('span', {}, 'Número de questões ', out), range,
    h('span', { class: 'muted small' }, `Sorteadas entre as ${total} do caderno.`));
  const start = h('button', {
    type: 'button', class: 'btn btn-primary btn-lg btn-block',
    onclick: () => app.navigate(some ? `#/review/nb/${id}/${n}` : `#/review/nb/${id}`),
  });
  const segAll = h('button', { type: 'button', onclick: () => { some = false; update(); } }, `Todas (${total})`);
  const segSome = h('button', { type: 'button', onclick: () => { some = true; update(); } }, 'Só algumas');
  function update() {
    out.textContent = n;
    segAll.setAttribute('aria-pressed', String(!some));
    segSome.setAttribute('aria-pressed', String(some));
    picker.hidden = !some;
    start.replaceChildren(icon('play'), some ? `Iniciar revisão (${plural(n, 'questão', 'questões')})` : 'Iniciar revisão');
  }
  update();
  return h('div', { class: 'panel stack' },
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Quantas questões' }, segAll, segSome),
    picker,
    start);
}

export async function render({ id }, app) {
  const nb = await db.getNotebook(id);
  if (!nb) { app.navigate('#/', { replace: true }); return null; }
  const [questions, sessions, folder] = await Promise.all([
    db.listQuestions(id), db.listSessions('notebook', id), nb.folderId ? db.getFolder(nb.folderId) : null,
  ]);

  const el = h('div', {},
    h('div', { class: 'hero' },
      folder && h('a', { class: 'crumb', href: `#/folder/${folder.id}` }, icon('folder'), folder.name),
      h('p', { class: 'hero-count' }, h('b', {}, questions.length), questions.length === 1 ? ' questão' : ' questões'),
      questions.length
        ? startPanel(app, id, questions.length)
        : h('a', { class: 'btn btn-primary btn-block', href: `#/nb/${id}/import` }, icon('upload'), 'Adicionar questões (CSV)')),
    questions.length ? historyPanel(sessions, { emptyText: 'Faça a primeira revisão para acompanhar sua nota aqui.', questions, name: nb.name }) : null,
    questions.length ? h('div', { class: 'mt' }, errorsPdfButton({
      title: nb.name, subtitle: 'Questões erradas nas revisões, das mais erradas para as menos erradas.', questions,
    })) : null,
    questionsSection(app, questions));

  return {
    title: nb.name,
    back: nb.folderId ? `#/folder/${nb.folderId}` : '#/',
    tab: 'home',
    actions: [{ icon: 'more', label: 'Opções do caderno', onClick: () => menu(app, nb, sessions.length > 0) }],
    el,
  };
}
