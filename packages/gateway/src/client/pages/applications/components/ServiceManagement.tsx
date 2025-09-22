import { ActionIcon, Alert, Badge, Button, Group, Paper, Select, Stack, Table, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import React from 'react';

interface Service {
  id: string;
  name: string;
  status: string;
}

interface ServiceManagementProps {
  app: {
    whitelistedServices?: Service[];
  };
  services: Service[];
  servicesLoading: boolean;
  servicesError: string | null;
  serviceToAdd: string | null;
  setServiceToAdd: (serviceId: string | null) => void;
  addingService: boolean;
  addServiceError: string | null;
  onAddService: () => void;
  onRemoveService: (serviceId: string) => void;
}

export const ServiceManagement: React.FC<ServiceManagementProps> = ({
  app,
  services,
  servicesLoading,
  servicesError,
  serviceToAdd,
  setServiceToAdd,
  addingService,
  addServiceError,
  onAddService,
  onRemoveService
}) => {
  const serviceSelectData = React.useMemo(
    () => services.map((s: Service) => ({ value: String(s.id), label: s.name })),
    [services]
  );

  return (
    <Paper withBorder p="md">
      <Stack>
        <Title order={4}>Whitelisted Services</Title>
        <Group>
          <Select
            placeholder={
              servicesLoading
                ? 'Loading services...'
                : servicesError
                  ? 'Error loading services'
                  : 'Select a service to whitelist'
            }
            data={serviceSelectData}
            value={serviceToAdd}
            onChange={(val) => setServiceToAdd(val)}
            searchable
            clearable
            withinPortal
            nothingFound={servicesLoading ? 'Loading...' : servicesError ? 'No services (error)' : 'No services found'}
            disabled={servicesLoading || addingService}
            error={servicesError || undefined}
          />
          <Button onClick={onAddService} disabled={!serviceToAdd || addingService} loading={addingService}>
            Add
          </Button>
        </Group>
        {addServiceError && (
          <Alert color="red" variant="light" mt={4} title="Add Service Failed">
            {addServiceError}
          </Alert>
        )}
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(app.whitelistedServices || []).map((s: Service) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>
                  <Badge variant="light">{s.status}</Badge>
                </td>
                <td>
                  <ActionIcon color="red" variant="light" onClick={() => onRemoveService(s.id)}>
                    <IconTrash size={14} />
                  </ActionIcon>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Stack>
    </Paper>
  );
};
