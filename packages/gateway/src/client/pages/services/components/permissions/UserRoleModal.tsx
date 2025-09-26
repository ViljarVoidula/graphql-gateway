import {
  Button,
  Group,
  Modal,
  MultiSelect,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import React from 'react';
import { PermissionTemplate, UserServiceRole } from './types';

interface UserRoleModalProps {
  opened: boolean;
  onClose: () => void;
  editingRole: UserServiceRole | null;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  selectedTemplateId: string | null;
  setSelectedTemplateId: (id: string | null) => void;
  customPermissions: string[];
  setCustomPermissions: (permissions: string[]) => void;
  displayName: string;
  setDisplayName: (name: string) => void;
  userOptions: Array<{ value: string; label: string }>;
  templateOptions: Array<{ value: string; label: string }>;
  permissionOptions: Array<{ value: string; label: string }>;
  templates: PermissionTemplate[];
  serviceName: string;
  onSubmit: () => void;
  isLoading: boolean;
  isLoadingUsers: boolean;
}

export const UserRoleModal: React.FC<UserRoleModalProps> = ({
  opened,
  onClose,
  editingRole,
  selectedUserId,
  setSelectedUserId,
  selectedTemplateId,
  setSelectedTemplateId,
  customPermissions,
  setCustomPermissions,
  displayName,
  setDisplayName,
  userOptions,
  templateOptions,
  permissionOptions,
  templates,
  serviceName,
  onSubmit,
  isLoading,
  isLoadingUsers,
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editingRole ? 'Edit service role' : 'Assign service role'}
      size="lg"
      centered
    >
      <Stack spacing="md">
        <Select
          label="User"
          placeholder={isLoadingUsers ? 'Loading users...' : 'Select user'}
          data={userOptions}
          value={selectedUserId}
          onChange={setSelectedUserId}
          disabled={!!editingRole}
          searchable
          nothingFound="No users found"
          withinPortal
        />

        <Select
          label="Role template"
          placeholder="Select template"
          data={templateOptions}
          value={selectedTemplateId}
          onChange={(value) => {
            setSelectedTemplateId(value);
            if (!editingRole && value) {
              const template = templates.find((item) => item.id === value);
              if (template) {
                setDisplayName(`${serviceName} ${template.name}`);
              }
            }
          }}
          nothingFound="No templates available"
          withinPortal
        />

        <MultiSelect
          label="Additional permissions"
          description="Optional: grant extra permissions on top of the template"
          data={permissionOptions}
          value={customPermissions}
          onChange={(values) =>
            setCustomPermissions(Array.from(new Set(values)))
          }
          searchable
          nothingFound="No permissions"
          withinPortal
        />

        <TextInput
          label="Display name"
          placeholder="Friendly label shown in the UI"
          value={displayName}
          onChange={(event) => setDisplayName(event.currentTarget.value)}
        />

        <Group position="right" spacing="sm" mt="sm">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={isLoading}>
            {editingRole ? 'Save changes' : 'Assign role'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
