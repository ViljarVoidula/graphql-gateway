import { Field, ID, ObjectType } from 'type-graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../services/users/user.entity';
import { PermissionTemplate } from './permission-template.entity';
import { Service } from './service.entity';

@ObjectType()
@Entity('user_service_roles')
@Index(['userId', 'serviceId', 'roleKey'], { unique: true })
export class UserServiceRole {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => User)
  @ManyToOne(() => User, (user) => user.serviceRoles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: string;

  @Field(() => Service, { nullable: true })
  @ManyToOne(() => Service, (service) => service.userRoles, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'serviceId' })
  service?: Service | null;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  serviceId?: string | null;

  @Field()
  @Column()
  roleKey!: string;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  roleNamespace?: string | null;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  displayName?: string | null;

  @Field(() => [String])
  @Column('text', { array: true, default: '{}' })
  permissions!: string[];

  @Field(() => PermissionTemplate, { nullable: true })
  @ManyToOne(() => PermissionTemplate, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'templateId' })
  template?: PermissionTemplate | null;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  templateId?: string | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Field(() => Date, { nullable: true })
  @Column({ type: 'timestamptz', nullable: true })
  archivedAt?: Date | null;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
