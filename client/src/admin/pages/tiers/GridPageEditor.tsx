import { Segmented } from '../../ui/Segmented'

const MAX_PAGES = 500
const MAX_PER_PAGE = 12

function balancedCounts(total: number, pages: number): number[] {
  const base = Math.floor(total / pages)
  const extra = total % pages
  return Array.from({ length: pages }, (_, index) => base + (index < extra ? 1 : 0))
}

export function GridPageEditor({
  rankFrom,
  rankTo,
  direction,
  counts,
  onChange,
  error,
}: {
  rankFrom: number | null
  rankTo: number | null
  direction: 'asc' | 'desc'
  counts: number[] | null
  onChange: (counts: number[] | null) => void
  error: string | null
}) {
  const total = rankFrom !== null && rankTo !== null && rankTo >= rankFrom ? rankTo - rankFrom + 1 : 0
  const minPages = Math.max(1, Math.ceil(total / MAX_PER_PAGE))
  const maxPages = Math.min(total, MAX_PAGES)
  const canConfigure = total > 0 && minPages <= maxPages
  const manual = counts !== null
  let cursor = direction === 'asc' ? rankFrom ?? 0 : rankTo ?? 0

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="label">Grid pages</p>
      <p className="mb-3 text-xs text-white/55">Pages stay on screen until the presenter presses Next or Previous.</p>
      <Segmented<'auto' | 'manual'>
        ariaLabel="Grid page layout"
        value={manual ? 'manual' : 'auto'}
        onChange={(mode) => {
          if (mode === 'auto') onChange(null)
          else if (canConfigure) onChange(balancedCounts(total, minPages))
        }}
        options={[
          { value: 'auto', label: 'Balanced automatically' },
          { value: 'manual', label: 'Set pages manually' },
        ]}
      />
      {!manual ? (
        <p className="mt-3 text-xs text-white/60">{total ? 'Uploaded students are spread evenly across pages of up to 12.' : 'Enter a rank range to configure the pages.'}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {!canConfigure && <p className="text-sm text-amber-200">Enter a valid rank range of at most {MAX_PAGES * MAX_PER_PAGE} ranks to set pages manually.</p>}
          <label className="flex items-center gap-3 text-sm text-white/80">
            Number of pages
            <input
              type="number"
              inputMode="numeric"
              min={minPages}
              max={maxPages}
              value={counts.length}
              disabled={!canConfigure}
              onChange={(event) => {
                const pages = Number(event.target.value)
                if (Number.isInteger(pages) && pages >= minPages && pages <= maxPages) onChange(balancedCounts(total, pages))
              }}
              className="input w-24 font-tech"
            />
          </label>
          <p className="text-xs text-white/55">Set the number of ranks on each page. The page ranges follow the reveal order.</p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {counts.map((count, index) => {
              const end = direction === 'asc' ? cursor + count - 1 : cursor - count + 1
              const range = `${cursor}–${end}`
              cursor = direction === 'asc' ? end + 1 : end - 1
              return (
                <label key={index} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-navy-950/40 px-3 py-2 text-sm text-white/80">
                  <span>Page {index + 1} <span className="font-tech text-xs text-white/45">Ranks {range}</span></span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_PER_PAGE}
                    value={count || ''}
                    onChange={(event) => {
                      const next = [...counts]
                      next[index] = Number(event.target.value)
                      onChange(next)
                    }}
                    className="input w-20 shrink-0 text-center font-tech"
                    aria-label={`Ranks on page ${index + 1}`}
                  />
                </label>
              )
            })}
          </div>
          <p className="text-xs text-white/60">
            Assigned {counts.reduce((sum, count) => sum + count, 0)} of {total} ranks.
          </p>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-xs font-medium text-red-300">{error}</p>}
    </div>
  )
}
