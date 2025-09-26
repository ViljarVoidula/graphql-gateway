import type { BaseRecord } from '@refinedev/core';
import { useCustom, useCustomMutation, useList } from '@refinedev/core';
import React from 'react';
import {
  PermissionTemplate,
  ServicePermission,
  UserServiceRole,
  transformAccessLevel,
} from './types';

export const usePermissionData = (
  serviceId: string
): {
  permissionsQuery: any;
  templatesQuery: any;
  rolesQuery: any;
  isLoadingUsers: boolean;
  permissions: ServicePermission[];
  templates: PermissionTemplate[];
  roles: UserServiceRole[];
  permissionState: ServicePermission[];
  setPermissionState: React.Dispatch<React.SetStateAction<ServicePermission[]>>;
  templateState: Record<string, string[]>;
  setTemplateState: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
  userOptions: { value: string; label: string }[];
  templateOptions: { value: string; label: string }[];
  permissionOptions: { value: string; label: string }[];
} => {
  const permissionsQuery = useCustom<ServicePermission[]>({
    url: '',
    method: 'post',
    meta: { operation: 'servicePermissions', serviceId, includeArchived: true },
    queryOptions: {
      enabled: Boolean(serviceId),
    },
  });

  const templatesQuery = useCustom<PermissionTemplate[]>({
    url: '',
    method: 'post',
    meta: { operation: 'servicePermissionTemplates', serviceId },
    queryOptions: {
      enabled: Boolean(serviceId),
    },
  });

  const rolesQuery = useCustom<UserServiceRole[]>({
    url: '',
    method: 'post',
    meta: { operation: 'serviceUserRoles', serviceId },
    queryOptions: {
      enabled: Boolean(serviceId),
    },
  });

  const { data: usersData, isLoading: isLoadingUsers } = useList<BaseRecord>({
    resource: 'users',
    queryOptions: {
      enabled: true,
      staleTime: 60 * 1000,
    },
  });

  const permissions = (permissionsQuery.data?.data ??
    []) as ServicePermission[];
  const templates = (templatesQuery.data?.data ?? []) as PermissionTemplate[];
  const roles = (rolesQuery.data?.data ?? []) as UserServiceRole[];

  const [permissionState, setPermissionState] = React.useState<
    ServicePermission[]
  >([]);
  const [templateState, setTemplateState] = React.useState<
    Record<string, string[]>
  >({});

  React.useEffect(() => {
    // Transform access levels from backend (lowercase) to frontend (uppercase)
    const transformedPermissions = permissions.map((permission) => ({
      ...permission,
      accessLevel: transformAccessLevel(permission.accessLevel as string),
    }));
    setPermissionState(transformedPermissions as ServicePermission[]);
  }, [permissions]);

  React.useEffect(() => {
    const next: Record<string, string[]> = {};
    templates.forEach((template) => {
      next[template.id] = [...(template.permissions ?? [])];
    });
    setTemplateState(next);
  }, [templates]);

  const userOptions = React.useMemo(
    () =>
      (usersData?.data ?? []).map((user: any) => ({
        value: user.id,
        label: user.email,
      })),
    [usersData?.data]
  );

  const templateOptions = React.useMemo(
    () =>
      templates.map((template) => ({
        value: template.id,
        label: template.name,
      })),
    [templates]
  );

  const permissionOptions = React.useMemo(
    () =>
      permissionState.map((permission) => {
        const pathSuffix =
          permission.fieldPath && permission.fieldPath !== '*'
            ? `.${permission.fieldPath}`
            : '';
        return {
          value: permission.permissionKey,
          label: `${permission.operationType} • ${permission.operationName}${pathSuffix}`,
        };
      }),
    [permissionState]
  );

  return {
    // Queries
    permissionsQuery,
    templatesQuery,
    rolesQuery,
    isLoadingUsers,

    // Data
    permissions,
    templates,
    roles,
    permissionState,
    setPermissionState,
    templateState,
    setTemplateState,

    // Options
    userOptions,
    templateOptions,
    permissionOptions,
  };
};

export const usePermissionMutations = (): {
  updatePermissionMutate: any;
  updateTemplateMutate: any;
  createTemplateMutate: any;
  deleteTemplateMutate: any;
  createPermissionMutate: any;
  syncPermissionsMutate: any;
  assignRoleMutate: any;
  removeRoleMutate: any;
  isUpdatingPermission: boolean;
  isUpdatingTemplate: boolean;
  isCreatingTemplate: boolean;
  isDeletingTemplate: boolean;
  isCreatingPermission: boolean;
  isSyncingPermissions: boolean;
  isAssigningRole: boolean;
  isRemovingRole: boolean;
  busy: boolean;
} => {
  const { mutate: updatePermissionMutate, isLoading: isUpdatingPermission } =
    useCustomMutation();
  const { mutate: updateTemplateMutate, isLoading: isUpdatingTemplate } =
    useCustomMutation();
  const { mutate: createTemplateMutate, isLoading: isCreatingTemplate } =
    useCustomMutation();
  const { mutate: deleteTemplateMutate, isLoading: isDeletingTemplate } =
    useCustomMutation();
  const { mutate: createPermissionMutate, isLoading: isCreatingPermission } =
    useCustomMutation();
  const { mutate: syncPermissionsMutate, isLoading: isSyncingPermissions } =
    useCustomMutation();
  const { mutate: assignRoleMutate, isLoading: isAssigningRole } =
    useCustomMutation();
  const { mutate: removeRoleMutate, isLoading: isRemovingRole } =
    useCustomMutation();

  const busy =
    isUpdatingPermission ||
    isUpdatingTemplate ||
    isCreatingTemplate ||
    isDeletingTemplate ||
    isCreatingPermission ||
    isSyncingPermissions ||
    isAssigningRole ||
    isRemovingRole;

  return {
    updatePermissionMutate,
    updateTemplateMutate,
    createTemplateMutate,
    deleteTemplateMutate,
    createPermissionMutate,
    syncPermissionsMutate,
    assignRoleMutate,
    removeRoleMutate,

    // Loading states
    isUpdatingPermission,
    isUpdatingTemplate,
    isCreatingTemplate,
    isDeletingTemplate,
    isCreatingPermission,
    isSyncingPermissions,
    isAssigningRole,
    isRemovingRole,
    busy,
  };
};
