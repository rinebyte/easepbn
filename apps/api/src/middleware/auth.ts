// src/middleware/auth.ts
import { Elysia } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { env } from '../config/env'

// Shared JWT plugin instance - used as a dependency
export const jwtPlugin = new Elysia({ name: 'jwt-plugin' }).use(
  jwt({
    name: 'jwt',
    secret: env.JWT_SECRET,
  })
)

// Auth guard plugin - verifies Bearer token and exposes userId
export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .use(jwtPlugin)
  .derive({ as: 'scoped' }, async ({ jwt, headers }) => {
    const authorization = headers['authorization']
    if (!authorization?.startsWith('Bearer ')) {
      throw new Response(JSON.stringify({ success: false, error: 'Missing or invalid Authorization header' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    const token = authorization.slice(7)
    const payload = await jwt.verify(token)

    if (!payload || typeof payload !== 'object' || !('userId' in payload)) {
      throw new Response(JSON.stringify({ success: false, error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    return { userId: payload.userId as string }
  })
