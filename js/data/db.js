// Armazenamento em IndexedDB. Toda leitura e escrita do app passa por aqui.
//
// folders    { id, name }
// notebooks  { id, name, folderId }            folderId nulo = fora de pastas
// questions  { id, notebookId, question, options[], answer, explanation,
//              attempts, wrongs, lastAnsweredAt, lastWrongAt }
// sessions   { id, scope: 'notebook'|'folder', scopeId, scopeName, startedAt, finishedAt,
//              durationMs, total, correct, score, answers[{questionId, chosen, correct}] }
// meta       { key, value }

const DB_NAME = 'caderno-de-revisao';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore('folders', { keyPath: 'id' });
        db.createObjectStore('notebooks', { keyPath: 'id' }).createIndex('by_folder', 'folderId');
        db.createObjectStore('questions', { keyPath: 'id' }).createIndex('by_notebook', 'notebookId');
        db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('by_scope', ['scope', 'scopeId']);
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => console.warn('Atualização do banco aguardando outra aba do app.');
  });
  return dbPromise;
}

const reqP = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/** Roda `fn` numa transação e resolve quando ela termina (commit). */
async function tx(storeNames, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = {};
    for (const n of storeNames) stores[n] = t.objectStore(n);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação cancelada'));
    Promise.resolve(fn(stores, t)).then((r) => { result = r; }, (err) => { try { t.abort(); } catch {} reject(err); });
  });
}

/** Id único; crypto.randomUUID só existe em contexto seguro (HTTPS). */
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true });
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

// ---------- meta ----------

export async function getMeta(key) {
  const row = await tx(['meta'], 'readonly', ({ meta }) => reqP(meta.get(key)));
  return row ? row.value : undefined;
}

export function setMeta(key, value) {
  return tx(['meta'], 'readwrite', ({ meta }) => { meta.put({ key, value }); });
}

// ---------- pastas ----------

export async function listFolders() {
  return (await tx(['folders'], 'readonly', ({ folders }) => reqP(folders.getAll()))).sort(byName);
}

export function getFolder(id) {
  return tx(['folders'], 'readonly', ({ folders }) => reqP(folders.get(id)));
}

export async function createFolder(name, now = Date.now()) {
  const folder = { id: uid(), name: name.trim(), createdAt: now, updatedAt: now };
  await tx(['folders'], 'readwrite', ({ folders }) => { folders.add(folder); });
  return folder;
}

export function renameFolder(id, name, now = Date.now()) {
  return tx(['folders'], 'readwrite', async ({ folders }) => {
    const f = await reqP(folders.get(id));
    if (!f) throw new Error('Pasta não encontrada');
    Object.assign(f, { name: name.trim(), updatedAt: now });
    folders.put(f);
  });
}

/**
 * Exclui a pasta e o histórico de revisões dela. Com `withNotebooks`, apaga também os
 * cadernos (questões e histórico); sem, os cadernos ficam fora de pastas.
 */
export function deleteFolder(id, { withNotebooks = false } = {}) {
  return tx(['folders', 'notebooks', 'questions', 'sessions'], 'readwrite', async (s) => {
    s.folders.delete(id);
    await deleteSessionsIn(s, 'folder', id);
    const nbs = await reqP(s.notebooks.index('by_folder').getAll(IDBKeyRange.only(id)));
    for (const nb of nbs) {
      if (withNotebooks) await deleteNotebookIn(s, nb.id);
      else { nb.folderId = null; s.notebooks.put(nb); }
    }
  });
}

// ---------- cadernos ----------

export async function listNotebooks() {
  const nbs = await tx(['notebooks'], 'readonly', ({ notebooks }) => reqP(notebooks.getAll()));
  return nbs.map((n) => ({ ...n, folderId: n.folderId ?? null })).sort(byName);
}

export async function getNotebook(id) {
  const n = await tx(['notebooks'], 'readonly', ({ notebooks }) => reqP(notebooks.get(id)));
  return n ? { ...n, folderId: n.folderId ?? null } : n;
}

