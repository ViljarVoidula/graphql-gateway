import { GraphQLJSONObject } from 'graphql-scalars';
import { Field, ID, ObjectType, registerEnumType } from 'type-graphql';
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
import { Service } from './service.entity';

export enum PermissionOperationType {
  QUERY = 'QUERY',
  MUTATION = 'MUTATION',
  SUBSCRIPTION = 'SUBSCRIPTION',
}

registerEnumType(PermissionOperationType, {
  name: 'PermissionOperationType',
});

export enum PermissionAccessLevel {
  READ = 'read',
  WRITE = 'write',
  SUBSCRIBE = 'subscribe',
  ADMIN = 'admin',
}

registerEnumType(PermissionAccessLevel, {
  name: 'PermissionAccessLevel',
});

@ObjectType()
@Entity('service_permissions')
@Index(['serviceId', 'operationType', 'operationName', 'fieldPath'], {
  unique: true,
})
export class ServicePermission {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field(() => Service)
  @ManyToOne(() => Service, (service) => service.permissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'serviceId' })
  service!: Service;

  @Column()
  serviceId!: string;

  @Field(() => PermissionOperationType)
  @Column({ type: 'enum', enum: PermissionOperationType })
  operationType!: PermissionOperationType;

  @Field()
  @Column()
  operationName!: string;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  fieldPath?: string | null;

  @Field()
  @Column({ unique: true })
  permissionKey!: string;

  @Field(() => PermissionAccessLevel)
  @Column({ type: 'enum', enum: PermissionAccessLevel })
  accessLevel!: PermissionAccessLevel;

  @Field(() => GraphQLJSONObject, { nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Field()
  @Column({ default: true })
  active!: boolean;

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
