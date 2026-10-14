import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { TriangleAlert, WandSparkles } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Tier, TierInput } from '@/types'
import { errorMessage, isApiError } from '../../lib/errors'
import { overlappingTiers, rangeSubtitle } from '../../lib/ranks'
import { ACCENT_SWATCHES, TIER_ICONS, TIER_ICON_OPTIONS, isHexColor, withAlpha } from '../../lib/tierMeta'
import { Drawer } from '../../ui/Modal'
import { Field } from '../../ui/Field'
import { Segmented } from '../../ui/Segmented'
import { Toggle } from '../../ui/Toggle'
import { Spinner } from '../../ui/Spinner'
import { StylePicker } from './StylePicker'
import { TierPreview } from './TierPreview'

type Form = Omit<TierInput, 'rankFrom' | 'rankTo'> & { rankFrom: string; rankTo: string }

function toForm(tier: Tier | null, others: Tier[]): Form {
  if (tier) {
    const { name, subtitle, prize, prizeAmount, style, color, icon, sortDirection, enabled } = tier
    return { name, subtitle, prize, prizeAmount, style, color, icon, sortDirection, enabled, rankFrom: String(tier.rankFrom), rankTo: String(tier.rankTo) }
  }
  const usedColors = new Set(others.map((t) => t.color.toLowerCase()))
  return {
    name: '',
    subtitle: '',
    rankFrom: '',
    rankTo: '',
    prize: '',
    prizeAmount: '',
    style: 'scroll',
    color: ACCENT_SWATCHES.find((c) => !usedColors.has(c)) ?? ACCENT_SWATCHES[0],
    icon: 'star',
    sortDirection: 'asc',
    enabled: true,
  }
}

const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : null)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
      <legend className="mb-1 font-display text-sm font-extrabold uppercase tracking-wider text-white/80">{title}</legend>
      {children}
    </fieldset>
  )
}

interface TierEditorProps {
  open: boolean
  tier: Tier | null
  allTiers: Tier[]
  onClose: () => void
  onSaved: (tier: Tier) => void
}

