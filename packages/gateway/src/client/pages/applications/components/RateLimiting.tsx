import { Button, Group, Paper, Stack, Switch, TextInput, Title } from '@mantine/core';
import React from 'react';

interface RateLimitingProps {
  rateMinute: string;
  setRateMinute: (value: string) => void;
  rateDay: string;
  setRateDay: (value: string) => void;
  rateDisabled: boolean;
  setRateDisabled: (disabled: boolean) => void;
  onUpdateRateLimits: () => void;
}

export const RateLimiting: React.FC<RateLimitingProps> = ({
  rateMinute,
  setRateMinute,
  rateDay,
  setRateDay,
  rateDisabled,
  setRateDisabled,
  onUpdateRateLimits
}) => {
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack spacing="xs">
        <Title order={5}>Rate Limiting</Title>
        <Group grow>
          <TextInput
            label="Per Minute"
            type="number"
            placeholder="Unlimited"
            value={rateMinute}
            onChange={(e) => setRateMinute(e.currentTarget.value)}
            description="Leave empty for unlimited"
          />
          <TextInput
            label="Per Day"
            type="number"
            placeholder="Unlimited"
            value={rateDay}
            onChange={(e) => setRateDay(e.currentTarget.value)}
            description="Leave empty for unlimited"
          />
        </Group>
        <Switch
          label="Disable Rate Limiting"
          checked={rateDisabled}
          onChange={(e) => setRateDisabled(e.currentTarget.checked)}
          description="Temporarily turn off enforcement for this app"
        />
        <Group position="right">
          <Button size="xs" variant="light" onClick={onUpdateRateLimits}>
            Save Rate Limits
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
};
