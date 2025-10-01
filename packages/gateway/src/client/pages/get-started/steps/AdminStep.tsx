import { Alert, Box, Button, Card, Group, List, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconArrowRight, IconCheck, IconShieldLock } from '@tabler/icons-react';
import { FC, FormEvent } from 'react';

interface AdminStepProps {
  email: string;
  password: string;
  confirmPassword: string;
  loading: boolean;
  error: string | null;
  success: string | null;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

export const AdminStep: FC<AdminStepProps> = ({
  email,
  password,
  confirmPassword,
  loading,
  error,
  success,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onBack
}) => (
  <Card shadow="md" p="xl" radius="lg">
    <Stack spacing="lg">
      <Group spacing="sm">
        <ThemeIcon color="grape" size="lg" radius="md">
          <IconShieldLock size={20} />
        </ThemeIcon>
        <div>
          <Title order={3}>Create your founding admin</Title>
          <Text color="dimmed">This account has full control. Choose credentials you'd trust in production.</Text>
        </div>
      </Group>

      {error && (
        <Alert icon={<IconAlertTriangle size={16} />} color="red">
          {error}
        </Alert>
      )}
      {success && (
        <Alert icon={<IconCheck size={16} />} color="green">
          {success}
        </Alert>
      )}

      <Box component="form" onSubmit={onSubmit}>
        <Stack spacing="md">
          <TextInput
            label="Admin email"
            placeholder="you@example.com"
            value={email}
            type="email"
            onChange={(event) => onEmailChange(event.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Password"
            placeholder="min. 12 characters, include letters & numbers"
            value={password}
            onChange={(event) => onPasswordChange(event.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Confirm password"
            placeholder="Repeat the password"
            value={confirmPassword}
            onChange={(event) => onConfirmPasswordChange(event.currentTarget.value)}
            required
          />
          <List
            spacing="xs"
            size="sm"
            icon={
              <ThemeIcon color="blue" size={18} radius="xl">
                <IconCheck size={12} />
              </ThemeIcon>
            }
          >
            <List.Item>Passwords are hashed with bcrypt before storage.</List.Item>
            <List.Item>We set email verification as complete so you can log in right away.</List.Item>
            <List.Item>Session refresh is enabled automatically for a smooth experience.</List.Item>
          </List>
          <Group position="apart" mt="sm">
            <Button variant="default" onClick={onBack}>
              Back
            </Button>
            <Button type="submit" loading={loading} rightIcon={<IconArrowRight size={16} />}>
              Continue to configuration
            </Button>
          </Group>
        </Stack>
      </Box>
    </Stack>
  </Card>
);

export default AdminStep;
