import { GraphQLJSONObject } from 'graphql-scalars';
import 'reflect-metadata';
import {
  Field,
  ID,
  InputType,
  ObjectType,
  registerEnumType,
} from 'type-graphql';

export enum MessageSeverity {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

registerEnumType(MessageSeverity, { name: 'MessageSeverity' });

@ObjectType()
export class GatewayMessage {
  @Field(() => ID)
  id: string;

  @Field()
  topic: string;

  @Field({ nullable: true })
  type?: string;

  @Field()
  timestamp: string;

  @Field({ nullable: true })
  tenantId?: string;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  appId?: string;

  @Field(() => MessageSeverity, { nullable: true })
  severity?: MessageSeverity;

  @Field(() => GraphQLJSONObject)
  payload: any;
}

@InputType()
export class GatewayMessageFilter {
  @Field()
  topic: string;

  @Field({ nullable: true })
  tenantId?: string;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  appId?: string;
}

export interface PublishGatewayMessageOptions {
  topic: string;
  type?: string;
  tenantId?: string;
  userId?: string;
  appId?: string;
  severity?: MessageSeverity;
  payload: unknown;
  ttlSec?: number;
}
