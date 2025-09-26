import {
  Alert,
  Button,
  Group,
  Modal,
  MultiSelect,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import React from 'react';
import type { ParsedSDL } from '../../../../utils/sdl-parser';
import { PermissionTemplate } from './types';

interface TemplateModalProps {
  opened: boolean;
  onClose: () => void;
  editingTemplate: PermissionTemplate | null;
  templateName: string;
  setTemplateName: (name: string) => void;
  templateRoleKey: string;
  setTemplateRoleKey: (key: string) => void;
  templateDescription: string;
  setTemplateDescription: (description: string) => void;
  templateTags: string[];
  setTemplateTags: (tags: string[]) => void;
  templatePermissions: string[];
  setTemplatePermissions: (permissions: string[]) => void;
  permissionOptions: Array<{ value: string; label: string }>;
  parsedSDL: ParsedSDL | null;
  onSubmit: () => void;
  isLoading: boolean;
}

export const TemplateModal: React.FC<TemplateModalProps> = ({
  opened,
  onClose,
  editingTemplate,
  templateName,
  setTemplateName,
  templateRoleKey,
  setTemplateRoleKey,
  templateDescription,
  setTemplateDescription,
  templateTags,
  setTemplateTags,
  templatePermissions,
  setTemplatePermissions,
  permissionOptions,
  parsedSDL,
  onSubmit,
  isLoading,
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editingTemplate ? 'Edit template' : 'Create role template'}
      size="lg"
      centered
    >
      <Stack spacing="md">
        <TextInput
          label="Template name"
          placeholder="e.g., Service Admin, Read Only User"
          value={templateName}
          onChange={(event) => setTemplateName(event.currentTarget.value)}
          required
        />

        <TextInput
          label="Role key"
          placeholder="e.g., admin, viewer, editor"
          value={templateRoleKey}
          onChange={(event) => setTemplateRoleKey(event.currentTarget.value)}
          required
        />

        <TextInput
          label="Description"
          placeholder="Describe what this role template is for"
          value={templateDescription}
          onChange={(event) =>
            setTemplateDescription(event.currentTarget.value)
          }
        />

        <MultiSelect
          label="Tags"
          placeholder="Add tags for organization"
          data={[]}
          value={templateTags}
          onChange={setTemplateTags}
          searchable
          creatable
          getCreateLabel={(query) => `+ Create "${query}"`}
          onCreate={(query) => {
            const item = { value: query, label: query };
            return item;
          }}
        />

        <MultiSelect
          label="Default permissions"
          description={
            parsedSDL
              ? `Select from ${permissionOptions.length} discovered permissions and any custom ones`
              : 'Select which permissions this template should include by default'
          }
          data={permissionOptions}
          value={templatePermissions}
          onChange={(values) =>
            setTemplatePermissions(Array.from(new Set(values)))
          }
          searchable
          nothingFound="No permissions available"
          maxDropdownHeight={300}
        />

        {parsedSDL && (
          <Alert color="blue" variant="light">
            <Text size="sm">
              <strong>Schema info:</strong> {parsedSDL.operations.length}{' '}
              operations available (
              {parsedSDL.operations.filter((op) => op.type === 'Query').length}{' '}
              queries,
              {
                parsedSDL.operations.filter((op) => op.type === 'Mutation')
                  .length
              }{' '}
              mutations,
              {
                parsedSDL.operations.filter((op) => op.type === 'Subscription')
                  .length
              }{' '}
              subscriptions)
            </Text>
          </Alert>
        )}

        <Group position="right" spacing="sm" mt="sm">
          <Button variant="light" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={isLoading}>
            {editingTemplate ? 'Save changes' : 'Create template'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
