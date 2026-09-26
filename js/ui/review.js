// Revisão (quiz): cronômetro, alternativas clicáveis, correção com explicação e resultado.
// O cronômetro conta só o tempo para responder: pausa enquanto a correção está na tela
// e quando o app vai para o segundo plano.

import * as db from '../data/db.js';
import { LETTERS } from '../core/quiz-import.js';
import { shuffle, pickFolderQuestions, buildSession, applyAnswers } from '../core/review.js';
import { clock, duration, plural, slug, isoDay, dateTime } from '../core/format.js';
import { h, icon, confirmDialog } from './dom.js';
import { questionDetails, scoreClass } from './common.js';
import { exportReportPdf, loadJsPDF } from './files.js';

async function loadScope({ id, mode, arg }) {
  if (mode === 'notebook') {
    const nb = await db.getNotebook(id);
    if (!nb) return null;
    const qs = await db.listQuestions(id);
    return { scope: 'notebook', scopeId: id, name: nb.name, back: `#/nb/${id}`, questions: shuffle(qs), sourceName: null };
  }
  const folder = await db.getFolder(id);
  if (!folder) return null;
  const [qs, notebooks] = await Promise.all([db.folderQuestions(id), db.listNotebooks()]);
  const names = new Map(notebooks.map((n) => [n.id, n.name]));
  return {
    scope: 'folder', scopeId: id, name: folder.name, back: `#/folder/${id}`,
    questions: pickFolderQuestions(qs, Number(arg) || 20),
    sourceName: (q) => names.get(q.notebookId),
  };
}

