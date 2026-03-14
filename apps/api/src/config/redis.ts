// src/config/redis.ts
import IORedis from 'ioredis'
import { env } from './env'

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message)
})

redis.on('connect', () => {
  console.log('[Redis] Connected')
})
