import type { NextConfig } from 'next'

// API server URL - configure via environment variable
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:3003'

const nextConfig: NextConfig = {
  // Enable React strict mode for development
  reactStrictMode: true,

  // Static export for S3 hosting (set via STATIC_EXPORT=true)
  ...(process.env.STATIC_EXPORT === 'true' && {
    output: 'export',
    trailingSlash: true,
  }),

  // Transpile packages if needed
  transpilePackages: [],

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_APP_NAME: 'CCUsage Team Monitor',
  },

  // Enable typed routes
  typedRoutes: true,

  // Proxy API requests to backend server (only works in non-static mode)
  async rewrites() {
    // Skip rewrites for static export
    if (process.env.STATIC_EXPORT === 'true') {
      return []
    }
    return [
      {
        source: '/api/:path*',
        destination: `${API_SERVER_URL}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
