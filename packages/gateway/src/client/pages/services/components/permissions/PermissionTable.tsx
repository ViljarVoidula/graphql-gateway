import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import React from 'react';
import type { ParsedSDL } from '../../../../utils/sdl-parser';
import {
  ACCESS_OPTIONS,
  AccessLevel,
  OPERATION_COLORS,
  OPERATION_ORDER,
  OperationType,
  PermissionTemplate,
  ServicePermission,
} from './types';

interface PermissionTableProps {
  serviceId: string;
  serviceName: string;
  permissions: ServicePermission[];
  templates: PermissionTemplate[];
  templateState: Record<string, string[]>;
  parsedSDL: ParsedSDL | null;
  service?: any;
  onPermissionToggle: (permission: ServicePermission, active: boolean) => void;
  onAccessLevelChange: (
    permission: ServicePermission,
    level: AccessLevel
  ) => void;
  onTemplateToggle: (
    template: PermissionTemplate,
    permissionKey: string,
    enabled: boolean
  ) => void;
  onSyncPermissions: () => void;
  isUpdatingPermission: boolean;
  isUpdatingTemplate: boolean;
  isSyncingPermissions: boolean;
}

export const PermissionTable: React.FC<PermissionTableProps> = ({
  serviceId,
  serviceName,
  permissions,
  templates,
  templateState,
  parsedSDL,
  service,
  onPermissionToggle,
  onAccessLevelChange,
  onTemplateToggle,
  onSyncPermissions,
  isUpdatingPermission,
  isUpdatingTemplate,
  isSyncingPermissions,
}) => {
  const [showInactivePermissions, setShowInactivePermissions] =
    React.useState<boolean>(true);

  const sortedPermissions = React.useMemo(() => {
    // Deduplicate permissions by permissionKey to avoid showing the same operation multiple times
    const uniquePermissions = new Map<string, ServicePermission>();

    permissions.forEach((permission) => {
      // Keep the permission with the latest updatedAt or just the first one if dates are equal
      const existing = uniquePermissions.get(permission.permissionKey);
      if (
        !existing ||
        new Date(permission.updatedAt) > new Date(existing.updatedAt)
      ) {
        uniquePermissions.set(permission.permissionKey, permission);
      }
    });

    const allPermissions = Array.from(uniquePermissions.values());

    // Always show all permissions - the toggle now controls visual styling only
    return allPermissions.sort((a, b) => {
      const typeDiff =
        OPERATION_ORDER.indexOf(a.operationType) -
        OPERATION_ORDER.indexOf(b.operationType);
      if (typeDiff !== 0) return typeDiff;
      return a.operationName.localeCompare(b.operationName);
    });
  }, [permissions]);

  const groupedPermissions = React.useMemo(() => {
    const groups: Record<OperationType, ServicePermission[]> = {
      QUERY: [],
      MUTATION: [],
      SUBSCRIPTION: [],
    };

    sortedPermissions.forEach((permission) => {
      groups[permission.operationType].push(permission);
    });

    return groups;
  }, [sortedPermissions]);

  const templateHeaders = templates.map((template) => (
    <th
      key={template.id}
      style={{ whiteSpace: 'nowrap', textAlign: 'center', width: '60px' }}
    >
      <Stack spacing={2} align="center">
        <Text size="xs" weight={500} style={{ textAlign: 'center' }}>
          {template.name}
        </Text>
      </Stack>
    </th>
  ));

  const handleEnableAll = () => {
    const inactivePermissions = permissions.filter((p) => !p.active);
    inactivePermissions.forEach((permission) => {
      onPermissionToggle(permission, true);
    });
  };

  if (sortedPermissions.length === 0) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="yellow">
        No permissions were discovered for this service yet.
        {service?.sdl ? (
          <Text component="span">
            Click <strong>"Sync from schema"</strong> to generate permissions
            from the GraphQL schema automatically.
          </Text>
        ) : (
          'Once the service schema is introspected, operations will appear here automatically.'
        )}
      </Alert>
    );
  }

  return (
    <Stack spacing="sm">
      <Group position="apart" align="center">
        <div>
          <Group spacing="md" align="center">
            <div>
              <Title order={4}>Service operations</Title>
              <Group spacing="md" mt={4}>
                <Text size="xs" color="dimmed">
                  {permissions.length} total permissions
                </Text>
                <Text size="xs" color="dimmed">
                  {permissions.filter((p) => p.active).length} active
                </Text>
                <Text size="xs" color="dimmed">
                  {permissions.filter((p) => !p.active).length} inactive
                </Text>
                <Text size="xs" color="dimmed">
                  {groupedPermissions.QUERY.length} queries
                </Text>
                <Text size="xs" color="dimmed">
                  {groupedPermissions.MUTATION.length} mutations
                </Text>
                <Text size="xs" color="dimmed">
                  {groupedPermissions.SUBSCRIPTION.length} subscriptions
                </Text>
              </Group>
            </div>
            <div>
              <Switch
                label="Highlight inactive"
                size="sm"
                checked={showInactivePermissions}
                onChange={(event) =>
                  setShowInactivePermissions(event.currentTarget.checked)
                }
                labelPosition="left"
              />
              <Text size="xs" color="dimmed" mt={2}>
                Disabled permissions can be re-enabled using the toggle switches
              </Text>
            </div>
          </Group>
        </div>
        <Group spacing="sm">
          {service?.sdl && (
            <Button
              size="sm"
              variant="light"
              leftIcon={<IconCheck size={14} />}
              onClick={onSyncPermissions}
              loading={isSyncingPermissions}
            >
              Sync from schema
            </Button>
          )}
          {permissions.filter((p) => !p.active).length > 0 && (
            <Button
              size="sm"
              variant="light"
              color="green"
              onClick={handleEnableAll}
              disabled={isUpdatingPermission}
            >
              Enable All ({permissions.filter((p) => !p.active).length})
            </Button>
          )}
        </Group>
      </Group>

      <ScrollArea>
        <Table
          verticalSpacing="xs"
          horizontalSpacing="md"
          highlightOnHover
          fontSize="sm"
        >
          <thead>
            <tr>
              <th>Operation</th>
              <th>Type</th>
              <th>Access</th>
              <th>Status</th>
              {templateHeaders}
            </tr>
          </thead>
          <tbody>
            {OPERATION_ORDER.map((operationType) => {
              const typePermissions = groupedPermissions[operationType];
              if (typePermissions.length === 0) return null;

              return (
                <React.Fragment key={operationType}>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    <td colSpan={4 + templates.length}>
                      <Group spacing="xs">
                        <Badge
                          size="md"
                          color={OPERATION_COLORS[operationType]}
                          variant="filled"
                        >
                          {operationType}
                        </Badge>
                        <Text size="sm" color="dimmed" weight={500}>
                          {typePermissions.length} operation
                          {typePermissions.length !== 1 ? 's' : ''}
                        </Text>
                      </Group>
                    </td>
                  </tr>
                  {typePermissions.map((permission) => {
                    const pathSuffix =
                      permission.fieldPath && permission.fieldPath !== '*'
                        ? `.${permission.fieldPath}`
                        : '';

                    const templateCells = templates.map((template) => {
                      const templatePermissions =
                        templateState[template.id] ?? [];
                      const enabled = templatePermissions.includes(
                        permission.permissionKey
                      );
                      return (
                        <td
                          key={`${permission.id}-${template.id}`}
                          style={{ textAlign: 'center' }}
                        >
                          <Checkbox
                            size="sm"
                            checked={enabled}
                            onChange={(event) =>
                              onTemplateToggle(
                                template,
                                permission.permissionKey,
                                event.currentTarget.checked
                              )
                            }
                            disabled={!permission.active || isUpdatingTemplate}
                          />
                        </td>
                      );
                    });

                    const sdlOp = parsedSDL?.operations.find(
                      (op) =>
                        op.name === permission.operationName &&
                        op.type ===
                          (permission.operationType === 'QUERY'
                            ? 'Query'
                            : permission.operationType === 'MUTATION'
                              ? 'Mutation'
                              : 'Subscription')
                    );

                    return (
                      <tr
                        key={permission.id}
                        style={{
                          opacity:
                            !permission.active && showInactivePermissions
                              ? 0.6
                              : 1,
                        }}
                      >
                        <td>
                          <Group spacing="xs">
                            <Text
                              weight={500}
                              size="sm"
                              color={
                                !permission.active && showInactivePermissions
                                  ? 'dimmed'
                                  : undefined
                              }
                            >
                              {permission.operationName}
                            </Text>
                            {!permission.active && (
                              <Badge
                                size="xs"
                                variant={
                                  showInactivePermissions ? 'filled' : 'outline'
                                }
                                color="red"
                              >
                                Disabled
                              </Badge>
                            )}
                            {pathSuffix && (
                              <Badge size="xs" variant="outline" color="gray">
                                {pathSuffix.slice(1)}
                              </Badge>
                            )}
                            {permission.metadata?.createdManually && (
                              <Badge size="xs" variant="outline" color="blue">
                                Manual
                              </Badge>
                            )}
                            {sdlOp && (
                              <Badge size="xs" variant="outline" color="green">
                                SDL
                              </Badge>
                            )}
                          </Group>
                          {sdlOp?.description && (
                            <Text size="xs" color="dimmed" mt={2}>
                              {sdlOp.description}
                            </Text>
                          )}
                        </td>
                        <td>
                          <Badge
                            size="xs"
                            color={OPERATION_COLORS[permission.operationType]}
                            variant="light"
                          >
                            {permission.operationType}
                          </Badge>
                        </td>
                        <td style={{ minWidth: 120 }}>
                          <Select
                            size="sm"
                            data={ACCESS_OPTIONS as any}
                            value={permission.accessLevel}
                            onChange={(value) =>
                              value &&
                              onAccessLevelChange(
                                permission,
                                value as AccessLevel
                              )
                            }
                            disabled={
                              isUpdatingPermission || !permission.active
                            }
                            style={{ width: 100 }}
                          />
                        </td>
                        <td>
                          <Switch
                            size="sm"
                            checked={permission.active}
                            onChange={(event) =>
                              onPermissionToggle(
                                permission,
                                event.currentTarget.checked
                              )
                            }
                            disabled={isUpdatingPermission}
                          />
                        </td>
                        {templateCells}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
};
