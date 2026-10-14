import type { Settings } from '@/types'
import { splitOrganization } from '../brand/OrgLockup'

/** Always visible, including when the optional progress HUD is hidden. */
export function BrandFooter({ settings }: { settings: Settings }) {
  const [name] = splitOrganization(settings.organization)
  if (!name.trim()) return null

  return (
    <div className="show-brand-footer pointer-events-none fixed inset-x-0 bottom-0 z-[46] flex items-center justify-center gap-2.5 px-4 text-center">
      <span className="font-tech text-[11px] font-semibold uppercase tracking-[0.26em] text-white/75">Presented by</span>
      <span className="font-display text-[20px] font-extrabold leading-none text-white" style={{ textShadow: '0 0 14px rgba(56,225,255,0.55)' }}>
        {name}
      </span>
    </div>
  )
}
