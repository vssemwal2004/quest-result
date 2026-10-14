import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { LiveProvider } from '../state/LiveContext'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div
            className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            className="glass-strong absolute inset-y-0 left-0 w-72 max-w-[85vw] border-y-0 border-l-0"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.28 }}
            aria-label="Navigation"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-5 rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
            <Sidebar variant="mobile" onNavigate={onClose} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <LiveProvider>
      <div className="aq-admin-bg min-h-full bg-navy-950">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-navy-950/60 backdrop-blur-xl lg:block">
          <Sidebar variant="desktop" />
        </aside>
        <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div className="lg:pl-64">
          <TopBar onOpenMenu={() => setMenuOpen(true)} />
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8"
          >
            <Outlet />
          </motion.main>
        </div>
      </div>
    </LiveProvider>
  )
}
