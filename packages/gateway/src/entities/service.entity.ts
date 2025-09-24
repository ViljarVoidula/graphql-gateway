import { Field, ID, ObjectType, registerEnumType } from 'type-graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { User } from '../services/users/user.entity';

export enum ServiceStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance'
}

registerEnumType(ServiceStatus, { name: 'ServiceStatus' });

export enum SubscriptionTransport {
  AUTO = 'auto',
  SSE = 'sse',
  WS = 'ws'
}

registerEnumType(SubscriptionTransport, { name: 'SubscriptionTransport' });

@ObjectType()
@Entity('services')
export class Service {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ unique: true })
  @Index()
  name: string;

  @Field()
  @Column()
  url: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  description?: string;

  @Field(() => ServiceStatus)
  @Column({ type: 'enum', enum: ServiceStatus, default: ServiceStatus.ACTIVE })
  status: ServiceStatus;

  @Field({ nullable: true })
  @Column({ nullable: true })
  version?: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  sdl?: string;

  @Field()
  @Column({ default: true })
  enableHMAC: boolean;

  @Field()
  @Column({ default: 5000 })
  timeout: number;

  @Field()
  @Column({ default: true })
  enableBatching: boolean;

  @Field()
  @Column({ default: false })
  useMsgPack: boolean;

  @Field()
  @Column({ default: true })
  @Index()
  externally_accessible: boolean; // Gateway admins control this

  @Field(() => User)
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  @Index()
  ownerId: string;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field(() => [ID]) // Expose as array of IDs for GraphQL to avoid circular import issues
  @OneToMany('ServiceKey', 'service')
  keys: any[];

  // Subscription transport config for downstream services
  @Field(() => SubscriptionTransport)
  @Column({ type: 'varchar', default: SubscriptionTransport.AUTO })
  subscriptionTransport: SubscriptionTransport;

  // Optional custom subscription path (e.g., '/graphql/stream' or '/ws')
  @Field({ nullable: true })
  @Column({ type: 'varchar', nullable: true })
  subscriptionPath?: string | null;
}
