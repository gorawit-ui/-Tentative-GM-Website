// A10 — RFC 4180 CSV for the people import, read in the browser (the file never goes to the API and
// is not kept): quoted cells with commas, doubled quotes and line breaks, CRLF or LF, a leading BOM
// (Excel / Google Sheets exports); blank lines are skipped. A quote left open is an error, not a guess.

export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  const endRow = () => {
    row.push(cell);
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
    cell = '';
  };
  while (index < source.length) {
    const char = source[index] as string;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
      } else {
        cell += char;
      }
      index += 1;
      continue;
    }
    if (char === '"' && cell === '') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && source[index + 1] === '\n') {
      endRow();
      index += 1;
    } else if (char === '\n' || char === '\r') endRow();
    else cell += char;
    index += 1;
  }
  if (quoted) throw new SyntaxError('CSV: a quoted cell is never closed');
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
