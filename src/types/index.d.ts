import { GraphQLSchema, Source } from 'graphql';
import { Application } from 'express';
import { WebSocketServer } from 'ws';

export = Gateway;

declare namespace Gateway {
  type SchemaLoader = {
    endpoints: Array<Endpoint>;
    buildSchema: GraphQLSchema;
    loadedEndpoints: Array<void> | Array<Function>;
    schema?: GraphQLSchema;
    intervalId?: NodeJS.Timeout | undefined;
  };

  interface App extends Application {
    schema?: GraphQLSchema;
    wsServer?: WebSocketServer;
  }

  interface Endpoint {
    url: string;
    transforms?: Array<Function>;
    sdl?: string | Source;
    prefix?: string;
    sdlQuery?: string;
    merge?: any;
  }

  interface LoaderContext {
    buildSchema: Function;
    endpoints: Array<Endpoint>;
  }
}
