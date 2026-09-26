/**
 * CSV for Swedish Excel: semicolon separators (comma is the decimal mark in
 * sv-SE), CRLF line endings and a UTF-8 BOM so å/ä/ö survive.
 * Cells that start with = + - @ or a tab/CR are prefixed with ' so a
 * visitor's form text can never run as a spreadsheet formula.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(";"));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
