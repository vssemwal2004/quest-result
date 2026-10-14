import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, CircleCheck, Download, FileSpreadsheet, GitMerge, RefreshCcw, TriangleAlert, Upload, X, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { ImportResult } from '@/types'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { errorMessage, isApiError } from '../../lib/errors'
import { PageHeader, Panel } from '../../ui/Panel'
import { FileDrop } from '../../ui/FileDrop'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { Spinner } from '../../ui/Spinner'
import { formatBytes } from '../results/photos'
import { ImportRowsTable, ImportSummary, SummaryChip } from './ImportReview'

type Mode = 'merge' | 'replace'
type Step = 'choose' | 'review' | 'done'

const STEPS: Array<{ key: Step; label: string }> = [
  { key: 'choose', label: 'Choose file' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
]

const COLUMNS = [
  { name: 'rank', required: true, aliases: 'position' },
  { name: 'name', required: true, aliases: 'student name, student' },
  { name: 'school', required: true, aliases: 'school name, institution' },
  { name: 'city', required: false, aliases: 'location' },
  { name: 'score', required: false, aliases: 'marks, points' },
]

function isImportResult(x: unknown): x is ImportResult {
  return typeof x === 'object' && x !== null && Array.isArray((x as ImportResult).rows) && Array.isArray((x as ImportResult).errors)
}

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.key === current)
  return (
    <ol className="mb-6 flex items-center gap-2 sm:gap-4" aria-label="Import progress">
      {STEPS.map((s, i) => {
        const done = i < index
        const active = i === index
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2 sm:gap-3 last:flex-none" aria-current={active ? 'step' : undefined}>
            <span
              className={clsx(
                'grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-bold transition',
                done && 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300',
                active && 'border-gold-400 bg-gold-400 text-navy-900 shadow-glow-gold',
                !done && !active && 'border-white/15 text-white/40',
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </span>
            <span className={clsx('whitespace-nowrap text-sm font-semibold', active ? 'text-white' : 'text-white/50')}>{s.label}</span>
            {i < STEPS.length - 1 && <span className={clsx('h-px flex-1', done ? 'bg-emerald-400/50' : 'bg-white/10')} aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

function ModeOption({
  value,
  current,
  onSelect,
  title,
  description,
  icon: Icon,
  danger,
}: {
  value: Mode
  current: Mode
  onSelect: (m: Mode) => void
  title: string
  description: string
  icon: LucideIcon
  danger?: boolean
}) {
  const active = value === current
  return (
    <label
      className={clsx(
        'flex cursor-pointer gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-cyan-glow/60',
        active
          ? danger
            ? 'border-red-400/70 bg-red-500/10 shadow-[0_0_24px_rgba(239,68,68,.25)]'
            : 'border-cyan-glow/60 bg-cyan-glow/[0.08] shadow-glow'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25',
      )}
    >
      <input type="radio" name="import-mode" value={value} checked={active} onChange={() => onSelect(value)} className="sr-only" />
      <span
        className={clsx(
          'grid h-10 w-10 shrink-0 place-items-center rounded-xl border',
          danger ? 'border-red-400/40 bg-red-500/10 text-red-300' : 'border-cyan-glow/30 bg-cyan-glow/10 text-cyan-glow',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className={clsx('flex items-center gap-2 font-semibold', danger ? 'text-red-200' : 'text-white')}>
          {title}
          {active && <Check className="h-4 w-4" aria-hidden />}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-white/60">{description}</span>
      </span>
    </label>
  )
}

export function ImportPage() {
  useDocumentTitle('Import')
  const [step, setStep] = useState<Step>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('merge')
  const [checking, setChecking] = useState(false)
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [committed, setCommitted] = useState<ImportResult | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const pickFile = (accepted: File[], rejected: File[]) => {
    if (accepted[0]) setFile(accepted[0])
    else if (rejected.length) toast.error('Choose a .csv or .xlsx file.')
  }

  const downloadTemplate = async () => {
    setDownloading(true)
    try {
      await api.downloadTemplate()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDownloading(false)
    }
  }

  const check = async () => {
    if (!file) return
    setChecking(true)
    try {
      setPreview(await api.importStudents(file, mode, true))
      setStep('review')
    } catch (err) {
      // A file with invalid rows may come back as an error carrying the same body shape.
      if (isApiError(err) && isImportResult(err.details)) {
        setPreview(err.details)
        setStep('review')
      } else toast.error(errorMessage(err, 'Could not read that file.'))
    } finally {
      setChecking(false)
    }
  }

  const commit = async () => {
    if (!file) return
    try {
      const result = await api.importStudents(file, mode, false)
      setCommitted(result)
      setStep('done')
      toast.success('Import complete')
    } catch (err) {
      if (isApiError(err, 'IMPORT_INVALID') && isImportResult(err.details)) {
        setPreview(err.details)
        toast.error('The file has invalid rows — nothing was imported.')
        return
      }
      throw err
    }
  }

  const reset = () => {
    setStep('choose')
    setFile(null)
    setPreview(null)
    setCommitted(null)
  }

  const hasErrors = (preview?.errors.length ?? 0) > 0
  const willRemove = mode === 'replace' ? preview?.summary.removed ?? 0 : 0

  return (
    <>
      <PageHeader
        title="Import results"
        description="Upload the full winners list from a spreadsheet. You will see a preview before anything is saved."
      />
      <Stepper current={step} />

      {step === 'choose' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <Panel title="1 · Get the template" description="Columns are matched by header name (case-insensitive).">
            <button type="button" className="btn-blue" onClick={downloadTemplate} disabled={downloading}>
              {downloading ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" aria-hidden />}
              Download CSV template
            </button>
            <table className="mt-5 w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-white/45">
                  <th scope="col" className="pb-2 font-semibold">Column</th>
                  <th scope="col" className="pb-2 font-semibold">Also accepted</th>
                </tr>
              </thead>
              <tbody>
                {COLUMNS.map((c) => (
                  <tr key={c.name} className="border-t border-white/5">
                    <td className="py-2 pr-3">
                      <span className="font-mono text-cyan-glow">{c.name}</span>
                      {c.required ? (
                        <span className="ml-2 text-[10px] font-bold uppercase text-gold-300">required</span>
                      ) : (
                        <span className="ml-2 text-[10px] uppercase text-white/40">optional</span>
                      )}
                    </td>
                    <td className="py-2 text-white/55">{c.aliases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs leading-relaxed text-white/45">
              Ranks must be unique whole numbers. Photos are added separately on the Results page (Bulk photos by rank).
            </p>
          </Panel>

          <Panel title="2 · Upload & choose how to apply it">
            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-cyan-glow/30 bg-cyan-glow/[0.06] p-4">
                <FileSpreadsheet className="h-8 w-8 shrink-0 text-cyan-glow" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-white">{file.name}</p>
                  <p className="text-xs text-white/50">{formatBytes(file.size)}</p>
                </div>
                <button type="button" className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white" onClick={() => setFile(null)} aria-label="Remove file">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <FileDrop accept=".csv,.xlsx" onFiles={pickFile} title="Drop your .csv or .xlsx here, or browse" hint="First sheet is used for Excel files" icon={Upload} />
            )}

            <fieldset className="mt-5">
              <legend className="label">Import mode</legend>
              <div className="grid gap-3">
                <ModeOption
                  value="merge"
                  current={mode}
                  onSelect={setMode}
                  icon={GitMerge}
                  title="Merge (recommended)"
                  description="Adds new ranks and updates name, school, city and score for ranks that already exist. Photos are kept. Nothing is deleted."
                />
                <ModeOption
                  value="replace"
                  current={mode}
                  onSelect={setMode}
                  icon={RefreshCcw}
                  danger
                  title="Replace everything"
                  description="Makes the list exactly match the file. Students whose rank is NOT in the file are deleted, together with their photos."
                />
              </div>
            </fieldset>

            <div className="mt-6 flex justify-end">
              <button type="button" className="btn-gold px-6 py-3 text-sm" onClick={check} disabled={!file || checking}>
                {checking && <Spinner className="h-4 w-4" />}
                Check file
              </button>
            </div>
          </Panel>
        </div>
      )}

      {step === 'review' && preview && (
        <div className="space-y-6">
          <Panel
            title={hasErrors ? 'Fix these problems first' : 'Looks good — ready to import'}
            description={
              <>
                {file?.name} · mode <span className={clsx('font-semibold', mode === 'replace' ? 'text-red-300' : 'text-cyan-glow')}>{mode}</span> · dry run, nothing saved yet
              </>
            }
          >
            <ImportSummary result={preview} mode={mode} predicted />
            {hasErrors ? (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden />
                {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'} found. Correct them in your spreadsheet, save, and upload it
                again — nothing is imported while any row is invalid.
              </p>
            ) : (
              willRemove > 0 && (
                <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden />
                  Replace mode will delete {willRemove} existing student{willRemove === 1 ? '' : 's'} (and their photos) that are not in this file.
                </p>
              )
            )}
          </Panel>

          <Panel title="Rows">
            <ImportRowsTable result={preview} />
          </Panel>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="btn-ghost" onClick={() => setStep('choose')}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Choose another file
            </button>
            <button
              type="button"
              className={clsx(mode === 'replace' && willRemove > 0 ? 'btn-danger px-6 py-3' : 'btn-gold px-6 py-3 text-sm')}
              disabled={hasErrors}
              onClick={() => setConfirmReplace(true)}
              title={hasErrors ? 'Fix all problems first' : undefined}
            >
              <Check className="h-4 w-4" aria-hidden />
              Import {preview.summary.valid} student{preview.summary.valid === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && committed && (
        <Panel className="mx-auto max-w-2xl" bodyClassName="p-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-emerald-400/40 bg-emerald-400/15 text-emerald-300 shadow-[0_0_40px_rgba(52,211,153,.35)]">
            <CircleCheck className="h-8 w-8" aria-hidden />
          </div>
          <h2 className="mt-5 font-display text-2xl font-extrabold text-white">Import complete</h2>
          <p className="mt-1 text-sm text-white/60">The big screen and dashboard are already updated.</p>
          <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
            <SummaryChip label="Created" value={committed.summary.created} tone="green" />
            <SummaryChip label="Updated" value={committed.summary.updated} tone="blue" />
            <SummaryChip label="Removed" value={committed.summary.removed} tone={committed.summary.removed ? 'amber' : 'neutral'} />
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/admin/results" className="btn-gold px-6 py-3 text-sm">
              View results
            </Link>
            <button type="button" className="btn-ghost" onClick={reset}>
              Import another file
            </button>
          </div>
        </Panel>
      )}

      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={commit}
        tone={mode === 'replace' && willRemove > 0 ? 'danger' : 'primary'}
        title={mode === 'replace' ? 'Replace all results?' : 'Import results?'}
        message={
          preview && (
            <>
              {preview.summary.created} will be created and {preview.summary.updated} updated
              {mode === 'replace' && (
                <>
                  , and <strong className="text-red-200">{preview.summary.removed} deleted</strong> with their photos
                </>
              )}
              . Changes go live on the big screen immediately.
            </>
          )
        }
        confirmLabel={mode === 'replace' ? 'Replace' : 'Import'}
      />
    </>
  )
}
