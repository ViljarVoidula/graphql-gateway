import React from 'react';
import { useList } from '@refinedev/core';
import {
  Table,
  Group,
  Badge,
  Text,
  Title,
  Button,
  Stack,
  TextInput,
  Paper,
  LoadingOverlay,
  Alert,
} from '@mantine/core';
import { IconSearch, IconPlus, IconAlertCircle } from '@tabler/icons-react';

export const UserList: React.FC = () => {
  const [searchValue, setSearchValue] = React.useState('');
  
  const { data, isLoading, isError, error, refetch } = useList({
    resource: 'users',
  });

  const users = data?.data || [];

  const filteredUsers = users.filter((user: any) =>
    user.email.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <Stack spacing="lg">
      <Group position="apart">
        <Title order={2}>Users</Title>
        <Button leftIcon={<IconPlus size={16} />} disabled>
          Create User
        </Button>
      </Group>

      {isError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {error?.message || 'Failed to load users'}
        </Alert>
      )}

      <Group position="apart">
        <TextInput
          placeholder="Search users by email..."
          icon={<IconSearch size={16} />}
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          style={{ minWidth: 300 }}
        />
        <Button variant="light" onClick={() => refetch()}>
          Refresh
        </Button>
      </Group>

      <Paper withBorder>
        <LoadingOverlay visible={isLoading} />
        <Table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Created</th>
              <th>Login Attempts</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  <Text color="dimmed">
                    {isLoading ? 'Loading...' : 'No users found'}
                  </Text>
                </td>
              </tr>
            ) : (
              filteredUsers.map((user: any) => (
                <tr key={user.id}>
                  <td>
                    <Text size="sm" weight={500}>
                      {user.email}
                    </Text>
                  </td>
                  <td>
                    <Group spacing="xs">
                      {user.permissions?.length > 0 ? (
                        user.permissions.map((permission: string) => (
                          <Badge key={permission} size="sm" variant="light">
                            {permission}
                          </Badge>
                        ))
                      ) : (
                        <Text size="sm" color="dimmed">No permissions</Text>
                      )}
                    </Group>
                  </td>
                  <td>
                    <Group spacing="xs">
                      <Badge
                        color={user.isEmailVerified ? 'green' : 'yellow'}
                        variant="light"
                      >
                        {user.isEmailVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                      {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                        <Badge color="red" variant="light">
                          Locked
                        </Badge>
                      )}
                    </Group>
                  </td>
                  <td>
                    <Text size="sm" color="dimmed">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </Text>
                  </td>
                  <td>
                    <Badge
                      color={user.failedLoginAttempts > 0 ? 'red' : 'green'}
                      variant="light"
                    >
                      {user.failedLoginAttempts || 0}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Paper>
    </Stack>
  );
};
