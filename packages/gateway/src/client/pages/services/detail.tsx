import React from 'react';
import { useOne, useDelete } from '@refinedev/core';
import {
  Paper,
  Stack,
  Title,
  Group,
  Button,
  Badge,
  Text,
  Divider,
  Alert,
  LoadingOverlay,
  Table,
  ActionIcon,
  Modal,
  Code,
  Box,
  Tooltip,
} from '@mantine/core';
import { 
  IconArrowLeft, 
  IconEdit, 
  IconTrash, 
  IconRefresh, 
  IconKey, 
  IconAlertCircle, 
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { useNavigate, useParams } from 'react-router-dom';
import { authenticatedFetch } from '../../utils/auth';

interface ServiceKey {
  id: string;
  keyId: string;
  status: 'active' | 'revoked' | 'expired';
  createdAt: string;
  expiresAt?: string;
}

interface HMACKeyData {
  keyId: string;
  secretKey: string;
  instructions: string;
}

export const ServiceDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [showKeyModal, setShowKeyModal] = React.useState(false);
  const [rotatedKey, setRotatedKey] = React.useState<HMACKeyData | null>(null);
  const [showSecretKey, setShowSecretKey] = React.useState(false);
  const [keys, setKeys] = React.useState<ServiceKey[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = React.useState(false);
  const [isRotating, setIsRotating] = React.useState(false);

  const { data: serviceData, isLoading: isLoadingService, error: loadError } = useOne({
    resource: 'services',
    id: id!,
  });

  const { mutate: deleteService, isLoading: isDeleting } = useDelete();

  const service = serviceData?.data;

  const fetchKeys = async () => {
    if (!service?.enableHMAC) return;
    
    setIsLoadingKeys(true);
    try {
      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            query GetServiceKeys($serviceId: ID!) {
              serviceKeys(serviceId: $serviceId) {
                id
                keyId
                status
                createdAt
                expiresAt
              }
            }
          `,
          variables: { serviceId: id },
        }),
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      
      setKeys(result.data.serviceKeys || []);
    } catch (error: any) {
      showNotification({
        title: 'Error',
        message: error.message || 'Failed to fetch keys',
        color: 'red',
        icon: <IconAlertCircle />,
      });
    } finally {
      setIsLoadingKeys(false);
    }
  };

  const handleRotateKey = async () => {
    setIsRotating(true);
    try {
      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            mutation RotateServiceKey($serviceId: ID!) {
              rotateServiceKey(serviceId: $serviceId) {
                oldKeyId
                newKey {
                  keyId
                  secretKey
                  instructions
                }
                success
              }
            }
          `,
          variables: { serviceId: id },
        }),
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      
      showNotification({
        title: 'Success',
        message: 'Service key rotated successfully',
        color: 'green',
        icon: <IconCheck />,
      });
      
      setRotatedKey(result.data.rotateServiceKey.newKey);
      setShowKeyModal(true);
      fetchKeys();
    } catch (error: any) {
      showNotification({
        title: 'Error',
        message: error.message || 'Failed to rotate key',
        color: 'red',
        icon: <IconAlertCircle />,
      });
    } finally {
      setIsRotating(false);
    }
  };

  const handleDeleteService = () => {
    deleteService(
      {
        resource: 'services',
        id: id!,
      },
      {
        onSuccess: () => {
          showNotification({
            title: 'Success',
            message: 'Service deleted successfully',
            color: 'green',
            icon: <IconCheck />,
          });
          navigate('/services');
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

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'green';
      case 'inactive':
        return 'red';
      case 'maintenance':
        return 'yellow';
      case 'revoked':
        return 'red';
      case 'expired':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showNotification({
      title: 'Copied',
      message: 'Copied to clipboard',
      color: 'blue',
      icon: <IconCopy />,
    });
  };

  // Fetch keys when service is loaded
  React.useEffect(() => {
    if (service?.enableHMAC) {
      fetchKeys();
    }
  }, [service?.enableHMAC]);

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
          <Title order={2}>Service Details</Title>
        </Group>
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {loadError?.message || 'Service not found'}
        </Alert>
      </Stack>
    );
  }

  return (
    <>
      <Stack spacing="lg">
        <Group position="apart">
          <Group>
            <Button
              variant="subtle"
              leftIcon={<IconArrowLeft size={16} />}
              onClick={() => navigate('/services')}
            >
              Back to Services
            </Button>
            <Title order={2}>{service.name}</Title>
            <Badge color={getStatusColor(service.status)} variant="light">
              {service.status}
            </Badge>
          </Group>
          <Group>
            <Button
              variant="light"
              leftIcon={<IconEdit size={16} />}
              onClick={() => navigate(`/services/${id}/edit`)}
            >
              Edit
            </Button>
            <Button
              variant="light"
              color="red"
              leftIcon={<IconTrash size={16} />}
              onClick={() => setShowDeleteModal(true)}
            >
              Delete
            </Button>
          </Group>
        </Group>

        <Paper withBorder p="xl">
          <Stack spacing="md">
            <Group position="apart">
              <Text size="sm" color="dimmed">Service ID</Text>
              <Text size="sm" style={{ fontFamily: 'monospace' }}>{service.id}</Text>
            </Group>

            <Group position="apart">
              <Text size="sm" color="dimmed">URL</Text>
              <Text size="sm" style={{ fontFamily: 'monospace' }} color="blue">
                {service.url}
              </Text>
            </Group>

            {service.description && (
              <Group position="apart">
                <Text size="sm" color="dimmed">Description</Text>
                <Text size="sm">{service.description}</Text>
              </Group>
            )}

            {service.version && (
              <Group position="apart">
                <Text size="sm" color="dimmed">Version</Text>
                <Text size="sm">{service.version}</Text>
              </Group>
            )}

            <Group position="apart">
              <Text size="sm" color="dimmed">HMAC Authentication</Text>
              <Badge color={service.enableHMAC ? 'green' : 'red'} variant="light">
                {service.enableHMAC ? 'Enabled' : 'Disabled'}
              </Badge>
            </Group>

            <Group position="apart">
              <Text size="sm" color="dimmed">Timeout</Text>
              <Text size="sm">{service.timeout}ms</Text>
            </Group>

            <Group position="apart">
              <Text size="sm" color="dimmed">Batching</Text>
              <Badge color={service.enableBatching ? 'green' : 'red'} variant="light">
                {service.enableBatching ? 'Enabled' : 'Disabled'}
              </Badge>
            </Group>

            <Group position="apart">
              <Text size="sm" color="dimmed">Created</Text>
              <Text size="sm">{new Date(service.createdAt).toLocaleString()}</Text>
            </Group>

            <Group position="apart">
              <Text size="sm" color="dimmed">Updated</Text>
              <Text size="sm">{new Date(service.updatedAt).toLocaleString()}</Text>
            </Group>

            {service.owner && (
              <Group position="apart">
                <Text size="sm" color="dimmed">Owner</Text>
                <Text size="sm">{service.owner.email}</Text>
              </Group>
            )}
          </Stack>
        </Paper>

        {service.enableHMAC && (
          <Paper withBorder p="xl">
            <Stack spacing="md">
              <Group position="apart">
                <Title order={3}>HMAC Keys</Title>
                <Button
                  variant="light"
                  leftIcon={<IconRefresh size={16} />}
                  onClick={handleRotateKey}
                  loading={isRotating}
                >
                  Rotate Key
                </Button>
              </Group>

              {isLoadingKeys ? (
                <LoadingOverlay visible />
              ) : (
                <Table striped highlightOnHover>
                  <thead>
                    <tr>
                      <th>Key ID</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Expires</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                          <Text color="dimmed">No keys found</Text>
                        </td>
                      </tr>
                    ) : (
                      keys.map((key: ServiceKey) => (
                        <tr key={key.id}>
                          <td>
                            <Text size="sm" style={{ fontFamily: 'monospace' }}>
                              {key.keyId}
                            </Text>
                          </td>
                          <td>
                            <Badge color={getStatusColor(key.status)} variant="light" size="sm">
                              {key.status}
                            </Badge>
                          </td>
                          <td>
                            <Text size="sm">
                              {new Date(key.createdAt).toLocaleDateString()}
                            </Text>
                          </td>
                          <td>
                            <Text size="sm">
                              {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : 'Never'}
                            </Text>
                          </td>
                          <td>
                            <Group spacing="xs">
                              <Tooltip label="Copy Key ID">
                                <ActionIcon
                                  color="blue"
                                  variant="light"
                                  size="sm"
                                  onClick={() => copyToClipboard(key.keyId)}
                                >
                                  <IconCopy size={14} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Service"
        size="md"
      >
        <Stack spacing="md">
          <Alert icon={<IconAlertCircle />} color="red">
            Are you sure you want to delete this service? This action cannot be undone.
          </Alert>
          
          <Text size="sm">
            Service: <strong>{service.name}</strong>
          </Text>
          
          <Group position="right">
            <Button variant="light" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteService}
              loading={isDeleting}
            >
              Delete Service
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Key Rotation Success Modal */}
      <Modal
        opened={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        title="Key Rotated Successfully"
        size="lg"
        withCloseButton={false}
      >
        <Stack spacing="md">
          <Alert icon={<IconCheck />} color="green">
            Your service key has been rotated successfully!
          </Alert>

          {rotatedKey && (
            <>
              <Text size="sm" color="dimmed">
                {rotatedKey.instructions}
              </Text>

              <Box>
                <Text size="sm" weight={500} mb="xs">
                  Key ID:
                </Text>
                <Group spacing="xs">
                  <Code block>{rotatedKey.keyId}</Code>
                  <ActionIcon
                    color="blue"
                    variant="light"
                    onClick={() => copyToClipboard(rotatedKey.keyId)}
                  >
                    <IconCopy size={14} />
                  </ActionIcon>
                </Group>
              </Box>

              <Box>
                <Group spacing="xs" mb="xs">
                  <Text size="sm" weight={500}>
                    Secret Key:
                  </Text>
                  <ActionIcon
                    color="blue"
                    variant="light"
                    size="sm"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                  </ActionIcon>
                </Group>
                <Group spacing="xs">
                  <Code block>
                    {showSecretKey ? rotatedKey.secretKey : '••••••••••••••••••••••••••••••••'}
                  </Code>
                  <ActionIcon
                    color="blue"
                    variant="light"
                    onClick={() => copyToClipboard(rotatedKey.secretKey)}
                  >
                    <IconCopy size={14} />
                  </ActionIcon>
                </Group>
              </Box>

              <Alert icon={<IconKey />} color="yellow">
                <Text size="sm">
                  <strong>Important:</strong> This is the only time you'll see the new secret key.
                  Your old key will expire in 1 hour.
                </Text>
              </Alert>
            </>
          )}

          <Group position="right">
            <Button onClick={() => setShowKeyModal(false)}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
