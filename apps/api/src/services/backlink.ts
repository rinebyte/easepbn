// src/services/backlink.ts
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../config/database'
import { backlinks } from '../db/schema'

interface BacklinkRule {
  id: string
  anchorText: string
  targetUrl: string
  maxPerArticle: number
}

/**
 * Build instruction text for the AI prompt so it naturally includes backlinks.
 */
export function buildBacklinkPromptInstructions(rules: BacklinkRule[]): string {
  if (rules.length === 0) return ''

  const lines = rules.map(
    (r) => `- Anchor text: "${r.anchorText}" → Link to: ${r.targetUrl}`
  )

  return `

IMPORTANT - Backlink Instructions:
Naturally incorporate the following backlinks into the article content using HTML anchor tags.
Place them contextually where they fit naturally within the text. Do NOT group them together.
Each backlink should appear at most once unless specified otherwise.
Use rel="dofollow" on all backlink anchor tags.

Backlinks to include:
${lines.join('\n')}
`
}

/**
 * Post-process HTML content to ensure backlinks are inserted.
 * Acts as a fallback if the AI didn't include them.
 * Only inserts into <p> tag content, avoids headings and existing links.
 */
export function injectBacklinksIntoHtml(
  html: string,
  rules: BacklinkRule[]
): { html: string; insertedCount: number } {
  let result = html
  let insertedCount = 0

  for (const rule of rules) {
    // Check if this backlink URL is already in the content
    if (result.includes(rule.targetUrl)) {
      insertedCount++
      continue
    }

    let usageCount = 0

    // Replace anchor text occurrences inside <p> tags only
    // Use a regex that matches the anchor text outside of HTML tags and existing <a> tags
    const escapedAnchor = rule.anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(
      `(?<=<p[^>]*>[^<]*?)\\b(${escapedAnchor})\\b(?=[^<]*?<\\/p>)`,
      'gi'
    )

    result = result.replace(regex, (match) => {
      if (usageCount >= rule.maxPerArticle) return match
      usageCount++
      return `<a href="${rule.targetUrl}" rel="dofollow">${match}</a>`
    })

    if (usageCount > 0) insertedCount++
  }

  return { html: result, insertedCount }
}

/**
 * Fetch active backlink rules sorted by priority.
 */
export async function getActiveBacklinks(): Promise<BacklinkRule[]> {
  const rows = await db
    .select({
      id: backlinks.id,
      anchorText: backlinks.anchorText,
      targetUrl: backlinks.targetUrl,
      maxPerArticle: backlinks.maxPerArticle,
    })
    .from(backlinks)
    .where(eq(backlinks.isActive, true))
    .orderBy(desc(backlinks.priority))

  return rows
}

/**
 * Increment usage count for backlinks that were inserted.
 */
export async function incrementBacklinkUsage(backlinkIds: string[]): Promise<void> {
  if (backlinkIds.length === 0) return

  for (const id of backlinkIds) {
    await db
      .update(backlinks)
      .set({
        totalUsageCount: sql`${backlinks.totalUsageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(backlinks.id, id))
  }
}
