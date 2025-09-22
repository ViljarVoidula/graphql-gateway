import { Card, Group, Stack, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import React from 'react';

interface BasicInformationProps {
  app: {
    name: string;
    description?: string;
    owner?: {
      email: string;
    };
    ownerId?: string;
  };
}

export const BasicInformation: React.FC<BasicInformationProps> = ({ app }) => {
  return (
    <Card shadow="xs" p="xl" radius="lg" withBorder style={{ backgroundColor: 'white' }}>
      <Group spacing="sm" mb="xl">
        <ThemeIcon size="md" radius="md" variant="light" color="blue">
          <IconSettings size={18} />
        </ThemeIcon>
        <Title order={3} weight={600}>
          Basic Information
        </Title>
      </Group>
      <Stack spacing="lg">
        <TextInput label="Name" value={app.name} readOnly styles={{ label: { fontWeight: 500, fontSize: '14px' } }} />
        <TextInput
          label="Description"
          value={app.description || 'No description provided'}
          readOnly
          styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
        />
        <TextInput
          label="Owner"
          value={app.owner?.email || app.ownerId}
          readOnly
          styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
        />
      </Stack>
    </Card>
  );
};
