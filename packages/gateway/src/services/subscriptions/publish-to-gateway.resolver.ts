import { GraphQLJSONObject } from 'graphql-scalars';
import 'reflect-metadata';
import {
  Arg,
  Ctx,
  Directive,
  Field,
  InputType,
  Mutation,
  ObjectType,
  Resolver,
} from 'type-graphql';
import { Service as DiService } from 'typedi';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { dataSource } from '../../db/datasource';
import { GatewayPublishedMessage } from '../../entities/gateway-message.entity';
import { log } from '../../utils/logger';
import {
  GatewayMessage,
  MessageSeverity,
  PublishGatewayMessageOptions,
} from './gateway-message-channel.types';
import { GatewayMessagePublisher } from './publisher.service';

@InputType()
class PublishToGatewayChannelInput {
  @Field()
  topic!: string;

  @Field({ nullable: true })
  type?: string;

  @Field({ nullable: true })
  tenantId?: string;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  appId?: string;

  @Field(() => MessageSeverity, { nullable: true })
  severity?: MessageSeverity;

  @Field(() => GraphQLJSONObject)
  payload!: any;

  @Field({ nullable: true })
  ttlSec?: number;
}

@ObjectType()
class PublishToGatewayChannelResult {
  @Field()
  id!: string;

  @Field()
  topic!: string;

  @Field()
  timestamp!: string;
}

@DiService()
@Resolver()
export class PublishToGatewayChannelResolver {
  constructor(private publisher: GatewayMessagePublisher) {}

  @Mutation(() => PublishToGatewayChannelResult)
  @Directive('@authz(rules: ["isApiKeyUser"])')
  async publishToGatewayChannel(
    @Arg('input', () => PublishToGatewayChannelInput)
    input: PublishToGatewayChannelInput,
    @Ctx() context: ExtendedYogaContext
  ): Promise<PublishToGatewayChannelResult> {
    if (
      context.authType !== 'api-key' ||
      !context.apiKey ||
      !context.application
    ) {
      throw new Error('Only application API keys can publish');
    }

    // Basic guard: optional policy to restrict topic namespaces from apps
    // Allow topics under app/<targetAppId>/*, user/<userId>/*, tenant/<tenantId>/*, or system/app-announce
    const allowed = /^(app\/|user\/|tenant\/|system\/app-announce)/.test(
      input.topic
    );
    if (!allowed) {
      throw new Error('Topic not allowed for app publishers');
    }

    const options: PublishGatewayMessageOptions = {
      topic: input.topic,
      type: input.type,
      tenantId: input.tenantId,
      userId: input.userId,
      appId: input.appId,
      severity: input.severity || MessageSeverity.INFO,
      payload: input.payload,
      ttlSec: input.ttlSec,
    };

    // Publish to subscribers
    const published: GatewayMessage =
      await this.publisher.publishGatewayMessage(options);

    // Persist to DB
    const repo = dataSource.getRepository(GatewayPublishedMessage);
    const row = repo.create({
      id: published.id,
      topic: published.topic,
      type: published.type || null,
      tenantId: published.tenantId || null,
      userId: published.userId || null,
      appId: published.appId || null,
      senderApplicationId: context.application.id,
      apiKeyId: context.apiKey.id,
      severity: published.severity || null,
      payload: published.payload,
      timestamp: new Date(published.timestamp),
      expiresAt: input.ttlSec
        ? new Date(Date.now() + input.ttlSec * 1000)
        : null,
    });
    await repo.save(row);

    log.info('App published message to gateway channel', {
      operation: 'publishToGatewayChannel',
      messageId: row.id,
      topic: row.topic,
      senderApplicationId: row.senderApplicationId,
    });

    return { id: row.id, topic: row.topic, timestamp: published.timestamp };
  }
}
