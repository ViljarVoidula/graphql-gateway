import {
  Alert,
  Box,
  Button,
  Code,
  Divider,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useCreate } from '@refinedev/core';
import { IconAlertCircle, IconArrowLeft, IconCheck, IconKey } from '@tabler/icons-react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

interface ServiceFormData {
  name: string;
  url: string;
  description?: string;
  version?: string;
  enableHMAC: boolean;
  timeout: number;
  enableBatching: boolean;
  externally_accessible: boolean;
  useMsgPack: boolean;
}

interface HMACKeyData {
  keyId: string;
  secretKey: string;
  instructions: string;
}

export const ServiceCreate: React.FC = () => {
  const navigate = useNavigate();
  const { mutate: createService, isLoading, error } = useCreate();
  const [hmacKey, setHmacKey] = React.useState<HMACKeyData | null>(null);
  const [showKeyModal, setShowKeyModal] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch
  } = useForm<ServiceFormData>({
    defaultValues: {
      name: '',
      url: '',
      description: '',
      version: '',
      enableHMAC: true,
      timeout: 5000,
      enableBatching: true,
      externally_accessible: true,
      useMsgPack: false
    }
  });

  const watchedValues = watch();

  const onSubmit = (values: ServiceFormData) => {
    createService(
      {
        resource: 'services',
        values
      },
      {
        onSuccess: (data) => {
          // If HMAC is enabled, show the key modal
          if (values.enableHMAC && (data as any).hmacKey) {
            setHmacKey((data as any).hmacKey);
            setShowKeyModal(true);
          } else {
            navigate('/services');
          }
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to create service',
            color: 'red',
            icon: <IconAlertCircle />
          });
        }
      }
    );
  };

  const handleKeyModalClose = () => {
    setShowKeyModal(false);
    setHmacKey(null);
    navigate('/services');
  };

  return (
    <>
      <Stack spacing="lg">
        <Group>
          <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/services')}>
            Back to Services
          </Button>
          <Title order={2}>Create New Service</Title>
        </Group>

        <Paper withBorder p="xl" style={{ position: 'relative' }}>
          <LoadingOverlay visible={isLoading} />

          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing="md">
              <TextInput
                label="Service Name"
                placeholder="e.g., user-service"
                required
                error={errors.name?.message}
                {...register('name', { required: 'Service name is required' })}
              />

              <TextInput
                label="Service URL"
                placeholder="https://api.example.com/graphql"
                required
                error={errors.url?.message}
                {...register('url', {
                  required: 'Service URL is required',
                  pattern: {
                    value: /^https?:\/\/[^\s]+$/,
                    message: 'Please enter a valid URL'
                  }
                })}
              />

              <Textarea label="Description" placeholder="Brief description of the service" {...register('description')} />

              <TextInput label="Version" placeholder="e.g., v1.0.0" {...register('version')} />

              <Divider my="md" />

              <Title order={4}>Configuration</Title>

              <Switch
                label="Enable HMAC Authentication"
                description="Generate and use HMAC keys for secure communication"
                checked={watchedValues.enableHMAC}
                {...register('enableHMAC')}
              />

              <NumberInput
                label="Timeout (ms)"
                description="Request timeout in milliseconds"
                min={1000}
                max={30000}
                step={1000}
                value={watchedValues.timeout}
                onChange={(value) => {
                  // Handle NumberInput change manually
                }}
                error={errors.timeout?.message}
              />
              <input
                type="hidden"
                {...register('timeout', {
                  required: 'Timeout is required',
                  min: { value: 1000, message: 'Timeout must be at least 1000ms' },
                  max: { value: 30000, message: 'Timeout must be at most 30000ms' }
                })}
              />

              <Switch
                label="Enable Batching"
                description="Allow batching of multiple requests"
                checked={watchedValues.enableBatching}
                {...register('enableBatching')}
              />

              <Switch
                label="Enable MessagePack"
                description="Allow Gateway to negotiate MessagePack responses (adds x-msgpack-enabled:1 when client requests)"
                checked={watchedValues.useMsgPack}
                {...register('useMsgPack')}
              />

              <Switch
                label="Externally Accessible"
                description="Allow this service to be discoverable and whitelisted by applications"
                checked={watchedValues.externally_accessible}
                {...register('externally_accessible')}
              />

              {error && (
                <Alert icon={<IconAlertCircle size={16} />} color="red">
                  {error.message}
                </Alert>
              )}

              <Group position="right" mt="md">
                <Button variant="light" onClick={() => navigate('/services')}>
                  Cancel
                </Button>
                <Button type="submit" loading={isLoading}>
                  Create Service
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      </Stack>

      <Modal
        opened={showKeyModal}
        onClose={handleKeyModalClose}
        title="Service Created Successfully"
        size="lg"
        withCloseButton={false}
      >
        <Stack spacing="md">
          <Alert icon={<IconCheck />} color="green">
            Your service has been created successfully!
          </Alert>

          {hmacKey && (
            <>
              <Text size="sm" color="dimmed">
                {hmacKey.instructions}
              </Text>

              <Box>
                <Text size="sm" weight={500} mb="xs">
                  Key ID:
                </Text>
                <Code block>{hmacKey.keyId}</Code>
              </Box>

              <Box>
                <Text size="sm" weight={500} mb="xs">
                  Secret Key:
                </Text>
                <Code block>{hmacKey.secretKey}</Code>
              </Box>

              <Alert icon={<IconKey />} color="yellow">
                <Text size="sm">
                  <strong>Important:</strong> This is the only time you'll see the secret key. Please store it securely. You can
                  rotate keys later if needed.
                </Text>
              </Alert>
            </>
          )}

          <Group position="right">
            <Button onClick={handleKeyModalClose}>Continue to Services</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
