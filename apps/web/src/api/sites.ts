import { apiClient } from './client'

export interface Site {
  id: string
  name: string
  url: string
  status: 'active' | 'inactive' | 'error'
  maxPostsPerDay: number
  postsToday: number
  lastHealthCheck: string | null
  consecutiveFailures: number
  lastHealthCheckError: string | null
  tags: string[]
  niche: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteFormData {
  name: string
  url: string
  username: string
  applicationPassword: string
  maxPostsPerDay: number
  tags?: string[]
  niche?: string
  notes?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
}

export interface SiteFilters {
  search?: string
  status?: string
  tag?: string
  niche?: string
}

export const sitesApi = {
  getSites: async (page = 1, limit = 20, filters?: SiteFilters): Promise<PaginatedResponse<Site>> => {
    const res = await apiClient.get('/sites', { params: { page, limit, ...filters } })
    return { data: res.data.data, page: res.data.page, limit: res.data.limit, total: res.data.total ?? 0 }
  },

  getSite: async (id: string): Promise<Site> => {
    const res = await apiClient.get(`/sites/${id}`)
    return res.data.data
  },

  createSite: async (data: SiteFormData): Promise<Site> => {
    const res = await apiClient.post('/sites', data)
    return res.data.data
  },

  updateSite: async (id: string, data: Partial<SiteFormData & { status: string; tags: string[]; niche: string; notes: string }>): Promise<Site> => {
    const res = await apiClient.put(`/sites/${id}`, data)
    return res.data.data
  },

  deleteSite: async (id: string): Promise<void> => {
    await apiClient.delete(`/sites/${id}`)
  },

  testSite: async (id: string): Promise<{ success: boolean; wpVersion?: string; siteName?: string; error?: string }> => {
    const res = await apiClient.post(`/sites/${id}/test`)
    return res.data.data
  },

  bulkTestSites: async (ids: string[]) => {
    const res = await apiClient.post('/sites/bulk-test', { siteIds: ids })
    return res.data.data
  },

  bulkImport: async (sites: Array<{
    name: string
    url: string
    username: string
    applicationPassword: string
    maxPostsPerDay?: number
    tags?: string[]
    niche?: string
  }>) => {
    const res = await apiClient.post('/sites/bulk-import', { sites })
    return res.data
  },

  bulkUpdate: async (siteIds: string[], updates: { tags?: string[]; niche?: string; maxPostsPerDay?: number }) => {
    const res = await apiClient.put('/sites/bulk-update', { siteIds, ...updates })
    return res.data
  },

  getTags: async (): Promise<string[]> => {
    const res = await apiClient.get('/sites/tags')
    return res.data.data
  },

  getNiches: async (): Promise<string[]> => {
    const res = await apiClient.get('/sites/niches')
    return res.data.data
  },

  getSiteCategories: async (id: string): Promise<Array<{ id: number; name: string }>> => {
    const res = await apiClient.get(`/sites/${id}/categories`)
    return res.data.data
  },

  resetPostsToday: async (id?: string) => {
    const url = id ? `/sites/${id}/reset-posts-today` : '/sites/reset-posts-today'
    const res = await apiClient.post(url)
    return res.data
  },

  exportCsv: async (filters?: SiteFilters): Promise<Blob> => {
    const res = await apiClient.get('/sites/export', {
      params: filters,
      responseType: 'blob',
    })
    return res.data
  },
}
