// src/routes/analytics.ts
import { Elysia, t } from 'elysia'
import { eq, gte, sql, desc, sum, count, and } from 'drizzle-orm'
import { db } from '../config/database'
import { articles, posts, sites, postLogs, schedules } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { articleGenerationQueue, wordpressPostingQueue, scheduledExecutionQueue } from '../queue/queues'
import { NotificationService } from '../services/notification'

export const analyticsRoutes = new Elysia({ prefix: '/analytics' })
  .use(authMiddleware)
  .get('/dashboard', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Run all counts in parallel
    const [
      totalSitesResult,
      activeSitesResult,
      errorSitesResult,
      totalArticlesResult,
      generatedArticlesResult,
      totalPostsResult,
      postedPostsResult,
      failedPostsResult,
      pendingPostsResult,
      recentCostResult,
      // Phase 3: Active schedules (real count)
      activeSchedulesResult,
      // Phase 3: Today's progress
      todayProgressResult,
      // Phase 3: Recent activity (real data)
      recentActivityResult,
      // Phase 3: Site health summary
      siteHealthResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(sites),
      db.select({ count: count() }).from(sites).where(eq(sites.status, 'active')),
      db.select({ count: count() }).from(sites).where(eq(sites.status, 'error')),
      db.select({ count: count() }).from(articles),
      db.select({ count: count() }).from(articles).where(eq(articles.status, 'generated')),
      db.select({ count: count() }).from(posts),
      db.select({ count: count() }).from(posts).where(eq(posts.status, 'posted')),
      db.select({ count: count() }).from(posts).where(eq(posts.status, 'failed')),
      db.select({ count: count() }).from(posts).where(eq(posts.status, 'pending')),
      db
        .select({ totalCost: sum(articles.generationCost) })
        .from(articles)
        .where(gte(articles.createdAt, thirtyDaysAgo)),
      // Active schedules
      db.select({ count: count() }).from(schedules).where(eq(schedules.enabled, true)),
      // Today's progress: sum of postsToday vs maxPostsPerDay
      db
        .select({
          totalPostsToday: sql<number>`COALESCE(SUM(${sites.postsToday}), 0)::int`,
          totalMaxPostsPerDay: sql<number>`COALESCE(SUM(${sites.maxPostsPerDay}), 0)::int`,
        })
        .from(sites)
        .where(eq(sites.status, 'active')),
      // Recent activity: last 20 posts with article and site info
      db
        .select({
          id: posts.id,
          articleTitle: articles.title,
          siteName: sites.name,
          status: posts.status,
          postedAt: posts.postedAt,
          createdAt: posts.createdAt,
          errorMessage: posts.errorMessage,
        })
        .from(posts)
        .leftJoin(articles, eq(posts.articleId, articles.id))
        .leftJoin(sites, eq(posts.siteId, sites.id))
        .orderBy(desc(posts.createdAt))
        .limit(20),
      // Site health by status
      db
        .select({
          status: sites.status,
          count: sql<number>`count(*)::int`,
        })
        .from(sites)
        .groupBy(sites.status),
    ])

    // Build site health map
    const siteHealth: Record<string, number> = { active: 0, inactive: 0, error: 0 }
    for (const row of siteHealthResult) {
      siteHealth[row.status] = row.count
    }

    return {
      success: true,
      data: {
        sites: {
          total: totalSitesResult[0]?.count ?? 0,
          active: activeSitesResult[0]?.count ?? 0,
          error: errorSitesResult[0]?.count ?? 0,
          health: siteHealth,
        },
        articles: {
          total: totalArticlesResult[0]?.count ?? 0,
          generated: generatedArticlesResult[0]?.count ?? 0,
        },
        posts: {
          total: totalPostsResult[0]?.count ?? 0,
          posted: postedPostsResult[0]?.count ?? 0,
          failed: failedPostsResult[0]?.count ?? 0,
          pending: pendingPostsResult[0]?.count ?? 0,
        },
        costs: {
          last30DaysUsd: parseFloat(String(recentCostResult[0]?.totalCost ?? '0')),
        },
        activeSchedules: activeSchedulesResult[0]?.count ?? 0,
        todayProgress: {
          postsCompleted: todayProgressResult[0]?.totalPostsToday ?? 0,
          postsTarget: todayProgressResult[0]?.totalMaxPostsPerDay ?? 0,
        },
        recentActivity: recentActivityResult.map((r) => ({
          id: r.id,
          articleTitle: r.articleTitle ?? 'Unknown',
          siteName: r.siteName ?? 'Unknown',
          status: r.status,
          postedAt: r.postedAt?.toISOString() ?? r.createdAt.toISOString(),
          errorMessage: r.errorMessage,
        })),
      },
    }
  })
  // Phase 1C: Queue status endpoint
  .get('/queue-status', async () => {
    const [articleCounts, postingCounts, scheduleCounts] = await Promise.all([
      articleGenerationQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      wordpressPostingQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      scheduledExecutionQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    ])

    return {
      success: true,
      data: {
        articleGeneration: articleCounts,
        wordpressPosting: postingCounts,
        scheduledExecution: scheduleCounts,
      },
    }
  })
  // Phase 3: Post logs viewer
  .get(
    '/logs',
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1)
      const limit = Math.min(100, Math.max(1, query.limit ?? 50))
      const offset = (page - 1) * limit

      const conditions = []
      if (query.level) {
        conditions.push(eq(postLogs.level, query.level))
      }
      if (query.action) {
        conditions.push(eq(postLogs.action, query.action))
      }
      if (query.siteId) {
        conditions.push(eq(postLogs.siteId, query.siteId))
      }

      const rows = await db
        .select()
        .from(postLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(postLogs.createdAt))
        .limit(limit)
        .offset(offset)

      return { success: true, data: rows, page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        level: t.Optional(t.String()),
        action: t.Optional(t.String()),
        siteId: t.Optional(t.String()),
      }),
    }
  )
  .get('/posts', async () => {
    // Daily post counts for last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const rows = await db
      .select({
        date: sql<string>`DATE(${posts.postedAt})`.as('date'),
        count: count(),
      })
      .from(posts)
      .where(
        sql`${posts.postedAt} >= ${thirtyDaysAgo} AND ${posts.status} = 'posted'`
      )
      .groupBy(sql`DATE(${posts.postedAt})`)
      .orderBy(sql`DATE(${posts.postedAt})`)

    return { success: true, data: rows }
  })
  .get('/sites', async () => {
    // Per-site post counts (all time)
    const rows = await db
      .select({
        siteId: posts.siteId,
        siteName: sites.name,
        siteUrl: sites.url,
        total: count(),
        posted: sql<number>`SUM(CASE WHEN ${posts.status} = 'posted' THEN 1 ELSE 0 END)`.as('posted'),
        failed: sql<number>`SUM(CASE WHEN ${posts.status} = 'failed' THEN 1 ELSE 0 END)`.as('failed'),
      })
      .from(posts)
      .leftJoin(sites, eq(posts.siteId, sites.id))
      .groupBy(posts.siteId, sites.name, sites.url)
      .orderBy(desc(count()))

    return { success: true, data: rows }
  })
  .get('/generation', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [totals, daily] = await Promise.all([
      db
        .select({
          totalArticles: count(),
          totalTokens: sum(articles.generationTokens),
          totalCostUsd: sum(articles.generationCost),
        })
        .from(articles)
        .where(gte(articles.createdAt, thirtyDaysAgo)),
      db
        .select({
          date: sql<string>`DATE(${articles.createdAt})`.as('date'),
          count: count(),
          tokens: sum(articles.generationTokens),
          costUsd: sum(articles.generationCost),
        })
        .from(articles)
        .where(
          sql`${articles.createdAt} >= ${thirtyDaysAgo} AND ${articles.status} = 'generated'`
        )
        .groupBy(sql`DATE(${articles.createdAt})`)
        .orderBy(sql`DATE(${articles.createdAt})`),
    ])

    return {
      success: true,
      data: {
        summary: {
          totalArticles: totals[0]?.totalArticles ?? 0,
          totalTokens: parseInt(String(totals[0]?.totalTokens ?? '0'), 10),
          totalCostUsd: parseFloat(String(totals[0]?.totalCostUsd ?? '0')),
        },
        daily,
      },
    }
  })
  // Phase 6B: Notifications
  .get('/notifications', async ({ query }) => {
    const limit = query?.limit ?? 50
    const notifications = await NotificationService.getAll(limit)
    const unreadCount = await NotificationService.getUnreadCount()
    return { success: true, data: { notifications, unreadCount } }
  },
  {
    query: t.Object({
      limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
    }),
  })
  .post('/notifications/:id/read', async ({ params }) => {
    const success = await NotificationService.markRead(params.id)
    return { success }
  })
  .post('/notifications/read-all', async () => {
    const count = await NotificationService.markAllRead()
    return { success: true, count }
  })
