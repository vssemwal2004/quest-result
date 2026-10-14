import { Router } from 'express'
import { safeText, sendCsv, toCsv } from '../csv.js'
import { deleteFiles } from '../db/files.js'
import { asyncHandler, HttpError, notFound } from '../errors.js'
import { planImport, readTable, validateTable } from '../importer.js'
import {
  deleteAllSchema,
  importOptionsSchema,
  OBJECT_ID_RE,
  parse,
  studentCreateBody,
  studentQuerySchema,
  studentUpdateBody,
} from '../validation.js'

const CSV_HEADER = ['rank', 'name', 'school', 'city', 'score']
const TEMPLATE_ROWS = [
  [1, 'Aarav Sharma', 'Sample Public School', 'Dehradun', 98.5],
  [2, 'Diya Negi', 'Example Senior Secondary School', 'Haridwar', 97],
  [3, 'Kabir Rawat', 'Demo Convent School', '', ''],
]

export function studentRoutes({ repo, uploads, changed }) {
  const router = Router()

  // Malformed ids can never exist: 404 straight away (never a CastError 500).
  router.param('id', (_req, _res, next, id) => (OBJECT_ID_RE.test(id) ? next() : next(notFound('Student'))))

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { q } = parse(studentQuerySchema, req.query)
      res.set('Cache-Control', 'no-store').json({ students: await repo.students.list(q?.trim() ?? '') })
    }),
  )

  router.get('/template.csv', (_req, res) => {
    sendCsv(res, 'ai-quest-results-template.csv', toCsv(CSV_HEADER, TEMPLATE_ROWS))
  })

  router.get(
    '/export.csv',
    asyncHandler(async (_req, res) => {
      const rows = (await repo.students.list()).map((s) => [s.rank, safeText(s.name), safeText(s.school), safeText(s.city), s.score])
      sendCsv(res, 'ai-quest-results.csv', toCsv(CSV_HEADER, rows))
    }),
  )

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parse(studentCreateBody, req.body)
      const student = await repo.students.create(input) // 409 RANK_TAKEN from the unique index
      await changed()
      res.status(201).json({ student })
    }),
  )

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const input = parse(studentUpdateBody, req.body)
      const student = await repo.students.update(req.params.id, input)
      await changed()
      res.json({ student })
    }),
  )

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      await repo.students.delete(req.params.id) // also deletes the photo file
      await changed()
      res.json({ ok: true })
    }),
  )

  router.delete(
    '/',
    asyncHandler(async (req, res) => {
      parse(deleteAllSchema, req.body)
      const deleted = await repo.students.deleteAll()
      if (deleted > 0) await changed()
      res.json({ ok: true, deleted })
    }),
  )

  router.post(
    '/photos',
    // Ranks are loaded first so the storage engine only stores files that match a student.
    asyncHandler(async (req, _res, next) => {
      req.photoRanks = new Set(await repo.students.listRanks())
      next()
    }),
    uploads.photosMany,
    asyncHandler(async (req, res) => {
      const files = [...(req.files?.photos ?? []), ...(req.files?.['photos[]'] ?? [])]
      if (files.length === 0) throw new HttpError(400, 'NO_FILE', 'Choose one or more photos named by rank, e.g. 17.jpg')

      const assignments = new Map() // rank -> GridFS file id (first valid file per rank wins)
      const unmatched = []
      const duplicates = []
      for (const file of files) {
        if (file.fileId && !assignments.has(file.rank)) {
          assignments.set(file.rank, file.fileId)
          continue
        }
        if (file.fileId) duplicates.push(file.fileId)
        unmatched.push(file.originalname)
      }
      await deleteFiles(duplicates)
      if (assignments.size === 0) return res.json({ matched: 0, unmatched })

      let result
      try {
        // Replaced photos and files whose student was deleted meanwhile are removed by the repository.
        result = await repo.students.assignPhotosByRank(assignments)
      } catch (err) {
        await deleteFiles(assignments.values()).catch(() => {})
        throw err
      }
      await changed()
      res.json({ matched: result.matched, unmatched })
    }),
  )

  router.post(
    '/import',
    uploads.importSingle,
    asyncHandler(async (req, res) => {
      if (!req.file) throw new HttpError(400, 'NO_FILE', 'Choose a .csv or .xlsx file to import')
      const { mode, dryRun } = parse(importOptionsSchema, req.body)
      const table = await readTable(req.file.buffer, req.file.originalname)
      const { rows, errors, validRows, columns } = validateTable(table)
      const plan = planImport(await repo.students.list(), validRows, { mode, columns })
      const invalidLines = new Set(errors.map((e) => e.line))
      const result = {
        rows,
        errors,
        summary: {
          total: rows.length,
          valid: validRows.length,
          invalid: rows.length ? invalidLines.size : 0,
          created: plan.created,
          updated: plan.updated,
          removed: plan.removed.length,
        },
        committed: false,
      }

      if (dryRun) return res.json(result)
      if (errors.length) {
        const message = `Nothing was imported: ${errors.length} problem(s) found. Fix the file and try again.`
        return res.status(400).json({ ...result, error: { code: 'IMPORT_INVALID', message, details: result } })
      }

      // Re-planned against the latest data inside the repository (transaction when supported).
      const committed = await repo.students.upsertManyByRank(validRows, { mode, columns })
      await changed()
      res.json({
        ...result,
        summary: {
          ...result.summary,
          created: committed.created,
          updated: committed.updated,
          removed: committed.removed.length,
        },
        committed: true,
      })
    }),
  )

  router.post(
    '/:id/photo',
    asyncHandler(async (req, _res, next) => {
      if (!(await repo.students.get(req.params.id))) throw notFound('Student')
      next()
    }),
    uploads.photoSingle,
    asyncHandler(async (req, res) => {
      const fileId = uploads.storedFileId(req.file, 'photo', 'photo')
      // Deletes the previous photo; if the student vanished meanwhile, deletes the new file and 404s.
      const student = await repo.students.setPhoto(req.params.id, fileId)
      await changed()
      res.json({ student })
    }),
  )

  router.delete(
    '/:id/photo',
    asyncHandler(async (req, res) => {
      const student = await repo.students.removePhoto(req.params.id)
      await changed()
      res.json({ student })
    }),
  )

  return router
}
