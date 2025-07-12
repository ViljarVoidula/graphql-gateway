import { preExecRule } from '@graphql-authz/core';
import { YogaContext } from '../auth/session.config';

export const isAuthenticated = preExecRule()(async (context: YogaContext) => {
  debugger
  return !!context.user?.id;
});

export const isAdmin = preExecRule()(async (context: YogaContext) => {
  debugger
  return context.user?.permissions?.includes('admin') || false;
});

export const isModerator = preExecRule()(async (context: YogaContext) => {
  return context.user?.permissions?.some(p => ['admin', 'moderator'].includes(p)) || false;
});

export const canAccessUserData = preExecRule()(async (context: YogaContext, args: any) => {
  debugger
  return context.user?.id === args.userId || 
         context.user?.id === args.id || 
         context.user?.permissions?.includes('admin') || false;
});

export const authZRules = {
  isAuthenticated,
  isAdmin,
  isModerator,
  canAccessUserData
} as const;
