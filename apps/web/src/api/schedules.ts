import { apiClient } from './client'

export interface Schedule {
  id: string
  name: string
  enabled: boolean
  frequency: 'hourly' | 'daily' | 'weekly' | 'custom'
  cronExpression: string
  templateId: string | null
  keywords: string[]
  targetSiteIds: string[]
  categoryNames: string[]
  tagNames: string[]
  postsPerExecution: number
  contentBrief: string | null
  spreadWindowMinutes: number
  uniqueArticlePerSite: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  totalRuns: number
  totalArticlesGenerated: number
  totalPostsCreated: number
  createdAt: string
  updatedAt: string
}

export interface ScheduleFormData {
  name: string
  frequency: Schedule['frequency']
  cronExpression: string
  templateId: string
  keywords: string[]
  targetSiteIds: string[]
  categoryNames?: string[]
  tagNames?: string[]
  postsPerExecution: number
  contentBrief?: string
  spreadWindowMinutes?: number
  uniqueArticlePerSite?: boolean
}

export interface KeywordEntry {
  id: string
  keyword: string
  niche: string | null
  status: 'available' | 'used' | 'exhausted'
  usageCount: number
  lastUsedAt: string | null
  scheduleId: string | null
  createdAt: string
  updatedAt: string
}

export interface KeywordStats {
  available: number
  used: number
  exhausted: number
  total: number
}

export const schedulesApi = {
  getSchedules: async (): Promise<Schedule[]> => {
    const res = await apiClient.get('/schedules')
    return res.data.data
  },

  getSchedule: async (id: string): Promise<Schedule> => {
    const res = await apiClient.get(`/schedules/${id}`)
    return res.data.data
  },

  createSchedule: async (data: ScheduleFormData): Promise<Schedule> => {
    const res = await apiClient.post('/schedules', data)
    return res.data.data
  },

  updateSchedule: async (id: string, data: Partial<ScheduleFormData>): Promise<Schedule> => {
    const res = await apiClient.put(`/schedules/${id}`, data)
    return res.data.data
  },

  deleteSchedule: async (id: string): Promise<void> => {
    await apiClient.delete(`/schedules/${id}`)
  },

  toggleSchedule: async (id: string): Promise<Schedule> => {
    const res = await apiClient.post(`/schedules/${id}/toggle`)
    return res.data.data
  },

  runNow: async (id: string) => {
    const res = await apiClient.post(`/schedules/${id}/run-now`)
    return res.data
  },

  getScheduleHistory: async (id: string) => {
    const res = await apiClient.get(`/schedules/${id}/history`)
    return res.data.data
  },

  // Phase 2: Keyword pool management
  getKeywords: async (scheduleId: string): Promise<{ keywords: KeywordEntry[]; stats: KeywordStats }> => {
    const res = await apiClient.get(`/schedules/${scheduleId}/keywords`)
    return res.data.data
  },

  importKeywords: async (scheduleId: string, keywords: string[]): Promise<{ imported: number; duplicates: number }> => {
    const res = await apiClient.post(`/schedules/${scheduleId}/keywords/import`, { keywords })
    return res.data.data
  },

  deleteKeyword: async (scheduleId: string, keywordId: string): Promise<void> => {
    await apiClient.delete(`/schedules/${scheduleId}/keywords/${keywordId}`)
  },

  resetKeywords: async (scheduleId: string): Promise<{ count: number }> => {
    const res = await apiClient.post(`/schedules/${scheduleId}/keywords/reset`)
    return res.data
  },
}
