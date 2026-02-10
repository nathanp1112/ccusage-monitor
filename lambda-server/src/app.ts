import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

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

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    bucket: process.env.BUCKET_NAME || 'not-configured',
  });
});

// Lazy load routes to prevent cold start issues
app.all('/api/*', async (c, next) => {
  const path = c.req.path;

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
    const url = new URL(c.req.url);
    const year = url.searchParams.get('year') || '';
    const month = url.searchParams.get('month') || '';

    // Redirect to members raw endpoint
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
