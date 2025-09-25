import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import 'reflect-metadata';
import { createDatabaseIfNotExists } from './create-database';
import { dataSource } from './datasource';

function loadEnv() {
  if (process.env.NODE_ENV === 'test') return; // do not load local env in tests
  const root = path.resolve(__dirname, '..', '..');
  const envLocal = path.join(root, '.env.local');
  const env = path.join(root, '.env');
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  if (fs.existsSync(env)) dotenv.config({ path: env });
}

export type EnsureAdminResult =
  | { created: true; existed: false; email: string }
  | { created: false; existed: true; email: string }
  | { created: false; existed: false; reason: 'missing-env' | 'error' };

/**
 * Ensure an initial admin user exists using ADMIN_EMAIL and ADMIN_PASSWORD.
 * - Does not exit the process.
 * - Does not load .env files unless opts.loadEnv is true.
 * - Does not create DB or run migrations; assumes schema exists.
 * - Reuses existing DataSource if initialized; otherwise initializes and cleans up.
 */
export async function ensureInitialAdmin(opts?: {
  loadEnv?: boolean;
  bcryptSaltRounds?: number;
}): Promise<EnsureAdminResult> {
  try {
    if (opts?.loadEnv) loadEnv();

    const email = (process.env.ADMIN_EMAIL || '').trim();
    const password = (process.env.ADMIN_PASSWORD || '').trim();
    if (!email || !password) {
      return { created: false, existed: false, reason: 'missing-env' };
    }

    const manageDs = !dataSource.isInitialized;
    if (manageDs) {
      await dataSource.initialize();
    }

    try {
      const exists = await dataSource.query(
        'SELECT 1 FROM "user" WHERE email = $1 LIMIT 1',
        [email]
      );
      if (exists.length) {
        return { created: false, existed: true, email };
      }
      const rounds = Math.max(4, opts?.bcryptSaltRounds ?? 12);
      const hash = await bcrypt.hash(password, rounds);
      await dataSource.query(
        `INSERT INTO "user" (email, password, permissions, "isEmailVerified", "failedLoginAttempts", "createdAt", "updatedAt")
         VALUES ($1, $2, 'admin,user', true, 0, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [email, hash]
      );
      return { created: true, existed: false, email };
    } finally {
      if (manageDs && dataSource.isInitialized) await dataSource.destroy();
    }
  } catch (e) {
    // Log but do not throw in embedded usage
    console.warn('ensureInitialAdmin failed:', e);
    return { created: false, existed: false, reason: 'error' };
  }
}

async function cliEnsureAdmin() {
  loadEnv();
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    'postgres://postgres:password@localhost:5432/gateway';
  // Ensure database exists
  await createDatabaseIfNotExists(dbUrl);

  // Initialize and run migrations then seed admin
  await dataSource.initialize();
  try {
    try {
      await dataSource.runMigrations();
    } catch (e) {
      console.warn(
        'Warning: failed to run migrations automatically in seed script:',
        e
      );
    }
    const result = await ensureInitialAdmin();
    if (result.created) {
      console.log(`✅ Created initial admin user: ${result.email}`);
    } else if (result.existed) {
      console.log(`Admin user already exists: ${result.email}`);
    } else if ('reason' in result && result.reason === 'missing-env') {
      console.error(
        'ADMIN_EMAIL or ADMIN_PASSWORD is missing. Set them in .env.local or environment.'
      );
      process.exit(1);
    } else {
      console.error('Failed to ensure admin user.');
      process.exit(1);
    }
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

if (require.main === module) {
  cliEnsureAdmin().catch((e) => {
    console.error('Failed to ensure admin user:', e);
    process.exit(1);
  });
}
