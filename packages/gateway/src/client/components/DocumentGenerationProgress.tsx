import {
  Alert,
  Badge,
  Group,
  List,
  Progress,
  Stack,
  Text,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconClock } from '@tabler/icons-react';
import React, { useEffect, useState } from 'react';
import { useDocumentGenerationSubscription } from '../utils/subscriptions';

interface DocumentGenerationProgressProps {
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  isGenerating: boolean;
}

export const DocumentGenerationProgress: React.FC<
  DocumentGenerationProgressProps
> = ({ onComplete, onError, isGenerating }) => {
  const {
    inProgress,
    progress,
    currentService,
    completedServices,
    totalServices,
    error,
    result,
    subscribe,
  } = useDocumentGenerationSubscription();

  const [subscription, setSubscription] = useState<{
    unsubscribe: () => void;
  } | null>(null);

  useEffect(() => {
    if (isGenerating && !subscription) {
      // Start subscription when generation begins
      const sub = subscribe();
      setSubscription(sub);
    } else if (!isGenerating && subscription) {
      // Clean up subscription when generation stops
      subscription.unsubscribe();
      setSubscription(null);
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [isGenerating, subscription, subscribe]);

  useEffect(() => {
    if (result && onComplete) {
      onComplete(result);
    }
  }, [result, onComplete]);

  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  if (!isGenerating && !inProgress) {
    return null;
  }

  if (error) {
    return (
      <Alert
        color="red"
        icon={<IconAlertTriangle size={16} />}
        title="Generation Failed"
      >
        {error}
      </Alert>
    );
  }

  if (!inProgress && result) {
    return (
      <Alert
        color="green"
        icon={<IconCheck size={16} />}
        title="Generation Complete"
      >
        <Text size="sm">
          Successfully generated {result.totalDocuments} documents for{' '}
          {result.totalServices} services in {result.duration}ms
        </Text>
      </Alert>
    );
  }

  return (
    <Stack spacing="md">
      <Group position="apart">
        <Text size="sm" weight={500}>
          <IconClock size={16} style={{ marginRight: 8 }} />
          Generating Documentation...
        </Text>
        <Badge color="blue" variant="light">
          {progress}% complete
        </Badge>
      </Group>

      <Progress
        value={progress}
        size="lg"
        animate={inProgress}
        color={progress === 100 ? 'green' : 'blue'}
      />

      {totalServices > 0 && (
        <Group position="apart">
          <Text size="xs" color="dimmed">
            Services: {completedServices.length} of {totalServices}
          </Text>
          {currentService && (
            <Text size="xs" color="blue">
              Processing: {currentService}
            </Text>
          )}
        </Group>
      )}

      {completedServices.length > 0 && (
        <Stack spacing="xs">
          <Text size="xs" weight={500} color="dimmed">
            Completed Services:
          </Text>
          <List size="xs" spacing={2}>
            {completedServices.map((service) => (
              <List.Item
                key={service}
                icon={<IconCheck size={12} color="green" />}
              >
                {service}
              </List.Item>
            ))}
          </List>
        </Stack>
      )}
    </Stack>
  );
};
