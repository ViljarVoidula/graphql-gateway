import { Arg, Ctx, Directive, Root, Subscription } from 'type-graphql';
import { Service } from 'typedi';
import { ExtendedYogaContext } from '../../auth/auth.types';
import { log } from '../../utils/logger';
import { SUBSCRIPTION_TOPICS } from './constants';
import {
  GatewayMessage,
  GatewayMessageFilter,
} from './gateway-message-channel.types';

@Service()
export class GatewayMessageChannelResolver {
  /**
   * Generic subscription for internal services to push messages to frontend
   * Enforces authentication and scoping based on message content and user session
   */
  @Subscription(() => GatewayMessage, {
    topics: SUBSCRIPTION_TOPICS.GATEWAY_MESSAGE_CHANNEL,
    filter: ({
      payload,
      args,
      context,
    }: {
      payload: GatewayMessage;
      args: { filter: GatewayMessageFilter };
      context: ExtendedYogaContext;
    }) => {
      return GatewayMessageChannelResolver.shouldDeliverMessage(
        payload,
        args.filter,
        context
      );
    },
  })
  @Directive('@authz(rules: ["isAuthenticated"])')
  async gatewayMessageChannel(
    @Arg('filter', () => GatewayMessageFilter) filter: GatewayMessageFilter,
    @Ctx() context: ExtendedYogaContext,
    @Root() message: GatewayMessage
  ): Promise<GatewayMessage> {
    // Log successful delivery for monitoring
    log.debug('Gateway message delivered to subscriber', {
      operation: 'gatewayMessageChannel',
      messageId: message.id,
      topic: message.topic,
      subscriberFilter: {
        topic: filter.topic,
        tenantId: filter.tenantId,
        userId: filter.userId,
        appId: filter.appId,
      },
      subscriber: {
        userId: context.user?.id,
        sessionId: context.sessionId,
        applicationId: context.application?.id,
      },
    });

    return message;
  }

  /**
   * Determines if a message should be delivered to a subscriber
   * Enforces topic matching and scoping rules
   */
  private static shouldDeliverMessage(
    message: GatewayMessage,
    filter: GatewayMessageFilter,
    context: ExtendedYogaContext
  ): boolean {
    try {
      // Basic topic matching
      if (!message.topic.startsWith(filter.topic)) {
        return false;
      }

      // Scope-based filtering - message must match subscriber's context if specified
      if (
        message.tenantId &&
        filter.tenantId &&
        message.tenantId !== filter.tenantId
      ) {
        return false;
      }

      if (message.appId && filter.appId && message.appId !== filter.appId) {
        return false;
      }

      if (message.userId && filter.userId && message.userId !== filter.userId) {
        return false;
      }

      // Security check: ensure subscriber can access the message
      const hasAccess = GatewayMessageChannelResolver.checkMessageAccess(
        message,
        context
      );
      if (!hasAccess) {
        log.warn('Message delivery blocked by access control', {
          operation: 'shouldDeliverMessage',
          messageId: message.id,
          topic: message.topic,
          subscriber: {
            userId: context.user?.id,
            sessionId: context.sessionId,
            applicationId: context.application?.id,
            isAdmin: context.user?.permissions?.includes('admin'),
          },
          messageScope: {
            tenantId: message.tenantId,
            userId: message.userId,
            appId: message.appId,
          },
        });
        return false;
      }

      return true;
    } catch (error) {
      log.error('Error in message delivery filter', {
        operation: 'shouldDeliverMessage',
        error: error instanceof Error ? error : new Error(String(error)),
        messageId: message.id,
        topic: message.topic,
      });
      return false;
    }
  }

  /**
   * Check if the current user has access to receive this message
   */
  private static checkMessageAccess(
    message: GatewayMessage,
    context: ExtendedYogaContext
  ): boolean {
    // Admin users can receive all messages
    if (context.user?.permissions?.includes('admin')) {
      return true;
    }

    // System broadcasts are available to all authenticated users
    if (message.topic.startsWith('system/')) {
      return true;
    }

    // User-specific messages: must match current user
    if (message.userId) {
      return context.user?.id === message.userId;
    }

    // App-specific messages: user must have access to the app
    if (message.appId) {
      // Check if user has access to this application
      // This could be enhanced with more sophisticated app-level permissions
      return (
        context.application?.id === message.appId ||
        context.user?.permissions?.includes('admin')
      );
    }

    // Tenant-specific messages: implement tenant access control as needed
    if (message.tenantId) {
      // For now, allow if user is authenticated - extend this based on your tenant model
      return true;
    }

    // Default: allow for authenticated users if no specific scoping
    return true;
  }
}
