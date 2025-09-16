import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useDelete, useList } from '@refinedev/core';
import { IconAlertCircle, IconEdit, IconEye, IconPlus, IconRefresh, IconSearch, IconTrash } from '@tabler/icons-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const ServiceList: React.FC = () => {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = React.useState('');
  const [serviceToDelete, setServiceToDelete] = React.useState<any>(null);

  const { data, isLoading, isError, error, refetch } = useList({
    resource: 'services'
  });

  const { mutate: deleteService, isLoading: isDeleting } = useDelete();

  const services = data?.data || [];

  const filteredServices = services.filter((service: any) => service.name.toLowerCase().includes(searchValue.toLowerCase()));

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

  const handleDeleteService = (service: any) => {
    setServiceToDelete(service);
  };

  const confirmDelete = () => {
    if (!serviceToDelete) return;

    deleteService(
      {
        resource: 'services',
        id: serviceToDelete.id
      },
      {
        onSuccess: () => {
          setServiceToDelete(null);
          refetch();
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to delete service',
            color: 'red',
            icon: <IconAlertCircle />
          });
        }
      }
    );
  };

  return (
    <>
      <Stack spacing="lg">
        <Group position="apart">
          <Title order={2}>Services</Title>
          <Button leftIcon={<IconPlus size={16} />} onClick={() => navigate('/services/create')}>
            Register Service
          </Button>
        </Group>

        {isError && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error?.message || 'Failed to load services'}
          </Alert>
        )}

        <Group position="apart">
          <TextInput
            placeholder="Search services by name..."
            icon={<IconSearch size={16} />}
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            style={{ minWidth: 300 }}
          />
          <Button variant="light" leftIcon={<IconRefresh size={16} />} onClick={() => refetch()}>
            Refresh
          </Button>
        </Group>

        <Paper withBorder>
          <LoadingOverlay visible={isLoading} />
          <Table striped highlightOnHover>
            <thead>
              <tr>
                <th>Name</th>
                <th>URL</th>
                <th>Status</th>
                <th>HMAC</th>
                <th>MsgPack</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    <Text color="dimmed">{isLoading ? 'Loading...' : 'No services found'}</Text>
                  </td>
                </tr>
              ) : (
                filteredServices.map((service: any) => (
                  <tr key={service.id}>
                    <td>
                      <div>
                        <Text size="sm" weight={500}>
                          {service.name}
                        </Text>
                        {service.description && (
                          <Text size="xs" color="dimmed">
                            {service.description}
                          </Text>
                        )}
                      </div>
                    </td>
                    <td>
                      <Text size="sm" color="blue" style={{ fontFamily: 'monospace' }}>
                        {service.url}
                      </Text>
                    </td>
                    <td>
                      <Badge color={getStatusColor(service.status)} variant="light" size="sm">
                        {service.status || 'Unknown'}
                      </Badge>
                    </td>
                    <td>
                      <Badge color={service.enableHMAC ? 'green' : 'red'} variant="light" size="sm">
                        {service.enableHMAC ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </td>
                    <td>
                      <Badge color={service.useMsgPack ? 'green' : 'gray'} variant="light" size="sm">
                        {service.useMsgPack ? 'On' : 'Off'}
                      </Badge>
                    </td>
                    <td>
                      <Text size="sm" color="dimmed">
                        {service.createdAt ? new Date(service.createdAt).toLocaleDateString() : 'N/A'}
                      </Text>
                    </td>
                    <td>
                      <Group spacing="xs">
                        <Tooltip label="View Details">
                          <ActionIcon
                            color="blue"
                            variant="light"
                            size="sm"
                            onClick={() => navigate(`/services/${service.id}`)}
                          >
                            <IconEye size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Edit Service">
                          <ActionIcon
                            color="orange"
                            variant="light"
                            size="sm"
                            onClick={() => navigate(`/services/${service.id}/edit`)}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete Service">
                          <ActionIcon color="red" variant="light" size="sm" onClick={() => handleDeleteService(service)}>
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

        {services.length > 0 && (
          <Group position="center">
            <Text size="sm" color="dimmed">
              Showing {filteredServices.length} of {services.length} services
            </Text>
          </Group>
        )}
      </Stack>

      {/* Delete Confirmation Modal */}
      <Modal opened={!!serviceToDelete} onClose={() => setServiceToDelete(null)} title="Delete Service" size="md">
        <Stack spacing="md">
          <Alert icon={<IconAlertCircle />} color="red">
            Are you sure you want to delete this service? This action cannot be undone.
          </Alert>

          {serviceToDelete && (
            <Text size="sm">
              Service: <strong>{serviceToDelete.name}</strong>
            </Text>
          )}

          <Group position="right">
            <Button variant="light" onClick={() => setServiceToDelete(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDelete} loading={isDeleting}>
              Delete Service
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
