import { execSync } from 'node:child_process';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { dataSource } from '../db/datasource';

let pg: StartedTestContainer | null = null;
let redis: StartedTestContainer | null = null;
let initialized = false;

export async function initTestContainers() {
  if (initialized) return { pg, redis };
  pg = await new GenericContainer('postgres:15')
    .withEnvironment({ POSTGRES_DB: 'gateway_test', POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test' })
    .withExposedPorts(5432)
    .start();
  redis = await new GenericContainer('redis:7').withExposedPorts(6379).start();
  const pgPort = pg.getMappedPort(5432);
  process.env.DATABASE_URL = `postgres://test:test@127.0.0.1:${pgPort}/gateway_test`;
  const redisPort = redis.getMappedPort(6379);
  process.env.REDIS_URL = `redis://127.0.0.1:${redisPort}/1`;
  // Re-initialize datasource if already initialized with previous URL
  if (dataSource.isInitialized) await dataSource.destroy();
  await dataSource.initialize();
  // Run migrations for clean schema
  try {
    execSync('npm run migration:run', { stdio: 'inherit', cwd: process.cwd() });
  } catch {
    // ignore for now
  }
  initialized = true;
  return { pg, redis };
}

export async function resetDatabase() {
  if (!dataSource.isInitialized) return;
  // Drop all tables (cascade) then re-run migrations
  const queryRunner = dataSource.createQueryRunner();
  try {
    const tables = (await queryRunner.getTables()).map((t) => `"${t.name}"`).join(',');
    if (tables.length) await queryRunner.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await queryRunner.release();
  }
}

export async function shutdownTestContainers() {
  if (dataSource.isInitialized) await dataSource.destroy();
  if (pg) await pg.stop();
  if (redis) await redis.stop();
  initialized = false;
  pg = null;
  redis = null;
}
