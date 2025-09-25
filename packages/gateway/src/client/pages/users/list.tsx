import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useDelete, useList } from '@refinedev/core';
import {
  IconAlertCircle,
  IconEdit,
  IconEye,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconTrash,
} from '@tabler/icons-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

type SortKey =
  | 'email'
  | 'createdAt'
  | 'failedLoginAttempts'
  | 'isEmailVerified';

export const UserList: React.FC = () => {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = React.useState('');
  const [userToDelete, setUserToDelete] = React.useState<any>(null);
  const [sortConfig, setSortConfig] = React.useState<{
    key: SortKey;
    direction: 'asc' | 'desc';
  }>({
    key: 'createdAt',
    direction: 'desc',
  });

  const { data, isLoading, isError, error, refetch } = useList({
    resource: 'users',
  });

  const { mutate: deleteUser, isLoading: isDeleting } = useDelete();

  const users = data?.data || [];

  const sanitizedSearch = searchValue.trim().toLowerCase();

  const displayedUsers = React.useMemo(() => {
    const filtered = users.filter((user: any) =>
      user.email.toLowerCase().includes(sanitizedSearch)
    );

    const sorted = [...filtered].sort((a: any, b: any) => {
      const directionFactor = sortConfig.direction === 'asc' ? 1 : -1;

      switch (sortConfig.key) {
        case 'email':
          return directionFactor * a.email.localeCompare(b.email);
        case 'createdAt':
          return (
            directionFactor *
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          );
        case 'failedLoginAttempts':
          return (
            directionFactor *
            ((a.failedLoginAttempts || 0) - (b.failedLoginAttempts || 0))
          );
        case 'isEmailVerified':
          return (
            directionFactor *
            ((a.isEmailVerified ? 1 : 0) - (b.isEmailVerified ? 1 : 0))
          );
        default:
          return 0;
      }
    });

    return sorted;
  }, [users, sanitizedSearch, sortConfig]);

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'createdAt' ? 'desc' : 'asc' }
    );
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) {
      return <IconSelector size={14} />;
    }
    return sortConfig.direction === 'asc' ? (
      <IconSortAscending size={14} />
    ) : (
      <IconSortDescending size={14} />
    );
  };

  const confirmDelete = () => {
    if (!userToDelete) return;

    deleteUser(
      {
        resource: 'users',
        id: userToDelete.id,
      },
      {
        onSuccess: () => {
          setUserToDelete(null);
          refetch();
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to delete user',
            color: 'red',
            icon: <IconAlertCircle />,
          });
        },
      }
    );
  };

  return (
    <>
      <Stack spacing="lg">
        <Group position="apart">
          <Title order={2}>Users</Title>
          <Button
            leftIcon={<IconPlus size={16} />}
            onClick={() => navigate('/users/create')}
          >
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
          <Button
            variant="light"
            leftIcon={<IconRefresh size={16} />}
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        </Group>

        <Paper withBorder>
          <LoadingOverlay visible={isLoading} />
          <Table striped highlightOnHover>
            <thead>
              <tr>
                <th>
                  <UnstyledButton
                    onClick={() => handleSort('email')}
                    style={{ width: '100%' }}
                  >
                    <Group spacing={4} position="apart">
                      <Text size="sm" weight={500}>
                        Email
                      </Text>
                      <Center>{renderSortIcon('email')}</Center>
                    </Group>
                  </UnstyledButton>
                </th>
                <th>Permissions</th>
                <th>
                  <UnstyledButton
                    onClick={() => handleSort('createdAt')}
                    style={{ width: '100%' }}
                  >
                    <Group spacing={4} position="apart">
                      <Text size="sm" weight={500}>
                        Created
                      </Text>
                      <Center>{renderSortIcon('createdAt')}</Center>
                    </Group>
                  </UnstyledButton>
                </th>
                <th>
                  <UnstyledButton
                    onClick={() => handleSort('failedLoginAttempts')}
                    style={{ width: '100%' }}
                  >
                    <Group spacing={4} position="apart">
                      <Text size="sm" weight={500}>
                        Login Attempts
                      </Text>
                      <Center>{renderSortIcon('failedLoginAttempts')}</Center>
                    </Group>
                  </UnstyledButton>
                </th>
                <th>
                  <UnstyledButton
                    onClick={() => handleSort('isEmailVerified')}
                    style={{ width: '100%' }}
                  >
                    <Group spacing={4} position="apart">
                      <Text size="sm" weight={500}>
                        Status
                      </Text>
                      <Center>{renderSortIcon('isEmailVerified')}</Center>
                    </Group>
                  </UnstyledButton>
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{ textAlign: 'center', padding: '2rem' }}
                  >
                    <Text color="dimmed">
                      {isLoading ? 'Loading...' : 'No users found'}
                    </Text>
                  </td>
                </tr>
              ) : (
                displayedUsers.map((user: any) => (
                  <tr key={user.id}>
                    <td>
                      <div>
                        <Text size="sm" weight={500}>
                          {user.email}
                        </Text>
                        <Text size="xs" color="dimmed">
                          ID: {user.id}
                        </Text>
                      </div>
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
                          <Text size="sm" color="dimmed">
                            No permissions
                          </Text>
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
                    <td>
                      <Group spacing="xs">
                        <Badge
                          color={user.isEmailVerified ? 'green' : 'yellow'}
                          variant="light"
                        >
                          {user.isEmailVerified ? 'Verified' : 'Unverified'}
                        </Badge>
                        {user.lockedUntil &&
                          new Date(user.lockedUntil) > new Date() && (
                            <Badge color="red" variant="light">
                              Locked
                            </Badge>
                          )}
                      </Group>
                    </td>
                    <td>
                      <Group spacing="xs">
                        <Tooltip label="View Details">
                          <ActionIcon
                            color="blue"
                            variant="light"
                            size="sm"
                            onClick={() => navigate(`/users/${user.id}`)}
                          >
                            <IconEye size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit User">
                          <ActionIcon
                            color="orange"
                            variant="light"
                            size="sm"
                            onClick={() => navigate(`/users/${user.id}/edit`)}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete User">
                          <ActionIcon
                            color="red"
                            variant="light"
                            size="sm"
                            onClick={() => handleDeleteUser(user)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Paper>

        {users.length > 0 && (
          <Group position="center">
            <Text size="sm" color="dimmed">
              Showing {displayedUsers.length} of {users.length} users
            </Text>
          </Group>
        )}
      </Stack>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="Delete User"
        size="md"
      >
        <Stack spacing="md">
          <Alert icon={<IconAlertCircle />} color="red">
            Are you sure you want to delete this user? This action cannot be
            undone and will invalidate all their sessions.
          </Alert>

          {userToDelete && (
            <Text size="sm">
              User: <strong>{userToDelete.email}</strong>
            </Text>
          )}

          <Group position="right">
            <Button variant="light" onClick={() => setUserToDelete(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDelete} loading={isDeleting}>
              Delete User
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
