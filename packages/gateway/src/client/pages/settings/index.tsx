import { Alert, Badge, Button, Card, Divider, Group, Stack, Switch, Text, Title } from '@mantine/core';
import { IconClock, IconInfoCircle, IconSettings, IconShield } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { getTokenTimeToExpiry, isAutoRefreshEnabled, refreshAuthToken, setAutoRefreshEnabled } from '../../utils/auth';

export const SessionSettings: React.FC = () => {
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(true);
  const [timeToExpiry, setTimeToExpiry] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Load current settings
    setAutoRefreshEnabledState(isAutoRefreshEnabled());
    setTimeToExpiry(getTokenTimeToExpiry());

    // Update time every 30 seconds
    const interval = setInterval(() => {
      setTimeToExpiry(getTokenTimeToExpiry());
    }, 30 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleAutoRefreshToggle = (enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
    setAutoRefreshEnabledState(enabled);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshAuthToken();
      setTimeToExpiry(getTokenTimeToExpiry());
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
    setIsRefreshing(false);
  };

  return (
    <Stack spacing="lg">
      <Group spacing="sm">
        <IconSettings size={24} />
        <Title order={2}>Session Settings</Title>
      </Group>

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
              onChange={(event) => handleAutoRefreshToggle(event.currentTarget.checked)}
              size="lg"
              onLabel="ON"
              offLabel="OFF"
            />
          </Group>

          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            <Text size="sm">
              When enabled, your session will be automatically refreshed 2 minutes before expiry. This keeps you logged in for
              up to 7 days without interruption.
            </Text>
          </Alert>

          {autoRefreshEnabled && (
            <Group spacing="xs">
              <IconShield size={16} color="green" />
              <Text size="sm" color="green">
                Auto-refresh is active - your session will be maintained automatically
              </Text>
            </Group>
          )}

          {!autoRefreshEnabled && (
            <Group spacing="xs">
              <IconClock size={16} color="orange" />
              <Text size="sm" color="orange">
                Manual mode - you'll need to refresh your session manually or re-login when it expires
              </Text>
            </Group>
          )}
        </Stack>
      </Card>

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Text weight={500} size="md">
            Current Session Status
          </Text>

          <Group position="apart">
            <Text size="sm">Time until expiry:</Text>
            <Badge color={timeToExpiry && timeToExpiry > 10 ? 'green' : timeToExpiry && timeToExpiry > 5 ? 'yellow' : 'red'}>
              {timeToExpiry ? `${timeToExpiry} minutes` : 'Unknown'}
            </Badge>
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
              onClick={handleManualRefresh}
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

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Text weight={500} size="md">
            How It Works
          </Text>

          <Stack spacing="xs">
            <Text size="sm">
              • <strong>Access Tokens:</strong> Valid for 15 minutes
            </Text>
            <Text size="sm">
              • <strong>Refresh Tokens:</strong> Valid for 7 days
            </Text>
            <Text size="sm">
              • <strong>Auto-refresh:</strong> Triggers 2 minutes before token expiry
            </Text>
            <Text size="sm">
              • <strong>Maximum Session:</strong> Up to 7 days with auto-refresh enabled
            </Text>
          </Stack>

          <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
            <Text size="sm">
              <strong>Security Note:</strong> Short-lived access tokens (15 minutes) provide better security while automatic
              refresh ensures convenience. You can disable auto-refresh if you prefer manual control over your session duration.
            </Text>
          </Alert>
        </Stack>
      </Card>
    </Stack>
  );
};
