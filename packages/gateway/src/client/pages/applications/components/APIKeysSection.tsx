import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Code,
  Collapse,
  Group,
  MultiSelect,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core';
import { IconChartBar, IconChevronDown, IconChevronUp, IconKey, IconPlus, IconTrash } from '@tabler/icons-react';
import React from 'react';
import { InlineUsageDetails } from './InlineUsageDetails';

interface APIKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  scopes?: string[];
  expiresAt?: string;
}

interface Service {
  id: string;
  name: string;
}

interface APIKeysSectionProps {
  app: {
    apiKeys?: APIKey[];
  };
  keyName: string;
  setKeyName: (name: string) => void;
  scopes: string[];
  setScopes: (scopes: string[]) => void;
  expiresAt: string;
  setExpiresAt: (date: string) => void;
  onCreateKey: () => void;
  onRevokeKey: (keyId: string) => void;
  onLoadUsage: (keyId: string) => void;
  onToggleUsageDetails: (keyId: string) => void;
  perKeyUsage: Record<
    string,
    Array<{ date: string; requestCount: number; errorCount: number; rateLimitExceededCount: number }>
  >;
  loadingKeyUsage: Record<string, boolean>;
  expandedUsageKeys: Set<string>;
  services: Service[];
  MiniBars: React.FC<{
    data: Array<{ requestCount: number; errorCount?: number; rateLimitExceededCount?: number; date?: string }>;
  }>;
}

export const APIKeysSection: React.FC<APIKeysSectionProps> = ({
  app,
  keyName,
  setKeyName,
  scopes,
  setScopes,
  expiresAt,
  setExpiresAt,
  onCreateKey,
  onRevokeKey,
  onLoadUsage,
  onToggleUsageDetails,
  perKeyUsage,
  loadingKeyUsage,
  expandedUsageKeys,
  services,
  MiniBars
}) => {
  return (
    <Card shadow="xs" p="xl" radius="lg" withBorder style={{ backgroundColor: 'white' }}>
      <Group position="apart" align="center" mb="xl">
        <Group spacing="sm">
          <ThemeIcon size="md" radius="md" variant="light" color="violet">
            <IconKey size={18} />
          </ThemeIcon>
          <Title order={3} weight={600}>
            API Keys
          </Title>
          <Badge color="violet" variant="light">
            {app.apiKeys?.length || 0}
          </Badge>
        </Group>
      </Group>

      <Paper p="lg" radius="md" style={{ backgroundColor: '#f8f9fa' }} mb="xl">
        <Stack spacing="md">
          <Group align="flex-end" grow>
            <TextInput
              label="Key name"
              placeholder="e.g. CI bot, Staging app"
              value={keyName}
              onChange={(e) => setKeyName(e.currentTarget.value)}
              required
              styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
            />
            <MultiSelect
              label="Scopes"
              placeholder="Select or type scopes"
              data={(() => {
                const fromExisting = (app?.apiKeys || [])
                  .flatMap((k: APIKey) => k.scopes || [])
                  .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
                const fallback = ['read:applications', 'write:applications', 'read:services', 'write:services'];
                return (fromExisting.length ? fromExisting : fallback).map((s: string) => ({ value: s, label: s }));
              })()}
              value={scopes}
              onChange={setScopes}
              searchable
              clearable
              creatable
              getCreateLabel={(query) => `+ Add "${query}"`}
              onCreate={(query) => {
                const newScopes = Array.from(new Set([...scopes, query]));
                setScopes(newScopes);
                return { value: query, label: query };
              }}
              nothingFound="No scopes"
              description="Choose one or more scopes; you can also type to add custom scopes."
            />
            <TextInput
              label="Expires"
              type="datetime-local"
              placeholder="Optional"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.currentTarget.value)}
              description="Leave empty for a non-expiring key"
            />
          </Group>
          <Group position="right">
            <Button leftIcon={<IconPlus size={16} />} onClick={onCreateKey} disabled={!keyName}>
              Create Key
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Stack spacing="md">
        {(app.apiKeys || []).map((k: APIKey) => {
          const isExpanded = expandedUsageKeys.has(k.id);
          const hasUsageData = perKeyUsage[k.id]?.length > 0;

          return (
            <Card key={k.id} p="lg" radius="md" withBorder>
              <Stack spacing="md">
                {/* API Key Header */}
                <Group position="apart" align="center">
                  <Group spacing="md" align="center">
                    <Stack spacing={4}>
                      <Group spacing="sm" align="center">
                        <Text weight={600}>{k.name}</Text>
                        <Badge variant="light" color={k.status === 'active' ? 'green' : 'red'}>
                          {k.status}
                        </Badge>
                      </Group>
                      <Code>{k.keyPrefix}</Code>
                    </Stack>

                    <Stack spacing={4}>
                      <Text size="sm" color="dimmed">
                        Scopes
                      </Text>
                      <Text size="sm">{k.scopes?.length ? k.scopes.join(', ') : '—'}</Text>
                    </Stack>

                    <Stack spacing={4}>
                      <Text size="sm" color="dimmed">
                        Expires
                      </Text>
                      <Text size="sm">{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'Never'}</Text>
                    </Stack>
                  </Group>

                  <Group spacing="sm" align="center">
                    {/* Usage Summary */}
                    {hasUsageData && (
                      <Group spacing={8} align="center">
                        <MiniBars
                          data={[...perKeyUsage[k.id]].reverse().map((u) => ({
                            requestCount: u.requestCount,
                            errorCount: u.errorCount,
                            rateLimitExceededCount: u.rateLimitExceededCount,
                            date: u.date
                          }))}
                        />
                        <Text size="xs" color="dimmed">
                          {perKeyUsage[k.id].reduce((a, b) => a + (b.requestCount || 0), 0).toLocaleString()} req
                        </Text>
                      </Group>
                    )}

                    {/* Action Buttons */}
                    <Group spacing="xs">
                      <Button
                        size="xs"
                        variant="light"
                        leftIcon={<IconChartBar size={14} />}
                        rightIcon={isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                        loading={!!loadingKeyUsage[k.id]}
                        onClick={() => onToggleUsageDetails(k.id)}
                      >
                        {isExpanded ? 'Hide Usage' : 'Show Usage'}
                      </Button>

                      <ActionIcon color="red" variant="light" onClick={() => onRevokeKey(k.id)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Group>

                {/* Expandable Usage Details */}
                <Collapse in={isExpanded}>
                  <InlineUsageDetails
                    keyId={k.id}
                    usage={perKeyUsage[k.id] || []}
                    loading={!!loadingKeyUsage[k.id]}
                    services={services}
                  />
                </Collapse>
              </Stack>
            </Card>
          );
        })}

        {(!app.apiKeys || app.apiKeys.length === 0) && (
          <Paper p="xl" radius="md" style={{ backgroundColor: '#f8f9fa' }}>
            <Text align="center" color="dimmed">
              No API keys created yet. Create your first API key above.
            </Text>
          </Paper>
        )}
      </Stack>
    </Card>
  );
};
