import { ApiError } from '@/lib/api'

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code)
}

/** A short, human message for any thrown value. Never leaks stack traces to the UI. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(err instanceof ApiError)) return fallback
  switch (err.code) {
    case 'NETWORK':
      return 'Cannot reach the server. Check that it is running and you are online.'
    case 'UNAUTHORIZED':
      return 'Your session has expired. Please sign in again.'
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email or password.'
    case 'RANK_TAKEN':
      return err.message || 'That rank is already assigned to another student.'
    case 'TIER_OVERLAP':
      return err.message || 'This rank range overlaps another enabled tier.'
    case 'INVALID_CURRENT_PASSWORD':
      return 'Your current password is incorrect.'
    case 'RATE_LIMITED':
      return 'Too many requests in a short time. Please wait a few seconds and try again.'
    case 'DB_UNAVAILABLE':
      return 'The database is temporarily unreachable. The big screen keeps showing the last results; please retry in a moment.'
    case 'BUSY':
      return 'Someone else is changing the show right now. Please try again.'
  }
  if (err.status === 429) return 'Too many attempts. Please wait a minute and try again.'
  if (err.status === 413) return 'That file is too large.'
  if (err.status >= 500) return 'The server had a problem handling that request. Please try again.'
  return err.message || fallback
}
