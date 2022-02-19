import fs from 'fs';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { Endpoint } from '../types';
import { PubSub } from 'graphql-subscriptions';

import requireAll from 'require-all';

const { mergeResolvers, mergeTypeDefs } = require('@graphql-tools/merge');

const definitions = requireAll({
  dirname: __dirname + '/services',
  filter: /\w\.?schema.ts$/,
  recursive: true,
});

const rootSchema = fs.readFileSync(`${__dirname}/schema.graphql`, {
  encoding: 'utf8',
});

const extendedSchema = Object.keys(definitions).map((key) => {
  return definitions[key]['s.schema.ts']['default'].typeDef;
});
const extendedResolvers = Object.keys(definitions).map(
  (key) => definitions[key]['s.schema.ts']['default'].resolvers
);

const topic = 'NEW_ENDPOINT';
const pubsub = new PubSub();

export default function buildMainSchema(loader: any) {
  /*
  Merge root schema with local extensions which are loaded
  */
  let resolvers = mergeResolvers([
    {
      Query: {
        endpoints: () => loader.loadedEndpoints,
      },
      Mutation: {
        async registerEndpoint(
          _root: any,
          { url, prefix, sdlQuery }: Endpoint
        ) {
          let success = false;
          if (
            !loader.endpoints.filter(
              (el: Endpoint) => el.url === url && el.prefix === prefix
            ).length
          ) {
            loader.endpoints.push({ url, prefix, sdlQuery });
            await loader.reload();
            success = true;
          }

          pubsub.publish(topic, { success });

          return {
            endpoint: loader.loadedEndpoints.find(
              (endpoint: Endpoint) =>
                endpoint.url === url && endpoint.prefix === prefix
            ),
            success,
          };
        },
        async unregisterEndpoint(_root: any, { url }: Endpoint) {
          let success = false;
          const index = loader.endpoints.indexOf(url);
          if (index > -1) {
            loader.endpoints.splice(index, 1);
            await loader.reload();
            success = true;
          }

          pubsub.publish(topic, { success });
          return { success };
        },

        async reloadAllEndpoints() {
          await loader.reload();
          return { success: true };
        },
      },
      Subscription: {
        registerEndpoint: {
          subscribe: () => pubsub.asyncIterator(topic),
        },
      },
    },
    ...extendedResolvers,
  ]);

  let typeDefs = mergeTypeDefs([rootSchema, extendedSchema], {
    commentDescriptions: true,
  });

  return makeExecutableSchema({
    typeDefs,
    resolvers,
  });
}
