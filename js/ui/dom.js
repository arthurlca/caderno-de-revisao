// Helpers de interface: criação de elementos, toast e diálogos.

/**
 * h('button', {class: 'btn', onclick: fn}, 'Texto', filho, [mais, filhos])
 * Props começando com "on" viram listeners; `false`/`null` são ignorados.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // só para SVG fixo do próprio app
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value') el.value = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

export const icons = {
  back: svg(`<path d="M15 5l-7 7 7 7" ${S} stroke-width="2.4"/>`),
  plus: svg(`<path d="M12 5v14M5 12h14" ${S} stroke-width="2.4"/>`),
  more: svg('<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>'),
  close: svg(`<path d="M6 6l12 12M18 6L6 18" ${S} stroke-width="2.4"/>`),
  notebook: svg(`<rect x="5" y="3" width="14" height="18" rx="2.5" ${S} stroke-width="2"/><path d="M9 8.5h6M9 12.5h6M9 16.5h3.5" ${S} stroke-width="2"/>`),
  folder: svg(`<path d="M3 7.5A2.5 2.5 0 015.5 5h3.6l2 2.2h7.4A2.5 2.5 0 0121 9.7v7.8a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z" ${S} stroke-width="2"/>`),
  settings: svg(`<path d="M4 7h10M18 7h2M4 17h2M10 17h10" ${S} stroke-width="2.2"/><circle cx="16" cy="7" r="2.3" ${S} stroke-width="2"/><circle cx="8" cy="17" r="2.3" ${S} stroke-width="2"/>`),
  play: svg('<path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" fill="currentColor"/>'),
  download: svg(`<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" ${S} stroke-width="2.2"/>`),
  timer: svg(`<circle cx="12" cy="13.5" r="7.5" ${S} stroke-width="2"/><path d="M12 9.5v4l2.5 2M10 3h4" ${S} stroke-width="2"/>`),
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5" ${S} stroke-width="2.6"/>`),
  cross: svg(`<path d="M7 7l10 10M17 7L7 17" ${S} stroke-width="2.6"/>`),
  upload: svg(`<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" ${S} stroke-width="2.2"/>`),
};

export const icon = (name) => h('span', { class: 'icon', html: icons[name] });

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * Abre um <dialog> com o conteúdo dado e resolve com o valor passado a `close`.
 * Cada chamada cria o próprio elemento (o evento "close" é assíncrono).
 */
export function openDialog(build) {
  const dlg = document.createElement('dialog');
  document.body.append(dlg);
  return new Promise((resolve) => {
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve(value);
    };
    dlg.append(build(close));
    dlg.addEventListener('close', () => close(undefined)); // Esc / gesto de voltar
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(undefined); }); // toque fora fecha
    dlg.showModal();
    const auto = dlg.querySelector('[autofocus]');
    if (auto) setTimeout(() => auto.focus(), 50);
  });
}

export async function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  const r = await openDialog((close) => h('form', { method: 'dialog', class: 'dlg', onsubmit: (e) => { e.preventDefault(); close(true); } },
    h('h2', {}, title),
    message && h('p', { class: 'dlg-msg' }, message),
    h('div', { class: 'dlg-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => close(false) }, 'Cancelar'),
      h('button', { type: 'submit', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}` }, confirmLabel),
    ),
  ));
  return r === true;
}

export async function promptDialog({ title, label, value = '', confirmLabel = 'Salvar', placeholder = '' }) {
  const r = await openDialog((close) => {
    const input = h('input', { type: 'text', class: 'input', value, placeholder, autofocus: true, 'aria-label': label || title, enterkeyhint: 'done' });
    return h('form', { class: 'dlg', onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); if (v) close(v); } },
      h('h2', {}, title),
      label && h('label', { class: 'dlg-msg' }, label),
      input,
      h('div', { class: 'dlg-actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => close(null) }, 'Cancelar'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, confirmLabel),
      ),
    );
  });
  return typeof r === 'string' ? r : null;
}

/** Folha de ações: lista de botões. Resolve com a `value` escolhida. */
export function actionSheet({ title, actions }) {
  return openDialog((close) => h('div', { class: 'dlg sheet' },
    title && h('h2', {}, title),
    actions.map((a) => h('button', { type: 'button', class: `btn btn-block ${a.danger ? 'btn-danger-ghost' : ''}`, onclick: () => close(a.value) }, a.label)),
    h('button', { type: 'button', class: 'btn btn-block btn-ghost', onclick: () => close(null) }, 'Cancelar'),
  ));
}

/** Aviso simples com um botão. `extra` pode ser um elemento (ex.: botão de salvar arquivo). */
export function alertDialog({ title, message, extra }) {
  return openDialog((close) => h('div', { class: 'dlg' },
    h('h2', {}, title),
    message && h('p', { class: 'dlg-msg' }, message),
    extra,
    h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => close(true) }, 'OK')),
  ));
}
