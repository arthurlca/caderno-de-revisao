// Salvar arquivos (backup, PDF, modelo CSV) e gerar os PDFs de revisão.

import { h, alertDialog } from './dom.js';
import { buildReport } from '../core/pdf-report.js';

const isTouch = () => matchMedia('(pointer: coarse)').matches;

function download(file) {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Oferece o arquivo para salvar. No celular usa a folha de compartilhamento
 * ("Salvar em Arquivos"); no computador, baixa. Resolve com true se salvou.
 */
export async function saveFile(file) {
  if (isTouch() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // cancelado pelo usuário
      if (err.name !== 'NotAllowedError') throw err;
      // O Safari exige um toque recente: pede um segundo toque com o arquivo já pronto
      let saved = false;
      await alertDialog({
        title: 'Arquivo pronto',
        message: `Toque em "Salvar arquivo" para salvar ou compartilhar ${file.name}.`,
        extra: h('button', {
          type: 'button', class: 'btn btn-primary btn-block',
          onclick: async () => { try { await navigator.share({ files: [file], title: file.name }); saved = true; } catch {} },
        }, 'Salvar arquivo'),
      });
      return saved;
    }
  }
  download(file);
  return true;
}

let jsPdfPromise = null;

/** Carrega o jsPDF só quando é preciso (o arquivo fica no cache offline). */
export function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  jsPdfPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/jspdf.umd.min.js';
    s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('Gerador de PDF inválido')));
    s.onerror = () => { jsPdfPromise = null; reject(new Error('Não foi possível carregar o gerador de PDF')); };
    document.head.append(s);
  });
  return jsPdfPromise;
}

/** Gera o PDF de erros e oferece para salvar. */
export async function exportReportPdf(fileName, report) {
  const JsPDF = await loadJsPDF();
  const doc = buildReport(JsPDF, { generatedAt: Date.now(), ...report });
  const file = new File([doc.output('blob')], fileName, { type: 'application/pdf' });
  return saveFile(file);
}
