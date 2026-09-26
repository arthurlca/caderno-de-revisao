// Inicialização: armazenamento persistente, roteador por hash e cabeçalho.

import { h, icon, icons, toast } from './ui/dom.js';
import * as homeView from './ui/home.js';
import * as folderView from './ui/folder.js';
import * as notebookView from './ui/notebook.js';
import * as formView from './ui/notebook-form.js';
import * as reviewView from './ui/review.js';
import * as settingsView from './ui/settings.js';

const APP_NAME = 'Caderno de Revisão';

const routes = [
  [/^#\/$/, homeView],
  [/^#\/new$/, formView, 'root'],
  [/^#\/folder\/([^/]+)$/, folderView],
  [/^#\/folder\/([^/]+)\/new$/, formView, 'folder'],
  [/^#\/nb\/([^/]+)$/, notebookView],
  [/^#\/nb\/([^/]+)\/import$/, formView, 'import'],
  [/^#\/review\/nb\/([^/]+)$/, reviewView, 'notebook'],
  [/^#\/review\/folder\/([^/]+)\/(\d+)$/, reviewView, 'folder'],
  [/^#\/settings$/, settingsView],
];

// Telas em que recarregar no meio perderia algo que você está fazendo
const BUSY_VIEWS = new Set([reviewView, formView]);

const $view = document.getElementById('view');
const $left = document.getElementById('tb-left');
const $right = document.getElementById('tb-right');
const $title = document.getElementById('tb-title');
const $tabbar = document.getElementById('tabbar');

for (const el of $tabbar.querySelectorAll('[data-icon]')) el.innerHTML = icons[el.dataset.icon];

const app = {
  persisted: null,
  updatePending: false,
  current: null,

  navigate(hash, { replace = false } = {}) {
    if (replace) {
      history.replaceState(null, '', hash);
      route();
    } else if (location.hash === hash) {
      route();
    } else {
      location.hash = hash;
    }
  },

  /** back: link de voltar · onBack: botão de fechar com ação própria (ex.: sair da revisão). */
  setHeader({ title = APP_NAME, back = null, onBack = null, actions = [] }) {
    $title.textContent = title;
    document.title = title === APP_NAME ? title : `${title} · ${APP_NAME}`;
    $left.replaceChildren(
      onBack ? h('button', { type: 'button', class: 'tb-btn', 'aria-label': 'Sair', onclick: onBack }, icon('close'))
        : back ? h('a', { class: 'tb-btn', href: back, 'aria-label': 'Voltar' }, icon('back'))
          : '');
    $right.replaceChildren(...actions.map((a) => h('button', {
      type: 'button', class: 'tb-btn', 'aria-label': a.label, title: a.label, onclick: a.onClick,
    }, a.icon ? icon(a.icon) : a.label)));
  },
};

let renderToken = 0;

async function route() {
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/');
  if (app.updatePending) { location.reload(); return; }

  const hash = location.hash;
  let match = null, view = homeView, mode = null;
  for (const [re, v, m] of routes) {
    const r = re.exec(hash);
    if (r) { match = r; view = v; mode = m; break; }
  }
  if (!match) { app.navigate('#/', { replace: true }); return; }

  app.current?.cleanup?.();
  app.current = null;
  const token = ++renderToken;

  try {
    const res = await view.render({
      id: match[1] ? decodeURIComponent(match[1]) : null,
      arg: match[2] ?? null,
      mode,
    }, app);
    if (token !== renderToken) { res?.cleanup?.(); return; } // outra navegação começou
    if (!res) return; // a tela redirecionou
    app.current = { view, cleanup: res.cleanup };
    app.setHeader(res);
    document.body.classList.toggle('no-tabs', !res.tab);
    for (const a of $tabbar.querySelectorAll('a')) {
      if (a.dataset.tab === res.tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    $view.replaceChildren(res.el);
    window.scrollTo(0, 0);
    res.mounted?.();
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    app.setHeader({ title: 'Erro', back: '#/' });
    $view.replaceChildren(h('div', { class: 'empty' },
      h('p', {}, 'Algo deu errado ao abrir esta tela.'),
      h('p', { class: 'small' }, String(err?.message || err)),
      h('a', { class: 'btn', href: '#/' }, 'Voltar ao início')));
  }
}

async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

// O registro do service worker fica em js/sw-register.js (independente do app).
// Aqui só decidimos se a recarga de uma atualização pode acontecer agora.
window.__onAppUpdate = () => {
  if (app.current && BUSY_VIEWS.has(app.current.view)) {
    app.updatePending = true; // recarrega na próxima navegação
    toast('Atualização baixada. Ela será aplicada ao sair desta tela.', 3500);
    return 'defer';
  }
  return 'reload';
};

// Erros em ações (excluir, salvar, importar...) aparecem na tela em vez de sumirem em silêncio
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast(`Erro: ${e.reason?.message || e.reason}`, 5000);
});
window.addEventListener('error', (e) => toast(`Erro: ${e.message}`, 5000));

requestPersistence().then((p) => { app.persisted = p; });
window.addEventListener('hashchange', route);
route();
