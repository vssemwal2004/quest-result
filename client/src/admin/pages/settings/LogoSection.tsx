import { useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Settings } from '@/types'
import { errorMessage } from '../../lib/errors'
import { Panel } from '../../ui/Panel'
import { FileDrop } from '../../ui/FileDrop'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Spinner } from '../../ui/Spinner'

const LOGO_ACCEPT = '.png,.jpg,.jpeg,.webp,.svg'
const MAX_LOGO_BYTES = 3 * 1024 * 1024

/** Logo changes are saved immediately (independent of the branding form's Save button). */
export function LogoSection({ logoUrl, onSaved }: { logoUrl: string | null; onSaved: (settings: Settings) => void }) {
  const [uploading, setUploading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const upload = async (files: File[], rejected: File[]) => {
    const file = files[0]
    if (!file) {
      if (rejected.length) toast.error('Use a PNG, JPG, WebP or SVG image.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) return toast.error('The logo must be 3 MB or smaller.')
    setUploading(true)
    try {
      const res = await api.uploadLogo(file)
      onSaved(res.settings)
      toast.success('Logo updated')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Panel title="Logo" description="Shown at the top of the big screen. Transparent PNG or SVG looks best.">
      <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl border border-white/10 bg-quest-gradient p-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Current logo" className="max-h-full max-w-full object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,.4)]" />
          ) : (
            <span className="text-sm text-white/45">No logo</span>
          )}
          {uploading && (
            <span className="absolute inset-0 grid place-items-center bg-navy-950/70">
              <Spinner className="h-6 w-6 text-cyan-glow" label="Uploading logo" />
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <FileDrop
            accept={LOGO_ACCEPT}
            onFiles={upload}
            title={logoUrl ? 'Replace logo' : 'Upload logo'}
            hint="PNG, JPG, WebP or SVG · up to 3 MB"
            icon={ImagePlus}
            compact
            disabled={uploading}
          />
          {logoUrl && (
            <button type="button" className="btn-danger self-start text-sm" onClick={() => setConfirmRemove(true)} disabled={uploading}>
              <Trash2 className="h-4 w-4" aria-hidden /> Remove logo
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove the logo?"
        message="The big screen will show the event title without a logo."
        confirmLabel="Remove"
        onConfirm={async () => {
          const res = await api.deleteLogo()
          onSaved(res.settings)
          toast.success('Logo removed')
        }}
      />
    </Panel>
  )
}
