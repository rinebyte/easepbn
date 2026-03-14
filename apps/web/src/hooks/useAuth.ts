import { useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { authApi } from '@/api/auth'

export function useAuth() {
  const { token, user, setAuth, logout: storeLogout } = useAuthStore()

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authApi.login(email, password)
      setAuth(data.token, data.user)
      return data
    },
    [setAuth]
  )

  const logout = useCallback(() => {
    storeLogout()
  }, [storeLogout])

  return {
    token,
    user,
    isAuthenticated: !!token,
    login,
    logout,
  }
}
