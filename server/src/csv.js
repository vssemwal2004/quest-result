const BOM = '﻿'

/** Neutralise spreadsheet formula injection (=, +, -, @ …) in free-text cells. */
export function safeText(value) {
  const s = value ?? ''
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * RFC 4180 CSV with CRLF line endings and a UTF-8 BOM so Excel opens
 * non-ASCII text (₹, Hindi names) correctly.
 * @param {string[]} header
 * @param {unknown[][]} rows
 */
export function toCsv(header, rows) {
  const lines = [header, ...rows].map((r) => r.map(escapeCell).join(','))
  return BOM + lines.join('\r\n') + '\r\n'
}

export function sendCsv(res, filename, csv) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  })
  res.send(csv)
}
