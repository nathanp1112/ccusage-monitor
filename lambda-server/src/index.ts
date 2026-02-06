import { serve } from '@hono/node-server';
import { app } from './app.js';

// Load environment variables in development
if (process.env.NODE_ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.config();
}

// Start local server (not used in Lambda)
const port = parseInt(process.env.PORT || '3001', 10);

console.log(`Starting CCUsage API server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running at http://localhost:${port}`);
console.log(`Health check: http://localhost:${port}/health`);
