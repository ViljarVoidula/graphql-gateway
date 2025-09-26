import {
  DocumentNode,
  GraphQLError,
  Kind,
  OperationDefinitionNode,
} from 'graphql';
import { Plugin } from 'graphql-yoga';
import { Container } from 'typedi';
import { ExtendedYogaContext } from '../auth/auth.types';
import { dataSource } from '../db/datasource';
import {
  PermissionAccessLevel,
  PermissionOperationType,
} from '../entities/service-permission.entity';
import { Service } from '../entities/service.entity';
import { getLocalServiceId } from '../services/permissions/permission.constants';
import { PermissionService } from '../services/permissions/permission.service';
import { log } from '../utils/logger';

export function createPermissionGuardPlugin(): Plugin {
  return {
    async onExecute({ args }) {
      const context = args.contextValue as ExtendedYogaContext;
      const permissionService = Container.get(PermissionService);

      const operation = getOperationDefinition(
        args.document,
        args.operationName
      );
      if (!operation) return;

      if (isIntrospectionOperation(operation)) {
        return;
      }

      const requiredAccessLevel = mapOperationToAccessLevel(operation);
      const operationType = mapOperationToOperationType(operation);
      const fieldNames = collectRootFieldNames(operation);

      if (!fieldNames.length) return;

      for (const fieldName of fieldNames) {
        if (fieldName.startsWith('__')) continue;

        const serviceIds = permissionService.getServiceIdsForOperation(
          operationType,
          fieldName
        );
        if (!serviceIds.length) {
          log.debug('No registered permissions for root field', {
            operation: 'permissionGuard.skip',
            metadata: { fieldName, operationType },
          });
          continue;
        }

        const serviceId = resolveServiceId(serviceIds, context);
        const localServiceId = getLocalServiceId();
        if (!serviceId || (localServiceId && serviceId === localServiceId)) {
          continue;
        }

        // Check if permission checks are enabled for this service
        let enforce = false;
        try {
          const repo = dataSource.getRepository(Service);
          const svc = await repo.findOne({ where: { id: serviceId } });
          enforce = !!svc?.enablePermissionChecks;
        } catch {}

        if (!enforce) {
          log.debug('Skipping permission guard (service not opted-in)', {
            operation: 'permissionGuard.skipDisabled',
            metadata: { serviceId, fieldName, operationType },
          });
          continue;
        }

        const allowed = await permissionService.hasPermission({
          userId: context.user?.id ?? null,
          basePermissions: context.user?.permissions ?? [],
          serviceId,
          operationType,
          operationName: fieldName,
          fieldPath: '*',
          requiredAccess: requiredAccessLevel,
          allowApiKeyFallback: context.authType === 'api-key',
          applicationWhitelistedServices:
            context.application?.whitelistedServices?.map((svc) => svc.id),
        });

        if (!allowed) {
          throw new GraphQLError(
            'Forbidden: insufficient permissions for operation',
            {
              extensions: {
                code: 'FORBIDDEN',
                serviceId,
                operationType,
                operationName: fieldName,
              },
            }
          );
        }
      }
    },
  };
}

function getOperationDefinition(
  document: DocumentNode,
  operationName?: string | null
): OperationDefinitionNode | null {
  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
    if (!operationName && definition.operation === 'query') {
      return definition;
    }
    if (definition.name?.value === operationName) {
      return definition;
    }
  }
  return null;
}

function isIntrospectionOperation(operation: OperationDefinitionNode): boolean {
  return operation.selectionSet.selections.every((selection) => {
    if (selection.kind !== Kind.FIELD) return false;
    return selection.name.value.startsWith('__');
  });
}

function collectRootFieldNames(operation: OperationDefinitionNode): string[] {
  const names: string[] = [];
  for (const selection of operation.selectionSet.selections) {
    switch (selection.kind) {
      case Kind.FIELD:
        names.push(selection.name.value);
        break;
      case Kind.INLINE_FRAGMENT:
        for (const child of selection.selectionSet.selections) {
          if (child.kind === Kind.FIELD) {
            names.push(child.name.value);
          }
        }
        break;
      default:
        break;
    }
  }
  return names;
}

function mapOperationToOperationType(
  operation: OperationDefinitionNode
): PermissionOperationType {
  switch (operation.operation) {
    case 'mutation':
      return PermissionOperationType.MUTATION;
    case 'subscription':
      return PermissionOperationType.SUBSCRIPTION;
    case 'query':
    default:
      return PermissionOperationType.QUERY;
  }
}

function mapOperationToAccessLevel(
  operation: OperationDefinitionNode
): PermissionAccessLevel {
  switch (operation.operation) {
    case 'mutation':
      return PermissionAccessLevel.WRITE;
    case 'subscription':
      return PermissionAccessLevel.SUBSCRIBE;
    case 'query':
    default:
      return PermissionAccessLevel.READ;
  }
}

function resolveServiceId(
  serviceIds: string[],
  context: ExtendedYogaContext
): string | null {
  if (serviceIds.length === 1) {
    return serviceIds[0];
  }

  if (context.application?.whitelistedServices?.length) {
    const preferred = serviceIds.find((id) =>
      context.application!.whitelistedServices!.some((svc) => svc.id === id)
    );
    if (preferred) {
      return preferred;
    }
  }

  return serviceIds[0] ?? null;
}
