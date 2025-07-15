import React from 'react';
import { useUpdate, useOne } from '@refinedev/core';
import {
  Paper,
  TextInput,
  Textarea,
  NumberInput,
  Switch,
  Button,
  Group,
  Stack,
  Title,
  Alert,
  LoadingOverlay,
  Divider,
  Text,
  Badge,
} from '@mantine/core';
import { useForm } from 'react-hook-form';
import { IconAlertCircle, IconCheck, IconArrowLeft } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
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
  const { data: serviceData, isLoading: isLoadingService, error: loadError } = useOne({
    resource: 'services',
    id: id!,
  });

  const service = serviceData?.data;

  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<ServiceFormData>({
    defaultValues: {
      name: '',
      url: '',
      description: '',
      version: '',
      enableHMAC: true,
      timeout: 5000,
      enableBatching: true,
    },
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
        enableBatching: service.enableBatching ?? true,
      });
    }
  }, [service, reset]);

  const onSubmit = (values: ServiceFormData) => {
    updateService(
      {
        resource: 'services',
        id: id!,
        values,
      },
      {
        onSuccess: () => {
          showNotification({
            title: 'Success',
            message: 'Service updated successfully',
            color: 'green',
            icon: <IconCheck />,
          });
          navigate('/services');
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to update service',
            color: 'red',
            icon: <IconAlertCircle />,
          });
        },
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
          <Button
            variant="subtle"
            leftIcon={<IconArrowLeft size={16} />}
            onClick={() => navigate('/services')}
          >
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
        <Button
          variant="subtle"
          leftIcon={<IconArrowLeft size={16} />}
          onClick={() => navigate('/services')}
        >
          Back to Services
        </Button>
        <Title order={2}>Edit Service</Title>
        <Badge color={getStatusColor(service.status)} variant="light">
          {service.status}
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

            <Textarea
              label="Description"
              placeholder="Brief description of the service"
              {...register('description')}
            />

            <TextInput
              label="Version"
              placeholder="e.g., v1.0.0"
              {...register('version')}
            />

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
