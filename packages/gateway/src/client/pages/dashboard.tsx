import {
  Alert,
  Badge,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  Progress,
  RingProgress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip
} from '@mantine/core';
import { useList } from '@refinedev/core';
import {
  IconActivity,
  IconAlertTriangle,
  IconHeartbeat,
  IconKey,
  IconSettings,
  IconTrendingUp,
  IconUsers
} from '@tabler/icons-react';
import gql from 'graphql-tag';
import React, { useEffect, useState } from 'react';
import { AutoRefreshWelcome } from '../components/AutoRefreshWelcome';
import { TokenRefreshNotification } from '../components/TokenRefreshNotification';
import { authenticatedFetch } from '../utils/auth';

interface DashboardStats {
  totalUsers: number;
  totalServices: number;
  activeSessions: number;
  servicesStatus: {
    active: number;
    inactive: number;
    maintenance: number;
  };
}

const StatsCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, icon, color }) => (
  <Card shadow="sm" p="lg" radius="md" withBorder>
    <Group position="apart">
      <div>
        <Text size="sm" color="dimmed" weight={500}>
          {title}
        </Text>
        <Text size="xl" weight={700}>
          {value}
        </Text>
      </div>
      <div style={{ color }}>{icon}</div>
    </Group>
  </Card>
);

interface AuditLogSummary {
  totalLast24h: number;
  bySeverity: { severity: string; count: number }[];
  topActions: { action: string; count: number }[];
  lastEventAt?: string;
}

interface ServiceHealth {
  id: string;
  name: string;
  status: string;
  breakingChanges24h: number;
  errorRate24h: number;
  requestCount24h: number;
  lastSchemaChangeAt?: string;
}

interface UsageSummary {
  topServices: { serviceId: string; serviceName: string; requestCount24h: number; errorRate24h: number }[];
  topApplications: { applicationId: string; applicationName: string; requestCount24h: number; apiKeyCount: number }[];
  generatedAt: string;
}

