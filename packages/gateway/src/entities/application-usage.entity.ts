import { Field, ID, Int, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Application } from './application.entity';
import { Service } from './service.entity';

@ObjectType()
@Entity('application_usage')
@Unique('uq_app_service_date', ['applicationId', 'serviceId', 'date'])
export class ApplicationUsage {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Index()
  @Column()
  applicationId: string;

  @Field()
  @Index()
  @Column()
  serviceId: string;

  @Field(() => Application)
  @ManyToOne(() => Application, (app) => app.usageRecords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: Application;

  @Field(() => Service)
  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Field({ description: 'UTC date bucket (YYYY-MM-DD)' })
  @Column({ type: 'date' })
  date: string;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  requestCount: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  errorCount: number;

  @Field(() => Int)
  @Column({ type: 'int', default: 0 })
  rateLimitExceededCount: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;
}
