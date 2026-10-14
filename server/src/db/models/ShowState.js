import mongoose from 'mongoose'
import { baseOptions, defineModel, integer } from './common.js'

export const SHOW_STATE_ID = 'state'

/**
 * Singleton `{ _id: 'state', stageIndex, step, stageKey, version, updatedAt }`.
 * `stageKey` (e.g. 'tier:<id>') lets the live screen stay on the same tier when earlier tiers change
 * (see show.js reconcileState). `version` is only ever changed with `$inc`.
 */
const showStateSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SHOW_STATE_ID, enum: [SHOW_STATE_ID] },
    stageIndex: { type: Number, default: 0, min: 0, validate: integer },
    step: { type: Number, default: 0, min: 0, validate: integer },
    stageKey: { type: String, default: 'intro', maxlength: 64 },
    version: { type: Number, default: 1, min: 0, validate: integer },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { ...baseOptions, collection: 'show_state' },
)

export const ShowState = defineModel('ShowState', showStateSchema)
