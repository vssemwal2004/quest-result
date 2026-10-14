import type {
  ImportResult,
  Overview,
  PresentationInfo,
  Settings,
  ShowPayload,
  ShowState,
  Student,
  StudentInput,
  Tier,
  TierInput,
  TierPreset,
} from '@/types'
import { getToken, setToken } from './auth'

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

type Body = BodyInit | Record<string, unknown> | unknown[] | undefined

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (body instanceof FormData) payload = body
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(path, { method, headers, body: payload })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection.')
  }
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : null
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/api/auth/login')) setToken(null)
    const err = data?.error
    throw new ApiError(res.status, err?.code ?? 'HTTP_' + res.status, err?.message ?? res.statusText, err?.details ?? data)
  }
  return data as T
}

/** Download a protected file (CSV) using the JWT and trigger a browser save. */
async function download(path: string, filename: string) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const api = {
  // auth
  login: (email: string, password: string) =>
    request<{ token: string; user: { email: string } }>('POST', '/api/auth/login', { email, password }),
  me: () => request<{ user: { email: string } }>('GET', '/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true; token: string }>('POST', '/api/auth/change-password', { currentPassword, newPassword }),

  // show
  publicShow: () => request<ShowPayload>('GET', '/api/public/show'),
  adminShow: () => request<ShowPayload>('GET', '/api/admin/show'),
  overview: () => request<Overview>('GET', '/api/admin/overview'),

  // students
  students: (q?: string) =>
    request<{ students: Student[] }>('GET', '/api/admin/students' + (q ? `?q=${encodeURIComponent(q)}` : '')),
  createStudent: (input: StudentInput) => request<{ student: Student }>('POST', '/api/admin/students', input),
  updateStudent: (id: string, input: Partial<StudentInput>) =>
    request<{ student: Student }>('PUT', `/api/admin/students/${id}`, input),
  deleteStudent: (id: string) => request<{ ok: true }>('DELETE', `/api/admin/students/${id}`),
  deleteAllStudents: () =>
    request<{ ok: true; deleted: number }>('DELETE', '/api/admin/students', { confirm: 'DELETE ALL' }),
  uploadPhoto: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('photo', file)
    return request<{ student: Student }>('POST', `/api/admin/students/${id}/photo`, fd)
  },
  deletePhoto: (id: string) => request<{ student: Student }>('DELETE', `/api/admin/students/${id}/photo`),
  uploadPhotosByRank: (files: File[]) => {
    const fd = new FormData()
    files.forEach((f) => fd.append('photos', f))
    return request<{ matched: number; unmatched: string[] }>('POST', '/api/admin/students/photos', fd)
  },
  importStudents: (file: File, mode: 'merge' | 'replace', dryRun: boolean) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)
    fd.append('dryRun', String(dryRun))
    return request<ImportResult>('POST', '/api/admin/students/import', fd)
  },
  downloadTemplate: () => download('/api/admin/students/template.csv', 'ai-quest-results-template.csv'),
  exportStudents: () => download('/api/admin/students/export.csv', 'ai-quest-results.csv'),

  // tiers
  tiers: () => request<{ tiers: Tier[] }>('GET', '/api/admin/tiers'),
  createTier: (input: TierInput) => request<{ tier: Tier }>('POST', '/api/admin/tiers', input),
  updateTier: (id: string, input: Partial<TierInput>) => request<{ tier: Tier }>('PUT', `/api/admin/tiers/${id}`, input),
  deleteTier: (id: string) => request<{ ok: true }>('DELETE', `/api/admin/tiers/${id}`),
  reorderTiers: (ids: string[]) => request<{ tiers: Tier[] }>('POST', '/api/admin/tiers/reorder', { ids }),
  tierPresets: () => request<{ presets: TierPreset[] }>('GET', '/api/admin/tiers/presets'),
  applyPreset: (key: string) => request<{ tiers: Tier[] }>('POST', '/api/admin/tiers/apply-preset', { key }),

  // settings
  settings: () => request<{ settings: Settings }>('GET', '/api/admin/settings'),
  updateSettings: (input: Partial<Settings>) => request<{ settings: Settings }>('PUT', '/api/admin/settings', input),
  uploadLogo: (file: File) => {
    const fd = new FormData()
    fd.append('logo', file)
    return request<{ settings: Settings }>('POST', '/api/admin/settings/logo', fd)
  },
  deleteLogo: () => request<{ settings: Settings }>('DELETE', '/api/admin/settings/logo'),

  // presentation
  presentation: () => request<PresentationInfo>('GET', '/api/admin/presentation'),
  next: () => request<{ state: ShowState }>('POST', '/api/admin/presentation/next'),
  prev: () => request<{ state: ShowState }>('POST', '/api/admin/presentation/prev'),
  goto: (stageIndex: number, step = 0) =>
    request<{ state: ShowState }>('POST', '/api/admin/presentation/goto', { stageIndex, step }),
  reset: () => request<{ state: ShowState }>('POST', '/api/admin/presentation/reset'),
}
