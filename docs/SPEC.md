# AI Quest — Results Reveal Platform · Technical Spec (source of truth)

Two interfaces on one Node.js backend:

1. **Show (client / big-screen display)** at `/` — a cinematic, 3D, AI-Quest-themed results reveal
   meant to be projected / live-streamed in front of 50k+ people. Driven live by the admin.
2. **Admin** at `/admin/*` — JWT-protected panel for managing winners (200 students), prize tiers,
   event branding and the live presentation (Next / Back / Jump).

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite 5, Tailwind CSS 3, Framer Motion 11, three.js via @react-three/fiber 8 + @react-three/drei 9 + @react-three/postprocessing 2 (bloom), lucide-react icons, sonner toasts, canvas-confetti, socket.io-client |
| Backend | Node.js 22 (ESM, plain JS), Express 4, Socket.IO 4, jsonwebtoken (HS256), bcryptjs, multer, exceljs + csv-parse (bulk import), zod (validation), helmet, express-rate-limit, compression, nanoid, dotenv |
| Storage | JSON document store `server/data/db.json` (in-memory + atomic write: tmp file → rename, debounced). 200 records do not need a DB server; the store module is the only place touching the file so it can be swapped for SQLite/Postgres later. |
| Files | `server/uploads/` (student photos, logo) served at `/uploads/*` |

Ports: server `4000` (env `PORT`), Vite dev `5173` with proxy for `/api`, `/uploads`, `/socket.io` (ws).
Production: `npm run build` (client → `client/dist`), `npm start` → Express serves `client/dist` with SPA fallback.

## Theme (from the AI Quest poster)

Deep royal-blue → navy background with glowing circuit-board lines, floating particles, light streaks,
"AI" chip motifs, a cute white robot with a dark visor face and glowing cyan eyes, chunky 3D electric-blue
"AI" lettering with circuit texture, chunky 3D gold/yellow "Quest" lettering, white pill ribbon with navy
text ("LEARN FROM THE BEST"), handwritten yellow script lines ("Explore / Learn / Create / Your Tomorrow")
with a yellow swoosh underline, gold trophy, yellow brush-stroke banner. **No university-building photo
background** — the background is the blue AI/circuit/robot look.

Tailwind tokens (see `client/tailwind.config.js`): `navy-950 #020a24`, `navy-900 #041445`, `navy-800 #072065`,
`royal-700 #0b3bb3`, `royal-600 #1446d6`, `royal-500 #1f5eff`, `electric #00c2ff`, `cyan-glow #38e1ff`,
`gold-300 #ffe066`, `gold-400 #ffd23f`, `gold-500 #fbbf24`, `gold-600 #f59e0b`, `silver #d7dee8`, `bronze #d9822b`.
Fonts (self-hosted via @fontsource, works offline at the venue): `font-display` Montserrat 800/900,
`font-sans` Poppins 400–700, `font-script` Caveat 700, `font-tech` Orbitron 600–900.

## Data model (mirrored exactly in `client/src/types.ts`)

```ts
type DisplayStyle = 'grid' | 'spotlight' | 'podium' // stored legacy `scroll` tiers render as grid
type TierIcon = 'trophy' | 'medal' | 'star' | 'award' | 'crown' | 'rocket' | 'sparkles'

interface Student {
  id: string            // nanoid
  rank: number          // positive integer, UNIQUE across students
  name: string          // 1..120 chars
  school: string        // 1..200 chars
  city: string | null   // optional
  score: number | null  // optional
  photoUrl: string | null // "/uploads/photos/<file>" or null
  createdAt: string; updatedAt: string // ISO
}

interface Tier {
  id: string
  name: string          // e.g. "Merit Achievers"
  subtitle: string      // e.g. "Ranks 151 – 200" (free text, may be "")
  rankFrom: number      // inclusive, >= 1
  rankTo: number        // inclusive, >= rankFrom
  prize: string         // e.g. "Certificate of Merit + Goodies"
  prizeAmount: string   // e.g. "₹1,00,000" (free text, may be "")
  style: DisplayStyle
  color: string         // hex accent "#38bdf8"
  icon: TierIcon
  sortDirection: 'asc' | 'desc' // display/reveal order inside the tier (ignored for podium)
  gridPageCounts: number[] | null // null = balanced automatically; otherwise rank counts per page in reveal order
  order: number         // reveal order of tiers (ascending = earlier in show)
  enabled: boolean
}

interface Settings {
  eventTitle: string        // "AI Quest"
  eventEdition: string      // "Results 2026"
  tagline: string           // "Learn from the best"
  subTagline: string        // "A hands-on AI experience for Class XII students"
  organization: string      // "Graphic Era (Deemed to be University)"
  location: string          // "Dehradun"
  eventDate: string         // "2026-10-16"
  contact: string           // "+91 82183 46483"
  logoUrl: string | null
  handwrittenLines: string[] // ["Explore","Learn","Create","Your Tomorrow"]
  finaleTitle: string       // "Congratulations, Champions!"
  finaleMessage: string     // "Thank you for being part of AI Quest 2026"
  spoilerProtection: boolean // default true
  autoScrollSpeed: number   // legacy setting retained for stored records; scroll wall is no longer used
  showRobot: boolean        // default true
  quality: 'high' | 'medium' | 'low' // 3D quality (bloom, particle counts, dpr)
  updatedAt: string
}
```

