import {
  Alert,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Grid,
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
  ThemeIcon,
  Title
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useCreate } from '@refinedev/core';
import { IconAlertCircle, IconArrowLeft, IconCheck, IconKey, IconPlus, IconServer } from '@tabler/icons-react';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
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
  enableTypePrefix: boolean;
  typePrefix?: string | null;
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
    watch,
    control,
    setValue
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
      useMsgPack: false,
      enableTypePrefix: false,
      typePrefix: ''
    }
  });

  const watchedValues = watch();

  const deriveTypePrefix = React.useCallback((name: string) => {
    const tokens = (name || '').split(/[^a-zA-Z0-9]+/).filter(Boolean);
    let candidate = tokens
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
      .join('');
    if (!candidate) candidate = 'Service';
    if (!/^[A-Za-z_]/.test(candidate)) {
      candidate = `Svc${candidate}`;
    }
    if (!candidate.endsWith('_')) {
      candidate = `${candidate}_`;
    }
    return candidate.slice(0, 64);
  }, []);

  React.useEffect(() => {
    if (watchedValues.enableTypePrefix) {
      const current = watchedValues.typePrefix?.trim();
      if (!current) {
        setValue('typePrefix', deriveTypePrefix(watchedValues.name), {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false
        });
      }
    }
  }, [watchedValues.enableTypePrefix, watchedValues.name, watchedValues.typePrefix, setValue, deriveTypePrefix]);

  const onSubmit = (values: ServiceFormData) => {
    const payload: ServiceFormData = {
      ...values,
      typePrefix: values.enableTypePrefix
        ? values.typePrefix?.trim() || undefined
        : undefined,
    };
    if (!values.enableTypePrefix) {
      (payload as any).typePrefix = null;
    }

    createService(
      {
        resource: 'services',
        values: payload
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
      <Box p="xl" style={{ backgroundColor: '#fafafa', minHeight: '100vh' }}>
        <Stack spacing="xl">
          <Paper p="xl" radius="lg" withBorder style={{ backgroundColor: 'white' }}>
            <Group spacing="md">
              <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/services')}>
                Back
              </Button>
              <ThemeIcon size="xl" radius="md" variant="light" color="green">
                <IconPlus size={24} />
              </ThemeIcon>
              <div>
                <Title order={1} weight={600}>
                  Create New Service
                </Title>
                <Text color="dimmed" size="sm">
                  Register a new GraphQL service with the gateway
                </Text>
              </div>
            </Group>
          </Paper>

          <Card shadow="xs" p="xl" radius="lg" withBorder style={{ backgroundColor: 'white', position: 'relative' }}>
            <LoadingOverlay visible={isLoading} />

            <form onSubmit={handleSubmit(onSubmit)}>
              <Stack spacing="xl">
                <div>
                  <Title order={3} weight={600} mb="lg">
                    Basic Information
                  </Title>
                  <Grid gutter="lg">
                    <Grid.Col span={6}>
                      <TextInput
                        label="Service Name"
                        placeholder="e.g., user-service"
                        required
                        error={errors.name?.message}
                        {...register('name', { required: 'Service name is required' })}
                        styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <TextInput
                        label="Version"
                        placeholder="e.g., v1.0.0"
                        error={errors.version?.message}
                        {...register('version')}
                        styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
                      />
                    </Grid.Col>
                    <Grid.Col span={12}>
                      <TextInput
                        label="GraphQL Endpoint URL"
                        placeholder="https://api.example.com/graphql"
                        required
                        error={errors.url?.message}
                        {...register('url', {
                          required: 'Service URL is required',
                          pattern: {
                            value: /^https?:\/\/.+/,
                            message: 'Must be a valid HTTP/HTTPS URL'
                          }
                        })}
                        styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
                      />
                    </Grid.Col>
                    <Grid.Col span={12}>
                      <Textarea
                        label="Description"
                        placeholder="Optional description of what this service provides"
                        error={errors.description?.message}
                        {...register('description')}
                        minRows={3}
                        styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
                      />
                    </Grid.Col>
                  </Grid>
                </div>

                <Divider />

                <div>
                  <Title order={3} weight={600} mb="lg">
                    Configuration
                  </Title>
                  <Grid gutter="lg">
                    <Grid.Col span={6}>
                      <Controller
                        name="timeout"
                        control={control}
                        rules={{
                          required: 'Timeout is required',
                          min: { value: 100, message: 'Minimum timeout is 100ms' },
                          max: { value: 30000, message: 'Maximum timeout is 30000ms' }
                        }}
                        render={({ field }) => (
                          <NumberInput
                            label="Timeout (ms)"
                            placeholder="5000"
                            min={100}
                            max={30000}
                            error={errors.timeout?.message}
                            value={field.value}
                            onChange={(val) => field.onChange(typeof val === 'number' ? val : Number(val))}
                            onBlur={field.onBlur}
                            styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
                          />
                        )}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Stack spacing="md" mt="xs">
                        <Switch
                          label="Externally Accessible"
                          description="Allow external applications to access this service"
                          {...register('externally_accessible')}
                          checked={watchedValues.externally_accessible}
                        />
                      </Stack>
                    </Grid.Col>
                  </Grid>
                </div>

                <Divider />

                <div>
                  <Title order={3} weight={600} mb="lg">
                    Security & Features
                  </Title>
                  <Grid gutter="lg">
                    <Grid.Col span={6}>
                      <Stack spacing="md">
                        <Switch
                          label="Enable HMAC Authentication"
                          description="Secure service communication with HMAC signatures"
                          {...register('enableHMAC')}
                          checked={watchedValues.enableHMAC}
                        />
                        <Switch
                          label="Enable Request Batching"
                          description="Allow multiple operations in a single request"
                          {...register('enableBatching')}
                          checked={watchedValues.enableBatching}
                        />
                      </Stack>
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Stack spacing="md">
                        <Switch
                          label="Use MessagePack"
                          description="Enable binary serialization for better performance"
                          {...register('useMsgPack')}
                          checked={watchedValues.useMsgPack}
                        />
                        <Switch
                          label="Enable Prefix for Type Resolution"
                          description="Automatically prefix remote types to avoid naming conflicts"
                          {...register('enableTypePrefix')}
                          checked={watchedValues.enableTypePrefix}
                        />
                        {(() => {
                          const field = register('typePrefix');
                          return (
                            <TextInput
                              label="Type Prefix"
                              placeholder="e.g., Users_"
                              description="Applies to non-root types when prefixing is enabled"
                              name={field.name}
                              ref={field.ref}
                              disabled={!watchedValues.enableTypePrefix}
                              value={watchedValues.typePrefix ?? ''}
                              onChange={(event) => {
                                field.onChange(event);
                                setValue('typePrefix', event.currentTarget.value, {
                                  shouldDirty: true,
                                  shouldValidate: true
                                });
                              }}
                              onBlur={field.onBlur}
                              styles={{ label: { fontWeight: 500, fontSize: '14px' } }}
                            />
                          );
                        })()}
                      </Stack>
                    </Grid.Col>
                  </Grid>
                </div>

                <Divider />

                <Group position="right">
                  <Button variant="light" onClick={() => navigate('/services')}>
                    Cancel
                  </Button>
                  <Button type="submit" size="md" leftIcon={<IconServer size={16} />} loading={isLoading}>
                    Create Service
                  </Button>
                </Group>
              </Stack>
            </form>
          </Card>
        </Stack>
      </Box>

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
