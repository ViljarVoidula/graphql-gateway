import { Badge, Box, Card, Group, Select, Text } from '@mantine/core';
import { IconApps, IconChartBar } from '@tabler/icons-react';
import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface ApplicationPerformanceData {
  applicationName: string;
  averageLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  requestCount: number;
  errorRate: number;
}

interface ApplicationPerformanceChartProps {
  data: ApplicationPerformanceData[];
  loading?: boolean;
  title?: string;
}

type MetricType = 'averageLatency' | 'p95Latency' | 'p99Latency' | 'requestCount';

const metricOptions = [
  { value: 'averageLatency', label: 'Average Latency' },
  { value: 'p95Latency', label: 'P95 Latency' },
  { value: 'p99Latency', label: 'P99 Latency' },
  { value: 'requestCount', label: 'Request Count' }
];

const getBarColor = (value: number, metric: MetricType, allValues: number[]): string => {
  if (metric === 'requestCount') {
    // For request count, higher is better (green)
    const max = Math.max(...allValues);
    const percentage = value / max;
    if (percentage > 0.8) return '#51cf66';
    if (percentage > 0.5) return '#94d82d';
    if (percentage > 0.2) return '#ffd43b';
    return '#ff8787';
  } else {
    // For latency metrics, lower is better (green)
    const max = Math.max(...allValues);
    const percentage = value / max;
    if (percentage > 0.8) return '#ff8787';
    if (percentage > 0.5) return '#ffb366';
    if (percentage > 0.2) return '#ffd43b';
    return '#51cf66';
  }
};

const formatValue = (value: number, metric: MetricType): string => {
  if (metric === 'requestCount') {
    return value.toLocaleString();
  }
  return `${value.toFixed(1)}ms`;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <Card shadow="sm" p="sm" withBorder>
        <Text size="sm" fw={500} mb={4}>
          {label}
        </Text>
        <Group spacing="xs">
          <Text size="xs" c="dimmed">
            Avg:
          </Text>
          <Text size="xs">{data.averageLatency.toFixed(1)}ms</Text>
        </Group>
        <Group spacing="xs">
          <Text size="xs" c="dimmed">
            P95:
          </Text>
          <Text size="xs">{data.p95Latency.toFixed(1)}ms</Text>
        </Group>
        <Group spacing="xs">
          <Text size="xs" c="dimmed">
            Requests:
          </Text>
          <Text size="xs">{data.requestCount.toLocaleString()}</Text>
        </Group>
        {data.errorRate > 0 && (
          <Group spacing="xs">
            <Text size="xs" c="dimmed">
              Error Rate:
            </Text>
            <Text size="xs" c="red">
              {(data.errorRate * 100).toFixed(1)}%
            </Text>
          </Group>
        )}
      </Card>
    );
  }
  return null;
};

export const ApplicationPerformanceChart: React.FC<ApplicationPerformanceChartProps> = ({
  data,
  loading = false,
  title = 'Application Performance Comparison'
}) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('averageLatency');

  const chartData = data.map((item) => ({
    ...item,
    displayName: item.applicationName.length > 15 ? `${item.applicationName.substring(0, 12)}...` : item.applicationName
  }));

  const allValues = data.map((item) => item[selectedMetric] as number);

  if (loading) {
    return (
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Group position="apart" mb="md">
          <Group spacing="xs">
            <IconApps size={20} />
            <Text fw={500}>{title}</Text>
          </Group>
        </Group>
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 350 }}>
          <Text c="dimmed">Loading application data...</Text>
        </Box>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Group position="apart" mb="md">
          <Group spacing="xs">
            <IconApps size={20} />
            <Text fw={500}>{title}</Text>
          </Group>
        </Group>
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 350 }}>
          <Text c="dimmed">No application data available</Text>
        </Box>
      </Card>
    );
  }

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Group position="apart" mb="md">
        <Group spacing="xs">
          <IconApps size={20} />
          <Text fw={500}>{title}</Text>
        </Group>
        <Group spacing="xs">
          <IconChartBar size={16} />
          <Select
            data={metricOptions}
            value={selectedMetric}
            onChange={(value) => setSelectedMetric(value as MetricType)}
            size="xs"
            style={{ width: 140 }}
          />
          <Badge variant="light" color="blue" size="sm">
            {data.length} apps
          </Badge>
        </Group>
      </Group>

      <Box h={350}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="displayName" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={80} />
            <YAxis
              tick={{ fontSize: 12 }}
              label={{
                value: selectedMetric === 'requestCount' ? 'Requests' : 'Latency (ms)',
                angle: -90,
                position: 'insideLeft'
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={selectedMetric} radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry[selectedMetric] as number, selectedMetric, allValues)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      <Group position="center" mt="sm">
        <Text size="xs" c="dimmed">
          {selectedMetric === 'requestCount'
            ? 'Higher values indicate more traffic'
            : 'Lower values indicate better performance'}
        </Text>
      </Group>
    </Card>
  );
};
