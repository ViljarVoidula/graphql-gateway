import { Badge, Button, Card, Divider, Group, Stack, Text } from '@mantine/core';
import React from 'react';

export interface SessionStatusCardProps {
  timeToExpiry: number | null;
  autoRefreshEnabled: boolean;
  isRefreshing: boolean;
  onManualRefresh: () => void;
}

const getExpiryBadgeColor = (minutes: number | null): string => {
  if (minutes === null) {
    return 'gray';
  }
  if (minutes > 10) {
    return 'green';
  }
  if (minutes > 5) {
    return 'yellow';
  }
  return 'red';
};

export const SessionStatusCard: React.FC<SessionStatusCardProps> = ({
  timeToExpiry,
  autoRefreshEnabled,
  isRefreshing,
  onManualRefresh
}) => {
  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Stack spacing="md">
        <Text weight={500} size="md">
          Current Session Status
        </Text>

        <Group position="apart">
          <Text size="sm">Time until expiry:</Text>
          <Badge color={getExpiryBadgeColor(timeToExpiry)}>{timeToExpiry ? `${timeToExpiry} minutes` : 'Unknown'}</Badge>
        </Group>

        <Group position="apart">
          <Text size="sm">Auto-refresh status:</Text>
          <Badge color={autoRefreshEnabled ? 'green' : 'gray'}>{autoRefreshEnabled ? 'Enabled' : 'Disabled'}</Badge>
        </Group>

        <Divider />

        <Group spacing="sm">
          <Button
            variant="light"
            size="sm"
            onClick={onManualRefresh}
            loading={isRefreshing}
            disabled={!timeToExpiry || timeToExpiry <= 0}
          >
            Refresh Session Now
          </Button>
          <Text size="xs" color="dimmed">
            Manually extend your session by 15 minutes
          </Text>
        </Group>
      </Stack>
    </Card>
  );
};
