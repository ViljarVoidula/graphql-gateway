import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Code,
  Collapse,
  Grid,
  Group,
  Loader,
  NumberInput,
  ScrollArea,
  Stack,
  Switch,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconEye,
  IconKey,
  IconServer
} from '@tabler/icons-react';
import { FC, FormEvent, useState } from 'react';

interface ServicesStepProps {
  loading: boolean;
  loaded: boolean;
  services: Array<{ id: string; name: string; url: string; status?: string | null }>;
  error: string | null;
  success: string | null;
  hmacKeyInfo: { keyId: string; secretKey: string; instructions: string } | null;
  creatingService: boolean;
  serviceName: string;
  onServiceNameChange: (value: string) => void;
  serviceUrl: string;
  onServiceUrlChange: (value: string) => void;
  serviceDescription: string;
  onServiceDescriptionChange: (value: string) => void;
  enableHmac: boolean;
  onEnableHmacChange: (value: boolean) => void;
  enableBatching: boolean;
  onEnableBatchingChange: (value: boolean) => void;
  enableTypePrefix: boolean;
  onEnableTypePrefixChange: (value: boolean) => void;
  typePrefix: string;
  onTypePrefixChange: (value: string) => void;
  timeoutMs: number;
  onTimeoutChange: (value: number) => void;
  useMsgPack: boolean;
  onUseMsgPackChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
  onFinish: () => void;
  onSkip: () => void;
  canFinish: boolean;

  // Introspection props
  introspectionLoading: boolean;
  introspectionResult: any | null;
  introspectionError: string | null;
}

