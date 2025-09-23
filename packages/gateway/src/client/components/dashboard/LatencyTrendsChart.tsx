import { Badge, Box, Card, Group, Text } from '@mantine/core';
import { IconMinus, IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';
import React from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface LatencyTrendData {
  date: string;
  averageLatency: number;
  p95Latency: number;
  requestCount: number;
}

interface LatencyTrendsChartProps {
  data: LatencyTrendData[];
  loading?: boolean;
  title?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <Card shadow="sm" p="sm" withBorder>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {payload.map((entry: any, index: number) => (
          <Group key={index} spacing={8} mt={4}>
            <Box
              w={8}
              h={8}
              style={{
                backgroundColor: entry.color,
                borderRadius: '50%'
              }}
            />
            <Text size="sm">
              {entry.name}: {entry.value?.toFixed(1)}ms
            </Text>
          </Group>
        ))}
      </Card>
    );
  }
  return null;
};

const calculateTrend = (data: LatencyTrendData[], field: keyof LatencyTrendData): 'up' | 'down' | 'stable' => {
  if (data.length < 2) return 'stable';

  const recent = data.slice(-5); // Last 5 data points
  const firstValue = recent[0][field] as number;
  const lastValue = recent[recent.length - 1][field] as number;

  const change = ((lastValue - firstValue) / firstValue) * 100;

  if (Math.abs(change) < 5) return 'stable';
  return change > 0 ? 'up' : 'down';
};

const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return <IconTrendingUp size={16} />;
    case 'down':
      return <IconTrendingDown size={16} />;
    default:
      return <IconMinus size={16} />;
  }
};

const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
  switch (trend) {
    case 'up':
      return 'red';
    case 'down':
      return 'green';
    default:
      return 'gray';
  }
};

export const LatencyTrendsChart: React.FC<LatencyTrendsChartProps> = ({
  data,
  loading = false,
  title = 'Latency Trends Over Time'
}) => {
  const avgTrend = calculateTrend(data, 'averageLatency');
  const p95Trend = calculateTrend(data, 'p95Latency');

  if (loading) {
    return (
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Group position="apart" mb="xs">
          <Text fw={500}>{title}</Text>
        </Group>
        <Box h={300} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text c="dimmed">Loading chart data...</Text>
        </Box>
      </Card>
    );
  }

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Group position="apart" mb="xs">
        <Text fw={500}>{title}</Text>
        <Group spacing="xs">
          <Badge color={getTrendColor(avgTrend)} variant="light" leftSection={getTrendIcon(avgTrend)} size="sm">
            Avg {avgTrend}
          </Badge>
          <Badge color={getTrendColor(p95Trend)} variant="light" leftSection={getTrendIcon(p95Trend)} size="sm">
            P95 {p95Trend}
          </Badge>
        </Group>
      </Group>

      <Box h={300}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: date.getHours() !== 0 ? 'numeric' : undefined
                });
              }}
            />
            <YAxis tick={{ fontSize: 12 }} label={{ value: 'Latency (ms)', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="averageLatency"
              stroke="#2563eb"
              strokeWidth={2}
              name="Average Latency"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="p95Latency"
              stroke="#dc2626"
              strokeWidth={2}
              name="P95 Latency"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  );
};
