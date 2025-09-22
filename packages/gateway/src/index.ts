import 'reflect-metadata';
// This file now only starts the server. Telemetry is initialized from src/telemetry.ts before this file is imported.
import { startServer } from './gateway';
import { log } from './utils/logger';
import { startApiKeyUsageConsolidator, stopApiKeyUsageConsolidator } from './workers/api-key-usage-consolidator';

let stopWorker: (() => void) | null = null;

async function bootstrap() {
  // Start server
  await startServer();

  // In dev, start the API key usage worker inside main process unless disabled by env
  const isDev = process.env.NODE_ENV !== 'production';
  const shouldStartWorker = process.env.START_API_KEY_USAGE_WORKER !== '0';
  if (isDev && shouldStartWorker) {
    try {
      stopWorker = await startApiKeyUsageConsolidator();
      log.info('Started API key usage consolidator (in-process)');
    } catch (err) {
      log.error({ err }, 'Failed to start API key usage consolidator');
    }
  }
}

bootstrap().catch((e) => {
  log.error(e);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  if (stopWorker) stopWorker();
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (stopWorker) stopWorker();
  process.exit(0);
});
