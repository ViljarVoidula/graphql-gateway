import { Field, ID, Int, ObjectType } from 'type-graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn
} from 'typeorm';
import { Application } from './application.entity';
import { Service } from './service.entity';

@ObjectType()
@Entity('application_service_rate_limits')
@Unique('uq_app_service_limit', ['applicationId', 'serviceId'])
export class ApplicationServiceRateLimit {
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

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  perMinute?: number | null;

  @Field(() => Int, { nullable: true })
  @Column({ type: 'int', nullable: true })
  perDay?: number | null;

  @Field()
  @Column({ default: false })
  disabled: boolean;

  @ManyToOne(() => Application, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'applicationId' })
  application: Application;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
