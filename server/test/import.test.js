import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import ExcelJS from 'exceljs'
import { addStudents, fileForm, startServer, student, TINY_PNG } from './helpers/server.js'

let srv
let token
before(async () => {
  srv = await startServer()
  token = await srv.login()
})
after(() => srv.close())

const api = (method, route, opts = {}) => srv.request(method, route, { ...opts, token })
const students = async () => (await api('GET', '/api/admin/students')).body.students

function importFile(name, content, { mode = 'merge', dryRun = false } = {}) {
  return api('POST', '/api/admin/students/import', {
    form: fileForm('file', [[name, content]], { mode, dryRun: String(dryRun) }),
  })
}

beforeEach(async () => {
  await api('DELETE', '/api/admin/students', { json: { confirm: 'DELETE ALL' } })
})

const VALID_CSV = [
  'rank,name,school,city,score',
  '1,Aarav Sharma,Pine Valley School,Dehradun,98.5',
  '2,"Negi, Diya",Cedar School,,97',
  '3,Kabir   Rawat,Oak School,Roorkee,',
].join('\n')

describe('CSV import', () => {
  it('dry run previews without writing', async () => {
    const res = await importFile('winners.csv', VALID_CSV, { dryRun: true })
    assert.equal(res.status, 200)
    assert.equal(res.body.committed, false)
    assert.deepEqual(res.body.summary, { total: 3, valid: 3, invalid: 0, created: 3, updated: 0, removed: 0 })
    assert.deepEqual(res.body.rows[1], {
      line: 3,
      rank: 2,
      name: 'Negi, Diya',
      school: 'Cedar School',
      city: null,
      score: 97,
    })
    assert.equal(res.body.rows[2].name, 'Kabir Rawat', 'inner whitespace collapsed')
    assert.deepEqual(await students(), [])
  })

  it('merge upserts by rank and keeps photos', async () => {
    const [existing] = await addStudents(api, null, [student(1, { city: 'Old City' }), student(50)])
    await api('POST', `/api/admin/students/${existing.id}/photo`, {
      form: fileForm('photo', [['p.png', TINY_PNG, 'image/png']]),
    })

    const res = await importFile('w.csv', VALID_CSV)
    assert.equal(res.status, 200)
    assert.equal(res.body.committed, true)
    assert.deepEqual(res.body.summary, { total: 3, valid: 3, invalid: 0, created: 2, updated: 1, removed: 0 })

    const list = await students()
    assert.deepEqual(
      list.map((s) => s.rank),
      [1, 2, 3, 50],
    )
    assert.equal(list[0].id, existing.id)
    assert.equal(list[0].name, 'Aarav Sharma')
    assert.equal(list[0].city, 'Dehradun')
    assert.ok(list[0].photoUrl, 'photo kept on merge')

    const again = await importFile('w.csv', VALID_CSV)
    assert.deepEqual(again.body.summary, { total: 3, valid: 3, invalid: 0, created: 0, updated: 0, removed: 0 })
  })

  it('replace removes students that are not in the file', async () => {
    await addStudents(api, null, [student(2), student(7), student(8)])
    const preview = await importFile('w.csv', VALID_CSV, { mode: 'replace', dryRun: true })
    assert.deepEqual(preview.body.summary, { total: 3, valid: 3, invalid: 0, created: 2, updated: 1, removed: 2 })
    assert.equal((await students()).length, 3, 'dry run wrote nothing')

    const res = await importFile('w.csv', VALID_CSV, { mode: 'replace' })
    assert.equal(res.body.committed, true)
    assert.deepEqual(
      (await students()).map((s) => s.rank),
      [1, 2, 3],
    )
  })

  it('reports invalid rows with line numbers and refuses to commit (IMPORT_INVALID)', async () => {
    const csv = [
      'Rank,Name,School',
      '1,Asha,School A',
      '',
      'x,Bad Rank,School B',
      '4,,School C',
      '1,Dup,School D',
      '5,Ok,',
    ].join('\r\n')
    const dry = await importFile('bad.csv', csv, { dryRun: true })
    assert.equal(dry.status, 200)
    assert.deepEqual(
      dry.body.errors.map((e) => [e.line, e.field]),
      [
        [4, 'rank'],
        [5, 'name'],
        [6, 'rank'],
        [7, 'school'],
      ],
    )
    assert.match(dry.body.errors[2].message, /Duplicate rank 1 .*line 2/)
    assert.deepEqual(
      { total: dry.body.summary.total, valid: dry.body.summary.valid, invalid: dry.body.summary.invalid },
      { total: 5, valid: 1, invalid: 4 },
    )
    assert.equal(dry.body.rows[1].rank, null)

    const commit = await importFile('bad.csv', csv)
    assert.equal(commit.status, 400)
    assert.equal(commit.body.error.code, 'IMPORT_INVALID')
    assert.equal(commit.body.committed, false)
    assert.equal(commit.body.errors.length, 4)
    assert.equal(commit.body.error.details.errors.length, 4)
    assert.deepEqual(await students(), [])
  })

  it('accepts header aliases, BOM and semicolon-separated files', async () => {
    const csv = '﻿S.No Rank;Student Name;Institution;Location;Marks\n10;Meher Joshi;Lotus Academy;Almora;77,5\n'
    const res = await importFile('alias.csv', csv, { dryRun: true })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.rows[0].rank, 10)
    assert.equal(res.body.rows[0].city, 'Almora')
    // "77,5" is not a valid number — reported, not silently mangled.
    assert.deepEqual(
      res.body.errors.map((e) => e.field),
      ['score'],
    )

    const positional = 'position,student,school name,city,points\n11,Ira,Oak,,12\n'
    const ok = await importFile('p.csv', positional)
    assert.equal(ok.body.committed, true)
    assert.equal((await students())[0].score, 12)
  })

  it('leaves city/score untouched when those columns are absent', async () => {
    await addStudents(api, null, [student(1, { city: 'Keep', score: 50 })])
    await importFile('w.csv', 'rank,name,school\n1,New Name,New School\n')
    const [s] = await students()
    assert.deepEqual([s.name, s.city, s.score], ['New Name', 'Keep', 50])
  })

  it('reports missing required columns and empty files', async () => {
    const missing = await importFile('m.csv', 'rank,student name\n1,A\n', { dryRun: true })
    assert.equal(missing.status, 200)
    assert.match(missing.body.errors[0].message, /Missing required column\(s\): school/)

    const empty = await importFile('e.csv', '\n\n', { dryRun: true })
    assert.match(empty.body.errors[0].message, /empty/)

    const commit = await importFile('m.csv', 'rank,student name\n1,A\n')
    assert.equal(commit.status, 400)
    assert.equal(commit.body.error.code, 'IMPORT_INVALID')
  })

  it('rejects unsupported files and missing uploads', async () => {
    const txt = await importFile('w.txt', VALID_CSV)
    assert.equal(txt.status, 400)
    assert.equal(txt.body.error.code, 'UNSUPPORTED_FILE')

    const none = await api('POST', '/api/admin/students/import', { form: fileForm('file', [], { dryRun: 'true' }) })
    assert.equal(none.status, 400)
    assert.equal(none.body.error.code, 'NO_FILE')

    const badMode = await importFile('w.csv', VALID_CSV, { mode: 'append' })
    assert.equal(badMode.status, 400)
  })
})

