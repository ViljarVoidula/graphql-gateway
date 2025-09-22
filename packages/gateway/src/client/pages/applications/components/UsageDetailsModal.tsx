import { Button, Group, Modal, Select, Stack, Table, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import React from 'react';

interface UsageData {
  date: string;
  requestCount: number;
  errorCount: number;
  rateLimitExceededCount: number;
}

interface UsageDetailsModalProps {
  opened: boolean;
  onClose: () => void;
  usageModalKey: string | null;
  usageServiceFilter: string | null;
  setUsageServiceFilter: (filter: string | null) => void;
  onLoadUsage: (keyId: string) => void;
  loadingKeyUsage: Record<string, boolean>;
  perKeyUsage: Record<string, UsageData[]>;
  serviceSelectData: Array<{ value: string; label: string }>;
}

export const UsageDetailsModal: React.FC<UsageDetailsModalProps> = ({
  opened,
  onClose,
  usageModalKey,
  usageServiceFilter,
  setUsageServiceFilter,
  onLoadUsage,
  loadingKeyUsage,
  perKeyUsage,
  serviceSelectData
}) => {
  return (
    <Modal opened={opened} onClose={onClose} title="API Key Usage (14 days)" size="lg">
      {usageModalKey ? (
        <Stack>
          <Group position="apart" align="center">
            <Select
              placeholder="Filter by service"
              data={[{ value: '', label: 'All services' }, ...serviceSelectData]}
              value={usageServiceFilter || ''}
              onChange={(v) => {
                setUsageServiceFilter(v || null);
                onLoadUsage(usageModalKey);
              }}
              clearable
              searchable
              nothingFound="No services"
              size="xs"
              style={{ maxWidth: 280 }}
            />
            <Button
              size="xs"
              variant="light"
              leftIcon={<IconRefresh size={14} />}
              onClick={() => onLoadUsage(usageModalKey)}
              loading={!!loadingKeyUsage[usageModalKey]}
            >
              Refresh
            </Button>
          </Group>
          {perKeyUsage[usageModalKey]?.length ? (
            <Table striped withBorder>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Requests</th>
                  <th>Errors</th>
                  <th>Rate Limited</th>
                </tr>
              </thead>
              <tbody>
                {[...perKeyUsage[usageModalKey]].map((u) => (
                  <tr key={`${usageModalKey}-${u.date}`}>
                    <td>
                      <Text size="sm">{u.date}</Text>
                    </td>
                    <td>
                      <Text size="sm">{u.requestCount}</Text>
                    </td>
                    <td>
                      <Text size="sm" c={u.errorCount > 0 ? 'red' : undefined}>
                        {u.errorCount}
                      </Text>
                    </td>
                    <td>
                      <Text size="sm" c={u.rateLimitExceededCount > 0 ? 'orange' : undefined}>
                        {u.rateLimitExceededCount}
                      </Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Text c="dimmed">No usage data available</Text>
          )}
        </Stack>
      ) : null}
    </Modal>
  );
};
