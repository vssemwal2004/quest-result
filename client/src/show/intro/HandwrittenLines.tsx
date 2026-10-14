import { motion } from 'framer-motion'

/** Poster-style handwritten script lines (gold, tilted, staggered) with a yellow swoosh drawn under the last line. */
export function HandwrittenLines({ lines, className }: { lines: string[]; className?: string }) {
  const visible = lines.filter((l) => l.trim()).slice(0, 5)
  if (visible.length === 0) return null
  const swooshDelay = 0.6 + visible.length * 0.22

  return (
    <div className={className} style={{ transform: 'rotate(-9deg)', transformOrigin: '100% 0' }} aria-hidden>
      <div className="relative flex flex-col items-start">
        {visible.map((line, i) => (
          <motion.span
            key={`${i}-${line}`}
            className="block whitespace-nowrap font-script font-bold leading-[0.92] text-gold-300"
            style={{
              fontSize: 'calc(var(--u) * 3)',
              marginLeft: `calc(var(--u) * ${i * 1.3})`,
              textShadow: '0 0.04em 0 rgba(160,90,0,0.55), 0 0 0.5em rgba(255,210,63,0.35)',
            }}
            initial={{ opacity: 0, x: '-0.4em' }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.22, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            {line}
          </motion.span>
        ))}
        <svg
          viewBox="0 0 300 40"
          className="pointer-events-none -mt-[calc(var(--u)*0.4)]"
          style={{ width: 'calc(var(--u) * 15)', marginLeft: `calc(var(--u) * ${(visible.length - 1) * 1.3 + 0.6})` }}
        >
          <motion.path
            d="M6 30 C 80 18, 170 10, 292 6 C 230 14, 150 22, 70 34"
            fill="none"
            stroke="#ffd23f"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 0 6px rgba(255,210,63,0.6))' }}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: swooshDelay, duration: 0.9, ease: [0.65, 0, 0.35, 1] }}
          />
        </svg>
      </div>
    </div>
  )
}
