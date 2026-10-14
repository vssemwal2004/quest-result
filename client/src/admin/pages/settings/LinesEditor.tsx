import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'

const MAX_LINES = 6
const MAX_LEN = 40

/** Editable ordered list of the handwritten script lines ("Explore / Learn / Create / Your Tomorrow"). */
export function LinesEditor({ value, onChange, id }: { value: string[]; onChange: (lines: string[]) => void; id: string }) {
  const [draft, setDraft] = useState('')

  const update = (i: number, text: string) => onChange(value.map((l, j) => (j === i ? text : l)))
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i))
  const move = (i: number, d: -1 | 1) => {
    const next = [...value]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  const add = () => {
    const text = draft.trim()
    if (!text || value.length >= MAX_LINES) return
    onChange([...value, text])
    setDraft('')
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-sm text-white/45">No lines — the script accent is hidden on the big screen.</p>}
      <ol className="space-y-2">
        {value.map((line, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-5 text-right font-tech text-xs text-white/35">{i + 1}</span>
            <input
              className="input py-1.5 font-script text-2xl leading-none text-gold-300"
              value={line}
              onChange={(e) => update(i, e.target.value)}
              maxLength={MAX_LEN}
              aria-label={`Line ${i + 1}`}
            />
            <div className="flex shrink-0">
              <button type="button" className="rounded p-1.5 text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-20" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move line ${i + 1} up`}>
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" className="rounded p-1.5 text-white/45 hover:bg-white/10 hover:text-white disabled:opacity-20" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={`Move line ${i + 1} down`}>
                <ChevronDown className="h-4 w-4" />
              </button>
              <button type="button" className="rounded p-1.5 text-white/45 hover:bg-red-500/15 hover:text-red-300" onClick={() => remove(i)} aria-label={`Remove line ${i + 1}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {value.length < MAX_LINES && (
        <div className="flex gap-2 pl-7">
          <input
            id={id}
            className="input py-1.5"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            maxLength={MAX_LEN}
            placeholder="Add a line and press Enter"
          />
          <button type="button" className="btn-ghost shrink-0 px-3" onClick={add} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" aria-hidden /> Add
          </button>
        </div>
      )}
    </div>
  )
}
