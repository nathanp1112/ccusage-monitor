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
    // Extract force flag from query params
    const url = new URL(c.req.url);
    const force = url.searchParams.get('force') === 'true';

    const client = getLambdaClient();
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse', // Synchronous — wait for result
      Payload: JSON.stringify({ source: 'api-trigger', force }),
    });

    const response = await client.send(command);

    // Parse aggregator result from Lambda response payload
    let payloadStr = '';
    if (response.Payload) {
      if (typeof response.Payload === 'string') {
        payloadStr = response.Payload;
      } else {
        // Uint8Array, Uint8ArrayBlobAdapter, or Buffer
        const bytes = response.Payload instanceof Uint8Array
          ? response.Payload
          : new Uint8Array(response.Payload);
        payloadStr = new TextDecoder().decode(bytes);
      }
    }

    // Check for Lambda-level errors
    if (response.FunctionError) {
      return c.json(
        {
          success: false,
          error: `Aggregator failed: ${response.FunctionError}`,
          details: payloadStr ? JSON.parse(payloadStr) : null,
        },
        500
      );
    }

    if (!payloadStr) {
      return c.json({ success: true, message: 'Aggregator completed (no response payload)', force });
    }

    let result = JSON.parse(payloadStr);
    // Lambda may double-encode the result as a JSON string
    if (typeof result === 'string') {
      result = JSON.parse(result);
    }

    return c.json({
      success: true,
      message: `Aggregation completed${force ? ' (force rebuild)' : ''}`,
      ...result,
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
