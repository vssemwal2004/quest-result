import { useEffect, useId, useState, type FormEvent } from 'react'
import { ImagePlus, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Student, StudentInput, Tier } from '@/types'
import { StudentAvatar } from '@/components/StudentAvatar'
import { useObjectUrl } from '../../hooks/useObjectUrl'
import { errorMessage, isApiError } from '../../lib/errors'
import { tierForRank } from '../../lib/ranks'
import { STYLE_META } from '../../lib/tierMeta'
import { Modal } from '../../ui/Modal'
import { Field } from '../../ui/Field'
import { FileDrop } from '../../ui/FileDrop'
import { Spinner } from '../../ui/Spinner'
import { PHOTO_ACCEPT, photoProblem } from './photos'

interface FormState {
  rank: string
  name: string
  school: string
  city: string
  score: string
}

type FieldErrors = Partial<Record<keyof FormState, string>>

function toForm(s: Student | null, suggestedRank?: number): FormState {
  return {
    rank: s ? String(s.rank) : suggestedRank ? String(suggestedRank) : '',
    name: s?.name ?? '',
    school: s?.school ?? '',
    city: s?.city ?? '',
    score: s?.score == null ? '' : String(s.score),
  }
}

function validate(f: FormState): { errors: FieldErrors; input: StudentInput | null } {
  const errors: FieldErrors = {}
  const rank = Number(f.rank)
  if (!f.rank.trim()) errors.rank = 'Rank is required.'
  else if (!Number.isInteger(rank) || rank < 1) errors.rank = 'Rank must be a whole number of 1 or more.'
  const name = f.name.trim()
  if (!name) errors.name = 'Student name is required.'
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.'
  const school = f.school.trim()
  if (!school) errors.school = 'School name is required.'
  else if (school.length > 200) errors.school = 'Keep the school name under 200 characters.'
  const city = f.city.trim()
  if (city.length > 120) errors.city = 'Keep the city under 120 characters.'
  const score = f.score.trim() === '' ? null : Number(f.score)
  if (score !== null && !Number.isFinite(score)) errors.score = 'Score must be a number.'
  if (Object.keys(errors).length) return { errors, input: null }
  return { errors, input: { rank, name, school, city: city || null, score } }
}

interface StudentFormModalProps {
  open: boolean
  /** null = create a new student. */
  student: Student | null
  tiers: Tier[]
  suggestedRank?: number
  onClose: () => void
  onSaved: (student: Student) => void
}

export function StudentFormModal({ open, student, tiers, suggestedRank, onClose, onSaved }: StudentFormModalProps) {
  const formId = useId()
  const [form, setForm] = useState<FormState>(() => toForm(student, suggestedRank))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const photoPreview = useObjectUrl(photo)

  useEffect(() => {
    if (!open) return
    setForm(toForm(student, suggestedRank))
    setErrors({})
    setFormError(null)
    setPhoto(null)
    setRemovePhoto(false)
    setBusy(false)
  }, [open, student, suggestedRank])

  const set = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const rankNum = Number(form.rank)
  const rankTier = Number.isInteger(rankNum) && rankNum >= 1 ? tierForRank(tiers, rankNum) : undefined
  const currentPhoto = photoPreview ?? (removePhoto ? null : student?.photoUrl ?? null)

  const pickPhoto = (files: File[], rejected: File[]) => {
    const file = files[0]
    if (!file) {
      if (rejected.length) toast.error('Use a JPG, PNG or WebP image.')
      return
    }
    const problem = photoProblem(file)
    if (problem) return toast.error(`${file.name}: ${problem}`)
    setPhoto(file)
    setRemovePhoto(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const { errors: found, input } = validate(form)
    setErrors(found)
    if (!input) return
    setBusy(true)
    setFormError(null)
    let saved: Student
    try {
      saved = student ? (await api.updateStudent(student.id, input)).student : (await api.createStudent(input)).student
    } catch (err) {
      if (isApiError(err, 'RANK_TAKEN')) setErrors({ rank: errorMessage(err) })
      else setFormError(errorMessage(err))
      setBusy(false)
      return
    }
    try {
      if (photo) saved = (await api.uploadPhoto(saved.id, photo)).student
      else if (removePhoto && saved.photoUrl) saved = (await api.deletePhoto(saved.id)).student
    } catch (err) {
      toast.warning(`Saved ${saved.name}, but the photo change failed: ${errorMessage(err)}`)
    }
    toast.success(student ? `Updated ${saved.name}` : `Added ${saved.name} at rank ${saved.rank}`)
    setBusy(false)
    onSaved(saved)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={student ? `Edit result · Rank ${student.rank}` : 'Add result'}
      description={student ? 'Changes appear on the big screen immediately.' : 'Add one winner. For many at once, use Import.'}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form={formId} className="btn-gold px-5 py-2.5 text-sm" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            {student ? 'Save changes' : 'Add result'}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-6 sm:grid-cols-[11rem_1fr]">
        <div className="flex flex-col items-center gap-3">
          <StudentAvatar
            name={form.name || '?'}
            photoUrl={currentPhoto}
            rank={rankNum || undefined}
            className="h-32 w-32 text-[8rem]"
            ring="ring-cyan-glow/40"
          />
          <FileDrop
            accept={PHOTO_ACCEPT}
            onFiles={pickPhoto}
            title={currentPhoto ? 'Replace photo' : 'Add photo'}
            hint="Drop or browse · ≤ 5 MB"
            icon={ImagePlus}
            compact
            disabled={busy}
            className="w-full"
          />
          {(photo || (student?.photoUrl && !removePhoto)) && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-300 hover:text-red-200"
              onClick={() => {
                if (photo) setPhoto(null)
                else setRemovePhoto(true)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              {photo ? 'Discard new photo' : 'Remove photo'}
            </button>
          )}
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field
            label="Rank"
            required
            error={errors.rank}
            hint={
              form.rank && !errors.rank ? (
                rankTier ? (
                  <span>
                    Falls in <span style={{ color: rankTier.color }} className="font-semibold">{rankTier.name}</span> ·{' '}
                    {STYLE_META[rankTier.style].label}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-200">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Outside every tier — not shown in the show
                  </span>
                )
              ) : undefined
            }
          >
            {(p) => (
              <input
                {...p}
                className="input font-tech"
                inputMode="numeric"
                value={form.rank}
                onChange={(e) => set('rank')(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="e.g. 17"
              />
            )}
          </Field>
          <Field label="Score" hint="Optional" error={errors.score}>
            {(p) => (
              <input
                {...p}
                className="input"
                inputMode="decimal"
                value={form.score}
                onChange={(e) => set('score')(e.target.value)}
                placeholder="e.g. 92.5"
              />
            )}
          </Field>
          <Field label="Student name" required error={errors.name} className="sm:col-span-2">
            {(p) => (
              <input {...p} className="input" value={form.name} onChange={(e) => set('name')(e.target.value)} maxLength={120} placeholder="Full name as it should appear on screen" />
            )}
          </Field>
          <Field label="School" required error={errors.school} className="sm:col-span-2">
            {(p) => (
              <input {...p} className="input" value={form.school} onChange={(e) => set('school')(e.target.value)} maxLength={200} placeholder="School name" />
            )}
          </Field>
          <Field label="City" hint="Optional" error={errors.city} className="sm:col-span-2">
            {(p) => <input {...p} className="input" value={form.city} onChange={(e) => set('city')(e.target.value)} maxLength={120} placeholder="e.g. Dehradun" />}
          </Field>
          {formError && (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 sm:col-span-2">
              {formError}
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}
