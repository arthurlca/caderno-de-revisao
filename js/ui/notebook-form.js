// Criar caderno (nome + um ou mais CSVs) e adicionar questões a um caderno existente.

import * as db from '../data/db.js';
import { decodeBytes } from '../core/csv.js';
import { parseQuestions, dedupe, nameFromFile, letterOf } from '../core/quiz-import.js';
import { plural } from '../core/format.js';
import { h, icon, toast } from './dom.js';
import { optionLine } from './common.js';

const DELIM_NAMES = { '|': 'barra vertical |', '\t': 'tab', ';': 'ponto e vírgula', ',': 'vírgula' };

async function readFiles(fileList) {
  const out = [];
  for (const f of fileList) {
    const text = decodeBytes(await f.arrayBuffer());
    out.push({ name: f.name, ...parseQuestions(text) });
  }
  return out;
}

function sourceSummary(src) {
  const ok = src.questions.length;
  return h('div', { class: 'src' },
    h('div', { class: 'src-head' },
      h('b', {}, src.name),
      h('span', { class: `badge ${ok ? 'ok' : 'bad'}` }, plural(ok, 'questão', 'questões'))),
    ok ? h('p', { class: 'muted small m0' }, `Separador: ${DELIM_NAMES[src.delimiter]}`) : null,
    src.skipped.length ? h('details', { class: 'skipped' },
      h('summary', {}, `${plural(src.skipped.length, 'linha ignorada', 'linhas ignoradas')}`),
      h('ul', {}, src.skipped.slice(0, 30).map((s) => h('li', {}, `Linha ${s.line}: ${s.reason}`))),
      src.skipped.length > 30 ? h('p', { class: 'muted small' }, `…e mais ${src.skipped.length - 30}.`) : null) : null);
}

function samplePreview(q) {
  return h('div', { class: 'sample' },
    h('p', { class: 'sample-q' }, q.question),
    h('ol', { class: 'opts-read' }, q.options.map((o, i) => optionLine(o, letterOf(q, i), { correct: i === q.answer }))),
    q.explanation && h('p', { class: 'muted small m0' }, q.explanation));
}

export async function render({ id, mode }, app) {
  const importing = mode === 'import';
  let notebook = null, folder = null, existing = [];
  if (importing) {
    notebook = await db.getNotebook(id);
    if (!notebook) { app.navigate('#/', { replace: true }); return null; }
    existing = await db.listQuestions(id);
  } else if (mode === 'folder') {
    folder = await db.getFolder(id);
    if (!folder) { app.navigate('#/', { replace: true }); return null; }
  }
  const backHref = importing ? `#/nb/${id}` : folder ? `#/folder/${folder.id}` : '#/';

  let sources = [];      // arquivos lidos
  let pasted = null;     // texto colado
  let nameTouched = false;

  const nameInput = !importing && h('input', {
    type: 'text', class: 'input', placeholder: 'Ex.: Contabilidade geral', enterkeyhint: 'done',
    oninput: () => { nameTouched = true; update(); },
  });
  const fileInput = h('input', {
    type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain', multiple: true, class: 'visually-hidden', id: 'csv-files',
    onchange: async () => {
      sources = await readFiles(fileInput.files);
      if (nameInput && !nameTouched && sources[0]) nameInput.value = nameFromFile(sources[0].name);
      update();
    },
  });
  const pasteArea = h('textarea', {
    class: 'input code', rows: 6, spellcheck: 'false',
    placeholder: "pergunta|opcoes|resposta|explicacao\nO objeto da contabilidade é:|['A - Patrimônio','B - Lucro']|A|Segundo o CPC 00…",
    oninput: () => {
      const t = pasteArea.value.trim();
      pasted = t ? { name: 'Texto colado', ...parseQuestions(t) } : null;
      update();
    },
  });
  const dupCheck = h('input', { type: 'checkbox', onchange: () => update() });
  const preview = h('div', { class: 'stack' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg btn-block' }, importing ? 'Adicionar questões' : 'Criar caderno');

  const plan = () => {
    const all = [...sources, pasted].filter(Boolean).flatMap((s) => s.questions);
    const { toAdd, duplicates } = dedupe(all, existing);
    return { all, toAdd: dupCheck.checked ? all : toAdd, duplicates };
  };

  function update() {
    const srcs = [...sources, pasted].filter(Boolean);
    const p = plan();
    preview.replaceChildren(...[
      ...srcs.map(sourceSummary),
      p.duplicates.length ? h('label', { class: 'check' }, dupCheck,
        `Importar também ${plural(p.duplicates.length, 'questão repetida', 'questões repetidas')}`) : null,
      p.toAdd.length ? h('div', { class: 'panel' }, h('h2', {}, 'Prévia'), samplePreview(p.toAdd[0]),
        p.toAdd.length > 1 ? h('p', { class: 'muted small m0 mt' }, `…e mais ${plural(p.toAdd.length - 1, 'questão', 'questões')}.`) : null) : null,
    ].filter(Boolean));
    const nameOk = importing || nameInput.value.trim();
    submit.disabled = !p.toAdd.length || !nameOk;
    submit.textContent = p.toAdd.length
      ? `${importing ? 'Adicionar' : 'Criar caderno com'} ${plural(p.toAdd.length, 'questão', 'questões')}`
      : importing ? 'Adicionar questões' : 'Criar caderno';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const p = plan();
    if (!p.toAdd.length) return;
    submit.disabled = true;
    try {
      if (importing) {
        await db.addQuestions(id, p.toAdd);
        toast(`${plural(p.toAdd.length, 'questão adicionada', 'questões adicionadas')}`);
        app.navigate(`#/nb/${id}`, { replace: true });
      } else {
        const nb = await db.createNotebook(nameInput.value, folder?.id ?? null, p.toAdd);
        toast('Caderno criado');
        app.navigate(`#/nb/${nb.id}`, { replace: true });
      }
    } finally { submit.disabled = false; }
  }

  update();

  const el = h('form', { class: 'stack', onsubmit: onSubmit },
    nameInput && h('label', { class: 'field' }, h('span', {}, 'Nome do caderno'), nameInput),
    h('div', { class: 'field' },
      h('span', {}, 'Arquivos CSV com as questões'),
      fileInput,
      h('label', { for: 'csv-files', class: 'btn btn-block drop' }, icon('upload'), 'Escolher arquivos (um ou mais)'),
      h('p', { class: 'muted small m0' }, 'Colunas: pergunta | opcoes | resposta | explicacao. ',
        h('a', { href: '#/settings' }, 'Ver formato e modelo'))),
    h('details', { class: 'paste' }, h('summary', {}, 'Ou colar o conteúdo'), pasteArea),
    preview,
    submit);

  return {
    title: importing ? `Adicionar a ${notebook.name}` : folder ? `Novo caderno em ${folder.name}` : 'Novo caderno',
    back: backHref,
    el,
    mounted: () => nameInput?.focus(),
  };
}
