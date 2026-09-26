// Pasta: cadernos, revisão da pasta (piores questões), histórico e PDF de erros.

import * as db from '../data/db.js';
import { MAX_FOLDER_QUESTIONS, DEFAULT_FOLDER_QUESTIONS, wrongsOf } from '../core/review.js';
import { plural } from '../core/format.js';
import { h, icon, toast, promptDialog, actionSheet, confirmDialog } from './dom.js';
import { loadOverview, notebookRow, historyPanel, errorsPdfButton } from './common.js';

async function menu(app, folder, nNotebooks) {
  const choice = await actionSheet({
    title: folder.name,
    actions: [
      { label: 'Novo caderno nesta pasta', value: 'new' },
      { label: 'Renomear pasta', value: 'rename' },
      { label: 'Excluir pasta', value: 'delete', danger: true },
    ],
  });
  if (choice === 'new') app.navigate(`#/folder/${folder.id}/new`);
  if (choice === 'rename') {
    const name = await promptDialog({ title: 'Renomear pasta', value: folder.name });
    if (name) { await db.renameFolder(folder.id, name); toast('Pasta renomeada'); app.navigate(location.hash); }
  }
  if (choice === 'delete') {
    if (!nNotebooks) {
      if (!await confirmDialog({ title: 'Excluir pasta?', message: 'A pasta está vazia.', confirmLabel: 'Excluir', danger: true })) return;
      await db.deleteFolder(folder.id);
    } else {
      const how = await actionSheet({
        title: `A pasta tem ${plural(nNotebooks, 'caderno', 'cadernos')}`,
        actions: [
          { label: 'Excluir só a pasta (manter cadernos)', value: 'keep' },
          { label: 'Excluir pasta e cadernos', value: 'all', danger: true },
        ],
      });
      if (!how) return;
      if (how === 'all' && !await confirmDialog({
        title: 'Apagar tudo?', message: 'Os cadernos, as questões e todo o histórico serão apagados. Não dá para desfazer.',
        confirmLabel: 'Apagar tudo', danger: true,
      })) return;
      await db.deleteFolder(folder.id, { withNotebooks: how === 'all' });
    }
    toast('Pasta excluída');
    app.navigate('#/', { replace: true });
  }
}

export async function render({ id }, app) {
  const folder = await db.getFolder(id);
  if (!folder) { app.navigate('#/', { replace: true }); return null; }
  const [ov, questions, sessions] = await Promise.all([loadOverview(), db.folderQuestions(id), db.listSessions('folder', id)]);
  const notebooks = ov.notebooksIn(id);
  const total = questions.length;
  const wrong = questions.filter((q) => wrongsOf(q) > 0).length;

  const max = Math.min(MAX_FOLDER_QUESTIONS, total);
  let n = Math.min(DEFAULT_FOLDER_QUESTIONS, max);
  const out = h('output', { class: 'range-value' }, n);
  const hint = h('p', { class: 'muted small m0' });
  const updateHint = () => {
    out.textContent = n;
    hint.textContent = total <= n
      ? `Entram todas as ${total} questões da pasta.`
      : wrong >= n
        ? `As ${n} questões com pior desempenho.`
        : wrong
          ? `As ${wrong} questões que você já errou + ${n - wrong} aleatórias.`
          : `${n} questões aleatórias (você ainda não errou nenhuma).`;
  };
  updateHint();

  const reviewPanel = total
    ? h('section', { class: 'panel stack' },
      h('h2', { class: 'm0' }, 'Revisão da pasta'),
      h('label', { class: 'field' },
        h('span', {}, 'Número de questões ', out),
        h('input', {
          type: 'range', min: 1, max, value: n, disabled: max <= 1,
          oninput: (e) => { n = Number(e.target.value); updateHint(); },
        })),
      hint,
      h('button', {
        type: 'button', class: 'btn btn-primary btn-lg btn-block',
        onclick: () => app.navigate(`#/review/folder/${id}/${n}`),
      }, icon('play'), 'Revisar pasta'))
    : null;

  const el = h('div', {},
    h('div', { class: 'hero' },
      h('p', { class: 'muted m0 center' }, `${plural(notebooks.length, 'caderno', 'cadernos')} · ${plural(total, 'questão', 'questões')}${wrong ? ` · ${plural(wrong, 'já errada', 'já erradas')}` : ''}`)),
    reviewPanel,
    total ? h('div', { class: 'mt' }, historyPanel(sessions, { emptyText: 'Nenhuma revisão desta pasta ainda.' })) : null,
    total ? h('div', { class: 'mt' }, errorsPdfButton({
      title: folder.name, subtitle: 'Questões erradas em todos os cadernos da pasta, das mais erradas para as menos erradas.', questions,
    })) : null,
    h('h2', { class: 'section-title' }, 'Cadernos'),
    notebooks.length
      ? h('ul', { class: 'list' }, notebooks.map((nb) => notebookRow(nb, ov.qCount.get(nb.id), ov.lastScore.get(`notebook:${nb.id}`))))
      : h('p', { class: 'muted small pad' }, 'Nenhum caderno nesta pasta ainda.'),
    h('div', { class: 'stack mt' }, h('a', { class: 'btn btn-block', href: `#/folder/${id}/new` }, 'Novo caderno nesta pasta')));

  return {
    title: folder.name,
    back: '#/',
    tab: 'home',
    actions: [{ icon: 'more', label: 'Opções da pasta', onClick: () => menu(app, folder, notebooks.length) }],
    el,
  };
}
