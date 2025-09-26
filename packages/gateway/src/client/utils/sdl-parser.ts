import {
  buildSchema,
  GraphQLField,
  GraphQLObjectType,
  GraphQLType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
} from 'graphql';

export interface FieldInfo {
  name: string;
  type: string;
  path: string;
  description?: string;
}

export interface OperationInfo {
  name: string;
  type: 'Query' | 'Mutation' | 'Subscription';
  description?: string;
  fields: FieldInfo[];
}

export interface ParsedSDL {
  operations: OperationInfo[];
  types: string[];
}

/**
 * Parse GraphQL SDL and extract operation and field information
 */
export function parseSDL(sdl: string): ParsedSDL | null {
  try {
    const schema = buildSchema(sdl);
    const operations: OperationInfo[] = [];
    const types = new Set<string>();

    // Extract Query operations
    const queryType = schema.getQueryType();
    if (queryType) {
      operations.push(...extractOperationsFromType(queryType, 'Query'));
      extractTypesFromType(queryType, types);
    }

    // Extract Mutation operations
    const mutationType = schema.getMutationType();
    if (mutationType) {
      operations.push(...extractOperationsFromType(mutationType, 'Mutation'));
      extractTypesFromType(mutationType, types);
    }

    // Extract Subscription operations
    const subscriptionType = schema.getSubscriptionType();
    if (subscriptionType) {
      operations.push(
        ...extractOperationsFromType(subscriptionType, 'Subscription')
      );
      extractTypesFromType(subscriptionType, types);
    }

    return {
      operations,
      types: Array.from(types).sort(),
    };
  } catch (error) {
    console.warn('Failed to parse SDL:', error);
    return null;
  }
}

function extractOperationsFromType(
  type: GraphQLObjectType,
  operationType: 'Query' | 'Mutation' | 'Subscription'
): OperationInfo[] {
  const operations: OperationInfo[] = [];
  const fields = type.getFields();

  for (const [fieldName, field] of Object.entries(fields)) {
    const operationFields = extractFieldsFromType(field.type, fieldName);

    operations.push({
      name: fieldName,
      type: operationType,
      description: field.description || undefined,
      fields: operationFields,
    });
  }

  return operations;
}

function extractFieldsFromType(
  type: GraphQLType,
  basePath: string,
  visited = new Set<string>()
): FieldInfo[] {
  const fields: FieldInfo[] = [];

  // Add root field
  fields.push({
    name: '*',
    type: getTypeName(type),
    path: '*',
    description: 'Full operation access',
  });

  // Unwrap NonNull and List types to get to the actual type
  let actualType = type;
  if (isNonNullType(actualType)) {
    actualType = actualType.ofType;
  }
  if (isListType(actualType)) {
    actualType = actualType.ofType;
  }
  if (isNonNullType(actualType)) {
    actualType = actualType.ofType;
  }

  // Only traverse object types to avoid infinite recursion on scalars
  if (isObjectType(actualType)) {
    const typeName = actualType.name;

    // Prevent infinite recursion
    if (visited.has(typeName)) {
      return fields;
    }
    visited.add(typeName);

    const objectFields = actualType.getFields();

    for (const [fieldName, field] of Object.entries(objectFields)) {
      const fieldPath =
        basePath === '*' ? fieldName : `${basePath}.${fieldName}`;

      fields.push({
        name: fieldName,
        type: getTypeName(field.type),
        path: fieldPath,
        description: field.description || undefined,
      });

      // Recursively get nested fields (limit depth to prevent excessive nesting)
      if (basePath.split('.').length < 3) {
        const nestedFields = extractFieldsFromType(
          field.type,
          fieldPath,
          new Set(visited)
        );
        fields.push(...nestedFields.filter((f) => f.path !== '*')); // Skip duplicate root entries
      }
    }
  }

  return fields;
}

function extractTypesFromType(type: GraphQLObjectType, types: Set<string>) {
  const fields = type.getFields();

  for (const field of Object.values(fields)) {
    collectTypesFromField(field, types);
  }
}

function collectTypesFromField(
  field: GraphQLField<any, any>,
  types: Set<string>
) {
  const typeName = getTypeName(field.type);
  if (typeName && !isScalarType(field.type)) {
    types.add(typeName);
  }
}

function getTypeName(type: GraphQLType): string {
  if (isNonNullType(type)) {
    return getTypeName(type.ofType) + '!';
  }
  if (isListType(type)) {
    return `[${getTypeName(type.ofType)}]`;
  }
  return type.name;
}

/**
 * Generate field path options for a specific operation
 */
export function getFieldPathOptions(
  operations: OperationInfo[],
  operationName: string
): Array<{ value: string; label: string; description?: string }> {
  const operation = operations.find((op) => op.name === operationName);
  if (!operation) {
    return [
      {
        value: '*',
        label: 'Full operation (*)',
        description: 'Complete access to the operation',
      },
    ];
  }

  return operation.fields.map((field) => ({
    value: field.path,
    label: field.path === '*' ? 'Full operation (*)' : field.path,
    description: field.description || `${field.type} field`,
  }));
}

/**
 * Get operation suggestions based on SDL
 */
export function getOperationSuggestions(
  operations: OperationInfo[],
  operationType: 'Query' | 'Mutation' | 'Subscription'
): Array<{ value: string; label: string; description?: string }> {
  return operations
    .filter((op) => op.type === operationType)
    .map((op) => ({
      value: op.name,
      label: op.name,
      description: op.description,
    }));
}
