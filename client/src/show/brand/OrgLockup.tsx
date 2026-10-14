import clsx from 'clsx'
import type { Settings } from '@/types'

/** "Graphic Era (Deemed to be University)" → ["Graphic Era", "Deemed to be University"], like the poster lockup. */
export function splitOrganization(org: string): [string, string] {
  const m = org.match(/^(.*?)\s*\((.+)\)\s*$/)
  return m ? [m[1], m[2]] : [org, '']
}

/**
 * Logo + organisation + location. `compact` is the fixed-height top bar version (px sizes, matching
 * LAYOUT.topBar); otherwise it scales with the show unit for the intro.
 */
export function OrgLockup({ settings, compact = false, className }: { settings: Settings; compact?: boolean; className?: string }) {
  const [name, qualifier] = splitOrganization(settings.organization)
  return (
    <div className={clsx('flex min-w-0 items-center', compact ? 'gap-3.5' : 'gap-[calc(var(--u)*1.2)]', className)}>
      {settings.logoUrl && (
        <img
          src={settings.logoUrl}
          alt=""
          draggable={false}
          className={clsx('shrink-0 object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]', compact ? 'h-12 w-12' : 'h-[calc(var(--u)*5)] w-[calc(var(--u)*5)]')}
        />
      )}
      <div className="min-w-0 leading-tight">
        <div
          className={clsx('truncate font-display font-extrabold text-white', compact ? 'text-[19px]' : 'text-[calc(var(--u)*2)]')}
          style={{ textShadow: '0 2px 12px rgba(2,10,36,0.6)' }}
        >
          {name}
        </div>
        {qualifier && (
          <div className={clsx('truncate font-medium text-white/75', compact ? 'text-[12.5px]' : 'text-[calc(var(--u)*1.05)]')}>{qualifier}</div>
        )}
        {settings.location && (
          <div
            className={clsx(
              'truncate font-tech font-semibold uppercase text-gold-300',
              compact ? 'mt-0.5 text-[11px] tracking-[0.34em]' : 'mt-[calc(var(--u)*0.25)] text-[calc(var(--u)*0.95)] tracking-[0.4em]',
            )}
          >
            {settings.location}
          </div>
        )}
      </div>
    </div>
  )
}
