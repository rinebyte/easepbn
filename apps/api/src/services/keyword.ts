// src/services/keyword.ts
import { eq, and, asc, sql } from 'drizzle-orm'
import { db } from '../config/database'
import { keywords } from '../db/schema'

const EXHAUST_THRESHOLD = 10

export class KeywordService {
  /**
   * Atomically claim the next keyword for a schedule using FOR UPDATE SKIP LOCKED.
   * This prevents race conditions when multiple workers run concurrently.
   * Returns null if all keywords are exhausted.
   */
  static async getNextKeyword(scheduleId: string): Promise<{ id: string; keyword: string } | null> {
    // Atomic: SELECT + UPDATE in one query with row locking
    const result = await db.execute(sql`
      UPDATE keywords
      SET
        usage_count = usage_count + 1,
        status = CASE WHEN usage_count + 1 >= ${EXHAUST_THRESHOLD} THEN 'exhausted' ELSE 'used' END,
        last_used_at = NOW(),
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM keywords
        WHERE schedule_id = ${scheduleId}
          AND status IN ('available', 'used')
        ORDER BY
          CASE WHEN status = 'available' THEN 0 ELSE 1 END,
          usage_count ASC,
          last_used_at ASC NULLS FIRST
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, keyword
    `)

    const row = result[0] as { id: string; keyword: string } | undefined
    return row ?? null
  }

  /**
   * Mark a keyword as used (now a no-op since getNextKeyword is atomic).
   * Kept for backward compatibility.
   */
  static async markKeywordUsed(_keywordId: string): Promise<void> {
    // No-op: getNextKeyword now atomically updates the keyword
  }

  /**
   * Bulk import keywords for a schedule with deduplication.
   */
  static async importKeywords(
    keywordList: string[],
    scheduleId: string
  ): Promise<{ imported: number; duplicates: number }> {
    // Get existing keywords for this schedule
    const existing = await db
      .select({ keyword: keywords.keyword })
      .from(keywords)
      .where(eq(keywords.scheduleId, scheduleId))

    const existingSet = new Set(existing.map((k) => k.keyword.toLowerCase().trim()))

    const toInsert = keywordList
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !existingSet.has(k.toLowerCase()))

    const uniqueToInsert = [...new Set(toInsert.map((k) => k.toLowerCase()))].map(
      (lower) => toInsert.find((k) => k.toLowerCase() === lower)!
    )

    if (uniqueToInsert.length > 0) {
      await db.insert(keywords).values(
        uniqueToInsert.map((keyword) => ({
          keyword,
          scheduleId,
          status: 'available' as const,
        }))
      )
    }

    return {
      imported: uniqueToInsert.length,
      duplicates: keywordList.length - uniqueToInsert.length,
    }
  }

  /**
   * Reset exhausted keywords back to available.
   */
  static async resetKeywords(scheduleId?: string): Promise<number> {
    const conditions = [eq(keywords.status, 'exhausted')]
    if (scheduleId) {
      conditions.push(eq(keywords.scheduleId, scheduleId))
    }

    const result = await db
      .update(keywords)
      .set({
        status: 'available',
        usageCount: 0,
        lastUsedAt: null,
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning()

    return result.length
  }

  /**
   * Get all keywords for a schedule with stats.
   */
  static async getKeywords(scheduleId: string) {
    return db
      .select()
      .from(keywords)
      .where(eq(keywords.scheduleId, scheduleId))
      .orderBy(asc(keywords.usageCount), asc(keywords.keyword))
  }

  /**
   * Delete a keyword.
   */
  static async deleteKeyword(keywordId: string): Promise<void> {
    await db.delete(keywords).where(eq(keywords.id, keywordId))
  }

  /**
   * Get keyword stats for a schedule.
   */
  static async getKeywordStats(scheduleId: string) {
    const rows = await db
      .select({
        status: keywords.status,
        count: sql<number>`count(*)::int`,
      })
      .from(keywords)
      .where(eq(keywords.scheduleId, scheduleId))
      .groupBy(keywords.status)

    const stats = { available: 0, used: 0, exhausted: 0, total: 0 }
    for (const row of rows) {
      stats[row.status as keyof typeof stats] = row.count
      stats.total += row.count
    }
    return stats
  }
}
