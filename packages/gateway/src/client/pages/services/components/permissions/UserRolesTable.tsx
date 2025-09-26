import {
  ActionIcon,
  Badge,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import React from 'react';
import { UserServiceRole } from './types';

interface UserRolesTableProps {
  roles: UserServiceRole[];
  onEditRole: (role: UserServiceRole) => void;
  onRemoveRole: (role: UserServiceRole) => void;
  isRemovingRole: boolean;
}

export const UserRolesTable: React.FC<UserRolesTableProps> = ({
  roles,
  onEditRole,
  onRemoveRole,
  isRemovingRole,
}) => {
  return (
    <Stack spacing="sm">
      <Title order={4}>User service roles</Title>
      <ScrollArea>
        <Table verticalSpacing="sm" highlightOnHover>
          <thead>
            <tr>
              <th>User</th>
              <th>Display Name</th>
              <th>Template</th>
              <th>Custom Permissions</th>
              <th>Updated</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <Text size="sm" color="dimmed">
                    No user-specific roles assigned yet.
                  </Text>
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id}>
                  <td>
                    <Stack spacing={0}>
                      <Text weight={500}>{role.user.email}</Text>
                      <Text size="xs" color="dimmed">
                        {role.roleNamespace ?? 'service'}
                      </Text>
                    </Stack>
                  </td>
                  <td>{role.displayName || role.roleKey}</td>
                  <td>
                    {role.template ? (
                      <Badge variant="light" color="blue">
                        {role.template.name}
                      </Badge>
                    ) : (
                      <Text size="sm" color="dimmed">
                        custom
                      </Text>
                    )}
                  </td>
                  <td>
                    {role.permissions.length > 0 ? (
                      <Badge color="gray" variant="light">
                        {role.permissions.length}
                      </Badge>
                    ) : (
                      <Text size="sm" color="dimmed">
                        None
                      </Text>
                    )}
                  </td>
                  <td>{new Date(role.updatedAt).toLocaleString()}</td>
                  <td>
                    <Group spacing="xs">
                      <Tooltip label="Edit role">
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={() => onEditRole(role)}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Remove role">
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={() => onRemoveRole(role)}
                          disabled={isRemovingRole}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
};
