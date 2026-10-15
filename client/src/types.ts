// Mirrors docs/SPEC.md exactly. Keep in sync with the server.

export type DisplayStyle = 'scroll' | 'grid' | 'spotlight' | 'podium'
export type TierIcon = 'trophy' | 'medal' | 'star' | 'award' | 'crown' | 'rocket' | 'sparkles'
export type Quality = 'high' | 'medium' | 'low'

export interface Student {
  id: string
  rank: number
  name: string
  school: string
  city: string | null
  score: number | null
  photoUrl: string | null
  createdAt: string
  updatedAt: string
}

export type StudentInput = Pick<Student, 'rank' | 'name' | 'school'> & {
  city?: string | null
  score?: number | null
}

export interface Tier {
  id: string
  name: string
  subtitle: string
  rankFrom: number
  rankTo: number
  prize: string
  prizeAmount: string
  style: DisplayStyle
  color: string
  icon: TierIcon
  sortDirection: 'asc' | 'desc'
  /** Null uses balanced pages; an array sets ranks per page in reveal order. */
  gridPageCounts: number[] | null
  order: number
  enabled: boolean
}

export type TierInput = Omit<Tier, 'id' | 'order'>

export interface Settings {
  eventTitle: string
  eventEdition: string
  tagline: string
  subTagline: string
  organization: string
  location: string
  eventDate: string
  contact: string
  logoUrl: string | null
  handwrittenLines: string[]
  finaleTitle: string
  finaleMessage: string
  spoilerProtection: boolean
  autoScrollSpeed: number
  showRobot: boolean
  quality: Quality
  updatedAt: string
}

export interface PublicStudent {
  id: string
  rank: number
  name: string
  school: string
  city: string | null
  score: number | null
  photoUrl: string | null
}

export type PublicTier = Omit<Tier, 'order' | 'enabled'>

export type StageType = 'intro' | 'tier' | 'finale'

export interface ShowStage {
  index: number
  type: StageType
  key: string
  title: string
  stepCount: number
  tier: PublicTier | null
  studentCount: number
  /** Maximum students per grid page. */
  pageSize?: number
  /** Cumulative end offset for each balanced grid page. */
  pageEnds?: number[]
  /** Public rank order for anonymous, still-shuffling cards. Names remain spoiler protected. */
  studentRanks?: number[]
  /** Podium reveal order. Rank numbers are public even when names are still protected. */
  revealRanks?: number[]
  students: PublicStudent[]
}

export interface ShowState {
  stageIndex: number
  step: number
  updatedAt: string
}

export interface ShowPayload {
  settings: Settings
  stages: ShowStage[]
  state: ShowState
  totalWinners: number
  version: number
  serverTime: string
}

export interface OverviewTier {
  tier: Tier
  studentCount: number
  expected: number
}

export interface Overview {
  studentCount: number
  tierCount: number
  tiers: OverviewTier[]
  unassignedStudents: Student[]
  missingRanks: number[]
  viewers: number
  state: ShowState
}

export interface PresentationInfo {
  state: ShowState
  stages: ShowStage[]
  viewers: number
}

export interface ImportRow {
  line: number
  rank: number | null
  name: string
  school: string
  city: string | null
  score: number | null
}

export interface ImportError {
  line: number
  field?: string
  message: string
}

export interface ImportResult {
  rows: ImportRow[]
  errors: ImportError[]
  summary: { total: number; valid: number; invalid: number; created: number; updated: number; removed: number }
  committed: boolean
}

export interface TierPreset {
  key: string
  name: string
  description: string
  tiers: TierInput[]
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown }
}
