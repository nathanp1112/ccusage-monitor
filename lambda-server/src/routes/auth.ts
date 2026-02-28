import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  findUser,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from '../lib/auth.js';

const authRoute = new Hono();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * POST /login — Authenticate with email/password, returns JWT tokens
 */
authRoute.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  const user = findUser(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return c.json({ success: false, error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' }, 401);
  }

  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(user),
    generateRefreshToken(user),
  ]);

  return c.json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

/**
 * POST /refresh — Exchange refresh token for new token pair
 */
authRoute.post('/refresh', zValidator('json', refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');

  const payload = await verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh') {
    return c.json({ success: false, error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' }, 401);
  }

  // Ensure user still exists
  const user = findUser(payload.email);
  if (!user) {
    return c.json({ success: false, error: 'User no longer exists', code: 'USER_NOT_FOUND' }, 401);
  }

  const [newAccessToken, newRefreshToken] = await Promise.all([
    generateAccessToken(user),
    generateRefreshToken(user),
  ]);

  return c.json({
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
});

/**
 * POST /logout — No-op (client clears tokens), requires auth
 */
authRoute.post('/logout', (c) => {
  return c.json({ success: true });
});

/**
 * GET /me — Return current user info from JWT payload.
 * Auth middleware already verified the token; re-decode here because
 * lazy-loaded sub-apps don't inherit the parent Hono context.
 */
authRoute.get('/me', async (c) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' }, 401);
  }

  const payload = await verifyToken(authHeader.slice(7));
  if (!payload || payload.type !== 'access') {
    return c.json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' }, 401);
  }

  return c.json({
    success: true,
    user: { email: payload.email, name: payload.name, role: payload.role },
  });
});

export default authRoute;
