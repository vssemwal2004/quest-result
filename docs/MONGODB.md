# Persistence on MongoDB (supersedes the JSON-file store in SPEC.md)

The HTTP API, socket events, show model and payload shapes in `SPEC.md` are unchanged except for the
additive differences listed under **API differences** below. Only persistence (and hardening) changed.
The JSON store (`server/src/store.js`, `server/data/db.json`, `server/uploads/`) is gone.

## Code layout

| Path | Role |
|---|---|
| `server/src/db/connect.js` | `connectMongo` / `disconnectMongo` / `pingDb` / `isDbUp`, URI redaction, DB name resolution |
| `server/src/db/models/*` | Mongoose models (the only collections the app owns) |
| `server/src/db/mappers.js` | the ONE place that maps documents → SPEC JSON (`id`, ISO dates, `/uploads/<id>`) |
| `server/src/db/repository.js` | all data access (`createRepository()`), throws the API's `HttpError`s |
| `server/src/db/files.js` | GridFS bucket helpers + `serveUpload()` for `GET /uploads/:id` |
| `server/src/db/seedMongo.js` | first-boot seeding (only what is missing) |
| `server/src/db/memory.js` | in-memory MongoDB for `MONGO_URI=memory` and the tests |
| `server/src/cache.js` | ShowPayload cache keyed by `show_state.version` |
| `server/src/uploads.js` | multer engines: images stream straight into GridFS |

## Connection

- `server/.env`: `MONGO_URI` (Atlas SRV string). Database name precedence: **`MONGO_DB` → the URI path
  (e.g. `/ai_quest`) → `ai_quest`**.
- Mongoose 8. `mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 15000, maxPoolSize: 20 })`.
- Boot fails fast with a clear, credential-free message if the connection fails (the URI is never printed —
  only `mongodb+srv://<user>:****@<host>/<db>`), with hints (Atlas IP allow-list, wrong password, malformed URI).
- Connection events are logged (connected / disconnected / reconnected).
- `GET /api/health` → `200 { ok: true, db: 'up' }` or `503 { ok: false, db: 'down' }`.
- **`MONGO_URI=memory`** (exact value; `npm run dev:memory` sets it): starts a throw-away mongod via the
  devDependency mongodb-memory-server (imported only in this case), logs `IN-MEMORY DATABASE — data is lost on
  exit`, and is refused when `NODE_ENV=production`. With `SOCKET_ADAPTER=mongo` a single-node replica set is
  started instead. Use it for UI work, rehearsals and smoke tests so demo data never lands in Atlas;
  `npm run seed:demo` fills a running memory server through the HTTP API.
- In-memory mongods (tests and memory mode) keep their data under `server/.tmp/mongo-<random>` (git-ignored),
  are stopped with `{ doCleanup: true, force: true }` and the folder is deleted afterwards; the mongod binary is
  cached in `server/node_modules/.cache/mongodb-memory-server`.

## Ownership rule — do not touch foreign data

The database may already contain the user's own collections. The app only creates/reads/writes the collections
listed below. It never drops a database or collection and never runs `deleteMany({})` outside these collections.
Bulk deletes (Delete all students, import `replace`) run only against `students` + their own GridFS files.

## Collections (Mongoose models in `server/src/db/models/`)

| Collection | Model | Notes |
|---|---|---|
| `admins` | Admin `{ email (unique, lowercase), passwordHash, passwordChangedAt, createdAt, updatedAt }` | seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (default `a@gmail.com` / `123456`) only when the collection is empty |
| `students` | Student `{ rank (unique index), name, school, city, score, photoFileId: ObjectId\|null, timestamps }` | API `id` = `_id` string; `photoUrl` = `/uploads/<photoFileId>` or null; search = case-insensitive regex on name/school/city (input escaped, ≤ 100 chars) or exact rank |
| `tiers` | Tier `{ name, subtitle, rankFrom, rankTo, prize, prizeAmount, style, color, icon, sortDirection, order, enabled }` | API `id` = `_id` string; index on `order` |
| `app_settings` | singleton `{ _id: 'settings', ...Settings, logoFileId }` | `logoUrl` = `/uploads/<logoFileId>` or null |
| `show_state` | singleton `{ _id: 'state', stageIndex, step, stageKey, version, updatedAt }` | `stageKey` (`intro` / `tier:<id>` / `finale`) keeps the live screen on the same tier when earlier tiers change; `version` only changes via `$inc`; navigation is a compare-and-swap on `version` |
| `app_meta` | `{ _id: 'jwt-secret', value }`, `{ _id: 'seed', value: { tiers: true, at } }` | jwt-secret: dev fallback only when `JWT_SECRET` is missing (production refuses to start without it). The `seed` marker means classic-5 is seeded once per database — deleting every tier is respected after a restart |
| `uploads.files` / `uploads.chunks` | GridFS bucket `uploads` | photos + logo; metadata `{ kind: 'photo'\|'logo', contentType, originalName }`; stored file names are generic (`photo.png`) |
| `socket_io_events` | capped (16 MB), only with `SOCKET_ADAPTER=mongo` | @socket.io/mongo-adapter |

All API responses keep the exact JSON shapes from SPEC (`id` strings, ISO date strings, no `_id`/`__v`).
**Ids are opaque 24-hex strings**; malformed `:id`s answer 404 `NOT_FOUND`.

## Files (GridFS)

