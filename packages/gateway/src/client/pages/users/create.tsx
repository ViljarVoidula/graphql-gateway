import {
  Alert,
  Button,
  Group,
  LoadingOverlay,
  MultiSelect,
  Paper,
  PasswordInput,
  Stack,
  Switch,
  TextInput,
  Title
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useCreate } from '@refinedev/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

interface UserFormData {
  email: string;
  password: string;
  permissions: string[];
  isEmailVerified: boolean;
}

const AVAILABLE_PERMISSIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'service-manager', label: 'Service Manager' }
];

export const UserCreate: React.FC = () => {
  const navigate = useNavigate();
  const { mutate: createUser, isLoading, error } = useCreate();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue
  } = useForm<UserFormData>({
    defaultValues: {
      email: '',
      password: '',
      permissions: ['user'],
      isEmailVerified: false
    }
  });

  const watchedValues = watch();

  const onSubmit = (values: UserFormData) => {
    createUser(
      {
        resource: 'users',
        values
      },
      {
        onSuccess: () => {
          navigate('/users');
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to create user',
            color: 'red',
            icon: <IconAlertCircle />
          });
        }
      }
    );
  };

  return (
    <Stack spacing="lg">
      <Group>
        <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/users')}>
          Back to Users
        </Button>
        <Title order={2}>Create New User</Title>
      </Group>

      <Paper withBorder p="xl" style={{ position: 'relative' }}>
        <LoadingOverlay visible={isLoading} />

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
              placeholder="Enter a strong password"
              required
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 8,
                  message: 'Password must be at least 8 characters long'
                }
              })}
            />

            <MultiSelect
              label="Permissions"
              placeholder="Select permissions"
              data={AVAILABLE_PERMISSIONS}
              value={watchedValues.permissions}
              onChange={(value) => setValue('permissions', value)}
              searchable
              clearable
            />

            <Switch
              label="Email Verified"
              description="Mark this user's email as verified"
              checked={watchedValues.isEmailVerified}
              onChange={(event) => setValue('isEmailVerified', event.currentTarget.checked)}
            />

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red">
                {error.message}
              </Alert>
            )}

            <Group position="right" mt="md">
              <Button variant="light" onClick={() => navigate('/users')}>
                Cancel
              </Button>
              <Button type="submit" loading={isLoading}>
                Create User
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
};
