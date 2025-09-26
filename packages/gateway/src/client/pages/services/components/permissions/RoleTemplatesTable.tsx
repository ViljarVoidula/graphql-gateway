import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconEdit,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import React from 'react';
import { PermissionTemplate } from './types';

interface RoleTemplatesTableProps {
  templates: PermissionTemplate[];
  onEditTemplate: (template: PermissionTemplate) => void;
  onDeleteTemplate: (template: PermissionTemplate) => void;
  onCreateTemplate: () => void;
  isDeletingTemplate: boolean;
}

export const RoleTemplatesTable: React.FC<RoleTemplatesTableProps> = ({
  templates,
  onEditTemplate,
  onDeleteTemplate,
  onCreateTemplate,
  isDeletingTemplate,
}) => {
  if (templates.length === 0) {
    return (
      <Stack spacing="sm">
        <Group position="apart" align="center">
          <Title order={4}>Role templates</Title>
          <Button
            size="sm"
            variant="light"
            leftIcon={<IconPlus size={14} />}
            onClick={onCreateTemplate}
          >
            Create template
          </Button>
        </Group>
        <Alert icon={<IconAlertCircle size={16} />} color="blue">
          No role templates created yet. Templates define reusable permission
          sets for user assignments.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing="sm">
      <Group position="apart" align="center">
        <Title order={4}>Role templates</Title>
        <Button
          size="sm"
          variant="light"
          leftIcon={<IconPlus size={14} />}
          onClick={onCreateTemplate}
        >
          Create template
        </Button>
      </Group>

      <ScrollArea>
        <Table verticalSpacing="sm" highlightOnHover>
          <thead>
            <tr>
              <th>Template</th>
              <th>Role Key</th>
              <th>Description</th>
              <th>Permissions</th>
              <th>Tags</th>
              <th>Updated</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>
                  <Text weight={500}>{template.name}</Text>
                </td>
                <td>
                  <Badge variant="light" color="blue">
                    {template.roleKey}
                  </Badge>
                </td>
                <td>
                  <Text size="sm" color="dimmed">
                    {template.description || 'No description'}
                  </Text>
                </td>
                <td>
                  <Badge color="gray" variant="light">
                    {template.permissions.length} permissions
                  </Badge>
                </td>
                <td>
                  {template.tags && template.tags.length > 0 ? (
                    <Group spacing={4}>
                      {template.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} size="xs" variant="outline">
                          {tag}
                        </Badge>
                      ))}
                      {template.tags.length > 2 && (
                        <Badge size="xs" variant="outline" color="gray">
                          +{template.tags.length - 2}
                        </Badge>
                      )}
                    </Group>
                  ) : (
                    <Text size="sm" color="dimmed">
                      None
                    </Text>
                  )}
                </td>
                <td>{new Date(template.updatedAt).toLocaleString()}</td>
                <td>
                  <Group spacing="xs">
                    <Tooltip label="Edit template">
                      <ActionIcon
                        variant="light"
                        color="blue"
                        onClick={() => onEditTemplate(template)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete template">
                      <ActionIcon
                        variant="light"
                        color="red"
                        onClick={() => onDeleteTemplate(template)}
                        disabled={isDeletingTemplate}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
};
