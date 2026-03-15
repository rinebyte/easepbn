// src/config/env.ts

function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

export const env = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL: requireEnv('REDIS_URL', 'redis://localhost:6379'),
  JWT_SECRET: requireEnv('JWT_SECRET', 'change-me-in-production'),
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY', 'change-me-encryption-key-32chars'),
  OPENAI_API_KEY: requireEnv('OPENAI_API_KEY', ''),
  ADMIN_EMAIL: requireEnv('ADMIN_EMAIL', 'admin@easepbn.local'),
  ADMIN_PASSWORD: requireEnv('ADMIN_PASSWORD', 'admin123'),
  API_PORT: parseInt(process.env.API_PORT ?? '3000', 10),
  CORS_ORIGIN: requireEnv('CORS_ORIGIN', 'http://localhost:5173'),
} as const

// Block insecure defaults in production
if (process.env.NODE_ENV === 'production') {
  const insecureDefaults = [
    ['JWT_SECRET', 'change-me-in-production'],
    ['ENCRYPTION_KEY', 'change-me-encryption-key-32chars'],
    ['ADMIN_PASSWORD', 'admin123'],
  ] as const

  for (const [key, defaultVal] of insecureDefaults) {
    if (env[key] === defaultVal) {
      throw new Error(
        `SECURITY: ${key} is using the default value in production. Set a secure value via environment variable.`
      )
    }
  }
}
