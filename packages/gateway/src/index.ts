import { startServer } from './gateway';
import { log } from './utils/logger';

startServer().catch(e => {
  log.error(e);
  process.exit(1);
});
