import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Download, FileSpreadsheet, Images, Search, Trash2, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import type { Student } from '@/types'
import { useResource } from '../../hooks/useResource'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useShowUpdate } from '../../hooks/useShowUpdate'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { errorMessage } from '../../lib/errors'
import { tierForRank } from '../../lib/ranks'
import { PageHeader } from '../../ui/Panel'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import { EmptyState, ErrorState } from '../../ui/EmptyState'
import { PageLoader, Spinner } from '../../ui/Spinner'
import { Kbd } from '../../ui/Kbd'
import { StudentFormModal } from './StudentFormModal'
import { BulkPhotosModal } from './BulkPhotosModal'
import { StudentRow } from './StudentRow'
import { PHOTO_ACCEPT, photoProblem } from './photos'

type Editing = { student: Student | null; suggestedRank?: number } | null

function firstFreeRank(students: Student[]): number {
  const taken = new Set(students.map((s) => s.rank))
  let r = 1
  while (taken.has(r)) r++
  return r
}

export function ResultsPage() {
  useDocumentTitle('Results')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const q = useDebouncedValue(query.trim(), 250)
  const [sortDesc, setSortDesc] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Student | null>(null)
  const [removingPhoto, setRemovingPhoto] = useState<Student | null>(null)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [photoBusy, setPhotoBusy] = useState<ReadonlySet<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<Student | null>(null)

  const students = useResource(() => api.students(q || undefined), [q])
  const tiers = useResource(() => api.tiers(), [])
  useShowUpdate(() => {
    void students.reload({ silent: true })
    void tiers.reload({ silent: true })
  }, 500)

  // "/" focuses search, like most admin tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== '/' || t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tierList = useMemo(() => tiers.data?.tiers ?? [], [tiers.data])
  const rows = useMemo(() => {
    const list = [...(students.data?.students ?? [])]
    list.sort((a, b) => (sortDesc ? b.rank - a.rank : a.rank - b.rank))
    return list
  }, [students.data, sortDesc])

  const { reload: reloadStudents, setData: setStudents } = students
  const refresh = useCallback(() => void reloadStudents({ silent: true }), [reloadStudents])

  const replaceStudent = useCallback(
    (updated: Student) =>
      setStudents((prev) => prev && { students: prev.students.map((s) => (s.id === updated.id ? updated : s)) }),
    [setStudents],
  )

  const openNew = useCallback(
    () => setEditing({ student: null, suggestedRank: !q && students.data ? firstFreeRank(students.data.students) : undefined }),
    [q, students.data],
  )

  // Deep link from the dashboard: /admin/results?new=1 opens the add dialog (once the list is known).
  useEffect(() => {
    if (params.get('new') === '1' && students.data) {
      openNew()
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams, openNew, students.data])

  const setBusy = (id: string, on: boolean) =>
    setPhotoBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const onUploadPhoto = useCallback((s: Student) => {
    photoTarget.current = s
    photoInputRef.current?.click()
  }, [])

  const onPhotoChosen = async (file: File | undefined) => {
    const target = photoTarget.current
    photoTarget.current = null
    if (!file || !target) return
    const problem = photoProblem(file)
    if (problem) return toast.error(`${file.name}: ${problem}`)
    setBusy(target.id, true)
    try {
      const { student } = await api.uploadPhoto(target.id, file)
      replaceStudent(student)
      toast.success(`Photo updated for ${student.name}`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(target.id, false)
    }
  }

  const onEdit = useCallback((s: Student) => setEditing({ student: s }), [])
  const onDelete = useCallback((s: Student) => setDeleting(s), [])
  const onRemovePhoto = useCallback((s: Student) => setRemovingPhoto(s), [])

  const exportCsv = async () => {
    setExporting(true)
    try {
      await api.exportStudents()
      toast.success('CSV downloaded')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const total = students.data?.students.length ?? 0
  const hasAny = total > 0 || q !== ''

  return (
    <>
      <PageHeader
        title="Results"
        description="All winners with rank, school and photo. The tier column shows where each student appears in the show."
        actions={
          <>
            <Link to="/admin/import" className="btn-ghost">
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> Import
            </Link>
            <button type="button" className="btn-gold px-5 py-2.5 text-sm" onClick={openNew}>
              <UserPlus className="h-4 w-4" aria-hidden /> Add result
            </button>
          </>
        }
      />

      <section className="glass rounded-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-4">
          <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className="input pl-10 pr-16"
              placeholder="Search name, school or city"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search students"
            />
            <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {students.loading && students.data ? (
                <Spinner className="h-4 w-4 text-white/50" label="Searching" />
              ) : query ? (
                <button type="button" onClick={() => setQuery('')} className="rounded p-0.5 text-white/50 hover:text-white" aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Kbd>/</Kbd>
              )}
            </span>
          </div>
          <button type="button" className="btn-ghost px-3 text-sm" onClick={() => setSortDesc((v) => !v)} aria-label={`Sort by rank, currently ${sortDesc ? 'descending' : 'ascending'}`}>
            {sortDesc ? <ArrowDown className="h-4 w-4" aria-hidden /> : <ArrowUp className="h-4 w-4" aria-hidden />}
            Rank {sortDesc ? 'high → low' : 'low → high'}
          </button>
          <p className="text-sm text-white/50" aria-live="polite">
            {students.data && (q ? `${total} match${total === 1 ? '' : 'es'}` : `${total} student${total === 1 ? '' : 's'}`)}
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost px-3 text-sm" onClick={() => setBulkOpen(true)}>
              <Images className="h-4 w-4" aria-hidden /> Bulk photos
            </button>
            <button type="button" className="btn-ghost px-3 text-sm" onClick={exportCsv} disabled={exporting || !total}>
              {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" aria-hidden />} Export CSV
            </button>
            <button type="button" className="btn-danger px-3 text-sm" onClick={() => setDeleteAllOpen(true)} disabled={!total || q !== ''} title={q ? 'Clear the search first' : undefined}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete all
            </button>
          </div>
        </div>

        {students.loading && !students.data ? (
          <PageLoader label="Loading students…" />
        ) : students.error && !students.data ? (
          <ErrorState error={students.error} onRetry={() => void students.reload()} />
        ) : !hasAny ? (
          <EmptyState
            icon={Users}
            title="No results yet"
            description="Add winners one by one, or import the full list of 200 from a CSV / Excel sheet."
            action={
              <>
                <button type="button" className="btn-gold px-5 py-2.5 text-sm" onClick={openNew}>
                  <UserPlus className="h-4 w-4" aria-hidden /> Add result
                </button>
                <Link to="/admin/import" className="btn-ghost">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden /> Import file
                </Link>
              </>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={Search} title="No matches" description={`No student matches “${q}”.`} action={<button type="button" className="btn-ghost" onClick={() => setQuery('')}>Clear search</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[21rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-white/45">
                  <th scope="col" className="py-3 pl-4 pr-2 font-semibold sm:pl-5 sm:pr-3">
                    Rank
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Student
                  </th>
                  <th scope="col" className="hidden px-3 py-3 font-semibold lg:table-cell">
                    School
                  </th>
                  <th scope="col" className="hidden px-3 py-3 font-semibold xl:table-cell">
                    City
                  </th>
                  <th scope="col" className="hidden px-3 py-3 text-right font-semibold md:table-cell">
                    Score
                  </th>
                  <th scope="col" className="hidden px-3 py-3 font-semibold sm:table-cell">
                    Tier
                  </th>
                  <th scope="col" className="py-3 pl-3 pr-5 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <StudentRow
                    key={s.id}
                    student={s}
                    tier={tierForRank(tierList, s.rank)}
                    photoBusy={photoBusy.has(s.id)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onUploadPhoto={onUploadPhoto}
                    onRemovePhoto={onRemovePhoto}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <input
        ref={photoInputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void onPhotoChosen(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <StudentFormModal
        open={editing !== null}
        student={editing?.student ?? null}
        tiers={tierList}
        suggestedRank={editing?.suggestedRank}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          refresh()
        }}
      />

      <BulkPhotosModal open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={refresh} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this result?"
        message={
          deleting && (
            <>
              <strong className="text-white">
                Rank {deleting.rank} · {deleting.name}
              </strong>{' '}
              ({deleting.school}) will be removed, including the photo. This cannot be undone.
            </>
          )
        }
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return
          await api.deleteStudent(deleting.id)
          setStudents((prev) => prev && { students: prev.students.filter((s) => s.id !== deleting.id) })
          toast.success(`Deleted ${deleting.name}`)
        }}
      />

      <ConfirmDialog
        open={removingPhoto !== null}
        onClose={() => setRemovingPhoto(null)}
        title="Remove photo?"
        message={removingPhoto && <>The photo of {removingPhoto.name} will be deleted. Their initials will be shown instead.</>}
        confirmLabel="Remove photo"
        onConfirm={async () => {
          if (!removingPhoto) return
          const { student } = await api.deletePhoto(removingPhoto.id)
          replaceStudent(student)
          toast.success('Photo removed')
        }}
      />

      <ConfirmDialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        title="Delete ALL results?"
        message={
          <>
            This permanently deletes <strong className="text-white">all {total} students</strong> and their photos. Export a CSV
            first if you might need them again.
          </>
        }
        requireText="DELETE ALL"
        confirmLabel="Delete everything"
        onConfirm={async () => {
          const res = await api.deleteAllStudents()
          setStudents(() => ({ students: [] }))
          toast.success(`Deleted ${res.deleted} students`)
        }}
      />
    </>
  )
}
