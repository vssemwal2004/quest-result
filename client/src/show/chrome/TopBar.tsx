import { motion } from 'framer-motion'
import type { Settings } from '@/types'
import { GlowDivider } from '../brand/GlowDivider'
import { OrgLockup } from '../brand/OrgLockup'
import { QuestLogo } from '../brand/QuestLogo'
import { LAYOUT } from '../contracts'

/** Slim brand bar shown above tier and finale stages (exactly LAYOUT.topBar tall). */
export function TopBar({ settings }: { settings: Settings }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-8 px-[2.5vw]"
      style={{
        height: LAYOUT.topBar,
        background: 'linear-gradient(180deg, rgba(2,10,36,0.92) 0%, rgba(2,10,36,0.6) 62%, rgba(2,10,36,0) 100%)',
      }}
    >
      <OrgLockup settings={settings} compact />
      <div className="flex shrink-0 items-center gap-5">
        <QuestLogo size="sm" />
        <span className="h-9 w-px bg-gradient-to-b from-transparent via-white/35 to-transparent" />
        <span
          className="font-tech text-[17px] font-extrabold uppercase tracking-[0.24em] text-white"
          style={{ textShadow: '0 0 14px rgba(56,225,255,0.65)' }}
        >
          {settings.eventEdition}
        </span>
      </div>
      <GlowDivider className="absolute inset-x-[2.5vw] bottom-1 opacity-30" />
    </motion.header>
  )
}
