import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { TriangleAlert, WandSparkles } from 'lucide-react'
import clsx from 'clsx'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { PodiumPrize, Tier, TierInput } from '@/types'
import { errorMessage, isApiError } from '../../lib/errors'
import { overlappingTiers, rangeSubtitle } from '../../lib/ranks'
import { ACCENT_SWATCHES, TIER_ICONS, TIER_ICON_OPTIONS, isHexColor, withAlpha } from '../../lib/tierMeta'
import { Drawer } from '../../ui/Modal'
import { Field } from '../../ui/Field'
import { Segmented } from '../../ui/Segmented'
import { Toggle } from '../../ui/Toggle'
import { Spinner } from '../../ui/Spinner'
import { StylePicker } from './StylePicker'
import { GridPageEditor } from './GridPageEditor'
import { TierPreview } from './TierPreview'

type Form = Omit<TierInput, 'rankFrom' | 'rankTo'> & { rankFrom: string; rankTo: string }

function toForm(tier: Tier | null, others: Tier[]): Form {
  if (tier) {
    const { name, subtitle, prize, prizeAmount, podiumPrizes, podiumMode, style, color, icon, sortDirection, gridPageCounts, enabled } = tier
    return { name, subtitle, medalHeading: tier.medalHeading ?? '', prize, prizeAmount, podiumPrizes: style === 'podium' ? podiumPrizes ?? null : null, podiumMode: podiumMode ?? 'podium', style: style === 'scroll' ? 'grid' : style, color, icon, sortDirection, gridPageCounts: style === 'grid' || style === 'scroll' ? gridPageCounts : null, schoolNames: tier.schoolNames ?? [], winnerSchool: tier.winnerSchool ?? '', enabled, rankFrom: String(tier.rankFrom), rankTo: String(tier.rankTo) }
  }
  const usedColors = new Set(others.map((t) => t.color.toLowerCase()))
  return {
    name: '',
    subtitle: '',
    medalHeading: '',
    rankFrom: '',
    rankTo: '',
    prize: '',
    prizeAmount: '',
    podiumPrizes: null,
    podiumMode: 'podium',
    style: 'grid',
    color: ACCENT_SWATCHES.find((c) => !usedColors.has(c)) ?? ACCENT_SWATCHES[0],
    icon: 'star',
    sortDirection: 'asc',
    gridPageCounts: null,
    schoolNames: [],
    winnerSchool: '',
    enabled: true,
  }
}

