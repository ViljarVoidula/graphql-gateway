import { Alert, Badge, Card, Center, Grid, Group, Loader, Progress, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useList } from '@refinedev/core';
import { IconActivity, IconKey, IconSettings, IconUsers } from '@tabler/icons-react';
import gql from 'graphql-tag';
import React from 'react';
import { AutoRefreshWelcome } from '../components/AutoRefreshWelcome';
import { TokenRefreshNotification } from '../components/TokenRefreshNotification';

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

  const servicesStatus = services.reduce(
    (acc: any, service: any) => {
      acc[service.status] = (acc[service.status] || 0) + 1;
      return acc;
    },
    { active: 0, inactive: 0, maintenance: 0 }
  );

  const healthScore = services.length > 0 ? Math.round((servicesStatus.active / services.length) * 100) : 100;

  return (
    <Stack spacing="lg">
      <Group position="apart" align="center">
        <Title order={1}>Gateway Dashboard</Title>
      </Group>

      <SimpleGrid cols={4} spacing="lg">
        <StatsCard title="Total Users" value={users.length} icon={<IconUsers size={32} />} color="#228be6" />
        <StatsCard title="Total Services" value={services.length} icon={<IconSettings size={32} />} color="#40c057" />
        <StatsCard title="Active Sessions" value={activeSessions} icon={<IconKey size={32} />} color="#fab005" />
        <StatsCard
          title="Health Score"
          value={healthScore}
          icon={<IconActivity size={32} />}
          color={healthScore > 80 ? '#40c057' : healthScore > 60 ? '#fab005' : '#fa5252'}
        />
      </SimpleGrid>

      <Grid>
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
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <TokenRefreshNotification />
      <AutoRefreshWelcome />
    </Stack>
  );
};
