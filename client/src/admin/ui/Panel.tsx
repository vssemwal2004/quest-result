import type { ReactNode } from 'react'
import clsx from 'clsx'

interface PanelProps {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

/** Standard glass section container used across admin pages. */
export function Panel({ title, description, actions, children, className, bodyClassName }: PanelProps) {
  return (
    <section className={clsx('glass rounded-2xl', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-extrabold tracking-tight text-white">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-white/55">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-white/60">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
