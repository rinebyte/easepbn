// src/db/schema/postLogs.ts
import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core'

export const postLogs = pgTable('post_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  action: varchar('action', { length: 50 }).notNull(),
  level: varchar('level', { length: 10 }).default('info').notNull(),
  message: text('message').notNull(),
  siteId: uuid('site_id'),
  articleId: uuid('article_id'),
  postId: uuid('post_id'),
  scheduleId: uuid('schedule_id'),
  durationMs: integer('duration_ms'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export type PostLog = typeof postLogs.$inferSelect
export type NewPostLog = typeof postLogs.$inferInsert
