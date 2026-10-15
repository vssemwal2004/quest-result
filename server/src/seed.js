import { nanoid } from 'nanoid'

export const BCRYPT_ROUNDS = 10
/** First-boot admin (overridable with ADMIN_EMAIL / ADMIN_PASSWORD). */
export const DEFAULT_ADMIN = { email: 'a@gmail.com', password: '123456' }

export function defaultSettings(now = new Date().toISOString()) {
  return {
    eventTitle: 'AI Quest',
    eventEdition: 'Results 2026',
    tagline: 'Learn from the best',
    subTagline: 'A hands-on AI experience for Class XII students',
    organization: 'Graphic Era (Deemed to be University)',
    location: 'Dehradun',
    eventDate: '2026-10-16',
    contact: '+91 82183 46483',
    logoUrl: null,
    handwrittenLines: ['Explore', 'Learn', 'Create', 'Your Tomorrow'],
    finaleTitle: 'Congratulations, Champions!',
    finaleMessage: 'Thank you for being part of AI Quest 2026',
    spoilerProtection: true,
    autoScrollSpeed: 45,
    showRobot: true,
    quality: 'high',
    updatedAt: now,
  }
}

const ranks = (from, to) => (from === to ? `Rank ${from}` : `Ranks ${from} – ${to}`)

function tier(name, rankFrom, rankTo, style, color, icon, prize, extra = {}) {
  return {
    name,
    subtitle: ranks(rankFrom, rankTo),
    rankFrom,
    rankTo,
    prize,
    prizeAmount: '',
    style,
    color,
    icon,
    sortDirection: style === 'spotlight' || style === 'podium' ? 'desc' : 'asc',
    gridPageCounts: null,
    enabled: true,
    ...extra,
  }
}

const champions = () =>
  tier('The Champions', 1, 4, 'podium', '#facc15', 'crown', 'Cash Prizes + Exciting Scholarships', {
    prizeAmount: 'Up to ₹1 Lakh',
  })

/** Tier presets (TierInput[] in reveal order). Index in the array becomes `order`. */
export const TIER_PRESETS = [
  {
    key: 'classic-5',
    name: 'Classic · 5 tiers',
    description: '151–200, 101–150, 21–100 as manually advanced grids, ranks 5–20 in Spotlight, Top 4 on the 3D podium.',
    tiers: () => [
      tier('Merit Achievers', 151, 200, 'grid', '#38bdf8', 'award', 'Certificate of Merit'),
      tier('Rising Innovators', 101, 150, 'grid', '#60a5fa', 'star', 'Certificate of Excellence'),
      tier('AI Explorers', 21, 100, 'grid', '#818cf8', 'rocket', 'Certificate + Exciting Goodies'),
      tier('Top 20 Stars', 5, 20, 'spotlight', '#c084fc', 'medal', 'Merit Scholarship + Trophy'),
      champions(),
    ],
  },
  {
    key: 'focus-top-10',
    name: 'Focus on Top 10',
    description: '11–200 as one manually advanced grid, ranks 5–10 revealed one-by-one, Top 4 on the 3D podium.',
    tiers: () => [
      tier('AI Achievers', 11, 200, 'grid', '#38bdf8', 'award', 'Certificate of Merit + Goodies'),
      tier('Top 10 Stars', 5, 10, 'spotlight', '#c084fc', 'medal', 'Merit Scholarship + Trophy'),
      champions(),
    ],
  },
  {
    key: 'quick-3',
    name: 'Quick · 2 tiers',
    description: 'Ranks 5–200 in one staggered grid, then the Top 4 on the 3D podium.',
    tiers: () => [
      tier('AI Quest Winners', 5, 200, 'grid', '#60a5fa', 'star', 'Certificate of Excellence'),
      champions(),
    ],
  },
]

export function findPreset(key) {
  return TIER_PRESETS.find((p) => p.key === key) ?? null
}

/** Materialise a preset as stored Tier records with fresh ids. */
export function presetTiers(key) {
  const preset = findPreset(key)
  if (!preset) return null
  return preset.tiers().map((t, order) => ({ id: nanoid(10), ...t, order }))
}
