import type { Tier } from '@/types'

/** Sorted, de-duplicated runs of consecutive integers: [12,13,14,40] -> [[12,14],[40,40]]. */
export function toRuns(nums: number[]): Array<[number, number]> {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  const runs: Array<[number, number]> = []
  for (const n of sorted) {
    const last = runs[runs.length - 1]
    if (last && n === last[1] + 1) last[1] = n
    else runs.push([n, n])
  }
  return runs
}

/** Human readable compressed list: "12–15, 40". Truncates after `limit` runs. */
export function compressRanges(nums: number[], limit = 12): string {
  const runs = toRuns(nums)
  const parts = runs.slice(0, limit).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
  if (runs.length > limit) parts.push(`+${runs.length - limit} more`)
  return parts.join(', ')
}

/** Suggested tier subtitle for a rank range ("Ranks 151 – 200" / "Rank 1"). */
export function rangeSubtitle(from: number, to: number): string {
  return from === to ? `Rank ${from}` : `Ranks ${from} – ${to}`
}

export function enabledTiers(tiers: Tier[]): Tier[] {
  return tiers.filter((t) => t.enabled)
}

/** The tier a rank belongs to: enabled tiers first, then any tier (so disabled ones still label rows). */
export function tierForRank(tiers: Tier[], rank: number): Tier | undefined {
  const inRange = (t: Tier) => rank >= t.rankFrom && rank <= t.rankTo
  return tiers.find((t) => t.enabled && inRange(t)) ?? tiers.find(inRange)
}

/** Number of winners the show expects: the highest rank covered by an enabled tier. */
export function targetWinners(tiers: Tier[]): number {
  return enabledTiers(tiers).reduce((max, t) => Math.max(max, t.rankTo), 0)
}

/** Enabled tiers (other than `selfId`) whose range intersects [from, to]. */
export function overlappingTiers(tiers: Tier[], from: number, to: number, selfId?: string): Tier[] {
  return tiers.filter((t) => t.enabled && t.id !== selfId && from <= t.rankTo && to >= t.rankFrom)
}
