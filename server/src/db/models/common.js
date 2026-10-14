import mongoose from 'mongoose'

/** Shared schema options: no `__v`, unknown fields are an error instead of being dropped silently. */
export const baseOptions = { versionKey: false, strict: 'throw', id: false }

export const integer = { validator: Number.isInteger, message: '{PATH} must be a whole number' }

/** Reuse an already compiled model (watch mode / repeated imports) instead of throwing OverwriteModelError. */
export function defineModel(name, schema) {
  return mongoose.models[name] ?? mongoose.model(name, schema)
}
