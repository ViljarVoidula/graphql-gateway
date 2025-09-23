import { AnimatePresence, motion } from 'framer-motion';
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
      <motion.div className="schema-explorer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            background: 'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
            borderRadius: '20px',
            border: '1px solid var(--color-border)',
            textAlign: 'center'
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <motion.div
            style={{
              width: '60px',
              height: '60px',
              border: '4px solid var(--color-border)',
              borderTop: '4px solid var(--color-primary)',
              borderRadius: '50%',
              marginBottom: '1.5rem'
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <h2
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              marginBottom: '0.5rem',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: '700'
            }}
          >
            🔍 Schema Explorer
          </h2>
          <p className="text-muted" style={{ fontSize: '1.1rem', margin: 0 }}>
            Loading schema...
          </p>
        </motion.div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div className="schema-explorer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <motion.div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
            borderRadius: '20px',
            border: '1px solid rgba(239, 68, 68, 0.3)'
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            style={{ fontSize: '4rem', marginBottom: '1rem' }}
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            🚨
          </motion.div>
          <h2
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              marginBottom: '1rem',
              color: 'var(--color-error)',
              fontWeight: '700'
            }}
          >
            Schema Explorer
          </h2>
          <div
            className="alert alert-error"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '2rem'
            }}
          >
            <strong>Error loading schema:</strong> {error}
          </div>
          <motion.button
            className="btn btn-primary"
            style={{
              background: 'var(--color-primary)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 2rem',
              borderRadius: '12px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            whileHover={{ scale: 1.05, boxShadow: '0 8px 25px rgba(59, 130, 246, 0.25)' }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.reload()}
          >
            🔄 Retry
          </motion.button>
        </motion.div>
      </motion.div>
    );
  }

  if (!schema) {
    return (
      <motion.div className="schema-explorer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <motion.div
          style={{
            padding: '3rem',
            textAlign: 'center',
            background: 'var(--color-background-secondary)',
            borderRadius: '20px',
            border: '2px dashed var(--color-border)'
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <h2>Schema Explorer</h2>
          <p>No schema data available</p>
        </motion.div>
      </motion.div>
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
    <motion.div className="schema-explorer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <motion.div
        className="schema-explorer__header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <motion.h2
          style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.5rem)',
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary), #8b5cf6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            fontWeight: '800',
            textAlign: 'center'
          }}
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          🔍 GraphQL Schema Explorer
        </motion.h2>
        <motion.p
          className="schema-explorer__subtitle"
          style={{
            textAlign: 'center',
            fontSize: '1.1rem',
            marginBottom: '2rem'
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          Live introspection of the GraphQL API schema
        </motion.p>

        <motion.div
          className="schema-explorer__filter"
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '2rem'
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <motion.input
            placeholder="🔍 Filter types and fields..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%',
              maxWidth: '500px',
              padding: '1rem 1.5rem',
              border: '2px solid var(--color-border)',
              borderRadius: '25px',
              background: 'var(--color-background-secondary)',
              fontSize: '1rem',
              color: 'var(--color-text-primary)',
              outline: 'none',
              transition: 'all 0.3s ease'
            }}
            whileFocus={{
              borderColor: 'var(--color-primary)',
              boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.1)',
              scale: 1.02
            }}
          />
        </motion.div>

        <motion.div
          className="schema-card"
          style={{
            background: 'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
            borderRadius: '16px',
            padding: '2rem',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
            textAlign: 'center'
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          whileHover={{ scale: 1.01, boxShadow: '0 12px 40px rgba(0, 0, 0, 0.15)' }}
        >
          <h3
            className="schema-card__title"
            style={{
              fontSize: '1.3rem',
              marginBottom: '1rem',
              color: 'var(--color-primary)',
              fontWeight: '700'
            }}
          >
            🎯 Schema Overview
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem'
            }}
          >
            {[
              { label: 'Query', value: schema.queryType?.name || 'None', icon: '🔍' },
              { label: 'Mutation', value: schema.mutationType?.name || 'None', icon: '✏️' },
              { label: 'Subscription', value: schema.subscriptionType?.name || 'None', icon: '📡' }
            ].map((item, index) => (
              <motion.div
                key={item.label}
                style={{
                  padding: '1rem',
                  background: 'var(--color-background)',
                  borderRadius: '12px',
                  border: '1px solid var(--color-border)'
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                whileHover={{ scale: 1.05 }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{item.icon}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                  {item.label}
                </div>
                <div style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>{item.value}</div>
              </motion.div>
            ))}
          </div>
          <motion.p
            className="text-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.3 }}
          >
            <strong>Total Types:</strong> {filteredTypes.length} (filtered from {userTypes.length})
          </motion.p>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {Object.keys(typesByKind).length === 0 ? (
          <motion.div
            style={{
              padding: '3rem',
              textAlign: 'center',
              background: 'var(--color-background-secondary)',
              borderRadius: '16px',
              border: '2px dashed var(--color-border)',
              marginTop: '2rem'
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4 }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
            <p style={{ fontSize: '1.1rem', margin: 0 }}>No types found matching "{filter}"</p>
          </motion.div>
        ) : (
          Object.entries(typesByKind).map(([kind, types], kindIndex) => (
            <motion.div
              key={kind}
              className="schema-kind"
              style={{ marginTop: '2rem' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 + kindIndex * 0.1, duration: 0.5 }}
            >
              <motion.h3
                className="schema-kind__header"
                style={{
                  fontSize: '1.5rem',
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  color: 'white',
                  borderRadius: '12px',
                  textAlign: 'center',
                  fontWeight: '700'
                }}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                {kind}s ({types.length})
              </motion.h3>

              <motion.div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                  gap: '1rem'
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 + kindIndex * 0.1, duration: 0.4 }}
              >
                {types.map((type, typeIndex) => (
                  <motion.div
                    key={type.name}
                    style={{
                      background: 'var(--color-background-secondary)',
                      borderRadius: '16px',
                      border: '1px solid var(--color-border)',
                      overflow: 'hidden',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2 + kindIndex * 0.1 + typeIndex * 0.05, duration: 0.3 }}
                    whileHover={{
                      scale: 1.02,
                      boxShadow: '0 8px 30px rgba(59, 130, 246, 0.15)'
                    }}
                  >
                    <details>
                      <motion.summary
                        style={{
                          padding: '1.5rem',
                          cursor: 'pointer',
                          background: 'var(--color-background-secondary)',
                          borderBottom: '1px solid var(--color-border)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          fontSize: '1.1rem'
                        }}
                        whileHover={{ background: 'var(--color-background-tertiary)' }}
                      >
                        <strong style={{ color: 'var(--color-primary)', fontWeight: '700' }}>{type.name}</strong>
                        <motion.em
                          style={{
                            background: 'var(--color-primary)',
                            color: 'white',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontStyle: 'normal',
                            fontWeight: '600'
                          }}
                          whileHover={{ scale: 1.1 }}
                        >
                          {type.kind}
                        </motion.em>
                        {type.description && (
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', flex: 1 }}>
                            - {type.description}
                          </span>
                        )}
                      </motion.summary>

                      <motion.div
                        style={{ padding: '1.5rem', background: 'var(--color-background)' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {type.fields && type.fields.length > 0 && (
                          <div className="schema-section" style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ color: 'var(--color-primary)', marginBottom: '1rem', fontSize: '1.1rem' }}>
                              📄 Fields:
                            </h4>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                              {type.fields.map((field) => (
                                <motion.div
                                  key={field.name}
                                  style={{
                                    padding: '1rem',
                                    background: 'var(--color-background-secondary)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)'
                                  }}
                                  whileHover={{ scale: 1.01, background: 'var(--color-background-tertiary)' }}
                                >
                                  <code
                                    style={{
                                      fontSize: '0.9rem',
                                      fontWeight: '600',
                                      color: 'var(--color-primary)'
                                    }}
                                  >
                                    {field.name}: {formatType(field.type)}
                                  </code>
                                  {field.description && (
                                    <div
                                      style={{
                                        marginTop: '0.5rem',
                                        fontSize: '0.85rem',
                                        color: 'var(--color-text-secondary)'
                                      }}
                                    >
                                      {field.description}
                                    </div>
                                  )}
                                  {field.args && field.args.length > 0 && (
                                    <div
                                      style={{
                                        marginTop: '0.5rem',
                                        fontSize: '0.8rem',
                                        color: 'var(--color-text-muted)',
                                        padding: '0.5rem',
                                        background: 'var(--color-background)',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      <strong>Args:</strong>{' '}
                                      {field.args.map((arg) => `${arg.name}: ${formatType(arg.type)}`).join(', ')}
                                    </div>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )}

                        {type.enumValues && type.enumValues.length > 0 && (
                          <div className="schema-section" style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ color: 'var(--color-primary)', marginBottom: '1rem', fontSize: '1.1rem' }}>
                              🏷️ Values:
                            </h4>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                              {type.enumValues.map((value) => (
                                <motion.div
                                  key={value.name}
                                  style={{
                                    padding: '0.75rem',
                                    background: 'var(--color-background-secondary)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)'
                                  }}
                                  whileHover={{ scale: 1.01 }}
                                >
                                  <code style={{ fontWeight: '600', color: 'var(--color-primary)' }}>{value.name}</code>
                                  {value.description && (
                                    <span
                                      style={{
                                        marginLeft: '1rem',
                                        fontSize: '0.85rem',
                                        color: 'var(--color-text-secondary)'
                                      }}
                                    >
                                      - {value.description}
                                    </span>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )}

                        {type.inputFields && type.inputFields.length > 0 && (
                          <div className="schema-section">
                            <h4 style={{ color: 'var(--color-primary)', marginBottom: '1rem', fontSize: '1.1rem' }}>
                              ⌨️ Input Fields:
                            </h4>
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                              {type.inputFields.map((field) => (
                                <motion.div
                                  key={field.name}
                                  style={{
                                    padding: '1rem',
                                    background: 'var(--color-background-secondary)',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border)'
                                  }}
                                  whileHover={{ scale: 1.01 }}
                                >
                                  <code
                                    style={{
                                      fontSize: '0.9rem',
                                      fontWeight: '600',
                                      color: 'var(--color-primary)'
                                    }}
                                  >
                                    {field.name}: {formatType(field.type)}
                                  </code>
                                  {field.description && (
                                    <div
                                      style={{
                                        marginTop: '0.5rem',
                                        fontSize: '0.85rem',
                                        color: 'var(--color-text-secondary)'
                                      }}
                                    >
                                      {field.description}
                                    </div>
                                  )}
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </details>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </motion.div>
  );
};
