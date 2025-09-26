import { Alert, Card, Group, Loader, Stack, Switch, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';

export interface FeatureToggleCardProps {
  id: string;
  icon?: React.ReactNode;
  title: string;
  headline: string;
  helperText: React.ReactNode;
  value: boolean | null;
  loading?: boolean;
  error?: string | null;
  onChange: (value: boolean) => void;
  actions?: React.ReactNode;
  info?: React.ReactNode;
  disabled?: boolean;
}

export const FeatureToggleCard: React.FC<FeatureToggleCardProps> = ({
  icon,
  title,
  headline,
  helperText,
  value,
  loading,
  error,
  onChange,
  actions,
  info,
  disabled
}) => {
  return (
    <Card shadow="sm" p="lg" radius="md" withBorder data-testid={`${title}-toggle`}>
      <Stack spacing="md">
        <Group spacing="sm">
          {icon}
          <Text weight={500} size="md">
            {title}
          </Text>
        </Group>

        {loading ? (
          <Group>
            <Loader size="sm" /> <Text size="sm">Loading setting...</Text>
          </Group>
        ) : (
          <>
            <Group position="apart" align="flex-start">
              <div>
                <Text weight={500} size="sm">
                  {headline}
                </Text>
                <Text size="xs" color="dimmed">
                  {helperText}
                </Text>
              </div>
              <Switch
                checked={!!value}
                onChange={(event) => onChange(event.currentTarget.checked)}
                onLabel="ON"
                offLabel="OFF"
                disabled={disabled}
              />
            </Group>

            {actions}

            {error && (
              <Alert color="red" title="Failed to update" icon={<IconInfoCircle size={16} />}>
                {error}
              </Alert>
            )}

            {info && (
              <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                <Text size="xs">{info}</Text>
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
};
