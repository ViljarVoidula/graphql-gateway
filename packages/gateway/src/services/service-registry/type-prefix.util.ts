import { log } from '../../utils/logger';

const MAX_PREFIX_LENGTH = 64;

function toPascalCase(tokens: string[]): string {
  return tokens
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join('');
}

export function generateDefaultTypePrefix(serviceName: string): string {
  const sanitizedName = serviceName ?? '';
  const tokens = sanitizedName.split(/[^a-zA-Z0-9]+/);
  let candidate = toPascalCase(tokens);

  if (!candidate) {
    candidate = 'Service';
  }

  if (!/^[A-Za-z_]/.test(candidate)) {
    candidate = `Svc${candidate}`;
  }

  if (!candidate.endsWith('_')) {
    candidate = `${candidate}_`;
  }

  return truncatePrefix(candidate);
}

function truncatePrefix(prefix: string): string {
  if (prefix.length <= MAX_PREFIX_LENGTH) {
    return prefix;
  }
  // Ensure we keep trailing underscore which improves readability
  const trimmed = prefix.slice(0, MAX_PREFIX_LENGTH - 1);
  return `${trimmed}_`;
}

export function normalizeTypePrefix(
  rawPrefix: string | null | undefined,
  serviceName: string
): string {
  const input = (rawPrefix ?? '').trim();
  let sanitized = input.replace(/[^A-Za-z0-9_]/g, '');

  if (!sanitized) {
    sanitized = generateDefaultTypePrefix(serviceName);
  }

  if (!/^[A-Za-z_]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  sanitized = sanitized.replace(/_{3,}/g, '__');

  if (!sanitized.endsWith('_')) {
    sanitized = `${sanitized}_`;
  }

  const result = truncatePrefix(sanitized);

  if (result !== input && rawPrefix) {
    log.debug('Normalized service type prefix', {
      operation: 'serviceRegistry.normalizeTypePrefix',
      metadata: {
        requested: rawPrefix,
        result,
      },
    });
  }

  return result;
}
