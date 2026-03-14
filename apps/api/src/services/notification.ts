// src/services/notification.ts
import { redis } from '../config/redis'

export interface Notification {
  id: string
  type: 'schedule_complete' | 'site_down' | 'bulk_complete' | 'generation_failed'
  title: string
  message: string
  read: boolean
  createdAt: string
  metadata?: Record<string, unknown>
}

const NOTIFICATIONS_KEY = 'easepbn:notifications'
const MAX_NOTIFICATIONS = 100

export class NotificationService {
  static async create(params: {
    type: Notification['type']
    title: string
    message: string
    metadata?: Record<string, unknown>
  }): Promise<Notification> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      type: params.type,
      title: params.title,
      message: params.message,
      read: false,
      createdAt: new Date().toISOString(),
      metadata: params.metadata,
    }

    // Push to Redis list (most recent first)
    await redis.lpush(NOTIFICATIONS_KEY, JSON.stringify(notification))
    // Trim to keep only recent notifications
    await redis.ltrim(NOTIFICATIONS_KEY, 0, MAX_NOTIFICATIONS - 1)

    return notification
  }

  static async getAll(limit = 50): Promise<Notification[]> {
    const raw = await redis.lrange(NOTIFICATIONS_KEY, 0, limit - 1)
    return raw.map((r) => JSON.parse(r) as Notification)
  }

  static async getUnreadCount(): Promise<number> {
    const all = await this.getAll(MAX_NOTIFICATIONS)
    return all.filter((n) => !n.read).length
  }

  static async markRead(notificationId: string): Promise<boolean> {
    const all = await redis.lrange(NOTIFICATIONS_KEY, 0, MAX_NOTIFICATIONS - 1)

    for (let i = 0; i < all.length; i++) {
      const notification = JSON.parse(all[i]!) as Notification
      if (notification.id === notificationId) {
        notification.read = true
        await redis.lset(NOTIFICATIONS_KEY, i, JSON.stringify(notification))
        return true
      }
    }

    return false
  }

  static async markAllRead(): Promise<number> {
    const all = await redis.lrange(NOTIFICATIONS_KEY, 0, MAX_NOTIFICATIONS - 1)
    let count = 0

    for (let i = 0; i < all.length; i++) {
      const notification = JSON.parse(all[i]!) as Notification
      if (!notification.read) {
        notification.read = true
        await redis.lset(NOTIFICATIONS_KEY, i, JSON.stringify(notification))
        count++
      }
    }

    return count
  }
}
