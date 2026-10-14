import mongoose from 'mongoose'
import { baseOptions, defineModel } from './common.js'

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, minlength: 3, maxlength: 254 },
    passwordHash: { type: String, required: true, minlength: 20, maxlength: 200 },
    // Set on every password change; tokens issued under an older value are rejected (see auth.js `pwv`).
    passwordChangedAt: { type: Date, default: null },
  },
  { ...baseOptions, collection: 'admins', timestamps: true },
)
adminSchema.index({ email: 1 }, { unique: true })

export const Admin = defineModel('Admin', adminSchema)
