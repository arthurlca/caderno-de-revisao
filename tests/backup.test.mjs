import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, validateBackup, backupFileName } from '../js/core/backup.js';

const data = {
  folders: [{ id: 'f', name: 'Pasta' }],
  notebooks: [{ id: 'n', name: 'Caderno', folderId: 'f' }, { id: 'm', name: 'Órfão', folderId: 'sumiu' }],
  questions: [
    { id: 'q', notebookId: 'n', question: 'P?', options: ['a', 'b'], answer: 1 },
    { id: 'x', notebookId: 'nenhum', question: 'P?', options: ['a', 'b'], answer: 0 },
    { id: 'y', notebookId: 'n', question: 'P?', options: ['a', 'b'], answer: 5 },
  ],
  sessions: [{ id: 's', scope: 'notebook', scopeId: 'n', finishedAt: 1, answers: [] }],
};

test('ida e volta do backup', () => {
  const b = JSON.parse(JSON.stringify(buildBackup(data, Date.UTC(2026, 0, 2))));
  const v = validateBackup(b);
  assert.equal(v.ok, true);
  assert.equal(v.data.questions.length, 1);
  assert.equal(v.data.notebooks.find((n) => n.id === 'm').folderId, null);
  assert.equal(v.warnings.length, 1);
  assert.equal(v.data.sessions.length, 1);
});

test('rejeita arquivos que não são backup', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ app: 'flashcards', version: 1 }).ok, false);
  assert.equal(validateBackup({ app: 'caderno-de-revisao', version: 99 }).ok, false);
  assert.equal(validateBackup({ app: 'caderno-de-revisao', version: 1, folders: [] }).ok, false);
});

test('nome do arquivo', () => {
  assert.match(backupFileName(Date.UTC(2026, 8, 26, 15)), /^caderno-de-revisao-backup-2026-09-26\.json$/);
});
