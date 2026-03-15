// src/db/schema/schedules.ts
import { pgTable, uuid, varchar, boolean, timestamp, integer, jsonb, text } from 'drizzle-orm/pg-core'
import { templates } from './templates'

export const schedules = pgTable('schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  frequency: varchar('frequency', { length: 20 })
    .$type<'hourly' | 'daily' | 'weekly' | 'custom'>()
    .notNull(),
  cronExpression: varchar('cron_expression', { length: 100 }).notNull(),
  templateId: uuid('template_id').references(() => templates.id, { onDelete: 'set null' }),
  keywords: jsonb('keywords').$type<string[]>().default([]).notNull(),
  targetSiteIds: jsonb('target_site_ids').$type<string[]>().default([]).notNull(),
  categoryNames: jsonb('category_names').$type<string[]>().default([]).notNull(),
  tagNames: jsonb('tag_names').$type<string[]>().default([]).notNull(),
  postsPerExecution: integer('posts_per_execution').default(1).notNull(),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
  totalRuns: integer('total_runs').default(0).notNull(),
  totalArticlesGenerated: integer('total_articles_generated').default(0).notNull(),
  totalPostsCreated: integer('total_posts_created').default(0).notNull(),
  // Content brief — context about the keywords (brand info, product details, etc.)
  contentBrief: text('content_brief'),
  // Phase 5: Content diversity
  spreadWindowMinutes: integer('spread_window_minutes').default(240).notNull(),
  uniqueArticlePerSite: boolean('unique_article_per_site').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Schedule = typeof schedules.$inferSelect
export type NewSchedule = typeof schedules.$inferInsert
