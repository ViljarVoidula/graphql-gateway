import { Field, ID, ObjectType, registerEnumType } from 'type-graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { Application } from './application.entity';

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired'
}

registerEnumType(ApiKeyStatus, { name: 'ApiKeyStatus' });

@ObjectType()
@Entity('api_keys')
export class ApiKey {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ length: 12 })
  @Index()
  keyPrefix: string; // For identification, e.g., "app_12345678"

  @Column({ unique: true })
  @Index()
  hashedKey: string; // Store a hash of the key, not the key itself

  @Field(() => ApiKeyStatus)
  @Column({ type: 'enum', enum: ApiKeyStatus, default: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  @Field()
  @Column({ default: '' })
  name: string; // Human-readable name for the key

  @Field(() => [String])
  @Column('simple-array', { default: '' })
  scopes: string[]; // Define what this key can access

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;

  @Field({ nullable: true })
  @Column({ nullable: true })
  expiresAt?: Date;

  @Field({ nullable: true })
  @Column({ nullable: true })
  lastUsedAt?: Date;

  @Field(() => Application)
  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: Application;

  @Field(() => ID)
  @Column()
  applicationId: string;
}
