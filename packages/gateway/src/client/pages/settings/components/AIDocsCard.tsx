import { Alert, Badge, Button, Card, Group, Loader, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconInfoCircle, IconRobot } from '@tabler/icons-react';
import React from 'react';
import { DocumentGenerationProgress } from '../../../components/DocumentGenerationProgress';

export interface AIDocsCardProps {
  loading: boolean;
  error: string | null;
  provider: 'OPENAI';
  onProviderChange: (provider: 'OPENAI') => void;
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  keyStored: boolean;
  generating: boolean;
  onGenerate: () => Promise<void> | void;
  generationMessage: string | null;
  onGenerationComplete: (result: { totalDocuments: number; totalServices: number }) => void;
  onGenerationError: (message: string) => void;
}

export const AIDocsCard: React.FC<AIDocsCardProps> = ({
  loading,
  error,
  provider,
  onProviderChange,
  baseUrl,
  onBaseUrlChange,
  model,
  onModelChange,
  apiKey,
  onApiKeyChange,
  keyStored,
  generating,
  onGenerate,
  generationMessage,
  onGenerationComplete,
  onGenerationError
}) => {
  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Stack spacing="md">
        <Group spacing="sm">
          <IconRobot size={20} />
          <Text weight={500} size="md">
            AI Doc Generation
          </Text>
        </Group>

        {loading ? (
          <Group>
            <Loader size="sm" />
            <Text size="sm">Loading AI configuration...</Text>
          </Group>
        ) : (
          <>
            {error && (
              <Alert color="red" title="Error" icon={<IconInfoCircle size={16} />}>
                {error}
              </Alert>
            )}

            <Select
              label="Provider"
              value={provider}
              data={[{ value: 'OPENAI', label: 'OpenAI compatible' }]}
              onChange={(val) => onProviderChange((val as 'OPENAI') || 'OPENAI')}
            />

            <TextInput
              label="Model"
              description="For OpenAI-compatible APIs, set the model identifier."
              placeholder="gpt-5-mini"
              value={model}
              onChange={(event) => onModelChange(event.currentTarget.value)}
            />

            <TextInput
              label="Base URL (optional)"
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={(event) => onBaseUrlChange(event.currentTarget.value)}
            />

            <TextInput
              label="API Key"
              description="Required to call the provider for LLM-based documentation enrichment."
              type="password"
              placeholder={keyStored ? '•••••••••••••••••••••' : 'sk-...'}
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.currentTarget.value)}
              rightSection={
                keyStored ? (
                  <Badge color="green" variant="light">
                    Stored
                  </Badge>
                ) : undefined
              }
            />

            <Group spacing="sm">
              <Button variant="light" size="xs" loading={generating} disabled={generating} onClick={() => onGenerate()}>
                Seed docs from services
              </Button>
            </Group>

            <DocumentGenerationProgress
              isGenerating={generating}
              onComplete={(result) => {
                onGenerationComplete(result);
              }}
              onError={(error) => {
                onGenerationError(error);
              }}
            />

            {generationMessage && !generating && (
              <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                {generationMessage}
              </Alert>
            )}

            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              <Text size="xs">
                Seeding reads each registered service SDL and creates an overview page. Add an API key to enable future
                LLM-powered enrichment.
              </Text>
            </Alert>
          </>
        )}
      </Stack>
    </Card>
  );
};
