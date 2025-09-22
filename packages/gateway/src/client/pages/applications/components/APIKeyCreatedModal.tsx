import { Alert, Box, Button, Code, Group, Modal, Stack, Text } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import React from 'react';

interface APIKeyCreatedModalProps {
  opened: boolean;
  onClose: () => void;
  createdKey: string | null;
}

export const APIKeyCreatedModal: React.FC<APIKeyCreatedModalProps> = ({ opened, onClose, createdKey }) => {
  return (
    <Modal opened={opened} onClose={onClose} title="API Key Created">
      <Stack>
        <Alert icon={<IconCheck />} color="green">
          Copy your API key now. You won't be able to see it again.
        </Alert>
        {createdKey && (
          <Box>
            <Group position="apart" mb="xs">
              <Text size="sm" weight={500}>
                API Key
              </Text>
              <Button
                variant="light"
                size="xs"
                leftIcon={<IconCopy size={14} />}
                onClick={() => navigator.clipboard?.writeText(createdKey)}
              >
                Copy
              </Button>
            </Group>
            <Code block>{createdKey}</Code>
          </Box>
        )}
        <Group position="right">
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    </Modal>
  );
};
