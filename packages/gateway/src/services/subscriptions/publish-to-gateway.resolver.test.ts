import assert from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import 'reflect-metadata';

import { randomUUID } from 'crypto';
import { Container } from 'typedi';
import { dataSource } from '../../db/datasource';
import { GatewayPublishedMessage } from '../../entities/gateway-message.entity';
import { TestDatabaseManager } from '../../test/test-utils';
import { MessageSeverity } from './gateway-message-channel.types';
import { PublishToGatewayChannelResolver } from './publish-to-gateway.resolver';

describe('PublishToGatewayChannelResolver', () => {
  let resolver: PublishToGatewayChannelResolver;
  let pubSub: { publish: (topic: string, message: any) => Promise<void> };
  let published: Array<{ topic: string; message: any }> = [];

  before(async () => {
    await TestDatabaseManager.setupDatabase();
    published = [];
    pubSub = {
      publish: async (topic: string, message: any) => {
        published.push({ topic, message });
      },
    };
    Container.set('PubSub', pubSub as any);
    resolver = Container.get(PublishToGatewayChannelResolver);
  });

  beforeEach(async () => {
    await TestDatabaseManager.clearDatabase();
    published = [];
  });

  after(async () => {
    Container.reset();
    await TestDatabaseManager.teardownDatabase();
  });

  test('publishes and persists a message (happy path)', async () => {
    published = [];

    const input = {
      topic: 'app/app-target-1/notification',
      type: 'custom_event',
      tenantId: null as any,
      userId: null as any,
      appId: 'app-target-1',
      severity: MessageSeverity.WARN,
      payload: { title: 'Hello', body: 'World' },
      ttlSec: 10,
    };

    const ctx: any = {
      authType: 'api-key',
      apiKey: { id: randomUUID() },
      application: { id: 'app-sender-1' },
    };

    const result = await resolver.publishToGatewayChannel(input as any, ctx);

    // Returned fields
    assert.ok(result.id);
    assert.equal(result.topic, input.topic);
    assert.ok(result.timestamp);

    // Published over PubSub
    assert.equal(published.length, 1);
    const sent = published[0].message;
    assert.equal(sent.id, result.id);
    assert.equal(sent.topic, input.topic);
    assert.equal(sent.type, input.type);
    assert.equal(sent.appId, input.appId);
    assert.equal(sent.severity, MessageSeverity.WARN);
    assert.deepEqual(sent.payload, input.payload);

    // Persisted row exists
    const repo = dataSource.getRepository(GatewayPublishedMessage);
    const row = await repo.findOne({ where: { id: result.id } });
    assert.ok(row);
    assert.equal(row?.topic, input.topic);
    assert.equal(row?.type, input.type);
    assert.equal(row?.appId, input.appId);
    // severity stored as string in entity
    assert.equal(row?.severity, MessageSeverity.WARN);
    assert.equal(row?.senderApplicationId, ctx.application.id);
    assert.equal(row?.apiKeyId, ctx.apiKey.id);
    assert.ok(row?.timestamp instanceof Date);
    assert.ok(row?.createdAt instanceof Date);
    assert.ok(row?.expiresAt instanceof Date);
    const ttlMs = (row?.expiresAt!.getTime() || 0) - Date.now();
    assert.ok(ttlMs <= 10000 + 2000 && ttlMs >= 10000 - 2000); // ~10s ±2s
  });

  test('rejects when not authenticated with app api key', async () => {
    published = [];

    const input = {
      topic: 'app/app-1/notification',
      payload: { ok: true },
    };

    const ctx: any = { authType: 'session', user: { id: 'u1' } };
    await assert.rejects(
      () => resolver.publishToGatewayChannel(input as any, ctx),
      /Only application API keys can publish/
    );
    assert.equal(published.length, 0);
  });

  test('rejects disallowed topic for app publishers', async () => {
    published = [];

    const input = {
      topic: 'service#not-allowed',
      payload: { ok: true },
    };
    const ctx: any = {
      authType: 'api-key',
      apiKey: { id: 'k1' },
      application: { id: 'app-1' },
    };
    await assert.rejects(
      () => resolver.publishToGatewayChannel(input as any, ctx),
      /Topic not allowed/
    );
    assert.equal(published.length, 0);
  });
});
