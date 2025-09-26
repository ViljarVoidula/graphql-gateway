import { Alert, Button, Card, Group, Loader, Select, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React from 'react';

export type DocumentationMode = 'DISABLED' | 'PREVIEW' | 'ENABLED';

export interface PublicDocsModeCardProps {
  loading: boolean;
  error: string | null;
  value: DocumentationMode | null;
  onChange: (value: DocumentationMode | null) => void;
  onReset: () => void;
  showReset: boolean;
}

export const PublicDocsModeCard: React.FC<PublicDocsModeCardProps> = ({
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
          <IconInfoCircle size={20} />
          <Text weight={500} size="md">
            Public Documentation Mode
          </Text>
        </Group>

        {loading ? (
          <Group>
            <Loader size="sm" />
            <Text size="sm">Loading current mode...</Text>
          </Group>
        ) : error ? (
          <Alert color="red" title="Failed to load" icon={<IconInfoCircle size={16} />}>
            {error}
          </Alert>
        ) : (
          <>
            <Select
              label="Mode"
              description="Controls visibility of published API documentation pages"
              value={value ?? undefined}
              onChange={(val) => onChange((val as DocumentationMode) || null)}
              data={[
                {
                  value: 'DISABLED',
                  label: 'Disabled (hidden from all users)'
                },
                {
                  value: 'PREVIEW',
                  label: 'Preview (only authenticated users)'
                },
                {
                  value: 'ENABLED',
                  label: 'Enabled (publicly accessible)'
                }
              ]}
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
                <strong>DISABLED:</strong> No documentation pages are served.
                <strong> PREVIEW:</strong> Accessible only to authenticated users. <strong>ENABLED:</strong> Publicly accessible
                without authentication.
              </Text>
            </Alert>
          </>
        )}
      </Stack>
    </Card>
  );
};
