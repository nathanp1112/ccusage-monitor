#!/usr/bin/env npx tsx
/**
 * Manually Trigger Aggregator Lambda
 *
 * Invokes the aggregator Lambda function to regenerate all pre-computed views.
 * Useful after migration or when data needs to be reprocessed.
 *
 * Usage:
 *   npx tsx scripts/trigger-aggregator.ts
 *
 * Environment variables:
 *   AWS_REGION - AWS region (default: ap-southeast-1)
 *   FUNCTION_NAME - Lambda function name (default: ccusage-monitor-dev-aggregator)
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';
const FUNCTION_NAME = process.env.FUNCTION_NAME || 'ccusage-monitor-dev-aggregator';

const lambdaClient = new LambdaClient({ region: AWS_REGION });

async function triggerAggregator(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Trigger Aggregator Lambda');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n📡 Invoking ${FUNCTION_NAME}...`);

  try {
    const command = new InvokeCommand({
      FunctionName: FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        source: 'manual-trigger',
        time: new Date().toISOString(),
      }),
    });

    const startTime = Date.now();
    const response = await lambdaClient.send(command);
    const duration = Date.now() - startTime;

    if (response.FunctionError) {
      console.error('\n❌ Lambda execution error:', response.FunctionError);
      if (response.Payload) {
        const payload = JSON.parse(new TextDecoder().decode(response.Payload));
        console.error('   Error details:', payload);
      }
      process.exit(1);
    }

    if (response.Payload) {
      const payload = JSON.parse(new TextDecoder().decode(response.Payload));
      console.log('\n✅ Aggregator completed successfully!');
      console.log(`\n📊 Results:`);
      console.log(`   Status:           ${payload.status}`);
      console.log(`   Members Processed: ${payload.membersProcessed}`);
      console.log(`   Views Generated:   ${payload.viewsGenerated?.length || 0}`);
      console.log(`   Duration:          ${payload.durationMs}ms (Lambda) / ${duration}ms (total)`);

      if (payload.viewsGenerated && payload.viewsGenerated.length > 0) {
        console.log('\n📁 Generated views:');
        for (const view of payload.viewsGenerated) {
          console.log(`   - ${view}`);
        }
      }
    }
  } catch (error) {
    console.error('\n❌ Failed to invoke Lambda:', error);
    process.exit(1);
  }
}

triggerAggregator();
