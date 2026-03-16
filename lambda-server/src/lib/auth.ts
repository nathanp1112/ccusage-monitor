import { createHash, timingSafeEqual } from 'node:crypto';
import { sign, verify } from 'hono/jwt';
import usersDevData from '../data/users.dev.json';
import usersJitData from '../data/users.jit.json';

// Derive stage from BUCKET_NAME (e.g. "ccusage-data-dev" → "dev")
function getStage(): string {
  const bucket = process.env.BUCKET_NAME || '';
  if (bucket.startsWith('ccusage-data-')) return bucket.replace('ccusage-data-', '');
  return 'dev';
}

// JWT configuration — fail hard in production if secret not set
const DEV_SECRET = 'dev-secret-key-do-not-use-in-production';
const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const ACCESS_TOKEN_EXPIRES_IN = 60 * 60; // 60 minutes in seconds
const REFRESH_TOKEN_EXPIRES_IN = 20 * 24 * 60 * 60; // 20 days in seconds
const JWT_ALG = 'HS256' as const;

// User types
export interface UserRecord {
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'agent' | 'member';
}

export interface JwtPayload {
  email: string;
  name: string;
  role: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

/**
 * Load users for the current stage (imported from JSON at build time, bundler-friendly)
 */
export function loadUsers(): UserRecord[] {
  const stage = getStage();
  if (stage === 'jit') return usersJitData as UserRecord[];
  return usersDevData as UserRecord[];
}

/**
 * SHA256 hash a password
 */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

/**
 * Verify password against stored hash (timing-safe comparison)
 */
export function verifyPassword(password: string, hash: string): boolean {
  const computed = Buffer.from(hashPassword(password), 'hex');
  const stored = Buffer.from(hash, 'hex');
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

/**
 * Find user by email
 */
export function findUser(email: string): UserRecord | undefined {
  const users = loadUsers();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Generate JWT access token (60 min expiry)
 */
export async function generateAccessToken(user: UserRecord): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      email: user.email,
      name: user.name,
      role: user.role,
      type: 'access',
      iat: now,
      exp: now + ACCESS_TOKEN_EXPIRES_IN,
    },
    JWT_SECRET,
    JWT_ALG
  );
}

/**
 * Generate JWT refresh token (20 days expiry)
 */
export async function generateRefreshToken(user: UserRecord): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      email: user.email,
      name: user.name,
      role: user.role,
      type: 'refresh',
      iat: now,
      exp: now + REFRESH_TOKEN_EXPIRES_IN,
    },
    JWT_SECRET,
    JWT_ALG
  );
}

/**
 * Verify and decode a JWT token. Returns null if invalid or expired.
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const payload = (await verify(token, JWT_SECRET, JWT_ALG)) as unknown as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Get JWT secret (for Hono jwt middleware)
 */
export function getJwtSecret(): string {
  return JWT_SECRET;
}
