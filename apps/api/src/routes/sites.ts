// src/routes/sites.ts
import { Elysia, t } from 'elysia'
import { eq, desc, inArray, ilike, or, sql, and, count } from 'drizzle-orm'
import { db } from '../config/database'
import { sites } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { CryptoService } from '../services/crypto'
import { WordPressService } from '../services/wordpress'

export const sitesRoutes = new Elysia({ prefix: '/sites' })
  .use(authMiddleware)
  .get(
    '/',
    async ({ query }) => {
      const page = Math.max(1, query.page ?? 1)
      const limit = Math.min(200, Math.max(1, query.limit ?? 20))
      const offset = (page - 1) * limit

      // Phase 4: Build filter conditions
      const conditions = []

      if (query.search) {
        conditions.push(
          or(
            ilike(sites.name, `%${query.search}%`),
            ilike(sites.url, `%${query.search}%`)
          )
        )
      }

      if (query.status) {
        conditions.push(eq(sites.status, query.status as 'active' | 'inactive' | 'error'))
      }

      if (query.niche) {
        conditions.push(eq(sites.niche, query.niche))
      }

      if (query.tag) {
        // Filter by tag in JSONB array
        conditions.push(sql`${sites.tags} @> ${JSON.stringify([query.tag])}::jsonb`)
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined

      const [rows, [totalRow]] = await Promise.all([
        db
          .select()
          .from(sites)
          .where(whereClause)
          .orderBy(desc(sites.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(sites)
          .where(whereClause),
      ])

      // Strip encrypted credentials from response
      const data = rows.map(({ username: _u, applicationPassword: _ap, ...rest }: any) => rest)

      return { success: true, data, page, limit, total: totalRow?.count ?? 0 }
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
        search: t.Optional(t.String()),
        status: t.Optional(t.String()),
        tag: t.Optional(t.String()),
        niche: t.Optional(t.String()),
      }),
    }
  )
  // Phase 4: Get unique tags for autocomplete
  .get('/tags', async () => {
    const rows = await db
      .select({ tags: sites.tags })
      .from(sites)

    const tagSet = new Set<string>()
    for (const row of rows) {
      for (const tag of row.tags ?? []) {
        tagSet.add(tag)
      }
    }

    return { success: true, data: [...tagSet].sort() }
  })
  // Phase 4: Get unique niches for autocomplete
  .get('/niches', async () => {
    const rows = await db
      .select({ niche: sites.niche })
      .from(sites)
      .where(sql`${sites.niche} IS NOT NULL AND ${sites.niche} != ''`)
      .groupBy(sites.niche)

    return { success: true, data: rows.map((r) => r.niche).filter(Boolean) }
  })
  .get('/:id', async ({ params, set }) => {
    const [site] = await db.select().from(sites).where(eq(sites.id, params.id)).limit(1)

    if (!site) {
      set.status = 404
      return { success: false, error: 'Site not found' }
    }

    const { username: _u, applicationPassword: _ap, ...rest } = site
    return { success: true, data: rest }
  })
  .post(
    '/',
    async ({ body, set }) => {
      // Test connection before saving
      const testResult = await WordPressService.testConnection(
        body.url,
        body.username,
        body.applicationPassword
      )

      if (!testResult.success) {
        set.status = 422
        return {
          success: false,
          error: `Cannot connect to WordPress site: ${testResult.error}`,
        }
      }

      const [site] = await db
        .insert(sites)
        .values({
          url: body.url,
          name: body.name,
          username: CryptoService.encrypt(body.username),
          applicationPassword: CryptoService.encrypt(body.applicationPassword),
          maxPostsPerDay: body.maxPostsPerDay ?? 10,
          tags: body.tags ?? [],
          niche: body.niche,
          notes: body.notes,
          status: 'active',
          lastHealthCheck: new Date(),
        })
        .returning()

      const { username: _u, applicationPassword: _ap, ...rest } = site!
      return { success: true, data: rest }
    },
    {
      body: t.Object({
        url: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        username: t.String({ minLength: 1 }),
        applicationPassword: t.String({ minLength: 1 }),
        maxPostsPerDay: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        tags: t.Optional(t.Array(t.String())),
        niche: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .put(
    '/:id',
    async ({ params, body, set }) => {
      const [existing] = await db.select().from(sites).where(eq(sites.id, params.id)).limit(1)

      if (!existing) {
        set.status = 404
        return { success: false, error: 'Site not found' }
      }

      const updateData: Partial<typeof sites.$inferInsert> = {
        updatedAt: new Date(),
      }

      if (body.name !== undefined) updateData.name = body.name
      if (body.url !== undefined) updateData.url = body.url
      if (body.maxPostsPerDay !== undefined) updateData.maxPostsPerDay = body.maxPostsPerDay
      if (body.status !== undefined) updateData.status = body.status
      if (body.tags !== undefined) updateData.tags = body.tags
      if (body.niche !== undefined) updateData.niche = body.niche
      if (body.notes !== undefined) updateData.notes = body.notes

      if (body.username !== undefined) {
        updateData.username = CryptoService.encrypt(body.username)
      }
      if (body.applicationPassword !== undefined) {
        updateData.applicationPassword = CryptoService.encrypt(body.applicationPassword)
      }

      const [updated] = await db
        .update(sites)
        .set(updateData)
        .where(eq(sites.id, params.id))
        .returning()

      const { username: _u, applicationPassword: _ap, ...rest } = updated!
      return { success: true, data: rest }
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        url: t.Optional(t.String({ minLength: 1 })),
        username: t.Optional(t.String({ minLength: 1 })),
        applicationPassword: t.Optional(t.String({ minLength: 1 })),
        maxPostsPerDay: t.Optional(t.Number({ minimum: 1 })),
        status: t.Optional(t.Union([t.Literal('active'), t.Literal('inactive'), t.Literal('error')])),
        tags: t.Optional(t.Array(t.String())),
        niche: t.Optional(t.String()),
        notes: t.Optional(t.String()),
      }),
    }
  )
  .delete('/:id', async ({ params, set }) => {
    const [existing] = await db.select().from(sites).where(eq(sites.id, params.id)).limit(1)

    if (!existing) {
      set.status = 404
      return { success: false, error: 'Site not found' }
    }

    await db.delete(sites).where(eq(sites.id, params.id))
    return { success: true, message: 'Site deleted' }
  })
  .post('/:id/test', async ({ params, set }) => {
    const [site] = await db.select().from(sites).where(eq(sites.id, params.id)).limit(1)

    if (!site) {
      set.status = 404
      return { success: false, error: 'Site not found' }
    }

    const username = CryptoService.decrypt(site.username)
    const appPassword = CryptoService.decrypt(site.applicationPassword)

    const result = await WordPressService.testConnection(site.url, username, appPassword)

    const newStatus: 'active' | 'error' = result.success ? 'active' : 'error'
    await db
      .update(sites)
      .set({
        status: newStatus,
        lastHealthCheck: new Date(),
        consecutiveFailures: result.success ? 0 : site.consecutiveFailures + 1,
        lastHealthCheckError: result.success ? null : (result.error ?? null),
        updatedAt: new Date(),
      })
      .where(eq(sites.id, params.id))

    return { success: true, data: result }
  })
  .post(
    '/bulk-test',
    async ({ body }) => {
      const targetSites = await db
        .select()
        .from(sites)
        .where(inArray(sites.id, body.siteIds))

      const results = await Promise.allSettled(
        targetSites.map(async (site) => {
          const username = CryptoService.decrypt(site.username)
          const appPassword = CryptoService.decrypt(site.applicationPassword)
          const result = await WordPressService.testConnection(site.url, username, appPassword)

          const newStatus: 'active' | 'error' = result.success ? 'active' : 'error'
          await db
            .update(sites)
            .set({
              status: newStatus,
              lastHealthCheck: new Date(),
              consecutiveFailures: result.success ? 0 : site.consecutiveFailures + 1,
              lastHealthCheckError: result.success ? null : (result.error ?? null),
              updatedAt: new Date(),
            })
            .where(eq(sites.id, site.id))

          return { siteId: site.id, siteName: site.name, ...result }
        })
      )

      const data = results.map((r) =>
        r.status === 'fulfilled' ? r.value : { success: false, error: r.reason }
      )

      return { success: true, data }
    },
    {
      body: t.Object({
        siteIds: t.Array(t.String()),
      }),
    }
  )
  // Phase 4: Bulk import sites from CSV data
  .post(
    '/bulk-import',
    async ({ body, set }) => {
      const results = []

      for (const siteData of body.sites) {
        try {
          const testResult = await WordPressService.testConnection(
            siteData.url,
            siteData.username,
            siteData.applicationPassword
          )

          const [site] = await db
            .insert(sites)
            .values({
              url: siteData.url,
              name: siteData.name,
              username: CryptoService.encrypt(siteData.username),
              applicationPassword: CryptoService.encrypt(siteData.applicationPassword),
              maxPostsPerDay: siteData.maxPostsPerDay ?? 10,
              tags: siteData.tags ?? [],
              niche: siteData.niche,
              status: testResult.success ? 'active' : 'error',
              lastHealthCheck: new Date(),
              lastHealthCheckError: testResult.success ? null : (testResult.error ?? null),
            })
            .returning()

          const { username: _u, applicationPassword: _ap, ...rest } = site!
          results.push({ ...rest, connectionTest: testResult.success })
        } catch (err) {
          results.push({
            name: siteData.name,
            url: siteData.url,
            error: err instanceof Error ? err.message : 'Failed to create',
          })
        }
      }

      return {
        success: true,
        data: results,
        message: `Imported ${results.filter((r) => !('error' in r)).length} of ${body.sites.length} sites`,
      }
    },
    {
      body: t.Object({
        sites: t.Array(
          t.Object({
            name: t.String({ minLength: 1 }),
            url: t.String({ minLength: 1 }),
            username: t.String({ minLength: 1 }),
            applicationPassword: t.String({ minLength: 1 }),
            maxPostsPerDay: t.Optional(t.Number({ minimum: 1 })),
            tags: t.Optional(t.Array(t.String())),
            niche: t.Optional(t.String()),
          })
        ),
      }),
    }
  )
  // Phase 4: Bulk update sites (tags, niche, maxPostsPerDay)
  .put(
    '/bulk-update',
    async ({ body }) => {
      let updated = 0

      for (const siteId of body.siteIds) {
        const updateData: Partial<typeof sites.$inferInsert> = { updatedAt: new Date() }
        if (body.tags !== undefined) updateData.tags = body.tags
        if (body.niche !== undefined) updateData.niche = body.niche
        if (body.maxPostsPerDay !== undefined) updateData.maxPostsPerDay = body.maxPostsPerDay

        await db.update(sites).set(updateData).where(eq(sites.id, siteId))
        updated++
      }

      return { success: true, message: `Updated ${updated} sites`, count: updated }
    },
    {
      body: t.Object({
        siteIds: t.Array(t.String(), { minItems: 1 }),
        tags: t.Optional(t.Array(t.String())),
        niche: t.Optional(t.String()),
        maxPostsPerDay: t.Optional(t.Number({ minimum: 1 })),
      }),
    }
  )
  .get('/:id/categories', async ({ params, set }) => {
    const [site] = await db.select().from(sites).where(eq(sites.id, params.id)).limit(1)

    if (!site) {
      set.status = 404
      return { success: false, error: 'Site not found' }
    }

    const username = CryptoService.decrypt(site.username)
    const appPassword = CryptoService.decrypt(site.applicationPassword)

    const categories = await WordPressService.getCategories(site.url, username, appPassword)
    return { success: true, data: categories }
  })
  .post('/reset-posts-today', async () => {
    await db
      .update(sites)
      .set({ postsToday: 0, updatedAt: new Date() })

    return { success: true, message: 'Posts today reset for all sites' }
  })
  .post('/:id/reset-posts-today', async ({ params, set }) => {
    const [site] = await db.select().from(sites).where(eq(sites.id, params.id)).limit(1)

    if (!site) {
      set.status = 404
      return { success: false, error: 'Site not found' }
    }

    await db
      .update(sites)
      .set({ postsToday: 0, updatedAt: new Date() })
      .where(eq(sites.id, params.id))

    return { success: true, message: `Posts today reset for ${site.name}` }
  })
