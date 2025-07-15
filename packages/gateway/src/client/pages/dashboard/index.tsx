import React from 'react';
import {
  Grid,
  Card,
  Text,
  Title,
  Group,
  Badge,
  Stack,
  LoadingOverlay,
  Alert,
  SimpleGrid,
  Paper,
  ActionIcon,
  Tooltip,
  Button,
} from '@mantine/core';
import { 
  IconUsers, 
  IconServer, 
  IconKey, 
  IconActivity, 
  IconShield,
  IconClock,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconRefresh,
} from '@tabler/icons-react';

interface DashboardStats {
  users: {
    total: number;
    verified: number;
    locked: number;
    admins: number;
  };
  services: {
    total: number;
    active: number;
    inactive: number;
    maintenance: number;
  };
  sessions: {
    total: number;
    active: number;
    recentLogins: number;
  };
  recentUsers: Array<{
    id: string;
    email: string;
    createdAt: string;
    isEmailVerified: boolean;
  }>;
  recentSessions: Array<{
    id: string;
    userId: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
    isActive: boolean;
  }>;
}

const StatsCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => (
  <Card shadow="sm" p="lg" radius="md" withBorder>
    <Group position="apart">
      <div>
        <Text size="sm" color="dimmed" weight={500}>
          {title}
        </Text>
        <Text size="xl" weight={700}>
          {value.toLocaleString()}
        </Text>
        {subtitle && (
          <Text size="xs" color="dimmed">
            {subtitle}
          </Text>
        )}
      </div>
      <div style={{ color, fontSize: '2rem' }}>{icon}</div>
    </Group>
  </Card>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'green';
      case 'inactive': return 'red';
      case 'maintenance': return 'yellow';
      default: return 'gray';
    }
  };

  return (
    <Badge color={getStatusColor(status)} variant="light">
      {status}
    </Badge>
  );
};

