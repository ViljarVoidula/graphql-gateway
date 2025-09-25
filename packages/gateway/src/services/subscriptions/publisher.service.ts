import { randomUUID } from 'crypto';
import type { PubSub } from 'graphql-yoga';
import { Inject, Service } from 'typedi';
import { log } from '../../utils/logger';
import { SUBSCRIPTION_TOPICS } from './constants';
import {
  GatewayMessage,
  MessageSeverity,
  PublishGatewayMessageOptions,
} from './gateway-message-channel.types';

@Service()
export class GatewayMessagePublisher {
  constructor(@Inject('PubSub') private readonly pubSub: PubSub<any>) {}

  /**
   * Publish a message to the Gateway Message Channel
   * Internal service can use this to send messages to frontend clients
   */
  async publishGatewayMessage(
    options: PublishGatewayMessageOptions
  ): Promise<GatewayMessage> {
    try {
      const message: GatewayMessage = {
        id: randomUUID(),
        topic: options.topic,
        type: options.type,
        timestamp: new Date().toISOString(),
        tenantId: options.tenantId,
        userId: options.userId,
        appId: options.appId,
        severity: options.severity || MessageSeverity.INFO,
        payload: options.payload,
      };

      // Validate topic format
      this.validateTopic(options.topic);

      // Publish to the subscription channel
      await this.pubSub.publish(
        SUBSCRIPTION_TOPICS.GATEWAY_MESSAGE_CHANNEL,
        message
      );

      log.debug('Gateway message published', {
        operation: 'publishGatewayMessage',
        messageId: message.id,
        topic: message.topic,
        severity: message.severity,
        metadata: {
          tenantId: message.tenantId,
          userId: message.userId,
          appId: message.appId,
          type: message.type,
        },
      });
      return message;
    } catch (error) {
      log.error('Failed to publish gateway message', {
        operation: 'publishGatewayMessage',
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          topic: options.topic,
          type: options.type,
          tenantId: options.tenantId,
          userId: options.userId,
          appId: options.appId,
        },
      });
      throw error;
    }
  }

  /**
   * Validate topic format and allowed patterns
   */
  private validateTopic(topic: string): void {
    if (!topic || typeof topic !== 'string') {
      throw new Error('Topic must be a non-empty string');
    }

    // Basic validation - topics should follow a pattern like "system/broadcast", "app/123/notification", etc.
    if (!/^[\w\/\-\.]+$/.test(topic)) {
      throw new Error(
        'Topic contains invalid characters. Use only letters, numbers, /, -, and .'
      );
    }

    if (topic.length > 200) {
      throw new Error('Topic too long (max 200 characters)');
    }
  }

  /**
   * Convenience methods for common message types
   */
  async publishSystemBroadcast(
    message: string,
    severity: MessageSeverity = MessageSeverity.INFO
  ): Promise<GatewayMessage> {
    return await this.publishGatewayMessage({
      topic: 'system/broadcast',
      type: 'broadcast',
      severity,
      payload: { message },
    });
  }

  async publishAppNotification(
    appId: string,
    notification: any,
    severity: MessageSeverity = MessageSeverity.INFO
  ): Promise<GatewayMessage> {
    return await this.publishGatewayMessage({
      topic: `app/${appId}/notification`,
      type: 'notification',
      appId,
      severity,
      payload: notification,
    });
  }

  async publishUserMessage(
    userId: string,
    message: any,
    severity: MessageSeverity = MessageSeverity.INFO
  ): Promise<GatewayMessage> {
    return await this.publishGatewayMessage({
      topic: `user/${userId}/message`,
      type: 'user_message',
      userId,
      severity,
      payload: message,
    });
  }
}
