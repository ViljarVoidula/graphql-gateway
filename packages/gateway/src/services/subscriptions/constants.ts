export const SUBSCRIPTION_TOPICS = {
  GATEWAY_MESSAGE_CHANNEL: 'GATEWAY_MESSAGE_CHANNEL',
} as const;

export const MESSAGE_TOPICS = {
  SYSTEM: {
    BROADCAST: 'system/broadcast',
    MAINTENANCE: 'system/maintenance',
    ALERT: 'system/alert',
  },
  APP: {
    notification: (appId: string) => `app/${appId}/notification`,
    event: (appId: string) => `app/${appId}/event`,
    status: (appId: string) => `app/${appId}/status`,
  },
  TENANT: {
    event: (tenantId: string) => `tenant/${tenantId}/event`,
    notification: (tenantId: string) => `tenant/${tenantId}/notification`,
  },
  USER: {
    notification: (userId: string) => `user/${userId}/notification`,
    message: (userId: string) => `user/${userId}/message`,
  },
} as const;

export type SubscriptionTopic = keyof typeof SUBSCRIPTION_TOPICS;
export type MessageTopic = string;
