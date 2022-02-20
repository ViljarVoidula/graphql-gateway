import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import { stitchSchemas } from '@graphql-tools/stitch';

import { graphqlHTTP } from 'express-graphql';
import { buildSchema, GraphQLSchema, Source } from 'graphql';

import SchemaLoader from '../utils/schemaLoader';
import RemoteExecutor from '../utils/remoteExecutor';
import buildMainSchema from './schema';
import { App } from '../types';
import { useServer } from 'graphql-ws/lib/use/ws';
import config from 'config';

const { stitchingDirectivesTransformer } = stitchingDirectives();

const loader = new SchemaLoader({
  // add transforms to subschemas if conflicting values
  endpoints: config?.get('endpoints') ?? [],

  buildSchema: (loadedEndpoints: any) => {
    const subschemas = loadedEndpoints.map(
      ({
        sdl,
        url,
        transforms,
      }: {
        sdl: Source;
        url: string;
        transforms: Array<Function>;
      }) => {
        const { executor, subscriber } = new RemoteExecutor({
          url,
        });

        return {
          schema: buildSchema(sdl),
          executor,
          subscriber,
          batch: true,
          transforms,
        };
      }
    );

    subschemas.push(buildMainSchema(loader));

    return stitchSchemas({
      subschemaConfigTransforms: [stitchingDirectivesTransformer],
      subschemas,
    });
  },
});

export default function (app: App) {
  loader.reload().then(() => {
    app.use(
      '/graphql',
      graphqlHTTP(() => ({
        schema: loader.schema as GraphQLSchema,
        graphiql: true,
        customFormatErrorFn: (error) => {
          // catch graphql errors
          let returnValue = {
            message: error.message,
            path: error.path,
            locations: error.locations,
            extensions: error.extensions,
            ...error.originalError,
          };
          return returnValue as Error;
        },
      }))
    );
    // Hack to spin up WS for Subscriptions
    if (app.wsServer) {
      useServer({ schema: loader.schema }, app.wsServer);
    }

    loader.autoRefresh();
  });
}
