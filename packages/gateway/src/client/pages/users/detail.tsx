import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  Title,
  Tooltip
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useDelete, useOne } from '@refinedev/core';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCalendar,
  IconClock,
  IconEdit,
  IconExclamationCircle,
  IconLock,
  IconMail,
  IconShield,
  IconTrash,
  IconUser
} from '@tabler/icons-react';
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const UserDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);

  const {
    data: userData,
    isLoading,
    error,
    refetch
  } = useOne({
    resource: 'users',
    id: id!
  });

  const { mutate: deleteUser, isLoading: isDeleting } = useDelete();

  const user = userData?.data;

  const handleDeleteUser = () => {
    deleteUser(
      {
        resource: 'users',
        id: id!
      },
      {
        onSuccess: () => {
          navigate('/users');
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to delete user',
            color: 'red',
            icon: <IconAlertCircle />
          });
        }
      }
    );
  };

  if (isLoading) {
    return (
      <Paper withBorder p="xl" style={{ position: 'relative' }}>
        <LoadingOverlay visible />
        <Title order={2}>Loading User...</Title>
      </Paper>
    );
  }

  if (error || !user) {
    return (
      <Stack spacing="lg">
        <Group>
          <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/users')}>
            Back to Users
          </Button>
          <Title order={2}>User Details</Title>
        </Group>
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
          {error?.message || 'User not found'}
        </Alert>
      </Stack>
    );
  }

  const isAccountLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <Stack spacing="lg">
      <Group position="apart">
        <Group>
          <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/users')}>
            Back to Users
          </Button>
          <Title order={2}>User Details</Title>
        </Group>

        <Group>
          <Tooltip label="Edit User">
            <ActionIcon color="blue" variant="light" onClick={() => navigate(`/users/${id}/edit`)}>
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Delete User">
            <ActionIcon color="red" variant="light" onClick={() => setDeleteModalOpen(true)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Grid>
        <Grid.Col md={8}>
          <Paper withBorder p="xl">
            <Stack spacing="lg">
              <Group>
                <IconUser size={24} />
                <div>
                  <Title order={3}>{user.email}</Title>
                  <Text size="sm" color="dimmed">
                    User ID: {user.id}
                  </Text>
                </div>
              </Group>

              <Divider />

              <Grid>
                <Grid.Col sm={6}>
                  <Stack spacing="sm">
                    <Text size="sm" color="dimmed">
                      <Group spacing="xs">
                        <IconMail size={14} />
                        <span>Email Address</span>
                      </Group>
                    </Text>
                    <Text>{user.email}</Text>
                  </Stack>
                </Grid.Col>

                <Grid.Col sm={6}>
                  <Stack spacing="sm">
                    <Text size="sm" color="dimmed">
                      <Group spacing="xs">
                        <IconShield size={14} />
                        <span>Permissions</span>
                      </Group>
                    </Text>
                    <Group spacing="xs">
                      {user.permissions?.map((permission: string) => (
                        <Badge key={permission} variant="light">
                          {permission}
                        </Badge>
                      ))}
                    </Group>
                  </Stack>
                </Grid.Col>

                <Grid.Col sm={6}>
                  <Stack spacing="sm">
                    <Text size="sm" color="dimmed">
                      Account Status
                    </Text>
                    <Group spacing="xs">
                      <Badge color={user.isEmailVerified ? 'green' : 'orange'} variant="light">
                        {user.isEmailVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                      {isAccountLocked && (
                        <Badge color="red" variant="light">
                          Locked
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                </Grid.Col>

                <Grid.Col sm={6}>
                  <Stack spacing="sm">
                    <Text size="sm" color="dimmed">
                      <Group spacing="xs">
                        <IconCalendar size={14} />
                        <span>Created</span>
                      </Group>
                    </Text>
                    <Text>{new Date(user.createdAt).toLocaleDateString()}</Text>
                  </Stack>
                </Grid.Col>

                {user.lastLoginAt && (
                  <Grid.Col sm={6}>
                    <Stack spacing="sm">
                      <Text size="sm" color="dimmed">
                        <Group spacing="xs">
                          <IconClock size={14} />
                          <span>Last Login</span>
                        </Group>
                      </Text>
                      <Text>{new Date(user.lastLoginAt).toLocaleDateString()}</Text>
                    </Stack>
                  </Grid.Col>
                )}
              </Grid>
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col md={4}>
          <Stack spacing="md">
            {/* Security Information */}
            <Card withBorder>
              <Stack spacing="sm">
                <Group>
                  <IconLock size={20} />
                  <Text weight={500}>Security Status</Text>
                </Group>
                <Divider />

                <Table>
                  <tbody>
                    <tr>
                      <td>
                        <Text size="sm">Email Verified</Text>
                      </td>
                      <td>
                        <Badge color={user.isEmailVerified ? 'green' : 'orange'} variant="light" size="sm">
                          {user.isEmailVerified ? 'Yes' : 'No'}
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <Text size="sm">Failed Attempts</Text>
                      </td>
                      <td>
                        <Badge color={user.failedLoginAttempts > 0 ? 'red' : 'gray'} variant="light" size="sm">
                          {user.failedLoginAttempts}
                        </Badge>
                      </td>
                    </tr>
                    {isAccountLocked && (
                      <tr>
                        <td>
                          <Text size="sm">Locked Until</Text>
                        </td>
                        <td>
                          <Text size="sm">{new Date(user.lockedUntil).toLocaleString()}</Text>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Stack>
            </Card>

            {/* Quick Actions */}
            <Card withBorder>
              <Stack spacing="sm">
                <Group>
                  <IconExclamationCircle size={20} />
                  <Text weight={500}>Quick Actions</Text>
                </Group>
                <Divider />

                <Button
                  variant="light"
                  fullWidth
                  leftIcon={<IconEdit size={16} />}
                  onClick={() => navigate(`/users/${id}/edit`)}
                >
                  Edit User
                </Button>

                <Button
                  variant="light"
                  color="red"
                  fullWidth
                  leftIcon={<IconTrash size={16} />}
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete User
                </Button>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Delete Confirmation Modal */}
      <Modal opened={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete User" centered>
        <Stack spacing="md">
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            <Text size="sm">Are you sure you want to delete this user? This action cannot be undone.</Text>
          </Alert>

          <Group position="right">
            <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" loading={isDeleting} onClick={handleDeleteUser}>
              Delete User
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
