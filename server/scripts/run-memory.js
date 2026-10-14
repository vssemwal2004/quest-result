#!/usr/bin/env node
/**
 * `npm run dev:memory` — the server against a throw-away in-memory MongoDB (MONGO_URI=memory),
 * for UI work, rehearsals and smoke tests without touching the real database. Data is lost on exit.
 * Seed it with `npm run seed:demo` while it is running (goes through the HTTP API).
 */
process.env.MONGO_URI = 'memory' // dotenv never overrides an already set variable
await import('../src/index.js')
