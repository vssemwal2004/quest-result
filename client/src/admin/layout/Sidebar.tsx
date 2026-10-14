import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MonitorPlay } from 'lucide-react'
import clsx from 'clsx'
import { NAV_ITEMS } from '../nav'
import { QuestLockup } from '../brand/QuestLockup'
import { useLive } from '../state/LiveContext'

export function Sidebar({ variant, onNavigate }: { variant: 'desktop' | 'mobile'; onNavigate?: () => void }) {
  const { settings, presentation } = useLive()
  const showInProgress = (presentation?.state.stageIndex ?? 0) > 0
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6">
        <div className="flex items-center gap-2">
          <QuestLockup size="sm" />
          <span className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/70">
            Admin
          </span>
        </div>
        <p className="mt-2 truncate text-xs text-white/45">{settings?.eventEdition ?? 'Results console'}</p>
      </div>

      <nav aria-label="Admin" className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/admin'}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-cyan-glow/60',
                isActive ? 'text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId={`admin-nav-active-${variant}`}
                    className="absolute inset-0 rounded-xl border border-cyan-glow/30 bg-gradient-to-r from-royal-600/50 to-royal-600/10 shadow-glow"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    aria-hidden
                  />
                )}
                {isActive && (
                  <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-cyan-glow shadow-glow" aria-hidden />
                )}
                <Icon className={clsx('relative h-[18px] w-[18px]', isActive ? 'text-cyan-glow' : 'text-white/50 group-hover:text-white/80')} aria-hidden />
                <span className="relative">{label}</span>
                {to === '/admin/live' && showInProgress && (
                  <span
                    className="relative ml-auto h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.8)]"
                    title="Show in progress"
                    aria-label="Show in progress"
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 p-4">
        <a href="/" target="_blank" rel="noreferrer" className="btn-ghost w-full justify-center text-sm">
          <MonitorPlay className="h-4 w-4 text-cyan-glow" aria-hidden /> Open big screen
        </a>
        <p className="px-1 text-[11px] leading-snug text-white/35">{settings?.organization ?? 'AI Quest'}</p>
      </div>
    </div>
  )
}
