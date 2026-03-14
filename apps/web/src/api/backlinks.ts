import { apiClient } from './client'

export interface Backlink {
  id: string
  anchorText: string
  targetUrl: string
  isActive: boolean
  maxPerArticle: number
  priority: number
  totalUsageCount: number
  createdAt: string
  updatedAt: string
}

export interface BacklinkFormData {
  anchorText: string
  targetUrl: string
  maxPerArticle?: number
  priority?: number
}

export const backlinksApi = {
  getBacklinks: async (): Promise<Backlink[]> => {
    const res = await apiClient.get('/backlinks')
    return res.data.data
  },

  createBacklink: async (data: BacklinkFormData): Promise<Backlink> => {
    const res = await apiClient.post('/backlinks', data)
    return res.data.data
  },

  updateBacklink: async (id: string, data: Partial<BacklinkFormData & { isActive: boolean }>): Promise<Backlink> => {
    const res = await apiClient.put(`/backlinks/${id}`, data)
    return res.data.data
  },

  deleteBacklink: async (id: string): Promise<void> => {
    await apiClient.delete(`/backlinks/${id}`)
  },

  toggleBacklink: async (id: string): Promise<Backlink> => {
    const res = await apiClient.post(`/backlinks/${id}/toggle`)
    return res.data.data
  },
}
