import {
  ActionIcon,
  Alert,
  Badge,
  Code,
  Grid,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconCalendar,
  IconCopy,
  IconDeviceDesktop,
  IconGlobe,
  IconInfoCircle,
  IconUser
} from '@tabler/icons-react';
import React from 'react';

interface AuditLogEntry {
  id: string;
  action: string;
  actor?: {
    id: string;
    email: string;
    name?: string;
  };
  target?: {
    type: string;
    id: string;
    name?: string;
  };
  metadata?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

interface AuditLogDetailModalProps {
  entry: AuditLogEntry | null;
  opened: boolean;
  onClose: () => void;
}

export const AuditLogDetailModal: React.FC<AuditLogDetailModalProps> = ({ entry, opened, onClose }) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showNotification({
      title: 'Copied',
      message: `${label} copied to clipboard`,
      color: 'blue',
      icon: <IconCopy />
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'red';
      case 'high':
        return 'orange';
      case 'medium':
        return 'yellow';
      case 'low':
        return 'blue';
      default:
        return 'gray';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return <IconAlertTriangle size={16} />;
      default:
        return <IconInfoCircle size={16} />;
    }
  };

  const parseUserAgent = (userAgent?: string) => {
    if (!userAgent) return null;

    // Simple user agent parsing
    const browserMatch = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/?([\d\.]+)/);
    const osMatch = userAgent.match(/\(([^)]+)\)/);

    return {
      browser: browserMatch ? `${browserMatch[1]} ${browserMatch[2]}` : 'Unknown',
      os: osMatch ? osMatch[1] : 'Unknown'
    };
  };

  if (!entry) return null;

  const userAgentInfo = parseUserAgent(entry.userAgent);

  return (
    <Modal opened={opened} onClose={onClose} title="Audit Log Entry Details" size="lg" centered>
      <Stack spacing="md">
        {/* Header with severity */}
        <Paper p="md" radius="md" style={{ backgroundColor: '#f8f9fa' }}>
          <Group position="apart" align="center">
            <Group spacing="sm">
              <Badge color={getSeverityColor(entry.severity)} variant="filled" leftSection={getSeverityIcon(entry.severity)}>
                {entry.severity.toUpperCase()}
              </Badge>
              <Badge variant="outline">{entry.category}</Badge>
            </Group>
            <Text size="sm" color="dimmed">
              {new Date(entry.timestamp).toLocaleString()}
            </Text>
          </Group>
        </Paper>

        {/* Action Details */}
        <Stack spacing="xs">
          <Title order={4}>Action</Title>
          <Paper p="md" withBorder>
            <Stack spacing="sm">
              <Group position="apart">
                <Text weight={500}>Action Type</Text>
                <Code>{entry.action}</Code>
              </Group>
              <Group position="apart">
                <Text weight={500}>Target</Text>
                <Group spacing="xs">
                  <Text size="sm">{entry.target?.type ?? 'unknown'}</Text>
                  <Code style={{ fontSize: '0.875rem' }}>{entry.target?.id ?? '-'}</Code>
                  {entry.target?.name && (
                    <Text size="sm" color="dimmed">
                      ({entry.target?.name})
                    </Text>
                  )}
                </Group>
              </Group>
            </Stack>
          </Paper>
        </Stack>

        {/* Actor Information */}
        <Stack spacing="xs">
          <Title order={4}>Actor</Title>
          <Paper p="md" withBorder>
            <Group spacing="md" align="center">
              <IconUser size={24} color="#868e96" />
              <Stack spacing={2}>
                <Text weight={500}>{entry.actor?.name || entry.actor?.email || 'Unknown Actor'}</Text>
                {entry.actor?.email && (
                  <Group spacing="xs" align="center">
                    <Text size="sm" color="dimmed">
                      {entry.actor.email}
                    </Text>
                    <Tooltip label="Copy email">
                      <ActionIcon size="xs" variant="light" onClick={() => copyToClipboard(entry.actor!.email, 'Email')}>
                        <IconCopy size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                )}
                {entry.actor?.id && <Code style={{ fontSize: '0.75rem' }}>{entry.actor.id}</Code>}
              </Stack>
            </Group>
          </Paper>
        </Stack>

        {/* Context Information */}
        <Stack spacing="xs">
          <Title order={4}>Context</Title>
          <Grid>
            <Grid.Col span={6}>
              <Paper p="md" withBorder>
                <Stack spacing="sm">
                  <Group spacing="xs" align="center">
                    <IconCalendar size={16} color="#868e96" />
                    <Text size="sm" weight={500}>
                      Timestamp
                    </Text>
                  </Group>
                  <Text size="sm">{new Date(entry.timestamp).toLocaleString()}</Text>
                  <Text size="xs" color="dimmed">
                    {new Date(entry.timestamp).toISOString()}
                  </Text>
                </Stack>
              </Paper>
            </Grid.Col>

            {entry.ipAddress && (
              <Grid.Col span={6}>
                <Paper p="md" withBorder>
                  <Stack spacing="sm">
                    <Group spacing="xs" align="center">
                      <IconGlobe size={16} color="#868e96" />
                      <Text size="sm" weight={500}>
                        IP Address
                      </Text>
                    </Group>
                    <Group spacing="xs" align="center">
                      <Code style={{ fontSize: '0.875rem' }}>{entry.ipAddress}</Code>
                      <Tooltip label="Copy IP address">
                        <ActionIcon size="xs" variant="light" onClick={() => copyToClipboard(entry.ipAddress!, 'IP address')}>
                          <IconCopy size={12} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Stack>
                </Paper>
              </Grid.Col>
            )}
          </Grid>
        </Stack>

        {/* User Agent Information */}
        {userAgentInfo && (
          <Stack spacing="xs">
            <Title order={4}>Client Information</Title>
            <Paper p="md" withBorder>
              <Stack spacing="sm">
                <Group spacing="xs" align="center">
                  <IconDeviceDesktop size={16} color="#868e96" />
                  <Text size="sm" weight={500}>
                    Browser & OS
                  </Text>
                </Group>
                <Grid>
                  <Grid.Col span={6}>
                    <Text size="sm" color="dimmed">
                      Browser
                    </Text>
                    <Text size="sm">{userAgentInfo.browser}</Text>
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <Text size="sm" color="dimmed">
                      Operating System
                    </Text>
                    <Text size="sm">{userAgentInfo.os}</Text>
                  </Grid.Col>
                </Grid>
                {entry.userAgent && (
                  <Stack spacing="xs">
                    <Text size="xs" color="dimmed">
                      Full User Agent:
                    </Text>
                    <ScrollArea style={{ maxHeight: 80 }}>
                      <Code style={{ fontSize: '10px', wordBreak: 'break-all' }}>{entry.userAgent}</Code>
                    </ScrollArea>
                  </Stack>
                )}
              </Stack>
            </Paper>
          </Stack>
        )}

        {/* Metadata */}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <Stack spacing="xs">
            <Title order={4}>Additional Details</Title>
            <Paper p="md" withBorder>
              <ScrollArea style={{ maxHeight: 200 }}>
                <Stack spacing="xs">
                  {Object.entries(entry.metadata).map(([key, value]) => (
                    <Group key={key} position="apart" align="flex-start">
                      <Text size="sm" weight={500} style={{ minWidth: '120px' }}>
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                      </Text>
                      <Stack spacing={2} style={{ flex: 1 }}>
                        <Text size="sm" style={{ wordBreak: 'break-word' }}>
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </Text>
                        {typeof value === 'string' && value.length > 50 && (
                          <Tooltip label="Copy value">
                            <ActionIcon size="xs" variant="light" onClick={() => copyToClipboard(String(value), key)}>
                              <IconCopy size={12} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Stack>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea>
            </Paper>
          </Stack>
        )}

        {/* Security Notice for High/Critical Severity */}
        {(entry.severity === 'high' || entry.severity === 'critical') && (
          <Alert icon={<IconAlertTriangle size={16} />} color={getSeverityColor(entry.severity)} title="Security Notice">
            This action has been flagged as {entry.severity} severity. Please review the details carefully and consider if any
            follow-up actions are required.
          </Alert>
        )}
      </Stack>
    </Modal>
  );
};
