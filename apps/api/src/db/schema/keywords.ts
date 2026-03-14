// src/db/schema/keywords.ts
import { pgTable, uuid, varchar, timestamp, integer } from 'drizzle-orm/pg-core'
import { schedules } from './schedules'

export const keywords = pgTable('keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyword: varchar('keyword', { length: 500 }).notNull(),
  niche: varchar('niche', { length: 255 }),
  status: varchar('status', { length: 20 })
    .$type<'available' | 'used' | 'exhausted'>()
    .default('available')
    .notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  lastUsedAt: timestamp('last_used_at'),
  scheduleId: uuid('schedule_id').references(() => schedules.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Keyword = typeof keywords.$inferSelect
export type NewKeyword = typeof keywords.$inferInsert
