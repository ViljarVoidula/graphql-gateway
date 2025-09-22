import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Code,
  Group,
  Loader,
  Menu,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  IconActivity,
  IconAlertCircle,
  IconCalendar,
  IconDots,
  IconDownload,
  IconEye,
  IconFilter,
  IconHistory,
  IconRefresh,
  IconSearch,
  IconUser
} from '@tabler/icons-react';
import React from 'react';
import { authenticatedFetch } from '../../../utils/auth';
import { AuditLogDetailModal } from './AuditLogDetailModal';

interface AuditLogEntry {
  id: string;
  action: string;
  actorType: 'user' | 'application' | 'unknown';
  actor: {
    id: string;
    email: string;
    name?: string;
  };
  target: {
    type: string;
    id: string;
    name?: string;
  };
  metadata?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;
}

interface AuditLogProps {
  serviceId: string;
}

// Match backend GraphQL enum names (uppercase)
const AUDIT_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'AUTHENTICATION', label: 'Authentication' },
  { value: 'AUTHORIZATION', label: 'Authorization' },
  { value: 'CONFIGURATION', label: 'Configuration' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'DATA_ACCESS', label: 'Data Access' },
  { value: 'SYSTEM', label: 'System' }
];

// Match backend GraphQL enum names (uppercase)
const SEVERITY_LEVELS = [
  { value: '', label: 'All Severities' },
  { value: 'INFO', label: 'Info' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' }
];

const TIME_RANGES = [
  { value: '1h', label: 'Last Hour' },
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '', label: 'All Time' }
];

