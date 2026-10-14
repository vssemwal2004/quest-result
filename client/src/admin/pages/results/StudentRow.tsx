import { memo, type ReactNode } from 'react'
import { Camera, ImageOff, Pencil, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { Student, Tier } from '@/types'
import { StudentAvatar } from '@/components/StudentAvatar'
import { Badge } from '../../ui/Badge'
import { Spinner } from '../../ui/Spinner'

const MEDAL: Record<number, string> = {
  1: 'bg-gold-gradient text-navy-900 shadow-glow-gold',
  2: 'bg-gradient-to-b from-white to-silver text-navy-900',
  3: 'bg-gradient-to-b from-amber-300 to-bronze text-navy-900',
}

interface StudentRowProps {
  student: Student
  tier: Tier | undefined
  photoBusy: boolean
  onEdit: (s: Student) => void
  onDelete: (s: Student) => void
  onUploadPhoto: (s: Student) => void
  onRemovePhoto: (s: Student) => void
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        'rounded-lg p-1.5 transition sm:p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60 disabled:opacity-40',
        danger ? 'text-white/50 hover:bg-red-500/15 hover:text-red-300' : 'text-white/50 hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  )
}

export const StudentRow = memo(function StudentRow({
  student: s,
  tier,
  photoBusy,
  onEdit,
  onDelete,
  onUploadPhoto,
  onRemovePhoto,
}: StudentRowProps) {
  return (
    <tr className="group border-b border-white/5 transition-colors hover:bg-white/[0.04]">
      <td className="py-3 pl-4 pr-2 sm:pl-5 sm:pr-3">
        <span
          className={clsx(
            'inline-grid h-9 min-w-[2.25rem] place-items-center rounded-lg px-2 font-tech text-sm font-bold',
            MEDAL[s.rank] ?? 'border border-white/10 bg-white/5 text-white/85',
          )}
        >
          {s.rank}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <StudentAvatar name={s.name} photoUrl={s.photoUrl} rank={s.rank} className="h-10 w-10 text-[2.5rem]" />
            {photoBusy && (
              <span className="absolute inset-0 grid place-items-center rounded-full bg-navy-950/70">
                <Spinner className="h-4 w-4 text-cyan-glow" label="Uploading photo" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onEdit(s)}
              className="block max-w-[8.5rem] truncate text-left font-semibold sm:max-w-[16rem] text-white hover:text-cyan-glow focus-visible:outline-none focus-visible:underline"
            >
              {s.name}
            </button>
            <p className="max-w-[8.5rem] truncate text-xs text-white/50 sm:max-w-[16rem] lg:hidden">{s.school}</p>
          </div>
        </div>
      </td>
      <td className="hidden max-w-[18rem] px-3 py-3 text-sm text-white/75 lg:table-cell">
        <span className="line-clamp-2">{s.school}</span>
      </td>
      <td className="hidden px-3 py-3 text-sm text-white/65 xl:table-cell">{s.city ?? <span className="text-white/25">—</span>}</td>
      <td className="hidden px-3 py-3 text-right text-sm font-semibold tabular-nums text-white/80 md:table-cell">
        {s.score ?? <span className="text-white/25">—</span>}
      </td>
      <td className="hidden px-3 py-3 sm:table-cell">
        {tier ? (
          <Badge color={tier.color} dot className={clsx('max-w-[11rem]', !tier.enabled && 'opacity-50')} title={tier.enabled ? tier.name : `${tier.name} (disabled)`}>
            {tier.name}
          </Badge>
        ) : (
          <Badge tone="amber" title="Not inside any tier — will not appear in the show">
            No tier
          </Badge>
        )}
      </td>
      <td className="py-3 pl-1 pr-3 sm:pl-3 sm:pr-4">
        <div className="flex items-center justify-end gap-0.5">
          <IconButton label={s.photoUrl ? `Replace photo of ${s.name}` : `Upload photo of ${s.name}`} onClick={() => onUploadPhoto(s)} disabled={photoBusy} className="hidden sm:block">
            <Camera className="h-4 w-4" />
          </IconButton>
          {s.photoUrl && (
            <IconButton label={`Remove photo of ${s.name}`} onClick={() => onRemovePhoto(s)} disabled={photoBusy} className="hidden sm:block">
              <ImageOff className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton label={`Edit ${s.name}`} onClick={() => onEdit(s)}>
            <Pencil className="h-4 w-4" />
          </IconButton>
          <IconButton label={`Delete ${s.name}`} onClick={() => onDelete(s)} danger>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </td>
    </tr>
  )
})
