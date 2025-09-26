#!/usr/bin/env node

/**
 * Demo script showing the improved SchemaLoader caching and auto-refresh functionality
 *
 * Features demonstrated:
 * 1. Background schema refresh with proper cache fallback
 * 2. Consistent auto-refresh timing using setInterval
 * 3. Proper permission synchronization
 * 4. Enhanced cache cleanup and management
 * 5. Detailed metrics reporting
 */

const { SchemaLoader, schemaCache } = require('./src/SchemaLoader');
const { buildSchema } = require('graphql');

// Mock schema builder for demo
const mockBuildSchema = (endpoints) => {
  console.log(`📦 Building schema with ${endpoints.length} endpoints`);
  return buildSchema(`
    type Query {
      hello: String
      endpoints: [String!]!
    }
  `);
};

// Mock endpoints for testing
const mockEndpoints = [
  'http://user-service:4000/graphql',
  'http://product-service:4001/graphql',
  'http://order-service:4002/graphql',
];

async function runDemo() {
  console.log('🚀 Starting SchemaLoader Cache & Auto-Refresh Demo\n');

  // Create schema loader instance
  const schemaLoader = new SchemaLoader(mockBuildSchema, mockEndpoints);

  // Set up dynamic endpoint loader
  schemaLoader.setEndpointLoader(async () => {
    console.log('🔍 Loading dynamic endpoints...');
    return [...mockEndpoints, 'http://new-service:4003/graphql'];
  });

  console.log('📊 Initial metrics:');
  console.log(JSON.stringify(schemaLoader.getMetrics(), null, 2));

  // Perform initial load
  console.log('\n🔄 Performing initial schema load...');
  await schemaLoader.reload();

  console.log('✅ Initial load complete');
  console.log('📊 Metrics after initial load:');
  console.log(JSON.stringify(schemaLoader.getMetrics(), null, 2));

  // Start auto-refresh with 5-second interval
  console.log('\n⏰ Starting auto-refresh (5-second interval)...');
  schemaLoader.autoRefresh(5000);

  // Simulate cache population
  console.log('\n💾 Populating cache with mock schemas...');
  mockEndpoints.forEach((endpoint, index) => {
    schemaCache.set(endpoint, {
      sdl: `type Query { service${index}: String }`,
      lastUpdated: Date.now() - index * 60000, // Different ages
    });
  });

  console.log('📊 Metrics after cache population:');
  console.log(JSON.stringify(schemaLoader.getMetrics(), null, 2));

  // Let auto-refresh run for a while
  console.log('\n⏳ Running auto-refresh for 15 seconds...');

  let counter = 0;
  const intervalId = setInterval(() => {
    counter++;
    console.log(`⏰ Auto-refresh cycle ${counter}`);

    if (counter >= 3) {
      console.log('\n🛑 Stopping auto-refresh...');
      schemaLoader.stopAutoRefresh();
      clearInterval(intervalId);

      console.log('📊 Final metrics:');
      console.log(JSON.stringify(schemaLoader.getMetrics(), null, 2));

      console.log('\n🧹 Running cache cleanup...');
      schemaLoader.cleanupExpiredCache();

      console.log('📊 Metrics after cleanup:');
      console.log(JSON.stringify(schemaLoader.getMetrics(), null, 2));

      console.log('\n✨ Demo complete! Key improvements:');
      console.log('  - ✅ Consistent auto-refresh timing with setInterval');
      console.log('  - ✅ Background schema updates with cache fallback');
      console.log('  - ✅ Permission synchronization after schema builds');
      console.log('  - ✅ Enhanced cache management and cleanup');
      console.log('  - ✅ Detailed metrics for monitoring');
      console.log('  - ✅ Proper error handling and graceful degradation');
    }
  }, 5000);
}

if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