export const Dashboard: React.FC = () => {
  const { data: usersData, isLoading: usersLoading } = useList({
    resource: 'users',
    meta: {
      gqlQuery: gql`
        query GetUsers {
          users {
            id
            email
            isEmailVerified
            createdAt
            sessions {
              id
              userId
              isActive
              expiresAt
              createdAt
              ipAddress
              userAgent
              lastActivity
            }
          }
        }
      `
    }
  });

  const { data: servicesData, isLoading: servicesLoading } = useList({
    resource: 'services',
    meta: {
      gqlQuery: gql`
        query GetServices {
          services {
            id
            name
            status
            url
            createdAt
          }
        }
      `
    }
  });

  // Extra backend summaries
  const [auditSummary, setAuditSummary] = useState<AuditLogSummary | null>(null);
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth[]>([]);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [loadingExtras, setLoadingExtras] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingExtras(true);
      try {
        const query = `query DashboardExtras {\n  auditLogSummary { totalLast24h bySeverity { severity count } topActions { action count } lastEventAt }\n  serviceHealth { id name status breakingChanges24h errorRate24h requestCount24h lastSchemaChangeAt }\n  usageSummary { generatedAt topServices { serviceId serviceName requestCount24h errorRate24h } topApplications { applicationId applicationName requestCount24h apiKeyCount } }\n}`;
        const resp = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ query })
        });
        const json = await resp.json();
        if (json.errors) throw new Error(json.errors[0].message);
        if (!cancelled) {
          setAuditSummary(json.data.auditLogSummary);
          setServiceHealth(json.data.serviceHealth || []);
          setUsageSummary(json.data.usageSummary || null);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load dashboard extras', e);
      } finally {
        if (!cancelled) setLoadingExtras(false);
      }
    }
    load();
    const interval = setInterval(load, 30000); // refresh every 30s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const isLoading = usersLoading || servicesLoading;

  if (isLoading) {
    return (
      <Center style={{ height: '50vh' }}>
        <Loader size="xl" />
      </Center>
    );
  }

  const users = usersData?.data || [];
  const services = servicesData?.data || [];

  // Extract all sessions from users
  const sessions = users.flatMap((user: any) => user.sessions || []);

  const activeSessions = sessions.filter((session: any) => session.isActive && new Date(session.expiresAt) > new Date()).length;

  // Normalize status casing defensively (enum is lower-case in backend but guard against variations)
  const servicesStatus = services.reduce(
    (acc: any, service: any) => {
      const status = typeof service.status === 'string' ? service.status.toLowerCase() : 'unknown';
      if (status === 'active' || status === 'inactive' || status === 'maintenance') {
        acc[status] += 1;
      }
      return acc;
    },
    { active: 0, inactive: 0, maintenance: 0 }
  );

  // Updated health score: weights active services, penalizes breaking changes & high error rates
  // Formula (simple heuristic): base = active/total; penalty = avg(errorRate24h) * 30 + (totalBreaking24h * 5) / totalServices
  const totalBreaking = serviceHealth.reduce((acc, s) => acc + s.breakingChanges24h, 0);
  const avgErrorRate = serviceHealth.length
    ? serviceHealth.reduce((acc, s) => acc + (s.errorRate24h || 0), 0) / serviceHealth.length
    : 0;
  const base = services.length > 0 ? servicesStatus.active / services.length : 1;
  const penalty = avgErrorRate * 0.3 + (services.length > 0 ? (totalBreaking * 0.05) / services.length : 0);
  let healthScore = Math.round(Math.max(0, Math.min(1, base - penalty)) * 100);

  const offlineServices = serviceHealth.filter((s) => s.status !== 'active');
  const servicesWithBreaking = serviceHealth.filter((s) => s.breakingChanges24h > 0);

  return (
    <Stack spacing="lg">
      <Group position="apart" align="center">
        <Title order={1}>Gateway Dashboard</Title>
      </Group>

      <SimpleGrid
        cols={5}
        spacing="lg"
        breakpoints={[
          { maxWidth: 'lg', cols: 3 },
          { maxWidth: 'sm', cols: 2 }
        ]}
      >
        <StatsCard title="Total Users" value={users.length} icon={<IconUsers size={32} />} color="#228be6" />
        <StatsCard title="Total Services" value={services.length} icon={<IconSettings size={32} />} color="#40c057" />
        <StatsCard title="Active Sessions" value={activeSessions} icon={<IconKey size={32} />} color="#fab005" />
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Group position="apart" align="flex-start">
            <div>
              <Text size="sm" color="dimmed" weight={500}>
                Health Score
              </Text>
              <Group spacing={4} mt={4}>
                <RingProgress
                  size={70}
                  thickness={8}
                  roundCaps
                  sections={[
                    {
                      value: healthScore,
                      color: healthScore > 80 ? 'green' : healthScore > 60 ? 'yellow' : 'red'
                    }
                  ]}
                  label={
                    <Text size="xs" weight={700}>
                      {healthScore}%
                    </Text>
                  }
                />
                <Stack spacing={2} ml="sm">
                  {/* Active services raw count (before penalty adjustments in health score) */}
                  <Text size="xs" color="dimmed">
                    Active svc: {servicesStatus.active}/{services.length}
                  </Text>
                  <Text size="xs" color="dimmed">
                    Avg err: {(avgErrorRate * 100).toFixed(1)}%
                  </Text>
                  <Text size="xs" color="dimmed">
                    Breaking 24h: {totalBreaking}
                  </Text>
                </Stack>
              </Group>
            </div>
            <IconActivity size={28} color={healthScore > 80 ? '#40c057' : healthScore > 60 ? '#fab005' : '#fa5252'} />
          </Group>
        </Card>
        <Card shadow="sm" p="lg" radius="md" withBorder>
          <Group position="apart">
            <div>
              <Text size="sm" color="dimmed" weight={500}>
                Audit Events 24h
              </Text>
              <Text size="xl" weight={700}>
                {auditSummary?.totalLast24h ?? '-'}
              </Text>
            </div>
            <IconHeartbeat size={32} color="#15aabf" />
          </Group>
        </Card>
      </SimpleGrid>

      <Grid gutter="lg">
        <Grid.Col span={6}>
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="md">
              <Title order={3}>Services Status</Title>
              <Group position="apart">
                <Text size="sm">Active</Text>
                <Badge color="green">{servicesStatus.active}</Badge>
              </Group>
              <Group position="apart">
                <Text size="sm">Inactive</Text>
                <Badge color="red">{servicesStatus.inactive}</Badge>
              </Group>
              <Group position="apart">
                <Text size="sm">Maintenance</Text>
                <Badge color="yellow">{servicesStatus.maintenance}</Badge>
              </Group>
              <div>
                <Text size="sm" color="dimmed" mb="xs">
                  Overall Health
                </Text>
                <Progress
                  value={healthScore}
                  color={healthScore > 80 ? 'green' : healthScore > 60 ? 'yellow' : 'red'}
                  size="lg"
                  radius="xl"
                />
                <Text size="xs" color="dimmed" mt="xs">
                  {healthScore}% services active
                </Text>
              </div>
              {(offlineServices.length > 0 || servicesWithBreaking.length > 0) && (
                <Alert color="red" icon={<IconAlertTriangle size={16} />} variant="light" mt="sm">
                  {offlineServices.length > 0 && (
                    <Text size="xs">{offlineServices.length} service(s) offline / not active</Text>
                  )}
                  {servicesWithBreaking.length > 0 && (
                    <Text size="xs" mt={4}>
                      {servicesWithBreaking.length} service(s) have breaking changes in last 24h
                    </Text>
                  )}
                </Alert>
              )}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={6}>
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Stack spacing="md">
              <Title order={3}>Recent Activity</Title>
              <Text size="sm" color="dimmed">
                {users.length} users registered
              </Text>
              <Text size="sm" color="dimmed">
                {services.length} services configured
              </Text>
              <Text size="sm" color="dimmed">
                {activeSessions} active sessions
              </Text>
              {healthScore < 100 && (
                <Alert color="orange" variant="light">
                  Some services are not active. Check service status.
                </Alert>
              )}
              {auditSummary && (
                <Stack spacing={4} mt="sm">
                  <Text size="xs" weight={500}>
                    Audit Severity (24h)
                  </Text>
                  <Group spacing={4}>
                    {auditSummary.bySeverity.map((s) => (
                      <Badge
                        key={s.severity}
                        size="xs"
                        color={
                          s.severity === 'critical'
                            ? 'red'
                            : s.severity === 'high'
                              ? 'orange'
                              : s.severity === 'medium'
                                ? 'yellow'
                                : 'gray'
                        }
                      >
                        {s.severity}:{s.count}
                      </Badge>
                    ))}
                  </Group>
                  <Text size="xs" mt={4} weight={500}>
                    Top Actions
                  </Text>
                  <Group spacing={4}>
                    {auditSummary.topActions.map((a) => (
                      <Badge key={a.action} size="xs" variant="outline">
                        {a.action}:{a.count}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Grid gutter="lg" mt="md">
        <Grid.Col span={6}>
          <Card withBorder shadow="sm" p="lg" radius="md">
            <Group position="apart" mb="sm">
              <Group spacing="xs">
                <IconTrendingUp size={18} />
                <Title order={4}>Top Services (24h)</Title>
              </Group>
              {loadingExtras && <Loader size="sm" />}
            </Group>
            <ScrollArea h={200} offsetScrollbars>
              <Table verticalSpacing="xs" fontSize="xs">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Requests</th>
                    <th>Error %</th>
                    <th>Breaking</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(usageSummary?.topServices || []).map((s) => {
                    const sh = serviceHealth.find((h) => h.id === s.serviceId);
                    return (
                      <tr key={s.serviceId}>
                        <td>
                          <Tooltip label={`Service ID: ${s.serviceId}`} withinPortal>
                            <Text size="xs" weight={500}>
                              {s.serviceName}
                            </Text>
                          </Tooltip>
                        </td>
                        <td>{s.requestCount24h}</td>
                        <td>{(s.errorRate24h * 100).toFixed(1)}%</td>
                        <td>{sh?.breakingChanges24h || 0}</td>
                        <td>
                          <Badge
                            size="xs"
                            color={sh?.status === 'active' ? 'green' : sh?.status === 'maintenance' ? 'yellow' : 'red'}
                          >
                            {sh?.status || 'unknown'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </ScrollArea>
          </Card>
        </Grid.Col>
        <Grid.Col span={6}>
          <Card withBorder shadow="sm" p="lg" radius="md">
            <Group position="apart" mb="sm">
              <Group spacing="xs">
                <IconTrendingUp size={18} />
                <Title order={4}>Top Applications / API Keys (24h)</Title>
              </Group>
              {loadingExtras && <Loader size="sm" />}
            </Group>
            <ScrollArea h={200} offsetScrollbars>
              <Table verticalSpacing="xs" fontSize="xs">
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Requests</th>
                    <th>API Keys</th>
                  </tr>
                </thead>
                <tbody>
                  {(usageSummary?.topApplications || []).map((a) => (
                    <tr key={a.applicationId}>
                      <td>
                        <Tooltip label={`App ID: ${a.applicationId}`} withinPortal>
                          <Text size="xs" weight={500}>
                            {a.applicationName}
                          </Text>
                        </Tooltip>
                      </td>
                      <td>{a.requestCount24h}</td>
                      <td>{a.apiKeyCount}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </ScrollArea>
          </Card>
        </Grid.Col>
      </Grid>

      <TokenRefreshNotification />
      <AutoRefreshWelcome />
    </Stack>
  );
};
