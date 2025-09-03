import React from 'react';
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
  Tooltip
} from '@mantine/core';
import { IconSearch, IconAlertCircle, IconRefresh, IconTrash, IconEye } from '@tabler/icons-react';

export const SessionList: React.FC = () => {
  const [sessions, setSessions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchValue, setSearchValue] = React.useState('');

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch('/graphql', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          query: `
            query GetSessions {
              users {
                id
                email
                sessions {
                  id
                  userId
                  ipAddress
                  userAgent
                  createdAt
                  isActive
                }
              }
            }
          `
        })
      });

      const result = await response.json();

      if (result.errors) {
        setError(result.errors[0]?.message || 'Failed to fetch sessions');
      } else {
        const users = result.data?.users || [];
        const allSessions = users.flatMap((user: any) =>
          user.sessions.map((session: any) => ({
            ...session,
            userEmail: user.email
          }))
        );
        setSessions(allSessions);
      }
    } catch (err) {
      setError('Failed to connect to the server');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchSessions();
  }, []);

  const filteredSessions = sessions.filter(
    (session: any) =>
      session.userEmail.toLowerCase().includes(searchValue.toLowerCase()) || session.ipAddress.includes(searchValue)
  );

  return (
    <Stack spacing="lg">
      <Group position="apart">
        <Title order={2}>Sessions</Title>
        <Button leftIcon={<IconRefresh size={16} />} onClick={fetchSessions}>
          Refresh
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {error}
        </Alert>
      )}

      <Group position="apart">
        <TextInput
          placeholder="Search sessions by user email or IP address..."
          icon={<IconSearch size={16} />}
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          style={{ minWidth: 300 }}
        />
        <Button variant="light" leftIcon={<IconRefresh size={16} />} onClick={fetchSessions}>
          Refresh
        </Button>
      </Group>

      <Paper withBorder>
        <LoadingOverlay visible={loading} />
        <Table striped highlightOnHover>
          <thead>
            <tr>
              <th>User</th>
              <th>IP Address</th>
              <th>User Agent</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                  <Text color="dimmed">{loading ? 'Loading...' : 'No sessions found'}</Text>
                </td>
              </tr>
            ) : (
              filteredSessions.map((session: any) => (
                <tr key={session.id}>
                  <td>
                    <div>
                      <Text size="sm" weight={500}>
                        {session.userEmail}
                      </Text>
                      <Text size="xs" color="dimmed">
                        ID: {session.userId}
                      </Text>
                    </div>
                  </td>
                  <td>
                    <Text size="sm" style={{ fontFamily: 'monospace' }}>
                      {session.ipAddress}
                    </Text>
                  </td>
                  <td>
                    <Text size="sm" color="dimmed" style={{ maxWidth: 200 }}>
                      {session.userAgent ? session.userAgent.substring(0, 50) + '...' : 'N/A'}
                    </Text>
                  </td>
                  <td>
                    <Badge color={session.isActive ? 'green' : 'gray'} variant="light" size="sm">
                      {session.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td>
                    <Text size="sm" color="dimmed">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </Text>
                  </td>
                  <td>
                    <Group spacing="xs">
                      <Tooltip label="View Details">
                        <ActionIcon color="blue" variant="light" size="sm" disabled>
                          <IconEye size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Terminate Session">
                        <ActionIcon color="red" variant="light" size="sm" disabled>
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

      {sessions.length > 0 && (
        <Group position="center">
          <Text size="sm" color="dimmed">
            Showing {filteredSessions.length} of {sessions.length} sessions
          </Text>
        </Group>
      )}
    </Stack>
  );
};
