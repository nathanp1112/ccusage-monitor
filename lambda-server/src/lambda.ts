import { handle } from 'hono/aws-lambda';
import { app } from './app.js';

// AWS Lambda handler
// Uses Hono's native AWS Lambda adapter
export const handler = handle(app);
