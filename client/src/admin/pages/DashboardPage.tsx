import { Link } from 'react-router-dom'
import {
  CircleCheck,
  FileSpreadsheet,
  Layers,
  MonitorPlay,
  Radio,
  TriangleAlert,
  Trophy,
  UserPlus,
  Users,
  Wifi,
  type LucideIcon,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/lib/api'
import type { Overview, OverviewTier } from '@/types'
import { formatRange } from '@/show/contracts'
import { useResource } from '../hooks/useResource'
import { useShowUpdate } from '../hooks/useShowUpdate'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useLive } from '../state/LiveContext'
import { compressRanges, targetWinners } from '../lib/ranks'
import { STYLE_META, TIER_ICONS, withAlpha } from '../lib/tierMeta'
import { PageHeader, Panel } from '../ui/Panel'
import { StatCard } from '../ui/StatCard'
import { Badge } from '../ui/Badge'
import { ErrorState } from '../ui/EmptyState'
import { PageLoader } from '../ui/Spinner'

function TierCoverageRow({ item }: { item: OverviewTier }) {
  const { tier, studentCount, expected } = item
  const Icon = TIER_ICONS[tier.icon]
  const ratio = expected > 0 ? Math.min(1, studentCount / expected) : 0
  const complete = studentCount >= expected
  return (
    <li className={clsx('flex items-center gap-4 py-3', !tier.enabled && 'opacity-50')}>
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border"
        style={{ color: tier.color, borderColor: withAlpha(tier.color, 0.4), background: withAlpha(tier.color, 0.12) }}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-white">{tier.name}</span>
          <span className="font-tech text-xs text-white/50">{formatRange(tier.rankFrom, tier.rankTo)}</span>
          <Badge className="hidden sm:inline-flex">{STYLE_META[tier.style].label}</Badge>
          {!tier.enabled && <Badge tone="amber">Disabled</Badge>}
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label={`${tier.name} coverage`}
          aria-valuemin={0}
          aria-valuemax={expected}
          aria-valuenow={studentCount}
        >
          <div
            className="h-full origin-left rounded-full transition-transform duration-700"
            style={{
              transform: `scaleX(${ratio})`,
              background: `linear-gradient(90deg, ${withAlpha(tier.color, 0.6)}, ${tier.color})`,
              boxShadow: `0 0 12px ${withAlpha(tier.color, 0.6)}`,
            }}
          />
        </div>
      </div>
      <div className="w-20 shrink-0 text-right">
        <span className={clsx('text-sm font-bold tabular-nums', complete ? 'text-emerald-300' : 'text-white')}>{studentCount}</span>
        <span className="text-sm text-white/40"> / {expected}</span>
      </div>
    </li>
  )
}

interface Warning {
  title: string
  detail: string
  to: string
  action: string
}

function buildWarnings(overview: Overview): Warning[] {
  const warnings: Warning[] = []
  if (overview.missingRanks.length) {
    warnings.push({
      title: `${overview.missingRanks.length} missing rank${overview.missingRanks.length === 1 ? '' : 's'}`,
      detail: `No student for rank ${compressRanges(overview.missingRanks)}.`,
      to: '/admin/results',
      action: 'Add results',
    })
  }
  if (overview.unassignedStudents.length) {
    const names = overview.unassignedStudents
      .slice(0, 4)
      .map((s) => `#${s.rank} ${s.name}`)
      .join(', ')
    const more = overview.unassignedStudents.length > 4 ? ` +${overview.unassignedStudents.length - 4} more` : ''
    warnings.push({
      title: `${overview.unassignedStudents.length} student${overview.unassignedStudents.length === 1 ? '' : 's'} outside every enabled tier`,
      detail: `They will not appear in the show: ${names}${more}.`,
      to: '/admin/tiers',
      action: 'Adjust tiers',
    })
  }
  const empty = overview.tiers.filter((t) => t.tier.enabled && t.studentCount === 0)
  if (empty.length) {
    warnings.push({
      title: `${empty.length} enabled tier${empty.length === 1 ? ' has' : 's have'} no students`,
      detail: `${empty.map((t) => t.tier.name).join(', ')} will show an empty stage.`,
      to: '/admin/tiers',
      action: 'Review tiers',
    })
  }
  if (overview.tiers.every((t) => !t.tier.enabled)) {
    warnings.push({
      title: 'No enabled prize tiers',
      detail: 'The show will go straight from the intro to the finale.',
      to: '/admin/tiers',
      action: 'Set up tiers',
    })
  }
  return warnings
}

