// src/middleware/errorHandler.ts
import { Elysia } from 'elysia'

export const errorHandler = new Elysia({ name: 'error-handler' }).onError(
  ({ code, error, set }) => {
    // Handle Elysia validation errors
    if (code === 'VALIDATION') {
      set.status = 422
      return {
        success: false,
        error: 'Validation error',
        details: error.message,
      }
    }

    if (code === 'NOT_FOUND') {
      set.status = 404
      return { success: false, error: 'Route not found' }
    }

    if (code === 'PARSE') {
      set.status = 400
      return { success: false, error: 'Invalid request body' }
    }

    // Handle explicit error() calls
    if (code === 'UNKNOWN') {
      const err = error as Error
      const message = err?.message ?? 'An unexpected error occurred'

      // Check for our auth errors
      if (message.includes('Missing or invalid Authorization') || message.includes('Invalid or expired token')) {
        set.status = 401
        return { success: false, error: message }
      }

      console.error('[Error]', err)
      set.status = 500
      return { success: false, error: 'Internal server error' }
    }

    console.error(`[Error][${code}]`, error)
    set.status = 500
    return { success: false, error: 'Internal server error' }
  }
)
