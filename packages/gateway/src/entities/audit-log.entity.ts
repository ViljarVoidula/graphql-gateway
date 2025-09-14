import { GraphQLJSON } from 'graphql-scalars';
import { Field, ID, ObjectType, registerEnumType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../services/users/user.entity';
import { Application } from './application.entity';

export enum AuditEventType {
  API_REQUEST = 'api_request',
  USER_LOGIN = 'user_login',
  APPLICATION_CREATED = 'application_created',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked'
}

export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  CONFIGURATION = 'configuration',
  SECURITY = 'security',
  DATA_ACCESS = 'data_access',
  SYSTEM = 'system'
}

export enum AuditSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

registerEnumType(AuditCategory, { name: 'AuditCategory' });
registerEnumType(AuditSeverity, { name: 'AuditSeverity' });

registerEnumType(AuditEventType, { name: 'AuditEventType' });

@ObjectType()
@Entity('audit_logs')
export class AuditLog {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field(() => AuditEventType)
  @Column({ type: 'enum', enum: AuditEventType })
  @Index()
  eventType: AuditEventType;

  @Field({ nullable: true })
  @Column({ nullable: true })
  applicationId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  userId?: string;

  @Field(() => Application, { nullable: true })
  @ManyToOne(() => Application, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application?: Application;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Field(() => GraphQLJSON, { description: 'Arbitrary JSON metadata associated with the event' })
  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  // Extended compliance/security fields (all nullable for backward compatibility)
  @Field(() => AuditCategory, { nullable: true })
  @Column({ type: 'enum', enum: AuditCategory, nullable: true })
  @Index()
  category?: AuditCategory;

  @Field(() => AuditSeverity, { nullable: true })
  @Column({ type: 'enum', enum: AuditSeverity, nullable: true })
  @Index()
  severity?: AuditSeverity;

  @Field({ nullable: true, description: 'Normalized action verb (e.g. create, update, delete, login)' })
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index()
  action?: string;

  @Field({ nullable: true, description: 'Whether the action succeeded' })
  @Column({ type: 'boolean', nullable: true })
  success?: boolean;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  @Index()
  sessionId?: string; // can store either uuid or random session token

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index()
  correlationId?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  @Index()
  resourceType?: string;

  @Field({ nullable: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  @Index()
  resourceId?: string;

  @Field({ nullable: true, description: 'Numeric risk score (0-100) used for alerting heuristics' })
  @Column({ type: 'smallint', nullable: true })
  @Index()
  riskScore?: number;

  @Field({ nullable: true, description: 'Timestamp when this log becomes eligible for deletion (retention boundary)' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  @Index()
  retentionUntil?: Date;

  @Field(() => [String], { nullable: true, description: 'Searchable tag labels' })
  @Column({ type: 'text', array: true, nullable: true })
  tags?: string[];

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