export async function render(params, app) {
  const s = await loadScope(params);
  if (!s) { app.navigate('#/', { replace: true }); return null; }
  const { questions } = s;
  if (!questions.length) {
    return {
      title: s.name, back: s.back,
      el: h('div', { class: 'empty' }, h('p', {}, 'Não há questões para revisar.'), h('a', { class: 'btn', href: s.back }, 'Voltar')),
    };
  }
  const previous = (await db.listSessions(s.scope, s.scopeId))[0] || null;
  loadJsPDF().catch(() => {}); // deixa o gerador de PDF pronto para o resultado

  // ---------- estado ----------
  let idx = 0;
  let chosen = null;
  let finished = false;
  const answers = [];
  const startedAt = Date.now();
  let activeMs = 0, runStart = null, pausedByHidden = false;
  const now = () => performance.now();
  const startTimer = () => { if (runStart == null) runStart = now(); };
  const pauseTimer = () => { if (runStart != null) { activeMs += now() - runStart; runStart = null; } };
  const elapsed = () => activeMs + (runStart != null ? now() - runStart : 0);

  // ---------- elementos ----------
  const root = h('div', { class: 'quiz' });
  const counter = h('span', { class: 'quiz-count' });
  const timerText = h('span', {}, '0:00');
  const timer = h('span', { class: 'quiz-timer', role: 'timer', 'aria-label': 'Tempo' }, icon('timer'), timerText);
  const bar = h('i');
  const progress = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': questions.length }, bar);
  const card = h('div', { class: 'quiz-card' });
  const optsEl = h('ol', { class: 'opts', 'aria-label': 'Alternativas' });
  const feedback = h('div', { 'aria-live': 'polite' });
  const nextBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block', onclick: () => next() });
  const bottom = h('div', { class: 'answer-bar', hidden: true }, h('div', {}, nextBtn));

  const tick = () => { timerText.textContent = clock(elapsed()); };
  const interval = setInterval(tick, 250);

  function showQuestion() {
    const q = questions[idx];
    chosen = null;
    counter.textContent = `Questão ${idx + 1} de ${questions.length}`;
    bar.style.width = `${(idx / questions.length) * 100}%`;
    progress.setAttribute('aria-valuenow', idx);
    card.replaceChildren(h('div', {},
      s.sourceName && h('p', { class: 'quiz-source' }, s.sourceName(q)),
      h('p', { class: 'quiz-q' }, q.question)));
    optsEl.replaceChildren(...q.options.map((o, i) => h('li', {}, h('button', {
      type: 'button', class: 'opt', onclick: () => answer(i),
    }, h('span', { class: 'opt-letter' }, LETTERS[i]), h('span', { class: 'opt-text' }, o)))));
    feedback.replaceChildren();
    bottom.hidden = true;
    root.classList.remove('answered');
    window.scrollTo(0, 0);
    startTimer();
  }

  function answer(i) {
    if (chosen != null || finished) return;
    pauseTimer();
    tick();
    chosen = i;
    const q = questions[idx];
    const correct = i === q.answer;
    answers.push({ questionId: q.id, chosen: i, correct });
    root.classList.add('answered');
    [...optsEl.querySelectorAll('.opt')].forEach((b, j) => {
      b.disabled = true;
      if (j === q.answer) b.classList.add('correct');
      else if (j === i) b.classList.add('wrong');
      if (j === q.answer || j === i) b.append(h('span', { class: 'opt-mark' }, icon(j === q.answer ? 'check' : 'cross')));
    });
    feedback.replaceChildren(h('div', { class: `feedback ${correct ? 'ok' : 'bad'}` },
      h('b', {}, correct ? 'Correto!' : `Incorreto. Resposta: ${LETTERS[q.answer]}`),
      q.explanation && h('p', {}, q.explanation)));
    nextBtn.textContent = idx + 1 < questions.length ? 'Próxima' : 'Ver resultado';
    bottom.hidden = false;
    feedback.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function next() {
    if (chosen == null || finished) return;
    idx++;
    if (idx >= questions.length) finish();
    else showQuestion();
  }

  async function finish() {
    finished = true;
    pauseTimer();
    clearInterval(interval);
    bottom.hidden = true;
    const finishedAt = Date.now();
    const session = buildSession({
      id: db.uid(), scope: s.scope, scopeId: s.scopeId, scopeName: s.name,
      startedAt, finishedAt, durationMs: activeMs, answers,
    });
    const updated = applyAnswers(questions, answers, finishedAt);
    await db.saveSession(session, updated);
    app.setHeader({ title: 'Resultado', back: s.back });
    showResult(session, updated);
  }

  function showResult(session, updated) {
    const byId = new Map(updated.map((q) => [q.id, q]));
    const wrong = session.answers.filter((a) => !a.correct).map((a) => ({ ...byId.get(a.questionId), chosen: a.chosen }));
    const perQ = session.total ? session.durationMs / session.total : 0;
    const diff = previous ? session.score - previous.score : null;

    const pdfBtn = wrong.length > 0 && h('button', {
      type: 'button', class: 'btn btn-block',
      onclick: async () => {
        pdfBtn.disabled = true;
        try {
          await exportReportPdf(`revisao-${slug(s.name)}-${isoDay(session.finishedAt)}.pdf`, {
            title: s.name,
            subtitle: `Erros da revisão de ${dateTime(session.finishedAt)} · nota ${session.score}% (${session.correct}/${session.total}) · ${duration(session.durationMs)}`,
            items: wrong, mode: 'session',
          });
        } finally { pdfBtn.disabled = false; }
      },
    }, icon('download'), 'Baixar PDF dos erros desta revisão');

    root.classList.remove('answered');
    root.replaceChildren(h('div', { class: 'result' },
      h('div', { class: `score-big ${scoreClass(session.score)}` }, h('b', {}, `${session.score}%`)),
      h('p', { class: 'result-line' }, `${session.correct} de ${session.total} ${session.correct === 1 ? 'acerto' : 'acertos'}`),
      h('p', { class: 'muted m0' }, `Tempo: ${duration(session.durationMs)} · ${duration(perQ)} por questão`),
      previous && h('p', { class: 'muted m0' }, `Revisão anterior: ${previous.score}% `,
        h('span', { class: `delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}` }, diff > 0 ? `▲ ${diff} pts` : diff < 0 ? `▼ ${-diff} pts` : '= igual')),
      h('div', { class: 'stack mt' },
        h('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block', onclick: () => app.navigate(location.hash) }, 'Revisar de novo'),
        pdfBtn,
        h('a', { class: 'btn btn-block', href: s.back }, s.scope === 'folder' ? 'Voltar à pasta' : 'Voltar ao caderno'))),
    wrong.length
      ? h('section', {}, h('h2', { class: 'section-title' }, `Você errou ${plural(wrong.length, 'questão', 'questões')}`),
        h('div', { class: 'qlist' }, wrong.map((q) => questionDetails(q, { chosen: q.chosen }))))
      : h('p', { class: 'center big-emoji' }, 'Gabaritou! 🎉'));
    window.scrollTo(0, 0);
  }

  // ---------- teclado e segundo plano ----------
  const onKey = (e) => {
    if (finished || e.target.closest?.('input, textarea, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toUpperCase();
    const q = questions[idx];
    if (chosen == null) {
      let i = LETTERS.indexOf(k);
      if (i < 0 && /^[1-5]$/.test(k)) i = Number(k) - 1;
      if (i >= 0 && i < q.options.length) { e.preventDefault(); answer(i); }
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    }
  };
  const onVisibility = () => {
    if (finished) return;
    if (document.visibilityState === 'hidden' && runStart != null) { pauseTimer(); pausedByHidden = true; }
    else if (document.visibilityState === 'visible' && pausedByHidden) { pausedByHidden = false; startTimer(); }
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  async function leave() {
    if (!finished && answers.length && !await confirmDialog({
      title: 'Sair da revisão?', message: 'As respostas desta revisão não serão salvas.', confirmLabel: 'Sair', danger: true,
    })) return;
    app.navigate(s.back);
  }

  root.append(
    h('div', { class: 'quiz-meta' }, counter, timer),
    progress, card, optsEl, feedback, bottom);
  showQuestion();

  return {
    title: s.name,
    onBack: leave,
    el: root,
    cleanup: () => {
      clearInterval(interval);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
