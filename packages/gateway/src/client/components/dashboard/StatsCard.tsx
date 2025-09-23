import { Badge, Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import React from 'react';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  trend?: string;
  loading?: boolean;
  formatter?: (value: number | string) => string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
  trend,
  loading = false,
  formatter
}) => {
  const formattedValue = formatter && typeof value === 'number' ? formatter(value) : value;

  return (
    <Card shadow="xs" p="xl" radius="lg" withBorder style={{ height: '100%' }}>
      <Group position="apart" align="flex-start" mb="md">
        <ThemeIcon size="xl" radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
        {trend && (
          <Badge size="sm" color="green" variant="light">
            {trend}
          </Badge>
        )}
      </Group>
      <Stack spacing="xs">
        <Text size="sm" color="dimmed" weight={500} transform="uppercase" style={{ letterSpacing: '0.5px' }}>
          {title}
        </Text>
        <Text size="xl" weight={700} color="dark">
          {loading ? '-' : typeof formattedValue === 'number' ? formattedValue.toLocaleString() : formattedValue}
        </Text>
        {subtitle && (
          <Text size="xs" color="dimmed">
            {subtitle}
          </Text>
        )}
      </Stack>
    </Card>
  );
};
