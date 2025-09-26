export const PERMISSION_HEADER_NAME = 'x-gateway-permissions';
export const PERMISSION_HEADER_VERSION = 1;

export const DEFAULT_PERMISSION_TEMPLATES = {
  READER: 'service:reader',
  WRITER: 'service:writer',
  ADMIN: 'service:admin',
  SUBSCRIBER: 'service:subscriber',
} as const;

export type DefaultTemplateKey =
  (typeof DEFAULT_PERMISSION_TEMPLATES)[keyof typeof DEFAULT_PERMISSION_TEMPLATES];

export const PERMISSION_KEY_PREFIX = 'service';
// Canonical internal gateway service URL (pseudo service for admin/local schema)
export const LOCAL_SERVICE_URL = 'internal://gateway';

// Dynamically discovered local gateway service id (persisted after startup)
// We avoid hardcoding a UUID so existing databases with an already-created
// internal service continue to work. This is populated by the permission
// synchronization routine when the local schema permissions are synced.
let _localServiceId: string | null = null;

export function setLocalServiceId(id: string) {
  _localServiceId = id;
}

export function getLocalServiceId(): string | null {
  return _localServiceId;
}

export const PERMISSION_PROFILE_TTL_MS = 60_000; // 1 minute cache
