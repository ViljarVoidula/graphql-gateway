import React from 'react';
import { useList } from '@refinedev/core';
import {
  Table,
  Group,
  Badge,
  Text,
  Title,
  Button,
  Stack,
  TextInput,
  Paper,
  LoadingOverlay,
  Alert,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { 
  IconSearch, 
  IconPlus, 
  IconAlertCircle, 
  IconEye, 
  IconEdit, 
  IconTrash,
  IconRefresh,
} from '@tabler/icons-react';

export const ServiceList: React.FC = () => {
  const [searchValue, setSearchValue] = React.useState('');
  
  const { data, isLoading, isError, error, refetch } = useList({
    resource: 'services',
  });

  const services = data?.data || [];

  const filteredServices = services.filter((service: any) =>
    service.name.toLowerCase().includes(searchValue.toLowerCase())
  );

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

  return (
    <Stack spacing="lg">
      <Group position="apart">
        <Title order={2}>Services</Title>
        <Button leftIcon={<IconPlus size={16} />} disabled>
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
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredServices.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  <Text color="dimmed">
                    {isLoading ? 'Loading...' : 'No services found'}
                  </Text>
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
                      <Text size="xs" color="dimmed">
                        ID: {service.id}
                      </Text>
                    </div>
                  </td>
                  <td>
                    <Text size="sm" color="blue" style={{ fontFamily: 'monospace' }}>
                      {service.url}
                    </Text>
                  </td>
                  <td>
                    <Badge
                      color={getStatusColor(service.status)}
                      variant="light"
                      size="sm"
                    >
                      {service.status || 'Unknown'}
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
                          disabled
                        >
                          <IconEye size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Edit Service">
                        <ActionIcon
                          color="orange"
                          variant="light"
                          size="sm"
                          disabled
                        >
                          <IconEdit size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete Service">
                        <ActionIcon
                          color="red"
                          variant="light"
                          size="sm"
                          disabled
                        >
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
  );
};
