import { Field, Float, ID, Int, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../services/users/user.entity';
import { Application } from './application.entity';
import { Service } from './service.entity';

@ObjectType()
@Entity('request_latencies')
@Index(['serviceId', 'applicationId', 'date']) // Query performance for service-app analysis
@Index(['applicationId', 'userId', 'date']) // Query performance for user-app analysis
@Index(['serviceId', 'date']) // Query performance for service analysis
@Index(['latencyMs']) // Query performance for latency threshold queries
export class RequestLatency {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Index()
  @Column()
  serviceId: string;

  @Field()
  @Index()
  @Column()
  applicationId: string;

  @Field({ nullable: true })
  @Index()
  @Column({ nullable: true })
  userId?: string;

  @Field(() => Service)
  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Field(() => Application)
  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: Application;

  @Field(() => User, { nullable: true })
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Field({ description: 'GraphQL operation name or "anonymous"' })
  @Column()
  @Index()
  operationName: string;

  @Field({ description: 'Operation type: query, mutation, subscription' })
  @Column()
  @Index()
  operationType: string;

  @Field(() => Float, { description: 'Request duration in milliseconds' })
  @Column({ type: 'float' })
  @Index()
  latencyMs: number;

  @Field({ description: 'Whether the request had errors' })
  @Column({ default: false })
  @Index()
  hasErrors: boolean;

  @Field({ description: 'HTTP status code or GraphQL-derived status' })
  @Column({ type: 'smallint', default: 200 })
  @Index()
  statusCode: number;

  @Field({ nullable: true, description: 'Client IP address for geographic analysis' })
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Field({ nullable: true, description: 'User agent for client analysis' })
  @Column({ type: 'text', nullable: true })
  userAgent?: string;

  @Field({ nullable: true, description: 'Session or request correlation ID' })
  @Column({ type: 'varchar', length: 128, nullable: true })
  @Index()
  correlationId?: string;

  @Field({ description: 'UTC date bucket (YYYY-MM-DD) for time-series analysis' })
  @Column({ type: 'date' })
  @Index()
  date: string;

  @Field({ description: 'Hour bucket (0-23) for intra-day analysis' })
  @Column({ type: 'smallint' })
  @Index()
  hour: number;

  @Field(() => Int, { nullable: true, description: 'Size of request body in bytes' })
  @Column({ type: 'int', nullable: true })
  requestSizeBytes?: number;

  @Field(() => Int, { nullable: true, description: 'Size of response body in bytes' })
  @Column({ type: 'int', nullable: true })
  responseSizeBytes?: number;

  @Field({ description: 'Authentication method used' })
  @Column({ default: 'unknown' })
  @Index()
  authType: string;

  @Field({ description: 'Type of latency measurement: gateway_operation or downstream_service' })
  @Column({ default: 'gateway_operation' })
  @Index()
  latencyType: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
