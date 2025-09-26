import { Alert, Card, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';

export const HowItWorksCard: React.FC = () => {
  return (
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
  );
};
