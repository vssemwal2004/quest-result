import clsx from 'clsx'

const SIZES = {
  sm: 'text-2xl',
  md: 'text-4xl',
  lg: 'text-6xl sm:text-7xl',
} as const

/**
 * Poster-style "AI Quest" wordmark in CSS: chunky italic electric-blue "AI" + gold "Quest",
 * with stacked drop-shadows for the extruded 3D look.
 */
export function QuestLockup({ size = 'md', className }: { size?: keyof typeof SIZES; className?: string }) {
  const depth = size === 'lg' ? 5 : size === 'md' ? 3 : 2
  return (
    <span
      className={clsx('inline-flex items-baseline gap-[0.02em] font-display font-black italic leading-none tracking-tight', SIZES[size], className)}
      aria-label="AI Quest"
    >
      <span
        className="text-ai-gradient -ml-[0.04em] pl-[0.04em] pr-[0.14em]"
        style={{
          filter: `drop-shadow(0 ${depth}px 0 #0b3bb3) drop-shadow(0 ${depth * 2}px 0 #072065) drop-shadow(0 0 ${depth * 5}px rgba(56,225,255,.55))`,
        }}
        aria-hidden
      >
        AI
      </span>
      <span
        className="text-gold-gradient pr-[0.1em]"
        style={{
          filter: `drop-shadow(0 ${depth}px 0 #c77d0a) drop-shadow(0 ${depth * 2}px 0 #7a4a05) drop-shadow(0 0 ${depth * 5}px rgba(255,210,63,.4))`,
        }}
        aria-hidden
      >
        Quest
      </span>
    </span>
  )
}