Validation (server, zod): enabled tiers must not overlap in rank ranges (409 `TIER_OVERLAP`);
podium tiers must span ≤ 3 ranks (400). Manual grid counts must total the tier's rank span and each page
must contain 1–12 ranks. Student ranks unique (409 `RANK_TAKEN`).

## Show model — server is the single source of truth

Stages are derived on the server:
`[intro] + enabledTiers.sortBy(order).map(tier stage) + [finale]`.

Step counts per stage:

| Stage | stepCount | Meaning of `step` |
|---|---|---|
| intro | 1 | 0 = intro with Start button |
| tier `grid` | 1 + number of nonempty pages | 0 = tier title card (name, ranks, prize); k ≥ 1 = page k of up to 12 students, balanced automatically or grouped by manual rank counts, advanced only by Next/Previous |
| tier `spotlight` | 1 + n | 0 = title card, k (1..n) = first k students revealed one-by-one |
| tier `podium` | 1 + n + 1 when n > 1 (n ≤ 3) | 0 = empty podium + title, k (1..n) = one winner spotlighted (order rank 3 → 2 → 1), final step = all winners together |
| finale | 1 | 0 = congratulations / thank you |

(n = number of students whose rank is inside the tier range.)

**Student order inside a stage (`stage.students`)**: `grid`/`spotlight` → by rank per
`tier.sortDirection` (asc = 1,2,3…; desc = …3,2,1). `podium` → always rank DESC (3, 2, 1 = reveal order).

**Navigation** (server):
- `next`: if `step < stepCount-1` → `step+1`; else if not last stage → `stageIndex+1, step 0`; else no-op.
- `prev`: if `step > 0` → `step-1`; else if `stageIndex > 0` → previous stage at its LAST step; else no-op.
- `goto {stageIndex, step=0}` (clamped). `reset` → `{0,0}`.
- Whenever tiers/students change, the state is clamped to the new stages.