const QUICK_ACTIONS: Array<{ to: string; label: string; hint: string; icon: LucideIcon; primary?: boolean }> = [
  { to: '/admin/results?new=1', label: 'Add result', hint: 'One student at a time', icon: UserPlus },
  { to: '/admin/import', label: 'Import', hint: 'CSV or Excel sheet', icon: FileSpreadsheet },
  { to: '/admin/tiers', label: 'Prize tiers', hint: 'Ranges & reveal style', icon: Layers },
  { to: '/admin/live', label: 'Go live', hint: 'Event-day controls', icon: Radio, primary: true },
]

export function DashboardPage() {
  useDocumentTitle('Dashboard')
  const overview = useResource(() => api.overview(), [])
  const live = useLive()
  useShowUpdate(() => void overview.reload({ silent: true }), 400)

  if (overview.loading && !overview.data) return <PageLoader label="Loading dashboard…" />
  if (!overview.data) return <ErrorState error={overview.error} onRetry={() => void overview.reload()} />

  const data = overview.data
  const allTiers = data.tiers.map((t) => t.tier)
  const target = targetWinners(allTiers) || 200
  const enabledCount = allTiers.filter((t) => t.enabled).length
  const warnings = buildWarnings(data)
  const viewers = live.viewers ?? data.viewers
  const stage = live.currentStage
  const state = live.presentation?.state

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Readiness at a glance. Everything here updates live while you edit."
        actions={
          <a href="/" target="_blank" rel="noreferrer" className="btn-blue">
            <MonitorPlay className="h-4 w-4" aria-hidden /> Open big screen
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Winners uploaded"
          value={
            <>
              {data.studentCount}
              <span className="text-lg text-white/40"> / {target}</span>
            </>
          }
          progress={data.studentCount / target}
          hint={data.studentCount >= target ? 'All ranks uploaded' : `${Math.max(0, target - data.studentCount)} still to add`}
          accent={data.studentCount >= target ? 'green' : 'blue'}
        />
        <StatCard
          icon={Trophy}
          label="Prize tiers"
          value={enabledCount}
          hint={`${data.tierCount} total · ${data.tierCount - enabledCount} disabled`}
          accent="gold"
        />
        <StatCard
          icon={Wifi}
          label="Connected screens"
          value={viewers}
          hint={live.connected ? 'Big screens & admin tabs online' : 'Realtime reconnecting…'}
          accent={live.connected ? 'cyan' : 'red'}
        />
        <StatCard
          icon={Radio}
          label="Live stage"
          value={stage ? stage.title : '—'}
          hint={
            stage && state
              ? `Stage ${state.stageIndex + 1} of ${live.presentation?.stages.length ?? 0} · step ${state.step + 1} of ${stage.stepCount}`
              : 'Not loaded'
          }
          accent="red"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Tier coverage"
          description="Students uploaded per tier, in reveal order."
          actions={
            <Link to="/admin/tiers" className="btn-ghost px-3 py-1.5 text-sm">
              Manage tiers
            </Link>
          }
          bodyClassName="py-2"
        >
          {data.tiers.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/55">
              No tiers yet.{' '}
              <Link to="/admin/tiers" className="font-semibold text-cyan-glow hover:underline">
                Apply a preset
              </Link>{' '}
              to get started.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {data.tiers.map((item) => (
                <TierCoverageRow key={item.tier.id} item={item} />
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Pre-show checks">
            {warnings.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
                <div>
                  <p className="font-semibold text-emerald-200">All clear — ready for the show</p>
                  <p className="mt-0.5 text-sm text-emerald-100/70">Every rank is filled and every tier has students.</p>
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {warnings.map((w) => (
                  <li key={w.title} className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-4">
                    <div className="flex items-start gap-3">
                      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-amber-100">{w.title}</p>
                        <p className="mt-0.5 break-words text-sm text-white/65">{w.detail}</p>
                        <Link to={w.to} className="mt-2 inline-block text-sm font-semibold text-cyan-glow hover:underline">
                          {w.action} →
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Quick actions" bodyClassName="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map(({ to, label, hint, icon: Icon, primary }) => (
              <Link
                key={to}
                to={to}
                className={clsx(
                  'group rounded-xl border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60',
                  primary
                    ? 'border-gold-400/50 bg-gold-400/10 hover:bg-gold-400/20 hover:shadow-glow-gold'
                    : 'border-white/10 bg-white/[0.04] hover:border-cyan-glow/40 hover:bg-white/[0.08]',
                )}
              >
                <Icon className={clsx('h-5 w-5', primary ? 'text-gold-300' : 'text-cyan-glow')} aria-hidden />
                <p className={clsx('mt-3 font-semibold', primary ? 'text-gold-200' : 'text-white')}>{label}</p>
                <p className="text-xs text-white/50">{hint}</p>
              </Link>
            ))}
          </Panel>
        </div>
      </div>
    </>
  )
}
