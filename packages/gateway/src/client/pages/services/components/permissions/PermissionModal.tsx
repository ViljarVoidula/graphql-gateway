import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import React from 'react';
import type { ParsedSDL } from '../../../../utils/sdl-parser';
import { ACCESS_OPTIONS, AccessLevel, OperationType } from './types';

interface PermissionModalProps {
  opened: boolean;
  onClose: () => void;
  permissionOperationType: OperationType;
  setPermissionOperationType: (type: OperationType) => void;
  permissionOperationName: string;
  setPermissionOperationName: (name: string) => void;
  permissionFieldPath: string;
  setPermissionFieldPath: (path: string) => void;
  permissionAccessLevel: AccessLevel;
  setPermissionAccessLevel: (level: AccessLevel) => void;
  parsedSDL: ParsedSDL | null;
  operationOptions: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  fieldPathOptions: Array<{
    value: string;
    label: string;
    description?: string;
  }>;
  onSubmit: () => void;
  isLoading: boolean;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  opened,
  onClose,
  permissionOperationType,
  setPermissionOperationType,
  permissionOperationName,
  setPermissionOperationName,
  permissionFieldPath,
  setPermissionFieldPath,
  permissionAccessLevel,
  setPermissionAccessLevel,
  parsedSDL,
  operationOptions,
  fieldPathOptions,
  onSubmit,
  isLoading,
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create custom permission"
      size="lg"
      centered
    >
      <Stack spacing="md">
        {!parsedSDL && (
          <Alert icon={<IconAlertCircle size={16} />} color="blue">
            SDL schema not available for this service. You can still create
            custom permissions manually.
          </Alert>
        )}

        <Select
          label="Operation type"
          data={[
            { value: 'QUERY', label: 'Query' },
            { value: 'MUTATION', label: 'Mutation' },
            { value: 'SUBSCRIPTION', label: 'Subscription' },
          ]}
          value={permissionOperationType}
          onChange={(value) =>
            value && setPermissionOperationType(value as OperationType)
          }
          required
        />

        {parsedSDL && operationOptions.length > 0 ? (
          <Select
            label="Operation name"
            placeholder="Select an operation from the schema"
            data={operationOptions}
            value={permissionOperationName}
            onChange={(value) => setPermissionOperationName(value || '')}
            searchable
            nothingFound="No operations found for this type"
            description={
              operationOptions.find(
                (op) => op.value === permissionOperationName
              )?.description ||
              'Select a GraphQL operation from the service schema'
            }
            required
          />
        ) : (
          <TextInput
            label="Operation name"
            placeholder="e.g., getUser, updateService"
            value={permissionOperationName}
            onChange={(event) =>
              setPermissionOperationName(event.currentTarget.value)
            }
            description="Enter the GraphQL operation name manually"
            required
          />
        )}

        {parsedSDL && permissionOperationName && fieldPathOptions.length > 1 ? (
          <Select
            label="Field path"
            placeholder="Select field access scope"
            data={fieldPathOptions}
            value={permissionFieldPath}
            onChange={(value) => setPermissionFieldPath(value || '*')}
            description={
              fieldPathOptions.find(
                (field) => field.value === permissionFieldPath
              )?.description || 'Choose which fields this permission controls'
            }
            searchable
          />
        ) : (
          <TextInput
            label="Field path (optional)"
            placeholder="e.g., user.email, service.config"
            value={permissionFieldPath}
            onChange={(event) =>
              setPermissionFieldPath(event.currentTarget.value)
            }
            description="Leave empty or use '*' for full operation access"
          />
        )}

        <Select
          label="Default access level"
          data={ACCESS_OPTIONS as any}
          value={permissionAccessLevel}
          onChange={(value) =>
            value && setPermissionAccessLevel(value as AccessLevel)
          }
          description="Define the type of access this permission grants"
          required
        />

        {parsedSDL && (
          <Alert color="green" variant="light">
            <Text size="sm">
              <strong>Schema detected:</strong> Found{' '}
              {parsedSDL.operations.length} operations across{' '}
              {parsedSDL.types.length} types
            </Text>
          </Alert>
        )}

        <Group position="right" spacing="sm" mt="sm">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={isLoading}>
            Create permission
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
