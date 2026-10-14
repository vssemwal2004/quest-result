export const PHOTO_ACCEPT = '.jpg,.jpeg,.png,.webp'
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_BULK_PHOTOS = 250

/** Returns a reason the photo would be rejected by the server, or null when it is fine. */
export function photoProblem(file: File): string | null {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return 'Use JPG, PNG or WebP'
  if (file.size > MAX_PHOTO_BYTES) return 'Larger than 5 MB'
  return null
}

/** "17.jpg" / "017.PNG" -> 17; anything else -> null (bulk upload matches photos by rank). */
export function rankFromFilename(name: string): number | null {
  const m = /^0*(\d+)\.(jpe?g|png|webp)$/i.exec(name.trim())
  if (!m) return null
  const rank = Number(m[1])
  return rank >= 1 ? rank : null
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
