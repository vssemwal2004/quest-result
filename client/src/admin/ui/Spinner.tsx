import { LoaderCircle } from 'lucide-react'
import clsx from 'clsx'

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return <LoaderCircle role="status" aria-label={label} className={clsx('animate-spin', className ?? 'h-5 w-5')} />
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-white/60">
      <Spinner className="h-8 w-8 text-cyan-glow" label={label} />
      <p className="text-sm">{label}</p>
    </div>
  )
}
