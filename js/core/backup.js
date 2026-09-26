// Formato do backup em JSON e validação antes de restaurar.

import { isoDay } from './format.js';

export const BACKUP_APP = 'caderno-de-revisao';
export const BACKUP_VERSION = 1;

export function buildBackup(data, now = Date.now()) {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), ...data };
}

export function backupFileName(now = Date.now()) {
  return `caderno-de-revisao-backup-${isoDay(now)}.json`;
}

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.length > 0;

/**
 * Confere a estrutura do backup. Itens com referências quebradas são descartados
 * (com aviso) em vez de impedir a restauração.
 * @returns {{ok: true, data: object, warnings: string[]} | {ok: false, error: string}}
 */
export function validateBackup(obj) {
  if (!isObj(obj)) return { ok: false, error: 'O arquivo não é um backup.' };
  if (obj.app !== BACKUP_APP) return { ok: false, error: 'Este arquivo não é um backup do Caderno de Revisão.' };
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    return { ok: false, error: 'Backup de uma versão mais nova do app. Atualize o app e tente de novo.' };
  }
  for (const k of ['folders', 'notebooks', 'questions', 'sessions']) {
    if (!Array.isArray(obj[k])) return { ok: false, error: `Backup incompleto: falta "${k}".` };
  }
  const warnings = [];
  const folders = obj.folders.filter((f) => isObj(f) && isStr(f.id) && typeof f.name === 'string');
  const folderIds = new Set(folders.map((f) => f.id));
  const notebooks = obj.notebooks.filter((n) => isObj(n) && isStr(n.id) && typeof n.name === 'string')
    .map((n) => ({ ...n, folderId: n.folderId && folderIds.has(n.folderId) ? n.folderId : null }));
  const nbIds = new Set(notebooks.map((n) => n.id));
  const questions = obj.questions.filter((q) => isObj(q) && isStr(q.id) && nbIds.has(q.notebookId)
    && typeof q.question === 'string' && Array.isArray(q.options) && Number.isInteger(q.answer)
    && q.answer >= 0 && q.answer < q.options.length);
  const sessions = obj.sessions.filter((s) => isObj(s) && isStr(s.id) && (s.scope === 'notebook' || s.scope === 'folder')
    && typeof s.finishedAt === 'number' && Array.isArray(s.answers));
  const dropped = (obj.questions.length - questions.length) + (obj.sessions.length - sessions.length)
    + (obj.folders.length - folders.length) + (obj.notebooks.length - notebooks.length);
  if (dropped) warnings.push(`${dropped} ${dropped === 1 ? 'item inválido foi ignorado' : 'itens inválidos foram ignorados'}.`);
  return { ok: true, data: { folders, notebooks, questions, sessions, exportedAt: obj.exportedAt }, warnings };
}
