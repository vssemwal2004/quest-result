import mongoose from 'mongoose'
import { MAX_RANK } from '../../validation.js'
import { baseOptions, defineModel, integer } from './common.js'

const studentSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true, min: 1, max: MAX_RANK, validate: integer },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    school: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    city: { type: String, default: null, trim: true, maxlength: 120 },
    score: { type: Number, default: null, min: -1e9, max: 1e9 },
    photoFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { ...baseOptions, collection: 'students', timestamps: true },
)
studentSchema.index({ rank: 1 }, { unique: true })

export const Student = defineModel('Student', studentSchema)
