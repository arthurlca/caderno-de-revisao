// Formatação de tempo e datas em pt-BR.

const pad = (n) => String(n).padStart(2, '0');

/** Cronômetro: 0:07, 12:34, 1:02:03. */
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Duração por extenso: 45 s, 4 min 12 s, 1 h 05 min. */
export function duration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h} h ${pad(m)} min`;
  return sec ? `${m} min ${pad(sec)} s` : `${m} min`;
}

export function dateTime(ts) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function shortDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** AAAA-MM-DD no fuso local (para nomes de arquivo). */
export function isoDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Nome de arquivo seguro, sem acentos. */
export function slug(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'caderno';
}

export function plural(n, one, many) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}
