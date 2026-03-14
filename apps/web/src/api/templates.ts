import { apiClient } from './client'

export interface Template {
  id: string
  name: string
  description: string | null
  systemPrompt: string
  userPromptTemplate: string
  variables: string[]
  model: 'gpt-4o' | 'gpt-4o-mini'
  maxTokens: number
  temperature: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface TemplateFormData {
  name: string
  description?: string
  systemPrompt: string
  userPromptTemplate: string
  variables?: string[]
  model: Template['model']
  maxTokens: number
  temperature: number
  isDefault?: boolean
}

export const templatesApi = {
  getTemplates: async (): Promise<Template[]> => {
    const res = await apiClient.get('/templates')
    return res.data.data
  },

  getTemplate: async (id: string): Promise<Template> => {
    const res = await apiClient.get(`/templates/${id}`)
    return res.data.data
  },

  createTemplate: async (data: TemplateFormData): Promise<Template> => {
    const res = await apiClient.post('/templates', {
      ...data,
      temperature: String(data.temperature),
    })
    return res.data.data
  },

  updateTemplate: async (id: string, data: Partial<TemplateFormData>): Promise<Template> => {
    const payload = data.temperature !== undefined
      ? { ...data, temperature: String(data.temperature) }
      : data
    const res = await apiClient.put(`/templates/${id}`, payload)
    return res.data.data
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await apiClient.delete(`/templates/${id}`)
  },

  previewTemplate: async (
    id: string,
    variables: Record<string, string>
  ): Promise<{ prompt: string }> => {
    const res = await apiClient.post(`/templates/${id}/preview`, { variables })
    return res.data.data
  },
}
