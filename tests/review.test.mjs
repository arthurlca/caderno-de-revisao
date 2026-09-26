import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickFolderQuestions, buildSession, applyAnswers, errorReport, historySummary, lastSessions, shuffle, worstFirst,
} from '../js/core/review.js';
import { clock, duration, slug } from '../js/core/format.js';

// Gerador determinístico para os testes
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const q = (id, attempts = 0, wrongs = 0, lastWrongAt = 0) => ({ id, attempts, wrongs, lastWrongAt });

test('pasta com menos questões que o pedido: entram todas', () => {
  const qs = [q('a'), q('b'), q('c')];
  const r = pickFolderQuestions(qs, 10, seeded());
  assert.deepEqual(r.map((x) => x.id).sort(), ['a', 'b', 'c']);
});

test('pasta: as de pior desempenho quando há erradas suficientes', () => {
  const qs = [q('ok', 5, 0), q('w1', 4, 1), q('w2', 2, 2), q('w3', 4, 3), q('w4', 10, 1), q('new')];
  const r = pickFolderQuestions(qs, 3, seeded());
  assert.deepEqual(r.map((x) => x.id).sort(), ['w1', 'w2', 'w3']); // 100%, 75%, 25%
});

test('pasta: completa com aleatórias quando faltam erradas', () => {
  const qs = [q('w', 1, 1), ...Array.from({ length: 20 }, (_, i) => q(`n${i}`))];
  const r = pickFolderQuestions(qs, 5, seeded());
  assert.equal(r.length, 5);
  assert.ok(r.some((x) => x.id === 'w'));
  assert.equal(new Set(r.map((x) => x.id)).size, 5);
});

test('pasta: limite de 100 questões', () => {
  const qs = Array.from({ length: 300 }, (_, i) => q(`n${i}`));
  assert.equal(pickFolderQuestions(qs, 500, seeded()).length, 100);
});

test('worstFirst desempata por número de erros e recência', () => {
  const list = [q('a', 2, 1, 5), q('b', 4, 2, 1), q('c', 4, 2, 9)].sort(worstFirst);
  assert.deepEqual(list.map((x) => x.id), ['c', 'b', 'a']);
});

test('shuffle mantém os elementos', () => {
  const a = [1, 2, 3, 4, 5];
  assert.deepEqual(shuffle(a, seeded()).sort(), a);
});

test('buildSession, applyAnswers e errorReport', () => {
  const qs = [q('a'), q('b'), q('c', 3, 1)];
  const answers = [
    { questionId: 'a', chosen: 0, correct: true },
    { questionId: 'b', chosen: 2, correct: false },
    { questionId: 'c', chosen: 1, correct: false },
  ];
  const s = buildSession({ id: 's', scope: 'notebook', scopeId: 'n', scopeName: 'N', startedAt: 0, finishedAt: 10, durationMs: 1234.4, answers });
  assert.equal(s.total, 3);
  assert.equal(s.correct, 1);
  assert.equal(s.score, 33);
  assert.equal(s.durationMs, 1234);

  const up = applyAnswers(qs, answers, 99);
  const byId = Object.fromEntries(up.map((x) => [x.id, x]));
  assert.deepEqual([byId.a.attempts, byId.a.wrongs], [1, 0]);
  assert.deepEqual([byId.b.attempts, byId.b.wrongs, byId.b.lastWrongAt], [1, 1, 99]);
  assert.deepEqual([byId.c.attempts, byId.c.wrongs], [4, 2]);
  assert.equal(qs[2].attempts, 3, 'não altera o original');

  assert.deepEqual(errorReport(up).map((x) => x.id), ['c', 'b']); // mais erros primeiro
});

test('historySummary usa as 5 últimas', () => {
  const ss = [10, 20, 30, 40, 50, 60, 70].map((score, i) => ({ score, finishedAt: i, durationMs: 1000 }));
  const h = historySummary(ss);
  assert.deepEqual(h.last.map((x) => x.score), [70, 60, 50, 40, 30]);
  assert.equal(h.avg, 50);
  assert.equal(h.best, 70);
  assert.equal(h.delta, 10);
  assert.equal(h.total, 7);
  assert.equal(historySummary([]), null);
  assert.equal(lastSessions(ss, 2).length, 2);
});

test('formatação de tempo', () => {
  assert.equal(clock(7000), '0:07');
  assert.equal(clock(754000), '12:34');
  assert.equal(clock(3723000), '1:02:03');
  assert.equal(duration(45000), '45 s');
  assert.equal(duration(252000), '4 min 12 s');
  assert.equal(duration(120000), '2 min');
  assert.equal(duration(3900000), '1 h 05 min');
  assert.equal(slug('Contabilidade: Aula 1!'), 'contabilidade-aula-1');
});
