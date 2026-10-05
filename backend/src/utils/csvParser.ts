/**
 * RFC 4180 Compliant CSV Parser & Stringifier
 * Handles quotes, commas inside quotes, multi-line values, and UTF-8 BOM.
 */

export interface ParsedCsvRow {
  rowNumber: number;
  data: Record<string, string>;
  raw: string[];
}

/**
 * Parse a raw CSV string or Buffer into array of rows.
 */
export function parseCsv(content: string | Buffer): { headers: string[]; rows: ParsedCsvRow[] } {
  let text = typeof content === 'string' ? content : content.toString('utf-8');

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const rawRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++; // skip next quote
      } else if (char === '"') {
        // Closing quote
        insideQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // Ignore \r if followed by \n
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rawRows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rawRows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push last remaining row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rawRows.push(currentRow);
    }
  }

  if (rawRows.length === 0) {
    return { headers: [], rows: [] };
  }

  // First row is headers
  const headers = rawRows[0].map((h) => h.trim());

  // Subsequent rows are data
  const rows: ParsedCsvRow[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const rawCols = rawRows[r];
    const rowObj: Record<string, string> = {};

    for (let c = 0; c < headers.length; c++) {
      const headerKey = headers[c];
      rowObj[headerKey] = rawCols[c] !== undefined ? rawCols[c].trim() : '';
    }

    rows.push({
      rowNumber: r + 1, // 1-indexed for human readability (header is row 1)
      data: rowObj,
      raw: rawCols,
    });
  }

  return { headers, rows };
}

/**
 * Escape a cell for CSV generation
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Build CSV string from headers and array of rows
 */
export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}
