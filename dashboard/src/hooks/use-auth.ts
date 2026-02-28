'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient, setTokens, clearTokens, hasTokens } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { LoginRequest, LoginResponse, User } from '@/types/api'

/**
 * Hook for current user session — calls GET /api/auth/me
 */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: async (): Promise<User> => {
      const data = await apiClient.get<{ success: boolean; user: User }>(
        '/api/auth/me'
      )
      return data.user
    },
    enabled: hasTokens(),
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook for login mutation
 */
export function useLogin() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response = await apiClient.post<LoginResponse>(
        '/api/auth/login',
        credentials,
        { skipAuth: true }
      )
      return response
    },
    onSuccess: (data) => {
      // Store JWT tokens
      setTokens(data.accessToken, data.refreshToken)
      // Cache user in query
      queryClient.setQueryData(queryKeys.auth.session, data.user)
      router.push('/')
    },
  })
}

/**
 * Hook for logout mutation
 */
export function useLogout() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      try {
        await apiClient.post('/api/auth/logout')
      } catch {
        // Logout is best-effort — clear tokens regardless
      }
    },
    onSuccess: () => {
      clearTokens()
      queryClient.clear()
      router.push('/login')
    },
    onError: () => {
      // Clear tokens even on error
      clearTokens()
      queryClient.clear()
      router.push('/login')
    },
  })
}