const toInt = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : null)

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
      <legend className="mb-1 font-display text-sm font-extrabold uppercase tracking-wider text-white/80">{title}</legend>
      <p className="text-xs leading-relaxed text-white/55">{description}</p>
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
  const [schoolText, setSchoolText] = useState(() => (tier?.schoolNames ?? []).join('\n'))
  const [subtitleAuto, setSubtitleAuto] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [serverRangeError, setServerRangeError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(toForm(tier, allTiers))
    setSchoolText((tier?.schoolNames ?? []).join('\n'))
    setSubtitleAuto(!tier || (tier.style !== 'school' && tier.subtitle === rangeSubtitle(tier.rankFrom, tier.rankTo)))
    setSubmitted(false)
    setServerRangeError(null)
    setFormError(null)
    setBusy(false)
    // Reset only when the drawer opens for a (different) tier — not when the list refreshes underneath.
  }, [open, tier?.id])

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key === 'rankFrom' || key === 'rankTo' || key === 'style' || key === 'gridPageCounts' || key === 'enabled') setServerRangeError(null)
  }

  const from = toInt(form.rankFrom)
  const to = toInt(form.rankTo)
  const rangeValid = from !== null && to !== null && from >= 1 && to >= from
  const suggestion = form.style === 'school' ? 'Best School' : rangeValid ? rangeSubtitle(from, to) : ''
  const podiumRanks = rangeValid && form.style === 'podium' && to - from < 4
    ? Array.from({ length: to - from + 1 }, (_, index) => from + index)
    : []
  const subtitle = subtitleAuto ? suggestion : form.subtitle
  const conflicts = rangeValid && form.enabled && form.style !== 'school' ? overlappingTiers(allTiers.filter((item) => item.style !== 'school'), from, to, tier?.id) : []
  const schoolNames = form.schoolNames ?? []
  const uniqueSchools = new Set(schoolNames.map((name) => name.toLocaleLowerCase()))

  const errors = {
    name: !form.name.trim() ? 'Give the tier a name.' : form.name.length > 80 ? 'Keep the name under 80 characters.' : null,
    range: form.style === 'school' ? null :
      from === null || from < 1
        ? 'Enter the first rank (1 or more).'
        : to === null
          ? 'Enter the last rank.'
          : to < from
            ? '“To” must be greater than or equal to “From”.'
            : form.style === 'podium' && to - from + 1 > 4
              ? `The 3D podium holds at most 4 ranks — this range has ${to - from + 1}.`
              : conflicts.length
                ? `Overlaps ${conflicts.map((t) => `${t.name} (${t.rankFrom}–${t.rankTo})`).join(', ')}. Change the range or disable one tier.`
                : null,
    color: isHexColor(form.color) ? null : 'Use a hex colour like #38bdf8.',
    pages: form.style === 'grid' && form.gridPageCounts !== null && rangeValid && (
      form.gridPageCounts.length < 1 || form.gridPageCounts.length > 500 ||
      form.gridPageCounts.some((count) => !Number.isInteger(count) || count < 1 || count > 25) ||
      form.gridPageCounts.reduce((sum, count) => sum + count, 0) !== to! - from! + 1
    ) ? 'Manual pages must cover every rank, with 1–25 ranks on each page.' : null,
    schools: form.style === 'school' && (schoolNames.length < 10 || schoolNames.length > 20 || uniqueSchools.size !== schoolNames.length)
      ? 'Enter 10–20 unique school names, one per line.' : null,
    winner: form.style === 'school' && !schoolNames.includes(form.winnerSchool ?? '') ? 'Select the winning school.' : null,
  }
  const hasErrors = Object.values(errors).some(Boolean)
  const firstError = Object.values(errors).find((message): message is string => typeof message === 'string') ?? null
  const saveError = formError ?? serverRangeError ?? (submitted ? firstError : null)
  const show = (msg: string | null) => (submitted ? msg : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors || busy || (form.style !== 'school' && (from === null || to === null))) return
    const podiumPrizes = form.style === 'podium' && form.podiumPrizes !== null
      ? podiumRanks.map((rank) => form.podiumPrizes?.find((entry) => entry.rank === rank) ?? { rank, prize: '', prizeAmount: '' })
      : null
    const input: TierInput = { ...form, name: form.name.trim(), subtitle: subtitle.trim(), rankFrom: form.style === 'school' ? 1 : from!, rankTo: form.style === 'school' ? 1 : to!, podiumPrizes }
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
  const setPodiumPrize = (rank: number, key: 'prize' | 'prizeAmount', value: string) => {
    setForm((current) => ({
      ...current,
      podiumPrizes: podiumRanks.map((r): PodiumPrize => {
        const entry = current.podiumPrizes?.find((item) => item.rank === r) ?? { rank: r, prize: '', prizeAmount: '' }
        return r === rank ? { ...entry, [key]: value } : entry
      }),
    }))
  }

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
            prize={form.podiumPrizes !== null && isPodium ? 'Individual prizes by rank' : form.prize}
            prizeAmount={form.podiumPrizes !== null && isPodium ? '' : form.prizeAmount}
            color={accent}
            icon={form.icon}
            style={form.style}
          />
        </div>
      }
      footer={
        <>
          {saveError && <p role="alert" className="w-full text-sm font-medium text-red-200">{saveError}</p>}
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
        <Section title="Basics" description="Set the title and text people will see when this stage begins.">
          <Field label="Tier name" required hint="Example: Exceptional Performance. This is the main stage heading." error={show(errors.name)}>
            {(p) => <input {...p} className="input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Exceptional Performance" maxLength={80} />}
          </Field>
          {form.style === 'school' && <p className="text-xs leading-relaxed text-white/55">Best School uses the candidate list below, so you do not need to enter a rank range.</p>}
          {form.style !== 'school' && <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rank from" required hint="First rank in this tier. Example: 4.">
                {(p) => (
                  <input
                    {...p}
                    aria-invalid={rangeError ? true : undefined}
                    className="input font-tech"
                    inputMode="numeric"
                    value={form.rankFrom}
                    onChange={(e) => set('rankFrom', e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="e.g. 4"
                  />
                )}
              </Field>
              <Field label="Rank to" required hint="Last rank in this tier. Example: 20.">
                {(p) => (
                  <input
                    {...p}
                    aria-invalid={rangeError ? true : undefined}
                    className="input font-tech"
                    inputMode="numeric"
                    value={form.rankTo}
                    onChange={(e) => set('rankTo', e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="e.g. 20"
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
          </div>}
          <Field label={form.style === 'school' ? 'Opening subtitle' : 'Subtitle'} hint={form.style === 'school' ? 'Shown below the main yellow heading when this stage begins. The medal heading has its own field under Prize.' : subtitleAuto ? 'Example: Ranks 4–20. Auto fills this from the rank range; type to customise.' : 'Example: Rising Stars of 2026. Shown below the stage title; may be empty.'}>
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
                  placeholder={form.style === 'school' ? 'e.g. Exceptional Performance at AI Quest 2026' : suggestion || 'e.g. Ranks 4–20'}
                  maxLength={120}
                />
                {form.style !== 'school' && <button
                  type="button"
                  className={clsx('btn-ghost shrink-0 px-3 text-xs', subtitleAuto && 'border-cyan-glow/50 text-cyan-glow')}
                  onClick={() => setSubtitleAuto(true)}
                  aria-pressed={subtitleAuto}
                  title="Use the suggested subtitle"
                >
                  <WandSparkles className="h-3.5 w-3.5" aria-hidden /> Auto
                </button>}
              </div>
            )}
          </Field>
        </Section>

        {form.style === 'school' && <Section title="Best School candidates" description="List the schools in the shuffle, then choose the one the audience will see at the reveal.">
          <Field label="School names" required hint="Example: one full school name per line. Add 10–20 different schools." error={show(errors.schools)}>
            {(p) => <textarea {...p} className="input min-h-48" value={schoolText} onChange={(e) => { setSchoolText(e.target.value); set('schoolNames', e.target.value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)) }} placeholder={'e.g. Hometown Girls School\nDelhi Public School Dehradun\nDoon International School\n…'} />}
          </Field>
          <Field label="Winning school" required hint="Select one of the school names above. This name is revealed after the shuffle." error={show(errors.winner)}>
            {(p) => <select {...p} className="input" value={form.winnerSchool ?? ''} onChange={(e) => set('winnerSchool', e.target.value)}>
              <option value="">Choose the school to reveal</option>
              {schoolNames.map((school, index) => <option key={`${school}-${index}`} value={school}>{school}</option>)}
            </select>}
          </Field>
        </Section>}

        <Section title="Prize" description="Add the reward text shown with the revealed result. Leave optional fields empty if there is no prize.">
          {form.style === 'school' && <Field label="Text above the medal" hint="Shown in the bordered box above the gold medal during the shuffle and reveal. Leave blank to use the opening subtitle.">
            {(p) => <input {...p} className="input" value={form.medalHeading ?? ''} onChange={(e) => set('medalHeading', e.target.value)} placeholder="e.g. AI Quest 2026 Haldwani" maxLength={120} />}
          </Field>}
          <Field label={isPodium ? 'Shared prize' : 'Prize'} hint={isPodium ? 'Example: Trophy + Certificate. Used for every podium place unless individual prizes are set.' : 'Example: Certificate of Merit + Trophy. Shown with the winner.'}>
            {(p) => <input {...p} className="input" value={form.prize} onChange={(e) => set('prize', e.target.value)} placeholder="e.g. Certificate of Merit + Trophy" maxLength={160} />}
          </Field>
          <Field label={isPodium ? 'Shared prize amount' : 'Prize amount'} hint="Example: ₹25,000 or Up to ₹1 Lakh. This is optional free text.">
            {(p) => <input {...p} className="input" value={form.prizeAmount} onChange={(e) => set('prizeAmount', e.target.value)} placeholder="e.g. ₹25,000" maxLength={60} />}
          </Field>
          {isPodium && (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="label">Podium prize mode</p>
              <p className="text-xs leading-relaxed text-white/55">Choose one prize for all places or enter a separate reward for each rank.</p>
              <Segmented<'shared' | 'individual'>
                ariaLabel="Podium prize mode"
                value={form.podiumPrizes === null ? 'shared' : 'individual'}
                onChange={(mode) => set('podiumPrizes', mode === 'shared' ? null : podiumRanks.map((rank) => ({ rank, prize: '', prizeAmount: '' })))}
                options={[{ value: 'shared', label: 'Same for every place' }, { value: 'individual', label: 'Different for each place' }]}
              />
              {form.podiumPrizes !== null && (
                <>
                  <p className="text-xs text-white/60">Enter the prize for each rank. Leave both fields empty if that rank has no prize.</p>
                  {podiumRanks.map((rank) => {
                    const entry = form.podiumPrizes?.find((item) => item.rank === rank)
                    return (
                      <div key={rank} className="space-y-3 rounded-xl border border-white/10 bg-navy-950/40 p-3">
                        <p className="font-tech text-sm font-bold text-gold-300">Rank #{rank}</p>
                        <Field label={`Rank ${rank} prize amount`} hint="Example: ₹25,000. Leave empty if this rank has no cash prize.">
                          {(p) => <input {...p} className="input" value={entry?.prizeAmount ?? ''} onChange={(e) => setPodiumPrize(rank, 'prizeAmount', e.target.value)} maxLength={60} placeholder="e.g. ₹25,000" />}
                        </Field>
                        <Field label={`Rank ${rank} prize description`} hint="Example: Scholarship + Trophy. Leave empty if there is no extra reward.">
                          {(p) => <input {...p} className="input" value={entry?.prize ?? ''} onChange={(e) => setPodiumPrize(rank, 'prize', e.target.value)} maxLength={200} placeholder="e.g. Scholarship + Trophy" />}
                        </Field>
                      </div>
                    )
                  })}
                  {podiumRanks.length === 0 && <p className="text-xs text-amber-200">Enter a podium rank range of up to four places to set their prizes.</p>}
                </>
              )}
            </div>
          )}
        </Section>

        <Section title="Display style" description="Choose how this tier appears on the big screen. The preview above changes with your selection.">
          <StylePicker value={form.style} onChange={(style) => {
            setForm((current) => ({ ...current, style, rankFrom: style === 'school' ? '1' : current.rankFrom, rankTo: style === 'school' ? '1' : current.rankTo, gridPageCounts: style === 'grid' ? current.gridPageCounts : null, podiumPrizes: style === 'podium' ? current.podiumPrizes : null }))
            setServerRangeError(null)
          }} color={accent} />
          {isPodium && (
            <div>
              <p className="label">Champions presentation</p>
              <Segmented
                ariaLabel="Champions presentation"
                value={form.podiumMode}
                onChange={(value) => set('podiumMode', value)}
                options={[
                  { value: 'hybrid', label: 'Hybrid' },
                  { value: 'podium', label: 'Podium' },
                  { value: 'bot', label: 'Bot' },
                ]}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                {form.podiumMode === 'hybrid'
                  ? 'The bot arrives and waves silently, then bronze, silver and gold medal positions appear. Each next pair of clicks shuffles and reveals 3rd, 2nd, then 1st place.'
                  : form.podiumMode === 'bot'
                    ? 'Every rank shuffles and reveals with the bot.'
                    : 'Every rank shuffles and reveals on the 3D podium.'}
              </p>
            </div>
          )}
          {form.style !== 'school' && <div>
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
                ? `Each rank gets a suspense step and a reveal step, from ${to ?? 'last'} → ${from ?? 'first'}, followed by a group view.`
                : 'The order ranks appear in the list. Grid pages reveal everyone together; Spotlight reveals one at a time.'}
            </p>
          </div>}
          {form.style === 'grid' && (
            <GridPageEditor
              rankFrom={from}
              rankTo={to}
              direction={form.sortDirection}
              counts={form.gridPageCounts}
              onChange={(counts) => set('gridPageCounts', counts)}
              error={show(errors.pages)}
            />
          )}
        </Section>

        <Section title="Look" description="Pick the colour and icon used on this tier's title card and accents.">
          <Field label="Accent colour" hint="Example: #38bdf8. Choose a swatch, use the colour picker, or enter a hex code." error={show(errors.color)}>
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
                <input {...p} className="input w-28 font-mono text-sm" value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="#38bdf8" maxLength={7} />
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
            <p className="mt-1.5 text-xs text-white/50">Choose a symbol for the title card. For example, use the trophy for Champions.</p>
          </div>
        </Section>

        <Section title="Availability" description="Control whether this tier is included in the live results show.">
          <Toggle
            checked={form.enabled}
            onChange={(v) => set('enabled', v)}
            label="Enabled"
            description="Disabled tiers are skipped in the show and ignored by the overlap check."
          />
        </Section>
      </form>
    </Drawer>
  )
}
