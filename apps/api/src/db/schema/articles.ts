// src/db/schema/articles.ts
import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, numeric } from 'drizzle-orm/pg-core'
import { templates } from './templates'

export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  metaTitle: varchar('meta_title', { length: 255 }),
  metaDescription: varchar('meta_description', { length: 500 }),
  focusKeyword: varchar('focus_keyword', { length: 255 }),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  templateId: uuid('template_id').references(() => templates.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 })
    .$type<'draft' | 'generating' | 'generated' | 'failed'>()
    .default('draft')
    .notNull(),
  generationTokens: integer('generation_tokens'),
  generationCost: numeric('generation_cost', { precision: 10, scale: 6 }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Article = typeof articles.$inferSelect
export type NewArticle = typeof articles.$inferInsert
