import {
  ActionIcon,
  Alert,
  Anchor,
  Avatar,
  Badge,
  Button,
  Card,
  CopyButton,
  Divider,
  Grid,
  Group,
  LoadingOverlay,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useDelete, useOne } from '@refinedev/core';
import {
  IconAlertCircle,
  IconApps,
  IconArrowLeft,
  IconCalendar,
  IconCopy,
  IconDeviceDesktop,
  IconEdit,
  IconExternalLink,
  IconLock,
  IconMail,
  IconRefresh,
  IconShield,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { authenticatedFetch } from '../../utils/auth';

interface UserSession {
  id: string;
  isActive?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string | null;
  lastActivity?: string | null;
  expiresAt?: string | null;
}

interface UserApplication {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  rateLimitPerMinute?: number | null;
  rateLimitPerDay?: number | null;
  rateLimitDisabled?: boolean | null;
}

interface UserServiceResource {
  id: string;
  name: string;
  status?: string | null;
  url?: string | null;
  updatedAt?: string | null;
}

interface ExtendedUser {
  id: string;
  email: string;
  permissions?: string[];
  isEmailVerified?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  sessions?: UserSession[];
  applications?: UserApplication[];
  ownedServices?: UserServiceResource[];
}

const AUDIT_CATEGORY_OPTIONS = [
  { value: 'authentication', label: 'Authentication' },
  { value: 'authorization', label: 'Authorization' },
  { value: 'configuration', label: 'Configuration' },
  { value: 'security', label: 'Security' },
  { value: 'data_access', label: 'Data Access' },
  { value: 'system', label: 'System' },
];

const AUDIT_SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const formatDateTime = (
  value?: string | null,
  opts?: Intl.DateTimeFormatOptions
) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, opts);
  } catch (error) {
    return value;
  }
};

const formatDate = (value?: string | null) =>
  formatDateTime(value, { dateStyle: 'medium' });

const truncate = (value?: string | null, length = 48) => {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
};

