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
import { useList } from '@refinedev/core';
import { IconAlertCircle, IconEye, IconPlus, IconRefresh, IconSearch } from '@tabler/icons-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

export const ApplicationList: React.FC = () => {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = React.useState('');
  const [appToDelete, setAppToDelete] = React.useState<any>(null);

  const { data, isLoading, isError, error, refetch } = useList({ resource: 'applications' });

  const applications = data?.data || [];

  const filtered = applications.filter((app: any) => app.name.toLowerCase().includes(searchValue.toLowerCase()));

  return (
    <>
      <Stack spacing="lg">
        <Group position="apart">
          <Title order={2}>Applications</Title>
          <Button leftIcon={<IconPlus size={16} />} onClick={() => navigate('/applications/create')}>
            New Application
          </Button>
        </Group>

        {isError && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error?.message || 'Failed to load applications'}
          </Alert>
        )}

        <Group position="apart">
          <TextInput
            placeholder="Search applications by name..."
            icon={<IconSearch size={16} />}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
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
                <th>Description</th>
                <th>Owner</th>
                <th>Services</th>
                <th>Keys</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                    <Text color="dimmed">{isLoading ? 'Loading...' : 'No applications found'}</Text>
                  </td>
                </tr>
              ) : (
                filtered.map((app: any) => (
                  <tr key={app.id}>
                    <td>
                      <div>
                        <Text size="sm" weight={500}>
                          {app.name}
                        </Text>
                        {app.id && (
                          <Text size="xs" color="dimmed">
                            ID: {app.id}
                          </Text>
                        )}
                      </div>
                    </td>
                    <td>
                      <Text size="sm" color="dimmed">
                        {app.description || '—'}
                      </Text>
                    </td>
                    <td>
                      <Text size="sm">{app.owner?.email || app.ownerId}</Text>
                    </td>
                    <td>
                      <Badge variant="light">{app.whitelistedServices?.length ?? 0}</Badge>
                    </td>
                    <td>
                      <Badge variant="light">{app.apiKeys?.length ?? 0}</Badge>
                    </td>
                    <td>
                      <Text size="sm" color="dimmed">
                        {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'N/A'}
                      </Text>
                    </td>
                    <td>
                      <Group spacing="xs">
                        <Tooltip label="View Details">
                          <ActionIcon
                            color="blue"
                            variant="light"
                            size="sm"
                            onClick={() => navigate(`/applications/${app.id}`)}
                          >
                            <IconEye size={14} />
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

        {applications.length > 0 && (
          <Group position="center">
            <Text size="sm" color="dimmed">
              Showing {filtered.length} of {applications.length} applications
            </Text>
          </Group>
        )}
      </Stack>

      <Modal opened={!!appToDelete} onClose={() => setAppToDelete(null)} title="Delete Application" size="md">
        <Alert icon={<IconAlertCircle />} color="red">
          Application deletion is not implemented here.
        </Alert>
      </Modal>
    </>
  );
};
