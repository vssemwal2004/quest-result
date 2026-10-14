import { Router } from 'express'
import { deleteFile } from '../db/files.js'
import { asyncHandler } from '../errors.js'
import { parse, settingsUpdateSchema } from '../validation.js'

export function settingsRoutes({ repo, uploads, changed }) {
  const router = Router()

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.set('Cache-Control', 'no-store').json({ settings: await repo.settings.get() })
    }),
  )

  router.put(
    '/',
    asyncHandler(async (req, res) => {
      const patch = parse(settingsUpdateSchema, req.body)
      const settings = await repo.settings.update(patch)
      await changed()
      res.json({ settings })
    }),
  )

  router.post(
    '/logo',
    uploads.logoSingle,
    asyncHandler(async (req, res) => {
      const fileId = uploads.storedFileId(req.file, 'logo', 'logo')
      let settings
      try {
        settings = await repo.settings.setLogo(fileId) // deletes the previous logo file
      } catch (err) {
        await deleteFile(fileId).catch(() => {})
        throw err
      }
      await changed()
      res.json({ settings })
    }),
  )

  router.delete(
    '/logo',
    asyncHandler(async (_req, res) => {
      const hadLogo = Boolean((await repo.settings.get()).logoUrl)
      const settings = await repo.settings.removeLogo()
      if (hadLogo) await changed()
      res.json({ settings })
    }),
  )

  return router
}
