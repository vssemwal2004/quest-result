import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Upload, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface FileDropProps {
  /** Comma separated extensions, e.g. ".csv,.xlsx" or ".jpg,.jpeg,.png,.webp". */
  accept: string
  multiple?: boolean
  /** Receives the files whose extension matches `accept`, plus any that were rejected. */
  onFiles: (accepted: File[], rejected: File[]) => void
  title: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  disabled?: boolean
  compact?: boolean
  className?: string
  children?: ReactNode
}

function matchesAccept(file: File, accept: string): boolean {
  const name = file.name.toLowerCase()
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .some((a) => (a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? file.type.startsWith(a.slice(0, -1)) : file.type === a))
}

/** Drag & drop zone that is also a keyboard-accessible "browse" button. */
export function FileDrop({
  accept,
  multiple,
  onFiles,
  title,
  hint,
  icon: Icon = Upload,
  disabled,
  compact,
  className,
  children,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = (list: FileList | null) => {
    if (!list || disabled) return
    const files = multiple ? [...list] : [...list].slice(0, 1)
    onFiles(
      files.filter((f) => matchesAccept(f, accept)),
      files.filter((f) => !matchesAccept(f, accept)),
    )
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    handle(e.dataTransfer.files)
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={onDrop}
      className={clsx(
        'relative rounded-2xl border-2 border-dashed transition',
        over ? 'border-cyan-glow bg-cyan-glow/10 shadow-glow' : 'border-white/15 bg-navy-950/40 hover:border-cyan-glow/50',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'flex w-full flex-col items-center justify-center gap-2 rounded-2xl text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60',
          compact ? 'px-4 py-5' : 'px-6 py-10',
        )}
      >
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-glow/30 bg-cyan-glow/10 text-cyan-glow">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-white">{title}</span>
        {hint && <span className="text-xs text-white/50">{hint}</span>}
      </button>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
