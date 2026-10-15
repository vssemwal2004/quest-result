import mongoose from 'mongoose'
import { DISPLAY_STYLES, MAX_RANK, TIER_ICONS } from '../../validation.js'
import { baseOptions, defineModel, integer } from './common.js'

const tierRank = { type: Number, required: true, min: 1, max: MAX_RANK, validate: integer }
const podiumPrizeSchema = new mongoose.Schema({
  rank: tierRank,
  prize: { type: String, default: '', trim: true, maxlength: 200 },
  prizeAmount: { type: String, default: '', trim: true, maxlength: 60 },
}, { _id: false, strict: 'throw' })

const tierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    subtitle: { type: String, default: '', trim: true, maxlength: 120 },
    rankFrom: tierRank,
    rankTo: tierRank,
    prize: { type: String, default: '', trim: true, maxlength: 200 },
    prizeAmount: { type: String, default: '', trim: true, maxlength: 60 },
    podiumPrizes: { type: [podiumPrizeSchema], default: null },
    style: { type: String, required: true, enum: DISPLAY_STYLES },
    color: { type: String, default: '#38bdf8', lowercase: true, match: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i },
    icon: { type: String, default: 'award', enum: TIER_ICONS },
    sortDirection: { type: String, default: 'asc', enum: ['asc', 'desc'] },
    gridPageCounts: { type: [Number], default: null },
    order: { type: Number, required: true, min: 0, validate: integer },
    enabled: { type: Boolean, default: true },
  },
  { ...baseOptions, collection: 'tiers' },
)
tierSchema.index({ order: 1 })

export const Tier = defineModel('Tier', tierSchema)
