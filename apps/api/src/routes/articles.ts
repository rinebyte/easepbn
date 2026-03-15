// src/routes/articles.ts
import { Elysia, t } from 'elysia'
import { eq, desc, and, count, ilike } from 'drizzle-orm'
import { db } from '../config/database'
import { articles } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { articleGenerationQueue } from '../queue/queues'

export const articlesRoutes = new Elysia({ prefix: '/articles' })
  .use(authMiddleware)
  .get(
    '/',
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1)
      const limit = Math.min(100, Math.max(1, query.limit ?? 20))
      const offset = (page - 1) * limit

      const conditions = []
      if (query.status) {
        conditions.push(eq(articles.status, query.status as 'draft' | 'generating' | 'generated' | 'failed'))
      }
      if (query.search) {
        conditions.push(
          ilike(articles.title, `%${query.search}%`)
        )
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      const [rows, [totalRow]] = await Promise.all([
        db
          .select()
          .from(articles)
          .where(whereClause)
          .orderBy(desc(articles.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(articles)
          .where(whereClause),
      ])

      return { success: true, data: rows, page, limit, total: totalRow?.count ?? 0 }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
        status: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    }
  )
  .get('/export', async ({ set }) => {
    const rows = await db
      .select()
      .from(articles)
      .orderBy(desc(articles.createdAt))

    const header = 'id,title,focusKeyword,status,generationTokens,generationCost,errorMessage,createdAt\n'
    const csv = rows.map((r) =>
      [
        r.id,
        `"${(r.title ?? '').replace(/"/g, '""')}"`,
        `"${(r.focusKeyword ?? '').replace(/"/g, '""')}"`,
        r.status,
        r.generationTokens ?? '',
        r.generationCost ?? '',
        `"${(r.errorMessage ?? '').replace(/"/g, '""')}"`,
        r.createdAt.toISOString(),
      ].join(',')
    ).join('\n')

    set.headers['content-type'] = 'text/csv'
    set.headers['content-disposition'] = 'attachment; filename="articles.csv"'
    return header + csv
  })
  .get('/:id', async ({ params, set }) => {
    const [article] = await db.select().from(articles).where(eq(articles.id, params.id)).limit(1)

    if (!article) {
      set.status = 404
      return { success: false, error: 'Article not found' }
    }

    return { success: true, data: article }
  })
  .put(
    '/:id',
    async ({ params, body, set }) => {
      const [existing] = await db.select().from(articles).where(eq(articles.id, params.id)).limit(1)

      if (!existing) {
        set.status = 404
        return { success: false, error: 'Article not found' }
      }

      if (existing.status === 'generating') {
        set.status = 422
        return { success: false, error: 'Cannot edit article while it is being generated' }
      }

      const [updated] = await db
        .update(articles)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(articles.id, params.id))
        .returning()

      return { success: true, data: updated }
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1 })),
        content: t.Optional(t.String()),
        excerpt: t.Optional(t.String()),
        metaTitle: t.Optional(t.String()),
        metaDescription: t.Optional(t.String()),
        focusKeyword: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
        status: t.Optional(
          t.Union([
            t.Literal('draft'),
            t.Literal('generated'),
            t.Literal('failed'),
          ])
        ),
      }),
    }
  )
  .delete('/:id', async ({ params, set }) => {
    const [existing] = await db.select().from(articles).where(eq(articles.id, params.id)).limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Article not found' }
    }

    if (existing.status === 'generating') {
      set.status = 422
      return { success: false, error: 'Cannot delete article while it is being generated' }
    }

    await db.delete(articles).where(eq(articles.id, params.id))
    return { success: true, message: 'Article deleted' }
  })
  .post(
    '/generate',
    async ({ body, set }) => {
      // Create article record in 'generating' status
      const [article] = await db
        .insert(articles)
        .values({
          title: `Generating: ${body.keyword}`,
          content: '',
          focusKeyword: body.keyword,
          templateId: body.templateId,
          status: 'generating',
        })
        .returning()

      if (!article) {
        set.status = 500
        return { success: false, error: 'Failed to create article record' }
      }

      await articleGenerationQueue.add(
        'generate-article',
        {
          articleId: article.id,
          templateId: body.templateId,
          keyword: body.keyword,
          variables: body.variables ?? {},
          contentBrief: body.contentBrief ?? undefined,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )

      return {
        success: true,
        data: { articleId: article.id, status: 'generating' },
        message: 'Article generation queued',
      }
    },
    {
      body: t.Object({
        templateId: t.String(),
        keyword: t.String({ minLength: 1 }),
        variables: t.Optional(t.Record(t.String(), t.String())),
        contentBrief: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/bulk-generate',
    async ({ body }) => {
      const jobIds: string[] = []

      for (const item of body.items) {
        const [article] = await db
          .insert(articles)
          .values({
            title: `Generating: ${item.keyword}`,
            content: '',
            focusKeyword: item.keyword,
            templateId: item.templateId ?? body.templateId,
            status: 'generating',
          })
          .returning()

        if (!article) continue

        const job = await articleGenerationQueue.add(
          'generate-article',
          {
            articleId: article.id,
            templateId: item.templateId ?? body.templateId,
            keyword: item.keyword,
            variables: item.variables ?? {},
            contentBrief: body.contentBrief ?? undefined,
          },
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
          }
        )

        jobIds.push(job.id ?? article.id)
      }

      return {
        success: true,
        message: `Queued ${jobIds.length} article generation jobs`,
        jobCount: jobIds.length,
      }
    },
    {
      body: t.Object({
        templateId: t.Optional(t.String()),
        contentBrief: t.Optional(t.String()),
        items: t.Array(
          t.Object({
            keyword: t.String({ minLength: 1 }),
            templateId: t.Optional(t.String()),
            variables: t.Optional(t.Record(t.String(), t.String())),
          }),
          { minItems: 1 }
        ),
      }),
    }
  )
  .post('/:id/retry', async ({ params, set }) => {
    const [article] = await db.select().from(articles).where(eq(articles.id, params.id)).limit(1)

    if (!article) {
      set.status = 404
      return { success: false, error: 'Article not found' }
    }

    if (article.status !== 'failed') {
      set.status = 422
      return { success: false, error: 'Only failed articles can be retried' }
    }

    if (!article.templateId) {
      set.status = 422
      return { success: false, error: 'Article has no template, cannot retry generation' }
    }

    await db
      .update(articles)
      .set({
        status: 'generating',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, params.id))

    await articleGenerationQueue.add(
      'generate-article',
      {
        articleId: article.id,
        templateId: article.templateId,
        keyword: article.focusKeyword ?? '',
        variables: {},
      },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
      }
    )

    return { success: true, message: 'Article retry queued' }
  })
  .get('/:id/generation-status', async ({ params, set }) => {
    const [article] = await db.select().from(articles).where(eq(articles.id, params.id)).limit(1)

    if (!article) {
      set.status = 404
      return { success: false, error: 'Article not found' }
    }

    return {
      success: true,
      data: {
        id: article.id,
        status: article.status,
        title: article.title,
        generationTokens: article.generationTokens,
        generationCost: article.generationCost,
        errorMessage: article.errorMessage,
        updatedAt: article.updatedAt,
      },
    }
  })
