// This is the new main entry point for the application.
// It initializes telemetry BEFORE loading any other application code.
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Load .env files before anything else (skip local in test)
if (process.env.NODE_ENV !== 'test') {
  dotenvConfig({ path: path.join(__dirname, '..', '.env.local') });
}
dotenvConfig();

import { initializeTelemetry } from './utils/telemetry/opentelemetry';

async function main() {
  // Initialize telemetry and wait for it to be ready
  await initializeTelemetry();

  // Now that telemetry is initialized, dynamically import and start the server.
  // This ensures all instrumentations are applied before modules are loaded.
  const { startServer } = await import('./gateway');
  const { log } = await import('./utils/logger');

  startServer().catch((e) => {
    log.error('Failed to start server', { error: e });
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Critical error during application startup', err);
  process.exit(1);
});
