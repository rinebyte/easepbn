// src/queue/workers/scheduledExecution.ts
import { Worker } from 'bullmq'
import { eq, and, sql, inArray } from 'drizzle-orm'
import { redis } from '../../config/redis'
import { db } from '../../config/database'
import { schedules, articles, posts, postLogs, sites } from '../../db/schema'
import { articleGenerationQueue, wordpressPostingQueue } from '../queues'
import { KeywordService } from '../../services/keyword'
import { getVariationInstructions, generateVariationSeed } from '../../services/contentVariation'
import { NotificationService } from '../../services/notification'

interface ScheduledExecutionJob {
  scheduleId: string
}

interface BlastOrchestratorJob {
  articleSitePairs: { articleId: string; siteId: string }[]
  categoryNames: string[]
  tagNames: string[]
  batchId: string
}

export function createScheduledExecutionWorker() {
  const worker = new Worker<ScheduledExecutionJob | BlastOrchestratorJob>(
    'scheduled-execution',
    async (job) => {
      // Route to blast orchestrator if applicable
      if (job.name === 'blast-orchestrator') {
        return handleBlastOrchestrator(job.data as BlastOrchestratorJob)
      }

      const { scheduleId } = job.data as ScheduledExecutionJob
      const startTime = Date.now()

      console.log(`[ScheduleWorker] Executing schedule ${scheduleId}`)

      // Load schedule
      const [schedule] = await db
        .select()
        .from(schedules)
        .where(eq(schedules.id, scheduleId))
        .limit(1)

      if (!schedule) {
        throw new Error(`Schedule ${scheduleId} not found`)
      }

      if (!schedule.templateId) {
        throw new Error(`Schedule ${scheduleId} has no template assigned`)
      }

      if (schedule.keywords.length === 0) {
        // Check keyword pool as fallback
        const poolStats = await KeywordService.getKeywordStats(scheduleId)
        if (poolStats.total === 0) {
          throw new Error(`Schedule ${scheduleId} has no keywords configured`)
        }
      }

      if (schedule.targetSiteIds.length === 0) {
        throw new Error(`Schedule ${scheduleId} has no target sites configured`)
      }

      // Phase 1B: Filter out error/inactive sites before queuing posts
      const activeSites = await db
        .select({ id: sites.id })
        .from(sites)
        .where(
          and(
            inArray(sites.id, schedule.targetSiteIds),
            eq(sites.status, 'active')
          )
        )

      const activeSiteIds = activeSites
        .map((s) => s.id)

      // Further filter: only include sites from the schedule's target list that exist
      const validSiteIds = schedule.targetSiteIds.filter((id) => activeSiteIds.includes(id))

      if (validSiteIds.length === 0) {
        throw new Error(`Schedule ${scheduleId} has no valid target sites (all inactive/error/deleted)`)
      }

      const postsPerExecution = schedule.postsPerExecution
      let articlesGenerated = 0
      let postsQueued = 0
      const batchId = generateVariationSeed()
      const uniquePerSite = schedule.uniqueArticlePerSite
      const spreadWindowMs = schedule.spreadWindowMinutes * 60 * 1000

      for (let i = 0; i < postsPerExecution; i++) {
        // Phase 2: Try keyword pool first, fallback to JSONB array
        let keyword: string
        let keywordId: string | null = null

        const poolKeyword = await KeywordService.getNextKeyword(scheduleId)
        if (poolKeyword) {
          keyword = poolKeyword.keyword
          keywordId = poolKeyword.id
          await KeywordService.markKeywordUsed(poolKeyword.id)
        } else if (schedule.keywords.length > 0) {
          // Fallback to JSONB array with random selection
          keyword = schedule.keywords[Math.floor(Math.random() * schedule.keywords.length)]!
        } else {
          console.log(`[ScheduleWorker] No keywords available for schedule ${scheduleId}, skipping iteration ${i}`)
          continue
        }

        if (uniquePerSite) {
          // Phase 5: Generate a SEPARATE article per site
          for (let siteIdx = 0; siteIdx < validSiteIds.length; siteIdx++) {
            const siteId = validSiteIds[siteIdx]!
            const variationInstructions = getVariationInstructions(siteIdx, validSiteIds.length, batchId)

            // Create article record per site
            const [article] = await db
              .insert(articles)
              .values({
                title: `Generating: ${keyword}`,
                content: '',
                focusKeyword: keyword,
                templateId: schedule.templateId,
                status: 'generating',
              })
              .returning()

            if (!article) continue

            await articleGenerationQueue.add(
              'generate-article',
              {
                articleId: article.id,
                templateId: schedule.templateId,
                keyword,
                variables: {},
                variationInstructions,
              },
              {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
              }
            )

            articlesGenerated++

            // Create post record
            const [post] = await db
              .insert(posts)
              .values({
                articleId: article.id,
                siteId,
                status: 'pending',
              })
              .returning()

            if (!post) continue

            // Phase 5: Stagger posting with random spread window
            const baseDelay = 5 * 60 * 1000 // 5 min base for article generation
            const spreadDelay = Math.floor(Math.random() * spreadWindowMs)
            const totalDelay = baseDelay + spreadDelay

            await wordpressPostingQueue.add(
              'post-to-wordpress',
              {
                postId: post.id,
                categoryNames: schedule.categoryNames as string[],
                tagNames: schedule.tagNames as string[],
              },
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 10_000 },
                delay: totalDelay,
              }
            )

            postsQueued++
          }
        } else {
          // Original behavior: one article, post to all sites
          const [article] = await db
            .insert(articles)
            .values({
              title: `Generating: ${keyword}`,
              content: '',
              focusKeyword: keyword,
              templateId: schedule.templateId,
              status: 'generating',
            })
            .returning()

          if (!article) continue

          await articleGenerationQueue.add(
            'generate-article',
            {
              articleId: article.id,
              templateId: schedule.templateId,
              keyword,
              variables: {},
            },
            {
              attempts: 2,
              backoff: { type: 'exponential', delay: 5000 },
            }
          )

          articlesGenerated++

          // Queue posting jobs for each target site with staggered delays
          for (let siteIdx = 0; siteIdx < validSiteIds.length; siteIdx++) {
            const siteId = validSiteIds[siteIdx]!

            const [post] = await db
              .insert(posts)
              .values({
                articleId: article.id,
                siteId,
                status: 'pending',
              })
              .returning()

            if (!post) continue

            // Phase 1A & 5: Stagger posting delays per site with spread window
            const baseDelay = 5 * 60 * 1000
            const siteDelay = siteIdx * 30 * 1000 // 30s stagger per site
            const spreadDelay = Math.floor(Math.random() * Math.min(spreadWindowMs, 30_000))
            const totalDelay = baseDelay + siteDelay + spreadDelay

            await wordpressPostingQueue.add(
              'post-to-wordpress',
              {
                postId: post.id,
                categoryNames: schedule.categoryNames as string[],
                tagNames: schedule.tagNames as string[],
              },
              {
                attempts: 3,
                backoff: { type: 'exponential', delay: 10_000 },
                delay: totalDelay,
              }
            )

            postsQueued++
          }
        }
      }

      const durationMs = Date.now() - startTime

      // Update schedule counters and lastRunAt
      await db
        .update(schedules)
        .set({
          lastRunAt: new Date(),
          totalRuns: sql`${schedules.totalRuns} + 1`,
          totalArticlesGenerated: sql`${schedules.totalArticlesGenerated} + ${articlesGenerated}`,
          totalPostsCreated: sql`${schedules.totalPostsCreated} + ${postsQueued}`,
          updatedAt: new Date(),
        })
        .where(eq(schedules.id, scheduleId))

      await db.insert(postLogs).values({
        action: 'schedule_executed',
        level: 'info',
        message: `Schedule "${schedule.name}" executed: ${articlesGenerated} articles queued, ${postsQueued} posts queued`,
        scheduleId,
        durationMs,
        metadata: {
          articlesGenerated,
          postsQueued,
          postsPerExecution,
          uniquePerSite,
          validSiteCount: validSiteIds.length,
          spreadWindowMinutes: schedule.spreadWindowMinutes,
        },
      })

      await NotificationService.create({
        type: 'schedule_complete',
        title: 'Schedule Completed',
        message: `"${schedule.name}": ${articlesGenerated} articles, ${postsQueued} posts queued`,
        metadata: { scheduleId, articlesGenerated, postsQueued },
      }).catch(() => {})

      console.log(
        `[ScheduleWorker] Schedule ${scheduleId} done in ${durationMs}ms: ` +
        `${articlesGenerated} articles, ${postsQueued} posts queued`
      )
    },
    {
      connection: redis,
      concurrency: 5, // Phase 1A: scaled from 2 to 5
    }
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    console.error(`[ScheduleWorker] Job ${job.id} failed:`, err.message)

    const { scheduleId } = job.data
    await db.insert(postLogs).values({
      action: 'schedule_failed',
      level: 'error',
      message: `Schedule execution failed: ${err.message}`,
      scheduleId,
      metadata: { error: err.message },
    })
  })

  worker.on('error', (err) => {
    console.error('[ScheduleWorker] Worker error:', err.message)
  })

  return worker
}

