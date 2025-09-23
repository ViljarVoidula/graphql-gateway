import { MDXProvider } from '@mdx-js/react';
import { motion } from 'framer-motion';
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
  // Public docs branding (whitelabel)
  const [brandName, setBrandName] = useState<string>('Gateway Docs');
  const [heroTitle, setHeroTitle] = useState<string>('Welcome to the Documentation Portal');
  const [heroSubtitle, setHeroSubtitle] = useState<string>(
    'Explore our comprehensive guides and API documentation. Stay updated with the latest!'
  );
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [brandIconUrl, setBrandIconUrl] = useState<string | null>(null);
  // GraphQL Voyager availability
  const [voyagerEnabled, setVoyagerEnabled] = useState<boolean>(false);
  const [voyagerLoading, setVoyagerLoading] = useState<boolean>(true);
  // GraphQL Playground availability
  const [playgroundEnabled, setPlaygroundEnabled] = useState<boolean>(false);
  const [playgroundLoading, setPlaygroundLoading] = useState<boolean>(true);

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

  // Fetch public branding (no auth required)
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { docsBranding { brandName heroTitle heroSubtitle } }`
          })
        });
        const result = await response.json();
        const b = result?.data?.docsBranding;
        if (b) {
          if (typeof b.brandName === 'string' && b.brandName.trim()) setBrandName(b.brandName.trim());
          if (typeof b.heroTitle === 'string' && b.heroTitle.trim()) setHeroTitle(b.heroTitle.trim());
          if (typeof b.heroSubtitle === 'string' && b.heroSubtitle.trim()) setHeroSubtitle(b.heroSubtitle.trim());
        }
        // Load branding assets (best-effort)
        try {
          const res2 = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: `query { docsBrandingAssets { heroImageUrl faviconUrl brandIconUrl } }` })
          });
          const j2 = await res2.json();
          const a = j2?.data?.docsBrandingAssets;
          if (a?.heroImageUrl) setHeroImageUrl(a.heroImageUrl);
          if (a?.brandIconUrl) setBrandIconUrl(a.brandIconUrl);
          // favicon handled by HTML injection at gateway level
        } catch {}
      } catch (err) {
        // best-effort; ignore errors
        if (process.env.NODE_ENV !== 'production') console.debug('Branding load failed', err);
      }
    };
    fetchBranding();
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

  // Check if GraphQL Voyager is enabled (best-effort, no auth required)
  useEffect(() => {
    const checkVoyagerAvailability = async () => {
      try {
        setVoyagerLoading(true);
        // Try to fetch the setting - this might fail if not authenticated
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { settings { graphqlVoyagerEnabled } }`
          })
        });
        const result = await response.json();
        if (result?.data?.settings?.graphqlVoyagerEnabled === true) {
          setVoyagerEnabled(true);
        }
      } catch (err) {
        // If we can't check the setting, try a direct request to voyager endpoint
        try {
          const voyagerResponse = await fetch('/voyager', { method: 'HEAD' });
          if (voyagerResponse.ok || voyagerResponse.status === 200) {
            setVoyagerEnabled(true);
          }
        } catch {
          // Voyager not available
          setVoyagerEnabled(false);
        }
      } finally {
        setVoyagerLoading(false);
      }
    };
    checkVoyagerAvailability();
  }, []);

  // Check if GraphQL Playground is enabled (best-effort, no auth required)
  useEffect(() => {
    const checkPlaygroundAvailability = async () => {
      try {
        setPlaygroundLoading(true);
        // Try to fetch the setting - this might fail if not authenticated
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { settings { graphqlPlaygroundEnabled } }`
          })
        });
        const result = await response.json();
        if (result?.data?.settings?.graphqlPlaygroundEnabled === true) {
          setPlaygroundEnabled(true);
        }
      } catch (err) {
        // If we can't check the setting, try a direct request to playground endpoint
        try {
          const playgroundResponse = await fetch('/playground', { method: 'HEAD' });
          if (playgroundResponse.ok || playgroundResponse.status === 200) {
            setPlaygroundEnabled(true);
          }
        } catch {
          // Playground not available
          setPlaygroundEnabled(false);
        }
      } finally {
        setPlaygroundLoading(false);
      }
    };
    checkPlaygroundAvailability();
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

  // Listen for theme updates and refresh CSS + favicon
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

    const updateFavicon = async () => {
      try {
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `query { docsBrandingAssets { faviconUrl } }` })
        });
        const result = await response.json();
        const faviconUrl = result?.data?.docsBrandingAssets?.faviconUrl;

        if (faviconUrl) {
          // Remove existing favicon links
          const existingFavicons = document.querySelectorAll('link[rel*="icon"]');
          existingFavicons.forEach((link) => link.remove());

          // Add new favicon
          const faviconLink = document.createElement('link');
          faviconLink.rel = 'icon';
          faviconLink.href = faviconUrl;
          document.head.appendChild(faviconLink);
        }
      } catch (error) {
        // Ignore favicon update errors in docs UI
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[favicon] update failed', error);
        }
      }
    };

    const refresh = (reason: string) => {
      const link = loadOrCreateLink();
      // Cache bust with timestamp. Reason only for debugging.
      const ts = Date.now();
      link.href = `/docs-theme.css?t=${ts}`;

      // Also refresh favicon
      updateFavicon();

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

    if (active === 'voyager') {
      if (!voyagerEnabled) {
        return (
          <div className="doc-article">
            <h1>GraphQL Voyager Not Available</h1>
            <p>GraphQL Voyager is currently disabled or not available.</p>
            <a href="#/home">← Back to home</a>
          </div>
        );
      }

      return (
        <div className="doc-article" style={{ padding: 0, height: '100vh', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 2rem',
              background: 'var(--color-background-secondary)',
              borderBottom: '1px solid var(--color-border)',
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--color-text-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🗺️ GraphQL Schema Voyager</div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                onClick={() => window.open('/voyager', '_blank')}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                }}
              >
                Open in New Tab ↗
              </button>
              <a
                href="#/home"
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
              >
                ← Back to Docs
              </a>
            </div>
          </div>
          <iframe
            src="/voyager"
            style={{
              width: '100%',
              height: 'calc(100vh - 80px)',
              border: 'none',
              display: 'block'
            }}
            title="GraphQL Voyager"
          />
        </div>
      );
    }

    if (active === 'playground') {
      if (!playgroundEnabled) {
        return (
          <div className="doc-article">
            <h1>GraphQL Playground Not Available</h1>
            <p>GraphQL Playground is currently disabled or not available.</p>
            <a href="#/home">← Back to home</a>
          </div>
        );
      }

      return (
        <div className="doc-article" style={{ padding: 0, height: '100vh', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 2rem',
              background: 'var(--color-background-secondary)',
              borderBottom: '1px solid var(--color-border)',
              fontSize: '1rem',
              fontWeight: '600',
              color: 'var(--color-text-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🎮 GraphQL Playground</div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                onClick={() => window.open('/playground', '_blank')}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                }}
              >
                Open in New Tab ↗
              </button>
              <a
                href="#/home"
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--color-background)',
                  color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
              >
                ← Back to Docs
              </a>
            </div>
          </div>
          <iframe
            src="/playground"
            style={{
              width: '100%',
              height: 'calc(100vh - 80px)',
              border: 'none',
              display: 'block'
            }}
            title="GraphQL Playground"
          />
        </div>
      );
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
          <motion.header
            style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 6vw, 3rem)' }}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <motion.div
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary), #8b5cf6)',
                borderRadius: '24px',
                padding: 'clamp(2rem, 5vw, 3rem)',
                marginBottom: '2rem',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 20px 40px rgba(59, 130, 246, 0.15)'
              }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3 }}
            >
              {heroImageUrl && (
                <img
                  src={heroImageUrl}
                  alt="Hero"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: 0.2,
                    pointerEvents: 'none'
                  }}
                />
              )}
              <motion.div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)',
                  borderRadius: '24px'
                }}
                animate={{
                  x: [-100, 100],
                  opacity: [0, 0.5, 0]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  repeatType: 'loop',
                  ease: 'linear'
                }}
              />
              <motion.h1
                style={{
                  fontSize: 'clamp(1.8rem, 5vw, 3rem)',
                  marginBottom: '1rem',
                  color: 'white',
                  fontWeight: '800',
                  letterSpacing: '-0.02em',
                  position: 'relative',
                  zIndex: 1
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                🚀 {heroTitle}
              </motion.h1>
              <motion.p
                style={{
                  fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
                  color: 'rgba(255, 255, 255, 0.9)',
                  maxWidth: '600px',
                  margin: '0 auto',
                  lineHeight: '1.6',
                  position: 'relative',
                  zIndex: 1
                }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                {heroSubtitle}
              </motion.p>
            </motion.div>
          </motion.header>

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
            <motion.section
              style={{ marginBottom: '3rem' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <motion.h2
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                  marginBottom: '1.5rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <span style={{ fontSize: 'inherit' }}>📚</span>
                <span
                  style={{
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  Recent Documents
                </span>
              </motion.h2>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '1.5rem'
                }}
              >
                {recentDocs.map((doc, index) => (
                  <motion.div
                    key={doc.id}
                    style={{
                      background:
                        'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      border: '1px solid var(--color-border)',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
                    whileHover={{
                      scale: 1.02,
                      boxShadow: '0 8px 30px rgba(59, 130, 246, 0.15)'
                    }}
                    onClick={() => (window.location.hash = `#/${doc.slug}`)}
                  >
                    <motion.div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: '-100%',
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.1), transparent)'
                      }}
                      whileHover={{ left: '100%' }}
                      transition={{ duration: 0.6 }}
                    />
                    <h3
                      style={{
                        margin: '0 0 0.5rem 0',
                        color: 'var(--color-primary)',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        position: 'relative',
                        zIndex: 1
                      }}
                    >
                      {doc.title}
                    </h3>
                    {doc.description && (
                      <p
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: '0.9rem',
                          margin: '0 0 1rem 0',
                          lineHeight: '1.5',
                          position: 'relative',
                          zIndex: 1
                        }}
                      >
                        {doc.description}
                      </p>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                        color: 'var(--color-text-muted)',
                        position: 'relative',
                        zIndex: 1
                      }}
                    >
                      <span>{new Date(doc.publishedAt).toLocaleDateString()}</span>
                      <motion.span
                        style={{
                          background: 'var(--color-primary)',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '8px',
                          fontSize: '0.7rem',
                          fontWeight: '500'
                        }}
                        whileHover={{ scale: 1.1 }}
                        transition={{ duration: 0.2 }}
                      >
                        Read →
                      </motion.span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Services Health */}
          <motion.section
            style={{ marginBottom: '3rem' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <motion.h2
              style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                marginBottom: '1.5rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <span style={{ fontSize: 'inherit' }}>⚡</span>
              <span
                style={{
                  background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                Gateway Services Health
              </span>
            </motion.h2>
            {servicesLoading ? (
              <motion.div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '3rem',
                  background: 'var(--color-background-secondary)',
                  borderRadius: '16px',
                  border: '1px solid var(--color-border)'
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '4px solid var(--color-border)',
                    borderTop: '4px solid var(--color-primary)',
                    borderRadius: '50%'
                  }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <span style={{ marginLeft: '1rem', color: 'var(--color-text-secondary)' }}>Loading services...</span>
              </motion.div>
            ) : servicesError ? (
              <motion.div
                style={{
                  color: 'var(--color-error)',
                  padding: '2rem',
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))',
                  borderRadius: '16px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  textAlign: 'center'
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🚨</div>
                <strong>Error:</strong> {servicesError}
              </motion.div>
            ) : services.length > 0 ? (
              <>
                {/* Summary header */}
                <motion.div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    margin: '0 0 2rem 0'
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.4 }}
                >
                  {[
                    {
                      label: 'Active Services',
                      value: `${serviceSummary.active} / ${serviceSummary.total}`,
                      icon: '🟢',
                      color: 'var(--color-success)'
                    },
                    {
                      label: 'Avg Error Rate (24h)',
                      value: `${serviceSummary.avgErrorPct < 0.01 && serviceSummary.avgErrorPct > 0 ? '<0.01' : serviceSummary.avgErrorPct.toFixed(2)}%`,
                      icon: '📈',
                      color:
                        serviceSummary.avgErrorPct > 5
                          ? 'var(--color-error)'
                          : serviceSummary.avgErrorPct > 1
                            ? 'var(--color-warning)'
                            : 'var(--color-success)'
                    },
                    {
                      label: 'Breaking Changes (24h)',
                      value: serviceSummary.totalBreaking.toString(),
                      icon: '⚠️',
                      color: serviceSummary.totalBreaking > 0 ? 'var(--color-warning)' : 'var(--color-success)'
                    }
                  ].map((metric, index) => (
                    <motion.div
                      key={metric.label}
                      style={{
                        padding: '1.5rem',
                        background:
                          'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
                        borderRadius: '16px',
                        border: '1px solid var(--color-border)',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 1 + index * 0.1, duration: 0.3 }}
                      whileHover={{
                        scale: 1.05,
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)'
                      }}
                    >
                      <motion.div
                        style={{
                          fontSize: '2rem',
                          marginBottom: '0.5rem'
                        }}
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity, repeatType: 'loop' }}
                      >
                        {metric.icon}
                      </motion.div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                        {metric.label}
                      </div>
                      <div
                        style={{
                          fontSize: '1.5rem',
                          fontWeight: '700',
                          color: metric.color
                        }}
                      >
                        {metric.value}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {/* Legend */}
                <motion.div
                  style={{
                    display: 'flex',
                    gap: '1.5rem',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '2rem',
                    padding: '1rem',
                    background: 'var(--color-background-secondary)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.9rem',
                    flexWrap: 'wrap'
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.3, duration: 0.4 }}
                >
                  {[
                    { color: 'var(--color-success)', label: 'Healthy (<1%)', icon: '🟢' },
                    { color: 'var(--color-warning)', label: 'Warning (1–5%)', icon: '🟡' },
                    { color: 'var(--color-error)', label: 'Critical (>5%)', icon: '🔴' }
                  ].map((item, index) => (
                    <motion.span
                      key={item.label}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.4 + index * 0.1, duration: 0.3 }}
                    >
                      <motion.span
                        style={{
                          fontSize: '1rem'
                        }}
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: index * 0.5 }}
                      >
                        {item.icon}
                      </motion.span>
                      {item.label}
                    </motion.span>
                  ))}
                </motion.div>

                <motion.div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '1.5rem'
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 0.5 }}
                >
                  {services.map((service, index) => {
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
                      <motion.div
                        key={service.name}
                        style={{
                          padding: '2rem',
                          background:
                            'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
                          borderRadius: '20px',
                          border: '1px solid var(--color-border)',
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 1.6 + index * 0.1, duration: 0.4 }}
                        whileHover={{
                          scale: 1.03,
                          boxShadow: '0 12px 40px rgba(59, 130, 246, 0.15)',
                          transition: { duration: 0.3 }
                        }}
                      >
                        <motion.div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: '-100%',
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)'
                          }}
                          whileHover={{ left: '100%' }}
                          transition={{ duration: 0.8 }}
                        />

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '1.5rem',
                            position: 'relative',
                            zIndex: 1
                          }}
                        >
                          <motion.div
                            style={{
                              fontSize: '1.5rem',
                              marginRight: '1rem'
                            }}
                            animate={{
                              rotate: service.status.toLowerCase() === 'active' ? [0, 10, -10, 0] : 0,
                              scale: service.status.toLowerCase() === 'active' ? [1, 1.1, 1] : 1
                            }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            {getStatusIcon(service.status)}
                          </motion.div>
                          <div>
                            <h3
                              style={{ margin: 0, fontSize: '1.3rem', fontWeight: '700', color: 'var(--color-text-primary)' }}
                            >
                              {service.name}
                            </h3>
                            <motion.div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '0.25rem 0.75rem',
                                backgroundColor: getStatusColor(service.status) + '20',
                                border: `1px solid ${getStatusColor(service.status)}40`,
                                borderRadius: '20px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                color: getStatusColor(service.status),
                                marginTop: '0.5rem'
                              }}
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ delay: 1.7 + index * 0.1, duration: 0.3 }}
                            >
                              {formatStatus(service.status)}
                            </motion.div>
                          </div>
                        </div>

                        <motion.div
                          style={{
                            padding: '1.5rem',
                            backgroundColor: 'var(--color-background)',
                            borderRadius: '16px',
                            fontSize: '0.9rem',
                            position: 'relative',
                            zIndex: 1
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.8 + index * 0.1, duration: 0.3 }}
                        >
                          {service.breakingChanges24h > 0 && (
                            <motion.div
                              style={{
                                marginBottom: '1rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 1rem',
                                backgroundColor: 'var(--color-error)20',
                                border: `1px solid var(--color-error)40`,
                                borderRadius: '20px',
                                fontSize: '0.85rem',
                                color: 'var(--color-error)',
                                fontWeight: '600'
                              }}
                              animate={{ x: [0, 2, -2, 0] }}
                              transition={{ duration: 1.5, repeat: Infinity, repeatType: 'loop' }}
                            >
                              ⚠️ {service.breakingChanges24h} breaking change{service.breakingChanges24h > 1 ? 's' : ''}
                            </motion.div>
                          )}

                          {/* Error rate progress bar */}
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div
                              style={{
                                height: '12px',
                                borderRadius: '8px',
                                background: 'var(--color-border)',
                                overflow: 'hidden'
                              }}
                            >
                              <motion.div
                                style={{
                                  height: '100%',
                                  borderRadius: '8px',
                                  background: `linear-gradient(90deg, ${getErrorColorByPct(errorRatePct)}, ${getErrorColorByPct(errorRatePct)}80)`
                                }}
                                initial={{ width: '0%' }}
                                animate={{ width: `${Math.max(2, Math.min(100, errorRatePct))}%` }}
                                transition={{ delay: 2 + index * 0.1, duration: 0.8, ease: 'easeOut' }}
                              />
                            </div>
                            <motion.div
                              style={{
                                marginTop: '0.75rem',
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                color: getErrorColorByPct(errorRatePct),
                                fontWeight: '600'
                              }}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 2.2 + index * 0.1, duration: 0.3 }}
                            >
                              <motion.span
                                animate={{ rotate: [0, 10, -10, 0] }}
                                transition={{ duration: 2, repeat: Infinity, delay: index * 0.5 }}
                              >
                                {errorRatePct > 5 ? '🔴' : errorRatePct > 1 ? '🟡' : '🟢'}
                              </motion.span>
                              {errorRatePct < 0.01 && errorRatePct > 0 ? '<0.01' : errorRatePct.toFixed(2)}% error rate (24h)
                            </motion.div>
                          </div>
                        </motion.div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              </>
            ) : (
              <motion.div
                style={{
                  padding: '3rem',
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
                  borderRadius: '20px',
                  border: '2px dashed var(--color-border)'
                }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <motion.div
                  style={{ fontSize: '3rem', marginBottom: '1rem' }}
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  🔍
                </motion.div>
                <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '1.1rem' }}>No services available</p>
              </motion.div>
            )}
          </motion.section>

          {!loading && !error && docs.length === 0 && (
            <div style={{ padding: '1rem', background: '#f0f8ff', borderRadius: '4px' }}>
              <p>No published documents found. Documents will appear here once they are published from the admin interface.</p>
            </div>
          )}

          {!loading && docs.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2.5, duration: 0.5 }}
            >
              <motion.h2
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                  marginBottom: '2rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
              >
                <span style={{ fontSize: 'inherit' }}>📖</span>
                <span
                  style={{
                    background: 'linear-gradient(135deg, var(--color-primary), #8b5cf6)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}
                >
                  All Documents ({docs.length})
                </span>
              </motion.h2>
              {Object.entries(docsByCategory).map(([category, categoryDocs], categoryIndex) => (
                <motion.div
                  key={category}
                  style={{ marginBottom: '2.5rem' }}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 2.6 + categoryIndex * 0.1, duration: 0.4 }}
                >
                  <motion.h3
                    style={{
                      color: 'var(--color-primary)',
                      borderBottom: '2px solid var(--color-border)',
                      paddingBottom: '0.5rem',
                      marginBottom: '1.5rem',
                      fontSize: '1.3rem',
                      fontWeight: '600',
                      position: 'relative'
                    }}
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <motion.div
                      style={{
                        position: 'absolute',
                        bottom: '-2px',
                        left: 0,
                        height: '2px',
                        background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                        borderRadius: '1px'
                      }}
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ delay: 2.7 + categoryIndex * 0.1, duration: 0.6 }}
                    />
                    {category}
                  </motion.h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '1rem'
                    }}
                  >
                    {categoryDocs.map((doc, docIndex) => (
                      <motion.div
                        key={doc.id}
                        style={{
                          padding: '1.25rem',
                          background:
                            'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
                          borderRadius: '12px',
                          border: '1px solid var(--color-border)',
                          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 2.8 + categoryIndex * 0.1 + docIndex * 0.05, duration: 0.3 }}
                        whileHover={{
                          scale: 1.02,
                          boxShadow: '0 8px 30px rgba(59, 130, 246, 0.12)'
                        }}
                        onClick={() => (window.location.hash = `#/${doc.slug}`)}
                      >
                        <motion.div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: '-100%',
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.08), transparent)'
                          }}
                          whileHover={{ left: '100%' }}
                          transition={{ duration: 0.5 }}
                        />
                        <h4
                          style={{
                            margin: '0 0 0.5rem 0',
                            color: 'var(--color-primary)',
                            fontSize: '1rem',
                            fontWeight: '600',
                            position: 'relative',
                            zIndex: 1
                          }}
                        >
                          {doc.title}
                        </h4>
                        {doc.description && (
                          <p
                            style={{
                              color: 'var(--color-text-secondary)',
                              fontSize: '0.85rem',
                              margin: '0 0 0.75rem 0',
                              lineHeight: '1.4',
                              position: 'relative',
                              zIndex: 1
                            }}
                          >
                            {doc.description}
                          </p>
                        )}
                        <motion.div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.7rem',
                            color: 'white',
                            background: 'var(--color-primary)',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontWeight: '500',
                            position: 'relative',
                            zIndex: 1
                          }}
                          whileHover={{ scale: 1.05, x: 5 }}
                          transition={{ duration: 0.2 }}
                        >
                          Read Article →
                        </motion.div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </motion.section>
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
        <motion.aside
          className="docs-nav"
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <motion.div
            className="nav-header"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <motion.h1 whileHover={{ scale: 1.05 }} transition={{ duration: 0.2 }}>
              <a
                href="#/home"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem',
                  borderRadius: '12px',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-background-secondary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {brandIconUrl ? (
                  <motion.img
                    src={brandIconUrl}
                    alt="Brand icon"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      objectFit: 'cover',
                      border: '2px solid var(--color-border)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.5, duration: 0.6, type: 'spring', bounce: 0.3 }}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  />
                ) : (
                  <motion.div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: 'white',
                      border: '2px solid var(--color-border)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.5, duration: 0.6, type: 'spring', bounce: 0.3 }}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    📚
                  </motion.div>
                )}
                <motion.div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7, duration: 0.4 }}
                >
                  <span
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: '700',
                      lineHeight: '1.2',
                      background: 'linear-gradient(135deg, var(--color-text-primary), var(--color-primary))',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}
                  >
                    {brandName}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--color-text-muted)',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                  >
                    Documentation
                  </span>
                </motion.div>
              </a>
            </motion.h1>
          </motion.div>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }}>
            {[
              { key: 'home', label: 'Home', icon: '🏠' },
              { key: 'schema', label: 'Schema', icon: '🔍' },
              ...(voyagerLoading
                ? [{ key: 'voyager-loading', label: 'Checking Voyager...', icon: '⏳', disabled: true }]
                : voyagerEnabled
                  ? [{ key: 'voyager', label: 'GraphQL Voyager', icon: '🗺️' }]
                  : []),
              ...(playgroundLoading
                ? [{ key: 'playground-loading', label: 'Checking Playground...', icon: '⏳', disabled: true }]
                : playgroundEnabled
                  ? [{ key: 'playground', label: 'GraphQL Playground', icon: '🎮' }]
                  : [])
            ].map((item, index) => (
              <motion.li
                key={item.key}
                className={active === item.key ? 'active' : ''}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
                whileHover={{ scale: 1.02, x: 5 }}
              >
                {(item as any).disabled ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.6, cursor: 'not-allowed' }}>
                    <span>{item.icon}</span>
                    {item.label}
                  </span>
                ) : (
                  <a href={`#/${item.key}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{item.icon}</span>
                    {item.label}
                  </a>
                )}
              </motion.li>
            ))}
            {Object.entries(docsByCategory).map(([category, categoryDocs], categoryIndex) => (
              <motion.li
                key={category}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + categoryIndex * 0.1, duration: 0.3 }}
              >
                <motion.div
                  style={{
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    color: 'var(--color-text-secondary)',
                    padding: '0.75rem 0 0.25rem 0',
                    borderTop: categoryIndex === 0 ? '1px solid var(--color-border)' : 'none',
                    marginTop: categoryIndex === 0 ? '0.5rem' : '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                  whileHover={{ x: 2 }}
                  transition={{ duration: 0.2 }}
                >
                  📁 {category}
                </motion.div>
                <motion.ul
                  style={{ marginLeft: '1rem' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.9 + categoryIndex * 0.1, duration: 0.3 }}
                >
                  {categoryDocs.map((doc, docIndex) => (
                    <motion.li
                      key={doc.slug}
                      className={doc.slug === active ? 'active' : ''}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1 + categoryIndex * 0.1 + docIndex * 0.05, duration: 0.2 }}
                      whileHover={{ scale: 1.02, x: 3 }}
                    >
                      <a href={`#/${doc.slug}`} title={doc.description}>
                        {doc.title}
                      </a>
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.li>
            ))}
          </motion.ul>
        </motion.aside>
        <main className="docs-content">{renderContent()}</main>
      </div>
    </MDXProvider>
  );
};
