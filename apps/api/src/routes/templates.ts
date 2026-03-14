// src/routes/templates.ts
import { Elysia, t } from 'elysia'
import { eq, desc } from 'drizzle-orm'
import { db } from '../config/database'
import { templates } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { OpenAIService } from '../services/openai'

export const templatesRoutes = new Elysia({ prefix: '/templates' })
  .use(authMiddleware)
  .get('/', async () => {
    const rows = await db.select().from(templates).orderBy(desc(templates.createdAt))
    return { success: true, data: rows }
  })
  .get('/:id', async ({ params, set }) => {
    const [template] = await db.select().from(templates).where(eq(templates.id, params.id)).limit(1)

    if (!template) {
      set.status = 404
      return { success: false, error: 'Template not found' }
    }

    return { success: true, data: template }
  })
  .post(
    '/',
    async ({ body }) => {
      const [template] = await db.insert(templates).values(body).returning()
      return { success: true, data: template }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.Optional(t.String()),
        systemPrompt: t.String({ minLength: 1 }),
        userPromptTemplate: t.String({ minLength: 1 }),
        variables: t.Optional(t.Array(t.String())),
        model: t.Optional(t.String()),
        maxTokens: t.Optional(t.Number({ minimum: 100, maximum: 16000 })),
        temperature: t.Optional(t.String()),
        isDefault: t.Optional(t.Boolean()),
      }),
    }
  )
  .put(
    '/:id',
    async ({ params, body, set }) => {
      const [existing] = await db.select().from(templates).where(eq(templates.id, params.id)).limit(1)

      if (!existing) {
        set.status = 404
        return { success: false, error: 'Template not found' }
      }

      const [updated] = await db
        .update(templates)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(templates.id, params.id))
        .returning()

      return { success: true, data: updated }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String()),
        systemPrompt: t.Optional(t.String()),
        userPromptTemplate: t.Optional(t.String()),
        variables: t.Optional(t.Array(t.String())),
        model: t.Optional(t.String()),
        maxTokens: t.Optional(t.Number({ minimum: 100, maximum: 16000 })),
        temperature: t.Optional(t.String()),
        isDefault: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete('/:id', async ({ params, set }) => {
    const [existing] = await db.select().from(templates).where(eq(templates.id, params.id)).limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Template not found' }
    }

    await db.delete(templates).where(eq(templates.id, params.id))
    return { success: true, message: 'Template deleted' }
  })
  .post(
    '/:id/preview',
    async ({ params, body, set }) => {
      const [template] = await db.select().from(templates).where(eq(templates.id, params.id)).limit(1)

      if (!template) {
        set.status = 404
        return { success: false, error: 'Template not found' }
      }

      // Replace template variables with provided sample values
      let userPrompt = template.userPromptTemplate
      const variables = body.variables ?? {}

      for (const [key, value] of Object.entries(variables)) {
        userPrompt = userPrompt.replaceAll(`{{${key}}}`, value)
      }

      // Fill any remaining unreplaced variables with placeholder text
      userPrompt = userPrompt.replace(/\{\{(\w+)\}\}/g, '[SAMPLE $1]')

      const result = await OpenAIService.generateArticle(
        template.systemPrompt,
        userPrompt,
        template.model,
        Math.min(template.maxTokens, 2000), // Limit preview tokens
        parseFloat(String(template.temperature))
      )

      return {
        success: true,
        data: {
          article: result.article,
          usage: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            estimatedCostUsd: result.estimatedCostUsd,
          },
        },
      }
    },
    {
      body: t.Object({
        variables: t.Optional(t.Record(t.String(), t.String())),
      }),
    }
  )
