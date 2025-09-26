import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  LoadingOverlay,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { useOne } from '@refinedev/core';
import { IconAlertCircle, IconCheck, IconPlus } from '@tabler/icons-react';
import React from 'react';

import {
  getFieldPathOptions,
  getOperationSuggestions,
  parseSDL,
  type ParsedSDL,
} from '../../../../utils/sdl-parser';

// Import types and utilities
import {
  AccessLevel,
  OperationType,
  PermissionTemplate,
  ServicePermission,
  UserServiceRole,
} from './types';

// Import hooks
import { usePermissionData, usePermissionMutations } from './hooks';

// Import components
import { PermissionModal } from './PermissionModal';
import { PermissionTable } from './PermissionTable';
import { RoleTemplatesTable } from './RoleTemplatesTable';
import { TemplateModal } from './TemplateModal';
import { UserRoleModal } from './UserRoleModal';
import { UserRolesTable } from './UserRolesTable';

interface PermissionManagementProps {
  serviceId: string;
  serviceName: string;
}

export const PermissionManagement: React.FC<PermissionManagementProps> = ({
  serviceId,
  serviceName,
}) => {
  // Fetch service data for SDL
  const { data: serviceData } = useOne({
    resource: 'services',
    id: serviceId,
    queryOptions: {
      enabled: Boolean(serviceId),
    },
  });

  const service = serviceData?.data;
  const [parsedSDL, setParsedSDL] = React.useState<ParsedSDL | null>(null);

  // Parse SDL when service data is available
  React.useEffect(() => {
    if (service?.sdl) {
      const parsed = parseSDL(service.sdl);
      setParsedSDL(parsed);
    } else {
      setParsedSDL(null);
    }
  }, [service?.sdl]);

  // Use custom hooks for data and mutations
  const {
    permissionsQuery,
    templatesQuery,
    rolesQuery,
    isLoadingUsers,
    permissions,
    templates,
    roles,
    permissionState,
    setPermissionState,
    templateState,
    setTemplateState,
    userOptions,
    templateOptions,
    permissionOptions,
  } = usePermissionData(serviceId);

  const {
    updatePermissionMutate,
    updateTemplateMutate,
    createTemplateMutate,
    deleteTemplateMutate,
    createPermissionMutate,
    syncPermissionsMutate,
    assignRoleMutate,
    removeRoleMutate,
    isUpdatingPermission,
    isUpdatingTemplate,
    isCreatingTemplate,
    isDeletingTemplate,
    isCreatingPermission,
    isSyncingPermissions,
    isAssigningRole,
    isRemovingRole,
    busy,
  } = usePermissionMutations();

  // Modal states
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [templateModalOpen, setTemplateModalOpen] = React.useState(false);
  const [permissionModalOpen, setPermissionModalOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<UserServiceRole | null>(
    null
  );
  const [editingTemplate, setEditingTemplate] =
    React.useState<PermissionTemplate | null>(null);
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(
    null
  );
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<
    string | null
  >(null);
  const [customPermissions, setCustomPermissions] = React.useState<string[]>(
    []
  );
  const [displayName, setDisplayName] = React.useState('');

  // Template form state
  const [templateName, setTemplateName] = React.useState('');
  const [templateRoleKey, setTemplateRoleKey] = React.useState('');
  const [templateDescription, setTemplateDescription] = React.useState('');
  const [templateTags, setTemplateTags] = React.useState<string[]>([]);
  const [templatePermissions, setTemplatePermissions] = React.useState<
    string[]
  >([]);

  // Permission form state
  const [permissionOperationType, setPermissionOperationType] =
    React.useState<OperationType>('QUERY');
  const [permissionOperationName, setPermissionOperationName] =
    React.useState('');
  const [permissionFieldPath, setPermissionFieldPath] = React.useState('');
  const [permissionAccessLevel, setPermissionAccessLevel] =
    React.useState<AccessLevel>('READ');

  // Dynamic options based on SDL
  const operationOptions = React.useMemo(() => {
    if (!parsedSDL) return [];
    const sdlOperationType =
      permissionOperationType === 'QUERY'
        ? 'Query'
        : permissionOperationType === 'MUTATION'
          ? 'Mutation'
          : 'Subscription';
    return getOperationSuggestions(parsedSDL.operations, sdlOperationType);
  }, [parsedSDL, permissionOperationType]);

  const fieldPathOptions = React.useMemo(() => {
    if (!parsedSDL || !permissionOperationName) {
      return [
        {
          value: '*',
          label: 'Full operation (*)',
          description: 'Complete access to the operation',
        },
      ];
    }
    return getFieldPathOptions(parsedSDL.operations, permissionOperationName);
  }, [parsedSDL, permissionOperationName]);

  // Reset operation name when type changes
  React.useEffect(() => {
    setPermissionOperationName('');
    setPermissionFieldPath('*');
  }, [permissionOperationType]);

  // Reset field path when operation changes
  React.useEffect(() => {
    setPermissionFieldPath('*');
  }, [permissionOperationName]);

  const totalBusy =
    permissionsQuery.isLoading ||
    templatesQuery.isLoading ||
    rolesQuery.isLoading ||
    permissionsQuery.isFetching ||
    templatesQuery.isFetching ||
    rolesQuery.isFetching ||
    busy;

  // Modal management functions
  const resetModalState = () => {
    setEditingRole(null);
    setEditingTemplate(null);
    setSelectedUserId(null);
    setSelectedTemplateId(null);
    setCustomPermissions([]);
    setDisplayName('');
  };

  const resetTemplateModalState = () => {
    setEditingTemplate(null);
    setTemplateName('');
    setTemplateRoleKey('');
    setTemplateDescription('');
    setTemplateTags([]);
    setTemplatePermissions([]);
  };

  const resetPermissionModalState = () => {
    setPermissionOperationType('QUERY');
    setPermissionOperationName('');
    setPermissionFieldPath('*');
    setPermissionAccessLevel('READ');
  };

  const openCreateModal = () => {
    resetModalState();
    setRoleModalOpen(true);
  };

  const openTemplateModal = (template?: PermissionTemplate) => {
    resetTemplateModalState();
    if (template) {
      setEditingTemplate(template);
      setTemplateName(template.name);
      setTemplateRoleKey(template.roleKey);
      setTemplateDescription(template.description ?? '');
      setTemplateTags(template.tags ?? []);
      setTemplatePermissions(template.permissions ?? []);
    }
    setTemplateModalOpen(true);
  };

  const openPermissionModal = () => {
    resetPermissionModalState();
    setPermissionModalOpen(true);
  };

  const handleEditRole = (role: UserServiceRole) => {
    setEditingRole(role);
    setSelectedUserId(role.user.id);
    setSelectedTemplateId(role.template?.id ?? null);
    setCustomPermissions(role.permissions ?? []);
    setDisplayName(role.displayName ?? role.roleKey);
    setRoleModalOpen(true);
  };

  // Permission handlers
  const handlePermissionToggle = (
    permission: ServicePermission,
    nextActive: boolean
  ) => {
    // Optimistic update
    setPermissionState((prev) =>
      prev.map((item) =>
        item.id === permission.id ? { ...item, active: nextActive } : item
      )
    );

    updatePermissionMutate(
      {
        method: 'post',
        url: '',
        values: {
          permissionId: permission.id,
          input: { active: nextActive },
        },
        meta: { operation: 'updateServicePermission' },
      },
      {
        onError: (error: any) => {
          // Revert optimistic update on error
          setPermissionState((prev) =>
            prev.map((item) =>
              item.id === permission.id
                ? { ...item, active: permission.active }
                : item
            )
          );
          showNotification({
            title: 'Failed to update permission',
            message: error?.message ?? 'Unable to update permission state',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
        onSuccess: () => {
          showNotification({
            title: `Permission ${nextActive ? 'enabled' : 'disabled'}`,
            message: `${permission.operationName} has been ${nextActive ? 'enabled' : 'disabled'}`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          permissionsQuery.refetch();
        },
      }
    );
  };

  const handleAccessLevelChange = (
    permission: ServicePermission,
    accessLevel: AccessLevel
  ) => {
    const previousAccessLevel = permission.accessLevel;

    // Optimistic update
    setPermissionState((prev) =>
      prev.map((item) =>
        item.id === permission.id ? { ...item, accessLevel } : item
      )
    );

    updatePermissionMutate(
      {
        method: 'post',
        url: '',
        values: {
          permissionId: permission.id,
          input: { accessLevel },
        },
        meta: { operation: 'updateServicePermission' },
      },
      {
        onError: (error: any) => {
          // Revert optimistic update on error
          setPermissionState((prev) =>
            prev.map((item) =>
              item.id === permission.id
                ? { ...item, accessLevel: previousAccessLevel }
                : item
            )
          );
          showNotification({
            title: 'Failed to update access level',
            message:
              error?.message ?? 'Unable to update permission access level',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
        onSuccess: () => {
          showNotification({
            title: 'Access level updated',
            message: `${permission.operationName} access changed to ${accessLevel}`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          permissionsQuery.refetch();
        },
      }
    );
  };

  const handleTemplateToggle = (
    template: PermissionTemplate,
    permissionKey: string,
    enabled: boolean
  ) => {
    const previous = templateState[template.id] ?? [];
    const updatedSet = new Set(previous);
    if (enabled) {
      updatedSet.add(permissionKey);
    } else {
      updatedSet.delete(permissionKey);
    }
    const next = Array.from(updatedSet);
    setTemplateState((prev) => ({ ...prev, [template.id]: next }));

    updateTemplateMutate(
      {
        method: 'post',
        url: '',
        values: {
          templateId: template.id,
          permissions: next,
        },
        meta: { operation: 'setPermissionTemplatePermissions' },
      },
      {
        onError: (error: any) => {
          setTemplateState((prev) => ({ ...prev, [template.id]: previous }));
          showNotification({
            title: 'Failed to update template',
            message: error?.message ?? 'Unable to update template permissions',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
        onSuccess: () => {
          templatesQuery.refetch();
          showNotification({
            title: 'Template Updated',
            message: `${template.name} template updated successfully`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        },
      }
    );
  };

  const handleSyncPermissions = () => {
    if (!service?.sdl) {
      showNotification({
        title: 'No schema available',
        message: 'This service does not have an SDL schema to sync from.',
        color: 'orange',
        icon: <IconAlertCircle size={16} />,
      });
      return;
    }

    syncPermissionsMutate(
      {
        method: 'post',
        url: '',
        values: { serviceId, sdl: service.sdl },
        meta: { operation: 'syncServicePermissions' },
      },
      {
        onSuccess: () => {
          showNotification({
            title: 'Permissions synced',
            message:
              'Service permissions have been synchronized from the schema.',
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          permissionsQuery.refetch();
          templatesQuery.refetch();
        },
        onError: (error: any) => {
          showNotification({
            title: 'Failed to sync permissions',
            message:
              error?.message ??
              'Unable to synchronize permissions from schema.',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
      }
    );
  };

  // Role handlers
  const handleRoleSubmit = () => {
    const userId = editingRole ? editingRole.user.id : selectedUserId;
    if (!userId) {
      showNotification({
        title: 'User required',
        message: 'Please select a user to assign permissions to.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
      return;
    }

    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      showNotification({
        title: 'Template required',
        message: 'Select a role template before saving.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
      return;
    }

    const payload = {
      roleId: editingRole?.id,
      userId,
      serviceId,
      roleKey: template.roleKey,
      templateId: template.id,
      permissions: Array.from(new Set(customPermissions)),
      displayName: displayName.trim() ? displayName.trim() : undefined,
    };

    assignRoleMutate(
      {
        method: 'post',
        url: '',
        values: payload,
        meta: { operation: 'assignUserServiceRole' },
      },
      {
        onSuccess: () => {
          showNotification({
            title: 'Role saved',
            message: 'Service role assignment updated successfully.',
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          setRoleModalOpen(false);
          resetModalState();
          rolesQuery.refetch();
          permissionsQuery.refetch();
        },
        onError: (error: any) => {
          showNotification({
            title: 'Failed to save role',
            message:
              error?.message ?? 'Unable to save service role assignment.',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
      }
    );
  };

  const handleRemoveRole = (role: UserServiceRole) => {
    if (!window.confirm(`Remove permissions for ${role.user.email}?`)) {
      return;
    }

    removeRoleMutate(
      {
        method: 'post',
        url: '',
        values: {
          roleId: role.id,
        },
        meta: { operation: 'removeUserServiceRole' },
      },
      {
        onSuccess: () => {
          showNotification({
            title: 'Role removed',
            message: 'User service role removed successfully.',
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          rolesQuery.refetch();
          permissionsQuery.refetch();
        },
        onError: (error: any) => {
          showNotification({
            title: 'Failed to remove role',
            message: error?.message ?? 'Unable to remove user service role.',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
      }
    );
  };

  // Template handlers
  const handleTemplateSubmit = () => {
    if (!templateName.trim() || !templateRoleKey.trim()) {
      showNotification({
        title: 'Required fields missing',
        message: 'Template name and role key are required.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
      return;
    }

    const payload = {
      templateId: editingTemplate?.id,
      serviceId,
      name: templateName.trim(),
      roleKey: templateRoleKey.trim(),
      description: templateDescription.trim() || undefined,
      tags: templateTags.length > 0 ? templateTags : undefined,
      permissions: templatePermissions,
    };

    const operation = editingTemplate
      ? 'updatePermissionTemplate'
      : 'createPermissionTemplate';

    createTemplateMutate(
      {
        method: 'post',
        url: '',
        values: payload,
        meta: { operation },
      },
      {
        onSuccess: () => {
          showNotification({
            title: editingTemplate ? 'Template updated' : 'Template created',
            message: `${templateName} ${editingTemplate ? 'updated' : 'created'} successfully.`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          setTemplateModalOpen(false);
          resetTemplateModalState();
          templatesQuery.refetch();
        },
        onError: (error: any) => {
          showNotification({
            title: `Failed to ${editingTemplate ? 'update' : 'create'} template`,
            message:
              error?.message ??
              `Unable to ${editingTemplate ? 'update' : 'create'} template.`,
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
      }
    );
  };

  const handlePermissionSubmit = () => {
    if (!permissionOperationName.trim()) {
      showNotification({
        title: 'Operation name required',
        message: 'Please enter an operation name.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
      return;
    }

    const payload = {
      serviceId,
      operationType: permissionOperationType,
      operationName: permissionOperationName.trim(),
      fieldPath: permissionFieldPath.trim() || undefined,
      accessLevel: permissionAccessLevel,
      active: true,
    };

    createPermissionMutate(
      {
        method: 'post',
        url: '',
        values: payload,
        meta: { operation: 'createServicePermission' },
      },
      {
        onSuccess: () => {
          showNotification({
            title: 'Permission created',
            message: `${permissionOperationName} permission created successfully.`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          setPermissionModalOpen(false);
          resetPermissionModalState();
          permissionsQuery.refetch();
        },
        onError: (error: any) => {
          showNotification({
            title: 'Failed to create permission',
            message: error?.message ?? 'Unable to create permission.',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
      }
    );
  };

  const handleDeleteTemplate = (template: PermissionTemplate) => {
    if (
      !window.confirm(
        `Delete template "${template.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    deleteTemplateMutate(
      {
        method: 'post',
        url: '',
        values: { templateId: template.id },
        meta: { operation: 'deletePermissionTemplate' },
      },
      {
        onSuccess: () => {
          showNotification({
            title: 'Template deleted',
            message: `${template.name} deleted successfully.`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          templatesQuery.refetch();
          rolesQuery.refetch(); // Refresh roles as they might reference this template
        },
        onError: (error: any) => {
          showNotification({
            title: 'Failed to delete template',
            message: error?.message ?? 'Unable to delete template.',
            color: 'red',
            icon: <IconAlertCircle size={16} />,
          });
        },
      }
    );
  };

  return (
    <Card
      shadow="xs"
      p="xl"
      radius="lg"
      withBorder
      style={{ backgroundColor: 'white' }}
    >
      <LoadingOverlay visible={totalBusy} />
      <Stack spacing="xl">
        <Group position="apart" align="center">
          <div>
            <Title order={3}>Permission Management</Title>
            <Text size="sm" color="dimmed">
              Control operation access, default role templates, and user
              assignments for {serviceName}.
            </Text>
            {parsedSDL && (
              <Text size="xs" color="green" weight={500} mt={4}>
                📋 Schema available: {parsedSDL.operations.length} operations,{' '}
                {parsedSDL.types.length} types
              </Text>
            )}
            {service?.sdl && !parsedSDL && (
              <Text size="xs" color="orange" weight={500} mt={4}>
                ⚠️ Schema parsing failed - using manual mode
              </Text>
            )}
            {!service?.sdl && (
              <Stack spacing={4} mt={4}>
                <Text size="xs" color="gray" weight={500}>
                  📝 No schema available - manual permission creation only
                </Text>
                <Text size="xs" color="dimmed">
                  SDL schema will be fetched automatically when the gateway
                  loads this service. Try refreshing the page or manually sync
                  once the service is active.
                </Text>
              </Stack>
            )}
          </div>
          <Group spacing="sm">
            <Button
              variant="light"
              leftIcon={<IconPlus size={16} />}
              onClick={openPermissionModal}
            >
              Add permission
            </Button>
            <Button
              variant="light"
              leftIcon={<IconPlus size={16} />}
              onClick={() => openTemplateModal()}
            >
              Create template
            </Button>
            <Button leftIcon={<IconPlus size={16} />} onClick={openCreateModal}>
              Assign user role
            </Button>
          </Group>
        </Group>

        {/* Permission Table */}
        <PermissionTable
          serviceId={serviceId}
          serviceName={serviceName}
          permissions={permissionState}
          templates={templates}
          templateState={templateState}
          parsedSDL={parsedSDL}
          service={service}
          onPermissionToggle={handlePermissionToggle}
          onAccessLevelChange={handleAccessLevelChange}
          onTemplateToggle={handleTemplateToggle}
          onSyncPermissions={handleSyncPermissions}
          isUpdatingPermission={isUpdatingPermission}
          isUpdatingTemplate={isUpdatingTemplate}
          isSyncingPermissions={isSyncingPermissions}
        />

        <Divider my="md" />

        {/* Role Templates Table */}
        <RoleTemplatesTable
          templates={templates}
          onEditTemplate={openTemplateModal}
          onDeleteTemplate={handleDeleteTemplate}
          onCreateTemplate={() => openTemplateModal()}
          isDeletingTemplate={isDeletingTemplate}
        />

        <Divider my="md" />

        {/* User Roles Table */}
        <UserRolesTable
          roles={roles}
          onEditRole={handleEditRole}
          onRemoveRole={handleRemoveRole}
          isRemovingRole={isRemovingRole}
        />

        {/* Debug Information for Admins */}
        {process.env.NODE_ENV === 'development' && (
          <>
            <Divider my="md" />
            <Stack spacing="sm">
              <Title order={5} color="dimmed">
                Debug Information
              </Title>
              <Group spacing="md">
                <Badge color={service?.sdl ? 'green' : 'red'} variant="light">
                  SDL: {service?.sdl ? 'Available' : 'Not Available'}
                </Badge>
                <Badge color={parsedSDL ? 'green' : 'red'} variant="light">
                  Parsing: {parsedSDL ? 'Success' : 'Failed/Empty'}
                </Badge>
                <Badge
                  color={permissions.length > 0 ? 'green' : 'orange'}
                  variant="light"
                >
                  Permissions: {permissions.length}
                </Badge>
              </Group>
              {service?.sdl && (
                <details
                  style={{
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    background: '#f8f9fa',
                    padding: '8px',
                    borderRadius: '4px',
                  }}
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                    View SDL Schema ({service.sdl.length} characters)
                  </summary>
                  <pre
                    style={{
                      margin: '8px 0',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '200px',
                      overflow: 'auto',
                    }}
                  >
                    {service.sdl}
                  </pre>
                </details>
              )}
            </Stack>
          </>
        )}
      </Stack>

      {/* Modals */}
      <UserRoleModal
        opened={roleModalOpen}
        onClose={() => {
          setRoleModalOpen(false);
          resetModalState();
        }}
        editingRole={editingRole}
        selectedUserId={selectedUserId}
        setSelectedUserId={setSelectedUserId}
        selectedTemplateId={selectedTemplateId}
        setSelectedTemplateId={setSelectedTemplateId}
        customPermissions={customPermissions}
        setCustomPermissions={setCustomPermissions}
        displayName={displayName}
        setDisplayName={setDisplayName}
        userOptions={userOptions}
        templateOptions={templateOptions}
        permissionOptions={permissionOptions}
        templates={templates}
        serviceName={serviceName}
        onSubmit={handleRoleSubmit}
        isLoading={isAssigningRole}
        isLoadingUsers={isLoadingUsers}
      />

      <TemplateModal
        opened={templateModalOpen}
        onClose={() => {
          setTemplateModalOpen(false);
          resetTemplateModalState();
        }}
        editingTemplate={editingTemplate}
        templateName={templateName}
        setTemplateName={setTemplateName}
        templateRoleKey={templateRoleKey}
        setTemplateRoleKey={setTemplateRoleKey}
        templateDescription={templateDescription}
        setTemplateDescription={setTemplateDescription}
        templateTags={templateTags}
        setTemplateTags={setTemplateTags}
        templatePermissions={templatePermissions}
        setTemplatePermissions={setTemplatePermissions}
        permissionOptions={permissionOptions}
        parsedSDL={parsedSDL}
        onSubmit={handleTemplateSubmit}
        isLoading={isCreatingTemplate}
      />

      <PermissionModal
        opened={permissionModalOpen}
        onClose={() => {
          setPermissionModalOpen(false);
          resetPermissionModalState();
        }}
        permissionOperationType={permissionOperationType}
        setPermissionOperationType={setPermissionOperationType}
        permissionOperationName={permissionOperationName}
        setPermissionOperationName={setPermissionOperationName}
        permissionFieldPath={permissionFieldPath}
        setPermissionFieldPath={setPermissionFieldPath}
        permissionAccessLevel={permissionAccessLevel}
        setPermissionAccessLevel={setPermissionAccessLevel}
        parsedSDL={parsedSDL}
        operationOptions={operationOptions}
        fieldPathOptions={fieldPathOptions}
        onSubmit={handlePermissionSubmit}
        isLoading={isCreatingPermission}
      />
    </Card>
  );
};