function makeQuestion(notebookId, q, order, now) {
  return {
    id: uid(), notebookId, order,
    question: q.question, options: q.options, answer: q.answer, explanation: q.explanation || '',
    ...(q.letters ? { letters: q.letters } : {}), // letras do arquivo, ex.: C/E no Certo/Errado
    attempts: 0, wrongs: 0, lastAnsweredAt: null, lastWrongAt: null,
    createdAt: now,
  };
}

/** Cria o caderno já com as questões, numa única transação. */
export function createNotebook(name, folderId, questions, now = Date.now()) {
  const nb = { id: uid(), name: name.trim(), folderId: folderId || null, createdAt: now, updatedAt: now };
  return tx(['notebooks', 'questions'], 'readwrite', (s) => {
    s.notebooks.add(nb);
    questions.forEach((q, i) => s.questions.add(makeQuestion(nb.id, q, i, now)));
    return nb;
  });
}

/**
 * Cria vários cadernos (um por arquivo) numa única transação. Com `folderName`,
 * cria também a pasta; senão usa `folderId`.
 * @param {{folderId?: string, folderName?: string, notebooks: {name: string, questions: object[]}[]}} p
 * @returns {Promise<{folderId: string, notebooks: number, questions: number}>}
 */
export function createNotebooks({ folderId, folderName, notebooks }, now = Date.now()) {
  return tx(['folders', 'notebooks', 'questions'], 'readwrite', (s) => {
    let fid = folderId;
    if (folderName) {
      fid = uid();
      s.folders.add({ id: fid, name: folderName.trim(), createdAt: now, updatedAt: now });
    }
    let nQuestions = 0;
    for (const nb of notebooks) {
      const id = uid();
      s.notebooks.add({ id, name: nb.name.trim(), folderId: fid, createdAt: now, updatedAt: now });
      nb.questions.forEach((q, i) => s.questions.add(makeQuestion(id, q, i, now)));
      nQuestions += nb.questions.length;
    }
    return { folderId: fid, notebooks: notebooks.length, questions: nQuestions };
  });
}

export function addQuestions(notebookId, questions, now = Date.now()) {
  return tx(['questions'], 'readwrite', async ({ questions: store }) => {
    const existing = await reqP(store.index('by_notebook').getAll(IDBKeyRange.only(notebookId)));
    let order = existing.reduce((m, q) => Math.max(m, (q.order ?? 0) + 1), 0);
    for (const q of questions) store.add(makeQuestion(notebookId, q, order++, now));
    return questions.length;
  });
}

export function renameNotebook(id, name, now = Date.now()) {
  return tx(['notebooks'], 'readwrite', async ({ notebooks }) => {
    const n = await reqP(notebooks.get(id));
    if (!n) throw new Error('Caderno não encontrado');
    Object.assign(n, { name: name.trim(), updatedAt: now });
    notebooks.put(n);
  });
}

export function moveNotebook(id, folderId, now = Date.now()) {
  return tx(['notebooks'], 'readwrite', async ({ notebooks }) => {
    const n = await reqP(notebooks.get(id));
    if (!n) throw new Error('Caderno não encontrado');
    Object.assign(n, { folderId, updatedAt: now });
    notebooks.put(n);
  });
}

/** Exclui o caderno, as questões e o histórico dele. */
export function deleteNotebook(id) {
  return tx(['notebooks', 'questions', 'sessions'], 'readwrite', (s) => deleteNotebookIn(s, id));
}

async function deleteNotebookIn(s, id) {
  s.notebooks.delete(id);
  const keys = await reqP(s.questions.index('by_notebook').getAllKeys(IDBKeyRange.only(id)));
  for (const k of keys) s.questions.delete(k);
  await deleteSessionsIn(s, 'notebook', id);
}

async function deleteSessionsIn(s, scope, scopeId) {
  const keys = await reqP(s.sessions.index('by_scope').getAllKeys(IDBKeyRange.only([scope, scopeId])));
  for (const k of keys) s.sessions.delete(k);
}

