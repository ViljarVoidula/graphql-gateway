import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  LoadingOverlay,
  MultiSelect,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useOne, useUpdate } from '@refinedev/core';
import { IconAlertCircle, IconArrowLeft, IconCalendar, IconUser } from '@tabler/icons-react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';

interface UserFormData {
  email: string;
  password?: string;
  permissions: string[];
  isEmailVerified: boolean;
  resetFailedAttempts?: boolean;
}

const AVAILABLE_PERMISSIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'service-manager', label: 'Service Manager' }
];

export const UserEdit: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { mutate: updateUser, isLoading: isUpdating } = useUpdate();

  const {
    data: userData,
    isLoading: isLoadingUser,
    error: loadError
  } = useOne({
    resource: 'users',
    id: id!
  });

  const user = userData?.data;

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue
  } = useForm<UserFormData>({
    defaultValues: {
      email: user?.email || '',
      password: '',
      permissions: user?.permissions || ['user'],
      isEmailVerified: user?.isEmailVerified || false,
      resetFailedAttempts: false
    }
  });

  React.useEffect(() => {
    if (user) {
      setValue('email', user.email);
      setValue('permissions', user.permissions || ['user']);
      setValue('isEmailVerified', user.isEmailVerified || false);
    }
  }, [user, setValue]);

  const watchedValues = watch();

  const onSubmit = (values: UserFormData) => {
    // Remove password from values if it's empty
    const updateValues = { ...values };
    if (!values.password) {
      delete updateValues.password;
    }

    updateUser(
      {
        resource: 'users',
        id: id!,
        values: updateValues
      },
      {
        onSuccess: () => {
          navigate('/users');
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to update user',
            color: 'red',
            icon: <IconAlertCircle />
          });
        }
      }
    );
  };

  if (isLoadingUser) {
    return (
      <Paper withBorder p="xl" style={{ position: 'relative' }}>
        <LoadingOverlay visible />
        <Title order={2}>Loading User...</Title>
      </Paper>
    );
  }

  if (loadError || !user) {
    return (
      <Stack spacing="lg">
        <Group>
          <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/users')}>
            Back to Users
          </Button>
          <Title order={2}>Edit User</Title>
        </Group>
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
          {loadError?.message || 'User not found'}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing="lg">
      <Group>
        <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/users')}>
          Back to Users
        </Button>
        <Title order={2}>Edit User</Title>
      </Group>

      <Group align="flex-start">
        <Paper withBorder p="xl" style={{ position: 'relative', flex: 1 }}>
          <LoadingOverlay visible={isUpdating} />

          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing="md">
              <TextInput
                label="Email Address"
                placeholder="user@example.com"
                required
                error={errors.email?.message}
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Please enter a valid email address'
                  }
                })}
              />

              <PasswordInput
                label="Password"
                placeholder="Leave empty to keep current password"
                error={errors.password?.message}
                {...register('password', {
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters'
                  }
                })}
              />

              <MultiSelect
                label="Permissions"
                placeholder="Select permissions"
                data={AVAILABLE_PERMISSIONS}
                value={watchedValues.permissions}
                onChange={(value) => setValue('permissions', value)}
                required
                error={errors.permissions?.message}
              />

              <Switch
                label="Email Verified"
                description="Mark this user's email as verified"
                checked={watchedValues.isEmailVerified}
                onChange={(event) => setValue('isEmailVerified', event.currentTarget.checked)}
              />

              <Switch
                label="Reset Failed Login Attempts"
                description="Reset failed login attempts counter and unlock account"
                checked={watchedValues.resetFailedAttempts}
                onChange={(event) => setValue('resetFailedAttempts', event.currentTarget.checked)}
              />

              <Group position="right" mt="md">
                <Button variant="default" onClick={() => navigate('/users')}>
                  Cancel
                </Button>
                <Button type="submit" loading={isUpdating}>
                  Update User
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>

        <Card withBorder style={{ minWidth: 250 }}>
          <Stack spacing="sm">
            <Group>
              <IconUser size={20} />
              <Text weight={500}>User Information</Text>
            </Group>
            <Divider />

            <Stack spacing="xs">
              <Text size="sm" color="dimmed">
                User ID
              </Text>
              <Text size="sm" style={{ fontFamily: 'monospace' }}>
                {user.id}
              </Text>
            </Stack>

            <Stack spacing="xs">
              <Text size="sm" color="dimmed">
                Current Permissions
              </Text>
              <Group spacing="xs">
                {user.permissions?.map((permission: string) => (
                  <Badge key={permission} size="sm" variant="light">
                    {permission}
                  </Badge>
                ))}
              </Group>
            </Stack>

            <Stack spacing="xs">
              <Text size="sm" color="dimmed">
                Account Status
              </Text>
              <Group spacing="xs">
                <Badge color={user.isEmailVerified ? 'green' : 'orange'} variant="light" size="sm">
                  {user.isEmailVerified ? 'Verified' : 'Unverified'}
                </Badge>
                {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                  <Badge color="red" variant="light" size="sm">
                    Locked
                  </Badge>
                )}
              </Group>
            </Stack>

            {user.failedLoginAttempts > 0 && (
              <Stack spacing="xs">
                <Text size="sm" color="dimmed">
                  Failed Login Attempts
                </Text>
                <Badge color="red" variant="light" size="sm">
                  {user.failedLoginAttempts}
                </Badge>
              </Stack>
            )}

            <Stack spacing="xs">
              <Text size="sm" color="dimmed">
                <Group spacing="xs">
                  <IconCalendar size={14} />
                  <span>Created</span>
                </Group>
              </Text>
              <Text size="sm">{new Date(user.createdAt).toLocaleDateString()}</Text>
            </Stack>

            {user.lastLoginAt && (
              <Stack spacing="xs">
                <Text size="sm" color="dimmed">
                  Last Login
                </Text>
                <Text size="sm">{new Date(user.lastLoginAt).toLocaleDateString()}</Text>
              </Stack>
            )}
          </Stack>
        </Card>
      </Group>
    </Stack>
  );
};
