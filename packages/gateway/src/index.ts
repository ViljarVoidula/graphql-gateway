import 'reflect-metadata';
// This file now only starts the server. Telemetry is initialized from src/telemetry.ts before this file is imported.
import { startServer } from './gateway';
import { log } from './utils/logger';

startServer().catch((e) => {
  log.error(e);
  process.exit(1);
});