export function TierEditor({ open, tier, allTiers, onClose, onSaved }: TierEditorProps) {
  const formId = useId()
  const [form, setForm] = useState<Form>(() => toForm(tier, allTiers))
  const [subtitleAuto, setSubtitleAuto] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [serverRangeError, setServerRangeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(toForm(tier, allTiers))
    setSubtitleAuto(!tier || tier.subtitle === rangeSubtitle(tier.rankFrom, tier.rankTo))
    setSubmitted(false)
    setServerRangeError(null)
    setFormError(null)
    setBusy(false)
    // Reset only when the drawer opens for a (different) tier — not when the list refreshes underneath.
  }, [open, tier?.id])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key === 'rankFrom' || key === 'rankTo' || key === 'style' || key === 'enabled') setServerRangeError(null)
  }

  const from = toInt(form.rankFrom)
  const to = toInt(form.rankTo)
  const rangeValid = from !== null && to !== null && from >= 1 && to >= from
  const suggestion = rangeValid ? rangeSubtitle(from, to) : ''
  const subtitle = subtitleAuto ? suggestion : form.subtitle
  const conflicts = rangeValid && form.enabled ? overlappingTiers(allTiers, from, to, tier?.id) : []

  const errors = {
    name: !form.name.trim() ? 'Give the tier a name.' : form.name.length > 80 ? 'Keep the name under 80 characters.' : null,
    range:
      from === null || from < 1
        ? 'Enter the first rank (1 or more).'
        : to === null
          ? 'Enter the last rank.'
          : to < from
            ? '“To” must be greater than or equal to “From”.'
            : form.style === 'podium' && to - from + 1 > 3
              ? `The 3D podium holds at most 3 ranks — this range has ${to - from + 1}.`
              : conflicts.length
                ? `Overlaps ${conflicts.map((t) => `${t.name} (${t.rankFrom}–${t.rankTo})`).join(', ')}. Change the range or disable one tier.`
                : null,
    color: isHexColor(form.color) ? null : 'Use a hex colour like #38bdf8.',
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const show = (msg: string | null) => (submitted ? msg : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors || busy || from === null || to === null) return
    const input: TierInput = { ...form, name: form.name.trim(), subtitle: subtitle.trim(), rankFrom: from, rankTo: to }
    setBusy(true)
    setFormError(null)
    try {
      const { tier: saved } = tier ? await api.updateTier(tier.id, input) : await api.createTier(input)
      toast.success(tier ? `Saved “${saved.name}”` : `Created “${saved.name}”`)
      onSaved(saved)
    } catch (err) {
      const rangeRelated = isApiError(err, 'TIER_OVERLAP') || (isApiError(err) && err.status === 400 && /podium|rank/i.test(err.message))
      if (rangeRelated) setServerRangeError(errorMessage(err))
      else setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const rangeError = serverRangeError ?? (submitted || conflicts.length ? errors.range : null)
  const isPodium = form.style === 'podium'
  const accent = isHexColor(form.color) ? form.color : '#38e1ff'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={tier ? `Edit tier · ${tier.name}` : 'New prize tier'}
      description="A tier is one stage of the show: a rank range, its prize and how it is revealed."
      hero={
        <div className="border-b border-white/10 bg-navy-950/40 px-6 py-4">
          <TierPreview
            name={form.name}
            subtitle={subtitle}
            rankFrom={from}
            rankTo={to}
            prize={form.prize}
            prizeAmount={form.prizeAmount}
            color={accent}
            icon={form.icon}
            style={form.style}
          />
        </div>
      }
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn-gold px-5 py-2.5 text-sm" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            {tier ? 'Save tier' : 'Create tier'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-6">
        <Section title="Basics">
          <Field label="Tier name" required error={show(errors.name)}>
            {(p) => <input {...p} className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Top 20 Stars" maxLength={80} />}
          </Field>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rank from" required>
                {(p) => (
                  <input
                    {...p}
                    aria-invalid={rangeError ? true : undefined}
                    className="input font-tech"
                    inputMode="numeric"
                    value={form.rankFrom}
                    onChange={(e) => set('rankFrom', e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="4"
                  />
                )}
              </Field>
              <Field label="Rank to" required>
                {(p) => (
                  <input
                    {...p}
                    aria-invalid={rangeError ? true : undefined}
                    className="input font-tech"
                    inputMode="numeric"
                    value={form.rankTo}
                    onChange={(e) => set('rankTo', e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="20"
                  />
                )}
              </Field>
            </div>
            {rangeError ? (
              <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-300">
                <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {rangeError}
              </p>
            ) : (
              rangeValid && <p className="mt-2 text-xs text-white/50">{to - from + 1} rank{to === from ? '' : 's'} in this tier.</p>
            )}
          </div>
          <Field label="Subtitle" hint={subtitleAuto ? 'Generated from the range. Type to customise.' : 'Shown under the tier name. May be empty.'}>
            {(p) => (
              <div className="flex gap-2">
                <input
                  {...p}
                  className="input"
                  value={subtitle}
                  onChange={(e) => {
                    setSubtitleAuto(false)
                    set('subtitle', e.target.value)
                  }}
                  placeholder={suggestion || 'Ranks X – Y'}
                  maxLength={120}
                />
                <button
                  type="button"
                  className={clsx('btn-ghost shrink-0 px-3 text-xs', subtitleAuto && 'border-cyan-glow/50 text-cyan-glow')}
                  onClick={() => setSubtitleAuto(true)}
                  aria-pressed={subtitleAuto}
                  title="Use the suggested subtitle"
                >
                  <WandSparkles className="h-3.5 w-3.5" aria-hidden /> Auto
                </button>
              </div>
            )}
          </Field>
        </Section>

        <Section title="Prize">
          <Field label="Prize" hint="e.g. Certificate of Merit + Goodies">
            {(p) => <input {...p} className="input" value={form.prize} onChange={(e) => set('prize', e.target.value)} maxLength={160} />}
          </Field>
          <Field label="Prize amount" hint="Optional free text, e.g. ₹1,00,000 or Up to ₹1 Lakh">
            {(p) => <input {...p} className="input" value={form.prizeAmount} onChange={(e) => set('prizeAmount', e.target.value)} maxLength={60} />}
          </Field>
        </Section>

        <Section title="Display style">
          <StylePicker value={form.style} onChange={(s) => set('style', s)} color={accent} />
          <div>
            <p className="label">Reveal order inside tier</p>
            <Segmented
              ariaLabel="Reveal order inside tier"
              value={form.sortDirection}
              onChange={(v) => set('sortDirection', v)}
              disabled={isPodium}
              options={[
                { value: 'asc', label: rangeValid ? `${from} → ${to}` : 'Ascending' },
                { value: 'desc', label: rangeValid ? `${to} → ${from}` : 'Descending' },
              ]}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-white/50">
              {isPodium
                ? 'The podium always reveals 3rd → 2nd → 1st.'
                : 'The order names appear in the list and in one-by-one reveals. Descending builds suspense towards the best rank.'}
            </p>
          </div>
        </Section>

        <Section title="Look">
          <Field label="Accent colour" error={show(errors.color)}>
            {(p) => (
              <div className="flex flex-wrap items-center gap-2">
                {ACCENT_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('color', c)}
                    className={clsx(
                      'h-8 w-8 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
                      form.color.toLowerCase() === c ? 'scale-110 border-white' : 'border-transparent hover:scale-105',
                    )}
                    style={{ background: c, boxShadow: form.color.toLowerCase() === c ? `0 0 14px ${c}` : undefined }}
                    aria-label={`Use colour ${c}`}
                    aria-pressed={form.color.toLowerCase() === c}
                  />
                ))}
                <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-white/30" title="Custom colour">
                  <input
                    type="color"
                    value={isHexColor(form.color) && form.color.length === 7 ? form.color : '#38e1ff'}
                    onChange={(e) => set('color', e.target.value)}
                    className="absolute -inset-2 h-12 w-12 cursor-pointer opacity-0"
                    aria-label="Pick a custom colour"
                  />
                  <span className="block h-full w-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)] opacity-80" aria-hidden />
                </label>
                <input {...p} className="input w-28 font-mono text-sm" value={form.color} onChange={(e) => set('color', e.target.value)} maxLength={7} />
              </div>
            )}
          </Field>
          <div>
            <p className="label" id={`${formId}-icon`}>
              Icon
            </p>
            <div role="radiogroup" aria-labelledby={`${formId}-icon`} className="flex flex-wrap gap-2">
              {TIER_ICON_OPTIONS.map((key) => {
                const Icon = TIER_ICONS[key]
                const active = form.icon === key
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={key}
                    title={key}
                    onClick={() => set('icon', key)}
                    className={clsx(
                      'grid h-11 w-11 place-items-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-glow/60',
                      active ? 'border-transparent' : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white',
                    )}
                    style={active ? { color: accent, background: withAlpha(accent, 0.14), boxShadow: `inset 0 0 0 2px ${accent}` } : undefined}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </button>
                )
              })}
            </div>
          </div>
        </Section>

        <Section title="Availability">
          <Toggle
            checked={form.enabled}
            onChange={(v) => set('enabled', v)}
            label="Enabled"
            description="Disabled tiers are skipped in the show and ignored by the overlap check."
          />
        </Section>

        {formError && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {formError}
          </p>
        )}
      </form>
    </Drawer>
  )
}
