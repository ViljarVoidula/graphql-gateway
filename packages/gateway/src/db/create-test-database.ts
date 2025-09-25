import { Client } from 'pg';

async function createTestDatabase() {
  // Connect to postgres default database to create the test database
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password',
    database: 'postgres', // Connect to default postgres database
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    // Create the test database if it doesn't exist
    const createDbQuery = `
      SELECT 1 FROM pg_database WHERE datname = 'gateway_test';
    `;
    const result = await client.query(createDbQuery);

    if (result.rows.length === 0) {
      console.log('Creating gateway_test database...');
      await client.query('CREATE DATABASE gateway_test;');
      console.log('✅ Test database created successfully');
    } else {
      console.log('✅ Test database already exists');
    }
  } catch (error) {
    console.error('❌ Error creating test database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createTestDatabase();