export const UserDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);

  const {
    data: userData,
    isLoading,
    error,
    refetch,
  } = useOne({
    resource: 'users',
    id: id!,
  });

  const { mutate: deleteUser, isLoading: isDeleting } = useDelete();

  const user = userData?.data as ExtendedUser | undefined;

  const sessions = React.useMemo(() => {
    if (!user?.sessions) {
      return [] as UserSession[];
    }
    return [...user.sessions].sort((a, b) => {
      const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return bTime - aTime;
    });
  }, [user?.sessions]);

  const activeSessions = sessions.filter(
    (session) => session.isActive !== false
  );
  const applications = user?.applications ?? [];
  const ownedServices = user?.ownedServices ?? [];
  const userInitial = user?.email?.[0]?.toUpperCase?.() || '?';

  // Audit logs state for user
  const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [auditCategory, setAuditCategory] = React.useState<string | null>(null);
  const [auditSeverity, setAuditSeverity] = React.useState<string | null>(null);

  const loadAuditLogs = React.useCallback(async () => {
    if (!id) return;
    setAuditLoading(true);
    try {
      const query = `query UserAudit($userId: ID!, $limit: Int, $category: AuditCategory, $severity: AuditSeverity){
        userAuditLogs(userId: $userId, limit: $limit, category: $category, severity: $severity){
          id eventType category severity action success correlationId createdAt metadata
        }
      }`;
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query,
          variables: {
            userId: id,
            limit: 25,
            category: auditCategory,
            severity: auditSeverity,
          },
        }),
      });
      const json = await res.json();
      if (!json.errors) {
        setAuditLogs(json.data.userAuditLogs || []);
      }
    } catch (e) {
      // silent error log
      // eslint-disable-next-line no-console
      console.error('Failed to load user audit logs', e);
    } finally {
      setAuditLoading(false);
    }
  }, [id, auditCategory, auditSeverity]);

  React.useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleDeleteUser = () => {
    deleteUser(
      {
        resource: 'users',
        id: id!,
      },
      {
        onSuccess: () => {
          navigate('/users');
        },
        onError: (error) => {
          showNotification({
            title: 'Error',
            message: error.message || 'Failed to delete user',
            color: 'red',
            icon: <IconAlertCircle />,
          });
        },
      }
    );
  };

  const handleRefresh = React.useCallback(() => {
    refetch();
    loadAuditLogs();
  }, [loadAuditLogs, refetch]);

  if (isLoading) {
    return (
      <Card withBorder p="xl" radius="md" style={{ position: 'relative' }}>
        <LoadingOverlay visible />
        <Stack spacing="sm">
          <Title order={3}>Loading user</Title>
          <Text color="dimmed" size="sm">
            Fetching the latest profile details…
          </Text>
        </Stack>
      </Card>
    );
  }

  if (error || !user) {
    return (
      <Stack spacing="lg">
        <Group spacing="sm">
          <Button
            variant="subtle"
            leftIcon={<IconArrowLeft size={16} />}
            onClick={() => navigate('/users')}
          >
            Back to Users
          </Button>
          <Title order={2}>User Details</Title>
        </Group>
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Unable to load user"
          color="red"
        >
          {error?.message || 'User not found'}
        </Alert>
      </Stack>
    );
  }

  const isAccountLocked =
    user.lockedUntil && new Date(user.lockedUntil) > new Date();

  return (
    <Stack spacing="lg">
      <Group position="apart" align="flex-start">
        <Group spacing="sm" align="center">
          <Button
            variant="subtle"
            leftIcon={<IconArrowLeft size={16} />}
            onClick={() => navigate('/users')}
          >
            Back to Users
          </Button>
          <div>
            <Title order={2}>User Details</Title>
            <Text size="sm" color="dimmed">
              Manage profile, security, and resource access for this account.
            </Text>
          </div>
        </Group>
        <Group spacing="xs">
          <Tooltip label="Refresh data">
            <ActionIcon variant="light" color="gray" onClick={handleRefresh}>
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit user">
            <ActionIcon
              color="blue"
              variant="light"
              onClick={() => navigate(`/users/${id}/edit`)}
            >
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete user">
            <ActionIcon
              color="red"
              variant="light"
              onClick={() => setDeleteModalOpen(true)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Card withBorder radius="md" p="xl">
        <Stack spacing="md">
          <Group align="flex-start" position="apart">
            <Group spacing="md" align="center">
              <Avatar radius="xl" size={56} color="blue" variant="light">
                {userInitial}
              </Avatar>
              <Stack spacing={4}>
                <Group spacing={6} align="center">
                  <Title order={3}>{user.email}</Title>
                  <Badge
                    color={user.isEmailVerified ? 'green' : 'orange'}
                    variant="light"
                  >
                    {user.isEmailVerified ? 'Email Verified' : 'Email Pending'}
                  </Badge>
                  {isAccountLocked && (
                    <Badge color="red" variant="light">
                      Locked
                    </Badge>
                  )}
                </Group>
                <Group spacing="xs" align="center">
                  <Text
                    size="sm"
                    color="dimmed"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {user.id}
                  </Text>
                  <CopyButton value={user.id} timeout={2000}>
                    {({ copied, copy }) => (
                      <Tooltip
                        label={copied ? 'Copied!' : 'Copy user ID'}
                        withArrow
                      >
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={copied ? 'teal' : 'gray'}
                          onClick={copy}
                        >
                          <IconCopy size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </CopyButton>
                </Group>
              </Stack>
            </Group>
            <Stack spacing={4} align="flex-end">
              <Text size="sm" color="dimmed">
                Created {formatDate(user.createdAt)}
              </Text>
              <Text size="sm" color="dimmed">
                Last updated {formatDate(user.updatedAt)}
              </Text>
              <Text size="sm" color="dimmed">
                Last login{' '}
                {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}
              </Text>
            </Stack>
          </Group>

          <SimpleGrid
            cols={4}
            spacing="md"
            breakpoints={[
              { maxWidth: 'lg', cols: 3 },
              { maxWidth: 'md', cols: 2 },
              { maxWidth: 'sm', cols: 1 },
            ]}
          >
            <Card withBorder radius="md" p="md" shadow="xs">
              <Stack spacing={6}>
                <Group spacing="xs">
                  <ThemeIcon size="sm" color="blue" variant="light">
                    <IconMail size={14} />
                  </ThemeIcon>
                  <Text size="sm" color="dimmed">
                    Primary Email
                  </Text>
                </Group>
                <Text size="sm">{user.email}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md" shadow="xs">
              <Stack spacing={6}>
                <Group spacing="xs">
                  <ThemeIcon size="sm" color="indigo" variant="light">
                    <IconShield size={14} />
                  </ThemeIcon>
                  <Text size="sm" color="dimmed">
                    Permissions
                  </Text>
                </Group>
                <Group spacing={6}>
                  {(user.permissions ?? ['user']).map((permission) => (
                    <Badge key={permission} variant="light" color="indigo">
                      {permission.toUpperCase()}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md" shadow="xs">
              <Stack spacing={6}>
                <Group spacing="xs">
                  <ThemeIcon size="sm" color="teal" variant="light">
                    <IconDeviceDesktop size={14} />
                  </ThemeIcon>
                  <Text size="sm" color="dimmed">
                    Active Sessions
                  </Text>
                </Group>
                <Text size="sm">
                  {activeSessions.length} active / {sessions.length} total
                </Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md" shadow="xs">
              <Stack spacing={6}>
                <Group spacing="xs">
                  <ThemeIcon size="sm" color="violet" variant="light">
                    <IconCalendar size={14} />
                  </ThemeIcon>
                  <Text size="sm" color="dimmed">
                    Account Age
                  </Text>
                </Group>
                <Text size="sm">{formatDate(user.createdAt)}</Text>
              </Stack>
            </Card>
          </SimpleGrid>
        </Stack>
      </Card>

      <Grid align="flex-start" gutter="xl">
        <Grid.Col md={8}>
          <Stack spacing="lg">
            <Card withBorder radius="md" p="xl">
              <Stack spacing="sm">
                <Group spacing="xs">
                  <ThemeIcon color="blue" variant="light" radius="md">
                    <IconUser size={18} />
                  </ThemeIcon>
                  <Text weight={600}>Account Overview</Text>
                </Group>
                <Divider />
                <SimpleGrid
                  cols={2}
                  spacing="lg"
                  breakpoints={[{ maxWidth: 'md', cols: 1 }]}
                >
                  <Stack spacing={4}>
                    <Text size="sm" color="dimmed">
                      Email Address
                    </Text>
                    <Group spacing="xs" align="center">
                      <Text size="sm">{user.email}</Text>
                      <CopyButton value={user.email} timeout={2000}>
                        {({ copied, copy }) => (
                          <Tooltip
                            label={copied ? 'Copied!' : 'Copy email'}
                            withArrow
                          >
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              color={copied ? 'teal' : 'gray'}
                              onClick={copy}
                            >
                              <IconCopy size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                  </Stack>
                  <Stack spacing={4}>
                    <Text size="sm" color="dimmed">
                      Account Status
                    </Text>
                    <Group spacing="xs">
                      <Badge
                        color={user.isEmailVerified ? 'green' : 'orange'}
                        variant="light"
                      >
                        {user.isEmailVerified
                          ? 'Verified'
                          : 'Email verification pending'}
                      </Badge>
                      {isAccountLocked && (
                        <Badge color="red" variant="light">
                          Locked until {formatDateTime(user.lockedUntil)}
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                  <Stack spacing={4}>
                    <Text size="sm" color="dimmed">
                      Failed Login Attempts
                    </Text>
                    <Badge
                      color={
                        user.failedLoginAttempts && user.failedLoginAttempts > 0
                          ? 'red'
                          : 'gray'
                      }
                      variant="light"
                    >
                      {user.failedLoginAttempts ?? 0}
                    </Badge>
                  </Stack>
                  <Stack spacing={4}>
                    <Text size="sm" color="dimmed">
                      Last Login
                    </Text>
                    <Text size="sm">
                      {user.lastLoginAt
                        ? formatDateTime(user.lastLoginAt)
                        : 'No login recorded'}
                    </Text>
                  </Stack>
                </SimpleGrid>
              </Stack>
            </Card>

            <Card withBorder radius="md" p="xl">
              <Stack spacing="sm">
                <Group spacing="xs" position="apart" align="center">
                  <Group spacing="xs">
                    <ThemeIcon color="violet" variant="light" radius="md">
                      <IconApps size={18} />
                    </ThemeIcon>
                    <Text weight={600}>Applications owned by this user</Text>
                  </Group>
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => navigate('/applications')}
                  >
                    View all applications
                  </Button>
                </Group>
                <Divider />
                {applications.length === 0 ? (
                  <Text size="sm" color="dimmed">
                    This user has no registered applications yet.
                  </Text>
                ) : (
                  <Stack spacing="sm">
                    {applications.map((app) => (
                      <Card
                        key={app.id}
                        withBorder
                        p="md"
                        radius="md"
                        shadow="xs"
                      >
                        <Group position="apart" align="flex-start">
                          <Stack spacing={6} style={{ flex: 1 }}>
                            <Group spacing={6}>
                              <Text weight={600}>{app.name}</Text>
                              {app.rateLimitDisabled ? (
                                <Badge color="orange" variant="light">
                                  Rate limit disabled
                                </Badge>
                              ) : null}
                            </Group>
                            <Text size="sm" color="dimmed">
                              {app.description || 'No description provided'}
                            </Text>
                            <Group spacing={6}>
                              {app.rateLimitPerMinute != null && (
                                <Badge variant="light" color="blue">
                                  {app.rateLimitPerMinute}/min
                                </Badge>
                              )}
                              {app.rateLimitPerDay != null && (
                                <Badge variant="light" color="teal">
                                  {app.rateLimitPerDay}/day
                                </Badge>
                              )}
                            </Group>
                            <Text size="xs" color="dimmed">
                              Created {formatDate(app.createdAt)} • Updated{' '}
                              {formatDate(app.updatedAt)}
                            </Text>
                          </Stack>
                          <Button
                            size="xs"
                            variant="light"
                            leftIcon={<IconExternalLink size={16} />}
                            onClick={() => navigate(`/applications/${app.id}`)}
                          >
                            Open
                          </Button>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>

            <Card withBorder radius="md" p="xl">
              <Stack spacing="sm">
                <Group spacing="xs" position="apart">
                  <Group spacing="xs">
                    <ThemeIcon color="teal" variant="light" radius="md">
                      <IconDeviceDesktop size={18} />
                    </ThemeIcon>
                    <Text weight={600}>Active Sessions</Text>
                  </Group>
                  <Anchor size="sm" onClick={() => navigate('/sessions')}>
                    Manage sessions
                  </Anchor>
                </Group>
                <Divider />
                {sessions.length === 0 ? (
                  <Text size="sm" color="dimmed">
                    There are no recorded sessions for this user yet.
                  </Text>
                ) : (
                  <ScrollArea style={{ maxHeight: 260 }}>
                    <Table
                      striped
                      highlightOnHover
                      fontSize="sm"
                      verticalSpacing={6}
                      horizontalSpacing="md"
                    >
                      <thead>
                        <tr>
                          <th style={{ width: '25%' }}>Device</th>
                          <th>IP Address</th>
                          <th>Last Activity</th>
                          <th>Started</th>
                          <th>Expires</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessions.map((session) => (
                          <tr key={session.id}>
                            <td>{truncate(session.userAgent, 36)}</td>
                            <td>{session.ipAddress || '—'}</td>
                            <td>{formatDateTime(session.lastActivity)}</td>
                            <td>{formatDateTime(session.createdAt)}</td>
                            <td>
                              {session.expiresAt
                                ? formatDateTime(session.expiresAt)
                                : '—'}
                            </td>
                            <td>
                              <Badge
                                color={
                                  session.isActive === false ? 'gray' : 'green'
                                }
                                variant="light"
                              >
                                {session.isActive === false
                                  ? 'Ended'
                                  : 'Active'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </ScrollArea>
                )}
              </Stack>
            </Card>

            <Card withBorder radius="md" p="xl">
              <Stack spacing="sm">
                <Group spacing="xs" position="apart" align="flex-end">
                  <Group spacing="xs">
                    <ThemeIcon color="gray" variant="light" radius="md">
                      <IconShield size={18} />
                    </ThemeIcon>
                    <Text weight={600}>Audit Activity</Text>
                  </Group>
                  <Group spacing="xs">
                    <Select
                      size="xs"
                      data={AUDIT_CATEGORY_OPTIONS}
                      placeholder="Category"
                      value={auditCategory ?? null}
                      onChange={(value) => setAuditCategory(value || null)}
                      clearable
                      w={140}
                    />
                    <Select
                      size="xs"
                      data={AUDIT_SEVERITY_OPTIONS}
                      placeholder="Severity"
                      value={auditSeverity ?? null}
                      onChange={(value) => setAuditSeverity(value || null)}
                      clearable
                      w={120}
                    />
                    <Button
                      size="xs"
                      leftIcon={<IconRefresh size={14} />}
                      onClick={loadAuditLogs}
                      loading={auditLoading}
                    >
                      Refresh
                    </Button>
                  </Group>
                </Group>
                <Divider />
                {auditLoading ? (
                  <Text size="sm" color="dimmed">
                    Loading audit events…
                  </Text>
                ) : auditLogs.length === 0 ? (
                  <Text size="sm" color="dimmed">
                    No audit activity found for the selected filters.
                  </Text>
                ) : (
                  <ScrollArea style={{ maxHeight: 280 }}>
                    <Table
                      fontSize="sm"
                      verticalSpacing={6}
                      horizontalSpacing="md"
                    >
                      <thead>
                        <tr>
                          <th>Event</th>
                          <th>Category</th>
                          <th>Severity</th>
                          <th>Action</th>
                          <th>Success</th>
                          <th>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id}>
                            <td>{log.eventType}</td>
                            <td>{log.category || '—'}</td>
                            <td>
                              <Badge variant="light" color="blue">
                                {log.severity?.toUpperCase() || '—'}
                              </Badge>
                            </td>
                            <td>{log.action || '—'}</td>
                            <td>
                              <Badge
                                color={log.success ? 'green' : 'red'}
                                variant="light"
                              >
                                {log.success ? 'Yes' : 'No'}
                              </Badge>
                            </td>
                            <td>{formatDateTime(log.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </ScrollArea>
                )}
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>

        <Grid.Col md={4}>
          <Stack spacing="lg">
            <Card withBorder radius="md" p="xl">
              <Stack spacing="sm">
                <Group spacing="xs">
                  <ThemeIcon color="red" variant="light" radius="md">
                    <IconLock size={18} />
                  </ThemeIcon>
                  <Text weight={600}>Security Insights</Text>
                </Group>
                <Divider />
                <Stack spacing={8}>
                  <Group position="apart">
                    <Text size="sm" color="dimmed">
                      Email verified
                    </Text>
                    <Badge
                      color={user.isEmailVerified ? 'green' : 'orange'}
                      variant="light"
                    >
                      {user.isEmailVerified ? 'Yes' : 'No'}
                    </Badge>
                  </Group>
                  <Group position="apart">
                    <Text size="sm" color="dimmed">
                      Failed login attempts
                    </Text>
                    <Badge
                      color={
                        user.failedLoginAttempts && user.failedLoginAttempts > 0
                          ? 'red'
                          : 'gray'
                      }
                      variant="light"
                    >
                      {user.failedLoginAttempts ?? 0}
                    </Badge>
                  </Group>
                  <Group position="apart">
                    <Text size="sm" color="dimmed">
                      Account locked
                    </Text>
                    <Badge
                      color={isAccountLocked ? 'red' : 'green'}
                      variant="light"
                    >
                      {isAccountLocked ? 'Yes' : 'No'}
                    </Badge>
                  </Group>
                  {isAccountLocked && (
                    <Text size="xs" color="dimmed">
                      Unlocks on {formatDateTime(user.lockedUntil)}
                    </Text>
                  )}
                </Stack>
              </Stack>
            </Card>

            <Card withBorder radius="md" p="xl">
              <Stack spacing="sm">
                <Group spacing="xs">
                  <ThemeIcon color="green" variant="light" radius="md">
                    <IconShield size={18} />
                  </ThemeIcon>
                  <Text weight={600}>Owned Services</Text>
                </Group>
                <Divider />
                {ownedServices.length === 0 ? (
                  <Text size="sm" color="dimmed">
                    This user does not own any services.
                  </Text>
                ) : (
                  <Stack spacing={8}>
                    {ownedServices.map((service) => (
                      <Group
                        key={service.id}
                        position="apart"
                        spacing="sm"
                        align="flex-start"
                      >
                        <Stack spacing={2} style={{ flex: 1 }}>
                          <Text size="sm" weight={500}>
                            {service.name}
                          </Text>
                          <Text size="xs" color="dimmed">
                            Updated {formatDate(service.updatedAt)}
                          </Text>
                        </Stack>
                        <Badge
                          variant="light"
                          color={service.status === 'ACTIVE' ? 'green' : 'gray'}
                        >
                          {service.status || 'UNKNOWN'}
                        </Badge>
                      </Group>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>

            <Card withBorder radius="md" p="xl">
              <Stack spacing="sm">
                <Group spacing="xs">
                  <ThemeIcon color="blue" variant="light" radius="md">
                    <IconUser size={18} />
                  </ThemeIcon>
                  <Text weight={600}>Quick Actions</Text>
                </Group>
                <Divider />
                <Button
                  leftIcon={<IconEdit size={16} />}
                  variant="light"
                  onClick={() => navigate(`/users/${id}/edit`)}
                >
                  Edit profile
                </Button>
                <Button
                  leftIcon={<IconDeviceDesktop size={16} />}
                  variant="light"
                  onClick={() => navigate('/sessions')}
                >
                  Review sessions
                </Button>
                <Button
                  leftIcon={<IconApps size={16} />}
                  variant="light"
                  onClick={() => navigate('/applications')}
                >
                  View applications
                </Button>
                <Button
                  color="red"
                  variant="light"
                  leftIcon={<IconTrash size={16} />}
                  onClick={() => setDeleteModalOpen(true)}
                >
                  Delete user
                </Button>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete User"
        centered
      >
        <Stack spacing="md">
          <Alert icon={<IconAlertCircle size={16} />} color="red" radius="md">
            <Text size="sm">
              Are you sure you want to delete this user? This action cannot be
              undone.
            </Text>
          </Alert>
          <Group position="apart" grow>
            <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" loading={isDeleting} onClick={handleDeleteUser}>
              Delete User
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
