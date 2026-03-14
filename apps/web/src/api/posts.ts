import { apiClient } from './client'
import type { PaginatedResponse } from './sites'

export interface Post {
  id: string
  articleId: string
  siteId: string
  status: 'pending' | 'posting' | 'posted' | 'failed'
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
}

export interface CreatePostData {
  articleId: string
  siteId: string
}

export interface BulkPostData {
  articleId: string
  siteIds: string[]
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
    return { data: res.data.data, page: res.data.page, limit: res.data.limit }
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

  deletePost: async (id: string): Promise<void> => {
    await apiClient.delete(`/posts/${id}`)
  },

  unpublishPost: async (id: string) => {
    const res = await apiClient.post(`/posts/${id}/unpublish`)
    return res.data
  },
}
