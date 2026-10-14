import { useMemo } from 'react'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import type { Tier } from '@/types'
import { formatRange } from '@/show/contracts'
import { withAlpha } from '../../lib/tierMeta'

interface Segment {
  from: number
  to: number
  tiers: Tier[]
}

/** Run-length segments of ranks 1..maxRank by the set of enabled tiers covering each rank. */
function buildSegments(tiers: Tier[], maxRank: number): Segment[] {
  const enabled = tiers.filter((t) => t.enabled)
  const segments: Segment[] = []
  for (let r = 1; r <= maxRank; r++) {
    const covering = enabled.filter((t) => r >= t.rankFrom && r <= t.rankTo)
    const last = segments[segments.length - 1]
    const sameSet = last && last.tiers.length === covering.length && last.tiers.every((t, i) => t.id === covering[i].id)
    if (sameSet) last.to = r
    else segments.push({ from: r, to: r, tiers: covering })
  }
  return segments
}

function segmentLabel(s: Segment): string {
  const range = `Ranks ${formatRange(s.from, s.to)}`
  if (s.tiers.length === 0) return `${range} · not covered by any enabled tier`
  if (s.tiers.length > 1) return `${range} · OVERLAP: ${s.tiers.map((t) => t.name).join(' + ')}`
  return `${range} · ${s.tiers[0].name}`
}

/** Visualises ranks 1..maxRank segmented by tier so gaps and overlaps are obvious at a glance. */
export function CoverageBar({ tiers, maxRank }: { tiers: Tier[]; maxRank: number }) {
  const segments = useMemo(() => buildSegments(tiers, maxRank), [tiers, maxRank])
  const gaps = segments.filter((s) => s.tiers.length === 0)
  const overlaps = segments.filter((s) => s.tiers.length > 1)

  if (maxRank < 1) return <p className="text-sm text-white/55">Add a tier to see rank coverage.</p>

  return (
    <div>
      <div className="mb-1.5 flex justify-between font-tech text-[11px] text-white/45">
        <span>Rank 1</span>
        <span>Rank {maxRank}</span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10" role="img" aria-label={segments.map(segmentLabel).join('; ')}>
        {segments.map((s) => {
          const single = s.tiers.length === 1 ? s.tiers[0] : null
          return (
            <div
              key={s.from}
              title={segmentLabel(s)}
              className={clsx(
                'h-full border-r border-navy-950/60 last:border-r-0',
                s.tiers.length === 0 && 'aq-hatch-gap',
                s.tiers.length > 1 && 'aq-hatch-overlap',
              )}
              style={{
                flexGrow: s.to - s.from + 1,
                flexBasis: 0,
                minWidth: 3,
                background: single ? `linear-gradient(180deg, ${single.color}, ${withAlpha(single.color, 0.75)})` : undefined,
              }}
            />
          )
        })}
      </div>
      <div className="mt-1.5 flex">
        {segments.map((s) => {
          const share = (s.to - s.from + 1) / maxRank
          return (
            <div key={s.from} style={{ flexGrow: s.to - s.from + 1, flexBasis: 0, minWidth: 3 }} className="min-w-0 overflow-hidden">
              {share > 0.07 && (
                <p className={clsx('truncate text-center font-tech text-[10px]', s.tiers.length === 1 ? 'text-white/55' : 'text-red-300')}>
                  {formatRange(s.from, s.to)}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {gaps.length === 0 && overlaps.length === 0 ? (
          <span className="inline-flex items-center gap-2 text-emerald-300">
            <CircleCheck className="h-4 w-4" aria-hidden /> Every rank from 1 to {maxRank} is covered exactly once.
          </span>
        ) : (
          <>
            {overlaps.map((s) => (
              <span key={`o${s.from}`} className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-200">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Overlap {formatRange(s.from, s.to)}: {s.tiers.map((t) => t.name).join(' + ')}
              </span>
            ))}
            {gaps.map((s) => (
              <span key={`g${s.from}`} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-100">
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Gap: ranks {formatRange(s.from, s.to)} are in no tier
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
