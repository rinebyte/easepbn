// src/db/schema/backlinks.ts
import { pgTable, uuid, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core'

export const backlinks = pgTable('backlinks', {
  id: uuid('id').primaryKey().defaultRandom(),
  anchorText: varchar('anchor_text', { length: 500 }).notNull(),
  targetUrl: text('target_url').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  maxPerArticle: integer('max_per_article').default(1).notNull(),
  priority: integer('priority').default(0).notNull(), // higher = inserted first
  totalUsageCount: integer('total_usage_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Backlink = typeof backlinks.$inferSelect
export type NewBacklink = typeof backlinks.$inferInsert
