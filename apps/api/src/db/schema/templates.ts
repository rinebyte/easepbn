// src/db/schema/templates.ts
import { pgTable, uuid, varchar, text, timestamp, integer, boolean, jsonb, numeric } from 'drizzle-orm/pg-core'

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  userPromptTemplate: text('user_prompt_template').notNull(),
  variables: jsonb('variables').$type<string[]>().default([]).notNull(),
  model: varchar('model', { length: 50 }).default('gpt-4o-mini').notNull(),
  maxTokens: integer('max_tokens').default(4000).notNull(),
  temperature: numeric('temperature', { precision: 3, scale: 2 }).default('0.7').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export type Template = typeof templates.$inferSelect
export type NewTemplate = typeof templates.$inferInsert
