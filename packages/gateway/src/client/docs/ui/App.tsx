import { MDXProvider } from '@mdx-js/react';
import React, { useEffect, useMemo, useState } from 'react';
import '../styles.css';
import ThemeDebugPanel from './components/ThemeDebugPanel';
import { SchemaExplorer } from './SchemaExplorer';

interface PublishedDoc {
  id: string;
  slug: string;
  title: string;
  mdxContent: string;
  description?: string;
  category?: string;
  publishedAt: string;
  version: number;
}

const Callout: React.FC<{ type?: string; children: React.ReactNode }> = ({ type = 'info', children }) => (
  <div className={`callout callout-${type}`}>{children}</div>
);

const components = { Callout };

interface Service {
  name: string;
  status: string;
  breakingChanges24h: number;
  errorRate24h: number;
}

const useHash = () => {
  const [hash, setHash] = useState(() => {
    const rawHash = window.location.hash.replace(/^#\//, '');
    // Decode URL-encoded characters
    return decodeURIComponent(rawHash);
  });

  useEffect(() => {
    const onHash = () => {
      const rawHash = window.location.hash.replace(/^#\//, '');
      // Decode URL-encoded characters
      setHash(decodeURIComponent(rawHash));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return hash;
};

// Function to compile MDX content in the browser
const compileMDXContent = async (mdxContent: string) => {
  try {
    // Strip frontmatter if present
    let content = mdxContent;
    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        content = content.slice(endIndex + 3).trim();
      }
    }

    // Import MDX compiler dynamically
    const { evaluate } = await import('@mdx-js/mdx');
    const runtime = await import('react/jsx-runtime');

    // Compile MDX to React component
    const evaluated = await evaluate(content, runtime);

    return evaluated.default;
  } catch (error) {
    console.error('MDX compilation error:', error);
    return () =>
      React.createElement(
        'div',
        { style: { color: 'red' } },
        'Error compiling document: ' + (error instanceof Error ? error.message : String(error))
      );
  }
};

export const DocsApp: React.FC = () => {
  const [docs, setDocs] = useState<PublishedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hash = useHash();
  const active = hash || 'home';
  const [CompiledDoc, setCompiledDoc] = useState<React.ComponentType | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  // Derived service metrics for summary header
  const serviceSummary = useMemo(() => {
    if (!services || services.length === 0) {
      return { total: 0, active: 0, avgErrorPct: 0, totalBreaking: 0 };
    }
    const total = services.length;
    const active = services.filter((s) => s.status?.toLowerCase() === 'active').length;
    const totalBreaking = services.reduce((acc, s) => acc + (s.breakingChanges24h || 0), 0);
    // errorRate24h arrives as fraction (0..1). Convert to percent for display.
    const avgErrorPct = services.reduce((acc, s) => acc + (s.errorRate24h || 0) * 100, 0) / Math.max(total, 1);
    return { total, active, avgErrorPct, totalBreaking };
  }, [services]);

  const expectedTokens = useMemo(
    () => [
      'color-primary',
      'color-primary-hover',
      'color-primary-light',
      'color-secondary',
      'color-success',
      'color-warning',
      'color-error',
      'color-text-primary',
      'color-text-secondary',
      'color-text-muted',
      'color-text-inverse',
      'color-background',
      'color-background-secondary',
      'color-background-tertiary',
      'color-background-code',
      'color-border',
      'color-border-light',
      'color-border-dark',
      'font-family-sans',
      'font-family-mono',
      'font-size-xs',
      'font-size-sm',
      'font-size-base',
      'font-size-lg',
      'font-size-xl',
      'font-size-2xl',
      'font-size-3xl',
      'font-weight-normal',
      'font-weight-medium',
      'font-weight-semibold',
      'font-weight-bold',
      'line-height-tight',
      'line-height-normal',
      'line-height-relaxed',
      'spacing-xs',
      'spacing-sm',
      'spacing-md',
      'spacing-lg',
      'spacing-xl',
      'spacing-2xl',
      'spacing-3xl',
      'border-radius-sm',
      'border-radius-md',
      'border-radius-lg',
      'border-radius-xl',
      'border-radius-full',
      'shadow-sm',
      'shadow-md',
      'shadow-lg',
      'shadow-xl',
      'max-width-prose',
      'max-width-container',
      'sidebar-width',
      'header-height',
      'transition-fast',
      'transition-normal',
      'transition-slow'
    ],
    []
  );

  // Debug logging for active document
  useEffect(() => {
    console.log('Active hash:', active);
    console.log('Looking for document with slug:', active);
    console.log(
      'Available docs:',
      docs.map((d) => ({ slug: d.slug, title: d.title }))
    );
  }, [active, docs]);

  // Fetch published documents
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: `
              query PublishedDocs {
                publishedDocs {
                  id
                  slug
                  title
                  mdxContent
                  description
                  category
                  publishedAt
                  version
                }
              }
            `
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        setDocs(result.data.publishedDocs || []);

        // Debug logging
        console.log('Loaded published docs:', result.data.publishedDocs);
        console.log(
          'Document slugs:',
          result.data.publishedDocs?.map((d: PublishedDoc) => d.slug)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load documents');
        console.error('Error fetching docs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocs();
  }, []);

  // Fetch services and health data
  useEffect(() => {
    const fetchServices = async () => {
      try {
        setServicesLoading(true);
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query ServiceHealth {
                serviceHealth {
                  name
                  status
                  breakingChanges24h
                  errorRate24h
                }
              }
            `
          })
        });
        const result = await response.json();
        if (result.errors) throw new Error(result.errors[0].message);
        setServices(result.data.serviceHealth || []);
      } catch (err) {
        setServicesError(err instanceof Error ? err.message : 'Failed to load services');
      } finally {
        setServicesLoading(false);
      }
    };
    fetchServices();
  }, []);

  // Compile the active document
  useEffect(() => {
    if (active === 'schema' || active === 'home') {
      setCompiledDoc(null);
      return;
    }

    const doc = docs.find((d) => d.slug === active);
    if (!doc) {
      setCompiledDoc(null);
      return;
    }

    const compileDoc = async () => {
      setDocLoading(true);
      setDocError(null);

      try {
        const compiled = await compileMDXContent(doc.mdxContent);
        setCompiledDoc(() => compiled);
      } catch (err) {
        setDocError(err instanceof Error ? err.message : 'Failed to compile document');
      } finally {
        setDocLoading(false);
      }
    };

    compileDoc();
  }, [active, docs]);

  const filteredDocs = useMemo(
    () =>
      docs.filter((d) =>
        [d.title, d.description, d.slug, d.category].some((f) => f && f.toLowerCase().includes(search.toLowerCase()))
      ),
    [docs, search]
  );

  // Group docs by category
  const docsByCategory = useMemo(() => {
    const grouped = filteredDocs.reduce(
      (acc, doc) => {
        const category = doc.category || 'Other';
        if (!acc[category]) acc[category] = [];
        acc[category].push(doc);
        return acc;
      },
      {} as Record<string, PublishedDoc[]>
    );

    // Sort categories and docs within categories
    return Object.keys(grouped)
      .sort()
      .reduce(
        (acc, category) => {
          acc[category] = grouped[category].sort((a, b) => a.title.localeCompare(b.title));
          return acc;
        },
        {} as Record<string, PublishedDoc[]>
      );
  }, [filteredDocs]);

  // Listen for theme updates and refresh CSS
  useEffect(() => {
    const loadOrCreateLink = (): HTMLLinkElement => {
      let existing = document.querySelector('link[href*="/docs-theme.css"]') as HTMLLinkElement;
      if (!existing) {
        existing = document.createElement('link');
        existing.rel = 'stylesheet';
        existing.type = 'text/css';
        document.head.appendChild(existing);
      }
      return existing;
    };

    const refresh = (reason: string) => {
      const link = loadOrCreateLink();
      // Cache bust with timestamp. Reason only for debugging.
      const ts = Date.now();
      link.href = `/docs-theme.css?t=${ts}`;
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[theme] refreshed', { reason, ts });
      }
    };

    // Initial load
    refresh('initial');

    // Visibility change: reload when user returns to tab to pick up new tokens saved while away
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh('visibilitychange');
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Periodic passive refresh (60s) to guarantee eventual consistency without manual reload
    const intervalId = setInterval(() => refresh('interval'), 60000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(intervalId);
    };
  }, []);

  const renderContent = () => {
    if (active === 'schema') {
      return <SchemaExplorer />;
    }

    if (active === 'home' || !active) {
      const recentDocs = docs.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()).slice(0, 5);

      return (
        <div
          className="doc-article"
          style={{
            maxWidth: 'min(1200px, 95vw)',
            margin: '0 auto',
            padding: '0 clamp(1rem, 4vw, 2rem)'
          }}
        >
          <header style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 6vw, 3rem)' }}>
            <h1
              style={{
                fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
                marginBottom: '0.5rem',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text'
              }}
            >
              🚀 Welcome to the Documentation Portal
            </h1>
            <p
              style={{
                fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
                color: 'var(--color-text-secondary)',
                maxWidth: '600px',
                margin: '0 auto',
                lineHeight: '1.6'
              }}
            >
              Explore our comprehensive guides and API documentation. Stay updated with the latest!
            </p>
          </header>

          {loading && (
            <div
              style={{
                textAlign: 'center',
                padding: 'clamp(2rem, 5vw, 3rem)',
                color: 'var(--color-text-secondary)'
              }}
            >
              Loading documents...
            </div>
          )}
          {error && (
            <div
              style={{
                color: 'var(--color-error)',
                padding: 'clamp(1rem, 3vw, 1.5rem)',
                background: 'var(--color-error)10',
                borderRadius: 'var(--border-radius-md)',
                border: '1px solid var(--color-error)30',
                marginBottom: 'clamp(1.5rem, 4vw, 2rem)'
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Recent Documents */}
          {!loading && !error && docs.length > 0 && (
            <section style={{ marginBottom: '2rem' }}>
              <h2>📚 Recent Documents</h2>
              <ul>
                {recentDocs.map((doc) => (
                  <li key={doc.id} style={{ marginBottom: '0.5rem' }}>
                    <a href={`#/${doc.slug}`} style={{ color: 'var(--color-primary)' }}>
                      {doc.title}
                    </a>
                    {doc.description && (
                      <span style={{ marginLeft: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                        - {doc.description}
                      </span>
                    )}
                    <span style={{ marginLeft: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {new Date(doc.publishedAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Services Health */}
          <section style={{ marginBottom: '2rem' }}>
            <h2>⚡ Gateway Services Health</h2>
            {servicesLoading ? (
              <p>Loading services...</p>
            ) : servicesError ? (
              <div style={{ color: 'red', padding: '1rem', background: '#ffeaea', borderRadius: '4px' }}>
                <strong>Error:</strong> {servicesError}
              </div>
            ) : services.length > 0 ? (
              <>
                {/* Summary header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem',
                    margin: '0 0 1rem 0'
                  }}
                >
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--border-radius-md)',
                      background: 'var(--color-background-secondary)'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Active Services</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {serviceSummary.active} / {serviceSummary.total}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--border-radius-md)',
                      background: 'var(--color-background-secondary)'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Avg Error Rate (24h)</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {serviceSummary.avgErrorPct < 0.01 && serviceSummary.avgErrorPct > 0
                        ? '<0.01'
                        : serviceSummary.avgErrorPct.toFixed(2)}
                      %
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--border-radius-md)',
                      background: 'var(--color-background-secondary)'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Breaking Changes (24h)</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{serviceSummary.totalBreaking}</div>
                  </div>
                </div>

                {/* Legend */}
                <div
                  style={{
                    display: 'flex',
                    gap: '1rem',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.8rem',
                    flexWrap: 'wrap'
                  }}
                >
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--color-success)',
                        marginRight: 6
                      }}
                    />{' '}
                    Healthy (&lt;1%)
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--color-warning)',
                        marginRight: 6
                      }}
                    />{' '}
                    Warning (1–5%)
                  </span>
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: 'var(--color-error)',
                        marginRight: 6
                      }}
                    />{' '}
                    Critical (&gt;5%)
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                  {services.map((service) => {
                    const getStatusColor = (status: string) => {
                      switch (status.toLowerCase()) {
                        case 'active':
                          return 'var(--color-success)';
                        case 'maintenance':
                          return 'var(--color-warning)';
                        case 'inactive':
                          return 'var(--color-error)';
                        default:
                          return 'var(--color-text-muted)';
                      }
                    };

                    const getStatusIcon = (status: string) => {
                      switch (status.toLowerCase()) {
                        case 'active':
                          return '🟢';
                        case 'maintenance':
                          return '🟡';
                        case 'inactive':
                          return '🔴';
                        default:
                          return '⚪';
                      }
                    };

                    const formatStatus = (status: string) => {
                      return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
                    };

                    // Convert fraction to percent for display and thresholds
                    const errorRatePct = Math.max(0, (service.errorRate24h || 0) * 100);
                    const getErrorColorByPct = (pct: number) =>
                      pct > 5 ? 'var(--color-error)' : pct > 1 ? 'var(--color-warning)' : 'var(--color-success)';

                    return (
                      <div
                        key={service.name}
                        style={{
                          padding: '1.5rem',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--border-radius-lg)',
                          background: 'var(--color-background-secondary)',
                          boxShadow: 'var(--shadow-sm)',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: getStatusColor(service.status),
                              marginRight: '0.75rem',
                              boxShadow: '0 0 8px rgba(0,0,0,0.2)'
                            }}
                          ></div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>{service.name}</h3>
                        </div>

                        {service.status.toLowerCase() === 'maintenance' && (
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '0.5rem 1rem',
                              backgroundColor: getStatusColor(service.status) + '20',
                              border: `1px solid ${getStatusColor(service.status)}40`,
                              borderRadius: 'var(--border-radius-full)',
                              fontSize: '0.9rem',
                              fontWeight: '500'
                            }}
                          >
                            <span style={{ marginRight: '0.5rem' }}>{getStatusIcon(service.status)}</span>
                            <span style={{ color: getStatusColor(service.status) }}>{formatStatus(service.status)}</span>
                          </div>
                        )}

                        <div
                          style={{
                            marginTop: '1rem',
                            padding: '0.75rem',
                            backgroundColor: 'var(--color-background)',
                            borderRadius: 'var(--border-radius-md)',
                            fontSize: '0.85rem',
                            color: 'var(--color-text-secondary)'
                          }}
                        >
                          {service.breakingChanges24h > 0 && (
                            <div
                              style={{
                                marginBottom: '0.5rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.35rem 0.6rem',
                                backgroundColor: 'var(--color-error)20',
                                border: `1px solid var(--color-error)40`,
                                borderRadius: '999px',
                                fontSize: '0.8rem',
                                color: 'var(--color-error)',
                                fontWeight: 500
                              }}
                            >
                              ⚠️ {service.breakingChanges24h} breaking change{service.breakingChanges24h > 1 ? 's' : ''}
                            </div>
                          )}

                          {/* Error rate mini progress */}
                          <div>
                            <div
                              style={{
                                height: 8,
                                borderRadius: 6,
                                background: 'var(--color-border)'
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  width: `${Math.max(1, Math.min(100, errorRatePct))}%`,
                                  borderRadius: 6,
                                  background: getErrorColorByPct(errorRatePct),
                                  transition: 'width var(--transition-normal)'
                                }}
                              />
                            </div>
                            <div
                              style={{
                                marginTop: 6,
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                color: getErrorColorByPct(errorRatePct),
                                fontWeight: 500
                              }}
                            >
                              {errorRatePct > 5 ? '🔴' : errorRatePct > 1 ? '🟡' : '🟢'}{' '}
                              {errorRatePct < 0.01 && errorRatePct > 0 ? '<0.01' : errorRatePct.toFixed(2)}% error rate (24h)
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  background: 'var(--color-background-secondary)',
                  borderRadius: 'var(--border-radius-lg)',
                  border: '2px dashed var(--color-border)'
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔍</div>
                <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>No services available</p>
              </div>
            )}
          </section>

          {!loading && !error && docs.length === 0 && (
            <div style={{ padding: '1rem', background: '#f0f8ff', borderRadius: '4px' }}>
              <p>No published documents found. Documents will appear here once they are published from the admin interface.</p>
            </div>
          )}

          {!loading && docs.length > 0 && (
            <section>
              <h2>📖 All Documents ({docs.length})</h2>
              {Object.entries(docsByCategory).map(([category, categoryDocs]) => (
                <div key={category} style={{ marginBottom: '2rem' }}>
                  <h3 style={{ color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)' }}>{category}</h3>
                  <ul>
                    {categoryDocs.map((doc) => (
                      <li key={doc.id} style={{ marginBottom: '0.5rem' }}>
                        <a href={`#/${doc.slug}`} style={{ color: 'var(--color-primary)' }}>
                          {doc.title}
                        </a>
                        {doc.description && (
                          <span style={{ marginLeft: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                            - {doc.description}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </div>
      );
    }

    // Show specific document
    if (docLoading) {
      return (
        <div className="doc-article">
          <p>Loading document...</p>
        </div>
      );
    }

    if (docError) {
      return (
        <div className="doc-article">
          <div style={{ color: 'red', padding: '1rem', background: '#ffeaea', borderRadius: '4px' }}>
            <strong>Error:</strong> {docError}
          </div>
        </div>
      );
    }

    const currentDoc = docs.find((d) => d.slug === active);
    if (!currentDoc) {
      return (
        <div className="doc-article">
          <h1>Document Not Found</h1>
          <p>The document "{active}" could not be found.</p>
          <a href="#/home">← Back to home</a>
        </div>
      );
    }

    return (
      <article className="doc-article">
        {CompiledDoc && <CompiledDoc />}
        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--color-border)',
            fontSize: '0.9rem',
            color: 'var(--color-text-secondary)'
          }}
        >
          <p>
            Last updated: {new Date(currentDoc.publishedAt).toLocaleDateString()}| Version: {currentDoc.version}
          </p>
        </div>
      </article>
    );
  };

  return (
    <MDXProvider components={components as any}>
      <div className="docs-shell">
        <button
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            zIndex: 9998,
            background: '#1e293b',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 6,
            border: 'none',
            fontSize: 12,
            cursor: 'pointer',
            opacity: 0.7
          }}
          onClick={() => setShowDebug((s) => !s)}
          title="Toggle Theme Debug Panel"
        >
          {showDebug ? 'Close Theme Debug' : 'Theme Debug'}
        </button>
        <ThemeDebugPanel open={showDebug} onClose={() => setShowDebug(false)} expected={expectedTokens} />
        <aside className="docs-nav">
          <div className="nav-header">
            <h1>
              <a href="#/home" style={{ textDecoration: 'none', color: 'inherit' }}>
                Docs
              </a>
            </h1>
          </div>
          <ul>
            <li className={active === 'home' ? 'active' : ''}>
              <a href="#/home">Home</a>
            </li>
            <li className={active === 'schema' ? 'active' : ''}>
              <a href="#/schema">Schema</a>
            </li>
            {Object.entries(docsByCategory).map(([category, categoryDocs]) => (
              <li key={category}>
                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    color: 'var(--color-text-secondary)',
                    padding: '0.5rem 0',
                    borderTop: '1px solid var(--color-border)',
                    marginTop: '0.5rem'
                  }}
                >
                  {category}
                </div>
                <ul style={{ marginLeft: '1rem' }}>
                  {categoryDocs.map((doc) => (
                    <li key={doc.slug} className={doc.slug === active ? 'active' : ''}>
                      <a href={`#/${doc.slug}`} title={doc.description}>
                        {doc.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </aside>
        <main className="docs-content">{renderContent()}</main>
      </div>
    </MDXProvider>
  );
};
