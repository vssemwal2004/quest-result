import clsx from 'clsx'
import type { Settings } from '@/types'

/** "Graphic Era (Deemed to be University)" → ["Graphic Era", "Deemed to be University"], like the poster lockup. */
export function splitOrganization(org: string): [string, string] {
  const m = org.match(/^(.*?)\s*\((.+)\)\s*$/)
  return m ? [m[1], m[2]] : [org, '']
}

/**
 * Organisation lockup. Only the welcome screen opts in to the location line, so the
 * repeated branding stays focused on the organisation name.
 */
export function OrgLockup({ settings, compact = false, featured = false, showLocation = false, className }: { settings: Settings; compact?: boolean; featured?: boolean; showLocation?: boolean; className?: string }) {
  const [name, qualifier] = splitOrganization(settings.organization)
  return (
    <div className={clsx('flex min-w-0 items-center', compact ? 'gap-3.5' : 'gap-[calc(var(--u)*1.4)]', className)}>
      {settings.logoUrl && (
        <img
          src={settings.logoUrl}
          alt=""
          draggable={false}
          className={clsx('shrink-0 object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]', compact ? 'h-14 w-14' : featured ? 'h-[calc(var(--u)*7)] w-[calc(var(--u)*7)]' : 'h-[calc(var(--u)*5.5)] w-[calc(var(--u)*5.5)]')}
        />
      )}
      <div className="min-w-0 leading-tight">
        <div
          className={clsx('truncate font-display font-extrabold text-white', compact ? 'text-[24px]' : featured ? 'text-[calc(var(--u)*3.2)]' : 'text-[calc(var(--u)*2.4)]')}
          style={{ textShadow: '0 2px 12px rgba(2,10,36,0.8), 0 0 24px rgba(56,225,255,0.35)' }}
        >
          {name}
        </div>
        {qualifier && (
          <div className={clsx('truncate font-medium text-white/85', compact ? 'text-[14px]' : featured ? 'text-[calc(var(--u)*1.45)]' : 'text-[calc(var(--u)*1.15)]')}>{qualifier}</div>
        )}
        {showLocation && settings.location && (
          <div
            className={clsx(
              'truncate font-tech font-semibold uppercase text-gold-300',
              compact ? 'mt-0.5 text-[12px] tracking-[0.34em]' : featured ? 'mt-[calc(var(--u)*0.35)] text-[calc(var(--u)*1.15)] tracking-[0.4em]' : 'mt-[calc(var(--u)*0.25)] text-[calc(var(--u)*0.95)] tracking-[0.4em]',
            )}
          >
            {settings.location}
          </div>
        )}
      </div>
    </div>
  )
}
