import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6em] items-center justify-center rounded-md border border-white/20 border-b-white/30 bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white/80 shadow-[inset_0_-1px_0_rgba(255,255,255,.15)]">
      {children}
    </kbd>
  )
}
