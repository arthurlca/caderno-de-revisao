// Tela inicial: pastas e cadernos fora de pastas.

import * as db from '../data/db.js';
import { h, actionSheet } from './dom.js';
import { loadOverview, notebookRow, folderRow, createFolderFlow } from './common.js';
import { exportBackup } from './backup.js';

const BACKUP_REMINDER_DAYS = 7;

async function addMenu(app) {
  const choice = await actionSheet({
    actions: [
      { label: 'Novo caderno', value: 'notebook' },
      { label: 'Nova pasta', value: 'folder' },
    ],
  });
  if (choice === 'notebook') app.navigate('#/new');
  if (choice === 'folder') await createFolderFlow(app);
}

async function backupBanner(app, ov) {
  if (!ov.totalSessions) return null;
  const last = await db.getMeta('lastBackupAt');
  if (last && Date.now() - last < BACKUP_REMINDER_DAYS * 864e5) return null;
  return h('div', { class: 'banner' },
    h('p', {}, last ? `Seu último backup tem mais de ${BACKUP_REMINDER_DAYS} dias.` : 'Você ainda não fez backup. Seus dados ficam só neste aparelho.'),
    h('button', { type: 'button', class: 'btn', onclick: async () => { if (await exportBackup()) app.navigate('#/'); } }, 'Fazer backup agora'));
}

export async function render(_params, app) {
  const ov = await loadOverview();
  const rootNotebooks = ov.notebooksIn(null);
  const last = (scope, id) => ov.lastScore.get(`${scope}:${id}`);

  let body;
  if (!ov.folders.length && !ov.notebooks.length) {
    body = h('div', { class: 'empty' },
      h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, '📝'),
      h('p', {}, 'Crie um caderno enviando um ou mais arquivos CSV com as questões.'),
      h('div', { class: 'stack' },
        h('a', { class: 'btn btn-primary btn-block', href: '#/new' }, 'Criar caderno'),
        h('button', { type: 'button', class: 'btn btn-block', onclick: () => createFolderFlow(app) }, 'Nova pasta'),
        h('a', { class: 'btn btn-ghost btn-block', href: '#/settings' }, 'Ver o formato do CSV')));
  } else {
    body = h('div', {},
      ov.folders.length ? [
        h('h2', { class: 'section-title' }, 'Pastas'),
        h('ul', { class: 'list' }, ov.folders.map((f) => folderRow(f, ov.notebooksIn(f.id).length, ov.folderQuestionCount(f.id), last('folder', f.id)))),
      ] : null,
      h('h2', { class: 'section-title' }, ov.folders.length ? 'Cadernos fora de pastas' : 'Cadernos'),
      rootNotebooks.length
        ? h('ul', { class: 'list' }, rootNotebooks.map((n) => notebookRow(n, ov.qCount.get(n.id), last('notebook', n.id))))
        : h('p', { class: 'muted small pad' }, 'Nenhum caderno fora de pastas.'),
      h('div', { class: 'stack mt' }, h('a', { class: 'btn btn-block', href: '#/new' }, 'Novo caderno')));
  }

  return {
    title: 'Caderno de Revisão',
    tab: 'home',
    actions: [{ icon: 'plus', label: 'Adicionar', onClick: () => addMenu(app) }],
    el: h('div', {}, await backupBanner(app, ov), body),
  };
}
