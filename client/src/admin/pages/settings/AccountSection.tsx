import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { getTokenEmail, setToken } from '@/lib/auth'
import { errorMessage } from '../../lib/errors'
import { Panel } from '../../ui/Panel'
import { Field } from '../../ui/Field'
import { Spinner } from '../../ui/Spinner'

const MIN_LENGTH = 6

export function AccountSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const errors = {
    current: current ? null : 'Enter your current password.',
    next: next.length >= MIN_LENGTH ? (next === current ? 'Choose a password different from the current one.' : null) : `Use at least ${MIN_LENGTH} characters.`,
    confirm: confirm === next ? null : 'Passwords do not match.',
  }
  const show = (msg: string | null) => (submitted ? msg : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (busy || Object.values(errors).some(Boolean)) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.changePassword(current, next)
      // The server revokes every older token on a password change; keep this session alive.
      if (res?.token) setToken(res.token)
      toast.success('Password changed')
      setCurrent('')
      setNext('')
      setConfirm('')
      setSubmitted(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const type = reveal ? 'text' : 'password'

  return (
    <Panel title="Account" description={`Signed in as ${getTokenEmail() ?? 'admin'}.`}>
      <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-3">
        <Field label="Current password" error={show(errors.current)}>
          {(p) => <input {...p} type={type} className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
        </Field>
        <Field label="New password" hint={`At least ${MIN_LENGTH} characters`} error={show(errors.next)}>
          {(p) => <input {...p} type={type} className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label="Confirm new password" error={show(errors.confirm)}>
          {(p) => <input {...p} type={type} className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        {error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 md:col-span-3">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
          <button type="button" className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
            {reveal ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            {reveal ? 'Hide passwords' : 'Show passwords'}
          </button>
          <button type="submit" className="btn-blue" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" aria-hidden />}
            Change password
          </button>
        </div>
      </form>
    </Panel>
  )
}
