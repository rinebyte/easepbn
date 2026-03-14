// src/cron/scheduler.ts
import { lte, eq, and } from 'drizzle-orm'
import { parseExpression as parseCronExpression } from 'cron-parser'
import { db } from '../config/database'
import { schedules, sites } from '../db/schema'
import { scheduledExecutionQueue } from '../queue/queues'
import { startHealthChecks, stopHealthChecks } from './healthCheck'

function getNextRunAt(cronExpression: string): Date {
  const interval = parseCronExpression(cronExpression, { currentDate: new Date() })
  return interval.next().toDate()
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null
let midnightTimeout: ReturnType<typeof setTimeout> | null = null

async function checkDueSchedules() {
  try {
    const now = new Date()

    // Find enabled schedules that are due (nextRunAt <= now)
    const dueSchedules = await db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.enabled, true),
          lte(schedules.nextRunAt, now)
        )
      )

    for (const schedule of dueSchedules) {
      console.log(`[Cron] Schedule due: "${schedule.name}" (${schedule.id})`)

      // Queue execution
      await scheduledExecutionQueue.add(
        'execute-schedule',
        { scheduleId: schedule.id },
        { attempts: 1 }
      )

      // Update nextRunAt
      const nextRunAt = getNextRunAt(schedule.cronExpression)
      await db
        .update(schedules)
        .set({ nextRunAt, updatedAt: new Date() })
        .where(eq(schedules.id, schedule.id))
    }

    if (dueSchedules.length > 0) {
      console.log(`[Cron] Queued ${dueSchedules.length} schedule(s)`)
    }
  } catch (err) {
    console.error('[Cron] Error checking due schedules:', err)
  }
}

async function resetDailyPostCounts() {
  try {
    console.log('[Cron] Resetting daily post counts for all sites')
    await db.update(sites).set({ postsToday: 0, updatedAt: new Date() })
  } catch (err) {
    console.error('[Cron] Error resetting daily post counts:', err)
  }
}

function scheduleMidnightReset() {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0) // Next midnight

  const msUntilMidnight = midnight.getTime() - now.getTime()
  console.log(`[Cron] Daily reset scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`)

  midnightTimeout = setTimeout(async () => {
    await resetDailyPostCounts()
    // Schedule next midnight reset
    scheduleMidnightReset()
  }, msUntilMidnight)
}

export function startScheduler() {
  console.log('[Cron] Starting scheduler (60s interval)')

  // Run immediately on startup
  checkDueSchedules()

  // Check every 60 seconds
  schedulerInterval = setInterval(checkDueSchedules, 60_000)

  // Schedule midnight reset
  scheduleMidnightReset()

  // Phase 1B: Start automated health checks
  startHealthChecks()
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }

  if (midnightTimeout) {
    clearTimeout(midnightTimeout)
    midnightTimeout = null
  }

  stopHealthChecks()

  console.log('[Cron] Scheduler stopped')
}
