import { Badge, Box, Card, Center, Group, RingProgress, Stack, Text } from '@mantine/core';
import { IconClock, IconServer } from '@tabler/icons-react';
import React from 'react';

interface SlowestService {
  serviceName: string;
  averageLatency: number;
  requestCount: number;
  errorRate: number;
  p95Latency: number;
}

interface SlowestServicesCardProps {
  services: SlowestService[];
  loading?: boolean;
  title?: string;
  maxItems?: number;
}

const getLatencyColor = (latency: number): string => {
  if (latency < 100) return 'green';
  if (latency < 500) return 'yellow';
  if (latency < 1000) return 'orange';
  return 'red';
};

const getPerformanceScore = (latency: number): number => {
  // Convert latency to a performance score (0-100, higher is better)
  const maxLatency = 2000; // Consider 2s as worst case
  return Math.max(0, Math.min(100, 100 - (latency / maxLatency) * 100));
};

export const SlowestServicesCard: React.FC<SlowestServicesCardProps> = ({
  services,
  loading = false,
  title = 'Service Performance',
  maxItems = 5
}) => {
  const displayServices = services.slice(0, maxItems);

  if (loading) {
    return (
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Group position="apart" mb="md">
          <Group spacing="xs">
            <IconServer size={20} />
            <Text fw={500}>{title}</Text>
          </Group>
        </Group>
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <Text c="dimmed">Loading service data...</Text>
        </Box>
      </Card>
    );
  }

  if (displayServices.length === 0) {
    return (
      <Card shadow="sm" p="lg" radius="md" withBorder>
        <Group position="apart" mb="md">
          <Group spacing="xs">
            <IconServer size={20} />
            <Text fw={500}>{title}</Text>
          </Group>
        </Group>
        <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <Text c="dimmed">No service data available</Text>
        </Box>
      </Card>
    );
  }

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Group position="apart" mb="md">
        <Group spacing="xs">
          <IconServer size={20} />
          <Text fw={500}>{title}</Text>
        </Group>
        <Badge variant="light" color="blue" size="sm">
          Top {displayServices.length}
        </Badge>
      </Group>

      <Stack spacing="md">
        {displayServices.map((service, index) => {
          const performanceScore = getPerformanceScore(service.averageLatency);
          const latencyColor = getLatencyColor(service.averageLatency);

          return (
            <Box key={service.serviceName} p="sm" style={{ backgroundColor: '#f8f9fa', borderRadius: 8 }}>
              <Group position="apart" align="flex-start">
                <Box style={{ flex: 1 }}>
                  <Group spacing="xs" mb={4}>
                    <Badge size="xs" color="gray" variant="filled" style={{ fontFamily: 'monospace' }}>
                      #{index + 1}
                    </Badge>
                    <Text fw={500} size="sm">
                      {service.serviceName}
                    </Text>
                  </Group>

                  <Group spacing="lg" mt={4}>
                    <Group spacing={4}>
                      <IconClock size={14} color="#666" />
                      <Text size="xs" c="dimmed">
                        Avg:
                      </Text>
                      <Badge size="xs" color={latencyColor} variant="light">
                        {service.averageLatency.toFixed(1)}ms
                      </Badge>
                    </Group>

                    <Group spacing={4}>
                      <Text size="xs" c="dimmed">
                        P95:
                      </Text>
                      <Badge size="xs" color={getLatencyColor(service.p95Latency)} variant="light">
                        {service.p95Latency.toFixed(1)}ms
                      </Badge>
                    </Group>

                    <Group spacing={4}>
                      <Text size="xs" c="dimmed">
                        Requests:
                      </Text>
                      <Text size="xs" fw={500}>
                        {service.requestCount.toLocaleString()}
                      </Text>
                    </Group>

                    {service.errorRate > 0 && (
                      <Group spacing={4}>
                        <Text size="xs" c="dimmed">
                          Errors:
                        </Text>
                        <Badge size="xs" color="red" variant="light">
                          {(service.errorRate * 100).toFixed(1)}%
                        </Badge>
                      </Group>
                    )}
                  </Group>
                </Box>

                <Center>
                  <RingProgress
                    size={50}
                    thickness={4}
                    sections={[
                      {
                        value: performanceScore,
                        color: performanceScore > 80 ? 'green' : performanceScore > 60 ? 'yellow' : 'red'
                      }
                    ]}
                    label={
                      <Center>
                        <Text size="xs" fw={700}>
                          {Math.round(performanceScore)}
                        </Text>
                      </Center>
                    }
                  />
                </Center>
              </Group>
            </Box>
          );
        })}
      </Stack>

      {services.length > maxItems && (
        <Text size="xs" c="dimmed" ta="center" mt="md">
          Showing top {maxItems} of {services.length} services
        </Text>
      )}
    </Card>
  );
};
