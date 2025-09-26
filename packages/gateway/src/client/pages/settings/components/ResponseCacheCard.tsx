import { Alert, Button, Card, Group, Loader, NumberInput, Select, Stack, Switch, Text } from '@mantine/core';
import { IconDatabase, IconInfoCircle } from '@tabler/icons-react';
import React from 'react';

export interface ResponseCacheCardProps {
  loading: boolean;
  error: string | null;
  enabled: boolean | null;
  onEnabledChange: (value: boolean) => void;
  ttlMs: number | null;
  onTtlChange: (value: number | null) => void;
  includeExtensions: boolean | null;
  onIncludeExtensionsChange: (value: boolean) => void;
  scope: 'global' | 'per-session' | null;
  onScopeChange: (value: 'global' | 'per-session' | null) => void;
  ttlPerType: Record<string, number>;
  onTtlPerTypeChange: (value: Record<string, number>) => void;
  ttlPerCoordinate: Record<string, number>;
  onTtlPerCoordinateChange: (value: Record<string, number>) => void;
  clearing: boolean;
  onClearCache: () => Promise<void> | void;
  clearMessage: string | null;
  ttlError: string | null;
  onTtlErrorChange: (value: string | null) => void;
}

const MAX_TTL_MS = 86_400_000;

export const ResponseCacheCard: React.FC<ResponseCacheCardProps> = ({
  loading,
  error,
  enabled,
  onEnabledChange,
  ttlMs,
  onTtlChange,
  includeExtensions,
  onIncludeExtensionsChange,
  scope,
  onScopeChange,
  ttlPerType,
  onTtlPerTypeChange,
  ttlPerCoordinate,
  onTtlPerCoordinateChange,
  clearing,
  onClearCache,
  clearMessage,
  ttlError,
  onTtlErrorChange
}) => {
  const handleJsonInputChange = (raw: string, onChange: (value: Record<string, number>) => void, errorMessage: string) => {
    onTtlErrorChange(null);

    if (!raw.trim()) {
      onChange({});
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      onChange(parsed || {});
    } catch (err) {
      onTtlErrorChange(errorMessage);
    }
  };

  const renderJsonTextarea = (
    label: string,
    placeholder: string,
    value: Record<string, number>,
    onChange: (value: Record<string, number>) => void,
    errorMessage: string
  ) => (
    <Stack spacing={4}>
      <Text size="sm">{label}</Text>
      <textarea
        style={{
          width: '100%',
          minHeight: 120,
          padding: 8,
          fontFamily: 'monospace'
        }}
        placeholder={placeholder}
        value={Object.keys(value || {}).length ? JSON.stringify(value, null, 2) : ''}
        onChange={(event) => handleJsonInputChange(event.target.value, onChange, errorMessage)}
      />
    </Stack>
  );

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Stack spacing="md">
        <Group spacing="sm">
          <IconDatabase size={20} />
          <Text weight={500} size="md">
            Response Cache
          </Text>
        </Group>

        {loading ? (
          <Group>
            <Loader size="sm" />
            <Text size="sm">Loading settings...</Text>
          </Group>
        ) : error ? (
          <Alert color="red" title="Failed to load" icon={<IconInfoCircle size={16} />}>
            {error}
          </Alert>
        ) : (
          <>
            <Group position="apart" align="flex-start">
              <div>
                <Text weight={500} size="sm">
                  Enable Response Cache
                </Text>
                <Text size="xs" color="dimmed">
                  Cache GraphQL responses in Redis to speed up repeated queries
                </Text>
              </div>
              <Switch
                checked={!!enabled}
                onChange={(event) => onEnabledChange(event.currentTarget.checked)}
                onLabel="ON"
                offLabel="OFF"
              />
            </Group>

            <NumberInput
              label="Default TTL (ms)"
              description="Time-to-live for cached responses. 0 disables TTL (not recommended)."
              min={0}
              max={MAX_TTL_MS}
              value={ttlMs === null ? undefined : ttlMs}
              onChange={(val) => {
                if (typeof val === 'number') {
                  onTtlChange(Math.max(0, Math.min(MAX_TTL_MS, val)));
                }
              }}
            />

            <Group position="apart" align="flex-start">
              <div>
                <Text weight={500} size="sm">
                  Include extension metadata
                </Text>
                <Text size="xs" color="dimmed">
                  When enabled, cache also stores GraphQL extensions metadata
                </Text>
              </div>
              <Switch
                checked={!!includeExtensions}
                onChange={(event) => onIncludeExtensionsChange(event.currentTarget.checked)}
                onLabel="ON"
                offLabel="OFF"
              />
            </Group>

            <Select
              label="Cache scope"
              description="Global: shared across users and keys. Per-session: varies by user/session."
              value={scope ?? undefined}
              onChange={(val) => onScopeChange((val as 'global' | 'per-session') || null)}
              data={[
                { value: 'global', label: 'Global' },
                { value: 'per-session', label: 'Per-session' }
              ]}
            />

            {renderJsonTextarea(
              'TTL per Type (JSON)',
              '{\n  "User": 500,\n  "Post": 1000\n}',
              ttlPerType,
              onTtlPerTypeChange,
              'Invalid JSON for TTL per Type'
            )}

            {renderJsonTextarea(
              'TTL per Schema Coordinate (JSON)',
              '{\n  "Query.lazy": 10000,\n  "User.friends": 5000\n}',
              ttlPerCoordinate,
              onTtlPerCoordinateChange,
              'Invalid JSON for TTL per Schema Coordinate'
            )}

            <Group spacing="sm">
              <Button variant="light" size="xs" loading={clearing} onClick={() => onClearCache()}>
                Clear Cache
              </Button>
            </Group>

            {clearMessage && (
              <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                {clearMessage}
              </Alert>
            )}

            {ttlError && (
              <Alert color="red" icon={<IconInfoCircle size={16} />}>
                {ttlError}
              </Alert>
            )}

            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              <Text size="xs">
                Response cache reduces load and latency by caching operation results in Redis. Changes apply within seconds
                without restart. Use per-session scope when results depend on user identity or permissions.
              </Text>
            </Alert>
          </>
        )}
      </Stack>
    </Card>
  );
};
