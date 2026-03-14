// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { env } from '../config/env'

const migrationClient = postgres(env.DATABASE_URL, { max: 1 })
const db = drizzle(migrationClient)

console.log('[Migrate] Running migrations...')

const migrationsFolder = new URL('../../drizzle/migrations', import.meta.url).pathname
await migrate(db, { migrationsFolder })

console.log('[Migrate] Migrations complete')
await migrationClient.end()
