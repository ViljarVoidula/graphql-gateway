import { YogaContext } from './session.config';

export const authZRules = {
  // Rule to check if user is authenticated
  isAuthenticated: (context: YogaContext) => {
    return !!context.user?.id;
  },
  
  // Rule to check if user owns the resource
  isOwner: (context: YogaContext, args: any) => {
    return context.user?.id === args.userId || context.user?.id === args.id;
  },
  
  // Rule to check if user has specific permission
  hasPermission: (permission: string) => (context: YogaContext) => {
    return context.user?.permissions?.includes(permission) || false;
  },
  
  // Rule to check if user has any of the specified permissions
  hasAnyPermission: (permissions: string[]) => (context: YogaContext) => {
    if (!context.user?.permissions) return false;
    return permissions.some(permission => 
      context.user.permissions.includes(permission)
    );
  },
  
  // Rule to check if user has all specified permissions
  hasAllPermissions: (permissions: string[]) => (context: YogaContext) => {
    if (!context.user?.permissions) return false;
    return permissions.every(permission => 
      context.user.permissions.includes(permission)
    );
  },
  
  // Rule to check if user is admin
  isAdmin: (context: YogaContext) => {
    return context.user?.permissions?.includes('admin') || false;
  },
  
  // Rule to check if user is moderator or admin
  isModerator: (context: YogaContext) => {
    return context.user?.permissions?.some(p => ['admin', 'moderator'].includes(p)) || false;
  },
  
  // Rule to check if user can access their own data or has admin permission
  canAccessUserData: (context: YogaContext, args: any) => {
    return context.user?.id === args.userId || 
           context.user?.id === args.id || 
           context.user?.permissions?.includes('admin') || false;
  }
};
