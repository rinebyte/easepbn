// src/cron/healthCheck.ts
import { eq, and, ne } from 'drizzle-orm'
import { db } from '../config/database'
import { sites, postLogs } from '../db/schema'
import { CryptoService } from '../services/crypto'
import { WordPressService } from '../services/wordpress'

const BATCH_SIZE = 10
const MAX_CONSECUTIVE_FAILURES = 3
const HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

let healthCheckInterval: ReturnType<typeof setInterval> | null = null

async function checkSiteBatch(batch: typeof sites.$inferSelect[]) {
  const results = await Promise.allSettled(
    batch.map(async (site) => {
      try {
        const username = CryptoService.decrypt(site.username)
        const appPassword = CryptoService.decrypt(site.applicationPassword)
        const result = await WordPressService.testConnection(site.url, username, appPassword)

        if (result.success) {
          // Success: reset failures, mark active
          await db
            .update(sites)
            .set({
              status: 'active',
              consecutiveFailures: 0,
              lastHealthCheck: new Date(),
              lastHealthCheckError: null,
              updatedAt: new Date(),
            })
            .where(eq(sites.id, site.id))
        } else {
          // Failure: increment counter
          const newFailures = site.consecutiveFailures + 1
          const newStatus = newFailures >= MAX_CONSECUTIVE_FAILURES ? 'inactive' : site.status

          await db
            .update(sites)
            .set({
              status: newStatus,
              consecutiveFailures: newFailures,
              lastHealthCheck: new Date(),
              lastHealthCheckError: result.error ?? 'Unknown error',
              updatedAt: new Date(),
            })
            .where(eq(sites.id, site.id))

          if (newStatus === 'inactive' && site.status !== 'inactive') {
            await db.insert(postLogs).values({
              action: 'site_auto_disabled',
              level: 'error',
              message: `Site "${site.name}" auto-disabled after ${newFailures} consecutive health check failures: ${result.error}`,
              siteId: site.id,
              metadata: { consecutiveFailures: newFailures, lastError: result.error },
            })
            console.log(`[HealthCheck] Site "${site.name}" auto-disabled after ${newFailures} failures`)
          }
        }

        return { siteId: site.id, success: result.success }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        const newFailures = site.consecutiveFailures + 1
        const newStatus = newFailures >= MAX_CONSECUTIVE_FAILURES ? 'inactive' : site.status

        await db
          .update(sites)
          .set({
            status: newStatus,
            consecutiveFailures: newFailures,
            lastHealthCheck: new Date(),
            lastHealthCheckError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(sites.id, site.id))

        return { siteId: site.id, success: false, error: errorMsg }
      }
    })
  )

  return results
}

async function runHealthChecks() {
  try {
    // Get all non-inactive sites (active + error sites need checking)
    const allSites = await db
      .select()
      .from(sites)
      .where(ne(sites.status, 'inactive'))

    if (allSites.length === 0) return

    console.log(`[HealthCheck] Checking ${allSites.length} sites in batches of ${BATCH_SIZE}`)

    let healthy = 0
    let unhealthy = 0

    // Process in batches
    for (let i = 0; i < allSites.length; i += BATCH_SIZE) {
      const batch = allSites.slice(i, i + BATCH_SIZE)
      const results = await checkSiteBatch(batch)

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.success) {
          healthy++
        } else {
          unhealthy++
        }
      }
    }

    console.log(`[HealthCheck] Complete: ${healthy} healthy, ${unhealthy} unhealthy out of ${allSites.length}`)
  } catch (err) {
    console.error('[HealthCheck] Error running health checks:', err)
  }
}

export function startHealthChecks() {
  console.log(`[HealthCheck] Starting health checks (${HEALTH_CHECK_INTERVAL_MS / 60000}min interval)`)

  // Run first check after 1 minute (let the app start up first)
  setTimeout(() => {
    runHealthChecks()
    healthCheckInterval = setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL_MS)
  }, 60_000)
}

export function stopHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
  console.log('[HealthCheck] Stopped')
}
