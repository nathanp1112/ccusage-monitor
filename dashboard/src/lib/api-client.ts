// For static hosting (S3), use NEXT_PUBLIC_API_URL environment variable
// For local dev with Next.js server, leave empty to use rewrites
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

// localStorage keys for auth tokens
const ACCESS_TOKEN_KEY = 'ccusage-access-token'
const REFRESH_TOKEN_KEY = 'ccusage-refresh-token'

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>
  /** Skip auth header (for login/refresh endpoints) */
  skipAuth?: boolean
}

/**
 * API Error with status code
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }

  get isNotFound() {
    return this.status === 404
  }

  get isServerError() {
    return this.status >= 500
  }
}

/**
 * Token storage helpers
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function hasTokens(): boolean {
  return !!getAccessToken()
}

/**
 * Try to refresh the access token using the stored refresh token.
 * Returns true if refresh succeeded, false otherwise.
 */
let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false

    try {
      const url = `${API_BASE_URL}/api/auth/refresh`
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        clearTokens()
        return false
      }

      const data = await response.json()
      if (data.accessToken && data.refreshToken) {
        setTokens(data.accessToken, data.refreshToken)
        return true
      }
      clearTokens()
      return false
    } catch {
      clearTokens()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * API Client for backend communication
 */
class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {},
    isRetry = false
  ): Promise<T> {
    const { params, skipAuth, ...fetchOptions } = options

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.set(key, String(value))
        }
      })
      const queryString = searchParams.toString()
      if (queryString) {
        url += `?${queryString}`
      }
    }

    // Build headers with auth token
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    }

    if (!skipAuth) {
      const token = getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    })

    // Handle 401 — try token refresh once
    if (response.status === 401 && !skipAuth && !isRetry) {
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        return this.request<T>(endpoint, options, true)
      }
      // Refresh failed — redirect to login
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
      throw new ApiError(401, 'Session expired. Please log in again.')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new ApiError(
        response.status,
        error.message || error.error || 'Request failed'
      )
    }

    // Handle empty responses
    const text = await response.text()
    if (!text) {
      return {} as T
    }

    return JSON.parse(text)
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  async post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async patch<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }
}

export const apiClient = new ApiClient(API_BASE_URL)
