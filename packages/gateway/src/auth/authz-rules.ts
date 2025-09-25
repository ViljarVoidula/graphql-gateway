import { preExecRule } from '@graphql-authz/core';
import { ExtendedYogaContext } from './auth.types';

export const isAuthenticated = preExecRule()(async (
  context: ExtendedYogaContext
) => {
  return !!context.user?.id;
});

export const isAdmin = preExecRule()(async (context: ExtendedYogaContext) => {
  return context.user?.permissions?.includes('admin') || false;
});

export const isModerator = preExecRule()(async (
  context: ExtendedYogaContext
) => {
  return (
    context.user?.permissions?.some((p) =>
      ['admin', 'moderator'].includes(p)
    ) || false
  );
});

export const canAccessUserData = preExecRule()(async (
  context: ExtendedYogaContext,
  args: any
) => {
  return (
    context.user?.id === args.userId ||
    context.user?.id === args.id ||
    context.user?.permissions?.includes('admin') ||
    false
  );
});

export const canManageApplications = preExecRule()(async (
  context: ExtendedYogaContext
) => {
  return (
    context.user?.permissions?.includes('admin') ||
    context.user?.permissions?.includes('application-manager') ||
    false
  );
});

export const canAccessApplication = preExecRule()(async (
  context: ExtendedYogaContext,
  args: any
) => {
  // Admin can access any application
  if (context.user?.permissions?.includes('admin')) {
    return true;
  }

  // API key users can only access their own application
  if (context.authType === 'api-key' && context.application) {
    return (
      context.application.id === args.applicationId ||
      context.application.ownerId === context.user.id
    );
  }

  // Regular users can access applications they own
  return context.user?.id === args.ownerId;
});

export const canAccessService = preExecRule()(async (
  context: ExtendedYogaContext,
  args: any
) => {
  // Admin can access any service
  if (context.user?.permissions?.includes('admin')) {
    return true;
  }

  // API key users can only access whitelisted services
  if (context.authType === 'api-key' && context.application) {
    return (
      context.application.whitelistedServices?.some(
        (s) => s.id === args.serviceId
      ) || false
    );
  }

  // Regular users can access services they own
  return context.user?.id === args.ownerId;
});

export const isApiKeyUser = preExecRule()(async (
  context: ExtendedYogaContext
) => {
  return (
    context.authType === 'api-key' &&
    !!context.apiKey?.id &&
    !!context.application?.id
  );
});

export const authZRules = {
  isAuthenticated,
  isAdmin,
  isModerator,
  canAccessUserData,
  canManageApplications,
  canAccessApplication,
  canAccessService,
  isApiKeyUser,
} as const;
