import { Field, ID, Int, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { ApiKey } from './api-key.entity';
import { Application } from './application.entity';
import { Service } from './service.entity';

@ObjectType()
@Entity('api_key_usage')
@Unique('uq_api_key_usage_per_day', ['apiKeyId', 'serviceId', 'date'])
export class ApiKeyUsage {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => ID)
  @Index()
  @Column()
  apiKeyId!: string;

  @Field(() => ID)
  @Index()
  @Column()
  applicationId!: string;

  @Field(() => ID, { nullable: true })
  @Index()
  @Column({ nullable: true })
  serviceId!: string | null;

  @ManyToOne(() => ApiKey, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'apiKeyId' })
  apiKey!: ApiKey;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application!: Application;

  @ManyToOne(() => Service, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'serviceId' })
  service!: Service | null;

  @Field({ description: 'UTC date bucket (YYYY-MM-DD)' })
  @Column({ type: 'date' })
  @Index()
  date!: string;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  requestCount!: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  errorCount!: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  rateLimitExceededCount!: number;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;
}
