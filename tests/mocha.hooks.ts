import app from '../src/app';
import { once } from 'events';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mochaHooks = {
  async beforeAll() {
    const server = app.listen(4001, 'localhost');
    await once(server, 'listening');

    // simple delay to avoid starting tests before service routes are running
    await delay(1000);
  },
};
