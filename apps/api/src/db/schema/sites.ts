// src/db/schema/sites.ts
import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: varchar('url', { length: 500 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  username: text('username').notNull(),
  applicationPassword: text('application_password').notNull(),
  status: varchar('status', { length: 20 })
    .$type<'active' | 'inactive' | 'error'>()
    .default('inactive')
    .notNull(),
  lastHealthCheck: timestamp('last_health_check'),
  maxPostsPerDay: integer('max_posts_per_day').default(10).notNull(),
  postsToday: integer('posts_today').default(0).notNull(),
  // Phase 1B: Health check tracking
  consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
  lastHealthCheckError: text('last_health_check_error'),
  // Phase 4: Site organization
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  niche: varchar('niche', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Site = typeof sites.$inferSelect
export type NewSite = typeof sites.$inferInsert
