import RemoteExecutor from './remoteExecutor';
import {
  printSchema,
  GraphQLSchema,
  buildClientSchema,
  getIntrospectionQuery,
} from 'graphql';
import { Endpoint, LoaderContext } from '../types';
const { RenameTypes, RenameRootFields } = require('@graphql-tools/wrap');

export default class SchemaLoader {
  endpoints: Array<Endpoint>;
  buildSchema: Function;
  loadedEndpoints: Array<void> | Array<any>;
  schema?: GraphQLSchema;
  intervalId?: NodeJS.Timeout | undefined;

  constructor({ buildSchema, endpoints }: LoaderContext) {
    this.buildSchema = buildSchema;
    this.endpoints = endpoints;
    this.loadedEndpoints = [];
    this.schema = undefined;
  }

  async reload() {
    const loadedEndpoints = await Promise.all(
      this.endpoints.map(
        async ({
          url,
          sdlQuery = getIntrospectionQuery(),
          prefix,
        }: Endpoint) => {
          try {
            const { executor } = new RemoteExecutor({
              url,
              timeout: 2000,
            });
            /*
              Support custom SDL Query - if remote schema has a custom SDL export resolver for full typeDefs including custom directives then allow users to register endpoints from results from that instead of introspectSchema
            */
            const { data } = await executor({ document: sdlQuery });
            // debugger;
            const sdl = printSchema(buildClientSchema(data));
            const transforms: Array<Function> = [];
            // prefixing API's
            if (prefix) {
              transforms.push(
                new RenameTypes(
                  (name: string) =>
                    `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}${name}`
                ),
                new RenameRootFields(
                  (op: any, name: string) =>
                    `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`
                )
              );
            }

            return {
              transforms,
              url,
              sdl,
            };
          } catch (err) {
            //TODO return cached version on schema or drop based of configuration strategy
            // Metrics ??
            // debugger;
            console.error(err);
            // unregister endpoint
            // this.endpoints = [
            //   ...this.endpoints.filter(
            //     (endpoint) => endpoint.url !== url && endpoint.prefix !== prefix
            //   ),
            // ];
          }
        }
      )
    );

    this.loadedEndpoints = loadedEndpoints.filter(Boolean);
    this.schema = this.buildSchema(this.loadedEndpoints);

    console.info(
      `gateway reload ${new Date(Date.now()).toUTCString()}, endpoints: ${
        this.loadedEndpoints.length
      }`
    );

    return this.schema;
  }

  autoRefresh(interval = 3000) {
    this.stopAutoRefresh();
    this.intervalId = setTimeout(async () => {
      await this.reload();
      this.intervalId = undefined;
      this.autoRefresh(interval);
    }, interval);
  }

  stopAutoRefresh() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}
