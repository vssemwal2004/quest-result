import mongoose from 'mongoose'
import { baseOptions, defineModel } from './common.js'

export const SETTINGS_ID = 'settings'

const str = (max, extra = {}) => ({ type: String, trim: true, maxlength: max, ...extra })

/** Singleton `{ _id: 'settings', ...Settings, logoFileId }`; field limits mirror settingsUpdateSchema. */
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: SETTINGS_ID, enum: [SETTINGS_ID] },
    eventTitle: str(80, { minlength: 1 }),
    eventEdition: str(80),
    tagline: str(120),
    subTagline: str(200),
    organization: str(160),
    location: str(120),
    eventDate: str(40),
    contact: str(120),
    handwrittenLines: {
      type: [str(40)],
      default: undefined,
      validate: { validator: (v) => v == null || v.length <= 8, message: 'At most 8 handwritten lines' },
    },
    finaleTitle: str(120),
    finaleMessage: str(300),
    spoilerProtection: { type: Boolean },
    autoScrollSpeed: { type: Number, min: 10, max: 200 },
    showRobot: { type: Boolean },
    quality: { type: String, enum: ['high', 'medium', 'low'] },
    logoFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { ...baseOptions, collection: 'app_settings', timestamps: { createdAt: false, updatedAt: true } },
)

export const AppSettings = defineModel('AppSettings', settingsSchema)
