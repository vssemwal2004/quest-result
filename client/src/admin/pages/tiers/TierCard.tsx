import type { DragEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { Tier } from '@/types'
import { formatRange } from '@/show/contracts'
import { STYLE_META, TIER_ICONS, withAlpha } from '../../lib/tierMeta'
import { Badge } from '../../ui/Badge'
import { Toggle } from '../../ui/Toggle'

interface TierCardProps {
  tier: Tier
  index: number
  total: number
  studentCount: number | undefined
  toggling: boolean
  dragging: boolean
  /** True while the drag handle is pressed — only then is the card draggable. */
  draggable: boolean
  onArm: () => void
  onDragStart: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragEnd: () => void
  onMove: (delta: -1 | 1) => void
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}

export function TierCard({
  tier,
  index,
  total,
  studentCount,
  toggling,
  dragging,
  draggable,
  onArm,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMove,
  onToggle,
  onEdit,
  onDelete,
}: TierCardProps) {
  const Icon = TIER_ICONS[tier.icon]
  const style = STYLE_META[tier.style]
  const expected = tier.rankTo - tier.rankFrom + 1

  return (
    <li
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={clsx(
        'glass relative flex items-stretch gap-3 overflow-hidden rounded-2xl p-3 pr-4 transition sm:gap-4',
        dragging && 'scale-[0.99] opacity-40',
        !tier.enabled && 'opacity-60',
      )}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: tier.color, boxShadow: `0 0 16px ${tier.color}` }} aria-hidden />

      <div className="flex flex-col items-center justify-center gap-1 pl-1">
        <button
          type="button"
          className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Move ${tier.name} earlier`}
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <span
          className="cursor-grab touch-none rounded p-0.5 text-white/35 hover:text-white active:cursor-grabbing"
          onPointerDown={onArm}
          title="Drag to reorder"
          aria-hidden
        >
          <GripVertical className="h-5 w-5" />
        </span>
        <button
          type="button"
          className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label={`Move ${tier.name} later`}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <span className="text-xs font-bold tabular-nums text-white/35" title="Reveal order">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border"
            style={{ color: tier.color, borderColor: withAlpha(tier.color, 0.45), background: withAlpha(tier.color, 0.12), boxShadow: `0 0 18px ${withAlpha(tier.color, 0.25)}` }}
          >
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-extrabold text-white">{tier.name}</p>
            <p className="truncate text-xs text-white/55">
              <span className="font-tech" style={{ color: tier.color }}>
                {formatRange(tier.rankFrom, tier.rankTo)}
              </span>
              {tier.podiumPrizes !== null && tier.style === 'podium' ? ' · Individual prizes' : (
                <>{tier.prize && <> · {tier.prize}</>}{tier.prizeAmount && <span className="text-gold-300"> · {tier.prizeAmount}</span>}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge>
            <span className="inline-flex items-center gap-1">
              <style.icon className="h-3 w-3" aria-hidden />
              {style.label}
            </span>
          </Badge>
          {(tier.style === 'grid' || tier.style === 'scroll') && (
            <Badge tone="neutral">{tier.gridPageCounts ? `${tier.gridPageCounts.length} manual pages` : 'Balanced pages'}</Badge>
          )}
          {tier.style !== 'podium' && <Badge tone="neutral">{tier.sortDirection === 'asc' ? 'Ascending' : 'Descending'}</Badge>}
          <Badge tone={studentCount === undefined ? 'neutral' : studentCount >= expected ? 'green' : studentCount === 0 ? 'amber' : 'blue'}>
            {studentCount ?? '…'} / {expected} students
          </Badge>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Toggle checked={tier.enabled} onChange={onToggle} busy={toggling} label={`${tier.enabled ? 'Disable' : 'Enable'} ${tier.name}`} hideLabel />
          <button type="button" onClick={onEdit} className="rounded-lg p-2 text-white/55 hover:bg-white/10 hover:text-white" aria-label={`Edit ${tier.name}`} title="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg p-2 text-white/55 hover:bg-red-500/15 hover:text-red-300" aria-label={`Delete ${tier.name}`} title="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  )
}