- Images are NOT buffered in RAM: a custom multer StorageEngine streams each file into GridFS
  (`openUploadStream`) after sniffing its first 1 KB for a real JPEG/PNG/WebP (SVG for the logo). Non-images are
  drained without storing anything (single photo / logo → 400 `UNSUPPORTED_FILE`; bulk → listed in `unmatched`).
  Per-file size limits (photo 5 MB, logo 3 MB) abort the upload and delete the partial file. Bulk photos only
  store files whose name matches an existing rank; a duplicate rank keeps the first valid file.
- SVG logos (buffered, ≤ 3 MB) are refused when they contain scripts, `on*=` handlers, `javascript:` URLs,
  external `href`s / CSS `url()`s, `foreignObject` / `use` / embeds, or a DTD/entities.
- CSV/XLSX imports stay in memory (5 MB limit).
- `GET /uploads/:id` streams from GridFS with `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`,
  `ETag` = file id, 304 on `If-None-Match`, 404 for unknown/invalid ids; SVGs get a sandboxing CSP. Replacing /
  removing a photo or logo deletes the old file; deleting a student deletes its photo.
- The server keeps nothing on local disk → stateless, can be redeployed or scaled horizontally.

## Consistency

- Rank uniqueness is enforced by the unique index; duplicate-key error 11000 → 409 `RANK_TAKEN`.
- Tier overlap/podium-span validation (`assertValidTier`) runs in the repository right before writes.
- Import commit = one ordered `bulkWrite` (upsert by rank); `replace` also deletes students not in the file (and
  their photos) — inside a transaction when the deployment supports it (Atlas does), ordered writes otherwise.
- After any mutation of students/tiers/settings: `repo.show.syncAfterChange()` (clamp the state to the new stage
  list, follow `stageKey`, `version += 1`) → local cache invalidation → debounced `show:update` broadcast.

## Caching & realtime

- `cache.js` keeps the latest snapshot (`repo.loadSnapshot()`) keyed by `version`, invalidated locally after every
  change and re-validated against Mongo at most once per second (one tiny query). The public and admin payloads are
  serialised once per version; `serverTime` is appended per response.
- `GET /api/public/show`: pre-serialised JSON, `ETag: W/"show-v<version>"`, `Cache-Control: no-cache`, 304 on a
  matching `If-None-Match`. **While MongoDB is down it keeps serving the last cached payload** (the big screen never
  breaks); admin routes and login answer 503 `DB_UNAVAILABLE` (+ `Retry-After`).
- Socket.IO: `show:update` on connect from the cache; broadcasts are coalesced (60 ms) and built once per broadcast.
  Options: transports websocket + polling, `pingInterval` 20 s, `pingTimeout` 25 s, `maxHttpBufferSize` 1e5,
  `perMessageDeflate.threshold` 1024.
- `SOCKET_ADAPTER=mongo`: `@socket.io/mongo-adapter` on the capped `socket_io_events` collection (needs a replica
  set: it uses change streams — every Atlas cluster is one). Broadcasts reach the clients of all instances, other
  instances drop their cache on `show:invalidate` (server-side emit), and the viewer count is the sum of every
  instance's local count (server-side emit with ack, throttled to 1/s). Default: single instance, no adapter.

## Hardening

- zod validation on every body / query / `:id`; admin write bodies are strict (unknown keys → 400) but tolerate
  echoed read-only fields (`id`, `photoUrl`, `createdAt`, `updatedAt`, `order`, `logoUrl`). JSON bodies ≤ 1 MB (413).
- Rate limits per IP (draft-7 `RateLimit` headers, `{ error: { code: 'RATE_LIMITED' } }`): login 10/min, admin API
  300/min, presentation commands 60/10 s, `GET /api/public/show` 120/min. Per email: 8 failed logins → locked for
  5 min with the same `INVALID_CREDENTIALS` answer (no user enumeration). Limits are per process.
- JWT HS256 with `iss`/`aud` = `ai-quest`, 5 s clock tolerance. Tokens carry `pwv` (the admin's
  `passwordChangedAt`); a password change revokes every older token.
- Helmet CSP (+ `frame-ancestors 'self'`), `Referrer-Policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`, nosniff.
  CORS only for `CORS_ORIGIN`.
- `X-Request-Id` (incoming if sane, else a UUID) on every response, in error bodies (`error.requestId`) and logs.
  500s never expose messages or stacks.
- HTTP `headersTimeout` 30 s, `requestTimeout` 120 s (env `HEADERS_TIMEOUT_MS` / `REQUEST_TIMEOUT_MS`; a whole bulk
  photo upload must fit). Unhandled rejections / exceptions → log, shut down, exit 1. SIGINT/SIGTERM drain ≤ 10 s.
- Static client: hashed `/assets/*` immutable, everything else `no-cache`, precompressed `.br`/`.gz` served when
  present, otherwise `compression()` (1 KB threshold; never socket.io or `/uploads`).

## API differences vs SPEC.md (all additive)

- `GET /api/health` → `{ ok, db }` (503 when the DB is down).
- `POST /api/auth/change-password` → `{ ok: true, token }`: the old token stops working; clients should store `token`.
- Error bodies may carry `error.requestId`; new codes `RATE_LIMITED` (429), `DB_UNAVAILABLE` (503), `BUSY` (503).
- `photoUrl` / `logoUrl` are `/uploads/<24-hex>`.

## Tests

`mongodb-memory-server` (devDependency) — tests never touch Atlas. Each test file gets a fresh in-memory mongod
(`npm test` = `node --test "test/*.test.js" "test/mongo/*.test.js"`).

## Migration helper

`npm run migrate:json` (server) — one-off import of a legacy `server/data/db.json` (if present) into Mongo,
idempotent (upsert by rank / tier name), photos from `server/uploads` copied into GridFS.