// ---------- questões ----------

export async function listQuestions(notebookId) {
  const qs = await tx(['questions'], 'readonly', ({ questions }) => reqP(questions.index('by_notebook').getAll(IDBKeyRange.only(notebookId))));
  return qs.sort(byOrder);
}

export function allQuestions() {
  return tx(['questions'], 'readonly', ({ questions }) => reqP(questions.getAll()));
}

/** Questões de todos os cadernos da pasta. */
export function folderQuestions(folderId) {
  return tx(['notebooks', 'questions'], 'readonly', async ({ notebooks, questions }) => {
    const nbs = await reqP(notebooks.index('by_folder').getAll(IDBKeyRange.only(folderId)));
    const out = [];
    for (const nb of nbs) {
      const qs = await reqP(questions.index('by_notebook').getAll(IDBKeyRange.only(nb.id)));
      out.push(...qs.sort(byOrder));
    }
    return out;
  });
}

export function deleteQuestion(id) {
  return tx(['questions'], 'readwrite', ({ questions }) => { questions.delete(id); });
}

/** Zera acertos/erros das questões do caderno e apaga o histórico de revisões dele. */
export function resetNotebookHistory(notebookId) {
  return tx(['questions', 'sessions'], 'readwrite', async (s) => {
    const qs = await reqP(s.questions.index('by_notebook').getAll(IDBKeyRange.only(notebookId)));
    for (const q of qs) s.questions.put({ ...q, attempts: 0, wrongs: 0, lastAnsweredAt: null, lastWrongAt: null });
    await deleteSessionsIn(s, 'notebook', notebookId);
  });
}

// ---------- revisões ----------

/** Grava a revisão e as estatísticas atualizadas das questões na mesma transação. */
export function saveSession(session, updatedQuestions) {
  return tx(['sessions', 'questions'], 'readwrite', async ({ sessions, questions }) => {
    sessions.add(session);
    for (const q of updatedQuestions) {
      // A questão pode ter sido excluída durante a revisão (outra aba): não recria
      if (await reqP(questions.getKey(q.id))) questions.put(q);
    }
  });
}

/** Revisões de um caderno ou pasta, da mais recente para a mais antiga. */
export async function listSessions(scope, scopeId) {
  const ss = await tx(['sessions'], 'readonly', ({ sessions }) => reqP(sessions.index('by_scope').getAll(IDBKeyRange.only([scope, scopeId]))));
  return ss.sort((a, b) => b.finishedAt - a.finishedAt);
}

export function allSessions() {
  return tx(['sessions'], 'readonly', ({ sessions }) => reqP(sessions.getAll()));
}

// ---------- backup ----------

export function countAll() {
  return tx(['folders', 'notebooks', 'questions', 'sessions'], 'readonly', async (s) => ({
    folders: await reqP(s.folders.count()),
    notebooks: await reqP(s.notebooks.count()),
    questions: await reqP(s.questions.count()),
    sessions: await reqP(s.sessions.count()),
  }));
}

export function exportAll() {
  return tx(['folders', 'notebooks', 'questions', 'sessions'], 'readonly', async (s) => ({
    folders: await reqP(s.folders.getAll()),
    notebooks: (await reqP(s.notebooks.getAll())).map((n) => ({ ...n, folderId: n.folderId ?? null })),
    questions: await reqP(s.questions.getAll()),
    sessions: await reqP(s.sessions.getAll()),
  }));
}

/** Substitui todos os dados pelos do backup (já validado). */
export function replaceAll({ folders, notebooks, questions, sessions }) {
  return tx(['folders', 'notebooks', 'questions', 'sessions'], 'readwrite', (s) => {
    for (const k of ['folders', 'notebooks', 'questions', 'sessions']) s[k].clear();
    for (const f of folders) s.folders.put(f);
    for (const n of notebooks) s.notebooks.put(n);
    for (const q of questions) s.questions.put(q);
    for (const x of sessions) s.sessions.put(x);
  });
}
