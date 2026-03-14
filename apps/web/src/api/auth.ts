import { apiClient } from './client'

export interface LoginResponse {
  token: string
  user: {
    id: string
    email: string
  }
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const res = await apiClient.post('/auth/login', { email, password })
    return res.data
  },

  getMe: async () => {
    const res = await apiClient.get('/auth/me')
    return res.data.user
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await apiClient.put('/auth/password', {
      currentPassword,
      newPassword,
    })
    return res.data
  },
}
