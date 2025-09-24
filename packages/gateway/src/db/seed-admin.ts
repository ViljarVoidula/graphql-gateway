import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import 'reflect-metadata';
import { createDatabaseIfNotExists } from './create-database';
import { dataSource } from './datasource';

function loadEnv() {
  const root = path.resolve(__dirname, '..', '..');
  const envLocal = path.join(root, '.env.local');
  const env = path.join(root, '.env');
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  if (fs.existsSync(env)) dotenv.config({ path: env });
}

async function ensureAdmin() {
  loadEnv();
  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgres://postgres:password@localhost:5432/gateway';
  // Ensure database exists
  await createDatabaseIfNotExists(dbUrl);
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = (process.env.ADMIN_PASSWORD || '').trim();
  if (!email || !password) {
    console.error('ADMIN_EMAIL or ADMIN_PASSWORD is missing. Set them in .env.local or environment.');
    process.exit(1);
  }

  await dataSource.initialize();
  // Apply pending migrations to ensure schema exists
  try {
    await dataSource.runMigrations();
  } catch (e) {
    console.warn('Warning: failed to run migrations automatically in seed script:', e);
  }
  try {
    const exists = await dataSource.query('SELECT 1 FROM "user" WHERE email = $1 LIMIT 1', [email]);
    if (exists.length) {
      console.log(`Admin user already exists: ${email}`);
      return;
    }
    const hash = await bcrypt.hash(password, 12);
    await dataSource.query(
      `INSERT INTO "user" (email, password, permissions, "isEmailVerified", "failedLoginAttempts", "createdAt", "updatedAt")
       VALUES ($1, $2, 'admin,user', true, 0, NOW(), NOW())
       ON CONFLICT (email) DO NOTHING`,
      [email, hash]
    );
    console.log(`✅ Created initial admin user: ${email}`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

if (require.main === module) {
  ensureAdmin().catch((e) => {
    console.error('Failed to ensure admin user:', e);
    process.exit(1);
  });
}
