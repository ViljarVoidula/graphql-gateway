import { MDXProvider } from '@mdx-js/react';
import React, { useEffect, useMemo, useState } from 'react';
import '../styles.css';
import { DocsSidebar } from './components/DocsSidebar';
import { DocumentArticle } from './components/DocumentArticle';
import {
  ExternalToolUnavailable,
  ExternalToolView,
} from './components/ExternalToolView';
import { HomeView } from './components/HomeView';
import ThemeDebugPanel from './components/ThemeDebugPanel';
import { SchemaExplorer } from './SchemaExplorer';
import {
  CompiledDocComponent,
  PublishedDoc,
  Service,
  ServiceSummary,
} from './types';

const Callout: React.FC<{ type?: string; children: React.ReactNode }> = ({
  type = 'info',
  children,
}) => <div className={`callout callout-${type}`}>{children}</div>;

const components = { Callout };

const useHash = () => {
  const [hash, setHash] = useState(() => {
    const rawHash = window.location.hash.replace(/^#\//, '');
    return decodeURIComponent(rawHash);
  });

  useEffect(() => {
    const onHash = () => {
      const rawHash = window.location.hash.replace(/^#\//, '');
      setHash(decodeURIComponent(rawHash));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return hash;
};

const compileMDXContent = async (
  mdxContent: string
): Promise<React.ComponentType> => {
  try {
    let content = mdxContent;
    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        content = content.slice(endIndex + 3).trim();
      }
    }

    const { evaluate } = await import('@mdx-js/mdx');
    const runtime = await import('react/jsx-runtime');
    const evaluated = await evaluate(content, runtime);

    return evaluated.default;
  } catch (error) {
    console.error('MDX compilation error:', error);
    return () =>
      React.createElement(
        'div',
        { style: { color: 'red' } },
        'Error compiling document: ' +
          (error instanceof Error ? error.message : String(error))
      );
  }
};

export const DocsApp: React.FC = () => {
  const [docs, setDocs] = useState<PublishedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hash = useHash();
  const active = hash || 'home';
  const [CompiledDoc, setCompiledDoc] = useState<CompiledDocComponent>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>('Gateway Docs');
  const [heroTitle, setHeroTitle] = useState<string>(
    'Welcome to the Documentation Portal'
  );
  const [heroSubtitle, setHeroSubtitle] = useState<string>(
    'Explore our comprehensive guides and API documentation. Stay updated with the latest!'
  );
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [brandIconUrl, setBrandIconUrl] = useState<string | null>(null);
  const [voyagerEnabled, setVoyagerEnabled] = useState<boolean>(false);
  const [voyagerLoading, setVoyagerLoading] = useState<boolean>(true);
  const [playgroundEnabled, setPlaygroundEnabled] = useState<boolean>(false);
  const [playgroundLoading, setPlaygroundLoading] = useState<boolean>(true);
  const [showQuickNav, setShowQuickNav] = useState(false);

  const serviceSummary = useMemo<ServiceSummary>(() => {
    if (!services || services.length === 0) {
      return { total: 0, active: 0, avgErrorPct: 0, totalBreaking: 0 };
    }
    const total = services.length;
    const activeCount = services.filter(
      (s) => s.status?.toLowerCase() === 'active'
    ).length;
    const totalBreaking = services.reduce(
      (acc, s) => acc + (s.breakingChanges24h || 0),
      0
    );
    const avgErrorPct =
      services.reduce((acc, s) => acc + (s.errorRate24h || 0) * 100, 0) /
      Math.max(total, 1);
    return { total, active: activeCount, avgErrorPct, totalBreaking };
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
      'transition-slow',
    ],
    []
  );

  useEffect(() => {
    console.log('Active hash:', active);
    console.log('Looking for document with slug:', active);
    console.log(
      'Available docs:',
      docs.map((d) => ({ slug: d.slug, title: d.title }))
    );
  }, [active, docs]);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
            `,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.errors) {
          throw new Error(result.errors[0].message);
        }

        setDocs(result.data.publishedDocs || []);

        console.log('Loaded published docs:', result.data.publishedDocs);
        console.log(
          'Document slugs:',
          result.data.publishedDocs?.map((d: PublishedDoc) => d.slug)
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load documents'
        );
        console.error('Error fetching docs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocs();
  }, []);

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { docsBranding { brandName heroTitle heroSubtitle } }`,
          }),
        });
        const result = await response.json();
        const branding = result?.data?.docsBranding;
        if (branding) {
          if (
            typeof branding.brandName === 'string' &&
            branding.brandName.trim()
          )
            setBrandName(branding.brandName.trim());
          if (
            typeof branding.heroTitle === 'string' &&
            branding.heroTitle.trim()
          )
            setHeroTitle(branding.heroTitle.trim());
          if (
            typeof branding.heroSubtitle === 'string' &&
            branding.heroSubtitle.trim()
          )
            setHeroSubtitle(branding.heroSubtitle.trim());
        }
        try {
          const assetResponse = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query { docsBrandingAssets { heroImageUrl faviconUrl brandIconUrl } }`,
            }),
          });
          const assetJson = await assetResponse.json();
          const assets = assetJson?.data?.docsBrandingAssets;
          if (assets?.heroImageUrl) setHeroImageUrl(assets.heroImageUrl);
          if (assets?.brandIconUrl) setBrandIconUrl(assets.brandIconUrl);
        } catch {}
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('Branding load failed', err);
        }
      }
    };

    fetchBranding();
  }, []);

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
            `,
          }),
        });
        const result = await response.json();
        if (result.errors) throw new Error(result.errors[0].message);
        setServices(result.data.serviceHealth || []);
      } catch (err) {
        setServicesError(
          err instanceof Error ? err.message : 'Failed to load services'
        );
      } finally {
        setServicesLoading(false);
      }
    };

    fetchServices();
  }, []);

  useEffect(() => {
    const checkVoyagerAvailability = async () => {
      try {
        setVoyagerLoading(true);
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { settings { graphqlVoyagerEnabled } }`,
          }),
        });
        const result = await response.json();
        if (result?.data?.settings?.graphqlVoyagerEnabled === true) {
          setVoyagerEnabled(true);
        }
      } catch (err) {
        try {
          const voyagerResponse = await fetch('/voyager', { method: 'HEAD' });
          if (voyagerResponse.ok || voyagerResponse.status === 200) {
            setVoyagerEnabled(true);
          }
        } catch {
          setVoyagerEnabled(false);
        }
      } finally {
        setVoyagerLoading(false);
      }
    };

    checkVoyagerAvailability();
  }, []);

  useEffect(() => {
    const checkPlaygroundAvailability = async () => {
      try {
        setPlaygroundLoading(true);
        const response = await fetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { settings { graphqlPlaygroundEnabled } }`,
          }),
        });
        const result = await response.json();
        if (result?.data?.settings?.graphqlPlaygroundEnabled === true) {
          setPlaygroundEnabled(true);
        }
      } catch (err) {
        try {
          const playgroundResponse = await fetch('/playground', {
            method: 'HEAD',
          });
          if (playgroundResponse.ok || playgroundResponse.status === 200) {
            setPlaygroundEnabled(true);
          }
        } catch {
          setPlaygroundEnabled(false);
        }
      } finally {
        setPlaygroundLoading(false);
      }
    };

    checkPlaygroundAvailability();
  }, []);

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
        setDocError(
          err instanceof Error ? err.message : 'Failed to compile document'
        );
      } finally {
        setDocLoading(false);
      }
    };

    compileDoc();
  }, [active, docs]);

  const filteredDocs = useMemo(
    () =>
      docs.filter((d) =>
        [d.title, d.description, d.slug, d.category].some(
          (field) => field && field.toLowerCase().includes(search.toLowerCase())
        )
      ),
    [docs, search]
  );

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

    return Object.keys(grouped)
      .sort()
      .reduce(
        (acc, category) => {
          acc[category] = grouped[category].sort((a, b) =>
            a.title.localeCompare(b.title)
          );
          return acc;
        },
        {} as Record<string, PublishedDoc[]>
      );
  }, [filteredDocs]);

  const recentDocs = useMemo(
    () =>
      [...docs]
        .sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime()
        )
        .slice(0, 5),
    [docs]
  );

  useEffect(() => {
    const loadOrCreateLink = (): HTMLLinkElement => {
      let existing = document.querySelector(
        'link[href*="/docs-theme.css"]'
      ) as HTMLLinkElement;
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
          body: JSON.stringify({
            query: `query { docsBrandingAssets { faviconUrl } }`,
          }),
        });
        const result = await response.json();
        const faviconUrl = result?.data?.docsBrandingAssets?.faviconUrl;

        if (faviconUrl) {
          const existingFavicons =
            document.querySelectorAll('link[rel*="icon"]');
          existingFavicons.forEach((link) => link.remove());

          const faviconLink = document.createElement('link');
          faviconLink.rel = 'icon';
          faviconLink.href = faviconUrl;
          document.head.appendChild(faviconLink);
        }
      } catch (faviconError) {
        if (process.env.NODE_ENV !== 'production') {
          console.debug('[favicon] update failed', faviconError);
        }
      }
    };

    const refresh = (reason: string) => {
      const link = loadOrCreateLink();
      const ts = Date.now();
      link.href = `/docs-theme.css?t=${ts}`;
      updateFavicon();

      if (process.env.NODE_ENV !== 'production') {
        console.debug('[theme] refreshed', { reason, ts });
      }
    };

    refresh('initial');

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh('visibilitychange');
    };
    document.addEventListener('visibilitychange', onVisibility);

    const intervalId = setInterval(() => refresh('interval'), 60000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(intervalId);
    };
  }, []);

  const handleSelectDoc = (slug: string) => {
    window.location.hash = `#/${slug}`;
  };

  useEffect(() => {
    const handleScroll = () => {
      setShowQuickNav(window.scrollY > 320);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [active]);

  const renderContent = () => {
    if (active === 'schema') {
      return <SchemaExplorer />;
    }

    if (active === 'voyager') {
      return voyagerEnabled ? (
        <ExternalToolView
          title="GraphQL Schema Voyager"
          icon="🗺️"
          url="/voyager"
        />
      ) : (
        <ExternalToolUnavailable
          title="GraphQL Voyager"
          message="GraphQL Voyager is currently disabled or not available."
        />
      );
    }

    if (active === 'playground') {
      return playgroundEnabled ? (
        <ExternalToolView
          title="GraphQL Playground"
          icon="🎮"
          url="/playground"
        />
      ) : (
        <ExternalToolUnavailable
          title="GraphQL Playground"
          message="GraphQL Playground is currently disabled or not available."
        />
      );
    }

    if (active === 'home' || !active) {
      return (
        <HomeView
          heroTitle={heroTitle}
          heroSubtitle={heroSubtitle}
          heroImageUrl={heroImageUrl}
          recentDocs={recentDocs}
          docs={docs}
          docsByCategory={docsByCategory}
          loading={loading}
          error={error}
          services={services}
          servicesLoading={servicesLoading}
          servicesError={servicesError}
          serviceSummary={serviceSummary}
          onSelectDoc={handleSelectDoc}
        />
      );
    }

    return (
      <DocumentArticle
        activeSlug={active}
        doc={docs.find((d) => d.slug === active)}
        compiledDoc={CompiledDoc}
        loading={docLoading}
        error={docError}
      />
    );
  };

  return (
    <MDXProvider components={components as any}>
      <div className="docs-shell">
        {showQuickNav && (
          <div
            className="docs-quick-nav"
            role="navigation"
            aria-label="Quick navigation"
          >
            <button
              type="button"
              className="secondary"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              ↑ Back to top
            </button>
            {active !== 'home' && (
              <button type="button" onClick={() => handleSelectDoc('home')}>
                🏠 Docs home
              </button>
            )}
          </div>
        )}
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
            opacity: 0.7,
          }}
          onClick={() => setShowDebug((s) => !s)}
          title="Toggle Theme Debug Panel"
        >
          {showDebug ? 'Close Theme Debug' : 'Theme Debug'}
        </button>
        <ThemeDebugPanel
          open={showDebug}
          onClose={() => setShowDebug(false)}
          expected={expectedTokens}
        />
        <DocsSidebar
          active={active}
          brandName={brandName}
          brandIconUrl={brandIconUrl}
          search={search}
          onSearchChange={setSearch}
          docsByCategory={docsByCategory}
          voyagerEnabled={voyagerEnabled}
          voyagerLoading={voyagerLoading}
          playgroundEnabled={playgroundEnabled}
          playgroundLoading={playgroundLoading}
        />
        <main className="docs-content">{renderContent()}</main>
      </div>
    </MDXProvider>
  );
};
