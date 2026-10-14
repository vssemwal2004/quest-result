import { useEffect, useId, useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { errorMessage } from '../lib/errors'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  /** May be async; the dialog shows a spinner, closes on success and shows the error inline on failure. */
  onConfirm: () => unknown
  title: ReactNode
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  /** When set, the user must type this exact text before confirming (for irreversible bulk actions). */
  requireText?: string
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  requireText,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const inputId = useId()

  useEffect(() => {
    if (open) {
      setError(null)
      setTyped('')
      setBusy(false)
    }
  }, [open])

  const canConfirm = !busy && (!requireText || typed.trim() === requireText)

  const confirm = async () => {
    if (!canConfirm) return
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {tone === 'danger' && <TriangleAlert className="h-5 w-5 text-red-300" aria-hidden />}
          {title}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={clsx(tone === 'danger' ? 'btn-danger' : 'btn-blue', tone === 'danger' && 'border-red-400/50')}
            onClick={confirm}
            disabled={!canConfirm}
          >
            {busy && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void confirm()
        }}
      >
        <div className="text-sm leading-relaxed text-white/75">{message}</div>
        {requireText && (
          <div className="mt-4">
            <label htmlFor={inputId} className="label">
              Type <span className="font-mono text-red-200">{requireText}</span> to confirm
            </label>
            <input
              id={inputId}
              className="input font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
