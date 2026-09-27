// Nova pasta (nome + vários CSVs) e importação de cadernos numa pasta existente.
// Cada arquivo vira um caderno, com o nome do arquivo sem a extensão (editável).

import * as db from '../data/db.js';
import { dedupe, nameFromFile } from '../core/quiz-import.js';
import { plural } from '../core/format.js';
import { h, icon, toast } from './dom.js';
import { readFiles, sourceSummary } from './notebook-form.js';

export async function render({ id, mode }, app) {
  const importing = mode === 'import';
  let folder = null;
  if (importing) {
    folder = await db.getFolder(id);
    if (!folder) { app.navigate('#/', { replace: true }); return null; }
  }

  /** @type {{src: object, name: string, questions: object[]}[]} */
  let entries = [];

  const nameInput = !importing && h('input', {
    type: 'text', class: 'input', placeholder: 'Ex.: Contabilidade', enterkeyhint: 'done', oninput: () => update(),
  });
  const fileInput = h('input', {
    type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain', multiple: true, class: 'visually-hidden', id: 'folder-files',
    onchange: async () => {
      const srcs = await readFiles(fileInput.files);
      fileInput.value = ''; // permite escolher mais arquivos depois
      // Repetidas dentro do próprio arquivo não entram
      entries.push(...srcs.map((src) => ({ src, name: nameFromFile(src.name), questions: dedupe(src.questions).toAdd })));
      drawList();
      update();
    },
  });
  const list = h('div', { class: 'stack' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' });

  const valid = () => entries.filter((e) => e.questions.length && e.name.trim());

  function drawList() {
    list.replaceChildren(...entries.map((e, i) => sourceSummary(e.src, {
      count: e.questions.length,
      extra: e.questions.length ? h('div', { class: 'src-name' },
        h('input', {
          type: 'text', class: 'input', value: e.name, 'aria-label': `Nome do caderno de ${e.src.name}`,
          oninput: (ev) => { e.name = ev.target.value; update(); },
        }),
        h('button', {
          type: 'button', class: 'tb-btn icon-btn', 'aria-label': `Remover ${e.src.name}`, title: 'Remover',
          onclick: () => { entries.splice(i, 1); drawList(); update(); },
        }, icon('close')))
        : h('p', { class: 'small m0 bad-text' }, 'Nenhuma questão válida: este arquivo não vira caderno.'),
    })));
  }

  function update() {
    const ok = valid();
    const nQ = ok.reduce((s, e) => s + e.questions.length, 0);
    const missingName = entries.some((e) => e.questions.length && !e.name.trim());
    if (importing) {
      submit.disabled = !ok.length || missingName;
      submit.textContent = ok.length ? `Importar ${plural(ok.length, 'caderno', 'cadernos')} (${plural(nQ, 'questão', 'questões')})` : 'Importar cadernos';
    } else {
      submit.disabled = !nameInput.value.trim() || missingName;
      submit.textContent = ok.length ? `Criar pasta com ${plural(ok.length, 'caderno', 'cadernos')}` : 'Criar pasta';
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const notebooks = valid().map((x) => ({ name: x.name, questions: x.questions }));
      const r = await db.createNotebooks(importing ? { folderId: id, notebooks } : { folderName: nameInput.value, notebooks });
      toast(importing
        ? `${plural(r.notebooks, 'caderno importado', 'cadernos importados')}`
        : r.notebooks ? `Pasta criada com ${plural(r.notebooks, 'caderno', 'cadernos')}` : 'Pasta criada');
      app.navigate(`#/folder/${r.folderId}`, { replace: true });
    } finally { update(); }
  }

  update();

  const el = h('form', { class: 'stack', onsubmit: onSubmit },
    nameInput && h('label', { class: 'field' }, h('span', {}, 'Nome da pasta'), nameInput),
    h('div', { class: 'field' },
      h('span', {}, importing ? 'Arquivos CSV' : 'Cadernos (opcional)'),
      fileInput,
      h('label', { for: 'folder-files', class: 'btn btn-block drop' }, icon('upload'), 'Escolher arquivos CSV (vários)'),
      h('p', { class: 'muted small m0' }, 'Cada arquivo vira um caderno, com o nome do arquivo. Você pode mudar o nome abaixo.')),
    list,
    submit);

  return {
    title: importing ? `Importar em ${folder.name}` : 'Nova pasta',
    back: importing ? `#/folder/${id}` : '#/',
    el,
    mounted: () => nameInput?.focus(),
  };
}
