import fs from 'fs';
import { makeExecutableSchema } from '@graphql-tools/schema';

import requireAll from 'require-all';

const { mergeResolvers, mergeTypeDefs } = require('@graphql-tools/merge');

const definitions = requireAll({
  dirname: __dirname + '/services',
  filter: /\w\.?service.ts$/,
  recursive: true,
});

const rootSchema = fs.readFileSync(`${__dirname}/schema.graphql`, {
  encoding: 'utf8',
});

const extendedSchema = Object.keys(definitions).map((key) => {
  return definitions[key]['s.service.ts']['default'].typeDef;
});
const extendedResolvers = Object.keys(definitions).map(
  (key) => definitions[key]['s.service.ts']['default'].resolvers
);

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
        async reloadAllEndpoints() {
          await loader.reload();
          return { success: true };
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
