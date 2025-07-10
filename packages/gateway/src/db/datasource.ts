import * as TypeORM from "typeorm";

// Create TypeORM dataSource
export const dataSource = new TypeORM.DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: true,
  dropSchema: true,
  cache: true,
  logging: "all",
  entities: [],
  logger: "advanced-console",
});