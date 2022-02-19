import { stitchingDirectives } from '@graphql-tools/stitching-directives';
import { stitchSchemas } from '@graphql-tools/stitch';

import { graphqlHTTP } from 'express-graphql';
import {
  buildSchema,
  GraphQLSchema,
  Source,
  getIntrospectionQuery,
} from 'graphql';

import SchemaLoader from '../utils/schemaLoader';
import RemoteExecutor from '../utils/remoteExecutor';
import buildMainSchema from './schema';
import { App } from '../types';

import { useServer } from 'graphql-ws/lib/use/ws';

const { stitchingDirectivesTransformer } = stitchingDirectives();

const loader = new SchemaLoader({
  // add transforms to subschemas if conflicting values
  endpoints: [
    {
      url: 'http://localhost:4001/graphql',
      prefix: 'ns2',
    },
    {
      url: 'https://graphqlpokemon.favware.tech/',
      // setting sdlQuery
      sdlQuery: getIntrospectionQuery(),
    },
  ],

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
      }))
    );
    // Hack to spin up WS for Subscriptions
    if (app.wsServer) {
      useServer({ schema: loader.schema }, app.wsServer);
    }

    loader.autoRefresh();
  });
}
