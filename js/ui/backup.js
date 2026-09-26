// Exportar e restaurar backup (aviso na tela inicial e Ajustes).

import * as db from '../data/db.js';
import { buildBackup, validateBackup, backupFileName } from '../core/backup.js';
import { plural } from '../core/format.js';
import { toast, confirmDialog, alertDialog } from './dom.js';
import { saveFile } from './files.js';

/** Gera o JSON e oferece para salvar. Resolve com true se o backup foi salvo. */
export async function exportBackup() {
  const now = Date.now();
  const json = JSON.stringify(buildBackup(await db.exportAll(), now));
  const file = new File([json], backupFileName(now), { type: 'application/json' });
  const saved = await saveFile(file);
  if (saved) {
    await db.setMeta('lastBackupAt', Date.now());
    toast('Backup salvo');
  }
  return saved;
}

/** Lê, valida, pede confirmação e substitui tudo. Resolve com true se restaurou. */
export async function importBackupFile(file) {
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    await alertDialog({ title: 'Arquivo inválido', message: 'Não consegui ler este arquivo como JSON.' });
    return false;
  }
  const v = validateBackup(obj);
  if (!v.ok) {
    await alertDialog({ title: 'Backup inválido', message: v.error });
    return false;
  }
  const current = await db.countAll();
  const { folders, notebooks, questions, sessions, exportedAt } = v.data;
  const when = exportedAt ? new Date(exportedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'data desconhecida';
  const ok = await confirmDialog({
    title: 'Restaurar backup?',
    message: `Backup de ${when}:\n${plural(folders.length, 'pasta', 'pastas')}, ${plural(notebooks.length, 'caderno', 'cadernos')}, `
      + `${plural(questions.length, 'questão', 'questões')}, ${plural(sessions.length, 'revisão', 'revisões')}.\n\n`
      + `Isto SUBSTITUI tudo o que está no app agora (${plural(current.questions, 'questão', 'questões')}).`
      + (v.warnings.length ? `\n\n${v.warnings.join(' ')}` : ''),
    confirmLabel: 'Substituir tudo',
    danger: true,
  });
  if (!ok) return false;
  await db.replaceAll(v.data);
  await db.setMeta('lastBackupAt', exportedAt ? Date.parse(exportedAt) || Date.now() : Date.now());
  toast('Backup restaurado');
  return true;
}
