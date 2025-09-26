import { Field, ObjectType } from 'type-graphql';
import { PermissionTemplate } from '../../entities/permission-template.entity';
import {
  PermissionAccessLevel,
  PermissionOperationType,
  ServicePermission,
} from '../../entities/service-permission.entity';
import { UserServiceRole } from '../../entities/user-service-role.entity';

@ObjectType()
export class PermissionClaim {
  @Field()
  key!: string;

  @Field(() => PermissionOperationType)
  operationType!: PermissionOperationType;

  @Field()
  operationName!: string;

  @Field({ nullable: true })
  fieldPath?: string | null;

  @Field(() => PermissionAccessLevel)
  accessLevel!: PermissionAccessLevel;

  @Field()
  serviceId!: string;

  @Field({ nullable: true })
  serviceName?: string | null;
}

@ObjectType()
export class PermissionProfile {
  @Field()
  userId!: string;

  @Field(() => [String])
  basePermissions!: string[];

  @Field(() => [PermissionClaim])
  claims!: PermissionClaim[];

  @Field(() => [UserServiceRole])
  roles!: UserServiceRole[];

  @Field(() => [PermissionTemplate])
  templates!: PermissionTemplate[];

  @Field()
  refreshedAt!: Date;

  @Field()
  isAdmin!: boolean;
}

export interface OperationDescriptor {
  operationType: PermissionOperationType;
  operationName: string;
  fieldPath?: string | null;
  accessLevel: PermissionAccessLevel;
  serviceId: string;
  serviceName?: string | null;
}

export type PermissionClaimEntry = {
  key: string;
  servicePermission: ServicePermission;
};
