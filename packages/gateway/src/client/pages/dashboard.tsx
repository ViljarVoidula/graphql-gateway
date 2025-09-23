import {
  Badge,
  Box,
  Card,
  Center,
  Grid,
  Group,
  Loader,
  Paper,
  RingProgress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip
} from '@mantine/core';
import { useList } from '@refinedev/core';
import { IconActivity, IconChartLine, IconEye, IconKey, IconSettings, IconTrendingUp, IconUsers } from '@tabler/icons-react';
import gql from 'graphql-tag';
import React, { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';
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
  subtitle?: string;
  trend?: string;
}> = ({ title, value, icon, color, subtitle, trend }) => (
  <Card shadow="xs" p="xl" radius="lg" withBorder style={{ height: '100%' }}>
    <Group position="apart" align="flex-start" mb="md">
      <ThemeIcon size="xl" radius="md" variant="light" color={color}>
        {icon}
      </ThemeIcon>
      {trend && (
        <Badge size="sm" color="green" variant="light">
          {trend}
        </Badge>
      )}
    </Group>
    <Stack spacing="xs">
      <Text size="sm" color="dimmed" weight={500} transform="uppercase" style={{ letterSpacing: '0.5px' }}>
        {title}
      </Text>
      <Text size="xl" weight={700} color="dark">
        {value.toLocaleString()}
      </Text>
      {subtitle && (
        <Text size="xs" color="dimmed">
          {subtitle}
        </Text>
      )}
    </Stack>
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
  // Usage widgets state
  const [daily, setDaily] = useState<Array<{ date: string; requestCount: number }>>([]);
  const [topKeys, setTopKeys] = useState<Array<{ apiKeyId: string; requestCount: number }>>([]);
  const [totals, setTotals] = useState<{ totalRequests: number; totalErrors: number; totalRateLimited: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingExtras(true);
      try {
        const query = `query DashboardExtras {\n  auditLogSummary { totalLast24h bySeverity { severity count } topActions { action count } lastEventAt }\n  serviceHealth { id name status breakingChanges24h errorRate24h requestCount24h lastSchemaChangeAt }\n  usageSummary { generatedAt topServices { serviceId serviceName requestCount24h errorRate24h } topApplications { applicationId applicationName requestCount24h apiKeyCount } }\n  usageTotals(days: 7) { totalRequests totalErrors totalRateLimited }\n  usageDailyRequests(days: 14) { date requestCount }\n  usageTopApiKeys(days: 7, limit: 5) { apiKeyId requestCount }\n}`;
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
          setTotals(json.data.usageTotals || null);
          setDaily(json.data.usageDailyRequests || []);
          setTopKeys(json.data.usageTopApiKeys || []);
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
    <Box p="xl" style={{ backgroundColor: '#fafafa', minHeight: '100vh' }}>
      <Stack spacing="xl">
        <Group position="apart" align="center">
          <Title order={1} weight={600}>
            Gateway Dashboard
          </Title>
          <Badge size="lg" color="blue" variant="light">
            Live
          </Badge>
        </Group>

        {/* Main Stats Grid */}
        <SimpleGrid
          cols={4}
          spacing="xl"
          breakpoints={[
            { maxWidth: 'lg', cols: 2 },
            { maxWidth: 'sm', cols: 1 }
          ]}
        >
          <StatsCard
            title="Total Users"
            value={users.length}
            icon={<IconUsers size={24} />}
            color="blue"
            subtitle={`${users.filter((u: any) => u.isEmailVerified).length} verified`}
          />
          <Card shadow="xs" p="xl" radius="lg" withBorder>
            <Group position="apart" align="flex-start" mb="md">
              <ThemeIcon size="xl" radius="md" variant="light" color="cyan">
                <IconActivity size={24} />
              </ThemeIcon>
              {auditSummary && auditSummary.bySeverity.length > 0 && (
                <RingProgress
                  size={60}
                  thickness={6}
                  roundCaps
                  sections={auditSummary.bySeverity.slice(0, 3).map((s) => ({
                    value: (s.count / auditSummary.totalLast24h) * 100,
                    color:
                      s.severity === 'critical'
                        ? 'red'
                        : s.severity === 'high'
                          ? 'orange'
                          : s.severity === 'medium'
                            ? 'yellow'
                            : 'gray'
                  }))}
                  label={
                    <Text size="xs" weight={700} align="center">
                      {auditSummary.totalLast24h}
                    </Text>
                  }
                />
              )}
            </Group>
            <Stack spacing="xs">
              <Text size="sm" color="dimmed" weight={500} transform="uppercase" style={{ letterSpacing: '0.5px' }}>
                Recent Activity
              </Text>
              <Text size="xl" weight={700} color="dark">
                {auditSummary?.totalLast24h ?? 0} Events
              </Text>
              <Text size="xs" color="dimmed">
                {auditSummary && auditSummary.bySeverity.length > 0
                  ? `${auditSummary.bySeverity.find((s) => s.severity === 'critical')?.count || 0} critical alerts`
                  : 'No recent activity'}
              </Text>
            </Stack>
          </Card>
          <StatsCard
            title="Active Sessions"
            value={activeSessions}
            icon={<IconActivity size={24} />}
            color="orange"
            subtitle="Currently online"
          />
          <Card shadow="xs" p="xl" radius="lg" withBorder>
            <Group position="apart" align="flex-start" mb="md">
              <ThemeIcon size="xl" radius="md" variant="light" color="teal">
                <IconSettings size={24} />
              </ThemeIcon>
              <Badge size="sm" color={totalBreaking > 0 ? 'red' : 'green'} variant="light">
                {totalBreaking > 0 ? `${totalBreaking} issues` : 'All good'}
              </Badge>
            </Group>
            <Stack spacing="xs">
              <Text size="sm" color="dimmed" weight={500} transform="uppercase" style={{ letterSpacing: '0.5px' }}>
                System Overview
              </Text>
              <Text size="xl" weight={700} color="dark">
                {services.length} Services
              </Text>
              <Text size="xs" color="dimmed">
                {servicesStatus.active} active •{' '}
                {avgErrorRate > 0 ? `${(avgErrorRate * 100).toFixed(1)}% avg error rate` : 'No errors'}
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>

        {/* Usage Analytics */}
        <Grid gutter="xl">
          <Grid.Col span={8}>
            <Card shadow="xs" p="xl" radius="lg" withBorder style={{ height: '300px' }}>
              <Group position="apart" align="center" mb="xl">
                <Group spacing="sm">
                  <ThemeIcon size="md" radius="md" variant="light" color="blue">
                    <IconChartLine size={18} />
                  </ThemeIcon>
                  <div>
                    <Text weight={600} size="lg">
                      API Requests
                    </Text>
                    <Text size="sm" color="dimmed">
                      Last 14 days
                    </Text>
                  </div>
                </Group>
                {totals && (
                  <Group spacing="lg">
                    <div style={{ textAlign: 'center' }}>
                      <Text size="xs" color="dimmed" transform="uppercase">
                        Total
                      </Text>
                      <Text weight={600}>{totals.totalRequests.toLocaleString()}</Text>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Text size="xs" color="dimmed" transform="uppercase">
                        Errors
                      </Text>
                      <Text weight={600} color="red">
                        {totals.totalErrors.toLocaleString()}
                      </Text>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Text size="xs" color="dimmed" transform="uppercase">
                        Rate Limited
                      </Text>
                      <Text weight={600} color="orange">
                        {totals.totalRateLimited.toLocaleString()}
                      </Text>
                    </div>
                  </Group>
                )}
              </Group>
              <Box style={{ height: '180px' }}>
                {daily.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={daily.map((d) => ({
                        ...d,
                        formattedDate: new Date(d.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })
                      }))}
                      margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#339af0" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#339af0" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
                      <XAxis
                        dataKey="formattedDate"
                        tick={{ fontSize: 12, fill: '#6c757d' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#6c757d' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => value.toLocaleString()}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e9ecef',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                        formatter={(value: number) => [value.toLocaleString(), 'Requests']}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="requestCount"
                        stroke="#1c7ed6"
                        strokeWidth={3}
                        fill="url(#colorRequests)"
                        strokeLinecap="round"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <Center style={{ width: '100%', height: '100%' }}>
                    <Stack align="center" spacing="xs">
                      <IconEye size={32} color="#ced4da" />
                      <Text size="sm" color="dimmed">
                        No usage data available
                      </Text>
                    </Stack>
                  </Center>
                )}
              </Box>
            </Card>
          </Grid.Col>
          <Grid.Col span={4}>
            <Card shadow="xs" p="xl" radius="lg" withBorder style={{ height: '300px' }}>
              <Group position="apart" align="center" mb="xl">
                <Group spacing="sm">
                  <ThemeIcon size="md" radius="md" variant="light" color="violet">
                    <IconKey size={18} />
                  </ThemeIcon>
                  <div>
                    <Text weight={600} size="lg">
                      Top API Keys
                    </Text>
                    <Text size="sm" color="dimmed">
                      Last 7 days
                    </Text>
                  </div>
                </Group>
              </Group>
              <ScrollArea style={{ height: '180px' }}>
                <Stack spacing="md">
                  {topKeys.length ? (
                    topKeys.map((k, index) => (
                      <Paper key={k.apiKeyId} p="md" radius="md" withBorder>
                        <Group position="apart" align="center">
                          <Group spacing="sm">
                            <Badge size="sm" color="violet" variant="light">
                              #{index + 1}
                            </Badge>
                            <Tooltip label={k.apiKeyId} withinPortal>
                              <Text size="sm" weight={500} style={{ fontFamily: 'monospace' }}>
                                {k.apiKeyId.slice(0, 8)}...
                              </Text>
                            </Tooltip>
                          </Group>
                          <Stack spacing={0} align="flex-end">
                            <Text size="sm" weight={600}>
                              {k.requestCount.toLocaleString()}
                            </Text>
                            <Text size="xs" color="dimmed">
                              requests
                            </Text>
                          </Stack>
                        </Group>
                      </Paper>
                    ))
                  ) : (
                    <Center style={{ height: '100%' }}>
                      <Stack align="center" spacing="xs">
                        <IconKey size={32} color="#ced4da" />
                        <Text size="sm" color="dimmed">
                          No API key data
                        </Text>
                      </Stack>
                    </Center>
                  )}
                </Stack>
              </ScrollArea>
            </Card>
          </Grid.Col>
        </Grid>

        {/* Service Health & Activity */}
        <Grid gutter="xl">
          <Grid.Col span={8}>
            <Card shadow="xs" p="xl" radius="lg" withBorder>
              <Group position="apart" align="center" mb="xl">
                <Group spacing="sm">
                  <ThemeIcon size="md" radius="md" variant="light" color="green">
                    <IconTrendingUp size={18} />
                  </ThemeIcon>
                  <div>
                    <Text weight={600} size="lg">
                      Top Services
                    </Text>
                    <Text size="sm" color="dimmed">
                      Last 24 hours
                    </Text>
                  </div>
                </Group>
                {loadingExtras && <Loader size="sm" />}
              </Group>
              <ScrollArea style={{ height: '200px' }}>
                <Table verticalSpacing="md" fontSize="sm" highlightOnHover>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th style={{ textAlign: 'right' }}>Requests</th>
                      <th style={{ textAlign: 'right' }}>Error Rate</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(usageSummary?.topServices || []).map((s) => {
                      const sh = serviceHealth.find((h) => h.id === s.serviceId);
                      return (
                        <tr key={s.serviceId}>
                          <td>
                            <Text weight={500}>{s.serviceName}</Text>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Text weight={600}>{s.requestCount24h.toLocaleString()}</Text>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Badge
                              size="sm"
                              color={s.errorRate24h < 0.01 ? 'green' : s.errorRate24h < 0.05 ? 'yellow' : 'red'}
                              variant="light"
                            >
                              {(s.errorRate24h * 100).toFixed(1)}%
                            </Badge>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Badge
                              size="sm"
                              color={sh?.status === 'active' ? 'green' : sh?.status === 'maintenance' ? 'yellow' : 'red'}
                              variant="filled"
                            >
                              {sh?.status || 'unknown'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                {(!usageSummary?.topServices || usageSummary.topServices.length === 0) && (
                  <Center style={{ height: '100px' }}>
                    <Text size="sm" color="dimmed">
                      No service data available
                    </Text>
                  </Center>
                )}
              </ScrollArea>
            </Card>
          </Grid.Col>
          <Grid.Col span={4}>{/* This space could be used for future widgets or left empty for cleaner layout */}</Grid.Col>
        </Grid>

        <TokenRefreshNotification />
        <AutoRefreshWelcome />
      </Stack>
    </Box>
  );
};
