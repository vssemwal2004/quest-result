import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Settings } from '@/types'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useLive } from '../../state/LiveContext'
import { errorMessage } from '../../lib/errors'
import { PageHeader, Panel } from '../../ui/Panel'
import { Field } from '../../ui/Field'
import { ErrorState } from '../../ui/EmptyState'
import { PageLoader, Spinner } from '../../ui/Spinner'
import { Kbd } from '../../ui/Kbd'
import { LinesEditor } from './LinesEditor'
import { LogoSection } from './LogoSection'
import { DisplaySection, SCROLL_MAX, SCROLL_MIN } from './DisplaySection'
import { AccountSection } from './AccountSection'

type Editable = Omit<Settings, 'logoUrl' | 'updatedAt'>

const EDITABLE_KEYS = [
  'eventTitle',
  'eventEdition',
  'tagline',
  'subTagline',
  'organization',
  'location',
  'eventDate',
  'contact',
  'handwrittenLines',
  'finaleTitle',
  'finaleMessage',
  'spoilerProtection',
  'autoScrollSpeed',
  'showRobot',
  'quality',
] as const satisfies ReadonlyArray<keyof Editable>

type TextKey = 'eventTitle' | 'eventEdition' | 'tagline' | 'subTagline' | 'organization' | 'location' | 'contact' | 'finaleTitle'

const TEXT_FIELDS: Array<{ key: TextKey; label: string; hint?: string; required?: boolean; wide?: boolean }> = [
  { key: 'eventTitle', label: 'Event title', required: true, hint: 'Rendered as the 3D “AI Quest” lockup on the intro.' },
  { key: 'eventEdition', label: 'Edition line', hint: 'e.g. Results 2026' },
  { key: 'tagline', label: 'Ribbon tagline', hint: 'White pill ribbon, e.g. Learn from the best' },
  { key: 'subTagline', label: 'Sub-tagline', hint: 'Line under the ribbon' },
  { key: 'organization', label: 'Organisation', wide: true },
  { key: 'location', label: 'Location' },
  { key: 'contact', label: 'Contact line', hint: 'Shown on the finale' },
  { key: 'finaleTitle', label: 'Finale title', wide: true },
]

function pickEditable(s: Settings): Editable {
  const { logoUrl: _logo, updatedAt: _updated, ...rest } = s
  return rest
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Only the fields that changed — so a save never overwrites something another tab just changed. */
function diff(saved: Settings, form: Editable): Partial<Settings> {
  const patch: Partial<Settings> = {}
  for (const key of EDITABLE_KEYS) {
    if (!sameValue(saved[key], form[key])) (patch as Record<string, unknown>)[key] = form[key]
  }
  return patch
}

function normalise(form: Editable): Editable {
  const trimmed = { ...form }
  for (const { key } of TEXT_FIELDS) trimmed[key] = form[key].trim()
  trimmed.finaleMessage = form.finaleMessage.trim()
  trimmed.handwrittenLines = form.handwrittenLines.map((l) => l.trim()).filter(Boolean)
  trimmed.autoScrollSpeed = Math.min(SCROLL_MAX, Math.max(SCROLL_MIN, Math.round(form.autoScrollSpeed)))
  return trimmed
}

export function SettingsPage() {
  useDocumentTitle('Settings')
  const { settings: saved, applySettings, loading, error, reload } = useLive()
  const [form, setForm] = useState<Editable | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const linesId = useId()
  const finaleId = useId()

  const patch = saved && form ? diff(saved, normalise(form)) : {}
  const dirty = Object.keys(patch).length > 0
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // Adopt server changes (e.g. from another admin tab) unless the user has unsaved edits.
  useEffect(() => {
    if (saved && (form === null || !dirtyRef.current)) setForm(pickEditable(saved))
    // `form` is intentionally not a dependency: we only react to new server data.
  }, [saved])

  const titleError = form && !form.eventTitle.trim() ? 'The event title cannot be empty.' : null

  const save = useCallback(async () => {
    if (!saved || !form || saving) return
    setSubmitted(true)
    if (titleError) return
    const changes = diff(saved, normalise(form))
    if (!Object.keys(changes).length) return
    setSaving(true)
    try {
      const res = await api.updateSettings(changes)
      applySettings(res.settings)
      setForm(pickEditable(res.settings))
      setSubmitted(false)
      toast.success('Settings saved — big screens updated')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }, [saved, form, saving, titleError, applySettings])

  // Ctrl/Cmd+S saves; warn before leaving with unsaved edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [save])

  if (loading && !saved) return <PageLoader label="Loading settings…" />
  if (!saved || !form) return <ErrorState error={error} onRetry={() => void reload()} title="Could not load settings" />

  const set = <K extends keyof Editable>(key: K, value: Editable[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <>
      <PageHeader title="Settings" description="Branding and display options for the big screen, plus your admin account." />

      <div className="space-y-6">
        <Panel title="Event branding" description="Text shown on the intro, tier cards and finale.">
          <div className="grid gap-4 md:grid-cols-2">
            {TEXT_FIELDS.map(({ key, label, hint, required, wide }) => (
              <Field key={key} label={label} hint={hint} required={required} error={key === 'eventTitle' && submitted ? titleError : null} className={wide ? 'md:col-span-2' : undefined}>
                {(p) => <input {...p} className="input" value={form[key]} onChange={(e) => set(key, e.target.value)} maxLength={160} />}
              </Field>
            ))}
            <Field label="Event date">
              {(p) => <input {...p} type="date" className="input [color-scheme:dark]" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />}
            </Field>
            <div className="md:col-span-2">
              <label htmlFor={finaleId} className="label">
                Finale message
              </label>
              <textarea
                id={finaleId}
                className="input min-h-[5rem] resize-y"
                value={form.finaleMessage}
                onChange={(e) => set('finaleMessage', e.target.value)}
                maxLength={400}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor={linesId} className="label">
                Handwritten lines
              </label>
              <p className="-mt-0.5 mb-3 text-xs text-white/50">The yellow script accent from the poster, one line each (max 6).</p>
              <LinesEditor id={linesId} value={form.handwrittenLines} onChange={(lines) => set('handwrittenLines', lines)} />
            </div>
          </div>
        </Panel>

        <LogoSection logoUrl={saved.logoUrl} onSaved={applySettings} />

        <DisplaySection
          value={form}
          onChange={(changes) => setForm((f) => (f ? { ...f, ...changes } : f))}
        />

        <AccountSection />
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:pl-64"
          >
            <div className="glass-strong flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-2xl px-5 py-3 shadow-glow">
              <p className="mr-auto text-sm text-white/80">
                <span className="font-semibold text-gold-300">Unsaved changes</span> · {Object.keys(patch).length} field
                {Object.keys(patch).length === 1 ? '' : 's'}
                <span className="ml-2 hidden text-white/40 sm:inline">
                  <Kbd>Ctrl</Kbd> + <Kbd>S</Kbd>
                </span>
              </p>
              <button type="button" className="btn-ghost text-sm" onClick={() => setForm(pickEditable(saved))} disabled={saving}>
                <Undo2 className="h-4 w-4" aria-hidden /> Discard
              </button>
              <button type="button" className="btn-gold px-5 py-2.5 text-sm" onClick={() => void save()} disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" aria-hidden />}
                Save changes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
