import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core';
import { useOne } from '@refinedev/core';
import { IconAlertCircle, IconCheck, IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authenticatedFetch } from '../../utils/auth';

export const ApplicationDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const { data, isLoading, isError, error, refetch } = useOne({ resource: 'applications', id: id as string });
  const app = data?.data as any;

  // API key creation modal state
  const [keyName, setKeyName] = React.useState('');
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [expiresAt, setExpiresAt] = React.useState<string>('');
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = React.useState(false);

  // Service whitelist
  const [serviceToAdd, setServiceToAdd] = React.useState<string | null>(null);

  const [services, setServices] = React.useState<any[]>([]);

  React.useEffect(() => {
    (async () => {
      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: `query { externallyAccessibleServices { id name status } }` })
      });
      const result = await response.json();
      if (result.errors) return;
      setServices(result.data.externallyAccessibleServices || []);
    })();
  }, []);

  const createKeyRequest = async (payload: any) => {
    const mutation = `mutation CreateAppKey($applicationId: ID!, $name: String!, $scopes: [String!], $expiresAt: DateTimeISO){
      createApiKey(applicationId: $applicationId, name: $name, scopes: $scopes, expiresAt: $expiresAt)
    }`;
    const response = await authenticatedFetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query: mutation, variables: payload })
    });
    return response.json();
  };

  const revokeKeyRequest = async (payload: any) => {
    const mutation = `mutation RevokeKey($apiKeyId: ID!){ revokeApiKey(apiKeyId: $apiKeyId) }`;
    const response = await authenticatedFetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query: mutation, variables: payload })
    });
    return response.json();
  };

  const addServiceRequest = async (payload: any) => {
    const mutation = `mutation AddService($applicationId: ID!, $serviceId: ID!){ addServiceToApplication(applicationId: $applicationId, serviceId: $serviceId) }`;
    const response = await authenticatedFetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query: mutation, variables: payload })
    });
    return response.json();
  };

  const removeServiceRequest = async (payload: any) => {
    const mutation = `mutation RemoveService($applicationId: ID!, $serviceId: ID!){ removeServiceFromApplication(applicationId: $applicationId, serviceId: $serviceId) }`;
    const response = await authenticatedFetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query: mutation, variables: payload })
    });
    return response.json();
  };

  const handleCreateKey = async () => {
    if (!id || !keyName) return;
    const scopesArr = scopes;
    // Convert local datetime input to ISO string expected by API (DateTimeISO scalar)
    const expiresAtISO = expiresAt ? new Date(expiresAt).toISOString() : null;
    const res = await createKeyRequest({
      applicationId: id,
      name: keyName,
      scopes: scopesArr,
      expiresAt: expiresAtISO
    });
    const apiKey = res?.data?.createApiKey;
    if (apiKey) {
      setCreatedKey(apiKey);
      setShowKeyModal(true);
      setKeyName('');
      setScopes([]);
      setExpiresAt('');
      await refetch();
    }
  };

  const handleRevokeKey = async (apiKeyId: string) => {
    await revokeKeyRequest({ apiKeyId });
    await refetch();
  };

  const handleAddService = async () => {
    if (!id || !serviceToAdd) return;
    await addServiceRequest({ applicationId: id, serviceId: serviceToAdd });
    setServiceToAdd(null);
    await refetch();
  };

  const handleRemoveService = async (serviceId: string) => {
    if (!id) return;
    await removeServiceRequest({ applicationId: id, serviceId });
    await refetch();
  };

  return (
    <Stack spacing="lg">
      <Group position="apart">
        <Title order={2}>Application Details</Title>
        <Button variant="light" onClick={() => navigate('/applications')}>
          Back
        </Button>
      </Group>

      {isError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {error?.message || 'Failed to load application'}
        </Alert>
      )}

      {app && (
        <>
          <Paper withBorder p="md">
            <Stack>
              <TextInput label="Name" value={app.name} readOnly />
              <Textarea label="Description" value={app.description || ''} readOnly />
              <Text size="sm" color="dimmed">
                Owner: {app.owner?.email || app.ownerId}
              </Text>
            </Stack>
          </Paper>

          <Group align="flex-start" grow>
            <Paper withBorder p="md">
              <Stack>
                <Group position="apart">
                  <Title order={4}>API Keys</Title>
                </Group>
                <Stack spacing="xs">
                  <Group align="flex-end" grow>
                    <TextInput
                      label="Key name"
                      placeholder="e.g. CI bot, Staging app"
                      value={keyName}
                      onChange={(e) => setKeyName(e.currentTarget.value)}
                      required
                    />
                    <MultiSelect
                      label="Scopes"
                      placeholder="Select or type scopes"
                      data={(() => {
                        const fromExisting = (app?.apiKeys || [])
                          .flatMap((k: any) => k.scopes || [])
                          .filter((v: any, i: number, a: any[]) => a.indexOf(v) === i);
                        const fallback = ['read:applications', 'write:applications', 'read:services', 'write:services'];
                        return (fromExisting.length ? fromExisting : fallback).map((s: string) => ({ value: s, label: s }));
                      })()}
                      value={scopes}
                      onChange={setScopes}
                      searchable
                      clearable
                      creatable
                      getCreateLabel={(query) => `+ Add "${query}"`}
                      onCreate={(query) => {
                        const newItem = { value: query, label: query };
                        setScopes((prev) => Array.from(new Set([...prev, query])));
                        return newItem;
                      }}
                      nothingFound="No scopes"
                      description="Choose one or more scopes; you can also type to add custom scopes."
                    />
                    <TextInput
                      label="Expires"
                      type="datetime-local"
                      placeholder="Optional"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.currentTarget.value)}
                      description="Leave empty for a non-expiring key"
                    />
                  </Group>
                  <Group position="right">
                    <Button leftIcon={<IconPlus size={16} />} onClick={handleCreateKey} disabled={!keyName}>
                      Create Key
                    </Button>
                  </Group>
                </Stack>
                <Table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Prefix</th>
                      <th>Status</th>
                      <th>Scopes</th>
                      <th>Expires</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(app.apiKeys || []).map((k: any) => (
                      <tr key={k.id}>
                        <td>{k.name}</td>
                        <td>
                          <Code>{k.keyPrefix}</Code>
                        </td>
                        <td>
                          <Badge variant="light" color={k.status === 'active' ? 'green' : 'red'}>
                            {k.status}
                          </Badge>
                        </td>
                        <td>{k.scopes?.length ? k.scopes.join(', ') : '—'}</td>
                        <td>{k.expiresAt ? new Date(k.expiresAt).toLocaleString() : '—'}</td>
                        <td>
                          <ActionIcon color="red" variant="light" onClick={() => handleRevokeKey(k.id)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Stack>
            </Paper>

            <Paper withBorder p="md">
              <Stack>
                <Title order={4}>Whitelisted Services</Title>
                <Group>
                  <Select
                    placeholder="Select a service to whitelist"
                    data={services.map((s: any) => ({ value: s.id, label: s.name }))}
                    value={serviceToAdd}
                    onChange={setServiceToAdd}
                    searchable
                  />
                  <Button onClick={handleAddService} disabled={!serviceToAdd}>
                    Add
                  </Button>
                </Group>
                <Table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(app.whitelistedServices || []).map((s: any) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>
                          <Badge variant="light">{s.status}</Badge>
                        </td>
                        <td>
                          <ActionIcon color="red" variant="light" onClick={() => handleRemoveService(s.id)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Stack>
            </Paper>
          </Group>
        </>
      )}

      <Modal opened={showKeyModal} onClose={() => setShowKeyModal(false)} title="API Key Created">
        <Stack>
          <Alert icon={<IconCheck />} color="green">
            Copy your API key now. You won't be able to see it again.
          </Alert>
          {createdKey && (
            <Box>
              <Group position="apart" mb="xs">
                <Text size="sm" weight={500}>
                  API Key
                </Text>
                <Button
                  variant="light"
                  size="xs"
                  leftIcon={<IconCopy size={14} />}
                  onClick={() => navigator.clipboard?.writeText(createdKey)}
                >
                  Copy
                </Button>
              </Group>
              <Code block>{createdKey}</Code>
            </Box>
          )}
          <Group position="right">
            <Button onClick={() => setShowKeyModal(false)}>Done</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
