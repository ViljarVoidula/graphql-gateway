import { Alert, Button, Card, Group, Loader, NumberInput, Stack, Text } from '@mantine/core';
import { IconDatabase, IconInfoCircle } from '@tabler/icons-react';
import React from 'react';

export interface AuditRetentionCardProps {
  loading: boolean;
  error: string | null;
  value: number | null;
  onChange: (value: number | null) => void;
  onReset: () => void;
  showReset: boolean;
}

export const AuditRetentionCard: React.FC<AuditRetentionCardProps> = ({
  loading,
  error,
  value,
  onChange,
  onReset,
  showReset
}) => {
  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Stack spacing="md">
        <Group spacing="sm">
          <IconDatabase size={20} />
          <Text weight={500} size="md">
            Audit Log Retention
          </Text>
        </Group>

        {loading ? (
          <Group>
            <Loader size="sm" />
            <Text size="sm">Loading current retention...</Text>
          </Group>
        ) : error ? (
          <Alert color="red" title="Failed to load" icon={<IconInfoCircle size={16} />}>
            {error}
          </Alert>
        ) : (
          <>
            <NumberInput
              label="Retention (days)"
              description="How long audit log entries are kept before eligible for cleanup"
              min={1}
              max={1825}
              value={value === null ? undefined : value}
              onChange={(val) => onChange(typeof val === 'number' ? val : value)}
            />
            {showReset && (
              <Group spacing="sm">
                <Button variant="subtle" size="xs" onClick={onReset}>
                  Reset to saved value
                </Button>
              </Group>
            )}

            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              <Text size="xs">
                Increasing retention increases storage usage. The cleanup job runs periodically based on configured cleanup
                interval; changes apply to newly written logs immediately.
              </Text>
            </Alert>
          </>
        )}
      </Stack>
    </Card>
  );
};
