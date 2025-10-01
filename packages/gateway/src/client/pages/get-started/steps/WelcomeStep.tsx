import { Button, Card, Divider, Grid, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowRight, IconRocket } from '@tabler/icons-react';
import { FC } from 'react';
import StepBadge from '../components/StepBadge';

interface WelcomeStepProps {
  onContinue: () => void;
}

export const WelcomeStep: FC<WelcomeStepProps> = ({ onContinue }) => (
  <Card shadow="md" p="xl" radius="lg">
    <Stack spacing="md">
      <Group spacing="sm">
        <ThemeIcon color="blue" size="lg" radius="md">
          <IconRocket size={20} />
        </ThemeIcon>
        <div>
          <Title order={2}>Welcome to GraphQL Gateway</Title>
          <Text color="dimmed">Let's bootstrap a secure admin and tailor the platform to your stack.</Text>
        </div>
      </Group>

      <Divider variant="dashed" />

      <Grid gutter="xl">
        <Grid.Col md={4}>
          <Stack spacing="xs">
            <StepBadge label="Step 1" />
            <Text weight={600}>Create the initial admin</Text>
            <Text color="dimmed">
              We'll provision the first high-privilege account with secure defaults and hand the controls over to you.
            </Text>
          </Stack>
        </Grid.Col>
        <Grid.Col md={4}>
          <Stack spacing="xs">
            <StepBadge label="Step 2" />
            <Text weight={600}>Review the essentials</Text>
            <Text color="dimmed">
              Configure authentication guardrails, developer tooling, caching, and AI documentation helpers—all with contextual
              guidance.
            </Text>
          </Stack>
        </Grid.Col>
        <Grid.Col md={4}>
          <Stack spacing="xs">
            <StepBadge label="Step 3" />
            <Text weight={600}>Launch confidently</Text>
            <Text color="dimmed">
              Get quick tips for onboarding the rest of your team and connecting upstream services once setup is done.
            </Text>
          </Stack>
        </Grid.Col>
      </Grid>

      <Group position="right" mt="md">
        <Button rightIcon={<IconArrowRight size={16} />} onClick={onContinue}>
          Let's get started
        </Button>
      </Group>
    </Stack>
  </Card>
);

export default WelcomeStep;
