import { Badge, Card, Center, Grid, Group, Loader, Paper, Progress, Select, Stack, Text, Title } from '@mantine/core';
import { IconCalendar, IconChartLine } from '@tabler/icons-react';
import React from 'react';

interface UsageData {
  date: string;
  requestCount: number;
  errorCount: number;
  rateLimitExceededCount: number;
  serviceId?: string;
}

interface Service {
  id: string;
  name: string;
}

interface InlineUsageDetailsProps {
  keyId: string;
  usage: UsageData[];
  loading: boolean;
  services: Service[];
  onServiceFilterChange?: (serviceId: string | null) => void;
}

export const InlineUsageDetails: React.FC<InlineUsageDetailsProps> = ({
  keyId,
  usage,
  loading,
  services,
  onServiceFilterChange
}) => {
  const [serviceFilter, setServiceFilter] = React.useState<string | null>(null);

  const filteredUsage = React.useMemo(() => {
    if (!serviceFilter) return usage;
    return usage.filter((u) => u.serviceId === serviceFilter);
  }, [usage, serviceFilter]);

  const handleServiceFilterChange = (value: string | null) => {
    setServiceFilter(value);
    onServiceFilterChange?.(value);
  };

  const totals = React.useMemo(() => {
    const total = filteredUsage.reduce(
      (acc, curr) => ({
        requests: acc.requests + (curr.requestCount || 0),
        errors: acc.errors + (curr.errorCount || 0),
        rateLimitExceeded: acc.rateLimitExceeded + (curr.rateLimitExceededCount || 0)
      }),
      { requests: 0, errors: 0, rateLimitExceeded: 0 }
    );

    return {
      ...total,
      errorRate: total.requests > 0 ? (total.errors / total.requests) * 100 : 0,
      rateLimitRate: total.requests > 0 ? (total.rateLimitExceeded / total.requests) * 100 : 0
    };
  }, [filteredUsage]);

  const serviceOptions = React.useMemo(
    () => [{ value: '', label: 'All Services' }, ...services.map((s) => ({ value: s.id, label: s.name }))],
    [services]
  );

  if (loading) {
    return (
      <Paper p="md" radius="md" style={{ backgroundColor: '#f8f9fa' }}>
        <Center>
          <Group spacing="sm">
            <Loader size="sm" />
            <Text size="sm" color="dimmed">
              Loading usage data...
            </Text>
          </Group>
        </Center>
      </Paper>
    );
  }

  if (!usage.length) {
    return (
      <Paper p="md" radius="md" style={{ backgroundColor: '#f8f9fa' }}>
        <Center>
          <Text size="sm" color="dimmed">
            No usage data available for the last 14 days
          </Text>
        </Center>
      </Paper>
    );
  }

  return (
    <Paper p="md" radius="md" style={{ backgroundColor: '#f8f9fa' }}>
      <Stack spacing="md">
        {/* Filter Controls */}
        <Group position="apart" align="center">
          <Group spacing="xs" align="center">
            <IconChartLine size={16} />
            <Text size="sm" weight={500}>
              Usage Details (Last 14 days)
            </Text>
          </Group>
          {services.length > 0 && (
            <Select
              size="xs"
              placeholder="Filter by service"
              value={serviceFilter || ''}
              onChange={handleServiceFilterChange}
              data={serviceOptions}
              clearable
              style={{ minWidth: 150 }}
            />
          )}
        </Group>

        {/* Summary Cards */}
        <Grid>
          <Grid.Col span={3}>
            <Card p="sm" radius="md" withBorder>
              <Stack spacing={4} align="center">
                <Text size="xs" color="dimmed" weight={500}>
                  Total Requests
                </Text>
                <Title order={4} color="blue">
                  {totals.requests.toLocaleString()}
                </Title>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={3}>
            <Card p="sm" radius="md" withBorder>
              <Stack spacing={4} align="center">
                <Text size="xs" color="dimmed" weight={500}>
                  Errors
                </Text>
                <Title order={4} color={totals.errors > 0 ? 'red' : 'gray'}>
                  {totals.errors.toLocaleString()}
                </Title>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={3}>
            <Card p="sm" radius="md" withBorder>
              <Stack spacing={4} align="center">
                <Text size="xs" color="dimmed" weight={500}>
                  Rate Limited
                </Text>
                <Title order={4} color={totals.rateLimitExceeded > 0 ? 'orange' : 'gray'}>
                  {totals.rateLimitExceeded.toLocaleString()}
                </Title>
              </Stack>
            </Card>
          </Grid.Col>
          <Grid.Col span={3}>
            <Card p="sm" radius="md" withBorder>
              <Stack spacing={4} align="center">
                <Text size="xs" color="dimmed" weight={500}>
                  Success Rate
                </Text>
                <Title order={4} color={totals.errorRate < 5 ? 'green' : 'orange'}>
                  {(100 - totals.errorRate).toFixed(1)}%
                </Title>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

        {/* Daily Breakdown */}
        <Stack spacing="xs">
          <Group spacing="xs" align="center">
            <IconCalendar size={14} />
            <Text size="sm" weight={500}>
              Daily Breakdown
            </Text>
          </Group>

          {/* Bar Chart */}
          <Paper p="md" radius="md" withBorder>
            <Stack spacing="sm">
              {/* Chart */}
              <div style={{ height: 120, position: 'relative' }}>
                <svg width="100%" height="100%" viewBox="0 0 600 120">
                  {/* Grid lines */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <line key={i} x1={50} y1={20 + i * 20} x2={580} y2={20 + i * 20} stroke="#e9ecef" strokeWidth={1} />
                  ))}

                  {/* Y-axis labels */}
                  {(() => {
                    const maxRequests = Math.max(1, ...filteredUsage.map((u) => u.requestCount + u.errorCount));
                    return [0, 1, 2, 3, 4].map((i) => {
                      const value = Math.round((maxRequests * (4 - i)) / 4);
                      return (
                        <text key={i} x={45} y={20 + i * 20 + 4} textAnchor="end" fontSize="10" fill="#868e96">
                          {value.toLocaleString()}
                        </text>
                      );
                    });
                  })()}

                  {/* Bars */}
                  {filteredUsage
                    .slice()
                    .reverse()
                    .map((day, index) => {
                      const maxRequests = Math.max(1, ...filteredUsage.map((u) => u.requestCount + u.errorCount));
                      const barWidth = Math.min(30, 530 / filteredUsage.length - 4);
                      const x = 55 + index * (530 / filteredUsage.length);

                      const successHeight = Math.max(0, (day.requestCount / maxRequests) * 80);
                      const errorHeight = Math.max(0, (day.errorCount / maxRequests) * 80);
                      const rateLimitHeight = Math.max(0, (day.rateLimitExceededCount / maxRequests) * 80);

                      const successY = 100 - successHeight;
                      const errorY = successY - errorHeight;
                      const rateLimitY = errorY - rateLimitHeight;

                      return (
                        <g key={day.date}>
                          {/* Success requests */}
                          {successHeight > 0 && (
                            <rect x={x} y={successY} width={barWidth} height={successHeight} fill="#51cf66" rx={2} />
                          )}
                          {/* Error requests */}
                          {errorHeight > 0 && (
                            <rect x={x} y={errorY} width={barWidth} height={errorHeight} fill="#ff6b6b" rx={2} />
                          )}
                          {/* Rate limited requests */}
                          {rateLimitHeight > 0 && (
                            <rect x={x} y={rateLimitY} width={barWidth} height={rateLimitHeight} fill="#ffd43b" rx={2} />
                          )}
                          {/* Date label */}
                          <text
                            x={x + barWidth / 2}
                            y={115}
                            textAnchor="middle"
                            fontSize="9"
                            fill="#868e96"
                            transform={filteredUsage.length > 10 ? `rotate(-45 ${x + barWidth / 2} 115)` : ''}
                          >
                            {new Date(day.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })}
                          </text>
                        </g>
                      );
                    })}
                </svg>
              </div>

              {/* Legend */}
              <Group spacing="md" position="center">
                <Group spacing={4} align="center">
                  <div style={{ width: 12, height: 12, backgroundColor: '#51cf66', borderRadius: 2 }} />
                  <Text size="xs">Successful</Text>
                </Group>
                <Group spacing={4} align="center">
                  <div style={{ width: 12, height: 12, backgroundColor: '#ff6b6b', borderRadius: 2 }} />
                  <Text size="xs">Errors</Text>
                </Group>
                <Group spacing={4} align="center">
                  <div style={{ width: 12, height: 12, backgroundColor: '#ffd43b', borderRadius: 2 }} />
                  <Text size="xs">Rate Limited</Text>
                </Group>
              </Group>
            </Stack>
          </Paper>

          {/* Detailed List */}
          <Stack spacing={4}>
            {filteredUsage
              .slice()
              .reverse()
              .slice(0, 7)
              .map((day, index) => {
                const total = day.requestCount + day.errorCount;
                const errorRate = total > 0 ? (day.errorCount / total) * 100 : 0;
                const date = new Date(day.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                });

                return (
                  <Paper key={day.date} p="xs" radius="sm" withBorder>
                    <Group position="apart" align="center">
                      <Group spacing="md" align="center">
                        <Text size="xs" weight={500} style={{ minWidth: 50 }}>
                          {date}
                        </Text>
                        <Group spacing="xs">
                          <Badge size="xs" variant="light" color="green">
                            {day.requestCount} req
                          </Badge>
                          {day.errorCount > 0 && (
                            <Badge size="xs" variant="light" color="red">
                              {day.errorCount} err
                            </Badge>
                          )}
                          {day.rateLimitExceededCount > 0 && (
                            <Badge size="xs" variant="light" color="yellow">
                              {day.rateLimitExceededCount} limited
                            </Badge>
                          )}
                        </Group>
                      </Group>

                      <Group spacing="xs" align="center">
                        {errorRate > 0 && (
                          <Text size="xs" color={errorRate > 10 ? 'red' : 'orange'}>
                            {errorRate.toFixed(1)}% errors
                          </Text>
                        )}
                        <Progress
                          value={Math.min(
                            100,
                            (day.requestCount / Math.max(1, Math.max(...filteredUsage.map((u) => u.requestCount)))) * 100
                          )}
                          size="sm"
                          color={errorRate > 10 ? 'red' : errorRate > 5 ? 'orange' : 'green'}
                          style={{ width: 80 }}
                        />
                      </Group>
                    </Group>
                  </Paper>
                );
              })}

            {filteredUsage.length > 7 && (
              <Text size="xs" color="dimmed" align="center">
                Showing last 7 days. Chart above shows all {filteredUsage.length} days.
              </Text>
            )}
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
};
