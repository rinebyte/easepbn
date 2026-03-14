// src/db/seed.ts
import bcrypt from 'bcryptjs'
import { db } from '../config/database'
import { users, templates } from './schema'
import { env } from '../config/env'
import { eq } from 'drizzle-orm'

console.log('[Seed] Seeding database...')

// Upsert admin user
const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12)

const existingUser = await db.select().from(users).where(eq(users.email, env.ADMIN_EMAIL)).limit(1)

if (existingUser.length === 0) {
  await db.insert(users).values({
    email: env.ADMIN_EMAIL,
    passwordHash,
  })
  console.log(`[Seed] Created admin user: ${env.ADMIN_EMAIL}`)
} else {
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.email, env.ADMIN_EMAIL))
  console.log(`[Seed] Updated admin user: ${env.ADMIN_EMAIL}`)
}

// Seed default templates
const defaultTemplates = [
  {
    name: 'SEO Blog Article',
    description: 'Generates SEO-optimized blog posts with proper headings, meta data, and keyword usage.',
    systemPrompt: `You are an expert SEO content writer. Your task is to generate high-quality, SEO-optimized blog articles.

Always respond with a valid JSON object in this exact format:
{
  "title": "The article title (H1, keyword-rich)",
  "content": "Full HTML content with proper h2/h3 headings, paragraphs, and lists",
  "excerpt": "A 1-2 sentence summary of the article (120-160 characters)",
  "metaTitle": "SEO meta title (50-60 characters, includes keyword)",
  "metaDescription": "SEO meta description (150-160 characters, includes keyword and CTA)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Content guidelines:
- Write in a natural, engaging style
- Include the focus keyword in the title, first paragraph, at least one H2, and conclusion
- Use semantic HTML: <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>
- Minimum 800 words, aim for 1200-1500 words
- Include a compelling introduction and clear conclusion
- Add internal linking placeholders with [INTERNAL_LINK: relevant topic]`,
    userPromptTemplate: `Write an SEO-optimized blog article about: {{keyword}}

Additional context: {{context}}

Target audience: {{audience}}`,
    variables: ['keyword', 'context', 'audience'],
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: '0.7',
    isDefault: true,
  },
  {
    name: 'Product Review',
    description: 'Generates detailed product review articles with pros/cons, ratings, and buying recommendations.',
    systemPrompt: `You are an expert product reviewer and affiliate marketer. Your task is to generate comprehensive, honest product review articles.

Always respond with a valid JSON object in this exact format:
{
  "title": "The review title (includes product name and a compelling hook)",
  "content": "Full HTML content with product overview, features, pros/cons, comparison, and verdict",
  "excerpt": "A brief summary mentioning product name and key finding (120-160 characters)",
  "metaTitle": "SEO meta title with product name (50-60 characters)",
  "metaDescription": "SEO meta description with product name and key benefit (150-160 characters)",
  "tags": ["review", "product-name", "category", "brand", "buying-guide"]
}

Content structure:
1. Introduction (hook + product overview)
2. Key Features (use <h2> and feature list)
3. Pros and Cons (use <h2> with <ul> lists)
4. Performance & Real-World Usage (use <h2>)
5. Comparison to Alternatives (brief, use <h2>)
6. Verdict & Recommendation (use <h2>, include star rating as text: "Rating: X/5")
7. FAQ section (3-5 common questions)

Use semantic HTML throughout. Minimum 1000 words.`,
    userPromptTemplate: `Write a detailed product review for: {{product_name}}

Product category: {{category}}
Price range: {{price_range}}
Key features to highlight: {{features}}`,
    variables: ['product_name', 'category', 'price_range', 'features'],
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: '0.7',
    isDefault: false,
  },
]

for (const template of defaultTemplates) {
  const existing = await db
    .select()
    .from(templates)
    .where(eq(templates.name, template.name))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(templates).values(template)
    console.log(`[Seed] Created template: ${template.name}`)
  } else {
    console.log(`[Seed] Template already exists: ${template.name}`)
  }
}

console.log('[Seed] Done')
process.exit(0)
