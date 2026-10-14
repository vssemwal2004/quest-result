import path from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'
import ExcelJS from 'exceljs'
import { nanoid } from 'nanoid'
import { HttpError } from './errors.js'
import { MAX_RANK, studentCreateSchema } from './validation.js'

/** Normalised header text → student field. See SPEC "Import header matching". */
const HEADER_ALIASES = {
  rank: ['rank', 'position', 's no rank'],
  name: ['name', 'student name', 'student'],
  school: ['school', 'school name', 'institution'],
  city: ['city', 'location'],
  score: ['score', 'marks', 'points'],
}
const REQUIRED = ['rank', 'name', 'school']

const FRIENDLY = {
  rank: `Rank must be a whole number from 1 to ${MAX_RANK}`,
  name: 'Name is required (max 120 characters)',
  school: 'School is required (max 200 characters)',
  city: 'City must be at most 120 characters',
  score: 'Score must be a number',
}

const normalizeHeader = (h) =>
  String(h ?? '')
    .replace(/^﻿/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const ALIAS_LOOKUP = new Map(
  Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) => aliases.map((a) => [normalizeHeader(a), field])),
)

const collapse = (s) => s.replace(/\s+/g, ' ').trim()

/** Pick the delimiter used by the header line (Excel in some locales writes ";"). */
function detectDelimiter(text) {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1])
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

/** @returns {{ line: number, cells: string[] }[]} non-empty rows; line = spreadsheet row number */
function readCsv(buffer) {
  const text = buffer.toString('utf8')
  let records
  try {
    records = parseCsv(text, {
      bom: true,
      delimiter: detectDelimiter(text),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: false,
      trim: true,
    })
  } catch (err) {
    throw new HttpError(400, 'IMPORT_PARSE_ERROR', `Could not read the CSV file: ${err.message}`)
  }
  return records.map((cells, i) => ({ line: i + 1, cells: cells.map((c) => String(c ?? '').trim()) }))
}

/** Plain text of an ExcelJS cell value (rich text, formulas, hyperlinks, dates …). */
export function cellText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r) => r.text ?? '').join('')
    if ('formula' in value || 'sharedFormula' in value) return cellText(value.result)
    if ('error' in value) return ''
    if ('text' in value) return cellText(value.text)
  }
  return ''
}

async function readXlsx(buffer) {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new HttpError(
      400,
      'IMPORT_PARSE_ERROR',
      'Could not read the Excel file. Save it as "Excel Workbook (.xlsx)" or CSV and try again.',
    )
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new HttpError(400, 'IMPORT_PARSE_ERROR', 'The Excel file has no worksheets')
  const rows = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells = []
    for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value).trim())
    rows.push({ line: rowNumber, cells })
  })
  return rows
}

export async function readTable(buffer, filename) {
  const ext = path.extname(filename).toLowerCase()
  const rows = ext === '.xlsx' ? await readXlsx(buffer) : readCsv(buffer)
  return rows.filter((r) => r.cells.some((c) => c !== ''))
}

function mapHeader(cells) {
  const columns = {}
  cells.forEach((cell, i) => {
    const field = ALIAS_LOOKUP.get(normalizeHeader(cell))
    if (field && columns[field] === undefined) columns[field] = i
  })
  return columns
}

/**
 * Validate a table (first non-empty row = header).
 * @returns {{ rows: object[], errors: object[], validRows: object[], columns: Record<string, number> }}
 */
export function validateTable(table) {
  if (table.length === 0) {
    return { rows: [], errors: [{ line: 1, message: 'The file is empty' }], validRows: [], columns: {} }
  }
  const [header, ...data] = table
  const columns = mapHeader(header.cells)
  const missing = REQUIRED.filter((f) => columns[f] === undefined)
  if (missing.length) {
    const found = header.cells.filter(Boolean).join(', ') || 'nothing'
    return {
      rows: [],
      errors: [
        {
          line: header.line,
          message: `Missing required column(s): ${missing.join(', ')}. Expected headers rank, name, school (optional city, score); found: ${found}`,
        },
      ],
      validRows: [],
      columns,
    }
  }
  if (data.length === 0) {
    return { rows: [], errors: [{ line: header.line, message: 'The file has a header but no data rows' }], validRows: [], columns }
  }

  const rows = []
  const errors = []
  const validRows = []
  const firstLineForRank = new Map()

  for (const { line, cells } of data) {
    const raw = Object.fromEntries(
      Object.entries(columns).map(([field, i]) => [field, collapse(cells[i] ?? '')]),
    )
    const result = studentCreateSchema.safeParse(raw)
    const rowErrors = result.success
      ? []
      : [...new Set(result.error.issues.map((i) => String(i.path[0])))].map((field) => ({
          line,
          field,
          message: FRIENDLY[field] ?? 'Invalid value',
        }))

    const value = result.success ? result.data : null
    const rankParse = studentCreateSchema.shape.rank.safeParse(raw.rank)
    const rank = rankParse.success ? rankParse.data : null
    const scoreParse = studentCreateSchema.shape.score.safeParse(raw.score)

    if (rank !== null) {
      const first = firstLineForRank.get(rank)
      if (first !== undefined) {
        rowErrors.push({ line, field: 'rank', message: `Duplicate rank ${rank} (already used on line ${first})` })
      } else {
        firstLineForRank.set(rank, line)
      }
    }

    const row = {
      line,
      rank,
      name: value?.name ?? raw.name ?? '',
      school: value?.school ?? raw.school ?? '',
      city: value ? (value.city ?? null) : raw.city || null,
      score: scoreParse.success ? (scoreParse.data ?? null) : null,
    }
    rows.push(row)
    if (rowErrors.length) errors.push(...rowErrors)
    else validRows.push(row)
  }
  return { rows, errors, validRows, columns }
}

/**
 * Pure merge/replace planner.
 * merge: upsert by rank (photo kept). replace: additionally remove students whose rank is not in the file.
 * A column missing from the file (city/score) leaves existing values untouched.
 * @returns {{ students: object[], created: number, updated: number, removed: object[] }}
 */
export function planImport(currentStudents, validRows, { mode, columns, now = new Date().toISOString() }) {
  const fileRanks = new Set(validRows.map((r) => r.rank))
  const removed = mode === 'replace' ? currentStudents.filter((s) => !fileRanks.has(s.rank)) : []
  const byRank = new Map(
    currentStudents.filter((s) => mode === 'merge' || fileRanks.has(s.rank)).map((s) => [s.rank, s]),
  )
  let created = 0
  let updated = 0

  for (const row of validRows) {
    const next = { name: row.name, school: row.school }
    if (columns.city !== undefined) next.city = row.city
    if (columns.score !== undefined) next.score = row.score
    const existing = byRank.get(row.rank)
    if (!existing) {
      created++
      byRank.set(row.rank, {
        id: nanoid(12),
        rank: row.rank,
        city: null,
        score: null,
        photoUrl: null,
        ...next,
        createdAt: now,
        updatedAt: now,
      })
      continue
    }
    const changed = Object.entries(next).some(([k, v]) => existing[k] !== v)
    if (changed) {
      updated++
      byRank.set(row.rank, { ...existing, ...next, updatedAt: now })
    }
  }
  const students = [...byRank.values()].sort((a, b) => a.rank - b.rank)
  return { students, created, updated, removed }
}
