import app from './app';
import { WebSocketServer } from 'ws';
const port: number = 3001;

/*
 * Server entrypoint
 */

const server = app.listen(port, () => {
  const wsServer = new WebSocketServer({
    server,
    path: '/graphql',
  });
  // setting wsServer as property to access it in middleware
  app.wsServer = wsServer;
  console.info(`App is listening on port ${port} !`);
});
