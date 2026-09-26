// Leitura de texto delimitado (CSV, TSV, "|") e decodificação de arquivos.

/**
 * Divide o texto em linhas e campos. Aspas seguem a RFC 4180 (aspas duplicadas
 * dentro do campo, quebras de linha permitidas), mas o parser é tolerante: uma
 * aspa no começo do campo só abre um campo entre aspas se o fechamento for
 * seguido de separador ou fim de linha. Caso contrário, o campo é lido literalmente.
 * @returns {string[][]}
 */
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let i = 0;
  const n = text.length;

  const endRow = () => { rows.push(row); row = []; };

  while (i <= n) {
    if (i === n) { // fim do texto
      if (row.length) { row.push(''); endRow(); }
      break;
    }
    let field = '';
    // Espaços antes da aspa de abertura são comuns em arquivos com " | "
    let k = i;
    while (text[k] === ' ') k++;
    if (text[k] === '"') {
      const q = readQuoted(text, k + 1, delimiter);
      if (q) {
        field = q.value;
        i = q.end;
      } else {
        [field, i] = readPlain(text, i, delimiter);
      }
    } else {
      [field, i] = readPlain(text, i, delimiter);
    }
    row.push(field);
    // i aponta para separador, quebra de linha ou fim
    if (i >= n) { endRow(); break; }
    const ch = text[i];
    if (ch === delimiter) {
      i++;
      if (i === n) { row.push(''); endRow(); break; }
    } else if (ch === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      endRow();
    } else if (ch === '\n') {
      i++;
      endRow();
    }
  }
  return rows;
}

function readPlain(text, i, delimiter) {
  let j = i;
  while (j < text.length) {
    const ch = text[j];
    if (ch === delimiter || ch === '\n' || ch === '\r') break;
    j++;
  }
  return [text.slice(i, j), j];
}

function readQuoted(text, i, delimiter) {
  let value = '';
  let j = i;
  while (j < text.length) {
    const ch = text[j];
    if (ch === '"') {
      if (text[j + 1] === '"') { value += '"'; j += 2; continue; }
      let k = j + 1;
      while (text[k] === ' ') k++; // espaços depois da aspa de fechamento
      const next = text[k];
      if (next === undefined || next === delimiter || next === '\n' || next === '\r') {
        return { value, end: k };
      }
      return null; // aspa solta no meio: não é um campo entre aspas
    }
    value += ch;
    j++;
  }
  return null; // sem fechamento
}

/** Decodifica um arquivo: UTF-8, com recurso a Windows-1252 se aparecerem caracteres inválidos. */
export function decodeBytes(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(buf);
  } catch {
    return utf8;
  }
}
