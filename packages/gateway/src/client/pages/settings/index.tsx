import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title
} from '@mantine/core';
import { IconClock, IconDatabase, IconInfoCircle, IconRobot, IconSettings, IconShield } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import {
  authenticatedFetch,
  getTokenTimeToExpiry,
  isAutoRefreshEnabled,
  refreshAuthToken,
  setAutoRefreshEnabled
} from '../../utils/auth';

export const SessionSettings: React.FC = () => {
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(true);
  const [timeToExpiry, setTimeToExpiry] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Audit retention state
  const [auditRetention, setAuditRetention] = useState<number | null>(null);
  const [auditInitial, setAuditInitial] = useState<number | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditSaving, setAuditSaving] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  // Public documentation mode
  const [docsMode, setDocsMode] = useState<'DISABLED' | 'PREVIEW' | 'ENABLED' | null>(null);
  const [docsModeInitial, setDocsModeInitial] = useState<'DISABLED' | 'PREVIEW' | 'ENABLED' | null>(null);
  const [docsModeSaving, setDocsModeSaving] = useState(false);
  const [docsModeError, setDocsModeError] = useState<string | null>(null);
  // AI docs generation config
  const [aiProvider, setAiProvider] = useState<'OPENAI'>('OPENAI');
  const [aiBaseUrl, setAiBaseUrl] = useState<string>('');
  const [aiModel, setAiModel] = useState<string>('');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(true);
  const [aiSaving, setAiSaving] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiKeySet, setAiKeySet] = useState<boolean>(false);
  const [genBusy, setGenBusy] = useState<boolean>(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);

  useEffect(() => {
    // Load current settings
    setAutoRefreshEnabledState(isAutoRefreshEnabled());
    setTimeToExpiry(getTokenTimeToExpiry());

    // Update time every 30 seconds
    const interval = setInterval(() => {
      setTimeToExpiry(getTokenTimeToExpiry());
    }, 30 * 1000);

    // Fetch settings (admin only route - if unauthorized we silently ignore)
    (async () => {
      try {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query Settings { settings { auditLogRetentionDays publicDocumentationMode } }`
          })
        });
        const data = await res.json();
        if (data?.data?.settings) {
          setAuditRetention(data.data.settings.auditLogRetentionDays);
          setAuditInitial(data.data.settings.auditLogRetentionDays);
          if (data.data.settings.publicDocumentationMode) {
            setDocsMode(data.data.settings.publicDocumentationMode as 'DISABLED' | 'PREVIEW' | 'ENABLED');
            setDocsModeInitial(data.data.settings.publicDocumentationMode as 'DISABLED' | 'PREVIEW' | 'ENABLED');
          }
        }
      } catch (e: any) {
        setAuditError(e?.message || 'Failed to load settings');
      } finally {
        setAuditLoading(false);
      }
    })();

    // Load AI docs config (best-effort; ignore errors in non-admin contexts)
    (async () => {
      try {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `query { aiDocsConfig { provider baseUrl model apiKeySet } }` })
        });
        const json = await res.json();
        if (json?.data?.aiDocsConfig) {
          setAiProvider('OPENAI');
          setAiBaseUrl(json.data.aiDocsConfig.baseUrl || '');
          setAiModel(json.data.aiDocsConfig.model || 'gpt-4o-mini');
          setAiKeySet(!!json.data.aiDocsConfig.apiKeySet);
        }
      } catch (e) {
        // ignore silently for non-admin users
      } finally {
        setAiLoading(false);
      }
    })();

    return () => clearInterval(interval);
  }, []);

  const handleAutoRefreshToggle = (enabled: boolean) => {
    setAutoRefreshEnabled(enabled);
    setAutoRefreshEnabledState(enabled);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshAuthToken();
      setTimeToExpiry(getTokenTimeToExpiry());
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
    setIsRefreshing(false);
  };

  return (
    <Stack spacing="lg">
      <Group spacing="sm">
        <IconSettings size={24} />
        <Title order={2}>Gateway Settings</Title>
      </Group>

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Group position="apart">
            <div>
              <Text weight={500} size="md">
                Automatic Session Refresh
              </Text>
              <Text size="sm" color="dimmed">
                Keep your session active in the background
              </Text>
            </div>
            <Switch
              checked={autoRefreshEnabled}
              onChange={(event) => handleAutoRefreshToggle(event.currentTarget.checked)}
              size="lg"
              onLabel="ON"
              offLabel="OFF"
            />
          </Group>

          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            <Text size="sm">
              When enabled, your session will be automatically refreshed 2 minutes before expiry. This keeps you logged in for
              up to 7 days without interruption.
            </Text>
          </Alert>

          {autoRefreshEnabled && (
            <Group spacing="xs">
              <IconShield size={16} color="green" />
              <Text size="sm" color="green">
                Auto-refresh is active - your session will be maintained automatically
              </Text>
            </Group>
          )}

          {!autoRefreshEnabled && (
            <Group spacing="xs">
              <IconClock size={16} color="orange" />
              <Text size="sm" color="orange">
                Manual mode - you'll need to refresh your session manually or re-login when it expires
              </Text>
            </Group>
          )}
        </Stack>
      </Card>

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Group spacing="sm">
            <IconRobot size={20} />
            <Text weight={500} size="md">
              AI Doc Generation
            </Text>
          </Group>
          {aiLoading ? (
            <Group>
              <Loader size="sm" /> <Text size="sm">Loading AI configuration...</Text>
            </Group>
          ) : (
            <>
              {aiError && (
                <Alert color="red" title="Error" icon={<IconInfoCircle size={16} />}>
                  {aiError}
                </Alert>
              )}
              <Select
                label="Provider"
                value={aiProvider}
                data={[{ value: 'OPENAI', label: 'OpenAI compatible' }]}
                onChange={(val) => setAiProvider((val as any) || 'OPENAI')}
              />
              <NumberInput
                label="Model (as text)"
                description="For OpenAI-compatible APIs, set model id."
                value={undefined}
                styles={{ input: { display: 'none' } }}
              />
              <Stack spacing={4}>
                <Text size="sm">Model</Text>
                <input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
              </Stack>
              <Stack spacing={4}>
                <Text size="sm">Base URL (optional)</Text>
                <input
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
              </Stack>
              <Stack spacing={4}>
                <Text size="sm">
                  API Key{' '}
                  {aiKeySet && (
                    <Badge color="green" ml={8}>
                      Stored
                    </Badge>
                  )}
                </Text>
                <input
                  value={aiApiKey}
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder={aiKeySet ? '•••••••••••••••••••••' : 'sk-...'}
                  type="password"
                  style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 6 }}
                />
              </Stack>
              <Group spacing="sm">
                <Button
                  size="xs"
                  loading={aiSaving}
                  onClick={async () => {
                    setAiSaving(true);
                    setAiError(null);
                    try {
                      const res = await authenticatedFetch('/graphql', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          query: `mutation Set($input:SetAIDocsConfigInput!) { setAIDocsConfig(input:$input) }`,
                          variables: {
                            input: {
                              provider: 'OPENAI',
                              baseUrl: aiBaseUrl || null,
                              model: aiModel || null,
                              apiKey: aiApiKey || null
                            }
                          }
                        })
                      });
                      const json = await res.json();
                      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to save');
                      setAiApiKey('');
                      setAiKeySet(true);
                    } catch (e: any) {
                      setAiError(e?.message || 'Failed to save');
                    } finally {
                      setAiSaving(false);
                    }
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="light"
                  size="xs"
                  loading={genBusy}
                  onClick={async () => {
                    setGenBusy(true);
                    setGenMsg(null);
                    try {
                      const res = await authenticatedFetch('/graphql', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          query: `mutation { generateDocsFromSDL(options: { publish: true }) { created updated } }`
                        })
                      });
                      const json = await res.json();
                      if (json.errors) throw new Error(json.errors[0]?.message || 'Generation failed');
                      setGenMsg(
                        `Generated: ${json.data.generateDocsFromSDL.created} created, ${json.data.generateDocsFromSDL.updated} updated`
                      );
                    } catch (e: any) {
                      setGenMsg(e?.message || 'Failed to generate');
                    } finally {
                      setGenBusy(false);
                    }
                  }}
                >
                  Seed docs from services
                </Button>
              </Group>
              {genMsg && (
                <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                  {genMsg}
                </Alert>
              )}
              <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                <Text size="xs">
                  Seeding reads each registered service SDL and creates an overview page. Add an API key to enable future
                  LLM-powered enrichment.
                </Text>
              </Alert>
            </>
          )}
        </Stack>
      </Card>

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Text weight={500} size="md">
            Current Session Status
          </Text>

          <Group position="apart">
            <Text size="sm">Time until expiry:</Text>
            <Badge color={timeToExpiry && timeToExpiry > 10 ? 'green' : timeToExpiry && timeToExpiry > 5 ? 'yellow' : 'red'}>
              {timeToExpiry ? `${timeToExpiry} minutes` : 'Unknown'}
            </Badge>
          </Group>

          <Group position="apart">
            <Text size="sm">Auto-refresh status:</Text>
            <Badge color={autoRefreshEnabled ? 'green' : 'gray'}>{autoRefreshEnabled ? 'Enabled' : 'Disabled'}</Badge>
          </Group>

          <Divider />

          <Group spacing="sm">
            <Button
              variant="light"
              size="sm"
              onClick={handleManualRefresh}
              loading={isRefreshing}
              disabled={!timeToExpiry || timeToExpiry <= 0}
            >
              Refresh Session Now
            </Button>
            <Text size="xs" color="dimmed">
              Manually extend your session by 15 minutes
            </Text>
          </Group>
        </Stack>
      </Card>

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Group spacing="sm">
            <IconDatabase size={20} />
            <Text weight={500} size="md">
              Audit Log Retention
            </Text>
          </Group>
          {auditLoading ? (
            <Group>
              <Loader size="sm" /> <Text size="sm">Loading current retention...</Text>
            </Group>
          ) : auditError ? (
            <Alert color="red" title="Failed to load" icon={<IconInfoCircle size={16} />}>
              {' '}
              {auditError}{' '}
            </Alert>
          ) : (
            <>
              <NumberInput
                label="Retention (days)"
                description="How long audit log entries are kept before eligible for cleanup"
                min={1}
                max={1825}
                value={auditRetention === null ? undefined : auditRetention}
                onChange={(val) => setAuditRetention(typeof val === 'number' ? val : auditRetention)}
              />
              <Group spacing="sm">
                <Button
                  size="xs"
                  disabled={auditSaving || auditRetention === null || auditRetention === auditInitial}
                  loading={auditSaving}
                  onClick={async () => {
                    if (auditRetention === null) return;
                    setAuditSaving(true);
                    setAuditError(null);
                    try {
                      const res = await authenticatedFetch('/graphql', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          query: `mutation UpdateRetention($days: Int!) { updateAuditLogRetentionDays(days: $days) }`,
                          variables: { days: auditRetention }
                        })
                      });
                      const json = await res.json();
                      if (json.errors) {
                        throw new Error(json.errors[0]?.message || 'Update failed');
                      }
                      setAuditInitial(auditRetention);
                    } catch (e: any) {
                      setAuditError(e?.message || 'Failed to update retention');
                    } finally {
                      setAuditSaving(false);
                    }
                  }}
                >
                  Save
                </Button>
                {auditInitial !== null && auditRetention !== auditInitial && (
                  <Button variant="subtle" size="xs" disabled={auditSaving} onClick={() => setAuditRetention(auditInitial)}>
                    Reset
                  </Button>
                )}
              </Group>
              <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                <Text size="xs">
                  Increasing retention increases storage usage. The cleanup job runs periodically based on configured cleanup
                  interval; changes apply to newly written logs immediately.
                </Text>
              </Alert>
            </>
          )}
        </Stack>
      </Card>

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Group spacing="sm">
            <IconInfoCircle size={20} />
            <Text weight={500} size="md">
              Public Documentation Mode
            </Text>
          </Group>
          {auditLoading ? (
            <Group>
              <Loader size="sm" /> <Text size="sm">Loading current mode...</Text>
            </Group>
          ) : docsModeError ? (
            <Alert color="red" title="Failed to load" icon={<IconInfoCircle size={16} />}>
              {docsModeError}
            </Alert>
          ) : (
            <>
              <Select
                label="Mode"
                description="Controls visibility of published API documentation pages"
                value={docsMode ?? undefined}
                onChange={(val) => setDocsMode((val as any) || docsMode)}
                data={[
                  { value: 'DISABLED', label: 'Disabled (hidden from all users)' },
                  { value: 'PREVIEW', label: 'Preview (only authenticated users)' },
                  { value: 'ENABLED', label: 'Enabled (publicly accessible)' }
                ]}
              />
              <Group spacing="sm">
                <Button
                  size="xs"
                  loading={docsModeSaving}
                  disabled={docsModeSaving || docsMode === null || docsMode === docsModeInitial}
                  onClick={async () => {
                    if (docsMode === null) return;
                    setDocsModeSaving(true);
                    setDocsModeError(null);
                    try {
                      const res = await authenticatedFetch('/graphql', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          query: `mutation SetDocsMode($mode: PublicDocumentationMode!) { setPublicDocumentationMode(mode: $mode) }`,
                          variables: { mode: docsMode }
                        })
                      });
                      const json = await res.json();
                      if (json.errors) throw new Error(json.errors[0]?.message || 'Update failed');
                      setDocsModeInitial(docsMode);
                    } catch (e: any) {
                      setDocsModeError(e?.message || 'Failed to update mode');
                    } finally {
                      setDocsModeSaving(false);
                    }
                  }}
                >
                  Save
                </Button>
                {docsModeInitial !== null && docsMode !== docsModeInitial && (
                  <Button variant="subtle" size="xs" disabled={docsModeSaving} onClick={() => setDocsMode(docsModeInitial)}>
                    Reset
                  </Button>
                )}
              </Group>
              <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                <Text size="xs">
                  <strong>DISABLED:</strong> No documentation pages are served. <strong>PREVIEW:</strong> Accessible only to
                  authenticated users. <strong>ENABLED:</strong> Publicly accessible without authentication.
                </Text>
              </Alert>
            </>
          )}
        </Stack>
      </Card>

      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Stack spacing="md">
          <Text weight={500} size="md">
            How It Works
          </Text>

          <Stack spacing="xs">
            <Text size="sm">
              • <strong>Access Tokens:</strong> Valid for 15 minutes
            </Text>
            <Text size="sm">
              • <strong>Refresh Tokens:</strong> Valid for 7 days
            </Text>
            <Text size="sm">
              • <strong>Auto-refresh:</strong> Triggers 2 minutes before token expiry
            </Text>
            <Text size="sm">
              • <strong>Maximum Session:</strong> Up to 7 days with auto-refresh enabled
            </Text>
          </Stack>

          <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
            <Text size="sm">
              <strong>Security Note:</strong> Short-lived access tokens (15 minutes) provide better security while automatic
              refresh ensures convenience. You can disable auto-refresh if you prefer manual control over your session duration.
            </Text>
          </Alert>
        </Stack>
      </Card>
    </Stack>
  );
};
