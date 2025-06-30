import { createServer, Server } from 'http';
import { buildSchema, GraphQLSchema } from 'graphql';
import { createYoga } from 'graphql-yoga';
import { SubschemaConfig } from '@graphql-tools/delegate';
import { buildHTTPExecutor } from '@graphql-tools/executor-http';
import { stitchSchemas } from '@graphql-tools/stitch';
import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import { SchemaLoader } from './SchemaLoader';
import { makeEndpointsSchema } from './services/endpoints';

const { stitchingDirectivesTransformer } = stitchingDirectives();

const loader = new SchemaLoader(
  function buildSchemaFromEndpoints(loadedEndpoints) {
    const subschemas: SubschemaConfig[] = loadedEndpoints.map(({ sdl, url }) => ({
      schema: buildSchema(sdl),
      executor: buildHTTPExecutor({
        endpoint: url,
        timeout: 5000,
        fetch: (url, options, {req}) => {
          const authHeader = req.headers?.authorization;
          if (authHeader) {
            options.headers = {
              ...options.headers,
              Authorization: authHeader,
            };
          }
          // handle custom headers and cookies
          if (req.headers?.cookie) {
            options.headers = {
              ...options.headers,
              Cookie: req.headers.cookie,
            };
          }
          // proxy request ids etc
          if (req.headers?.['x-request-id']) {
            options.headers = {
              ...options.headers,
              'x-request-id': req.headers['x-request-id'],
            };
          }
          if (req.headers?.['x-correlation-id']) {
            options.headers = {
              ...options.headers,
              'x-correlation-id': req.headers['x-correlation-id'],
            };
          }
          //traceparent header for distributed tracing
          if (req.headers?.traceparent) {
            options.headers = {
              ...options.headers,
              traceparent: req.headers.traceparent
            }
          }
          return fetch(url, options);
        }
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
  // sleep 2s
  await loader.reload();
  await new Promise<void>(resolve => server.listen(4000, resolve));
  console.log('Gateway started on http://localhost:4000');

  await loader.autoRefresh(REFERSH_INTERVAL);
  console.log(`Gateway schema will refresh every ${REFERSH_INTERVAL} ms`);
}

export async function stopServer() {
  loader.stopAutoRefresh();
  await new Promise(resolve => server.close(resolve));
}
