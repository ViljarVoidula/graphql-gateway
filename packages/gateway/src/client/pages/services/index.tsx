import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useDelete, useList } from '@refinedev/core';
import {
  IconAlertCircle,
  IconEdit,
  IconEye,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconServer,
  IconTrash,
} from '@tabler/icons-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const ServiceList: React.FC = () => {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<
    'all' | 'active' | 'inactive' | 'maintenance'
  >('all');
  const [serviceToDelete, setServiceToDelete] = React.useState<any>(null);

  const { data, isLoading, isError, error, refetch } = useList({
    resource: 'services',
  });

  const { mutate: deleteService, isLoading: isDeleting } = useDelete();

  const services = data?.data || [];

  const filteredServices = services
    .filter((service: any) =>
      service.name.toLowerCase().includes(searchValue.toLowerCase())
    )
    .filter((service: any) =>
      statusFilter === 'all'
        ? true
        : service.status?.toLowerCase() === statusFilter
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

  const handleDeleteService = (service: any) => {
    setServiceToDelete(service);
  };

  const confirmDelete = () => {
    if (!serviceToDelete) return;

    deleteService(
      {
        resource: 'services',
        id: serviceToDelete.id,
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
            icon: <IconAlertCircle />,
          });
        },
      }
    );
  };

  return (
    <>
      <Box p="xl" style={{ backgroundColor: '#fafafa', minHeight: '100vh' }}>
        <Stack spacing="xl">
          <Paper
            p="xl"
            radius="lg"
            withBorder
            style={{ backgroundColor: 'white' }}
          >
            <Group position="apart" align="center">
              <Group spacing="md">
                <ThemeIcon size="xl" radius="md" variant="light" color="green">
                  <IconServer size={24} />
                </ThemeIcon>
                <div>
                  <Title order={1} weight={600}>
                    Services
                  </Title>
                  <Text color="dimmed" size="sm">
                    Manage your registered GraphQL services
                  </Text>
                </div>
              </Group>
              <Button
                size="md"
                leftIcon={<IconPlus size={16} />}
                onClick={() => navigate('/services/create')}
              >
                Register Service
              </Button>
            </Group>
          </Paper>

          {isError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red">
              {error?.message || 'Failed to load services'}
            </Alert>
          )}

          <Card
            shadow="xs"
            p="xl"
            radius="lg"
            withBorder
            style={{ backgroundColor: 'white' }}
          >
            <Group position="apart">
              <TextInput
                placeholder="Search services by name..."
                icon={<IconSearch size={16} />}
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                style={{ minWidth: 300 }}
                size="md"
              />
              <Group spacing="lg">
                <Select
                  data={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'maintenance', label: 'Maintenance' },
                  ]}
                  value={statusFilter}
                  onChange={(v: string | null) =>
                    setStatusFilter((v as any) ?? 'all')
                  }
                  label="Filter by Status"
                  clearable={false}
                  style={{ minWidth: 180 }}
                  size="md"
                />
                <Button
                  variant="light"
                  size="md"
                  leftIcon={<IconRefresh size={16} />}
                  onClick={() => refetch()}
                >
                  Refresh
                </Button>
              </Group>
            </Group>
          </Card>

          <Card
            shadow="xs"
            radius="lg"
            withBorder
            style={{ backgroundColor: 'white' }}
          >
            <LoadingOverlay visible={isLoading} />
            <Table
              highlightOnHover
              verticalSpacing="md"
              style={{ backgroundColor: 'white' }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#495057',
                    }}
                  >
                    Service
                  </th>
                  <th
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#495057',
                    }}
                  >
                    URL
                  </th>
                  <th
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#495057',
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#495057',
                    }}
                  >
                    Security
                  </th>
                  <th
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#495057',
                    }}
                  >
                    Features
                  </th>
                  <th
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#495057',
                    }}
                  >
                    Created
                  </th>
                  <th
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: '#495057',
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ textAlign: 'center', padding: '3rem' }}
                    >
                      <Center>
                        <Stack align="center" spacing="md">
                          <IconServer size={48} color="#ced4da" />
                          <div>
                            <Text size="lg" weight={500} color="dimmed">
                              {isLoading
                                ? 'Loading services...'
                                : 'No services found'}
                            </Text>
                            {!isLoading && searchValue && (
                              <Text size="sm" color="dimmed" mt="xs">
                                Try adjusting your search or filters
                              </Text>
                            )}
                          </div>
                        </Stack>
                      </Center>
                    </td>
                  </tr>
                ) : (
                  filteredServices.map((service: any) => (
                    <tr key={service.id}>
                      <td>
                        <div>
                          <Group spacing="sm">
                            <ThemeIcon
                              size="sm"
                              radius="md"
                              variant="light"
                              color="green"
                            >
                              <IconServer size={16} />
                            </ThemeIcon>
                            <div>
                              <Text size="sm" weight={500}>
                                {service.name}
                              </Text>
                              {service.description && (
                                <Text size="xs" color="dimmed" lineClamp={1}>
                                  {service.description}
                                </Text>
                              )}
                            </div>
                          </Group>
                        </div>
                      </td>
                      <td>
                        <Text
                          size="sm"
                          color="blue"
                          style={{ fontFamily: 'monospace' }}
                          lineClamp={1}
                        >
                          {service.url}
                        </Text>
                      </td>
                      <td>
                        <Badge
                          color={getStatusColor(service.status)}
                          variant="filled"
                          size="sm"
                        >
                          {service.status || 'Unknown'}
                        </Badge>
                      </td>
                      <td>
                        <Group spacing="xs">
                          <Badge
                            color={service.enableHMAC ? 'green' : 'gray'}
                            variant="light"
                            size="xs"
                          >
                            HMAC
                          </Badge>
                        </Group>
                      </td>
                      <td>
                        <Group spacing="xs">
                          {service.useMsgPack && (
                            <Badge color="blue" variant="light" size="xs">
                              MsgPack
                            </Badge>
                          )}
                          {service.enableBatching && (
                            <Badge color="violet" variant="light" size="xs">
                              Batching
                            </Badge>
                          )}
                          {service.enablePermissionChecks && (
                            <Badge color="teal" variant="light" size="xs">
                              Perms
                            </Badge>
                          )}
                        </Group>
                      </td>
                      <td>
                        <Text size="sm" color="dimmed">
                          {service.createdAt
                            ? new Date(service.createdAt).toLocaleDateString()
                            : 'N/A'}
                        </Text>
                      </td>
                      <td>
                        <Group spacing="sm">
                          <Tooltip label="View Details">
                            <ActionIcon
                              color="blue"
                              variant="light"
                              size="md"
                              onClick={() =>
                                navigate(`/services/${service.id}`)
                              }
                            >
                              <IconEye size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Edit Service">
                            <ActionIcon
                              color="orange"
                              variant="light"
                              size="md"
                              onClick={() =>
                                navigate(`/services/${service.id}/edit`)
                              }
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Delete Service">
                            <ActionIcon
                              color="red"
                              variant="light"
                              size="md"
                              onClick={() => handleDeleteService(service)}
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </Card>

          {services.length > 0 && (
            <Paper p="md" radius="md" style={{ backgroundColor: 'white' }}>
              <Group position="center">
                <Text size="sm" color="dimmed">
                  Showing {filteredServices.length} of {services.length}{' '}
                  services
                </Text>
              </Group>
            </Paper>
          )}
        </Stack>
      </Box>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!serviceToDelete}
        onClose={() => setServiceToDelete(null)}
        title="Delete Service"
        size="md"
      >
        <Stack spacing="md">
          <Alert icon={<IconAlertCircle />} color="red">
            Are you sure you want to delete this service? This action cannot be
            undone.
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
