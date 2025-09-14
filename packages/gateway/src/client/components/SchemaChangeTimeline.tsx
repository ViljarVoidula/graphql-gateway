import { Badge, Button, Card, Code, Flex, Group, MultiSelect, ScrollArea, Text } from '@mantine/core';
import React, { useEffect, useState } from 'react';

interface SchemaChange {
  id: string;
  previousHash?: string | null;
  newHash: string;
  diff: string;
  createdAt: string;
  classification: 'breaking' | 'non_breaking' | 'unknown';
}

interface Props {
  serviceId: string;
  fetcher: (query: string, variables?: any) => Promise<any>; // abstraction over graphql client
}

const QUERY = `query SchemaChanges($serviceId: ID!, $filters: SchemaChangeFilterInput) {
  schemaChanges(serviceId: $serviceId, filters: $filters) {
    id
    previousHash
    newHash
    diff
    createdAt
    classification
  }
}`;

export const SchemaChangeTimeline: React.FC<Props> = ({ serviceId, fetcher }) => {
  const [changes, setChanges] = useState<SchemaChange[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const filters: any = { limit: 100 };
      if (selectedClasses.length) filters.classifications = selectedClasses;
      const res = await fetcher(QUERY, { serviceId, filters });
      setChanges(res?.schemaChanges || []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load schema changes', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [serviceId, selectedClasses]);

  return (
    <Card withBorder shadow="sm" p="md">
      <Flex justify="space-between" align="center" mb="sm" gap={8} direction="row" wrap="wrap">
        <Text fw={600}>Schema Changes</Text>
        <Group spacing="xs">
          <MultiSelect
            data={[
              { value: 'breaking', label: 'Breaking' },
              { value: 'non_breaking', label: 'Non-breaking' },
              { value: 'unknown', label: 'Unknown' }
            ]}
            value={selectedClasses}
            onChange={setSelectedClasses}
            placeholder="Classification"
            searchable
            clearable
            size="xs"
            w={220}
          />
          <Button size="xs" onClick={load} loading={loading} variant="light">
            Refresh
          </Button>
        </Group>
      </Flex>
      <ScrollArea h={300} offsetScrollbars>
        {changes.length === 0 && <Text size="sm">No changes recorded.</Text>}
        {changes.map((c) => {
          const open = expanded[c.id];
          return (
            <Card key={c.id} withBorder mb="sm" p="xs">
              <Group position="apart" noWrap>
                <div>
                  <Text size="xs" c="dimmed">
                    {new Date(c.createdAt).toLocaleString()}
                  </Text>
                  <Group spacing={6} mt={4} align="center">
                    <Badge
                      size="xs"
                      color={c.classification === 'breaking' ? 'red' : c.classification === 'non_breaking' ? 'green' : 'gray'}
                    >
                      {c.classification.replace('_', ' ')}
                    </Badge>
                    <Badge size="xs" color="blue" variant="outline">
                      {c.previousHash ? c.previousHash.slice(0, 7) : '∅'} → {c.newHash.slice(0, 7)}
                    </Badge>
                    <Button compact size="xs" variant="subtle" onClick={() => setExpanded((s) => ({ ...s, [c.id]: !open }))}>
                      {open ? 'Hide Diff' : 'Show Diff'}
                    </Button>
                  </Group>
                </div>
              </Group>
              {open && (
                <Code block mt="xs" fz={11} style={{ whiteSpace: 'pre-wrap' }}>
                  {c.diff}
                </Code>
              )}
            </Card>
          );
        })}
      </ScrollArea>
    </Card>
  );
};

export default SchemaChangeTimeline;
