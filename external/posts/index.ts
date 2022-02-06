import http from 'http';
import ws from 'ws';
import express from 'express';
import { graphqlHTTP } from 'express-graphql';
import { useServer } from 'graphql-ws/lib/use/ws';
import { execute, subscribe } from 'graphql';
import schema from './schema';

const app = express();
app.use('/graphql', graphqlHTTP({ schema, graphiql: true }));

// builds a websocket server
// see https://github.com/enisdenjo/graphql-ws#express
const server = http.createServer(app);
const wsServer = new ws.Server({ server, path: '/graphql' });

server.listen(4001, () => {
  useServer({ schema, execute, subscribe }, wsServer);
  console.info('posts running at http://localhost:4001/graphql');
});
