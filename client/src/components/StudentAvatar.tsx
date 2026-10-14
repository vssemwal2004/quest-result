import clsx from 'clsx'

const GRADIENTS = [
  'from-cyan-400 to-royal-600',
  'from-sky-400 to-indigo-600',
  'from-violet-400 to-royal-600',
  'from-amber-300 to-orange-500',
  'from-emerald-400 to-cyan-600',
  'from-fuchsia-400 to-indigo-600',
]

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Student photo, or a deterministic gradient circle with initials when no photo exists. */
export function StudentAvatar({
  name,
  photoUrl,
  rank,
  className,
  ring,
}: {
  name: string
  photoUrl: string | null
  rank?: number
  className?: string
  ring?: string
}) {
  const g = GRADIENTS[Math.abs(rank ?? name.length) % GRADIENTS.length]
  return (
    <div
      className={clsx(
        'relative shrink-0 overflow-hidden rounded-full ring-2 ring-offset-0',
        ring ?? 'ring-white/25',
        className ?? 'h-12 w-12',
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
      ) : (
        <div
          className={clsx(
            'grid h-full w-full place-items-center bg-gradient-to-br font-display font-extrabold text-white',
            g,
          )}
          style={{ fontSize: '0.42em' }}
        >
          <span className="text-[1em] leading-none">{initials(name)}</span>
        </div>
      )}
    </div>
  )
}
