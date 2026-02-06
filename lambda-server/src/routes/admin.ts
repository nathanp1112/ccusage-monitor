/**
 * Admin Route Handler
 * POST /api/admin/aggregate - Trigger aggregator Lambda
 */

import { Hono } from 'hono';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const adminRoute = new Hono();

// Lambda client (lazy initialized)
let lambdaClient: LambdaClient | null = null;

function getLambdaClient(): LambdaClient {
  if (!lambdaClient) {
    lambdaClient = new LambdaClient({
      region: process.env.AWS_REGION || 'ap-southeast-1',
    });
  }
  return lambdaClient;
}

/**
 * POST /api/admin/aggregate
 * Triggers the aggregator Lambda to recompute views
 */
adminRoute.post('/aggregate', async (c) => {
  const functionName = process.env.AGGREGATOR_FUNCTION_NAME;

  if (!functionName) {
    return c.json(
      {
        success: false,
        error: 'Aggregator function not configured',
      },
      500
    );
  }

  try {
    const client = getLambdaClient();
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify({ source: 'api-trigger' }),
    });

    await client.send(command);

    return c.json({
      success: true,
      message: 'Aggregator triggered successfully',
      functionName,
    });
  } catch (error) {
    console.error('Failed to trigger aggregator:', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger aggregator',
      },
      500
    );
  }
});

/**
 * GET /api/admin/status
 * Returns system status
 */
adminRoute.get('/status', async (c) => {
  return c.json({
    success: true,
    data: {
      environment: process.env.NODE_ENV || 'development',
      bucket: process.env.BUCKET_NAME || 'not-configured',
      region: process.env.AWS_REGION || 'ap-southeast-1',
      aggregatorFunction: process.env.AGGREGATOR_FUNCTION_NAME || 'not-configured',
    },
  });
});

export default adminRoute;