export const ServiceAuditLog: React.FC<AuditLogProps> = ({ serviceId }) => {
  const [rawLogs, setRawLogs] = React.useState<AuditLogEntry[]>([]);
  const [logs, setLogs] = React.useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalEntries, setTotalEntries] = React.useState(0);
  const PAGE_SIZE = 20;

  // Filters
  const [searchTerm, setSearchTerm] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');
  const [severityFilter, setSeverityFilter] = React.useState('');
  const [timeRange, setTimeRange] = React.useState('7d');
  const [actorFilter, setActorFilter] = React.useState('');

  // Detail modal
  const [selectedEntry, setSelectedEntry] = React.useState<AuditLogEntry | null>(null);
  const [detailModalOpened, setDetailModalOpened] = React.useState(false);

  const fetchAuditLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const variables: any = {
        serviceId,
        // fetch enough to paginate client-side comfortably
        limit: 100
      };

      // Only category/severity are supported server-side and must be enum values
      if (categoryFilter) variables.category = categoryFilter;
      if (severityFilter) variables.severity = severityFilter;

      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            query ServiceAuditLogs(
              $serviceId: ID!
              $limit: Int
              $category: AuditCategory
              $severity: AuditSeverity
            ) {
              serviceAuditLogs(
                serviceId: $serviceId
                limit: $limit
                category: $category
                severity: $severity
              ) {
                id
                action
                eventType
                metadata
                createdAt
                ipAddress
                userAgent
                severity
                category
                resourceType
                resourceId
                user {
                  id
                  email
                }
                application {
                  id
                  name
                }
              }
            }
          `,
          variables
        })
      });

      const result = await response.json();
      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to fetch audit logs');
      }

      const data = result.data.serviceAuditLogs as any[];
      // Map backend shape to UI model
      const mapped: AuditLogEntry[] = (data || []).map((l) => {
        const hasUser = !!l.user;
        const hasApp = !!l.application;
        const actorType: AuditLogEntry['actorType'] = hasUser ? 'user' : hasApp ? 'application' : 'unknown';
        return {
          id: l.id,
          action: l.action || l.eventType || 'unknown',
          actorType,
          actor: hasUser
            ? {
                id: l.user?.id || 'unknown',
                email: l.user?.email || 'unknown'
              }
            : hasApp
              ? {
                  id: l.application?.id || 'unknown',
                  email: 'application',
                  name: l.application?.name || undefined
                }
              : {
                  id: 'unknown',
                  email: 'unknown'
                },
          target: {
            type: l.resourceType || (l.application ? 'application' : 'unknown'),
            id: l.resourceId || l.application?.id || 'unknown',
            name: l.application?.name || undefined
          },
          metadata: l.metadata || {},
          timestamp: l.createdAt,
          ipAddress: l.ipAddress,
          userAgent: l.userAgent,
          severity: String(l.severity || '').toLowerCase() as AuditLogEntry['severity'],
          category: String(l.category || '').toLowerCase()
        };
      });

      setRawLogs(mapped);
      setPage(1); // reset to first page on fetch
    } catch (error: any) {
      showNotification({
        title: 'Error',
        message: error.message || 'Failed to fetch audit logs',
        color: 'red',
        icon: <IconAlertCircle />
      });
      setRawLogs([]);
    } finally {
      setLoading(false);
    }
  }, [serviceId, categoryFilter, severityFilter]);

  // Initial load
  React.useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  // Derive filtered + paginated view on the client
  React.useEffect(() => {
    // Apply client-side filters: search, timeRange, actor
    let filtered = [...rawLogs];

    if (actorFilter) {
      const needle = actorFilter.toLowerCase();
      filtered = filtered.filter(
        (e) => e.actor.email.toLowerCase().includes(needle) || (e.actor.name || '').toLowerCase().includes(needle)
      );
    }

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter((e) => {
        const meta = e.metadata ? JSON.stringify(e.metadata).toLowerCase() : '';
        return (
          e.action.toLowerCase().includes(s) ||
          e.category.toLowerCase().includes(s) ||
          e.severity.toLowerCase().includes(s) ||
          e.actor.email.toLowerCase().includes(s) ||
          (e.actor.name || '').toLowerCase().includes(s) ||
          meta.includes(s)
        );
      });
    }

    if (timeRange) {
      const now = Date.now();
      const rangeMs =
        timeRange === '1h'
          ? 60 * 60 * 1000
          : timeRange === '24h'
            ? 24 * 60 * 60 * 1000
            : timeRange === '7d'
              ? 7 * 24 * 60 * 60 * 1000
              : timeRange === '30d'
                ? 30 * 24 * 60 * 60 * 1000
                : 0;
      if (rangeMs > 0) {
        filtered = filtered.filter((e) => now - new Date(e.timestamp).getTime() <= rangeMs);
      }
    }

    setTotalEntries(filtered.length);
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    setTotalPages(pages);
    // ensure page in bounds
    setPage((p) => (p > pages ? pages : p));

    setLogs(filtered);
  }, [rawLogs, searchTerm, timeRange, actorFilter]);

  const handleSearch = () => {
    // Client-side filter only
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setSeverityFilter('');
    setTimeRange('7d');
    setActorFilter('');
    setPage(1);
  };

  const exportLogs = async () => {
    try {
      // Implementation for CSV export
      showNotification({
        title: 'Export Started',
        message: 'Audit logs export is being prepared...',
        color: 'blue'
      });
    } catch (error: any) {
      showNotification({
        title: 'Export Failed',
        message: error.message || 'Failed to export audit logs',
        color: 'red'
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'red';
      case 'high':
        return 'orange';
      case 'medium':
        return 'yellow';
      case 'low':
        return 'blue';
      default:
        return 'gray';
    }
  };

  const formatMetaValue = (value: any) => {
    if (value == null) return 'null';
    if (typeof value === 'string') return value.length > 80 ? value.slice(0, 77) + '...' : value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      const s = JSON.stringify(value);
      return s.length > 80 ? s.slice(0, 77) + '...' : s;
    } catch {
      return String(value);
    }
  };

  const formatActionDescription = (entry: AuditLogEntry) => {
    const { action, target, metadata } = entry;

    // Generate human-readable action descriptions
    switch (action) {
      case 'service.created':
        return `Created service "${target.name || target.id}"`;
      case 'service.updated':
        return `Updated service configuration`;
      case 'service.deleted':
        return `Deleted service "${target.name || target.id}"`;
      case 'schema.updated':
        return `Updated GraphQL schema`;
      case 'key.rotated':
        return `Rotated HMAC authentication key`;
      case 'access.granted':
        return `Granted access to ${metadata?.grantedTo || 'unknown user'}`;
      case 'access.revoked':
        return `Revoked access from ${metadata?.revokedFrom || 'unknown user'}`;
      case 'config.timeout.changed':
        return `Changed timeout from ${metadata?.oldValue}ms to ${metadata?.newValue}ms`;
      case 'config.hmac.enabled':
        return `Enabled HMAC authentication`;
      case 'config.hmac.disabled':
        return `Disabled HMAC authentication`;
      default:
        return action
          .replace(/\./g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .toLowerCase();
    }
  };

  return (
    <>
      <Card shadow="xs" p="xl" radius="lg" withBorder style={{ backgroundColor: 'white' }}>
        <Stack spacing="xl">
          {/* Header */}
          <Group position="apart" align="center">
            <Group spacing="sm">
              <ThemeIcon size="md" radius="md" variant="light" color="indigo">
                <IconHistory size={18} />
              </ThemeIcon>
              <Title order={3} weight={600}>
                Audit Log
              </Title>
              <Badge color="gray" variant="light">
                {totalEntries} entries
              </Badge>
            </Group>

            <Group spacing="xs">
              <Button
                variant="light"
                size="sm"
                leftIcon={<IconRefresh size={14} />}
                onClick={() => fetchAuditLogs()}
                loading={loading}
              >
                Refresh
              </Button>
              <Button variant="light" size="sm" leftIcon={<IconDownload size={14} />} onClick={exportLogs}>
                Export
              </Button>
            </Group>
          </Group>

          {/* Filters */}
          <Paper p="md" radius="md" style={{ backgroundColor: '#f8f9fa' }}>
            <Stack spacing="md">
              <Group align="center" spacing="sm">
                <IconFilter size={16} />
                <Text size="sm" weight={500}>
                  Filters
                </Text>
              </Group>

              <Group align="flex-end" grow>
                <TextInput
                  label="Search"
                  placeholder="Search actions, actors, or details..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.currentTarget.value)}
                  icon={<IconSearch size={14} />}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <TextInput
                  label="Actor"
                  placeholder="User email or application name"
                  value={actorFilter}
                  onChange={(e) => setActorFilter(e.currentTarget.value)}
                  icon={<IconUser size={14} />}
                />

                <Select
                  label="Category"
                  placeholder="All categories"
                  value={categoryFilter}
                  onChange={(val) => setCategoryFilter(val || '')}
                  data={AUDIT_CATEGORIES}
                  clearable
                />

                <Select
                  label="Severity"
                  placeholder="All severities"
                  value={severityFilter}
                  onChange={(val) => setSeverityFilter(val || '')}
                  data={SEVERITY_LEVELS}
                  clearable
                />

                <Select
                  label="Time Range"
                  value={timeRange}
                  onChange={(val) => setTimeRange(val || '')}
                  data={TIME_RANGES}
                  icon={<IconCalendar size={14} />}
                />
              </Group>

              <Group spacing="xs">
                <Button size="xs" onClick={() => fetchAuditLogs()} loading={loading}>
                  Apply Filters
                </Button>
                <Button size="xs" variant="light" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
              </Group>
            </Stack>
          </Paper>

          {/* Audit Log Table */}
          <ScrollArea>
            <Table highlightOnHover verticalSpacing="sm" fontSize="sm">
              <thead>
                <tr>
                  <th style={{ fontWeight: 600, color: '#495057' }}>Timestamp</th>
                  <th style={{ fontWeight: 600, color: '#495057' }}>Action</th>
                  <th style={{ fontWeight: 600, color: '#495057' }}>Actor</th>
                  <th style={{ fontWeight: 600, color: '#495057' }}>Severity</th>
                  <th style={{ fontWeight: 600, color: '#495057' }}>Category</th>
                  <th style={{ fontWeight: 600, color: '#495057' }}>Details</th>
                  <th style={{ fontWeight: 600, color: '#495057' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <Center py="xl">
                        <Group spacing="sm">
                          <Loader size="sm" />
                          <Text color="dimmed">Loading audit logs...</Text>
                        </Group>
                      </Center>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <Center py="xl">
                        <Stack align="center" spacing="md">
                          <IconHistory size={48} color="#ced4da" />
                          <Text size="lg" color="dimmed">
                            No audit logs found
                          </Text>
                          <Text size="sm" color="dimmed">
                            Try adjusting your filters or check back later
                          </Text>
                        </Stack>
                      </Center>
                    </td>
                  </tr>
                ) : (
                  logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <Stack spacing={2}>
                          <Text size="xs" weight={500}>
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </Text>
                          <Text size="xs" color="dimmed">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </Text>
                        </Stack>
                      </td>

                      <td>
                        <Stack spacing={2}>
                          <Text size="sm" weight={500}>
                            {formatActionDescription(entry)}
                          </Text>
                          <Code style={{ fontSize: '10px', color: '#868e96' }}>{entry.action}</Code>
                        </Stack>
                      </td>

                      <td>
                        {entry.actorType === 'user' ? (
                          <Group spacing="xs" align="center">
                            <IconUser size={14} color="#868e96" />
                            <Stack spacing={0}>
                              <Text size="sm" weight={500}>
                                {entry.actor.email || 'Unknown User'}
                              </Text>
                              <Text size="xs" color="dimmed">
                                User
                              </Text>
                            </Stack>
                          </Group>
                        ) : entry.actorType === 'application' ? (
                          <Group spacing="xs" align="center">
                            <IconActivity size={14} color="#868e96" />
                            <Stack spacing={0}>
                              <Text size="sm" weight={500}>
                                {entry.actor.name || 'Unknown Application'}
                              </Text>
                              <Text size="xs" color="dimmed">
                                Application
                              </Text>
                            </Stack>
                          </Group>
                        ) : (
                          <Text size="sm" color="dimmed">
                            Unknown
                          </Text>
                        )}
                      </td>

                      <td>
                        <Badge color={getSeverityColor(entry.severity)} variant="light" size="sm">
                          {entry.severity}
                        </Badge>
                      </td>

                      <td>
                        <Badge variant="outline" size="sm">
                          {entry.category}
                        </Badge>
                      </td>

                      <td>
                        <Stack spacing={2}>
                          {entry.ipAddress && (
                            <Text size="xs" color="dimmed">
                              IP: {entry.ipAddress}
                            </Text>
                          )}
                          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                            <Text size="xs" color="dimmed">
                              {Object.entries(entry.metadata)
                                .slice(0, 2)
                                .map(([key, value]) => `${key}: ${formatMetaValue(value)}`)
                                .join(', ')}
                              {Object.keys(entry.metadata).length > 2 && '...'}
                            </Text>
                          )}
                        </Stack>
                      </td>

                      <td>
                        <Menu shadow="md" width={200}>
                          <Menu.Target>
                            <ActionIcon size="sm" variant="light">
                              <IconDots size={14} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              icon={<IconEye size={14} />}
                              onClick={() => {
                                setSelectedEntry(entry);
                                setDetailModalOpened(true);
                              }}
                            >
                              View Details
                            </Menu.Item>
                            <Menu.Item icon={<IconDownload size={14} />}>Export Entry</Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          {totalPages > 1 && (
            <Group position="center">
              <Pagination
                page={page}
                total={totalPages}
                onChange={(newPage) => {
                  setPage(newPage);
                }}
                size="sm"
              />
            </Group>
          )}
        </Stack>
      </Card>

      <AuditLogDetailModal
        entry={selectedEntry}
        opened={detailModalOpened}
        onClose={() => {
          setDetailModalOpened(false);
          setSelectedEntry(null);
        }}
      />
    </>
  );
};
