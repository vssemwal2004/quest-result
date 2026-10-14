import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Tier } from '@/types'
import { formatRange } from '@/show/contracts'
import { useResource } from '../../hooks/useResource'
import { STYLE_META } from '../../lib/tierMeta'
import { Modal } from '../../ui/Modal'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { ErrorState } from '../../ui/EmptyState'
import { PageLoader } from '../../ui/Spinner'

interface PresetsModalProps {
  open: boolean
  currentCount: number
  onClose: () => void
  onApplied: (tiers: Tier[]) => void
}

export function PresetsModal({ open, currentCount, onClose, onApplied }: PresetsModalProps) {
  const presets = useResource(() => (open ? api.tierPresets() : Promise.resolve(null)), [open])
  const [selected, setSelected] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (open) setSelected(null)
  }, [open])

  const list = presets.data?.presets ?? []
  const chosen = list.find((p) => p.key === selected)

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        title="Tier presets"
        description="Start from a proven show structure, then fine-tune names, prizes and colours."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-gold px-5 py-2.5 text-sm" disabled={!chosen} onClick={() => setConfirming(true)}>
              Apply preset
            </button>
          </>
        }
      >
        {presets.loading && !presets.data ? (
          <PageLoader label="Loading presets…" />
        ) : presets.error ? (
          <ErrorState error={presets.error} onRetry={() => void presets.reload()} title="Could not load presets" />
        ) : (
          <div role="radiogroup" aria-label="Presets" className="grid gap-4 md:grid-cols-3">
            {list.map((p) => {
              const active = p.key === selected
              return (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelected(p.key)}
                  className={clsx(
                    'flex flex-col rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60',
                    active ? 'border-gold-400/70 bg-gold-400/[0.07] shadow-glow-gold' : 'border-white/10 bg-white/[0.03] hover:border-white/25',
                  )}
                >
                  <span className="flex items-center gap-2 font-display font-extrabold text-white">
                    {p.name}
                    {active && <Check className="ml-auto h-4 w-4 text-gold-300" aria-hidden />}
                  </span>
                  <span className="mt-1 text-xs leading-relaxed text-white/55">{p.description}</span>
                  <ol className="mt-4 space-y-1.5">
                    {p.tiers.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color, boxShadow: `0 0 8px ${t.color}` }} aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-white/85">{t.name}</span>
                        <span className="font-tech text-white/50">{formatRange(t.rankFrom, t.rankTo)}</span>
                        <span className="w-20 shrink-0 whitespace-nowrap text-right text-white/40">{STYLE_META[t.style].label}</span>
                      </li>
                    ))}
                  </ol>
                </button>
              )
            })}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Replace all tiers?"
        message={
          <>
            Applying <strong className="text-white">{chosen?.name}</strong> deletes your {currentCount} current tier
            {currentCount === 1 ? '' : 's'} (including custom names, prizes and colours) and creates {chosen?.tiers.length} new ones.
            Students are not affected.
          </>
        }
        confirmLabel="Replace tiers"
        onConfirm={async () => {
          if (!chosen) return
          const res = await api.applyPreset(chosen.key)
          toast.success(`Applied “${chosen.name}”`)
          onApplied(res.tiers)
        }}
      />
    </>
  )
}
