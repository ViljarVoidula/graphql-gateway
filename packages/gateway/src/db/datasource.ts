import * as TypeORM from "typeorm";
import { User } from "../services/users/user.entity";
import { Session } from "../entities/session.entity";
import { Service } from "../entities/service.entity";
import { ServiceKey } from "../entities/service-key.entity";

// Create TypeORM dataSource
export const dataSource = new TypeORM.DataSource({
  type: "postgres",
  // FIXME! Load from environment variables or config
  url: process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/gateway',
  synchronize: process.env.NODE_ENV !== 'production',
  // FIXME! Load from environment variables or config
  dropSchema: true, //?? process.env.NODE_ENV === 'development',
  cache: true,
// FIXME! Load from environment variables or config
  logging: process.env.NODE_ENV === 'development' ? "all" : ["error"],
  entities: [User, Session, Service, ServiceKey],
  logger: "advanced-console",
});