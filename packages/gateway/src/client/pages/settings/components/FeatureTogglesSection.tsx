import { SimpleGrid, Stack, Text, Title } from '@mantine/core';
import React from 'react';
import { FeatureToggleCard, FeatureToggleCardProps } from './FeatureToggleCard';

export interface FeatureTogglesSectionProps {
  title?: string;
  description?: string;
  items: FeatureToggleCardProps[];
  columns?: number;
}

export const FeatureTogglesSection: React.FC<FeatureTogglesSectionProps> = ({
  title = 'Feature Toggles',
  description = 'Quickly enable or disable optional gateway capabilities. These toggles take effect immediately after saving.',
  items,
  columns = 2
}) => {
  if (!items.length) {
    return null;
  }

  return (
    <Stack spacing="md">
      <div>
        <Title order={3}>{title}</Title>
        {description && (
          <Text size="sm" color="dimmed">
            {description}
          </Text>
        )}
      </div>
      <SimpleGrid cols={columns} spacing="lg" breakpoints={[{ maxWidth: 'md', cols: 1 }]}>
        {items.map((item) => (
          <FeatureToggleCard key={item.id} {...item} />
        ))}
      </SimpleGrid>
    </Stack>
  );
};
