import { SimpleGrid } from '@mantine/core';
import { IconActivity, IconAlertTriangle, IconBolt, IconClock } from '@tabler/icons-react';
import React from 'react';
import { StatsCard } from './StatsCard';

interface LatencyMetrics {
  averageLatency: number;
  p50Latency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
  minLatency: number;
  totalRequests: number;
  errorRate: number;
}

interface LatencyMetricsCardsProps {
  metrics: LatencyMetrics | null;
  loading?: boolean;
}

export const LatencyMetricsCards: React.FC<LatencyMetricsCardsProps> = ({ metrics, loading = false }) => {
  const formatLatency = (value: string | number) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return `${numValue.toFixed(1)}ms`;
  };

  return (
    <SimpleGrid
      cols={5}
      spacing="md"
      breakpoints={[
        { maxWidth: 'lg', cols: 3 },
        { maxWidth: 'sm', cols: 2 }
      ]}
    >
      <StatsCard
        title="Avg Latency"
        value={metrics?.averageLatency || 0}
        icon={<IconClock size={18} />}
        color="blue"
        subtitle="Mean response time"
        formatter={formatLatency}
        loading={loading}
      />
      <StatsCard
        title="P95 Latency"
        value={metrics?.p95Latency || 0}
        icon={<IconBolt size={18} />}
        color="orange"
        subtitle="95th percentile"
        formatter={formatLatency}
        loading={loading}
      />
      <StatsCard
        title="P99 Latency"
        value={metrics?.p99Latency || 0}
        icon={<IconBolt size={18} />}
        color="red"
        subtitle="99th percentile"
        formatter={formatLatency}
        loading={loading}
      />
      <StatsCard
        title="Max Latency"
        value={metrics?.maxLatency || 0}
        icon={<IconAlertTriangle size={18} />}
        color="grape"
        subtitle="Slowest request"
        formatter={formatLatency}
        loading={loading}
      />
      <StatsCard
        title="Total Requests"
        value={metrics?.totalRequests || 0}
        icon={<IconActivity size={20} />}
        color="green"
        subtitle="Request count"
        loading={loading}
      />
    </SimpleGrid>
  );
};
