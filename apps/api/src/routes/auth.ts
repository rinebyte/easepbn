// src/routes/auth.ts
import { Elysia, t } from 'elysia'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../config/database'
import { users } from '../db/schema'
import { jwtPlugin, authMiddleware } from '../middleware/auth'
import { authRateLimit } from '../middleware/rateLimit'

export const authRoutes = new Elysia({ prefix: '/auth' })
  .use(jwtPlugin)
  .use(authRateLimit)
  .post(
    '/login',
    async ({ body, jwt, set }) => {
      const { email, password } = body

      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

      if (!user) {
        set.status = 401
        return { success: false, error: 'Invalid credentials' }
      }

      const isValid = await bcrypt.compare(password, user.passwordHash)
      if (!isValid) {
        set.status = 401
        return { success: false, error: 'Invalid credentials' }
      }

      const token = await jwt.sign({ userId: user.id })

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
      }
    },
    {
      body: t.Object({
        email: t.String({ format: 'email' }),
        password: t.String({ minLength: 1 }),
      }),
    }
  )
  .use(authMiddleware)
  .get('/me', async ({ userId, set }) => {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user) {
      set.status = 404
      return { success: false, error: 'User not found' }
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    }
  })
  .put(
    '/password',
    async ({ userId, body, set }) => {
      const { currentPassword, newPassword } = body

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

      if (!user) {
        set.status = 404
        return { success: false, error: 'User not found' }
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!isValid) {
        set.status = 401
        return { success: false, error: 'Current password is incorrect' }
      }

      const passwordHash = await bcrypt.hash(newPassword, 12)
      await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, userId))

      return { success: true, message: 'Password updated successfully' }
    },
    {
      body: t.Object({
        currentPassword: t.String({ minLength: 1 }),
        newPassword: t.String({ minLength: 8 }),
      }),
    }
  )
