import { ActionIcon, Badge, Button, Group, Popover, Progress, Stack, Switch, Text } from '@mantine/core';
import { useLogout } from '@refinedev/core';
import { IconClock, IconLogout, IconRefresh, IconSettings } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTokenTimeToExpiry, isAutoRefreshEnabled, refreshAuthToken, setAutoRefreshEnabled } from '../utils/auth';

export const SessionStatus: React.FC = () => {
  const [timeToExpiry, setTimeToExpiry] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [opened, setOpened] = useState(false);
  const { mutate: logout } = useLogout();
  const navigate = useNavigate();

  console.log('SessionStatus: Component rendering');

  useEffect(() => {
    const updateTimeToExpiry = () => {
      const newTimeToExpiry = getTokenTimeToExpiry();
      console.log('SessionStatus: Time to expiry:', newTimeToExpiry);
      setTimeToExpiry(newTimeToExpiry);
      setIsLoading(false);
    };

    const updateAutoRefreshStatus = () => {
      const enabled = isAutoRefreshEnabled();
      console.log('SessionStatus: Auto-refresh enabled:', enabled);
      setAutoRefreshEnabledState(enabled);
    };

    // Update immediately
    updateTimeToExpiry();
    updateAutoRefreshStatus();

    // Update every 30 seconds
    const interval = setInterval(updateTimeToExpiry, 30 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleAutoRefreshToggle = (enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
    setAutoRefreshEnabledState(enabled);
  };

  const handleRefreshToken = async () => {
    setIsRefreshing(true);
    try {
      await refreshAuthToken();
      setTimeToExpiry(getTokenTimeToExpiry());
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
    setIsRefreshing(false);
  };

  const handleLogout = () => {
    logout();
  };

  // Always show the component, even if loading
  const hasTokens = localStorage.getItem('accessToken') && localStorage.getItem('refreshToken');

  console.log('SessionStatus: Rendering with timeToExpiry:', timeToExpiry, 'hasTokens:', hasTokens, 'isLoading:', isLoading);

  const getStatusColor = (minutes: number) => {
    if (minutes > 10) return 'green';
    if (minutes > 5) return 'yellow';
    return 'red';
  };

  const getProgressValue = (minutes: number) => {
    // Assuming 15 minutes is the full token lifetime
    const maxMinutes = 15;
    return Math.max(0, Math.min(100, (minutes / maxMinutes) * 100));
  };

  // Compact header version
  const trigger = (
    <Group spacing="xs" style={{ cursor: 'pointer' }}>
      <IconClock size={16} />
      <Text size="sm" weight={500}>
        {isLoading ? 'Loading...' : timeToExpiry !== null && timeToExpiry > 0 ? `${timeToExpiry}m` : 'Expired'}
      </Text>
      <Badge size="xs" color={timeToExpiry !== null && timeToExpiry > 0 ? getStatusColor(timeToExpiry) : 'gray'}>
        {autoRefreshEnabled ? 'Auto' : 'Manual'}
      </Badge>
    </Group>
  );

  return (
    <Popover opened={opened} onClose={() => setOpened(false)} position="bottom-end" withArrow shadow="md" width={280}>
      <Popover.Target>
        <div onClick={() => setOpened(!opened)}>{trigger}</div>
      </Popover.Target>

      <Popover.Dropdown>
        <Stack spacing="sm">
          <Group position="apart">
            <Text size="sm" weight={500}>
              Session Status
            </Text>
            <Badge color={timeToExpiry !== null && timeToExpiry > 0 ? getStatusColor(timeToExpiry) : 'gray'} size="xs">
              {timeToExpiry !== null && timeToExpiry > 0 ? 'Active' : 'Expired'}
            </Badge>
          </Group>

          <Group spacing="xs">
            <IconClock size={14} />
            <Text size="xs" color="dimmed">
              {timeToExpiry !== null && timeToExpiry > 0 ? `Expires in ${timeToExpiry} minutes` : 'Session expired'}
            </Text>
          </Group>

          {timeToExpiry !== null && timeToExpiry > 0 && (
            <Progress value={getProgressValue(timeToExpiry)} color={getStatusColor(timeToExpiry)} size="xs" radius="xl" />
          )}

          <Switch
            label="Auto-refresh"
            description="Automatically extend session"
            checked={autoRefreshEnabled}
            onChange={(event) => handleAutoRefreshToggle(event.currentTarget.checked)}
            size="sm"
          />

          <Group spacing="xs">
            <Button
              size="xs"
              variant="light"
              leftIcon={<IconRefresh size={12} />}
              onClick={handleRefreshToken}
              loading={isRefreshing}
              disabled={timeToExpiry === null || timeToExpiry <= 0}
              style={{ flex: 1 }}
            >
              Refresh
            </Button>
            <ActionIcon
              size="sm"
              variant="light"
              onClick={() => {
                navigate('/settings');
                setOpened(false);
              }}
            >
              <IconSettings size={12} />
            </ActionIcon>
          </Group>

          <Button size="xs" variant="light" color="red" leftIcon={<IconLogout size={12} />} onClick={handleLogout} fullWidth>
            Logout
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};
