// Regras das revisões: seleção de questões, pontuação, estatísticas e relatório de erros.
// Sem DOM e sem IndexedDB, para rodar nos testes do Node.

export const MAX_FOLDER_QUESTIONS = 100;
export const DEFAULT_FOLDER_QUESTIONS = 20;
export const HISTORY_SIZE = 5;

/** Fisher–Yates; devolve uma cópia. */
export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const attemptsOf = (q) => q.attempts || 0;
export const wrongsOf = (q) => q.wrongs || 0;
export const errorRate = (q) => (attemptsOf(q) ? wrongsOf(q) / attemptsOf(q) : 0);

/** Pior desempenho primeiro: maior taxa de erro, depois mais erros, depois erro mais recente. */
export function worstFirst(a, b) {
  return errorRate(b) - errorRate(a)
    || wrongsOf(b) - wrongsOf(a)
    || (b.lastWrongAt || 0) - (a.lastWrongAt || 0);
}

/** Mais erradas primeiro (para o PDF): mais erros, depois maior taxa de erro. */
export function mostWrongFirst(a, b) {
  return wrongsOf(b) - wrongsOf(a)
    || errorRate(b) - errorRate(a)
    || (b.lastWrongAt || 0) - (a.lastWrongAt || 0);
}

/**
 * Escolhe as questões da revisão de uma pasta:
 * - com `n` ou menos questões na pasta, entram todas;
 * - senão, entram as `n` de pior desempenho entre as que já foram erradas;
 * - se não houver `n` erradas, o restante é completado com questões aleatórias.
 * A ordem final é embaralhada.
 */
export function pickFolderQuestions(questions, n, rand = Math.random) {
  const count = Math.max(1, Math.min(n, MAX_FOLDER_QUESTIONS));
  if (questions.length <= count) return shuffle(questions, rand);
  const wrong = questions.filter((q) => wrongsOf(q) > 0).sort(worstFirst);
  const chosen = wrong.slice(0, count);
  if (chosen.length < count) {
    const ids = new Set(chosen.map((q) => q.id));
    const rest = shuffle(questions.filter((q) => !ids.has(q.id)), rand);
    chosen.push(...rest.slice(0, count - chosen.length));
  }
  return shuffle(chosen, rand);
}

/** Nota em porcentagem inteira. */
export function percent(correct, total) {
  return total ? Math.round((correct / total) * 100) : 0;
}

/**
 * Monta o registro da revisão.
 * @param {{scope: 'notebook'|'folder', scopeId: string, scopeName: string, startedAt: number,
 *          finishedAt: number, durationMs: number, answers: {questionId: string, chosen: number, correct: boolean}[]}} p
 */
export function buildSession({ id, scope, scopeId, scopeName, startedAt, finishedAt, durationMs, answers }) {
  const correct = answers.filter((a) => a.correct).length;
  return {
    id, scope, scopeId, scopeName, startedAt, finishedAt,
    durationMs: Math.max(0, Math.round(durationMs)),
    total: answers.length,
    correct,
    score: percent(correct, answers.length),
    answers: answers.map((a) => ({ questionId: a.questionId, chosen: a.chosen, correct: a.correct })),
  };
}

/** Aplica as respostas às estatísticas das questões. Devolve cópias atualizadas. */
export function applyAnswers(questions, answers, now) {
  const byId = new Map(questions.map((q) => [q.id, { ...q }]));
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    q.attempts = attemptsOf(q) + 1;
    q.wrongs = wrongsOf(q) + (a.correct ? 0 : 1);
    q.lastAnsweredAt = now;
    if (!a.correct) q.lastWrongAt = now;
  }
  return [...byId.values()];
}

/** Questões já erradas alguma vez, as mais erradas primeiro. */
export function errorReport(questions) {
  return questions.filter((q) => wrongsOf(q) > 0).sort(mostWrongFirst);
}

/** As últimas revisões, da mais recente para a mais antiga. */
export function lastSessions(sessions, n = HISTORY_SIZE) {
  return [...sessions].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, n);
}

/** Resumo das últimas revisões: média, melhor e variação da última em relação à anterior. */
export function historySummary(sessions) {
  const last = lastSessions(sessions);
  if (!last.length) return null;
  const avg = Math.round(last.reduce((s, x) => s + x.score, 0) / last.length);
  const best = Math.max(...last.map((x) => x.score));
  const delta = last.length > 1 ? last[0].score - last[1].score : null;
  const avgTime = Math.round(last.reduce((s, x) => s + x.durationMs, 0) / last.length);
  return { last, avg, best, delta, avgTime, total: sessions.length };
}
