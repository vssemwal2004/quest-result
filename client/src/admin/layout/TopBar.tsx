import { Link, useLocation } from 'react-router-dom'
import { ExternalLink, LogOut, Menu, UserRound } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { getTokenEmail, setToken } from '@/lib/auth'
import { navItemFor } from '../nav'
import { useLive } from '../state/LiveContext'

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-white/60" title={connected ? 'Realtime connected' : 'Realtime disconnected'}>
      <span className="relative flex h-2.5 w-2.5">
        {connected && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" aria-hidden />}
        <span className={clsx('relative h-2.5 w-2.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-amber-400')} />
      </span>
      <span className="hidden xl:inline">{connected ? 'Connected' : 'Reconnecting…'}</span>
      <span className="sr-only xl:hidden">{connected ? 'Connected' : 'Reconnecting'}</span>
    </span>
  )
}

function LivePill() {
  const { presentation, currentStage } = useLive()
  if (!presentation || !currentStage) return null
  const { step } = presentation.state
  const showStep = currentStage.type === 'tier' && currentStage.stepCount > 2
  return (
    <Link
      to="/admin/live"
      className="group flex min-w-0 items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 py-1 pl-2 pr-3 text-xs font-semibold text-white transition hover:bg-red-500/20"
      title="Open Live control"
    >
      <span className="rounded-full bg-red-500 px-1.5 py-px text-[10px] font-extrabold tracking-wider text-white shadow-[0_0_10px_rgba(239,68,68,.7)]">
        LIVE
      </span>
      <span className="truncate">{currentStage.title}</span>
      {showStep && (
        <span className="shrink-0 text-[11px] tabular-nums text-white/60">
          {step}/{currentStage.stepCount - 1}
        </span>
      )}
    </Link>
  )
}

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { connected } = useLive()
  const { pathname } = useLocation()
  const email = getTokenEmail()
  const current = navItemFor(pathname)

  const logout = () => {
    setToken(null)
    toast.success('Signed out')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy-950/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="-ml-1 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <current.icon className="hidden h-4 w-4 text-cyan-glow sm:block" aria-hidden />
          <span className="truncate font-semibold text-white">{current.label}</span>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <ConnectionDot connected={connected} />
          <div className="hidden min-w-0 max-w-[16rem] md:block">
            <LivePill />
          </div>
          <a href="/" target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1.5 text-sm" title="Open the big screen in a new tab">
            <ExternalLink className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Big screen</span>
          </a>
          <div className="flex items-center gap-2 border-l border-white/10 pl-2 sm:pl-3">
            <span className="hidden items-center gap-1.5 text-xs text-white/60 lg:flex">
              <UserRound className="h-4 w-4" aria-hidden />
              <span className="max-w-[12rem] truncate">{email}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