describe('XLSX import', () => {
  async function workbookBuffer() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Winners')
    ws.addRow(['Rank', 'Student Name', 'School Name', 'City', 'Score'])
    ws.addRow([1, { richText: [{ text: 'Ananya ' }, { font: { bold: true }, text: 'Bisht' }] }, 'Maple Academy', 'Dehradun', 99])
    ws.addRow([2, 'Rohan Pant', { text: 'Link School', hyperlink: 'https://example.com' }, null, { formula: '90+5', result: 95 }])
    ws.addRow([]) // blank spreadsheet row 4
    ws.addRow([3, 'Tanvi Rana', 'Cedar School', { formula: 'UPPER("x")', result: 'Haridwar' }, 90.25])
    ws.addRow([3, 'Duplicate', 'Cedar School'])
    wb.addWorksheet('Ignored').addRow(['rank', 'name', 'school'])
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  it('reads the first worksheet, rich text, hyperlinks and formula results with row numbers', async () => {
    const buf = await workbookBuffer()
    const res = await importFile('winners.xlsx', buf, { dryRun: true })
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.body.rows.map((r) => [r.line, r.rank, r.name, r.school, r.city, r.score]),
      [
        [2, 1, 'Ananya Bisht', 'Maple Academy', 'Dehradun', 99],
        [3, 2, 'Rohan Pant', 'Link School', null, 95],
        [5, 3, 'Tanvi Rana', 'Cedar School', 'Haridwar', 90.25],
        [6, 3, 'Duplicate', 'Cedar School', null, null],
      ],
    )
    assert.deepEqual(
      res.body.errors.map((e) => [e.line, e.field]),
      [[6, 'rank']],
    )
  })

  it('commits a valid workbook', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('S')
    ws.addRow(['rank', 'name', 'school'])
    for (let r = 1; r <= 200; r++) ws.addRow([r, `Student ${r}`, `School ${r % 9}`])
    const res = await importFile('all.xlsx', Buffer.from(await wb.xlsx.writeBuffer()), { mode: 'replace' })
    assert.equal(res.status, 200)
    assert.equal(res.body.summary.created, 200)
    assert.equal((await students()).length, 200)
  })

  it('gives a clear error for a broken workbook', async () => {
    const res = await importFile('broken.xlsx', Buffer.from('definitely not a zip'), { dryRun: true })
    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'IMPORT_PARSE_ERROR')
  })
})
