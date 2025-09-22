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
  IconCalendar,
  IconDots,
  IconDownload,
  IconEye,
  IconFilter,
  IconHistory,
  IconRefresh,
  IconSearch
} from '@tabler/icons-react';
import React from 'react';
import { authenticatedFetch } from '../../../utils/auth';
import { AuditLogDetailModal } from '../../services/components/AuditLogDetailModal';

interface AuditLogEntry {
  id: string;
  action: string;
  timestamp: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  category: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

interface Props {
  applicationId: string;
}

const AUDIT_CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'AUTHENTICATION', label: 'Authentication' },
  { value: 'AUTHORIZATION', label: 'Authorization' },
  { value: 'CONFIGURATION', label: 'Configuration' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'DATA_ACCESS', label: 'Data Access' },
  { value: 'SYSTEM', label: 'System' }
];

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

export const ApplicationAuditLog: React.FC<Props> = ({ applicationId }) => {
  const [raw, setRaw] = React.useState<AuditLogEntry[]>([]);
  const [rows, setRows] = React.useState<AuditLogEntry[]>([]);
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

  const [selected, setSelected] = React.useState<AuditLogEntry | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const variables: any = {
        applicationId,
        limit: 100
      };
      if (categoryFilter) variables.category = categoryFilter;
      if (severityFilter) variables.severity = severityFilter;

      const response = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          query: `
            query ApplicationAuditLogs(
              $applicationId: ID!
              $limit: Int
              $category: AuditCategory
              $severity: AuditSeverity
            ) {
              applicationAuditLogs(
                applicationId: $applicationId
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
              }
            }
          `,
          variables
        })
      });

      const result = await response.json();
      if (result.errors) throw new Error(result.errors[0]?.message || 'Failed to fetch application audit logs');

      const data = (result.data?.applicationAuditLogs || []) as any[];
      const mapped: AuditLogEntry[] = data.map((l) => ({
        id: l.id,
        action: l.action || l.eventType || 'unknown',
        timestamp: l.createdAt,
        severity: String(l.severity || '').toLowerCase() as AuditLogEntry['severity'],
        category: String(l.category || '').toLowerCase(),
        ipAddress: l.ipAddress,
        userAgent: l.userAgent,
        metadata: l.metadata || {}
      }));

      setRaw(mapped);
      setPage(1);
    } catch (e: any) {
      showNotification({ title: 'Error', message: e.message || 'Failed to fetch logs', color: 'red' });
      setRaw([]);
    } finally {
      setLoading(false);
    }
  }, [applicationId, categoryFilter, severityFilter]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  React.useEffect(() => {
    let filtered = [...raw];

    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      filtered = filtered.filter((e) => {
        const meta = e.metadata ? JSON.stringify(e.metadata).toLowerCase() : '';
        return (
          e.action.toLowerCase().includes(s) ||
          e.category.toLowerCase().includes(s) ||
          e.severity.toLowerCase().includes(s) ||
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
    setPage((p) => (p > pages ? pages : p));

    setRows(filtered);
  }, [raw, searchTerm, timeRange]);

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
    const { action, metadata } = entry;
    switch (action) {
      case 'api_key_created':
        return `Created API key${metadata?.name ? ` \"${metadata.name}\"` : ''}`;
      case 'api_key_revoked':
        return `Revoked an API key`;
      case 'rate_limit_exceeded':
        return `Rate limit exceeded`;
      default:
        return action
          .replace(/\./g, ' ')
          .replace(/([A-Z])/g, ' $1')
          .toLowerCase();
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('');
    setSeverityFilter('');
    setTimeRange('7d');
    setPage(1);
  };

  return (
    <Card shadow="xs" p="xl" radius="lg" withBorder style={{ backgroundColor: 'white' }}>
      <Stack spacing="xl">
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
              onClick={() => fetchLogs()}
              loading={loading}
            >
              Refresh
            </Button>
            <Button variant="light" size="sm" leftIcon={<IconDownload size={14} />} onClick={() => {}}>
              Export
            </Button>
          </Group>
        </Group>

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
                placeholder="Search actions or details..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.currentTarget.value)}
                icon={<IconSearch size={14} />}
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
              <Button size="xs" onClick={() => fetchLogs()} loading={loading}>
                Apply Filters
              </Button>
              <Button size="xs" variant="light" onClick={handleClearFilters}>
                Clear Filters
              </Button>
            </Group>
          </Stack>
        </Paper>

        <ScrollArea>
          <Table highlightOnHover verticalSpacing="sm" fontSize="sm">
            <thead>
              <tr>
                <th style={{ fontWeight: 600, color: '#495057' }}>Timestamp</th>
                <th style={{ fontWeight: 600, color: '#495057' }}>Action</th>
                <th style={{ fontWeight: 600, color: '#495057' }}>Severity</th>
                <th style={{ fontWeight: 600, color: '#495057' }}>Category</th>
                <th style={{ fontWeight: 600, color: '#495057' }}>Details</th>
                <th style={{ fontWeight: 600, color: '#495057' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <Center py="xl">
                      <Group spacing="sm">
                        <Loader size="sm" />
                        <Text color="dimmed">Loading audit logs...</Text>
                      </Group>
                    </Center>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
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
                rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((entry) => (
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
                              .map(([k, v]) => `${k}: ${formatMetaValue(v)}`)
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
                              setSelected(entry);
                              setModalOpen(true);
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

        {totalPages > 1 && (
          <Group position="center">
            <Pagination page={page} total={totalPages} onChange={setPage} size="sm" />
          </Group>
        )}
      </Stack>

      <AuditLogDetailModal
        entry={selected as any}
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelected(null);
        }}
      />
    </Card>
  );
};
