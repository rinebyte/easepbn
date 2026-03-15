// src/routes/posts.ts
import { Elysia, t } from 'elysia'
import { eq, desc, and, inArray } from 'drizzle-orm'
import { db } from '../config/database'
import { posts, articles, sites, templates } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { articleGenerationQueue, wordpressPostingQueue } from '../queue/queues'
import { WordPressService } from '../services/wordpress'
import { CryptoService } from '../services/crypto'
import { getVariationInstructions, generateVariationSeed } from '../services/contentVariation'

export const postsRoutes = new Elysia({ prefix: '/posts' })
  .use(authMiddleware)
  .get(
    '/',
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1)
      const limit = Math.min(100, Math.max(1, query.limit ?? 20))
      const offset = (page - 1) * limit

      const conditions = []
      if (query.status) {
        conditions.push(eq(posts.status, query.status as 'pending' | 'posting' | 'posted' | 'failed'))
      }
      if (query.siteId) {
        conditions.push(eq(posts.siteId, query.siteId))
      }
      if (query.articleId) {
        conditions.push(eq(posts.articleId, query.articleId))
      }

      const rows = await db
        .select()
        .from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(posts.createdAt))
        .limit(limit)
        .offset(offset)

      return { success: true, data: rows, page, limit }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        status: t.Optional(t.String()),
        siteId: t.Optional(t.String()),
        articleId: t.Optional(t.String()),
      }),
    }
  )
  .post(
    '/',
    async ({ body, set }) => {
      // Verify article and site exist
      const [article] = await db.select().from(articles).where(eq(articles.id, body.articleId)).limit(1)
      if (!article) {
        set.status = 404
        return { success: false, error: 'Article not found' }
      }

      if (article.status !== 'generated') {
        set.status = 422
        return {
          success: false,
          error: `Article must be in 'generated' status, current: ${article.status}`,
        }
      }

      const [site] = await db.select().from(sites).where(eq(sites.id, body.siteId)).limit(1)
      if (!site) {
        set.status = 404
        return { success: false, error: 'Site not found' }
      }

      const [post] = await db
        .insert(posts)
        .values({
          articleId: body.articleId,
          siteId: body.siteId,
          status: 'pending',
        })
        .returning()

      if (!post) {
        set.status = 500
        return { success: false, error: 'Failed to create post record' }
      }

      await wordpressPostingQueue.add(
        'post-to-wordpress',
        { postId: post.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 10_000 },
        }
      )

      return { success: true, data: post, message: 'Post job queued' }
    },
    {
      body: t.Object({
        articleId: t.String(),
        siteId: t.String(),
      }),
    }
  )
  .post(
    '/bulk',
    async ({ body, set }) => {
      const [article] = await db.select().from(articles).where(eq(articles.id, body.articleId)).limit(1)
      if (!article) {
        set.status = 404
        return { success: false, error: 'Article not found' }
      }

      if (article.status !== 'generated') {
        set.status = 422
        return {
          success: false,
          error: `Article must be in 'generated' status`,
        }
      }

      const createdPosts = []
      for (const siteId of body.siteIds) {
        const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1)
        if (!site) continue

        const [post] = await db
          .insert(posts)
          .values({ articleId: body.articleId, siteId, status: 'pending' })
          .returning()

        if (!post) continue

        await wordpressPostingQueue.add(
          'post-to-wordpress',
          { postId: post.id },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
          }
        )

        createdPosts.push(post)
      }

      return {
        success: true,
        message: `Queued ${createdPosts.length} posting jobs`,
        count: createdPosts.length,
      }
    },
    {
      body: t.Object({
        articleId: t.String(),
        siteIds: t.Array(t.String(), { minItems: 1 }),
      }),
    }
  )
  .post('/:id/retry', async ({ params, set }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1)

    if (!post) {
      set.status = 404
      return { success: false, error: 'Post not found' }
    }

    if (post.status !== 'failed') {
      set.status = 422
      return { success: false, error: 'Only failed posts can be retried' }
    }

    await db
      .update(posts)
      .set({
        status: 'pending',
        retryCount: 0,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, params.id))

    await wordpressPostingQueue.add(
      'post-to-wordpress',
      { postId: post.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      }
    )

    return { success: true, message: 'Post retry queued' }
  })
  .delete('/:id', async ({ params, set }) => {
    const [existing] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Post not found' }
    }

    await db.delete(posts).where(eq(posts.id, params.id))
    return { success: true, message: 'Post deleted' }
  })
  // Phase 4: Bulk retry failed posts
  .post(
    '/bulk-retry',
    async ({ body }) => {
      const conditions = [eq(posts.status, 'failed')]
      if (body?.siteId) {
        conditions.push(eq(posts.siteId, body.siteId))
      }

      const failedPosts = await db
        .select()
        .from(posts)
        .where(conditions.length > 1 ? and(...conditions) : conditions[0])
        .limit(body?.limit ?? 200)

      let queued = 0
      for (const post of failedPosts) {
        await db
          .update(posts)
          .set({
            status: 'pending',
            retryCount: 0,
            errorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(posts.id, post.id))

        await wordpressPostingQueue.add(
          'post-to-wordpress',
          { postId: post.id },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
          }
        )
        queued++
      }

      return { success: true, message: `Queued ${queued} posts for retry`, count: queued }
    },
    {
      body: t.Optional(
        t.Object({
          siteId: t.Optional(t.String()),
          limit: t.Optional(t.Number({ minimum: 1, maximum: 500 })),
        })
      ),
    }
  )
  // Phase 4: Bulk delete posts
  .post(
    '/bulk-delete',
    async ({ body }) => {
      const conditions = []
      if (body.status) {
        conditions.push(eq(posts.status, body.status as any))
      }
      if (body.siteId) {
        conditions.push(eq(posts.siteId, body.siteId))
      }
      if (body.postIds?.length) {
        conditions.push(inArray(posts.id, body.postIds))
      }

      if (conditions.length === 0) {
        return { success: false, error: 'Must specify at least one filter (status, siteId, or postIds)' }
      }

      const toDelete = await db
        .select({ id: posts.id })
        .from(posts)
        .where(conditions.length > 1 ? and(...conditions) : conditions[0])

      if (toDelete.length > 0) {
        await db
          .delete(posts)
          .where(inArray(posts.id, toDelete.map((p) => p.id)))
      }

      return { success: true, message: `Deleted ${toDelete.length} posts`, count: toDelete.length }
    },
    {
      body: t.Object({
        status: t.Optional(t.String()),
        siteId: t.Optional(t.String()),
        postIds: t.Optional(t.Array(t.String())),
      }),
    }
  )
  // Blast Post: generate unique article per site and post to all selected PBNs
  .post(
    '/blast',
    async ({ body, set }) => {
      // Validate template
      const [template] = await db.select().from(templates).where(eq(templates.id, body.templateId)).limit(1)
      if (!template) {
        set.status = 404
        return { success: false, error: 'Template not found' }
      }

      // Validate and filter to active sites only
      const targetSites = await db
        .select()
        .from(sites)
        .where(and(
          inArray(sites.id, body.siteIds),
          eq(sites.status, 'active')
        ))

      if (targetSites.length === 0) {
        set.status = 422
        return { success: false, error: 'No active sites found in selection' }
      }

      const batchId = generateVariationSeed()
      const keyword = body.keyword
      const categoryNames = body.categoryNames ?? []
      const tagNames = body.tagNames ?? []
      const spreadWindowMs = (body.spreadWindowMinutes ?? 60) * 60 * 1000

      let articlesCreated = 0
      let postsQueued = 0

      for (let i = 0; i < targetSites.length; i++) {
        const site = targetSites[i]!
        const variationInstructions = getVariationInstructions(i, targetSites.length, batchId)

        // Create article record per site
        const [article] = await db
          .insert(articles)
          .values({
            title: `Generating: ${keyword}`,
            content: '',
            focusKeyword: keyword,
            templateId: body.templateId,
            status: 'generating',
          })
          .returning()

        if (!article) continue
        articlesCreated++

        // Queue article generation with variation
        await articleGenerationQueue.add(
          'generate-article',
          {
            articleId: article.id,
            templateId: body.templateId,
            keyword,
            variables: body.variables ?? {},
            variationInstructions,
          },
          {
            attempts: 2,
            backoff: { type: 'exponential', delay: 5000 },
          }
        )

        // Create post record
        const [post] = await db
          .insert(posts)
          .values({
            articleId: article.id,
            siteId: site.id,
            status: 'pending',
          })
          .returning()

        if (!post) continue
        postsQueued++

        // Staggered posting delay: 5min base + spread
        const baseDelay = 5 * 60 * 1000
        const stagger = i * 30 * 1000
        const randomSpread = Math.random() * spreadWindowMs
        const delay = baseDelay + stagger + randomSpread

        await wordpressPostingQueue.add(
          'post-to-wordpress',
          {
            postId: post.id,
            categoryNames,
            tagNames,
          },
          {
            delay: Math.round(delay),
            attempts: 3,
            backoff: { type: 'exponential', delay: 10_000 },
          }
        )
      }

      return {
        success: true,
        message: `Blast started: ${articlesCreated} unique articles generating, ${postsQueued} posts queued across ${targetSites.length} sites`,
        data: {
          articlesCreated,
          postsQueued,
          activeSites: targetSites.length,
          skippedSites: body.siteIds.length - targetSites.length,
          keyword,
          batchId,
        },
      }
    },
    {
      body: t.Object({
        keyword: t.String({ minLength: 1 }),
        templateId: t.String(),
        siteIds: t.Array(t.String(), { minItems: 1 }),
        variables: t.Optional(t.Record(t.String(), t.String())),
        categoryNames: t.Optional(t.Array(t.String())),
        tagNames: t.Optional(t.Array(t.String())),
        spreadWindowMinutes: t.Optional(t.Number({ minimum: 1, maximum: 1440 })),
      }),
    }
  )
  .post('/:id/unpublish', async ({ params, set }) => {
    const [post] = await db.select().from(posts).where(eq(posts.id, params.id)).limit(1)

    if (!post) {
      set.status = 404
      return { success: false, error: 'Post not found' }
    }

    if (post.status !== 'posted' || !post.wpPostId) {
      set.status = 422
      return { success: false, error: 'Post is not published on WordPress' }
    }

    // Get site credentials
    const [site] = await db.select().from(sites).where(eq(sites.id, post.siteId)).limit(1)
    if (!site) {
      set.status = 404
      return { success: false, error: 'Site not found' }
    }

    const username = CryptoService.decrypt(site.username)
    const appPassword = CryptoService.decrypt(site.applicationPassword)

    // Delete from WordPress
    const result = await WordPressService.deletePost(
      site.url,
      username,
      appPassword,
      post.wpPostId,
      true // force delete (permanent)
    )

    if (!result.success) {
      set.status = 502
      return { success: false, error: `Failed to delete from WordPress: ${result.error}` }
    }

    // Update local record
    await db
      .update(posts)
      .set({
        status: 'pending',
        wpPostId: null,
        wpPostUrl: null,
        postedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, params.id))

    return { success: true, message: 'Post unpublished from WordPress' }
  })
