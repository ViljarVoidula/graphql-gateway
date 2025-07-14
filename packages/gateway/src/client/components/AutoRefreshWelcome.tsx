import { Button, Group, Notification, Text } from '@mantine/core';
import { IconSettings, IconShield } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { setAutoRefreshEnabled } from '../utils/auth';

export const AutoRefreshWelcome: React.FC = () => {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Check if this is the first time user is seeing auto-refresh
    const hasSeenWelcome = localStorage.getItem('hasSeenAutoRefreshWelcome');
    const hasValidTokens = localStorage.getItem('accessToken') && localStorage.getItem('refreshToken');

    if (!hasSeenWelcome && hasValidTokens) {
      setShowWelcome(true);
    }
  }, []);

  const handleAccept = () => {
    setAutoRefreshEnabled(true);
    localStorage.setItem('hasSeenAutoRefreshWelcome', 'true');
    setShowWelcome(false);
  };

  const handleDecline = () => {
    setAutoRefreshEnabled(false);
    localStorage.setItem('hasSeenAutoRefreshWelcome', 'true');
    setShowWelcome(false);
  };

  if (!showWelcome) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 1000,
        width: 400
      }}
    >
      <Notification
        icon={<IconShield size={16} />}
        color="blue"
        title="Auto Session Refresh Available"
        onClose={() => setShowWelcome(false)}
      >
        <Text size="sm" mb="md">
          ✨ Auto session refresh is now enabled by default! Your sessions will be automatically extended in the background. You
          can adjust this in the sidebar session panel or settings.
        </Text>

        <Group spacing="xs">
          <Button size="xs" variant="light" onClick={handleAccept}>
            Got it!
          </Button>
          <Button
            size="xs"
            variant="subtle"
            leftIcon={<IconSettings size={12} />}
            onClick={() => {
              window.location.href = '/settings';
              setShowWelcome(false);
            }}
          >
            Settings
          </Button>
        </Group>
      </Notification>
    </div>
  );
};
