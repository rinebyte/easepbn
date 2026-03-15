// src/routes/schedules.ts
import { Elysia, t } from 'elysia'
import { eq, desc, and } from 'drizzle-orm'
import { parseExpression as parseCronExpression } from 'cron-parser'
import { db } from '../config/database'
import { schedules, postLogs } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { scheduledExecutionQueue } from '../queue/queues'
import { KeywordService } from '../services/keyword'

function getNextRunAt(cronExpression: string): Date {
  const interval = parseCronExpression(cronExpression, { currentDate: new Date() })
  return interval.next().toDate()
}

export const schedulesRoutes = new Elysia({ prefix: '/schedules' })
  .use(authMiddleware)
  .get('/', async () => {
    const rows = await db.select().from(schedules).orderBy(desc(schedules.createdAt))
    return { success: true, data: rows }
  })
  .get('/:id', async ({ params, set }) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)

    if (!schedule) {
      set.status = 404
      return { success: false, error: 'Schedule not found' }
    }

    return { success: true, data: schedule }
  })
  .post(
    '/',
    async ({ body, set }) => {
      // Validate cron expression
      try {
        parseCronExpression(body.cronExpression)
      } catch {
        set.status = 422
        return { success: false, error: 'Invalid cron expression' }
      }

      const nextRunAt = getNextRunAt(body.cronExpression)

      // Warn if no keywords configured (will fail at execution time)
      const hasKeywords = (body.keywords ?? []).filter(k => k.trim()).length > 0

      const [schedule] = await db
        .insert(schedules)
        .values({
          ...body,
          nextRunAt,
        })
        .returning()

      return {
        success: true,
        data: schedule,
        ...(hasKeywords ? {} : {
          warning: 'No keywords configured. Import keywords via the Keyword Pool before enabling this schedule.',
        }),
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        enabled: t.Optional(t.Boolean()),
        frequency: t.Union([
          t.Literal('hourly'),
          t.Literal('daily'),
          t.Literal('weekly'),
          t.Literal('custom'),
        ]),
        cronExpression: t.String({ minLength: 1 }),
        templateId: t.Optional(t.String()),
        keywords: t.Optional(t.Array(t.String())),
        targetSiteIds: t.Optional(t.Array(t.String())),
        categoryNames: t.Optional(t.Array(t.String())),
        tagNames: t.Optional(t.Array(t.String())),
        postsPerExecution: t.Optional(t.Number({ minimum: 1 })),
        spreadWindowMinutes: t.Optional(t.Number({ minimum: 1 })),
        uniqueArticlePerSite: t.Optional(t.Boolean()),
        contentBrief: t.Optional(t.String()),
      }),
    }
  )
  .put(
    '/:id',
    async ({ params, body, set }) => {
      const [existing] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)

      if (!existing) {
        set.status = 404
        return { success: false, error: 'Schedule not found' }
      }

      const updateData: Partial<typeof schedules.$inferInsert> = {
        ...body,
        updatedAt: new Date(),
      }

      // Recalculate nextRunAt if cron expression changed
      if (body.cronExpression && body.cronExpression !== existing.cronExpression) {
        try {
          updateData.nextRunAt = getNextRunAt(body.cronExpression)
        } catch {
          set.status = 422
          return { success: false, error: 'Invalid cron expression' }
        }
      }

      const [updated] = await db
        .update(schedules)
        .set(updateData)
        .where(eq(schedules.id, params.id))
        .returning()

      return { success: true, data: updated }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        frequency: t.Optional(
          t.Union([
            t.Literal('hourly'),
            t.Literal('daily'),
            t.Literal('weekly'),
            t.Literal('custom'),
          ])
        ),
        cronExpression: t.Optional(t.String()),
        templateId: t.Optional(t.String()),
        keywords: t.Optional(t.Array(t.String())),
        targetSiteIds: t.Optional(t.Array(t.String())),
        categoryNames: t.Optional(t.Array(t.String())),
        tagNames: t.Optional(t.Array(t.String())),
        postsPerExecution: t.Optional(t.Number({ minimum: 1 })),
        spreadWindowMinutes: t.Optional(t.Number({ minimum: 1 })),
        uniqueArticlePerSite: t.Optional(t.Boolean()),
        contentBrief: t.Optional(t.String()),
      }),
    }
  )
  .delete('/:id', async ({ params, set }) => {
    const [existing] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Schedule not found' }
    }

    await db.delete(schedules).where(eq(schedules.id, params.id))
    return { success: true, message: 'Schedule deleted' }
  })
  .post('/:id/toggle', async ({ params, set }) => {
    const [existing] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Schedule not found' }
    }

    const newEnabled = !existing.enabled
    const updateData: Partial<typeof schedules.$inferInsert> = {
      enabled: newEnabled,
      updatedAt: new Date(),
    }

    // Recalculate nextRunAt when enabling
    if (newEnabled) {
      updateData.nextRunAt = getNextRunAt(existing.cronExpression)
    }

    const [updated] = await db
      .update(schedules)
      .set(updateData)
      .where(eq(schedules.id, params.id))
      .returning()

    return {
      success: true,
      data: updated,
      message: `Schedule ${newEnabled ? 'enabled' : 'disabled'}`,
    }
  })
  .post('/:id/run-now', async ({ params, set }) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)

    if (!schedule) {
      set.status = 404
      return { success: false, error: 'Schedule not found' }
    }

    const job = await scheduledExecutionQueue.add(
      'execute-schedule',
      { scheduleId: schedule.id },
      { attempts: 1 }
    )

    return {
      success: true,
      message: 'Schedule execution queued',
      jobId: job.id,
    }
  })
  .get(
    '/:id/history',
    async ({ params, query, set }) => {
      const [schedule] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)

      if (!schedule) {
        set.status = 404
        return { success: false, error: 'Schedule not found' }
      }

      const page = Math.max(1, query.page ?? 1)
      const limit = Math.min(100, Math.max(1, query.limit ?? 20))
      const offset = (page - 1) * limit

      const logs = await db
        .select()
        .from(postLogs)
        .where(eq(postLogs.scheduleId, params.id))
        .orderBy(desc(postLogs.createdAt))
        .limit(limit)
        .offset(offset)

      return { success: true, data: logs, page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
    }
  )
  // Phase 2: Keyword pool management endpoints
  .get('/:id/keywords', async ({ params, set }) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)
    if (!schedule) {
      set.status = 404
      return { success: false, error: 'Schedule not found' }
    }

    const [keywords, stats] = await Promise.all([
      KeywordService.getKeywords(params.id),
      KeywordService.getKeywordStats(params.id),
    ])

    return { success: true, data: { keywords, stats } }
  })
  .post(
    '/:id/keywords/import',
    async ({ params, body, set }) => {
      const [schedule] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)
      if (!schedule) {
        set.status = 404
        return { success: false, error: 'Schedule not found' }
      }

      const result = await KeywordService.importKeywords(body.keywords, params.id)
      return { success: true, data: result }
    },
    {
      body: t.Object({
        keywords: t.Array(t.String(), { minItems: 1 }),
      }),
    }
  )
  .delete('/:id/keywords/:keywordId', async ({ params, set }) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)
    if (!schedule) {
      set.status = 404
      return { success: false, error: 'Schedule not found' }
    }

    await KeywordService.deleteKeyword(params.keywordId)
    return { success: true, message: 'Keyword deleted' }
  })
  .post('/:id/keywords/reset', async ({ params, set }) => {
    const [schedule] = await db.select().from(schedules).where(eq(schedules.id, params.id)).limit(1)
    if (!schedule) {
      set.status = 404
      return { success: false, error: 'Schedule not found' }
    }

    const count = await KeywordService.resetKeywords(params.id)
    return { success: true, message: `Reset ${count} exhausted keywords`, count }
  })