**Spoiler protection** (when `settings.spoilerProtection` is true, the PUBLIC payload only contains
revealed students): stages before the current one → all students; future stages → `students: []`
(but `studentCount` is still given); current grid stage → students through the current page's cumulative end;
`spotlight`/`podium`: the first `step` students of the reveal order (the podium's final group step receives all). When protection is off, every
stage contains all of its students.
**Clients must ALWAYS decide what to render from `stageIndex` / `step`, never from `students.length`.**
(Render rule: past stage → fully revealed; current tier stage → `step === 0` title card, list visible when
`step >= 1`; grid shows the current page using `stage.pageEnds`; spotlight shows `students.slice(0, step)`;
podium shows only the current winner until its final group step.)

```ts
interface PublicStudent { id: string; rank: number; name: string; school: string; city: string | null; score: number | null; photoUrl: string | null }
interface PublicTier { id, name, subtitle, rankFrom, rankTo, prize, prizeAmount, style, color, icon, sortDirection, gridPageCounts } // Tier minus order/enabled
type StageType = 'intro' | 'tier' | 'finale'
interface ShowStage {
  index: number; type: StageType; key: string /* 'intro' | 'tier:<id>' | 'finale' */
  title: string        // 'Welcome' | tier.name | 'Finale'
  stepCount: number
  tier: PublicTier | null
  studentCount: number // total in tier (0 for intro/finale)
  students: PublicStudent[] // possibly filtered by spoiler protection
}
interface ShowState { stageIndex: number; step: number; updatedAt: string }
interface ShowPayload {
  settings: Settings      // public copy (nothing secret lives in settings)
  stages: ShowStage[]
  state: ShowState
  totalWinners: number    // number of students
  version: number         // increments on every change
  serverTime: string
}
```

## REST API (JSON; errors are `{ error: { code: string, message: string, details?: any } }`)

Auth header for admin routes: `Authorization: Bearer <jwt>` (HS256, `JWT_SECRET` env; 12 h expiry;
payload `{ sub, email }`). 401 `UNAUTHORIZED` when missing/invalid/expired.

| Method & path | Body / query | Response |
|---|---|---|
| `GET /api/health` | – | `{ ok: true }` |
| `POST /api/auth/login` | `{ email, password }` (rate-limited 10/min/IP) | `{ token, user: { email } }` · 401 `INVALID_CREDENTIALS` |
| `GET /api/auth/me` 🔒 | – | `{ user: { email } }` |
| `POST /api/auth/change-password` 🔒 | `{ currentPassword, newPassword (>= 6) }` | `{ ok: true }` |
| `GET /api/public/show` | – | `ShowPayload` (spoiler-filtered) |
| `GET /api/admin/show` 🔒 | – | `ShowPayload` (UNFILTERED, for admin preview) |
| `GET /api/admin/overview` 🔒 | – | `{ studentCount, tierCount, tiers: [{ tier: Tier, studentCount, expected: rankTo-rankFrom+1 }], unassignedStudents: Student[], missingRanks: number[] /* ranks 1..maxRank with no student */, viewers: number, state: ShowState }` |
| `GET /api/admin/students` 🔒 | `?q=` search name/school/city | `{ students: Student[] }` sorted by rank asc |
| `POST /api/admin/students` 🔒 | `{ rank, name, school, city?, score? }` | `{ student }` (201) · 409 `RANK_TAKEN` |
| `PUT /api/admin/students/:id` 🔒 | partial of the above | `{ student }` |
| `DELETE /api/admin/students/:id` 🔒 | – | `{ ok: true }` (also removes photo file) |
| `DELETE /api/admin/students` 🔒 | `{ confirm: "DELETE ALL" }` | `{ ok: true, deleted: n }` |
| `POST /api/admin/students/:id/photo` 🔒 | multipart `photo` (jpg/png/webp, ≤ 5 MB) | `{ student }` |
| `DELETE /api/admin/students/:id/photo` 🔒 | – | `{ student }` |
| `POST /api/admin/students/photos` 🔒 | multipart `photos[]` (≤ 250 files) named by rank, e.g. `17.jpg` | `{ matched: number, unmatched: string[] }` |
| `POST /api/admin/students/import` 🔒 | multipart `file` (.csv / .xlsx), fields `mode` = `merge`\|`replace`, `dryRun` = `true`\|`false` | `{ rows: ImportRow[], errors: ImportError[], summary: { total, valid, invalid, created, updated, removed }, committed: boolean }` |
| `GET /api/admin/students/template.csv` 🔒 | – | CSV `rank,name,school,city,score` with 3 sample lines |
| `GET /api/admin/students/export.csv` 🔒 | – | CSV of all students |
| `GET /api/admin/tiers` 🔒 | – | `{ tiers: Tier[] }` sorted by order |
| `POST /api/admin/tiers` 🔒 | Tier without id/order (order appended) | `{ tier }` (201) |
| `PUT /api/admin/tiers/:id` 🔒 | partial Tier | `{ tier }` |
| `DELETE /api/admin/tiers/:id` 🔒 | – | `{ ok: true }` |
| `POST /api/admin/tiers/reorder` 🔒 | `{ ids: string[] }` | `{ tiers }` |
| `GET /api/admin/tiers/presets` 🔒 | – | `{ presets: [{ key, name, description, tiers: TierInput[] }] }` |
| `POST /api/admin/tiers/apply-preset` 🔒 | `{ key }` | `{ tiers }` (replaces all tiers) |
| `GET /api/admin/settings` 🔒 | – | `{ settings }` |
| `PUT /api/admin/settings` 🔒 | partial Settings | `{ settings }` |
| `POST /api/admin/settings/logo` 🔒 | multipart `logo` (png/jpg/webp/svg ≤ 3 MB) | `{ settings }` |
| `DELETE /api/admin/settings/logo` 🔒 | – | `{ settings }` |
| `GET /api/admin/presentation` 🔒 | – | `{ state: ShowState, stages: ShowStage[] (unfiltered), viewers }` |
| `POST /api/admin/presentation/next` 🔒 | – | `{ state }` |
| `POST /api/admin/presentation/prev` 🔒 | – | `{ state }` |
| `POST /api/admin/presentation/goto` 🔒 | `{ stageIndex, step? }` | `{ state }` |
| `POST /api/admin/presentation/reset` 🔒 | – | `{ state }` |

`ImportRow = { line: number, rank, name, school, city, score }`, `ImportError = { line: number, field?: string, message: string }`.
Import header matching is case-insensitive with aliases (`rank|position|s.no rank`, `name|student name|student`,
`school|school name|institution`, `city|location`, `score|marks|points`). Duplicate ranks inside the file are errors.
`merge`: upsert by rank (update name/school/city/score of existing rank, keep photo). `replace`: delete all
students not in the file (photos of removed students deleted) then upsert. With `dryRun=true` nothing is written.
If any row is invalid and `dryRun=false`, nothing is written (400 `IMPORT_INVALID` with the same body shape).

## Socket.IO

- Path `/socket.io`, same origin. No auth needed to listen.
- Server → all clients: `show:update` (`ShowPayload`, spoiler-filtered) — emitted on connect (to that socket)
  and broadcast after ANY change to state, students, tiers or settings.
- Server → all clients: `viewers` (`{ count }`) when connections change.
- Admin UIs listen to `show:update` for state changes and refetch their admin data as needed.

## Default data (seeded on first boot)

- Admin user `a@gmail.com` / `123456` (bcrypt hash stored in db). Change via Settings → Account.
- Settings as in the defaults above.
- Tier preset `classic-5` (in reveal order):
  1. "Merit Achievers" 151–200 · grid · asc · `#38bdf8` · award · prize "Certificate of Merit"
  2. "Rising Innovators" 101–150 · grid · asc · `#60a5fa` · star · "Certificate of Excellence"
  3. "AI Explorers" 21–100 · grid · asc · `#818cf8` · rocket · "Certificate + Exciting Goodies"
  4. "Top 20 Stars" 4–20 · spotlight · desc · `#c084fc` · medal · "Merit Scholarship + Trophy"
  5. "The Champions" 1–3 · podium · `#facc15` · crown · prize "Cash Prizes + Exciting Scholarships", prizeAmount "Up to ₹1 Lakh"
- Other presets: `focus-top-10` (11–200 grid, 4–10 spotlight, 1–3 podium) and `quick-3` (4–200 grid, 1–3 podium).
- No students by default. `npm run seed:demo` (in `server/`) inserts 200 clearly-fake demo students for rehearsal.

## Show UX flow

1. **Intro** — full-screen 3D AI background, robot mascot, org line + logo at top, giant 3D "AI Quest"
   lettering, white pill "LEARN FROM THE BEST"-style ribbon (tagline), edition line ("Results 2026"),
   handwritten lines, glowing professional **Reveal Results** button (only for a logged-in admin on that
   screen; others see "The reveal begins shortly…" pulse). Click → 3-2-1 warp countdown → `next`.
2. **Tier title card** (step 0): rank range, tier name, prize/amount, accent color, icon, 3D glass card.
3. **Tier reveal**: `grid` = manually advanced pages of up to 12 student cards; `spotlight` = big hero card
   for the newest reveal + revealed wall. Saved legacy `scroll` tiers display as grid pages.
4. **Podium** — real three.js 3D podium (gold center/silver left/bronze right), spotlights, individual reveals 3 → 2 → 1
   with camera moves; each winner's name, school, photo, optional score, and tier prize appear together. A final step
   displays all podium winners together; confetti lands with #1's individual reveal.
5. **Finale** — congratulations to all `totalWinners`, thanks, contact line.
- HUD: bottom stage progress rail, live/connection dot, fullscreen (F), admin-only controls
  (← / → / Space / PageUp/PageDown — presentation clicker compatible). Cursor hides after 3 s idle.
- `prefers-reduced-motion` and `settings.quality` reduce effects.

### Preview mode (admin rehearsal, does NOT touch the live screen)

`/?preview=1&stage=<index>&step=<step>` — when an admin JWT is present, ShowPage loads `GET /api/admin/show`
(unfiltered), ignores socket state changes (but refetches data on `show:update` so edits appear), and keeps
`stageIndex/step` LOCALLY (initialised from the query, defaults 0/0). Keyboard / on-screen Next/Back move the
local position only and update the query string (`history.replaceState`). A small gold "PREVIEW · not live"
badge is shown. Without a token, `?preview` is ignored (normal live mode). Intro "Reveal Results" in preview
also runs the countdown but only advances locally. Optional `&hud=0` hides the HUD (clean captures).
The admin Live Control page offers "Preview stage" links that open this in a new tab.