export const Dashboard: React.FC = () => {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('accessToken');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
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
            query GetDashboardData {
              users {
                id
                email
                permissions
                isEmailVerified
                createdAt
                failedLoginAttempts
                lockedUntil
                sessions {
                  id
                  userId
                  ipAddress
                  userAgent
                  createdAt
                  isActive
                }
              }
              myServices {
                id
                name
                status
                url
                createdAt
              }
              me {
                id
                email
                permissions
              }
            }
          `,
        }),
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const { users, myServices, me } = result.data;
      
      // Calculate user statistics
      const userStats = {
        total: users?.length || 0,
        verified: users?.filter((u: any) => u.isEmailVerified).length || 0,
        locked: users?.filter((u: any) => u.lockedUntil && new Date(u.lockedUntil) > new Date()).length || 0,
        admins: users?.filter((u: any) => u.permissions?.includes('admin')).length || 0,
      };

      // Calculate service statistics
      const serviceStats = {
        total: myServices?.length || 0,
        active: myServices?.filter((s: any) => s.status === 'active').length || 0,
        inactive: myServices?.filter((s: any) => s.status === 'inactive').length || 0,
        maintenance: myServices?.filter((s: any) => s.status === 'maintenance').length || 0,
      };

      // Calculate session statistics from all users
      const allSessions = users?.flatMap((u: any) => u.sessions || []) || [];
      const sessionStats = {
        total: allSessions.length,
        active: allSessions.filter((s: any) => s.isActive).length,
        recentLogins: allSessions.filter((s: any) => {
          const sessionDate = new Date(s.createdAt);
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          return sessionDate > dayAgo;
        }).length,
      };

      // Recent users (last 10)
      const recentUsers = users
        ?.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10) || [];

      // Recent sessions (last 10)
      const recentSessions = allSessions
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      setStats({
        users: userStats,
        services: serviceStats,
        sessions: sessionStats,
        recentUsers,
        recentSessions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch dashboard data');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading && !stats) {
    return (
      <Paper p="md" style={{ position: 'relative', minHeight: 400 }}>
        <LoadingOverlay visible={loading} overlayBlur={2} />
        <Text>Loading dashboard...</Text>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
        {error}
        <Group mt="md">
          <Button size="xs" variant="light" onClick={fetchDashboardData}>
            Retry
          </Button>
        </Group>
      </Alert>
    );
  }

  if (!stats) {
    return (
      <Text color="dimmed" align="center">
        No data available
      </Text>
    );
  }

  return (
    <Stack spacing="xl">
      <Group position="apart">
        <Title order={2}>Dashboard</Title>
        <Tooltip label="Refresh data">
          <ActionIcon 
            size="lg" 
            variant="light" 
            onClick={fetchDashboardData}
            loading={loading}
          >
            <IconRefresh size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Stats Cards */}
      <SimpleGrid cols={4} spacing="md" breakpoints={[
        { maxWidth: 'md', cols: 2, spacing: 'sm' },
        { maxWidth: 'sm', cols: 1, spacing: 'sm' },
      ]}>
        <StatsCard
          title="Total Users"
          value={stats.users.total}
          icon={<IconUsers />}
          color="#1c7ed6"
          subtitle={`${stats.users.admins} admins, ${stats.users.verified} verified`}
        />
        <StatsCard
          title="Services"
          value={stats.services.total}
          icon={<IconServer />}
          color="#37b24d"
          subtitle={`${stats.services.active} active, ${stats.services.inactive} inactive`}
        />
        <StatsCard
          title="Active Sessions"
          value={stats.sessions.active}
          icon={<IconActivity />}
          color="#f59f00"
          subtitle={`${stats.sessions.recentLogins} recent logins`}
        />
        <StatsCard
          title="Security"
          value={stats.users.locked}
          icon={<IconShield />}
          color={stats.users.locked > 0 ? "#e03131" : "#37b24d"}
          subtitle={stats.users.locked > 0 ? "accounts locked" : "all accounts secure"}
        />
      </SimpleGrid>

      {/* Detailed Stats */}
      <Grid>
        <Grid.Col span={6}>
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Group position="apart" mb="md">
              <Text weight={500}>User Statistics</Text>
              <IconUsers size={18} color="#1c7ed6" />
            </Group>
            <Stack spacing="xs">
              <Group position="apart">
                <Text size="sm">Total Users</Text>
                <Text size="sm" weight={500}>{stats.users.total}</Text>
              </Group>
              <Group position="apart">
                <Text size="sm">Verified</Text>
                <Group spacing={4}>
                  <IconCheck size={14} color="#37b24d" />
                  <Text size="sm">{stats.users.verified}</Text>
                </Group>
              </Group>
              <Group position="apart">
                <Text size="sm">Administrators</Text>
                <Group spacing={4}>
                  <IconShield size={14} color="#1c7ed6" />
                  <Text size="sm">{stats.users.admins}</Text>
                </Group>
              </Group>
              <Group position="apart">
                <Text size="sm">Locked Accounts</Text>
                <Group spacing={4}>
                  {stats.users.locked > 0 ? (
                    <IconX size={14} color="#e03131" />
                  ) : (
                    <IconCheck size={14} color="#37b24d" />
                  )}
                  <Text size="sm">{stats.users.locked}</Text>
                </Group>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={6}>
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Group position="apart" mb="md">
              <Text weight={500}>Service Statistics</Text>
              <IconServer size={18} color="#37b24d" />
            </Group>
            <Stack spacing="xs">
              <Group position="apart">
                <Text size="sm">Total Services</Text>
                <Text size="sm" weight={500}>{stats.services.total}</Text>
              </Group>
              <Group position="apart">
                <Text size="sm">Active</Text>
                <StatusBadge status="active" />
                <Text size="sm">{stats.services.active}</Text>
              </Group>
              <Group position="apart">
                <Text size="sm">Inactive</Text>
                <StatusBadge status="inactive" />
                <Text size="sm">{stats.services.inactive}</Text>
              </Group>
              <Group position="apart">
                <Text size="sm">Maintenance</Text>
                <StatusBadge status="maintenance" />
                <Text size="sm">{stats.services.maintenance}</Text>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Recent Activity */}
      <Grid>
        <Grid.Col span={6}>
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Group position="apart" mb="md">
              <Text weight={500}>Recent Users</Text>
              <IconClock size={18} color="#6c757d" />
            </Group>
            <Stack spacing="xs">
              {stats.recentUsers.map((user: any) => (
                <Group key={user.id} position="apart">
                  <div>
                    <Text size="sm" weight={500}>{user.email}</Text>
                    <Text size="xs" color="dimmed">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </Text>
                  </div>
                  <Group spacing={4}>
                    {user.isEmailVerified ? (
                      <IconCheck size={14} color="#37b24d" />
                    ) : (
                      <IconX size={14} color="#e03131" />
                    )}
                  </Group>
                </Group>
              ))}
              {stats.recentUsers.length === 0 && (
                <Text size="sm" color="dimmed" align="center">
                  No recent users
                </Text>
              )}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={6}>
          <Card shadow="sm" p="lg" radius="md" withBorder>
            <Group position="apart" mb="md">
              <Text weight={500}>Recent Sessions</Text>
              <IconActivity size={18} color="#f59f00" />
            </Group>
            <Stack spacing="xs">
              {stats.recentSessions.map((session: any) => (
                <Group key={session.id} position="apart">
                  <div>
                    <Text size="sm" weight={500}>{session.ipAddress}</Text>
                    <Text size="xs" color="dimmed">
                      {new Date(session.createdAt).toLocaleDateString()}
                    </Text>
                  </div>
                  <Group spacing={4}>
                    {session.isActive ? (
                      <Badge color="green" variant="light">Active</Badge>
                    ) : (
                      <Badge color="gray" variant="light">Inactive</Badge>
                    )}
                  </Group>
                </Group>
              ))}
              {stats.recentSessions.length === 0 && (
                <Text size="sm" color="dimmed" align="center">
                  No recent sessions
                </Text>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
};
