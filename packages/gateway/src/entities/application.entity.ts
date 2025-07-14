import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index, ManyToMany, JoinTable } from 'typeorm';
import { Field, ObjectType, ID } from 'type-graphql';
import { User } from '../services/users/user.entity';
import { Service } from './service.entity';
import { ApiKey } from './api-key.entity';

@ObjectType()
@Entity('applications')
export class Application {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column()
  @Index()
  name: string;

  @Field({ nullable: true })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @Field(() => User)
  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @Column()
  @Index()
  ownerId: string;

  @Field(() => [ApiKey])
  @OneToMany(() => ApiKey, apiKey => apiKey.application)
  apiKeys: ApiKey[];

  @Field(() => [Service])
  @ManyToMany(() => Service, { cascade: true })
  @JoinTable({
    name: 'application_whitelisted_services',
    joinColumn: { name: 'applicationId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'serviceId', referencedColumnName: 'id' },
  })
  whitelistedServices: Service[]; // Application owners select from externally_accessible services

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
