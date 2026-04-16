import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { gunzipSync } from 'node:zlib';
import { verifyToken } from './lib/auth.js';

// Create Hono app (shared between local dev and Lambda)
export const app = new Hono();

// Parse allowed origins from environment variable
// Default to localhost:3000 for development
const getAllowedOrigins = (): string[] => {
  const originsEnv = process.env.ALLOWED_ORIGINS;
  if (originsEnv) {
    return originsEnv.split(',').map((o) => o.trim());
  }
  // Default origins for development
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
};

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: (origin) => {
      // Allow requests with no origin (e.g., curl, server-to-server)
      if (!origin) return '*';

      const allowedOrigins = getAllowedOrigins();
      // Check if origin matches any allowed origin
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      // In development, also allow any localhost port
      if (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:')) {
        return origin;
      }
      // Reject by returning null
      return null;
    },
    credentials: true,
  })
);

// Gzip request body decompression middleware.
// AWS API Gateway auto-decompresses in production; this handles local dev
// and serves as a safety net if API Gateway passes gzip through.
app.use('*', async (c, next) => {
  if (c.req.header('content-encoding') === 'gzip' && c.req.method === 'POST') {
    try {
      const compressedBuffer = await c.req.arrayBuffer();
      const decompressed = gunzipSync(Buffer.from(compressedBuffer));
      const headers = new Headers(c.req.raw.headers);
      headers.delete('content-encoding');
      headers.set('content-length', String(decompressed.length));

      const newReq = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers,
        body: decompressed,
      });
      // Replace the raw request so downstream handlers (including lazy sub-apps) get decompressed body
      Object.defineProperty(c.req, 'raw', { value: newReq, writable: true, configurable: true });
    } catch {
      return c.json({ success: false, error: 'Invalid gzip body', code: 'INVALID_ENCODING' }, 400);
    }
  }
  await next();
});

// JWT auth middleware — protect all /api/* except /api/auth/login and /api/auth/refresh
app.use('/api/*', async (c, next) => {
  const path = c.req.path;

  // Public endpoints (no auth required)
  if (path === '/api/auth/login' || path === '/api/auth/refresh' || path.startsWith('/api/admin') || path === '/api/sync' || path.startsWith('/api/register') || path.startsWith('/api/agent')) {
    return next();
  }

  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json(
      { success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' },
      401
    );
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  if (!payload || payload.type !== 'access') {
    return c.json(
      { success: false, error: 'Invalid or expired token', code: 'INVALID_TOKEN' },
      401
    );
  }

  // Store user info for downstream handlers
  c.set('jwtPayload', payload);

  return next();
});

// Health check endpoint
app.get('/health', (c) => {
  const bucket = process.env.BUCKET_NAME || 'not-configured';
  const stage = bucket.startsWith('ccusage-data-') ? bucket.replace('ccusage-data-', '') : 'unknown';
  return c.json({
    status: 'ok',
    stage,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    bucket,
  });
});

// Lazy load routes to prevent cold start issues
app.all('/api/*', async (c, next) => {
  const path = c.req.path;

  // Route: /api/auth/* (Authentication)
  if (path.startsWith('/api/auth')) {
    const { default: authRoute } = await import('./routes/auth.js');
    const authApp = new Hono();
    authApp.route('/api/auth', authRoute);
    return authApp.fetch(c.req.raw);
  }

  // Route: POST /api/sync (Epic 2 - implemented)
  if (path === '/api/sync' && c.req.method === 'POST') {
    const { default: syncRoute } = await import('./routes/sync.js');
    const syncApp = new Hono();
    syncApp.route('/api/sync', syncRoute);
    return syncApp.fetch(c.req.raw);
  }

  // Route: /api/dashboard/* (Epic 3/4 - implemented)
  if (path.startsWith('/api/dashboard')) {
    const { default: dashboardRoute } = await import('./routes/dashboard.js');
    const dashboardApp = new Hono();
    dashboardApp.route('/api/dashboard', dashboardRoute);
    return dashboardApp.fetch(c.req.raw);
  }

  // Route: /api/members/* (Epic 3/4 - implemented)
  if (path.startsWith('/api/members')) {
    const { default: membersRoute } = await import('./routes/members.js');
    const membersApp = new Hono();
    membersApp.route('/api/members', membersRoute);
    return membersApp.fetch(c.req.raw);
  }

  // Route: /api/agent/* (Agent-facing endpoints)
  if (path.startsWith('/api/agent')) {
    const { default: agentRoute } = await import('./routes/agent.js');
    const agentApp = new Hono();
    agentApp.route('/api/agent', agentRoute);
    return agentApp.fetch(c.req.raw);
  }

  // Route: /api/register/* (Temporary in-memory data)
  if (path.startsWith('/api/register')) {
    const { default: registerRoute } = await import('./routes/register.js');
    const registerApp = new Hono();
    registerApp.route('/api/register', registerRoute);
    return registerApp.fetch(c.req.raw);
  }

  // Route: /api/quota (Quota tracking) — DISABLED: feature not yet deployed
  // if (path.startsWith('/api/quota')) {
  //   const { default: quotaRoute } = await import('./routes/quota.js');
  //   const quotaApp = new Hono();
  //   quotaApp.route('/api/quota', quotaRoute);
  //   return quotaApp.fetch(c.req.raw);
  // }

  // Route: /api/admin/* (Admin endpoints)
  if (path.startsWith('/api/admin')) {
    const { default: adminRoute } = await import('./routes/admin.js');
    const adminApp = new Hono();
    adminApp.route('/api/admin', adminRoute);
    return adminApp.fetch(c.req.raw);
  }

  // Route: GET /api/raw/:memberId (alias for /api/members/:id/raw)
  if (path.startsWith('/api/raw/') && c.req.method === 'GET') {
    const memberId = path.replace('/api/raw/', '');

    // Redirect to members raw endpoint (preserves query params)
    const newUrl = new URL(c.req.url);
    newUrl.pathname = `/api/members/${memberId}/raw`;
    const newRequest = new Request(newUrl.toString(), c.req.raw);

    const { default: membersRoute } = await import('./routes/members.js');
    const membersApp = new Hono();
    membersApp.route('/api/members', membersRoute);
    return membersApp.fetch(newRequest);
  }

  // No matching route
  return c.json({ success: false, error: 'Not found' }, 404);
});

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: 'Not found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json(
    {
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
    500
  );
});

export default app;
