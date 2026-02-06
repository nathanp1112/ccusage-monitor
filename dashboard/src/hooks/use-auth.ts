'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import type { LoginRequest, LoginResponse, User } from '@/types/api'

/**
 * Hook for current user session
 * Note: Auth not implemented in Lambda API yet, returns default user
 */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: async (): Promise<User> => {
      // Auth not implemented in Lambda API - return default user
      return {
        id: 'default',
        name: 'Admin',
        email: 'admin@localhost',
        role: 'admin',
      }
    },
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
        credentials
      )
      return response
    },
    onSuccess: (data) => {
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
      await apiClient.post('/api/auth/logout')
    },
    onSuccess: () => {
      queryClient.clear()
      router.push('/login')
    },
  })
}
