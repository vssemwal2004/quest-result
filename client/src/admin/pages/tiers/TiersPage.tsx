import { Fragment, useMemo, useState, type DragEvent } from 'react'
import { Layers, LayoutTemplate, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Tier } from '@/types'
import { useResource } from '../../hooks/useResource'
import { useShowUpdate } from '../../hooks/useShowUpdate'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { errorMessage } from '../../lib/errors'
import { PageHeader, Panel } from '../../ui/Panel'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { EmptyState, ErrorState } from '../../ui/EmptyState'
import { PageLoader } from '../../ui/Spinner'
import { CoverageBar } from './CoverageBar'
import { TierCard } from './TierCard'
import { TierEditor } from './TierEditor'
import { PresetsModal } from './PresetsModal'

/** Move list[from] so it ends up before the item currently at `insertAt` (0..length). */
function reorder<T>(list: T[], from: number, insertAt: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(insertAt > from ? insertAt - 1 : insertAt, 0, item)
  return next
}

export function TiersPage() {
  useDocumentTitle('Prize tiers')
  const tiers = useResource(() => api.tiers(), [])
  const overview = useResource(() => api.overview(), [])
  const [editor, setEditor] = useState<{ tier: Tier | null } | null>(null)
  const [deleting, setDeleting] = useState<Tier | null>(null)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [armedId, setArmedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  useShowUpdate(() => {
    if (dragId) return
    void tiers.reload({ silent: true })
    void overview.reload({ silent: true })
  }, 500)

  const list = useMemo(() => tiers.data?.tiers ?? [], [tiers.data])
  const counts = useMemo(() => new Map(overview.data?.tiers.map((t) => [t.tier.id, t.studentCount]) ?? []), [overview.data])

  const maxRank = useMemo(() => {
    const ranks = [
      ...list.filter((t) => t.enabled).map((t) => t.rankTo),
      ...(overview.data?.unassignedStudents.map((s) => s.rank) ?? []),
      ...(overview.data?.missingRanks ?? []),
    ]
    return ranks.length ? Math.max(...ranks) : 0
  }, [list, overview.data])

  const setList = (next: Tier[]) => tiers.setData(() => ({ tiers: next }))

  const persistOrder = async (next: Tier[]) => {
    const previous = list
    setList(next)
    try {
      const res = await api.reorderTiers(next.map((t) => t.id))
      setList(res.tiers)
      toast.success('Reveal order saved')
    } catch (err) {
      setList(previous)
      toast.error(errorMessage(err))
    }
  }

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= list.length) return
    void persistOrder(reorder(list, index, delta > 0 ? target + 1 : target))
  }

  const toggle = async (tier: Tier, enabled: boolean) => {
    setToggling(tier.id)
    try {
      const { tier: saved } = await api.updateTier(tier.id, { enabled })
      setList(list.map((t) => (t.id === saved.id ? saved : t)))
      void overview.reload({ silent: true })
      toast.success(`${saved.name} ${enabled ? 'enabled' : 'disabled'}`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setToggling(null)
    }
  }

  // The card only becomes draggable while its handle is pressed, so text and buttons stay usable.
  const arm = (id: string) => {
    setArmedId(id)
    window.addEventListener('pointerup', () => setArmedId(null), { once: true })
  }

  const endDrag = () => {
    setDragId(null)
    setDropAt(null)
    setArmedId(null)
  }

  const onDragOver = (e: DragEvent, index: number) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDropAt(e.clientY < rect.top + rect.height / 2 ? index : index + 1)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const from = list.findIndex((t) => t.id === dragId)
    const at = dropAt
    endDrag()
    if (from < 0 || at === null || at === from || at === from + 1) return
    void persistOrder(reorder(list, from, at))
  }

  if (tiers.loading && !tiers.data) return <PageLoader label="Loading tiers…" />
  if (!tiers.data) return <ErrorState error={tiers.error} onRetry={() => void tiers.reload()} />

  const dropLine = (at: number) =>
    dragId !== null && dropAt === at ? <li className="h-1 rounded-full bg-cyan-glow shadow-glow" aria-hidden /> : null

  return (
    <>
      <PageHeader
        title="Prize tiers"
        description="Each enabled tier becomes one stage of the show, revealed top-to-bottom in this order."
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={() => setPresetsOpen(true)}>
              <LayoutTemplate className="h-4 w-4" aria-hidden /> Presets
            </button>
            <button type="button" className="btn-gold px-5 py-2.5 text-sm" onClick={() => setEditor({ tier: null })}>
              <Plus className="h-4 w-4" aria-hidden /> New tier
            </button>
          </>
        }
      />

      <Panel title="Rank coverage" description="Enabled tiers across ranks 1 – max. Hover a segment for details." className="mb-6">
        <CoverageBar tiers={list} maxRank={maxRank} />
      </Panel>

      {list.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Layers}
            title="No prize tiers yet"
            description="Apply a preset like “Classic 5” (151–200 → 101–150 → 21–100 → Top 20 → Podium) or build your own."
            action={
              <>
                <button type="button" className="btn-gold px-5 py-2.5 text-sm" onClick={() => setPresetsOpen(true)}>
                  <LayoutTemplate className="h-4 w-4" aria-hidden /> Choose a preset
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditor({ tier: null })}>
                  <Plus className="h-4 w-4" aria-hidden /> New tier
                </button>
              </>
            }
          />
        </Panel>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-white/45">
            <span>Reveal order · first → last</span>
            <span className="hidden sm:inline">Drag the handle or use the arrows</span>
          </div>
          <ol className="space-y-3" onDragOver={(e) => dragId && e.preventDefault()} onDrop={onDrop}>
            {list.map((tier, i) => (
              <Fragment key={tier.id}>
                {dropLine(i)}
                <TierCard
                  tier={tier}
                  index={i}
                  total={list.length}
                  studentCount={counts.get(tier.id)}
                  toggling={toggling === tier.id}
                  dragging={dragId === tier.id}
                  draggable={armedId === tier.id}
                  onArm={() => arm(tier.id)}
                  onDragStart={(e) => {
                    setDragId(tier.id)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', tier.id)
                  }}
                  onDragOver={(e) => onDragOver(e, i)}
                  onDragEnd={endDrag}
                  onMove={(d) => move(i, d)}
                  onToggle={(v) => void toggle(tier, v)}
                  onEdit={() => setEditor({ tier })}
                  onDelete={() => setDeleting(tier)}
                />
              </Fragment>
            ))}
            {dropLine(list.length)}
          </ol>
        </>
      )}

      <TierEditor
        open={editor !== null}
        tier={editor?.tier ?? null}
        allTiers={list}
        onClose={() => setEditor(null)}
        onSaved={() => {
          setEditor(null)
          void tiers.reload({ silent: true })
          void overview.reload({ silent: true })
        }}
      />

      <PresetsModal
        open={presetsOpen}
        currentCount={list.length}
        onClose={() => setPresetsOpen(false)}
        onApplied={(next) => {
          setPresetsOpen(false)
          setList(next)
          void overview.reload({ silent: true })
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this tier?"
        message={
          deleting && (
            <>
              <strong className="text-white">{deleting.name}</strong> (ranks {deleting.rankFrom}–{deleting.rankTo}) will be removed from the
              show. Students in that range stay in Results but will not be revealed until another tier covers them.
            </>
          )
        }
        confirmLabel="Delete tier"
        onConfirm={async () => {
          if (!deleting) return
          await api.deleteTier(deleting.id)
          setList(list.filter((t) => t.id !== deleting.id))
          void overview.reload({ silent: true })
          toast.success(`Deleted ${deleting.name}`)
        }}
      />
    </>
  )
}
