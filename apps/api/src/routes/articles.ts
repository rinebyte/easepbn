// src/routes/articles.ts
import { Elysia, t } from 'elysia'
import { eq, desc, and } from 'drizzle-orm'
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

      const rows = await db
        .select()
        .from(articles)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset)

      return { success: true, data: rows, page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
        status: t.Optional(t.String()),
      }),
    }
  )
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
