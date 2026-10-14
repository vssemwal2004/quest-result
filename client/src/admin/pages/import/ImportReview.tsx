import { useMemo, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import clsx from 'clsx'
import type { ImportError, ImportResult } from '@/types'
import { Segmented } from '../../ui/Segmented'

type Tone = 'neutral' | 'green' | 'red' | 'blue' | 'amber'

const CHIP_TONES: Record<Tone, string> = {
  neutral: 'border-white/15 bg-white/[0.05] text-white',
  green: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200',
  red: 'border-red-400/40 bg-red-500/10 text-red-200',
  blue: 'border-royal-400/40 bg-royal-500/15 text-sky-100',
  amber: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
}

export function SummaryChip({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className={clsx('rounded-xl border px-4 py-3', CHIP_TONES[tone])}>
      <p className="font-display text-2xl font-extrabold leading-none">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
    </div>
  )
}

export function ImportSummary({ result, mode, predicted }: { result: ImportResult; mode: 'merge' | 'replace'; predicted: boolean }) {
  const { summary } = result
  const verb = predicted ? 'Will ' : ''
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <SummaryChip label="Rows" value={summary.total} />
      <SummaryChip label="Valid" value={summary.valid} tone="green" />
      <SummaryChip label="Invalid" value={summary.invalid} tone={summary.invalid ? 'red' : 'neutral'} />
      <SummaryChip label={`${verb}create`} value={summary.created} tone="blue" />
      <SummaryChip label={`${verb}update`} value={summary.updated} tone="blue" />
      <SummaryChip
        label={`${verb}remove`}
        value={summary.removed}
        tone={mode === 'replace' && summary.removed > 0 ? 'red' : 'neutral'}
      />
    </div>
  )
}

/** Row table of a dry run with invalid rows highlighted and their messages inline. */
export function ImportRowsTable({ result }: { result: ImportResult }) {
  const [filter, setFilter] = useState<'all' | 'problems'>(result.errors.length ? 'problems' : 'all')

  const errorsByLine = useMemo(() => {
    const map = new Map<number, ImportError[]>()
    for (const e of result.errors) map.set(e.line, [...(map.get(e.line) ?? []), e])
    return map
  }, [result.errors])

  const rowLines = useMemo(() => new Set(result.rows.map((r) => r.line)), [result.rows])
  // Errors that don't belong to a parsed row (e.g. missing header columns, empty file).
  const fileErrors = result.errors.filter((e) => !rowLines.has(e.line))
  const problemRows = result.rows.filter((r) => errorsByLine.has(r.line))
  const rows = filter === 'problems' ? problemRows : result.rows

  return (
    <div>
      {fileErrors.length > 0 && (
        <ul className="mb-4 space-y-1.5 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
          {fileErrors.map((e, i) => (
            <li key={i} className="flex gap-2">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden />
              <span>
                {e.line > 0 && <span className="font-semibold">Line {e.line}: </span>}
                {e.field && <span className="font-mono text-red-200">{e.field} — </span>}
                {e.message}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Rows to show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All rows (${result.rows.length})` },
            { value: 'problems', label: `Problems (${problemRows.length})` },
          ]}
        />
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-navy-900/95 backdrop-blur">
            <tr className="text-xs font-semibold uppercase tracking-wider text-white/50">
              <th scope="col" className="px-3 py-2.5">Line</th>
              <th scope="col" className="px-3 py-2.5">Rank</th>
              <th scope="col" className="px-3 py-2.5">Name</th>
              <th scope="col" className="px-3 py-2.5">School</th>
              <th scope="col" className="px-3 py-2.5">City</th>
              <th scope="col" className="px-3 py-2.5 text-right">Score</th>
              <th scope="col" className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-white/50">
                  {filter === 'problems' ? 'No row-level problems.' : 'The file has no data rows.'}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const errs = errorsByLine.get(r.line)
              const bad = (field: string) => errs?.some((e) => e.field === field)
              return (
                <tr key={r.line} className={clsx('border-t border-white/5 align-top', errs ? 'bg-red-500/[0.08]' : 'hover:bg-white/[0.03]')}>
                  <td className="px-3 py-2 font-mono text-xs text-white/45">{r.line}</td>
                  <td className={clsx('px-3 py-2 font-tech', bad('rank') && 'text-red-300')}>{r.rank ?? '—'}</td>
                  <td className={clsx('px-3 py-2', bad('name') && 'text-red-300')}>{r.name || <span className="text-white/30">empty</span>}</td>
                  <td className={clsx('max-w-[14rem] truncate px-3 py-2 text-white/75', bad('school') && 'text-red-300')} title={r.school}>
                    {r.school || <span className="text-white/30">empty</span>}
                  </td>
                  <td className="px-3 py-2 text-white/65">{r.city ?? ''}</td>
                  <td className={clsx('px-3 py-2 text-right font-tech text-white/75', bad('score') && 'text-red-300')}>{r.score ?? ''}</td>
                  <td className="px-3 py-2">
                    {errs ? (
                      <ul className="space-y-0.5 text-xs text-red-200">
                        {errs.map((e, i) => (
                          <li key={i}>
                            {e.field && <span className="font-mono text-red-300">{e.field}: </span>}
                            {e.message}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                        <CircleCheck className="h-3.5 w-3.5" aria-hidden /> OK
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
