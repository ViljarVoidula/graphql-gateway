import { Field, ID, ObjectType, registerEnumType } from 'type-graphql';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserServiceRole } from './user-service-role.entity';

export enum PermissionTemplateScope {
  GLOBAL = 'global',
  SERVICE = 'service',
}

registerEnumType(PermissionTemplateScope, {
  name: 'PermissionTemplateScope',
});

@ObjectType()
@Entity('permission_templates')
@Index(['scope', 'serviceId', 'roleKey'], { unique: true })
export class PermissionTemplate {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Field()
  @Column()
  name!: string;

  @Field()
  @Column()
  roleKey!: string;

  @Field(() => PermissionTemplateScope)
  @Column({ type: 'enum', enum: PermissionTemplateScope })
  scope!: PermissionTemplateScope;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true })
  serviceId?: string | null;

  @Field(() => String, { nullable: true })
  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Field(() => [String])
  @Column('text', { array: true, default: '{}' })
  permissions!: string[];

  @Field(() => [String], { nullable: true })
  @Column('text', { array: true, default: '{}', nullable: true })
  tags?: string[] | null;

  @Field(() => [UserServiceRole])
  @OneToMany(() => UserServiceRole, (role) => role.template)
  assignedRoles!: UserServiceRole[];

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt!: Date;
}
