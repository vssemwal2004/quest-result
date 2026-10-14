import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, Images, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { errorMessage } from '../../lib/errors'
import { Modal } from '../../ui/Modal'
import { FileDrop } from '../../ui/FileDrop'
import { Spinner } from '../../ui/Spinner'
import { MAX_BULK_PHOTOS, PHOTO_ACCEPT, formatBytes, photoProblem, rankFromFilename } from './photos'

interface Candidate {
  file: File
  rank: number | null
  problem: string | null
}

function toCandidate(file: File): Candidate {
  const rank = rankFromFilename(file.name)
  return { file, rank, problem: photoProblem(file) ?? (rank === null ? 'Name must be the rank, e.g. 17.jpg' : null) }
}

interface Result {
  matched: number
  unmatched: string[]
  skipped: string[]
}

export function BulkPhotosModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    if (open) {
      setCandidates([])
      setResult(null)
      setBusy(false)
    }
  }, [open])

  const valid = useMemo(() => candidates.filter((c) => !c.problem), [candidates])
  const invalid = candidates.length - valid.length

  const addFiles = (accepted: File[], rejected: File[]) => {
    setResult(null)
    setCandidates((prev) => {
      const byName = new Map(prev.map((c) => [c.file.name, c]))
      for (const f of [...accepted, ...rejected]) byName.set(f.name, toCandidate(f))
      return [...byName.values()].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    })
  }

  const upload = async () => {
    if (!valid.length || busy) return
    if (valid.length > MAX_BULK_PHOTOS) {
      toast.error(`Upload at most ${MAX_BULK_PHOTOS} photos at a time.`)
      return
    }
    setBusy(true)
    try {
      const res = await api.uploadPhotosByRank(valid.map((c) => c.file))
      setResult({ ...res, skipped: candidates.filter((c) => c.problem).map((c) => c.file.name) })
      setCandidates([])
      toast.success(`${res.matched} photo${res.matched === 1 ? '' : 's'} attached`)
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Bulk photos by rank"
      description="Name each file with the student's rank (17.jpg, 018.png …). Existing photos for those ranks are replaced."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button type="button" className="btn-gold px-5 py-2.5 text-sm" onClick={upload} disabled={busy || valid.length === 0}>
            {busy && <Spinner className="h-4 w-4" />}
            Upload {valid.length || ''} photo{valid.length === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <FileDrop
        accept={PHOTO_ACCEPT}
        multiple
        onFiles={addFiles}
        title="Drop photos here or browse"
        hint={`JPG, PNG or WebP · up to 5 MB each · max ${MAX_BULK_PHOTOS} files`}
        icon={Images}
        disabled={busy}
      />

      {result && (
        <div className="mt-5 space-y-3" role="status">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
            <CircleCheck className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
            <p className="text-sm text-emerald-100">
              <span className="font-bold">{result.matched}</span> photo{result.matched === 1 ? '' : 's'} matched to students.
            </p>
          </div>
          {result.unmatched.length + result.skipped.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                <TriangleAlert className="h-4 w-4" aria-hidden />
                {result.unmatched.length + result.skipped.length} not attached
              </p>
              <p className="mt-1 text-xs text-white/55">No student has that rank, or the file name/type was invalid.</p>
              <div className="mt-3 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {[...result.unmatched, ...result.skipped].map((n) => (
                  <span key={n} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-xs text-white/70">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-xs text-white/60">
            <span>
              {valid.length} ready{invalid > 0 && <span className="text-amber-200"> · {invalid} will be skipped</span>}
            </span>
            <button type="button" className="font-semibold text-white/70 hover:text-white" onClick={() => setCandidates([])} disabled={busy}>
              Clear all
            </button>
          </div>
          <ul className="max-h-64 divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/10 bg-navy-950/40">
            {candidates.map((c) => (
              <li key={c.file.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-12 shrink-0 font-tech text-xs text-cyan-glow">{c.rank !== null ? `#${c.rank}` : '—'}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/80">{c.file.name}</span>
                {c.problem ? (
                  <span className="shrink-0 text-xs text-amber-200">{c.problem}</span>
                ) : (
                  <span className="shrink-0 text-xs text-white/40">{formatBytes(c.file.size)}</span>
                )}
                <button
                  type="button"
                  className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white"
                  onClick={() => setCandidates((prev) => prev.filter((p) => p !== c))}
                  aria-label={`Remove ${c.file.name}`}
                  disabled={busy}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}
