import { Client } from 'pg';
import { parse } from 'url';

/**
 * Creates the database if it doesn't exist
 * @param databaseUrl The full database URL (e.g., postgres://user:pass@host:port/dbname)
 */
export async function createDatabaseIfNotExists(databaseUrl: string): Promise<void> {
  const parsedUrl = parse(databaseUrl);

  if (!parsedUrl.pathname) {
    throw new Error('Invalid database URL: missing database name');
  }

  const databaseName = parsedUrl.pathname.slice(1); // Remove leading slash

  // Create connection URL without database name (connects to default postgres database)
  const adminUrl = databaseUrl.replace(`/${databaseName}`, '/postgres');

  const client = new Client(adminUrl);

  try {
    await client.connect();
    console.log('Connected to PostgreSQL server');

    // Check if database exists
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);

    if (result.rows.length === 0) {
      // Database doesn't exist, create it
      console.log(`Creating database "${databaseName}"...`);

      // Note: We can't use parameterized queries for database names in CREATE DATABASE
      // So we need to escape the database name properly
      const escapedDbName = databaseName.replace(/[^a-zA-Z0-9_]/g, '');
      if (escapedDbName !== databaseName) {
        throw new Error(`Invalid database name: ${databaseName}. Only alphanumeric characters and underscores are allowed.`);
      }

      await client.query(`CREATE DATABASE "${escapedDbName}"`);
      console.log(`✅ Database "${databaseName}" created successfully`);
    } else {
      console.log(`✅ Database "${databaseName}" already exists`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error creating database:', error.message);
      throw error;
    }
    throw new Error('Unknown error occurred while creating database');
  } finally {
    await client.end();
  }
}

/**
 * CLI script to create database
 */
async function main() {
  const databaseUrl =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgres://postgres:password@localhost:5432/gateway';

  console.log('Using database URL:', databaseUrl.replace(/:[^:@]*@/, ':***@')); // Hide password in logs

  try {
    await createDatabaseIfNotExists(databaseUrl);
    console.log('Database initialization completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
}

// Run as CLI script if called directly
if (require.main === module) {
  main();
}