const ServicesStep: FC<ServicesStepProps> = ({
  loading,
  loaded,
  services,
  error,
  success,
  hmacKeyInfo,
  creatingService,
  serviceName,
  onServiceNameChange,
  serviceUrl,
  onServiceUrlChange,
  serviceDescription,
  onServiceDescriptionChange,
  enableHmac,
  onEnableHmacChange,
  enableBatching,
  onEnableBatchingChange,
  enableTypePrefix,
  onEnableTypePrefixChange,
  typePrefix,
  onTypePrefixChange,
  timeoutMs,
  onTimeoutChange,
  useMsgPack,
  onUseMsgPackChange,
  onSubmit,
  onBack,
  onFinish,
  onSkip,
  canFinish,
  introspectionLoading,
  introspectionResult,
  introspectionError
}) => {
  const [schemaExpanded, setSchemaExpanded] = useState(false);

  // Debug logging
  console.log('ServicesStep render:', { creatingService, loading, services: services.length });

  return (
    <Card shadow="md" p="xl" radius="lg">
      <Stack spacing="xl">
        <Group spacing="sm">
          <ThemeIcon color="indigo" size="lg" radius="md">
            <IconServer size={20} />
          </ThemeIcon>
          <div>
            <Title order={3}>Register your first service (Optional)</Title>
            <Text color="dimmed">
              Connect a GraphQL service to get started, or skip this step and add services later from the{' '}
              <strong>Services</strong> page.
            </Text>
          </div>
        </Group>

        {error && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red">
            {error}
          </Alert>
        )}
        {success && (
          <Alert icon={<IconCircleCheck size={16} />} color="green">
            {success}
          </Alert>
        )}
        {hmacKeyInfo && (
          <Alert icon={<IconKey size={16} />} color="blue" variant="light">
            <Stack spacing={4}>
              <Text weight={600}>HMAC key generated</Text>
              <Text size="sm">Key ID: {hmacKeyInfo.keyId}</Text>
              <Text size="sm" color="dimmed">
                Secret key (copy and store securely):
              </Text>
              <Text size="sm" sx={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {hmacKeyInfo.secretKey}
              </Text>
              <Text size="xs" color="dimmed">
                {hmacKeyInfo.instructions}
              </Text>
            </Stack>
          </Alert>
        )}

        {loading && !loaded ? (
          <Center style={{ minHeight: 220 }}>
            <Loader size="lg" />
          </Center>
        ) : (
          <Stack spacing="lg">
            <Box component="form" onSubmit={onSubmit}>
              <Stack spacing="lg">
                <Grid gutter="md">
                  <Grid.Col md={6}>
                    <TextInput
                      label="Service name"
                      placeholder="Inventory Graph"
                      value={serviceName}
                      onChange={(event) => onServiceNameChange(event.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col md={6}>
                    <TextInput
                      label="Endpoint URL"
                      placeholder="https://inventory.internal/graphql"
                      value={serviceUrl}
                      onChange={(event) => onServiceUrlChange(event.currentTarget.value)}
                      required
                    />
                  </Grid.Col>
                  {serviceUrl && (
                    <Grid.Col span={12}>
                      <Card withBorder p="md" radius="md">
                        <Stack spacing="sm">
                          <Group position="apart">
                            <Group spacing="xs">
                              <IconEye size={16} />
                              <Text size="sm" weight={500}>
                                Service Preview
                              </Text>
                            </Group>
                            {introspectionLoading && <Loader size="xs" />}
                          </Group>

                          {introspectionLoading && (
                            <Group spacing="xs">
                              <Loader size="xs" />
                              <Text size="xs" color="dimmed">
                                Checking service health...
                              </Text>
                            </Group>
                          )}

                          {introspectionError && (
                            <Alert icon={<IconAlertTriangle size={16} />} color="red">
                              <Stack spacing={4}>
                                <Text size="sm" weight={500}>
                                  Service Unavailable
                                </Text>
                                <Text size="xs">{introspectionError}</Text>
                              </Stack>
                            </Alert>
                          )}

                          {introspectionResult && !introspectionError && (
                            <Stack spacing="sm">
                              {introspectionResult.isHealthy ? (
                                <Alert icon={<IconCircleCheck size={16} />} color="green">
                                  <Stack spacing={4}>
                                    <Text size="sm" weight={500}>
                                      Service is healthy ✓
                                    </Text>
                                    <Group spacing="md">
                                      {introspectionResult.queries?.length > 0 && (
                                        <Badge size="xs" variant="light" color="blue">
                                          {introspectionResult.queries.length} queries
                                        </Badge>
                                      )}
                                      {introspectionResult.mutations?.length > 0 && (
                                        <Badge size="xs" variant="light" color="grape">
                                          {introspectionResult.mutations.length} mutations
                                        </Badge>
                                      )}
                                      {introspectionResult.subscriptions?.length > 0 && (
                                        <Badge size="xs" variant="light" color="orange">
                                          {introspectionResult.subscriptions.length} subscriptions
                                        </Badge>
                                      )}
                                      {introspectionResult.types?.length > 0 && (
                                        <Badge size="xs" variant="light" color="gray">
                                          {introspectionResult.types.length} types
                                        </Badge>
                                      )}
                                    </Group>
                                  </Stack>
                                </Alert>
                              ) : (
                                <Alert icon={<IconAlertTriangle size={16} />} color="yellow">
                                  <Text size="sm" weight={500}>
                                    Service responded but has issues
                                  </Text>
                                </Alert>
                              )}

                              {introspectionResult.schemaSDL && (
                                <Box>
                                  <Button
                                    variant="subtle"
                                    size="xs"
                                    leftIcon={schemaExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                    onClick={() => setSchemaExpanded(!schemaExpanded)}
                                  >
                                    {schemaExpanded ? 'Hide' : 'Show'} Schema
                                  </Button>
                                  <Collapse in={schemaExpanded}>
                                    <Box mt="xs" sx={{ maxHeight: 200, overflow: 'auto' }}>
                                      <Code block>{introspectionResult.schemaSDL}</Code>
                                    </Box>
                                  </Collapse>
                                </Box>
                              )}
                            </Stack>
                          )}
                        </Stack>
                      </Card>
                    </Grid.Col>
                  )}
                  <Grid.Col span={12}>
                    <Textarea
                      label="Description"
                      placeholder="Optional notes to help teammates understand this service."
                      minRows={2}
                      value={serviceDescription}
                      onChange={(event) => onServiceDescriptionChange(event.currentTarget.value)}
                    />
                  </Grid.Col>
                </Grid>

                <Grid gutter="md">
                  <Grid.Col md={4}>
                    <Switch
                      label="Enable HMAC auth"
                      description="Issue a shared secret so downstream calls can be authenticated."
                      checked={enableHmac}
                      onChange={(event) => onEnableHmacChange(event.currentTarget.checked)}
                    />
                  </Grid.Col>
                  <Grid.Col md={4}>
                    <Switch
                      label="Enable batching"
                      description="Allow the gateway to batch requests to this service when possible."
                      checked={enableBatching}
                      onChange={(event) => onEnableBatchingChange(event.currentTarget.checked)}
                    />
                  </Grid.Col>
                  <Grid.Col md={4}>
                    <Switch
                      label="Use MsgPack"
                      description="Request MessagePack responses to reduce payload size if the service supports it."
                      checked={useMsgPack}
                      onChange={(event) => onUseMsgPackChange(event.currentTarget.checked)}
                    />
                  </Grid.Col>
                </Grid>

                <Grid gutter="md">
                  <Grid.Col md={6}>
                    <Switch
                      label="Enable type prefixing"
                      description="Prefix remote types to avoid naming conflicts."
                      checked={enableTypePrefix}
                      onChange={(event) => onEnableTypePrefixChange(event.currentTarget.checked)}
                    />
                  </Grid.Col>
                  <Grid.Col md={6}>
                    <TextInput
                      label="Type prefix"
                      placeholder="e.g., Inventory_"
                      description="Applies to non-root types when prefixing is enabled."
                      value={typePrefix}
                      onChange={(event) => onTypePrefixChange(event.currentTarget.value)}
                      disabled={!enableTypePrefix}
                    />
                  </Grid.Col>
                </Grid>

                <NumberInput
                  label="Timeout (ms)"
                  description="How long to wait before considering the service unavailable."
                  value={timeoutMs}
                  min={1000}
                  max={60_000}
                  step={500}
                  onChange={(value) => onTimeoutChange(typeof value === 'number' ? value : timeoutMs)}
                />

                <Group position="right">
                  <Button type="submit" loading={creatingService} leftIcon={<IconServer size={16} />}>
                    Register service
                  </Button>
                </Group>
              </Stack>
            </Box>

            <Stack spacing="sm">
              <Group spacing="xs">
                <Title order={4}>Registered services</Title>
                <Badge color="blue" variant="light">
                  {services.length}
                </Badge>
              </Group>
              {services.length === 0 ? (
                <Card withBorder p="xl">
                  <Stack spacing="xs" align="center">
                    <Text color="dimmed" align="center">
                      No services yet. Add at least one upstream to finish onboarding.
                    </Text>
                  </Stack>
                </Card>
              ) : (
                <ScrollArea style={{ maxHeight: 260 }}>
                  <Table verticalSpacing="sm" highlightOnHover>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>URL</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((service) => (
                        <tr key={service.id}>
                          <td>{service.name}</td>
                          <td style={{ wordBreak: 'break-all' }}>{service.url}</td>
                          <td>
                            {service.status ? (
                              <Badge size="sm" variant="light" color={service.status === 'ACTIVE' ? 'green' : 'yellow'}>
                                {service.status.toLowerCase()}
                              </Badge>
                            ) : (
                              <Badge size="sm" variant="light" color="gray">
                                pending
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </ScrollArea>
              )}
            </Stack>

            <Group position="apart">
              <Button variant="default" onClick={onBack} disabled={creatingService || loading}>
                Back
              </Button>
              <Group spacing="sm">
                <Button variant="subtle" onClick={onSkip} disabled={creatingService || loading}>
                  Skip for now
                </Button>
                <Button
                  variant="filled"
                  color="blue"
                  onClick={() => {
                    console.log('Continue button clicked, calling onFinish');
                    onFinish();
                  }}
                  disabled={creatingService || loading}
                >
                  {services.length > 0
                    ? `Continue with ${services.length} ${services.length === 1 ? 'service' : 'services'}`
                    : 'Continue without services'}
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Stack>
    </Card>
  );
};

export default ServicesStep;
