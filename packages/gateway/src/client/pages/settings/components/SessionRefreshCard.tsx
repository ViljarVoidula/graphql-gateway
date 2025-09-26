import { Alert, Card, Group, Stack, Switch, Text } from '@mantine/core';
import { IconClock, IconInfoCircle, IconShield } from '@tabler/icons-react';
import React from 'react';

export interface SessionRefreshCardProps {
  autoRefreshEnabled: boolean;
  onToggle: (value: boolean) => void;
}

export const SessionRefreshCard: React.FC<SessionRefreshCardProps> = ({ autoRefreshEnabled, onToggle }) => {
  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Stack spacing="md">
        <Group position="apart">
          <div>
            <Text weight={500} size="md">
              Automatic Session Refresh
            </Text>
            <Text size="sm" color="dimmed">
              Keep your session active in the background
            </Text>
          </div>
          <Switch
            checked={autoRefreshEnabled}
            onChange={(event) => onToggle(event.currentTarget.checked)}
            size="lg"
            onLabel="ON"
            offLabel="OFF"
          />
        </Group>

        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          <Text size="sm">
            When enabled, your session will be automatically refreshed 2 minutes before expiry. This keeps you logged in for up
            to 7 days without interruption.
          </Text>
        </Alert>

        {autoRefreshEnabled ? (
          <Group spacing="xs">
            <IconShield size={16} color="green" />
            <Text size="sm" color="green">
              Auto-refresh is active — your session will be maintained automatically.
            </Text>
          </Group>
        ) : (
          <Group spacing="xs">
            <IconClock size={16} color="orange" />
            <Text size="sm" color="orange">
              Manual mode — you'll need to refresh your session manually or re-login when it expires.
            </Text>
          </Group>
        )}
      </Stack>
    </Card>
  );
};
