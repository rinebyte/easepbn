// src/queue/workers/wordpressPosting.ts
import { Worker } from 'bullmq'
import { eq, sql } from 'drizzle-orm'
import { redis } from '../../config/redis'
import { db } from '../../config/database'
import { posts, articles, sites, postLogs } from '../../db/schema'
import { CryptoService } from '../../services/crypto'
import { WordPressService } from '../../services/wordpress'
import { ImageGenerationService } from '../../services/imageGeneration'

interface WordPressPostingJob {
  postId: string
  categoryNames?: string[]
  tagNames?: string[]
}

async function writeLog(params: {
  action: string
  level: 'info' | 'error' | 'warn'
  message: string
  siteId?: string
  articleId?: string
  postId?: string
  scheduleId?: string
  durationMs?: number
  metadata?: Record<string, unknown>
}) {
  await db.insert(postLogs).values(params)
}

export function createWordPressPostingWorker() {
  const worker = new Worker<WordPressPostingJob>(
    'wordpress-posting',
    async (job) => {
      const { postId, categoryNames = [], tagNames = [] } = job.data
      const startTime = Date.now()

      console.log(`[PostingWorker] Processing post ${postId}`)

      // Load post with article and site
      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1)
      if (!post) throw new Error(`Post ${postId} not found`)

      const [article] = await db.select().from(articles).where(eq(articles.id, post.articleId)).limit(1)
      if (!article) throw new Error(`Article ${post.articleId} not found`)

      const [site] = await db.select().from(sites).where(eq(sites.id, post.siteId)).limit(1)
      if (!site) throw new Error(`Site ${post.siteId} not found`)

      // Phase 1A: Per-site rate limiting — check maxPostsPerDay before posting
      if (site.postsToday >= site.maxPostsPerDay) {
        console.log(
          `[PostingWorker] Site "${site.name}" reached daily limit (${site.postsToday}/${site.maxPostsPerDay}), skipping post ${postId}`
        )
        await writeLog({
          action: 'post_rate_limited',
          level: 'warn',
          message: `Post skipped: site "${site.name}" reached daily limit (${site.postsToday}/${site.maxPostsPerDay})`,
          siteId: site.id,
          articleId: article.id,
          postId: post.id,
        })
        // Re-queue with delay for next day (or retry later)
        throw new Error(`Site daily limit reached (${site.postsToday}/${site.maxPostsPerDay})`)
      }

      // Skip if site is not active
      if (site.status !== 'active') {
        console.log(`[PostingWorker] Site "${site.name}" is ${site.status}, skipping post ${postId}`)
        await writeLog({
          action: 'post_skipped_inactive',
          level: 'warn',
          message: `Post skipped: site "${site.name}" is ${site.status}`,
          siteId: site.id,
          postId: post.id,
        })
        throw new Error(`Site is ${site.status}`)
      }

      // Mark as posting
      await db
        .update(posts)
        .set({ status: 'posting', updatedAt: new Date() })
        .where(eq(posts.id, postId))

      // Decrypt credentials
      const username = CryptoService.decrypt(site.username)
      const appPassword = CryptoService.decrypt(site.applicationPassword)

      // Resolve categories and tags
      const resolvedCategoryIds = categoryNames.length > 0
        ? await WordPressService.resolveCategories(site.url, username, appPassword, categoryNames)
        : (post.wpCategoryIds as number[]) ?? []

      const resolvedTagIds = tagNames.length > 0
        ? await WordPressService.resolveTags(site.url, username, appPassword, tagNames)
        : (post.wpTagIds as number[]) ?? []

      // Post to WordPress
      const wpPost = await WordPressService.createPost(site.url, username, appPassword, {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt ?? undefined,
        status: 'publish',
        categories: resolvedCategoryIds,
        tags: resolvedTagIds,
      })

      // Phase 6A: Try to upload featured image
      let featuredImageId: number | undefined
      try {
        if (article.focusKeyword) {
          const image = await ImageGenerationService.findImage(article.focusKeyword)
          if (image) {
            const mediaId = await WordPressService.uploadMediaFromUrl(
              site.url,
              username,
              appPassword,
              image.url,
              image.alt
            )
            if (mediaId) {
              await WordPressService.setFeaturedImage(
                site.url,
                username,
                appPassword,
                wpPost.id,
                mediaId
              )
              featuredImageId = mediaId
            }
          }
        }
      } catch (err) {
        // Featured image is non-critical, log and continue
        console.log(`[PostingWorker] Featured image failed for post ${postId}:`, err instanceof Error ? err.message : err)
      }

      const durationMs = Date.now() - startTime

      // Update post record
      await db
        .update(posts)
        .set({
          status: 'posted',
          wpPostId: wpPost.id,
          wpPostUrl: wpPost.link,
          wpCategoryIds: resolvedCategoryIds,
          wpTagIds: resolvedTagIds,
          postedAt: new Date(),
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(posts.id, postId))

      // Update site posts today counter
      await db
        .update(sites)
        .set({
          postsToday: sql`${sites.postsToday} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(sites.id, site.id))

      await writeLog({
        action: 'post_created',
        level: 'info',
        message: `Successfully posted article "${article.title}" to ${site.name}`,
        siteId: site.id,
        articleId: article.id,
        postId: post.id,
        durationMs,
        metadata: { wpPostId: wpPost.id, wpPostUrl: wpPost.link, featuredImageId },
      })

      console.log(
        `[PostingWorker] Post ${postId} published to ${site.name} (WP ID: ${wpPost.id}) in ${durationMs}ms`
      )
    },
    {
      connection: redis,
      concurrency: 15, // Phase 1A: scaled from 5 to 15
      limiter: {
        max: 20,
        duration: 60_000,
      },
    }
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    console.error(`[PostingWorker] Job ${job.id} failed (attempt ${job.attemptsMade}):`, err.message)

    const { postId } = job.data

    // Increment retry count
    const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1)
    if (!post) return

    const newRetryCount = post.retryCount + 1
    const isFinalFailure = newRetryCount >= post.maxRetries || job.attemptsMade >= (job.opts.attempts ?? 3)

    await db
      .update(posts)
      .set({
        status: isFinalFailure ? 'failed' : 'pending',
        retryCount: newRetryCount,
        errorMessage: err.message,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId))

    await writeLog({
      action: 'post_failed',
      level: 'error',
      message: `Failed to post: ${err.message}`,
      postId,
      metadata: { retryCount: newRetryCount, isFinalFailure },
    })

    // Re-throw so BullMQ can retry if we haven't hit max attempts
    if (!isFinalFailure) {
      throw err
    }
  })

  worker.on('error', (err) => {
    console.error('[PostingWorker] Worker error:', err.message)
  })

  return worker
}
