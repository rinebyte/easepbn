// src/db/schema/posts.ts
import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { articles } from './articles'
import { sites } from './sites'

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id')
    .notNull()
    .references(() => articles.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id')
    .notNull()
    .references(() => sites.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 })
    .$type<'pending' | 'posting' | 'posted' | 'failed' | 'unpublished'>()
    .default('pending')
    .notNull(),
  wpPostId: integer('wp_post_id'),
  wpPostUrl: text('wp_post_url'),
  wpCategoryIds: jsonb('wp_category_ids').$type<number[]>().default([]).notNull(),
  wpTagIds: jsonb('wp_tag_ids').$type<number[]>().default([]).notNull(),
  retryCount: integer('retry_count').default(0).notNull(),
  maxRetries: integer('max_retries').default(3).notNull(),
  errorMessage: text('error_message'),
  postedAt: timestamp('posted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_posts_article_id').on(table.articleId),
  index('idx_posts_site_id').on(table.siteId),
  index('idx_posts_status').on(table.status),
  index('idx_posts_created_at').on(table.createdAt),
])

export type Post = typeof posts.$inferSelect
export type NewPost = typeof posts.$inferInsert
