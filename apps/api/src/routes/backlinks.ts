// src/routes/backlinks.ts
import { Elysia, t } from 'elysia'
import { eq, desc } from 'drizzle-orm'
import { db } from '../config/database'
import { backlinks } from '../db/schema'
import { authMiddleware } from '../middleware/auth'

export const backlinksRoutes = new Elysia({ prefix: '/backlinks' })
  .use(authMiddleware)
  .get('/', async () => {
    const rows = await db
      .select()
      .from(backlinks)
      .orderBy(desc(backlinks.priority), desc(backlinks.createdAt))

    return { success: true, data: rows }
  })
  .get('/:id', async ({ params, set }) => {
    const [backlink] = await db
      .select()
      .from(backlinks)
      .where(eq(backlinks.id, params.id))
      .limit(1)

    if (!backlink) {
      set.status = 404
      return { success: false, error: 'Backlink not found' }
    }

    return { success: true, data: backlink }
  })
  .post(
    '/',
    async ({ body }) => {
      const [backlink] = await db
        .insert(backlinks)
        .values(body)
        .returning()

      return { success: true, data: backlink }
    },
    {
      body: t.Object({
        anchorText: t.String({ minLength: 1 }),
        targetUrl: t.String({ minLength: 1 }),
        maxPerArticle: t.Optional(t.Number({ minimum: 1, maximum: 10 })),
        priority: t.Optional(t.Number({ minimum: 0 })),
      }),
    }
  )
  .put(
    '/:id',
    async ({ params, body, set }) => {
      const [existing] = await db
        .select()
        .from(backlinks)
        .where(eq(backlinks.id, params.id))
        .limit(1)

      if (!existing) {
        set.status = 404
        return { success: false, error: 'Backlink not found' }
      }

      const [updated] = await db
        .update(backlinks)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(backlinks.id, params.id))
        .returning()

      return { success: true, data: updated }
    },
    {
      body: t.Object({
        anchorText: t.Optional(t.String({ minLength: 1 })),
        targetUrl: t.Optional(t.String({ minLength: 1 })),
        maxPerArticle: t.Optional(t.Number({ minimum: 1, maximum: 10 })),
        priority: t.Optional(t.Number({ minimum: 0 })),
        isActive: t.Optional(t.Boolean()),
      }),
    }
  )
  .delete('/:id', async ({ params, set }) => {
    const [existing] = await db
      .select()
      .from(backlinks)
      .where(eq(backlinks.id, params.id))
      .limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Backlink not found' }
    }

    await db.delete(backlinks).where(eq(backlinks.id, params.id))
    return { success: true, message: 'Backlink deleted' }
  })
  .post('/:id/toggle', async ({ params, set }) => {
    const [existing] = await db
      .select()
      .from(backlinks)
      .where(eq(backlinks.id, params.id))
      .limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Backlink not found' }
    }

    const [updated] = await db
      .update(backlinks)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(backlinks.id, params.id))
      .returning()

    return { success: true, data: updated }
  })
