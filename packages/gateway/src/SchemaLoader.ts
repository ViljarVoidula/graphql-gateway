import { buildClientSchema, getIntrospectionQuery, GraphQLSchema, printSchema, parse, IntrospectionQuery, ExecutionResult } from 'graphql';
import { buildHMACExecutor } from './utils/hmacExecutor';
import { isAsyncIterable } from '@graphql-tools/utils';

interface LoadedEndpoint {
  url: string;
  sdl: string;
}

export class SchemaLoader {
  public schema: GraphQLSchema | null = null;
  public loadedEndpoints: LoadedEndpoint[] = [];
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private buildSchema: (endpoints: LoadedEndpoint[]) => GraphQLSchema,
    public endpoints: string[],
  ) {}

  async reload() {
    const loadedEndpoints: LoadedEndpoint[] = [];
    await Promise.all(
      this.endpoints.map(async url => {
        console.debug(`Loading schema from ${url}`);
        try {
          console.debug(`Fetching SDL from ${url}`);
          const introspectionQuery = getIntrospectionQuery();
          const executor = buildHMACExecutor({ endpoint: url, timeout: 1500, enableHMAC: false });
          const maybeResult = await executor({ document: parse(introspectionQuery) });
          let result: ExecutionResult<IntrospectionQuery>;
          if (isAsyncIterable(maybeResult)) {
            const iterator = maybeResult[Symbol.asyncIterator]();
            const { value } = await iterator.next();
            result = value as ExecutionResult<IntrospectionQuery>;
          } else {
            result = maybeResult as ExecutionResult<IntrospectionQuery>;
          }
          const data = result.data;
          if (!data || !data.__schema) {
            
            throw new Error(`Invalid SDL response from ${url}`);
          }
          
          const sdl = printSchema(buildClientSchema(data));
          loadedEndpoints.push({ url, sdl });
        } catch (err) {
          console.error(`Failed to load schema from ${url}:`, err);
          // drop the schema, or return the last cached version, etc...
        }
      }),
    );

    this.loadedEndpoints = loadedEndpoints;
    this.schema = this.buildSchema(this.loadedEndpoints);
    console.log(
      `gateway reload ${new Date().toLocaleString()}, endpoints: ${this.loadedEndpoints.length}`,
    );
    return this.schema;
  }

  autoRefresh(interval = 3000) {
    this.stopAutoRefresh();
    this.intervalId = setTimeout(async () => {
      console.debug(`Refreshing schema every ${interval}ms`);
      await this.reload();
      this.intervalId = null;
      this.autoRefresh(interval);
    }, interval);
  }

  stopAutoRefresh() {
    if (this.intervalId != null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
