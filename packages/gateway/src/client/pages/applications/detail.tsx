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
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title
} from '@mantine/core';
import { useInvalidate, useOne } from '@refinedev/core';
import { IconAlertCircle, IconCheck, IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authenticatedFetch } from '../../utils/auth';

export const ApplicationDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const invalidate = useInvalidate();

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
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [servicesError, setServicesError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      setServicesLoading(true);
      setServicesError(null);
      try {
        const query1 = `query { externallyAccessibleServices { id name status } }`;
        let response = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ query: query1 })
        });
        let result = await response.json();
        let list = result?.data?.externallyAccessibleServices || [];
        if ((!list || list.length === 0) && !result.errors) {
          // Fallback to myServices when external accessible list empty
          const query2 = `query { myServices { id name status } }`;
          response = await authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ query: query2 })
          });
          result = await response.json();
          list = result?.data?.myServices || [];
        }
        setServices(list);
      } catch (e: any) {
        setServicesError(e.message || 'Failed to load services');
      } finally {
        setServicesLoading(false);
      }
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

  const [addServiceError, setAddServiceError] = React.useState<string | null>(null);
  const [addingService, setAddingService] = React.useState(false);

  const refetchApplicationDirect = React.useCallback(async () => {
    if (!id) return;
    const query = `query MyApplications { myApplications { id name description owner { id email } apiKeys { id keyPrefix status name scopes createdAt expiresAt } whitelistedServices { id name status } } }`;
    const res = await authenticatedFetch('/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query })
    });
    const json = await res.json();
    if (!json.errors) {
      const apps = json.data.myApplications || [];
      const current = apps.find((a: any) => a.id === id);
      if (current) {
        // patch refine cache by calling refetch() after we update serviceLimits state init will run
        await refetch();
      }
    }
  }, [id, refetch]);

  const handleAddService = async () => {
    if (!id || !serviceToAdd) return;
    setAddingService(true);
    setAddServiceError(null);
    try {
      const result = await addServiceRequest({ applicationId: id, serviceId: serviceToAdd });
      if (result.errors) {
        setAddServiceError(result.errors[0]?.message || 'Failed to add service');
      } else if (!result.data?.addServiceToApplication) {
        setAddServiceError('Service was not added');
      } else {
        setServiceToAdd(null);
        await refetchApplicationDirect();
      }
    } catch (e: any) {
      setAddServiceError(e.message || 'Failed to add service');
    } finally {
      setAddingService(false);
    }
  };

  const handleRemoveService = async (serviceId: string) => {
    if (!id) return;
    await removeServiceRequest({ applicationId: id, serviceId });
    await refetch();
  };

  const [rateMinute, setRateMinute] = React.useState<string>('');
  const [rateDay, setRateDay] = React.useState<string>('');
  const [rateDisabled, setRateDisabled] = React.useState<boolean>(false);
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false);

  // Audit logs and usage data
  const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
  const [auditCategory, setAuditCategory] = React.useState<string | null>(null);
  const [auditSeverity, setAuditSeverity] = React.useState<string | null>(null);
  const [usageData, setUsageData] = React.useState<any[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [usageLoading, setUsageLoading] = React.useState(false);

  React.useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.permissions?.includes('admin')) setIsAdmin(true);
      } catch {}
    }
  }, []);

  React.useEffect(() => {
    if (app) {
      setRateMinute(app.rateLimitPerMinute != null ? String(app.rateLimitPerMinute) : '');
      setRateDay(app.rateLimitPerDay != null ? String(app.rateLimitPerDay) : '');
      setRateDisabled(!!app.rateLimitDisabled);
    }
  }, [app]);

  const updateRateLimits = async () => {
    if (!id) return;

    const variables: any = { applicationId: id };
    variables.perMinute = rateMinute === '' ? null : parseInt(rateMinute, 10);
    variables.perDay = rateDay === '' ? null : parseInt(rateDay, 10);
    variables.disabled = rateDisabled;

    try {
      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: `mutation UpdateRates($applicationId: ID!, $perMinute: Int, $perDay: Int, $disabled: Boolean){
            updateApplicationRateLimits(applicationId: $applicationId, perMinute: $perMinute, perDay: $perDay, disabled: $disabled){
              id rateLimitPerMinute rateLimitPerDay rateLimitDisabled
            }
          }`,
          variables
        })
      });

      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Invalidate both the specific application and the list
      await invalidate({
        resource: 'applications',
        invalidates: ['list', 'detail'],
        id: id
      });

      // Also refetch the current data
      await refetch();
    } catch (error) {
      console.error('Failed to update rate limits:', error);
    }
  };

  // Load audit logs
  const loadAuditLogs = React.useCallback(async () => {
    if (!id) return;
    setAuditLoading(true);
    try {
      const query = `
        query ApplicationAuditLogs($applicationId: ID!, $limit: Int, $category: AuditCategory, $severity: AuditSeverity) {
          applicationAuditLogs(applicationId: $applicationId, limit: $limit, category: $category, severity: $severity) {
            id
            eventType
            category
            severity
            action
            success
            correlationId
            metadata
            createdAt
            user {
              id
              email
            }
          }
        }
      `;
      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query,
          variables: { applicationId: id, limit: 20, category: auditCategory, severity: auditSeverity }
        })
      });
      const result = await response.json();
      if (!result.errors) {
        setAuditLogs(result.data.applicationAuditLogs || []);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setAuditLoading(false);
    }
  }, [id, auditCategory, auditSeverity]);

  // Load usage data
  const loadUsageData = React.useCallback(async () => {
    if (!id) return;
    setUsageLoading(true);
    try {
      const query = `
        query ApplicationUsage($applicationId: ID!, $limit: Int) {
          applicationUsage(applicationId: $applicationId, limit: $limit) {
            id
            date
            requestCount
            errorCount
            rateLimitExceededCount
            service {
              id
              name
            }
          }
        }
      `;
      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query,
          variables: { applicationId: id, limit: 15 }
        })
      });
      const result = await response.json();
      if (!result.errors) {
        setUsageData(result.data.applicationUsage || []);
      }
    } catch (error) {
      console.error('Failed to load usage data:', error);
    } finally {
      setUsageLoading(false);
    }
  }, [id]);

  // Load audit logs and usage data when component mounts
  React.useEffect(() => {
    if (id) {
      loadAuditLogs();
      loadUsageData();
    }
  }, [id, loadAuditLogs, loadUsageData]);

  const serviceSelectData = React.useMemo(() => services.map((s: any) => ({ value: String(s.id), label: s.name })), [services]);
  const serviceSelectDisabled = servicesLoading; // only disabled while loading

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
                    placeholder={
                      servicesLoading
                        ? 'Loading services...'
                        : servicesError
                          ? 'Error loading services'
                          : 'Select a service to whitelist'
                    }
                    data={serviceSelectData}
                    value={serviceToAdd}
                    onChange={(val) => setServiceToAdd(val)}
                    searchable
                    clearable
                    withinPortal
                    nothingFound={servicesLoading ? 'Loading...' : servicesError ? 'No services (error)' : 'No services found'}
                    disabled={serviceSelectDisabled || addingService}
                    error={servicesError || undefined}
                  />
                  <Button onClick={handleAddService} disabled={!serviceToAdd || addingService} loading={addingService}>
                    Add
                  </Button>
                </Group>
                {addServiceError && (
                  <Alert color="red" variant="light" mt={4} title="Add Service Failed">
                    {addServiceError}
                  </Alert>
                )}
                <Table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(app.whitelistedServices || []).map((s: any) => {
                      return (
                        <tr key={s.id}>
                          <td>{s.name}</td>
                          <td>
                            <Badge variant="light">{s.status}</Badge>
                          </td>
                          <td>
                            <ActionIcon color="red" variant="light" onClick={() => handleRemoveService(s.id)}>
                              <IconTrash size={14} />
                            </ActionIcon>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Stack>
            </Paper>
          </Group>

          {isAdmin && (
            <Paper withBorder p="sm" radius="md">
              <Stack spacing="xs">
                <Title order={5}>Rate Limiting</Title>
                <Group grow>
                  <TextInput
                    label="Per Minute"
                    type="number"
                    placeholder="Unlimited"
                    value={rateMinute}
                    onChange={(e) => setRateMinute(e.currentTarget.value)}
                    description="Leave empty for unlimited"
                  />
                  <TextInput
                    label="Per Day"
                    type="number"
                    placeholder="Unlimited"
                    value={rateDay}
                    onChange={(e) => setRateDay(e.currentTarget.value)}
                    description="Leave empty for unlimited"
                  />
                </Group>
                <Switch
                  label="Disable Rate Limiting"
                  checked={rateDisabled}
                  onChange={(e) => setRateDisabled(e.currentTarget.checked)}
                  description="Temporarily turn off enforcement for this app"
                />
                <Group position="right">
                  <Button size="xs" variant="light" onClick={updateRateLimits}>
                    Save Rate Limits
                  </Button>
                </Group>
              </Stack>
            </Paper>
          )}

          {/* Audit Logs Panel */}
          <Paper withBorder p="md">
            <Stack>
              <Group position="apart" align="flex-end">
                <Title order={4}>Audit Logs</Title>
                <Group spacing="xs">
                  <Select
                    placeholder="Category"
                    data={['authentication', 'authorization', 'configuration', 'security', 'data_access', 'system'].map(
                      (c) => ({ value: c, label: c })
                    )}
                    value={auditCategory}
                    onChange={setAuditCategory}
                    clearable
                    searchable
                    nothingFound="No categories"
                    size="xs"
                  />
                  <Select
                    placeholder="Severity"
                    data={['info', 'low', 'medium', 'high', 'critical'].map((s) => ({ value: s, label: s }))}
                    value={auditSeverity}
                    onChange={setAuditSeverity}
                    clearable
                    size="xs"
                  />
                  <Button size="xs" variant="light" onClick={loadAuditLogs} loading={auditLoading}>
                    Refresh
                  </Button>
                </Group>
              </Group>
              {auditLoading ? (
                <Text>Loading audit logs...</Text>
              ) : auditLogs.length === 0 ? (
                <Text c="dimmed">No audit logs found</Text>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Cat</th>
                      <th>Sev</th>
                      <th>Action</th>
                      <th>User</th>
                      <th>Details</th>
                      <th>Corr</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log: any) => (
                      <tr key={log.id}>
                        <td>
                          <Badge variant="light" size="sm">
                            {log.eventType}
                          </Badge>
                        </td>
                        <td>
                          {log.category ? (
                            <Badge variant="outline" size="sm">
                              {log.category}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {log.severity ? (
                            <Badge
                              color={log.severity === 'critical' ? 'red' : log.severity === 'high' ? 'orange' : 'blue'}
                              variant="light"
                              size="sm"
                            >
                              {log.severity}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{log.action || '—'}</td>
                        <td>{log.user?.email || '—'}</td>
                        <td>
                          {log.metadata && Object.keys(log.metadata).length > 0 ? (
                            <Code>{JSON.stringify(log.metadata, null, 2)}</Code>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{log.correlationId ? <Code>{log.correlationId.slice(0, 8)}</Code> : '—'}</td>
                        <td>
                          <Text size="xs">{new Date(log.createdAt).toLocaleString()}</Text>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Stack>
          </Paper>

          {/* Usage Statistics Panel */}
          <Paper withBorder p="md">
            <Stack>
              <Group position="apart">
                <Title order={4}>Usage Statistics</Title>
                <Button size="xs" variant="light" onClick={loadUsageData} loading={usageLoading}>
                  Refresh
                </Button>
              </Group>
              {usageLoading ? (
                <Text>Loading usage data...</Text>
              ) : usageData.length === 0 ? (
                <Text c="dimmed">No usage data found</Text>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Service</th>
                      <th>Requests</th>
                      <th>Errors</th>
                      <th>Rate Limited</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageData.map((usage: any) => (
                      <tr key={usage.id}>
                        <td>
                          <Text size="sm">{usage.date}</Text>
                        </td>
                        <td>
                          <Badge variant="light">{usage.service?.name || 'Unknown'}</Badge>
                        </td>
                        <td>
                          <Text size="sm">{usage.requestCount.toLocaleString()}</Text>
                        </td>
                        <td>
                          <Text size="sm" c={usage.errorCount > 0 ? 'red' : undefined}>
                            {usage.errorCount.toLocaleString()}
                          </Text>
                        </td>
                        <td>
                          <Text size="sm" c={usage.rateLimitExceededCount > 0 ? 'orange' : undefined}>
                            {usage.rateLimitExceededCount.toLocaleString()}
                          </Text>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Stack>
          </Paper>
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
