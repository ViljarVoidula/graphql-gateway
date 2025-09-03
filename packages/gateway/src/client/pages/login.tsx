import React from 'react';
import { useLogin } from '@refinedev/core';
import { useForm } from '@refinedev/react-hook-form';
import { Box, Card, TextInput, PasswordInput, Button, Title, Text, Center, Stack, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface LoginFormData {
  email: string;
  password: string;
}

export const Login: React.FC = () => {
  const { mutate: login, isLoading } = useLogin<LoginFormData>();
  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormData>();

  const onSubmit = (data: LoginFormData) => {
    setError(null);
    login(data, {
      onError: (error) => {
        setError(error.message || 'Login failed');
      }
    });
  };

  return (
    <Box
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Card shadow="xl" p="xl" radius="md" style={{ minWidth: 400 }}>
        <Center>
          <Stack spacing="md" style={{ width: '100%' }}>
            <Title order={2} align="center" color="dark">
              GraphQL Gateway Admin
            </Title>
            <Text size="sm" color="dimmed" align="center">
              Sign in to manage your gateway
            </Text>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red">
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit as any)}>
              <Stack spacing="md">
                <TextInput
                  label="Email"
                  placeholder="Enter your email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address'
                    }
                  })}
                  error={errors.email?.message as string}
                />

                <PasswordInput
                  label="Password"
                  placeholder="Enter your password"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters'
                    }
                  })}
                  error={errors.password?.message as string}
                />

                <Button type="submit" fullWidth loading={isLoading} size="md" style={{ marginTop: '1rem' }}>
                  Sign In
                </Button>
              </Stack>
            </form>
          </Stack>
        </Center>
      </Card>
    </Box>
  );
};
