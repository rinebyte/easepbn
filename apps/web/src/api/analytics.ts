import { apiClient } from './client'

export interface DashboardStats {
  totalSites: number
  activeSites: number
  errorSites: number
  totalArticles: number
  successRate: number
  activeSchedules: number
  totalCost: number
}

export interface PostDataPoint {
  date: string
  count: number
}

export interface ActivityLog {
  id: string
  articleTitle: string
  siteName: string
  status: 'pending' | 'posting' | 'posted' | 'failed'
  postedAt: string
  errorMessage?: string
}

export interface TodayProgress {
  postsCompleted: number
  postsTarget: number
}

export interface QueueStatus {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export interface QueueStatusAll {
  articleGeneration: QueueStatus
  wordpressPosting: QueueStatus
  scheduledExecution: QueueStatus
}

export interface SiteHealth {
  active: number
  inactive: number
  error: number
}

export interface DashboardData {
  stats: DashboardStats
  postsOverTime: PostDataPoint[]
  recentActivity: ActivityLog[]
  todayProgress: TodayProgress
  queueStatus: QueueStatusAll | null
  siteHealth: SiteHealth
}

export interface PostLog {
  id: string
  action: string
  level: 'info' | 'warn' | 'error'
  message: string
  siteId: string | null
  articleId: string | null
  postId: string | null
  scheduleId: string | null
  durationMs: number | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface Notification {
  id: string
  type: 'schedule_complete' | 'site_down' | 'bulk_complete' | 'generation_failed'
  title: string
  message: string
  read: boolean
  createdAt: string
  metadata?: Record<string, unknown>
}

export const analyticsApi = {
  getDashboard: async (): Promise<DashboardData> => {
    const [dashRes, postsRes, queueRes] = await Promise.all([
      apiClient.get('/analytics/dashboard'),
      apiClient.get('/analytics/posts'),
      apiClient.get('/analytics/queue-status').catch(() => null),
    ])

    const d = dashRes.data.data
    const totalPosts = d.posts.posted + d.posts.failed
    const successRate = totalPosts > 0 ? Math.round((d.posts.posted / totalPosts) * 100) : 0

    return {
      stats: {
        totalSites: d.sites.total,
        activeSites: d.sites.active,
        errorSites: d.sites.error ?? 0,
        totalArticles: d.articles.total,
        successRate,
        activeSchedules: d.activeSchedules,
        totalCost: d.costs.last30DaysUsd,
      },
      postsOverTime: (postsRes.data.data ?? []).map((r: { date: string; count: number }) => ({
        date: r.date,
        count: r.count,
      })),
      recentActivity: d.recentActivity ?? [],
      todayProgress: d.todayProgress ?? { postsCompleted: 0, postsTarget: 0 },
      queueStatus: queueRes?.data?.data ?? null,
      siteHealth: d.sites.health ?? { active: 0, inactive: 0, error: 0 },
    }
  },

  getQueueStatus: async (): Promise<QueueStatusAll> => {
    const res = await apiClient.get('/analytics/queue-status')
    return res.data.data
  },

  getLogs: async (params?: {
    page?: number
    limit?: number
    level?: string
    action?: string
    siteId?: string
  }): Promise<{ data: PostLog[]; page: number; limit: number }> => {
    const res = await apiClient.get('/analytics/logs', { params })
    return { data: res.data.data, page: res.data.page, limit: res.data.limit }
  },

  getPostAnalytics: async () => {
    const res = await apiClient.get('/analytics/posts')
    return res.data.data
  },

  getSiteAnalytics: async () => {
    const res = await apiClient.get('/analytics/sites')
    return res.data.data
  },

  getGenerationAnalytics: async () => {
    const res = await apiClient.get('/analytics/generation')
    return res.data.data
  },

  getNotifications: async (limit = 50): Promise<{ notifications: Notification[]; unreadCount: number }> => {
    const res = await apiClient.get('/analytics/notifications', { params: { limit } })
    return res.data.data
  },

  markNotificationRead: async (id: string) => {
    const res = await apiClient.post(`/analytics/notifications/${id}/read`)
    return res.data
  },

  markAllNotificationsRead: async () => {
    const res = await apiClient.post('/analytics/notifications/read-all')
    return res.data
  },
}
