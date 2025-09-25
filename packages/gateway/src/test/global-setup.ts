/**
 * Global test setup that runs once before all tests
 * Handles database migration and initialization to avoid running migrations in each test file
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { dataSource } from '../db/datasource';

// Load test environment variables
if (process.env.NODE_ENV === 'test') {
  const envPath = path.resolve(__dirname, '../../.env.test');
  dotenv.config({ path: envPath });
  // Force in-memory Redis for tests unless explicitly overridden
  if (!process.env.USE_IN_MEMORY_REDIS) process.env.USE_IN_MEMORY_REDIS = '1';
}

export async function globalSetup(): Promise<void> {
  // Minimal logs in CI for speed

  try {
    // Initialize the database connection
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    // Ensure test database exists and is clean
    try {
      // Drop all database objects completely
      await dataSource.query(`
        DO $$ DECLARE
          r RECORD;
        BEGIN
          -- Drop all tables
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
          
          -- Drop all sequences
          FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
            EXECUTE 'DROP SEQUENCE IF EXISTS ' || quote_ident(r.sequence_name) || ' CASCADE';
          END LOOP;
          
          -- Drop all functions
          FOR r IN (SELECT proname, oidvectortypes(proargtypes) as argtypes FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public') LOOP
            EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE';
          END LOOP;
          
          -- Drop all types
          FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND typtype = 'c') LOOP
            EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
          END LOOP;
        END $$;
      `);
    } catch (cleanError) {
      await dataSource.dropDatabase();
    }

    // Run all migrations from scratch
    await dataSource.runMigrations({ transaction: 'all' });
    // Keep the connection open for tests to reuse
  } catch (error) {
    console.error('Global test setup failed:', error);

    // Try to clean up connection on failure
    if (dataSource.isInitialized) {
      try {
        await dataSource.destroy();
      } catch (cleanupError) {
        console.error('Failed to cleanup connection:', cleanupError);
      }
    }
    throw error;
  }
}

export async function globalTeardown(): Promise<void> {
  try {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  } catch (error) {
    console.error('Global test cleanup failed:', error);
    throw error;
  }
}

// Support for different test runners
if (require.main === module) {
  globalSetup()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Global setup script failed:', error);
      process.exit(1);
    });
}
