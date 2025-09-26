export type AccessLevel = 'READ' | 'WRITE' | 'SUBSCRIBE' | 'ADMIN';
export type OperationType = 'QUERY' | 'MUTATION' | 'SUBSCRIPTION';

export interface ServicePermission {
  id: string;
  permissionKey: string;
  operationType: OperationType;
  operationName: string;
  fieldPath?: string | null;
  accessLevel: AccessLevel;
  active: boolean;
  metadata?: Record<string, any> | null;
  updatedAt: string;
}

export interface PermissionTemplate {
  id: string;
  name: string;
  roleKey: string;
  description?: string | null;
  permissions: string[];
  tags?: string[] | null;
  updatedAt: string;
}

export interface UserServiceRole {
  id: string;
  roleKey: string;
  roleNamespace?: string | null;
  displayName?: string | null;
  permissions: string[];
  expiresAt?: string | null;
  updatedAt: string;
  user: {
    id: string;
    email: string;
  };
  template?: {
    id: string;
    name: string;
    roleKey: string;
  } | null;
  service?: {
    id: string;
    name: string;
  } | null;
}

export const ACCESS_OPTIONS = [
  { value: 'READ', label: 'Read' },
  { value: 'WRITE', label: 'Write' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'ADMIN', label: 'Admin' },
] as const;

export const OPERATION_ORDER: OperationType[] = [
  'QUERY',
  'MUTATION',
  'SUBSCRIPTION',
];

export const OPERATION_COLORS: Record<OperationType, string> = {
  QUERY: 'blue',
  MUTATION: 'orange',
  SUBSCRIPTION: 'violet',
};

export const ACCESS_COLORS: Record<AccessLevel, string> = {
  READ: 'green',
  WRITE: 'orange',
  SUBSCRIBE: 'violet',
  ADMIN: 'red',
};

// Transform backend values (lowercase) to frontend values (uppercase)
export const transformAccessLevel = (backendValue: string): AccessLevel => {
  switch (backendValue.toLowerCase()) {
    case 'read':
      return 'READ';
    case 'write':
      return 'WRITE';
    case 'subscribe':
      return 'SUBSCRIBE';
    case 'admin':
      return 'ADMIN';
    default:
      return 'READ' as AccessLevel;
  }
};
