import { createServer, Server } from 'http';
import { buildSchema, GraphQLSchema } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { SubschemaConfig } from '@graphql-tools/delegate';
import { buildHMACExecutor } from './utils/hmacExecutor';
import { stitchSchemas } from '@graphql-tools/stitch';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import { SchemaLoader } from './SchemaLoader';
import { makeEndpointsSchema } from './services/endpoints';
import { keyManager } from './security/keyManager';

const { stitchingDirectivesTransformer } = stitchingDirectives();

const loader = new SchemaLoader(
  function buildSchemaFromEndpoints(loadedEndpoints) {
    const subschemas: SubschemaConfig[] = loadedEndpoints.map(({ sdl, url }) => ({
      schema: buildSchema(sdl),
      executor: buildHMACExecutor({
        endpoint: url,
        timeout: 5000,
        enableHMAC: true,
      }),
      batch: true,
    }));

    subschemas.push(makeEndpointsSchema(loader));

    return stitchSchemas({
      subschemaConfigTransforms: [stitchingDirectivesTransformer],
      subschemas,
    });
  },
  [],
);

const server = createServer(
  createYoga({
    schema: () => loader.schema,
    maskedErrors: false,
    graphiql: {
      title: 'Hot schema reloading',
    },
  }),
);
export async function startServer() {
  const REFERSH_INTERVAL = process.env.REFRESH_INTERVAL
    ? parseInt(process.env.REFRESH_INTERVAL, 10)
    : 30_000;
  
  // Start periodic cleanup of expired keys
  const KEY_CLEANUP_INTERVAL = process.env.KEY_CLEANUP_INTERVAL
    ? parseInt(process.env.KEY_CLEANUP_INTERVAL, 10)
    : 60_000; // 1 minute default
  
  const cleanupInterval = setInterval(() => {
    keyManager.cleanupExpiredKeys();
  }, KEY_CLEANUP_INTERVAL);
  
  // sleep 2s
  await loader.reload();
  await new Promise<void>(resolve => server.listen(4000, resolve));
  console.log('Gateway started on http://localhost:4000');
  console.log(`HMAC key cleanup will run every ${KEY_CLEANUP_INTERVAL} ms`);

  await loader.autoRefresh(REFERSH_INTERVAL);
  console.log(`Gateway schema will refresh every ${REFERSH_INTERVAL} ms`);
  
  // Store cleanup interval for stopping later
  (server as any).keyCleanupInterval = cleanupInterval;
}

export async function stopServer() {
  loader.stopAutoRefresh();
  
  // Clear the key cleanup interval
  if ((server as any).keyCleanupInterval) {
    clearInterval((server as any).keyCleanupInterval);
  }
  
  await new Promise(resolve => server.close(resolve));
}
