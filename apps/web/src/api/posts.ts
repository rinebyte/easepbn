import { apiClient } from './client'
import type { PaginatedResponse } from './sites'

export interface Post {
  id: string
  articleId: string
  siteId: string
  status: 'pending' | 'posting' | 'posted' | 'failed' | 'unpublished'
  wpPostId: number | null
  wpPostUrl: string | null
  wpCategoryIds: number[]
  wpTagIds: number[]
  retryCount: number
  maxRetries: number
  errorMessage: string | null
  postedAt: string | null
  createdAt: string
  updatedAt: string
  articleTitle?: string
  siteName?: string
}

export interface CreatePostData {
  articleId: string
  siteId: string
}

export interface BulkPostData {
  articleId: string
  siteIds: string[]
}

export interface BlastPostData {
  keyword: string
  templateId: string
  siteIds: string[]
  variables?: Record<string, string>
  categoryNames?: string[]
  tagNames?: string[]
  spreadWindowMinutes?: number
  contentBrief?: string
}

export interface BlastResult {
  articlesCreated: number
  postsQueued: number
  activeSites: number
  skippedSites: number
  keyword: string
  batchId: string
}

export interface BlastStatus {
  batchId: string
  total: number
  completed: number
  failed: number
  pending: number
  status: 'in_progress' | 'complete' | 'failed'
}

export interface PostFilters {
  status?: Post['status']
  siteId?: string
  articleId?: string
}

export const postsApi = {
  getPosts: async (
    page = 1,
    limit = 20,
    filters?: PostFilters
  ): Promise<PaginatedResponse<Post>> => {
    const res = await apiClient.get('/posts', { params: { page, limit, ...filters } })
    return { data: res.data.data, page: res.data.page, limit: res.data.limit, total: res.data.total ?? 0 }
  },

  createPost: async (data: CreatePostData) => {
    const res = await apiClient.post('/posts', data)
    return res.data.data
  },

  bulkCreatePosts: async (data: BulkPostData) => {
    const res = await apiClient.post('/posts/bulk', data)
    return res.data
  },

  retryPost: async (id: string) => {
    const res = await apiClient.post(`/posts/${id}/retry`)
    return res.data
  },

  // Phase 4: Bulk retry all failed posts
  bulkRetry: async (params?: { siteId?: string; limit?: number }) => {
    const res = await apiClient.post('/posts/bulk-retry', params ?? {})
    return res.data
  },

  // Phase 4: Bulk delete posts
  bulkDelete: async (params: { status?: string; siteId?: string; postIds?: string[] }) => {
    const res = await apiClient.post('/posts/bulk-delete', params)
    return res.data
  },

  // Blast: generate unique article per site and post to all
  blastPost: async (data: BlastPostData): Promise<{ success: boolean; message: string; data: BlastResult }> => {
    const res = await apiClient.post('/posts/blast', data)
    return res.data
  },

  deletePost: async (id: string): Promise<void> => {
    await apiClient.delete(`/posts/${id}`)
  },

  unpublishPost: async (id: string) => {
    const res = await apiClient.post(`/posts/${id}/unpublish`)
    return res.data
  },

  getBlastStatus: async (batchId: string): Promise<BlastStatus> => {
    const res = await apiClient.get(`/posts/blast/${batchId}/status`)
    return res.data.data
  },

  exportCsv: async (filters?: PostFilters): Promise<Blob> => {
    const res = await apiClient.get('/posts/export', {
      params: filters,
      responseType: 'blob',
    })
    return res.data
  },
}
