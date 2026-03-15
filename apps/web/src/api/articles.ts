import { apiClient } from './client'
import type { PaginatedResponse } from './sites'

export interface Article {
  id: string
  title: string
  content: string
  excerpt: string | null
  metaTitle: string | null
  metaDescription: string | null
  focusKeyword: string | null
  tags: string[]
  templateId: string | null
  status: 'draft' | 'generating' | 'generated' | 'failed'
  generationTokens: number | null
  generationCost: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface GenerateArticleData {
  templateId: string
  keyword: string
  variables?: Record<string, string>
}

export interface BulkGenerateData {
  templateId: string
  keywords: string[]
  variables?: Record<string, string>
}

export const articlesApi = {
  getArticles: async (
    page = 1,
    limit = 20,
    status?: Article['status']
  ): Promise<PaginatedResponse<Article>> => {
    const res = await apiClient.get('/articles', { params: { page, limit, status } })
    return { data: res.data.data, page: res.data.page, limit: res.data.limit, total: res.data.total ?? 0 }
  },

  getArticle: async (id: string): Promise<Article> => {
    const res = await apiClient.get(`/articles/${id}`)
    return res.data.data
  },

  updateArticle: async (id: string, data: Partial<Article>): Promise<Article> => {
    const res = await apiClient.put(`/articles/${id}`, data)
    return res.data.data
  },

  deleteArticle: async (id: string): Promise<void> => {
    await apiClient.delete(`/articles/${id}`)
  },

  generateArticle: async (data: GenerateArticleData) => {
    const res = await apiClient.post('/articles/generate', data)
    return res.data.data
  },

  bulkGenerateArticles: async (data: BulkGenerateData) => {
    const res = await apiClient.post('/articles/bulk-generate', {
      templateId: data.templateId,
      items: data.keywords.map(keyword => ({
        keyword,
        variables: data.variables,
      })),
    })
    return res.data
  },

  getGenerationStatus: async (id: string) => {
    const res = await apiClient.get(`/articles/${id}/generation-status`)
    return res.data.data
  },
}
