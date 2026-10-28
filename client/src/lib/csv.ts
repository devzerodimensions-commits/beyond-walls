/**
 * A small CSV reader, for spreadsheets the studio exports and sends back.
 *
 * Nothing here guesses. Excel and Google Sheets both write the same dialect —
 * comma separated, a field containing a comma, a quote or a newline wrapped in
 * double quotes, and a literal quote doubled inside — and that is exactly what
 * this reads. Anything cleverer (semicolons, tabs, a chosen encoding) belongs
 * in a library, and this file exists so that one is not needed for the two
 * columns-in, columns-out jobs the admin has.
 */

/** Splits CSV text into rows of raw cells. */
export function parseCsv(text: string): string[][] {
  // A BOM is what Excel writes, and left in place it becomes part of the first
  // header, so "SKU" silently stops matching.
  const input = text.replace(/^﻿/, '');

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        // A doubled quote is one literal quote; a single one closes the field.
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      // \r\n is one break, not two.
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  // Whatever was in hand when the text ran out, unless the file simply ended
  // with a newline and there is nothing to add.
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((value) => value.trim() !== ''));
}

/**
 * Reads a CSV into objects keyed by the column names given.
 *
 * Headers are matched loosely — case and spacing are ignored — because a
 * spreadsheet that has been through someone's hands rarely comes back with
 * "compareAtPrice" spelled the way the code spells it. Columns the map does
 * not mention are carried over untouched and ignored by the server, so a file
 * can hold notes of its own without being rejected.
 */
export function readCsvRows<T extends Record<string, string>>(
  text: string,
  columnMap: T,
): { rows: Record<string, string>[]; headers: string[]; missing: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], headers: [], missing: Object.values(columnMap) };

  const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '');

  const headers = table[0].map((h) => h.trim());
  const lookup = new Map(headers.map((header, index) => [normalise(header), index]));

  const missing = Object.entries(columnMap)
    .filter(([, header]) => !lookup.has(normalise(header)))
    .map(([, header]) => header);

  const rows = table.slice(1).map((cells) => {
    const out: Record<string, string> = {};
    for (const [field, header] of Object.entries(columnMap)) {
      const index = lookup.get(normalise(header));
      out[field] = index === undefined ? '' : (cells[index] ?? '').trim();
    }
    return out;
  });

  return { rows, headers, missing };
}