async function handleBlastOrchestrator(data: BlastOrchestratorJob) {
  const { articleSitePairs, categoryNames, tagNames, batchId } = data

  console.log(`[BlastOrchestrator] Checking ${articleSitePairs.length} articles (batch: ${batchId})`)

  // Check all article statuses
  const articleIds = articleSitePairs.map((p) => p.articleId)
  const articleRows = await db
    .select({ id: articles.id, status: articles.status })
    .from(articles)
    .where(inArray(articles.id, articleIds))

  const statusMap = new Map(articleRows.map((a) => [a.id, a.status]))

  const generating = articleSitePairs.filter((p) => statusMap.get(p.articleId) === 'generating')
  const generated = articleSitePairs.filter((p) => statusMap.get(p.articleId) === 'generated')
  const failed = articleSitePairs.filter((p) => statusMap.get(p.articleId) === 'failed')

  console.log(
    `[BlastOrchestrator] Status: ${generated.length} generated, ${generating.length} generating, ${failed.length} failed`
  )

  // If any still generating, throw to retry
  if (generating.length > 0) {
    throw new Error(
      `${generating.length}/${articleSitePairs.length} articles still generating, waiting...`
    )
  }

  // All done (generated or failed) — proceed with posting
  let postsQueued = 0

  for (const pair of generated) {
    const [post] = await db
      .insert(posts)
      .values({
        articleId: pair.articleId,
        siteId: pair.siteId,
        status: 'pending',
      })
      .returning()

    if (!post) continue

    await wordpressPostingQueue.add(
      'post-to-wordpress',
      {
        postId: post.id,
        categoryNames,
        tagNames,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      }
    )

    postsQueued++
  }

  // Log failed articles
  if (failed.length > 0) {
    console.warn(`[BlastOrchestrator] ${failed.length} articles failed generation, skipped posting`)
  }

  await db.insert(postLogs).values({
    action: 'blast_completed',
    level: failed.length > 0 ? 'warn' : 'info',
    message: `Blast batch ${batchId}: ${postsQueued} posts queued, ${failed.length} failed`,
    metadata: {
      batchId,
      totalArticles: articleSitePairs.length,
      postsQueued,
      failedCount: failed.length,
    },
  })

  await NotificationService.create({
    type: 'bulk_complete',
    title: 'Blast Complete',
    message: `Batch ${batchId}: ${postsQueued} posts queued, ${failed.length} failed`,
    metadata: { batchId, postsQueued, failedCount: failed.length },
  }).catch(() => {})

  console.log(`[BlastOrchestrator] Batch ${batchId} complete: ${postsQueued} posts queued`)
}
