import app from '../src/app';
import { once } from 'events';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mochaHooks = {
  async beforeAll() {
    this.server = app.listen(4001, 'localhost');
    await once(this.server, 'listening');
    // simple delay to avoid starting tests before service routes are running
    await delay(1000);
  },
  async afterAll() {
    this.server.close();
  },
};
