import clsx from 'clsx'
import type { CSSProperties } from 'react'
import { MapPin } from 'lucide-react'
import { StudentAvatar } from '@/components/StudentAvatar'
import type { PublicStudent } from '@/types'
import { RankBadge } from './RankBadge'
import { accent, u } from './units'

export type CardSize = 'md' | 'sm'

/** Card geometry in stage units; layouts use these to compute what fits on screen. */
export const CARD = {
  md: { height: 8.4, avatar: 4.4, badge: 2.8, name: 1.22, school: 0.9, city: 0.76, pad: 0.9, gap: 1.05, minWidth: 16 },
  sm: { height: 5.2, avatar: 3.2, badge: 1.9, name: 1.02, school: 0.78, city: 0, pad: 0.75, gap: 0.8, minWidth: 14 },
} as const

/** Gap between cards in a wall/grid, in stage units. */
export const CARD_GAP = 1

/**
 * Premium glass card for one winner. Fixed height (CARD[size].height) so walls can be laid out
 * deterministically; text clamps gracefully instead of growing the card.
 * No backdrop-filter on purpose: walls render hundreds of these and blur would cost frames.
 */
export function StudentCard({
  student,
  size = 'md',
  className,
  style,
}: {
  student: PublicStudent
  size?: CardSize
  className?: string
  style?: CSSProperties
}) {
  const m = CARD[size]
  const top3 = student.rank <= 3
  return (
    <article className={clsx('relative', className)} style={{ height: u(m.height), contain: 'layout paint', ...style }}>
      {/* accent gradient border */}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: u(1.1),
          background: top3
            ? 'linear-gradient(135deg, #fff1a8, #ffd23f 30%, rgba(255,210,63,.15) 55%, #f59e0b)'
            : `linear-gradient(135deg, ${accent(0.95)} 0%, ${accent(0.18)} 38%, rgba(255,255,255,.08) 62%, ${accent(0.7)} 100%)`,
        }}
      />
      {/* glass face */}
      <div
        className="absolute overflow-hidden"
        style={{
          inset: 2,
          borderRadius: `calc(${u(1.1)} - 2px)`,
          background: 'linear-gradient(160deg, rgba(31,94,255,.42) 0%, rgba(10,42,133,.78) 38%, rgba(4,20,69,.92) 100%)',
        }}
      >
        <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.11), transparent)' }} />
        <div className="absolute inset-x-[6%] top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)' }} />
        <div
          className="absolute -right-1/4 -top-1/2 h-full w-3/4 rounded-full"
          style={{ background: `radial-gradient(circle, ${accent(0.28)}, transparent 70%)` }}
        />
      </div>

      <div className="relative flex h-full items-center" style={{ padding: u(m.pad), gap: u(m.gap) }}>
        <div className="relative shrink-0" style={{ width: u(m.avatar), height: u(m.avatar), fontSize: u(m.avatar * 0.8) }}>
          {/* pre-baked glow (static gradient instead of a blurred box-shadow) */}
          <div className="absolute rounded-full" style={{ inset: u(-0.9), background: `radial-gradient(closest-side, ${accent(0.55)}, ${accent(0)})` }} />
          <div
            className="relative h-full w-full rounded-full"
            style={{
              padding: u(0.18),
              background: top3 ? 'linear-gradient(160deg,#fff1a8,#f59e0b)' : `linear-gradient(160deg, #ffffff, ${accent(1)})`,
            }}
          >
            <StudentAvatar name={student.name} photoUrl={student.photoUrl} rank={student.rank} className="h-full w-full" ring="ring-navy-900" />
          </div>
          <div className="absolute" style={{ right: u(-m.badge * 0.42), bottom: u(-m.badge * 0.3) }}>
            <RankBadge rank={student.rank} size={m.badge} />
          </div>
        </div>

        <div className="min-w-0 flex-1" style={{ paddingLeft: u(m.badge * 0.25) }}>
          <h3
            className={clsx('break-words font-sans font-semibold text-white', size === 'md' ? 'line-clamp-2' : 'line-clamp-1')}
            style={{ fontSize: u(m.name), lineHeight: 1.16, textShadow: '0 1px 2px rgba(2,10,36,.6)' }}
            title={student.name}
          >
            {student.name}
          </h3>
          <p
            className={clsx('break-words font-sans text-white/75', size === 'md' ? 'line-clamp-2' : 'line-clamp-1')}
            style={{ fontSize: u(m.school), lineHeight: 1.25, marginTop: u(0.2) }}
          >
            {student.school}
          </p>
          {m.city > 0 && student.city && (
            <p
              className="flex items-center truncate font-sans font-medium uppercase"
              style={{ fontSize: u(m.city), marginTop: u(0.25), gap: u(0.3), letterSpacing: '0.08em', color: '#8fe9ff' }}
            >
              <MapPin style={{ width: u(m.city * 1.1), height: u(m.city * 1.1) }} className="shrink-0" />
              <span className="truncate">{student.city}</span>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
