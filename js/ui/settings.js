// Ajustes: formato do CSV, modelo para download, backup e privacidade.

import * as db from '../data/db.js';
import { SAMPLE_CSV } from '../core/quiz-import.js';
import { plural } from '../core/format.js';
import { h, icon } from './dom.js';
import { saveFile } from './files.js';
import { exportBackup, importBackupFile } from './backup.js';

export async function render(_params, app) {
  const [counts, lastBackupAt] = await Promise.all([db.countAll(), db.getMeta('lastBackupAt')]);

  const restoreInput = h('input', {
    type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'restore-file',
    onchange: async () => {
      const f = restoreInput.files[0];
      restoreInput.value = '';
      if (f && await importBackupFile(f)) app.navigate('#/');
    },
  });

  const el = h('div', { class: 'stack' },
    h('section', { class: 'panel stack' },
      h('h2', { class: 'm0' }, 'Formato do CSV'),
      h('p', { class: 'm0' }, 'Cada linha é uma questão, com quatro colunas:'),
      h('pre', { class: 'code-block' }, 'pergunta | opcoes | resposta | explicacao'),
      h('ul', { class: 'bullets' },
        h('li', {}, h('b', {}, 'opcoes'), ': lista com 2 a 5 alternativas, como ', h('code', {}, "['A - Patrimônio','B - Lucro']"), '. Aspas retas, curvas (’) ou duplas funcionam.'),
        h('li', {}, h('b', {}, 'resposta'), ': a letra da correta (', h('code', {}, 'A'), '), o número (', h('code', {}, '1'), ') ou o texto da alternativa.'),
        h('li', {}, h('b', {}, 'explicacao'), ': opcional; aparece depois de responder e no PDF de erros.'),
        h('li', {}, 'O separador é detectado sozinho: ', h('code', {}, '|'), ', tab, ', h('code', {}, ';'), ' ou ', h('code', {}, ','), '. Uma linha de cabeçalho é ignorada.'),
        h('li', {}, 'Com vírgula como separador, coloque campos com vírgula entre aspas duplas (o Excel faz isso sozinho).'),
        h('li', {}, 'Arquivos em UTF-8 ou Windows-1252 (Excel) são aceitos.')),
      h('pre', { class: 'code-block' }, "O objeto da contabilidade é: | ['A - Patrimônio','B - Lucro','C - Os ativos','D - As aziendas','E - As demonstrações contábeis'] | A | Segundo o CPC 00, o objeto da contabilidade é o patrimônio"),
      h('button', {
        type: 'button', class: 'btn btn-block',
        onclick: () => saveFile(new File(['﻿' + SAMPLE_CSV], 'modelo-caderno.csv', { type: 'text/csv' })),
      }, icon('download'), 'Baixar CSV modelo')),

    h('section', { class: 'panel stack' },
      h('h2', { class: 'm0' }, 'Backup'),
      h('p', { class: 'm0 muted small' },
        `${plural(counts.notebooks, 'caderno', 'cadernos')}, ${plural(counts.questions, 'questão', 'questões')}, ${plural(counts.sessions, 'revisão', 'revisões')}. `,
        lastBackupAt ? `Último backup: ${new Date(lastBackupAt).toLocaleDateString('pt-BR')}.` : 'Nenhum backup ainda.'),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: async () => { if (await exportBackup()) app.navigate(location.hash); } }, 'Exportar backup'),
      restoreInput,
      h('label', { for: 'restore-file', class: 'btn btn-block' }, 'Restaurar backup…'),
      h('p', { class: 'm0 muted small' }, 'Restaurar substitui todos os dados do app pelos do arquivo.')),

    h('section', { class: 'panel stack' },
      h('h2', { class: 'm0' }, 'Privacidade'),
      h('p', { class: 'm0 small' }, 'Tudo fica guardado só neste aparelho, no navegador. O app não tem servidor, login nem analytics. '
        + 'Por isso, faça backups de vez em quando, e use o backup para passar seus cadernos para outro aparelho.'),
      app.persisted === false && h('p', { class: 'm0 small muted' }, 'O navegador não garantiu armazenamento permanente: faça backups com frequência.')),
  );

  return { title: 'Ajustes', tab: 'settings', el };
}
