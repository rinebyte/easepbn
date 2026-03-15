// src/index.ts
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { env } from './config/env'
import { redis } from './config/redis'
import { db } from './config/database'
import { sql } from 'drizzle-orm'
import { errorHandler } from './middleware/errorHandler'
import { authRoutes } from './routes/auth'
import { sitesRoutes } from './routes/sites'
import { articlesRoutes } from './routes/articles'
import { postsRoutes } from './routes/posts'
import { schedulesRoutes } from './routes/schedules'
import { templatesRoutes } from './routes/templates'
import { analyticsRoutes } from './routes/analytics'
import { backlinksRoutes } from './routes/backlinks'
import { createArticleGenerationWorker } from './queue/workers/articleGeneration'
import { createWordPressPostingWorker } from './queue/workers/wordpressPosting'
import { createScheduledExecutionWorker } from './queue/workers/scheduledExecution'
import { startScheduler } from './cron/scheduler'

// Start queue workers
const articleWorker = createArticleGenerationWorker()
const postingWorker = createWordPressPostingWorker()
const scheduleWorker = createScheduledExecutionWorker()

// Start cron scheduler
startScheduler()

const app = new Elysia()
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  )
  .use(errorHandler)
  // Health check (no auth required) — checks Redis + DB connectivity
  .get('/health', async () => {
    const components: Record<string, { status: string; error?: string }> = {}

    // Check database
    try {
      await db.execute(sql`SELECT 1`)
      components.database = { status: 'ok' }
    } catch (err) {
      components.database = { status: 'error', error: err instanceof Error ? err.message : 'Unknown' }
    }

    // Check Redis
    try {
      await redis.ping()
      components.redis = { status: 'ok' }
    } catch (err) {
      components.redis = { status: 'error', error: err instanceof Error ? err.message : 'Unknown' }
    }

    const allOk = Object.values(components).every((c) => c.status === 'ok')

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      components,
    }
  })
  // Mount all route groups under /api
  .group('/api', (app) =>
    app
      .use(authRoutes)
      .use(sitesRoutes)
      .use(articlesRoutes)
      .use(postsRoutes)
      .use(schedulesRoutes)
      .use(templatesRoutes)
      .use(analyticsRoutes)
      .use(backlinksRoutes)
  )
  .listen(env.API_PORT)

console.log(`[EasePBN API] Running at http://localhost:${env.API_PORT}`)
console.log(`[EasePBN API] Environment: ${process.env.NODE_ENV ?? 'development'}`)

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[EasePBN API] Shutting down...')
  await articleWorker.close()
  await postingWorker.close()
  await scheduleWorker.close()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[EasePBN API] Shutting down...')
  await articleWorker.close()
  await postingWorker.close()
  await scheduleWorker.close()
  process.exit(0)
})

export type App = typeof app
