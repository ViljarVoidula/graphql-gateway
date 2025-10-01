import { Alert, Button, Card, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconAdjustments,
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconInfoCircle,
  IconSparkles
} from '@tabler/icons-react';
import { FC } from 'react';
import ConfettiCelebration from '../components/ConfettiCelebration';

interface CompletionStepProps {
  shouldCelebrate: boolean;
  celebrationSeed: number;
  completionError: string | null;
  completing: boolean;
  onNavigateToSettings: () => void;
  onNavigateHome: () => void;
}

export const CompletionStep: FC<CompletionStepProps> = ({
  shouldCelebrate,
  celebrationSeed,
  completionError,
  completing,
  onNavigateToSettings,
  onNavigateHome
}) => (
  <>
    {shouldCelebrate && <ConfettiCelebration seed={celebrationSeed} />}
    <Card shadow="md" p="xl" radius="lg">
      <Stack spacing="xl">
        <Group spacing="sm">
          <ThemeIcon color="green" size="lg" radius="md">
            <IconSparkles size={20} />
          </ThemeIcon>
          <div>
            <Title order={2}>🎉 Your Gateway is Ready!</Title>
            <Text color="dimmed">
              Congratulations! You've successfully configured your GraphQL Gateway. Here's what you can do next.
            </Text>
          </div>
        </Group>

        {completionError && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red">
            {completionError}
          </Alert>
        )}

        <Card withBorder p="md" radius="md" style={{ backgroundColor: '#f8f9fa' }}>
          <Stack spacing="md">
            <Text weight={600} size="lg">
              What's Next?
            </Text>
            <List
              spacing="sm"
              icon={
                <ThemeIcon color="green" radius="xl" size={22}>
                  <IconCheck size={14} />
                </ThemeIcon>
              }
            >
              <List.Item>
                <Text weight={500}>Register GraphQL Services</Text>
                <Text size="sm" color="dimmed">
                  Connect your microservices to create a unified GraphQL API. Each service's schema will be automatically
                  stitched together.
                </Text>
              </List.Item>
              <List.Item>
                <Text weight={500}>Create Applications & API Keys</Text>
                <Text size="sm" color="dimmed">
                  Set up applications for your consumers and generate API keys with fine-grained permissions and rate limits.
                </Text>
              </List.Item>
              <List.Item>
                <Text weight={500}>Invite Your Team</Text>
                <Text size="sm" color="dimmed">
                  Add team members with different permission levels to collaborate on gateway management.
                </Text>
              </List.Item>
              <List.Item>
                <Text weight={500}>Monitor & Optimize</Text>
                <Text size="sm" color="dimmed">
                  Use the built-in observability tools to track performance, view audit logs, and optimize your gateway
                  configuration.
                </Text>
              </List.Item>
            </List>
          </Stack>
        </Card>

        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          <Stack spacing={4}>
            <Text weight={500}>Quick Tips</Text>
            <Text size="sm">
              • Start by registering your first service in the <strong>Services</strong> section
            </Text>
            <Text size="sm">
              • Configure caching and rate limits in <strong>Settings</strong> to optimize performance
            </Text>
            <Text size="sm">
              • Use the <strong>GraphiQL</strong> playground to test your unified schema
            </Text>
          </Stack>
        </Alert>

        <Group position="right" spacing="sm">
          <Button variant="light" leftIcon={<IconAdjustments size={16} />} onClick={onNavigateToSettings} disabled={completing}>
            Review gateway settings
          </Button>
          <Button leftIcon={<IconArrowRight size={16} />} loading={completing} onClick={onNavigateHome}>
            Enter the admin dashboard
          </Button>
        </Group>
      </Stack>
    </Card>
  </>
);

export default CompletionStep;
