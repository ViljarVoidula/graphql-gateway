import { Alert, Box, Button, Group, Paper, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useInvalidate, useOne } from '@refinedev/core';
import { IconAlertCircle, IconSettings } from '@tabler/icons-react';
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authenticatedFetch } from '../../utils/auth';
import {
  APIKeyCreatedModal,
  APIKeysSection,
  ApplicationAuditLog,
  BasicInformation,
  MiniBars,
  RateLimiting,
  ServiceManagement
} from './components';

export const ApplicationDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const invalidate = useInvalidate();

  const { data, isLoading, isError, error, refetch } = useOne({
    resource: 'applications',
    id: id as string
  });
  const app = data?.data as any;

  // API key creation modal state
  const [keyName, setKeyName] = React.useState('');
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [expiresAt, setExpiresAt] = React.useState<string>('');
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = React.useState(false);

  // Per-API-key usage state
  const [perKeyUsage, setPerKeyUsage] = React.useState<
    Record<string, Array<{ date: string; requestCount: number; errorCount: number; rateLimitExceededCount: number }>>
  >({});
  const [loadingKeyUsage, setLoadingKeyUsage] = React.useState<Record<string, boolean>>({});
  const [expandedUsageKeys, setExpandedUsageKeys] = React.useState<Set<string>>(new Set());

  // Service whitelist
  const [serviceToAdd, setServiceToAdd] = React.useState<string | null>(null);
  const [services, setServices] = React.useState<any[]>([]);
  const [servicesLoading, setServicesLoading] = React.useState(false);
  const [servicesError, setServicesError] = React.useState<string | null>(null);
  const [addServiceError, setAddServiceError] = React.useState<string | null>(null);
  const [addingService, setAddingService] = React.useState(false);

  // Rate limiting (admin only)
  const [rateMinute, setRateMinute] = React.useState<string>('');
  const [rateDay, setRateDay] = React.useState<string>('');
  const [rateDisabled, setRateDisabled] = React.useState<boolean>(false);
  const [isAdmin, setIsAdmin] = React.useState<boolean>(false);

  // Load services
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

  // Check admin status
  React.useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.permissions?.includes('admin')) setIsAdmin(true);
      } catch {}
    }
  }, []);

  // Initialize rate limiting values
  React.useEffect(() => {
    if (app) {
      setRateMinute(app.rateLimitPerMinute != null ? String(app.rateLimitPerMinute) : '');
      setRateDay(app.rateLimitPerDay != null ? String(app.rateLimitPerDay) : '');
      setRateDisabled(!!app.rateLimitDisabled);
    }
  }, [app]);

  // API functions
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

  // Fetch per-key usage
  const loadApiKeyUsage = async (apiKeyId: string) => {
    setLoadingKeyUsage((s) => ({ ...s, [apiKeyId]: true }));
    try {
      const query = `
        query ApiKeyUsage($apiKeyId: ID!, $limit: Int, $serviceId: ID) {
          apiKeyUsage(apiKeyId: $apiKeyId, limit: $limit, serviceId: $serviceId) {
            date
            requestCount
            errorCount
            rateLimitExceededCount
            serviceId
          }
        }
      `;
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query,
          variables: {
            apiKeyId,
            limit: 14,
            serviceId: null
          }
        })
      });
      const json = await res.json();
      if (!json.errors) {
        setPerKeyUsage((s) => ({ ...s, [apiKeyId]: json.data.apiKeyUsage || [] }));
      }
    } finally {
      setLoadingKeyUsage((s) => ({ ...s, [apiKeyId]: false }));
    }
  };

  // Event handlers
  const handleCreateKey = async () => {
    if (!id || !keyName) return;
    const scopesArr = scopes;
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

      await invalidate({
        resource: 'applications',
        invalidates: ['list', 'detail'],
        id: id
      });

      await refetch();
    } catch (error) {
      console.error('Failed to update rate limits:', error);
    }
  };

  if (isLoading) {
    return (
      <Box p="xl" style={{ backgroundColor: '#fafafa', minHeight: '100vh' }}>
        <Text>Loading...</Text>
      </Box>
    );
  }

  return (
    <Box p="xl" style={{ backgroundColor: '#fafafa', minHeight: '100vh' }}>
      <Stack spacing="xl">
        <Paper p="xl" radius="lg" withBorder style={{ backgroundColor: 'white' }}>
          <Group position="apart" align="center">
            <Group spacing="md">
              <ThemeIcon size="xl" radius="md" variant="light" color="blue">
                <IconSettings size={24} />
              </ThemeIcon>
              <div>
                <Title order={1} weight={600}>
                  {app?.name || 'Application Details'}
                </Title>
                <Text color="dimmed" size="sm">
                  {app?.description || 'No description provided'}
                </Text>
              </div>
            </Group>
            <Button variant="light" size="md" onClick={() => navigate('/applications')}>
              Back
            </Button>
          </Group>
        </Paper>

        {isError && (
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            {error?.message || 'Failed to load application'}
          </Alert>
        )}

        {app && (
          <>
            <BasicInformation app={app} />

            <APIKeysSection
              app={app}
              keyName={keyName}
              setKeyName={setKeyName}
              scopes={scopes}
              setScopes={setScopes}
              expiresAt={expiresAt}
              setExpiresAt={setExpiresAt}
              onCreateKey={handleCreateKey}
              onRevokeKey={handleRevokeKey}
              onLoadUsage={loadApiKeyUsage}
              onToggleUsageDetails={(keyId) => {
                const newExpanded = new Set(expandedUsageKeys);
                if (newExpanded.has(keyId)) {
                  newExpanded.delete(keyId);
                } else {
                  newExpanded.add(keyId);
                  if (!perKeyUsage[keyId]) {
                    loadApiKeyUsage(keyId);
                  }
                }
                setExpandedUsageKeys(newExpanded);
              }}
              perKeyUsage={perKeyUsage}
              loadingKeyUsage={loadingKeyUsage}
              expandedUsageKeys={expandedUsageKeys}
              services={services}
              MiniBars={MiniBars}
            />

            <ServiceManagement
              app={app}
              services={services}
              servicesLoading={servicesLoading}
              servicesError={servicesError}
              serviceToAdd={serviceToAdd}
              setServiceToAdd={setServiceToAdd}
              addingService={addingService}
              addServiceError={addServiceError}
              onAddService={handleAddService}
              onRemoveService={handleRemoveService}
            />

            {isAdmin && (
              <RateLimiting
                rateMinute={rateMinute}
                setRateMinute={setRateMinute}
                rateDay={rateDay}
                setRateDay={setRateDay}
                rateDisabled={rateDisabled}
                setRateDisabled={setRateDisabled}
                onUpdateRateLimits={updateRateLimits}
              />
            )}

            {/* Application Audit Log (actor column omitted as actor is known) */}
            <ApplicationAuditLog applicationId={app.id} />
          </>
        )}

        <APIKeyCreatedModal opened={showKeyModal} onClose={() => setShowKeyModal(false)} createdKey={createdKey} />
      </Stack>
    </Box>
  );
};
