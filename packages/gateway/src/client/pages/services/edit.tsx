import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  LoadingOverlay,
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
import { useCustomMutation, useOne, useUpdate } from '@refinedev/core';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import React from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';

interface ServiceFormData {
  name: string;
  url: string;
  description?: string;
  version?: string;
  enableHMAC: boolean;
  timeout: number;
  enableBatching: boolean;
}

export const ServiceEdit: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { mutate: updateService, isLoading: isUpdating, error } = useUpdate();
  const {
    data: serviceData,
    isLoading: isLoadingService,
    error: loadError,
    refetch
  } = useOne({
    resource: 'services',
    id: id!
  });
  const { mutate: customMutate } = useCustomMutation();

  const service = serviceData?.data;
  const [togglingExternal, setTogglingExternal] = React.useState(false);
  const [externalError, setExternalError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset
  } = useForm<ServiceFormData>({
    defaultValues: {
      name: '',
      url: '',
      description: '',
      version: '',
      enableHMAC: true,
      timeout: 5000,
      enableBatching: true
    }
  });

  const watchedValues = watch();

  // Reset form when service data is loaded
  React.useEffect(() => {
    if (service) {
      reset({
        name: service.name || '',
        url: service.url || '',
        description: service.description || '',
        version: service.version || '',
        enableHMAC: service.enableHMAC ?? true,
        timeout: service.timeout || 5000,
        enableBatching: service.enableBatching ?? true
      });
    }
  }, [service, reset]);

  const toggleExternallyAccessible = () => {
    if (!service) return;
    setTogglingExternal(true);
    setExternalError(null);
    const next = !service.externally_accessible;
    customMutate(
      {
        method: 'post',
        url: '',
        values: { serviceId: service.id, externally_accessible: next },
        meta: { operation: 'setServiceExternallyAccessible' }
      },
      {
        onSuccess: (res: any) => {
          if (!res?.data?.success) {
            setExternalError('Mutation returned unsuccessful response');
          } else {
            refetch();
          }
          setTogglingExternal(false);
        },
        onError: (err: any) => {
          setExternalError(err?.message || 'Failed to update external accessibility');
          setTogglingExternal(false);
        }
      }
    );
  };

  const onSubmit = (values: ServiceFormData) => {
    updateService(
      {
        resource: 'services',
        id: id!,
        values
      },
      {
        onSuccess: () => {
          navigate('/services');
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to update service',
            color: 'red',
            icon: <IconAlertCircle />
          });
        }
      }
    );
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'green';
      case 'inactive':
        return 'red';
      case 'maintenance':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  if (isLoadingService) {
    return (
      <Paper withBorder p="xl">
        <LoadingOverlay visible />
      </Paper>
    );
  }

  if (loadError || !service) {
    return (
      <Stack spacing="lg">
        <Group>
          <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/services')}>
            Back to Services
          </Button>
          <Title order={2}>Edit Service</Title>
        </Group>
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {loadError?.message || 'Service not found'}
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing="lg">
      <Group>
        <Button variant="subtle" leftIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/services')}>
          Back to Services
        </Button>
        <Title order={2}>Edit Service</Title>
        <Badge color={getStatusColor(service.status)} variant="light">
          {service.status}
        </Badge>
        <Badge color={service.externally_accessible ? 'blue' : 'gray'} variant="filled">
          {service.externally_accessible ? 'Externally Accessible' : 'Internal Only'}
        </Badge>
      </Group>

      <Paper withBorder p="xl" style={{ position: 'relative' }}>
        <LoadingOverlay visible={isUpdating} />

        <form onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing="md">
            <Group position="apart">
              <Text size="sm" color="dimmed">
                Service ID: {service.id}
              </Text>
              <Text size="sm" color="dimmed">
                Created: {new Date(service.createdAt).toLocaleString()}
              </Text>
            </Group>

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

            <Divider my="sm" />
            <Group position="apart" align="center">
              <Stack spacing={4} style={{ flex: 1 }}>
                <Title order={5}>External Accessibility</Title>
                <Text size="sm" color="dimmed">
                  Allow this service to be discoverable and whitelisted by applications.
                </Text>
                {externalError && (
                  <Alert icon={<IconAlertCircle size={16} />} color="red" mt={4}>
                    {externalError}
                  </Alert>
                )}
              </Stack>
              <Switch
                checked={!!service.externally_accessible}
                onChange={toggleExternallyAccessible}
                disabled={togglingExternal}
                label={service.externally_accessible ? 'Enabled' : 'Disabled'}
              />
            </Group>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="red">
                {error.message}
              </Alert>
            )}

            <Group position="right" mt="md">
              <Button variant="light" onClick={() => navigate('/services')}>
                Cancel
              </Button>
              <Button type="submit" loading={isUpdating}>
                Update Service
              </Button>
            </Group>
          </Stack>
        </form>
      </Paper>
    </Stack>
  );
};
