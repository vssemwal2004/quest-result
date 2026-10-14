import mongoose from 'mongoose'
import { baseOptions, defineModel } from './common.js'

export const META_IDS = { jwtSecret: 'jwt-secret', seed: 'seed' }

/** Small key/value documents: `{ _id: 'jwt-secret', value }`, `{ _id: 'seed', value: { tiers, at } }`. */
const appMetaSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true, maxlength: 64 },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { ...baseOptions, collection: 'app_meta', timestamps: true },
)

export const AppMeta = defineModel('AppMeta', appMetaSchema)
