// Robust CSV export helper shared by the seller/admin list pages.
//
// Fixes the common "the spreadsheet appears to be corrupted" failures:
//   1. SYLK misdetection — Excel treats any file whose first two bytes are the
//      literal characters "ID" as an old SYLK spreadsheet and refuses to open it.
//      Quoting every field means the data starts with a `"` instead, avoiding this.
//   2. Encoding — a real UTF-8 BOM (﻿) so Excel renders ₹ and other glyphs.
//   3. Line endings — CRLF (\r\n), which Excel parses most reliably.
//   4. Escaping — every value is wrapped in quotes with internal quotes doubled,
//      so commas, quotes, and newlines inside a value never break the columns.

const escapeCell = (value: unknown): string => {
  const str = value === null || value === undefined ? "" : String(value);
  // Always quote, doubling any embedded quotes.
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Build a CSV string and trigger a download.
 *
 * @param headers Column headers, in order.
 * @param rows    Each row is an array of cell values aligned to `headers`.
 * @param filename File name WITHOUT extension (a dated .csv is appended).
 */
export const exportToCsv = (
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string,
): void => {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];
  // UTF-8 BOM + CRLF line endings for maximum spreadsheet compatibility.
  const csv = "﻿" + lines.join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
