import React, { useEffect, useState } from 'react';

interface IntrospectionType {
  kind: string;
  name: string;
  description?: string;
  fields?: { name: string; description?: string; args: any[]; type: any }[];
  enumValues?: { name: string; description?: string }[];
  inputFields?: { name: string; description?: string; type: any }[];
}

interface IntrospectionSchema {
  queryType: { name: string };
  mutationType?: { name: string };
  subscriptionType?: { name: string };
  types: IntrospectionType[];
}

const introspectionQuery = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          args {
            name
            description
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
        enumValues(includeDeprecated: true) {
          name
          description
        }
        inputFields {
          name
          description
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
`;

const formatType = (type: any): string => {
  if (!type) return 'Unknown';

  if (type.kind === 'NON_NULL') {
    return `${formatType(type.ofType)}!`;
  }

  if (type.kind === 'LIST') {
    return `[${formatType(type.ofType)}]`;
  }

  return type.name || type.kind;
};

export const SchemaExplorer: React.FC = () => {
  const [schema, setSchema] = useState<IntrospectionSchema | null>(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchema = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: introspectionQuery
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        setSchema(result.data.__schema);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch schema');
        console.error('Schema introspection error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSchema();
  }, []);

  if (loading) {
    return (
      <div className="schema-explorer">
        <h2>Schema Explorer</h2>
        <p className="text-muted">Loading schema...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="schema-explorer">
        <h2>Schema Explorer</h2>
        <div className="alert alert-error">
          <strong>Error loading schema:</strong> {error}
        </div>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="schema-explorer">
        <h2>Schema Explorer</h2>
        <p>No schema data available</p>
      </div>
    );
  }

  // Filter out built-in GraphQL types
  const userTypes = schema.types.filter(
    (t) => !t.name.startsWith('__') && !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(t.name)
  );

  const filteredTypes = userTypes.filter(
    (t) =>
      t.name.toLowerCase().includes(filter.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(filter.toLowerCase()))
  );

  const typesByKind = filteredTypes.reduce(
    (acc, type) => {
      if (!acc[type.kind]) acc[type.kind] = [];
      acc[type.kind].push(type);
      return acc;
    },
    {} as Record<string, IntrospectionType[]>
  );

  return (
    <div className="schema-explorer">
      <div className="schema-explorer__header">
        <h2>GraphQL Schema Explorer</h2>
        <p className="schema-explorer__subtitle">Live introspection of the GraphQL API schema</p>

        <div className="schema-explorer__filter">
          <input placeholder="Filter types and fields..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>

        <div className="schema-card">
          <h3 className="schema-card__title">Schema Overview</h3>
          <p className="text-muted">
            <strong>Query:</strong> {schema.queryType?.name || 'None'} |<strong> Mutation:</strong>{' '}
            {schema.mutationType?.name || 'None'} |<strong> Subscription:</strong> {schema.subscriptionType?.name || 'None'}
          </p>
          <p className="text-muted">
            <strong>Total Types:</strong> {filteredTypes.length} (filtered from {userTypes.length})
          </p>
        </div>
      </div>

      {Object.keys(typesByKind).length === 0 ? (
        <p>No types found matching "{filter}"</p>
      ) : (
        Object.entries(typesByKind).map(([kind, types]) => (
          <div key={kind} className="schema-kind">
            <h3 className="schema-kind__header">
              {kind}s ({types.length})
            </h3>

            <ul className="schema-type-list">
              {types.map((type) => (
                <li key={type.name}>
                  <details>
                    <summary>
                      <strong>{type.name}</strong>
                      <em>{type.kind}</em>
                      {type.description && <span className="text-muted">- {type.description}</span>}
                    </summary>

                    <div>
                      {type.fields && type.fields.length > 0 && (
                        <div className="schema-section">
                          <h4>Fields:</h4>
                          <ul>
                            {type.fields.map((field) => (
                              <li key={field.name}>
                                <code>
                                  {field.name}: {formatType(field.type)}
                                </code>
                                {field.description && <span>- {field.description}</span>}
                                {field.args && field.args.length > 0 && (
                                  <div className="schema-field-args">
                                    Args: {field.args.map((arg) => `${arg.name}: ${formatType(arg.type)}`).join(', ')}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {type.enumValues && type.enumValues.length > 0 && (
                        <div className="schema-section">
                          <h4>Values:</h4>
                          <ul>
                            {type.enumValues.map((value) => (
                              <li key={value.name}>
                                <code>{value.name}</code>
                                {value.description && <span>- {value.description}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {type.inputFields && type.inputFields.length > 0 && (
                        <div className="schema-section">
                          <h4>Input Fields:</h4>
                          <ul>
                            {type.inputFields.map((field) => (
                              <li key={field.name}>
                                <code>
                                  {field.name}: {formatType(field.type)}
                                </code>
                                {field.description && <span>- {field.description}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
};
