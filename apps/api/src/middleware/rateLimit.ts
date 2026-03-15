// src/middleware/rateLimit.ts
import { Elysia } from 'elysia'
import { redis } from '../config/redis'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  max: number // Max requests per window
  keyPrefix?: string
}

export function rateLimit(config: RateLimitConfig) {
  const { windowMs, max, keyPrefix = 'rl' } = config
  const windowSec = Math.ceil(windowMs / 1000)

  return new Elysia({ name: `rate-limit-${keyPrefix}` }).derive(
    async ({ request, set }) => {
      // Use IP + path prefix as key
      const forwarded = request.headers.get('x-forwarded-for')
      const ip = forwarded?.split(',')[0]?.trim() ?? '127.0.0.1'
      const key = `easepbn:${keyPrefix}:${ip}`

      const current = await redis.incr(key)
      if (current === 1) {
        await redis.expire(key, windowSec)
      }

      // Set rate limit headers
      const remaining = Math.max(0, max - current)
      set.headers['x-ratelimit-limit'] = String(max)
      set.headers['x-ratelimit-remaining'] = String(remaining)

      if (current > max) {
        set.status = 429
        set.headers['retry-after'] = String(windowSec)
        return {
          success: false,
          error: 'Too many requests. Please try again later.',
        }
      }
    }
  )
}

// Pre-configured rate limiters
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login attempts per 15 min
  keyPrefix: 'rl:auth',
})

export const mutationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 mutations per minute
  keyPrefix: 'rl:mutation',
})
