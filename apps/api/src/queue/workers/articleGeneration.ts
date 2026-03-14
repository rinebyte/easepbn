// src/queue/workers/articleGeneration.ts
import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { redis } from '../../config/redis'
import { db } from '../../config/database'
import { articles, templates } from '../../db/schema'
import { OpenAIService } from '../../services/openai'
import {
  getActiveBacklinks,
  buildBacklinkPromptInstructions,
  injectBacklinksIntoHtml,
  incrementBacklinkUsage,
} from '../../services/backlink'

interface ArticleGenerationJob {
  articleId: string
  templateId: string
  keyword: string
  variables?: Record<string, string>
  variationInstructions?: string // Phase 5: content diversity
}

export function createArticleGenerationWorker() {
  const worker = new Worker<ArticleGenerationJob>(
    'article-generation',
    async (job) => {
      const { articleId, templateId, keyword, variables = {}, variationInstructions } = job.data
      const startTime = Date.now()

      console.log(`[ArticleWorker] Processing article ${articleId} for keyword: ${keyword}`)

      // Mark as generating
      await db
        .update(articles)
        .set({ status: 'generating', updatedAt: new Date() })
        .where(eq(articles.id, articleId))

      // Load template
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, templateId))
        .limit(1)

      if (!template) {
        throw new Error(`Template ${templateId} not found`)
      }

      // Build user prompt by replacing variables
      let userPrompt = template.userPromptTemplate

      // Replace {{keyword}} first
      userPrompt = userPrompt.replaceAll('{{keyword}}', keyword)

      // Replace other variables
      for (const [key, value] of Object.entries(variables)) {
        userPrompt = userPrompt.replaceAll(`{{${key}}}`, value)
      }

      // Replace any remaining unreplaced variables with empty string
      userPrompt = userPrompt.replace(/\{\{(\w+)\}\}/g, '')

      // Fetch active backlinks and add instructions to prompt
      const backlinkRules = await getActiveBacklinks()
      if (backlinkRules.length > 0) {
        userPrompt += buildBacklinkPromptInstructions(backlinkRules)
      }

      // Phase 5: Append variation instructions for content diversity
      if (variationInstructions) {
        userPrompt += variationInstructions
      }

      // Generate article
      const result = await OpenAIService.generateArticle(
        template.systemPrompt,
        userPrompt,
        template.model,
        template.maxTokens,
        parseFloat(String(template.temperature))
      )

      const durationMs = Date.now() - startTime

      // Post-process: inject backlinks as fallback if AI missed them
      let finalContent = result.article.content
      if (backlinkRules.length > 0) {
        const injection = injectBacklinksIntoHtml(finalContent, backlinkRules)
        finalContent = injection.html

        // Track usage for backlinks that were inserted
        const insertedIds = backlinkRules
          .filter((r) => finalContent.includes(r.targetUrl))
          .map((r) => r.id)
        await incrementBacklinkUsage(insertedIds)

        console.log(
          `[ArticleWorker] Injected ${injection.insertedCount} backlinks into article ${articleId}`
        )
      }

      // Update article with generated content
      await db
        .update(articles)
        .set({
          title: result.article.title,
          content: finalContent,
          excerpt: result.article.excerpt,
          metaTitle: result.article.metaTitle,
          metaDescription: result.article.metaDescription,
          focusKeyword: keyword,
          tags: result.article.tags,
          status: 'generated',
          generationTokens: result.totalTokens,
          generationCost: String(result.estimatedCostUsd),
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId))

      console.log(
        `[ArticleWorker] Article ${articleId} generated in ${durationMs}ms ` +
        `(${result.totalTokens} tokens, $${result.estimatedCostUsd.toFixed(6)})`
      )
    },
    {
      connection: redis,
      concurrency: 8, // Phase 1A: scaled from 3 to 8
      limiter: {
        max: 30,
        duration: 60_000, // Phase 1A: 30 requests per minute to avoid OpenAI limits
      },
    }
  )

  worker.on('failed', async (job, err) => {
    if (!job) return
    console.error(`[ArticleWorker] Job ${job.id} failed:`, err.message)

    const { articleId } = job.data
    await db
      .update(articles)
      .set({
        status: 'failed',
        errorMessage: err.message,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId))
  })

  worker.on('error', (err) => {
    console.error('[ArticleWorker] Worker error:', err.message)
  })

  return worker
}
