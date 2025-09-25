import assert from 'node:assert';
import { after, before, describe, test } from 'node:test';
import 'reflect-metadata';
import { Container } from 'typedi';
import { SUBSCRIPTION_TOPICS } from './constants';
import {
  MessageSeverity,
  PublishGatewayMessageOptions,
} from './gateway-message-channel.types';
import { GatewayMessagePublisher } from './publisher.service';

describe('GatewayMessagePublisher', () => {
  let publisher: GatewayMessagePublisher;
  let pubSub: any;
  let publishedMessages: any[] = [];

  before(async () => {
    // Create a mock PubSub for testing
    pubSub = {
      publish: async (topic: string, message: any) => {
        publishedMessages.push({ topic, message });
      },
    };

    // Register PubSub in DI container
    Container.set('PubSub', pubSub);

    // Create publisher instance
    publisher = Container.get(GatewayMessagePublisher);
  });

  after(async () => {
    Container.reset();
  });

  test('should publish a basic gateway message', async () => {
    publishedMessages = [];

    const options: PublishGatewayMessageOptions = {
      topic: 'system/test',
      type: 'test_message',
      severity: MessageSeverity.INFO,
      payload: { message: 'Hello, World!' },
    };

    await publisher.publishGatewayMessage(options);

    assert.equal(publishedMessages.length, 1);
    assert.equal(
      publishedMessages[0].topic,
      SUBSCRIPTION_TOPICS.GATEWAY_MESSAGE_CHANNEL
    );

    const message = publishedMessages[0].message;
    assert.equal(message.topic, 'system/test');
    assert.equal(message.type, 'test_message');
    assert.equal(message.severity, MessageSeverity.INFO);
    assert.deepEqual(message.payload, { message: 'Hello, World!' });
    assert.ok(message.id);
    assert.ok(message.timestamp);
  });

  test('should publish system broadcast', async () => {
    publishedMessages = [];

    await publisher.publishSystemBroadcast(
      'System maintenance in 1 hour',
      MessageSeverity.WARN
    );

    assert.equal(publishedMessages.length, 1);
    const message = publishedMessages[0].message;
    assert.equal(message.topic, 'system/broadcast');
    assert.equal(message.type, 'broadcast');
    assert.equal(message.severity, MessageSeverity.WARN);
    assert.deepEqual(message.payload, {
      message: 'System maintenance in 1 hour',
    });
  });

  test('should publish app notification', async () => {
    publishedMessages = [];

    const notification = {
      title: 'Update Available',
      content: 'New version 2.0 is ready',
    };
    await publisher.publishAppNotification(
      'app-123',
      notification,
      MessageSeverity.INFO
    );

    assert.equal(publishedMessages.length, 1);
    const message = publishedMessages[0].message;
    assert.equal(message.topic, 'app/app-123/notification');
    assert.equal(message.type, 'notification');
    assert.equal(message.appId, 'app-123');
    assert.equal(message.severity, MessageSeverity.INFO);
    assert.deepEqual(message.payload, notification);
  });

  test('should publish user message', async () => {
    publishedMessages = [];

    const userMessage = { type: 'welcome', text: 'Welcome to the platform!' };
    await publisher.publishUserMessage(
      'user-456',
      userMessage,
      MessageSeverity.INFO
    );

    assert.equal(publishedMessages.length, 1);
    const message = publishedMessages[0].message;
    assert.equal(message.topic, 'user/user-456/message');
    assert.equal(message.type, 'user_message');
    assert.equal(message.userId, 'user-456');
    assert.equal(message.severity, MessageSeverity.INFO);
    assert.deepEqual(message.payload, userMessage);
  });

  test('should validate topic format', async () => {
    const invalidTopics = [
      '', // empty
      'invalid topic with spaces',
      'topic/with/special@chars',
      'a'.repeat(201), // too long
    ];

    for (const topic of invalidTopics) {
      await assert.rejects(
        () => publisher.publishGatewayMessage({ topic, payload: {} }),
        /Topic/
      );
    }
  });

  test('should allow valid topic formats', async () => {
    publishedMessages = [];

    const validTopics = [
      'system/broadcast',
      'app/123/notification',
      'user/456/message',
      'tenant/789/event',
      'service.health-check',
      'metrics/performance-data',
    ];

    for (const topic of validTopics) {
      await publisher.publishGatewayMessage({ topic, payload: { test: true } });
    }

    assert.equal(publishedMessages.length, validTopics.length);
  });
});
