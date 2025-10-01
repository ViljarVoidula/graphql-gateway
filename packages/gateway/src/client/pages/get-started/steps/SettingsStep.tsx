import {
  Alert,
  Button,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core';
import { IconAdjustments, IconAlertTriangle, IconCheck, IconGauge, IconShieldLock, IconSparkles } from '@tabler/icons-react';
import { FC } from 'react';

interface SettingsStepProps {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  success: string | null;
  enforceDownstreamAuth: boolean;
  onEnforceDownstreamAuthChange: (value: boolean) => void;
  graphqlPlaygroundEnabled: boolean;
  onGraphqlPlaygroundChange: (value: boolean) => void;
  graphqlVoyagerEnabled: boolean;
  onGraphqlVoyagerChange: (value: boolean) => void;
  responseCacheEnabled: boolean;
  onResponseCacheEnabledChange: (value: boolean) => void;
  responseCacheTtlMs: number;
  onResponseCacheTtlChange: (value: number) => void;
  latencyTrackingEnabled: boolean;
  onLatencyTrackingChange: (value: boolean) => void;
  aiBaseUrl: string;
  onAiBaseUrlChange: (value: string) => void;
  aiModel: string;
  onAiModelChange: (value: string) => void;
  aiApiKey: string;
  onAiApiKeyChange: (value: string) => void;
  aiKeyStored: boolean;
  saving: boolean;
  onBack: () => void;
  onSkip: () => void;
  onSave: () => void;
}

export const SettingsStep: FC<SettingsStepProps> = ({
  loading,
  loaded,
  error,
  success,
  enforceDownstreamAuth,
  onEnforceDownstreamAuthChange,
  graphqlPlaygroundEnabled,
  onGraphqlPlaygroundChange,
  graphqlVoyagerEnabled,
  onGraphqlVoyagerChange,
  responseCacheEnabled,
  onResponseCacheEnabledChange,
  responseCacheTtlMs,
  onResponseCacheTtlChange,
  latencyTrackingEnabled,
  onLatencyTrackingChange,
  aiBaseUrl,
  onAiBaseUrlChange,
  aiModel,
  onAiModelChange,
  aiApiKey,
  onAiApiKeyChange,
  aiKeyStored,
  saving,
  onBack,
  onSkip,
  onSave
}) => (
  <Stack spacing="xl">
    <Card shadow="md" p="xl" radius="lg">
      <Group spacing="sm" mb="md">
        <ThemeIcon color="teal" size="lg" radius="md">
          <IconAdjustments size={20} />
        </ThemeIcon>
        <div>
          <Title order={3}>Tune the essentials</Title>
          <Text color="dimmed">
            These settings lock in your security posture, developer tooling, and performance defaults. You can revisit
            everything later under <strong>Settings</strong>.
          </Text>
        </div>
      </Group>

      {error && (
        <Alert icon={<IconAlertTriangle size={16} />} color="red" mb="md">
          {error}
        </Alert>
      )}
      {success && (
        <Alert icon={<IconCheck size={16} />} color="green" mb="md">
          {success}
        </Alert>
      )}

      {loading && !loaded ? (
        <Center style={{ minHeight: 180 }}>
          <Loader size="lg" />
        </Center>
      ) : (
        <Stack spacing="lg">
          <Card withBorder p="lg" radius="md">
            <Group spacing="xs" mb="xs">
              <ThemeIcon color="violet" radius="md" size="sm">
                <IconShieldLock size={14} />
              </ThemeIcon>
              <Text weight={600}>Gateway guardrails</Text>
            </Group>
            <Text size="sm" color="dimmed" mb="sm">
              Require authentication before downstream calls and decide which exploratory tools stay open in this environment.
            </Text>
            <Stack spacing="sm">
              <Switch
                label="Enforce downstream authentication"
                description="Block anonymous traffic from reaching services through the gateway. Ideal for production deployments."
                checked={enforceDownstreamAuth}
                onChange={(event) => onEnforceDownstreamAuthChange(event.currentTarget.checked)}
              />
              <Switch
                label="Enable GraphQL Playground"
                description="Expose the in-browser GraphQL console at /playground for quick debugging. Disable in locked-down environments."
                checked={graphqlPlaygroundEnabled}
                onChange={(event) => onGraphqlPlaygroundChange(event.currentTarget.checked)}
              />
              <Switch
                label="Enable GraphQL Voyager"
                description="Offer a schema relationship explorer at /voyager so developers can visualize federated graphs."
                checked={graphqlVoyagerEnabled}
                onChange={(event) => onGraphqlVoyagerChange(event.currentTarget.checked)}
              />
            </Stack>
          </Card>

          <Card withBorder p="lg" radius="md">
            <Group spacing="xs" mb="xs">
              <ThemeIcon color="orange" radius="md" size="sm">
                <IconGauge size={14} />
              </ThemeIcon>
              <Text weight={600}>Performance & caching</Text>
            </Group>
            <Text size="sm" color="dimmed" mb="sm">
              A smart cache can turn expensive operations into millisecond reads. Start with global defaults you can refine
              later per operation.
            </Text>
            <Stack spacing="sm">
              <Switch
                label="Enable response cache"
                description="Serve hot GraphQL results from Redis across users to slash latency and backend load."
                checked={responseCacheEnabled}
                onChange={(event) => onResponseCacheEnabledChange(event.currentTarget.checked)}
              />
              <NumberInput
                label="Default cache TTL (ms)"
                description="How long responses stay warm before we revalidate. Set to 0 for no expiration."
                value={responseCacheTtlMs}
                onChange={(value) => onResponseCacheTtlChange(typeof value === 'number' ? value : responseCacheTtlMs)}
                min={0}
                max={86_400_000}
                step={1000}
                disabled={!responseCacheEnabled}
              />
              <Switch
                label="Collect latency metrics"
                description="Capture per-operation latency for dashboards, SLOs, and anomaly detection."
                checked={latencyTrackingEnabled}
                onChange={(event) => onLatencyTrackingChange(event.currentTarget.checked)}
              />
            </Stack>
          </Card>

          <Card withBorder p="lg" radius="md">
            <Group spacing="xs" mb="xs">
              <ThemeIcon color="cyan" radius="md" size="sm">
                <IconSparkles size={14} />
              </ThemeIcon>
              <Text weight={600}>Docs autopilot (optional)</Text>
            </Group>
            <Text size="sm" color="dimmed" mb="sm">
              Plug in OpenAI-compatible models so the gateway can synthesize service summaries and onboarding docs from SDL.
              Skip for now if you don't have a key handy—you can always configure it later.
            </Text>
            <Grid gutter="md">
              <Grid.Col md={6}>
                <TextInput
                  label="OpenAI base URL"
                  placeholder="https://api.openai.com/v1"
                  value={aiBaseUrl}
                  onChange={(event) => onAiBaseUrlChange(event.currentTarget.value)}
                />
              </Grid.Col>
              <Grid.Col md={6}>
                <TextInput
                  label="Model"
                  placeholder="gpt-5-mini"
                  value={aiModel}
                  onChange={(event) => onAiModelChange(event.currentTarget.value)}
                />
              </Grid.Col>
              <Grid.Col span={12}>
                <PasswordInput
                  label={aiKeyStored ? 'Rotate API key' : 'API key'}
                  placeholder={aiKeyStored ? 'Key already stored — enter to replace' : 'sk-...'}
                  value={aiApiKey}
                  onChange={(event) => onAiApiKeyChange(event.currentTarget.value)}
                />
              </Grid.Col>
            </Grid>
            {aiKeyStored && (
              <Text size="xs" color="dimmed" mt="xs">
                • An encrypted key is already stored. Leave this blank to keep the existing credential.
              </Text>
            )}
          </Card>

          <Group position="apart">
            <Button variant="default" onClick={onBack}>
              Back
            </Button>
            <Group spacing="sm">
              <Button variant="light" onClick={onSkip} disabled={saving}>
                Skip for now
              </Button>
              <Button loading={saving} rightIcon={<IconCheck size={16} />} onClick={onSave}>
                Save & Continue
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Card>
  </Stack>
);

export default SettingsStep;
