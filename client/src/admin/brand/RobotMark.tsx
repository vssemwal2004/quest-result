import { useId } from 'react'

/** The AI Quest mascot head: white shell, dark visor, glowing cyan eyes. Pure SVG. */
export function RobotMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 120 110" className={className} role="img" aria-label="AI Quest robot">
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#dbe7ff" />
          <stop offset="1" stopColor="#9fb6e6" />
        </linearGradient>
        <linearGradient id={`${id}-visor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1a4a" />
          <stop offset="1" stopColor="#020a24" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* antenna */}
      <line x1="60" y1="14" x2="60" y2="4" stroke="#cfdcff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="4" r="4" fill="#38e1ff" filter={`url(#${id}-glow)`} />
      {/* ears */}
      <rect x="4" y="44" width="14" height="30" rx="7" fill="#1f5eff" />
      <rect x="102" y="44" width="14" height="30" rx="7" fill="#1f5eff" />
      {/* head */}
      <rect x="12" y="14" width="96" height="86" rx="40" fill={`url(#${id}-shell)`} />
      <rect x="24" y="32" width="72" height="50" rx="24" fill={`url(#${id}-visor)`} />
      <path d="M32 40 q20 -8 40 -4" stroke="rgba(255,255,255,.25)" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* eyes */}
      <g filter={`url(#${id}-glow)`} stroke="#38e1ff" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M40 60 q7 -9 14 0" />
        <path d="M66 60 q7 -9 14 0" />
      </g>
      <path d="M52 70 q8 6 16 0" stroke="#38e1ff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
    </svg>
  )
}
