import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { MDXProvider } from '@mdx-js/react';
import {
  IconArchive,
  IconArrowBackUp,
  IconCopy,
  IconFileDiff,
  IconFileText,
  IconMaximize,
  IconPlus,
  IconSearch,
  IconTrash,
  IconWand
} from '@tabler/icons-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authenticatedFetch } from '../../utils/auth';
import { DOCUMENT_TEMPLATES, DocumentTemplate } from './templates';

// Import MDX Editor CSS
import '@mdxeditor/editor/style.css';

// Lazy load MDX Editor to avoid SSR issues
const MDXEditor = React.lazy(() =>
  import('@mdxeditor/editor').then((module) => ({
    default: module.MDXEditor
  }))
);

// Import MDX Editor plugins
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  codeBlockPlugin,
  codeMirrorPlugin,
  CodeToggle,
  CreateLink,
  diffSourcePlugin,
  frontmatterPlugin,
  headingsPlugin,
  imagePlugin,
  InsertCodeBlock,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo
} from '@mdxeditor/editor';

interface DocItem {
  id: string;
  slug: string;
  title: string;
  status: string; // ACTIVE | ARCHIVED
  latestRevision?: {
    id: string;
    version: number;
    state: string; // DRAFT | PUBLISHED
    mdxRaw?: string;
    updatedAt?: string;
    publishedAt?: string;
  };
}

interface ActiveState {
  document: DocItem;
  revisionId: string;
  version: number;
  state: string;
  mdx: string;
  dirty: boolean;
}

export const DocsContentManager: React.FC = () => {
  // Data state
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [active, setActive] = useState<ActiveState | null>(null);

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [duplicateDoc, setDuplicateDoc] = useState<DocItem | null>(null);
  const [archiveDoc, setArchiveDoc] = useState<DocItem | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DocItem | null>(null);
  const [newDocSlug, setNewDocSlug] = useState('');
  const [newDocTitle, setNewDocTitle] = useState('');
  const [duplicateSlug, setDuplicateSlug] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);

  // Action loading flags
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Live preview state
  const [compiledElement, setCompiledElement] = useState<React.ReactNode>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [toc, setToc] = useState<{ depth: number; value: string }[]>([]);
  const compileTimeout = useRef<number | null>(null);
  const mdxRuntimeRef = useRef<any>(null); // cache for imported mdx compiler
  const [clientReady, setClientReady] = useState(false);
  const [themeCSS, setThemeCSS] = useState<string>('');
  const scopedThemeCSS = useMemo(() => {
    if (!themeCSS) return '';
    const scope = '.mdx-preview';
    try {
      // Prefix non-at-rule selectors with the scope. Works inside @media blocks too because of the leading '}' alternative.
      // Pattern: (start of string or '}') followed by optional whitespace, then a selector group not starting with @ or {, until '{'
      const re = /(^|\})\s*([^@{}][^{]+)\{/gm;
      return themeCSS.replace(re, (m, p1, selectors) => {
        // Split selectors by comma and prefix each
        const scoped = selectors
          .split(',')
          .map((sel: string) => sel.trim())
          .filter((sel: string) => sel.length > 0)
          .map((sel: string) => (sel.startsWith(scope) ? sel : `${scope} ${sel}`))
          .join(', ');
        return `${p1} ${scoped}{`;
      });
    } catch {
      return themeCSS; // fallback unscoped if something goes wrong
    }
  }, [themeCSS]);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  // Editor mode & parse errors
  const [parseError, setParseError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<boolean>(false);
  const autoForcedRef = useRef(false);
  // Inline rename state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [renaming, setRenaming] = useState(false);
  // AI Assist state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState(
    'Draft a Quickstart section with a minimal query, curl, and integration snippets.'
  );
  const [aiMode, setAiMode] = useState<'APPEND' | 'REPLACE' | 'SECTION'>('APPEND');
  const [aiStyle, setAiStyle] = useState<'CONCISE' | 'TUTORIAL' | 'REFERENCE' | 'MARKETING'>('CONCISE');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<string>('');
  const [editorSelection, setEditorSelection] = useState<string>('');
  // Split view state (resizable divider between editor and preview)
  const [paneRatio, setPaneRatio] = useState<number>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('docs.paneRatio') : null;
    const v = saved ? parseFloat(saved) : 0.5;
    return Number.isFinite(v) && v > 0.15 && v < 0.85 ? v : 0.5;
  });
  const isResizingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Normalization info
  const [normalizationApplied, setNormalizationApplied] = useState<number>(0);
  const [persistingNormalization, setPersistingNormalization] = useState<boolean>(false);
  const [normalizationPersistedAt, setNormalizationPersistedAt] = useState<number | null>(null);

  // Canonical language set and alias map (keep small to avoid duplicate dropdown entries)
  const CANONICAL_LANG_LABELS: Record<string, string> = {
    plain: 'Plain',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    json: 'JSON',
    yaml: 'YAML',
    bash: 'Bash',
    sql: 'SQL',
    python: 'Python',
    graphql: 'GraphQL',
    http: 'HTTP'
  };
  const LANG_ALIASES: Record<string, string> = {
    '': 'plain',
    none: 'plain',
    text: 'plain',
    plaintext: 'plain',
    mjs: 'javascript',
    cjs: 'javascript',
    js: 'javascript',
    ts: 'typescript',
    yml: 'yaml',
    sh: 'bash',
    shell: 'bash',
    py: 'python',
    gql: 'graphql',
    curl: 'http'
  };

  // Normalize code fences without / unknown languages to canonical ones for the editor (does not mutate original saved value)
  const editorMarkdown = useMemo(() => {
    if (!active) {
      setNormalizationApplied(0);
      return '';
    }
    const input = active.mdx || '';
    let changes = 0;
    const normalized = input.replace(/```([^\n]*)\n([\s\S]*?)```/g, (full, langSpec, body) => {
      const raw = (langSpec || '').trim();
      const lower = raw.toLowerCase();
      let canonical: string;
      if (CANONICAL_LANG_LABELS[lower]) canonical = lower;
      else if (LANG_ALIASES[lower] && CANONICAL_LANG_LABELS[LANG_ALIASES[lower]]) canonical = LANG_ALIASES[lower];
      else if (raw === '') canonical = 'plain';
      else if (/[a-z0-9_-]+/i.test(raw) === false) canonical = 'plain';
      else if (!CANONICAL_LANG_LABELS[lower]) canonical = 'plain';
      else canonical = lower;
      if (canonical !== lower) changes++;
      return '```' + canonical + '\n' + body + '```';
    });
    setNormalizationApplied(changes);
    return normalized;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.mdx, active?.revisionId]);

  // Clear success message after a short delay
  useEffect(() => {
    if (!normalizationPersistedAt) return;
    const t = window.setTimeout(() => setNormalizationPersistedAt(null), 4000);
    return () => window.clearTimeout(t);
  }, [normalizationPersistedAt]);

  // Persist pane ratio
  useEffect(() => {
    try {
      window.localStorage.setItem('docs.paneRatio', String(paneRatio));
    } catch {}
  }, [paneRatio]);

  // Render preview content with proper styling
  const renderPreview = (isFullscreen = false) => {
    if (!compiledElement && !previewError) {
      return (
        <Text size="xs" color="dimmed">
          Compiling preview…
        </Text>
      );
    }

    if (previewError) {
      return (
        <Text size="xs" color="red" style={{ whiteSpace: 'pre-wrap' }}>
          {previewError}
        </Text>
      );
    }

    return (
      <div className="mdx-preview" style={{ width: '100%', lineHeight: 1.5, overflowX: 'hidden' }}>
        <style dangerouslySetInnerHTML={{ __html: scopedThemeCSS }} />
        <div
          className="doc-article"
          style={{
            fontFamily: 'var(--font-family-sans, "Inter", system-ui, sans-serif)',
            color: 'var(--color-text-primary, #1f2937)',
            backgroundColor: 'var(--color-background, #ffffff)',
            padding: isFullscreen ? '2rem' : '1.5rem',
            lineHeight: 'var(--line-height-normal, 1.5)',
            fontSize: 'var(--font-size-base, 1rem)',
            maxWidth: isFullscreen ? '800px' : 'none',
            margin: isFullscreen ? '0 auto' : '0',
            minHeight: isFullscreen ? 'calc(100vh - 4rem)' : 'auto',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `
            .mdx-preview { overflow-x: hidden !important; }
            .mdx-preview .doc-article h1 {
              font-size: var(--font-size-2xl, 1.5rem) !important;
              font-weight: var(--font-weight-bold, 700) !important;
              color: var(--color-primary, #3b82f6) !important;
              margin: 0 0 var(--spacing-lg, 1.5rem) 0 !important;
              line-height: var(--line-height-tight, 1.25) !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            .mdx-preview .doc-article h2 {
              font-size: var(--font-size-xl, 1.25rem) !important;
              font-weight: var(--font-weight-semibold, 600) !important;
              color: var(--color-text-primary, #1f2937) !important;
              margin: var(--spacing-xl, 2rem) 0 var(--spacing-md, 1rem) 0 !important;
              line-height: var(--line-height-tight, 1.25) !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            .mdx-preview .doc-article h3 {
              font-size: var(--font-size-lg, 1.125rem) !important;
              font-weight: var(--font-weight-semibold, 600) !important;
              color: var(--color-text-primary, #1f2937) !important;
              margin: var(--spacing-lg, 1.5rem) 0 var(--spacing-sm, 0.5rem) 0 !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            .mdx-preview .doc-article p {
              margin: 0 0 var(--spacing-md, 1rem) 0 !important;
              color: var(--color-text-secondary, #6b7280) !important;
              line-height: var(--line-height-normal, 1.5) !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            .mdx-preview .doc-article ul, .mdx-preview .doc-article ol {
              margin: 0 0 var(--spacing-md, 1rem) 0 !important;
              padding-left: var(--spacing-lg, 1.5rem) !important;
              color: var(--color-text-secondary, #6b7280) !important;
            }
            .mdx-preview .doc-article li {
              margin-bottom: var(--spacing-xs, 0.25rem) !important;
              line-height: var(--line-height-normal, 1.5) !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            .mdx-preview .doc-article a {
              color: var(--color-primary, #3b82f6) !important;
              text-decoration: none !important;
            }
            .mdx-preview .doc-article a:hover {
              text-decoration: underline !important;
            }
            .mdx-preview .doc-article code {
              background-color: var(--color-background-tertiary, #f3f4f6) !important;
              padding: var(--spacing-xs, 0.25rem) var(--spacing-sm, 0.5rem) !important;
              border-radius: var(--border-radius-sm, 0.25rem) !important;
              font-size: var(--font-size-sm, 0.875rem) !important;
              font-family: var(--font-family-mono, monospace) !important;
              color: var(--color-primary, #3b82f6) !important;
              white-space: normal !important;
              word-break: break-word !important;
              overflow-wrap: anywhere !important;
            }
            .mdx-preview .doc-article pre {
              background-color: var(--color-background-code, #1e293b) !important;
              color: var(--color-text-inverse, #ffffff) !important;
              padding: var(--spacing-lg, 1.5rem) !important;
              border-radius: var(--border-radius-lg, 0.5rem) !important;
              overflow-x: auto !important;
              font-family: var(--font-family-mono, monospace) !important;
              font-size: var(--font-size-sm, 0.875rem) !important;
              margin: var(--spacing-lg, 1.5rem) 0 !important;
              max-width: 100% !important;
            }
            .mdx-preview .doc-article pre code {
              background: none !important;
              padding: 0 !important;
              color: inherit !important;
              white-space: pre !important;
            }
            .mdx-preview .doc-article table { max-width: 100% !important; display: block; overflow-x: auto; }
            .mdx-preview .doc-article img { max-width: 100% !important; height: auto !important; }
            .mdx-preview .doc-article blockquote {
              margin: var(--spacing-lg, 1.5rem) 0 !important;
              padding: var(--spacing-md, 1rem) var(--spacing-lg, 1.5rem) !important;
              border-left: 4px solid var(--color-primary, #3b82f6) !important;
              background-color: var(--color-primary-light, #dbeafe) !important;
              color: var(--color-text-primary, #1f2937) !important;
              border-radius: 0 var(--border-radius-md, 0.375rem) var(--border-radius-md, 0.375rem) 0 !important;
            }
            .mdx-preview .doc-article *, .mdx-preview .doc-article *::before, .mdx-preview .doc-article *::after {
              min-width: 0 !important;
            }
          `
            }}
          />
          {compiledElement}
        </div>
      </div>
    );
  };

  // Load theme CSS for preview
  useEffect(() => {
    const loadThemeCSS = async () => {
      try {
        const response = await fetch(`/docs-theme.css?t=${Date.now()}`);
        const css = await response.text();
        setThemeCSS(css);
      } catch (error) {
        console.warn('Failed to load theme CSS for preview:', error);
      }
    };

    loadThemeCSS();

    // Listen for theme updates from the theme editor
    const handleThemeUpdate = () => {
      loadThemeCSS();
    };

    window.addEventListener('themeUpdated', handleThemeUpdate);
    return () => window.removeEventListener('themeUpdated', handleThemeUpdate);
  }, []);

  // Mark client hydration complete so we don't run MDX on server-like environments
  useEffect(() => {
    setClientReady(true);
  }, []);

  // Load documents
  const loadDocs = useCallback(async (): Promise<DocItem[] | null> => {
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query Docs {
            docsWithLatestRevision {
              id
              slug
              title
              status
              latestRevision { id version state mdxRaw updatedAt publishedAt }
            }
          }`
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const list: DocItem[] = json.data.docsWithLatestRevision;
      setDocs(list);
      setError(null);
      return list;
    } catch (e: any) {
      setError(e.message || 'Failed to load docs');
      return null;
    }
  }, []);

  // Kick off initial load
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const list = await loadDocs();
      if (!mounted) return;
      setLoading(false);
      // If there is an active doc id referenced but no list loaded, clear active to reveal empty state
      if (!list || list.length === 0) {
        setActive(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadDocs]);

  // Helper to refresh with spinner on demand
  const refreshDocs = useCallback(async () => {
    setLoading(true);
    try {
      await loadDocs();
    } finally {
      setLoading(false);
    }
  }, [loadDocs]);

  // Persist normalized code fence languages into current revision
  const persistNormalization = useCallback(async () => {
    if (!active) return;
    setPersistingNormalization(true);
    try {
      const normalized = editorMarkdown;
      if (active.document.id === 'new') {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation CreateDoc($input:CreateDocumentInput!){
              createDocument(input:$input){ id version state mdxRaw }
            }`,
            variables: { input: { slug: active.document.slug, title: active.document.title, mdxRaw: normalized } }
          })
        });
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);
        const updated = await loadDocs();
        if (updated) {
          const newDoc = updated.find((d) => d.slug === active.document.slug);
          if (newDoc && newDoc.latestRevision) {
            setActive({
              document: newDoc,
              revisionId: newDoc.latestRevision.id,
              version: newDoc.latestRevision.version,
              state: newDoc.latestRevision.state,
              mdx: newDoc.latestRevision.mdxRaw || normalized,
              dirty: false
            });
          }
        }
      } else {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation UpdateRev($input:UpdateRevisionInput!){
              updateRevision(input:$input){ id version state }
            }`,
            variables: { input: { revisionId: active.revisionId, mdxRaw: normalized } }
          })
        });
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);
        await loadDocs();
        setActive((prev) => (prev ? { ...prev, mdx: normalized, dirty: false } : prev));
      }
      setNormalizationPersistedAt(Date.now());
    } catch (e: any) {
      setError(e.message || 'Failed to persist normalization');
    } finally {
      setPersistingNormalization(false);
    }
  }, [active, editorMarkdown, loadDocs]);

  // Derived filtered list
  const filteredDocs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.slug.toLowerCase().includes(q) || d.title.toLowerCase().includes(q));
  }, [docs, filter]);

  // Actions
  async function saveRevision() {
    if (!active) return;
    setSaving(true);
    try {
      // If this is a new document, create it first
      if (active.document.id === 'new') {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation CreateDoc($input:CreateDocumentInput!){ createDocument(input:$input){ id version state mdxRaw } }`,
            variables: { input: { slug: active.document.slug, title: active.document.title, mdxRaw: active.mdx } }
          })
        });
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);
        const updated = await loadDocs();
        if (updated) {
          const newDoc = updated.find((d) => d.slug === active.document.slug);
          if (newDoc && newDoc.latestRevision) {
            setActive({
              document: newDoc,
              revisionId: newDoc.latestRevision.id,
              version: newDoc.latestRevision.version,
              state: newDoc.latestRevision.state,
              mdx: newDoc.latestRevision.mdxRaw || active.mdx,
              dirty: false
            });
          }
        }
      } else {
        // Update existing revision
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation UpdateRev($input:UpdateRevisionInput!){ updateRevision(input:$input){ id version state } }`,
            variables: { input: { revisionId: active.revisionId, mdxRaw: active.mdx } }
          })
        });
        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);
        setActive((prev) => (prev ? { ...prev, dirty: false } : prev));
        await loadDocs();
      }
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function saveTitleInline() {
    if (!active) return;
    const newTitle = titleInput.trim();
    if (!newTitle || newTitle === active.document.title) {
      setEditingTitle(false);
      return;
    }
    setRenaming(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation UpdateRev($input:UpdateRevisionInput!){ updateRevision(input:$input){ id } }`,
          variables: { input: { revisionId: active.revisionId, title: newTitle } }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      await loadDocs();
      setActive((prev) => (prev ? { ...prev, document: { ...prev.document, title: newTitle } } : prev));
      setEditingTitle(false);
    } catch (e: any) {
      setError(e.message || 'Failed to rename title');
    } finally {
      setRenaming(false);
    }
  }

  async function saveSlugInline() {
    if (!active) return;
    const newSlug = slugInput.trim();
    if (!newSlug || newSlug === active.document.slug) {
      setEditingSlug(false);
      return;
    }
    setRenaming(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation UpdateDoc($input:UpdateDocumentInput!){ updateDocument(input:$input){ id slug title } }`,
          variables: { input: { documentId: active.document.id, slug: newSlug } }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const updated = json.data.updateDocument;
      await loadDocs();
      setActive((prev) => (prev ? { ...prev, document: { ...prev.document, slug: updated.slug } } : prev));
      setEditingSlug(false);
    } catch (e: any) {
      setError(e.message || 'Failed to rename slug');
    } finally {
      setRenaming(false);
    }
  }

  // Attempt to parse current markdown (lightweight) to surface syntax errors before MDXEditor tries rich mode
  useEffect(() => {
    if (!active) {
      setParseError(null);
      return;
    }
    // Only validate when content changes and not while typing super fast (debounce 400ms)
    const h = window.setTimeout(async () => {
      try {
        // Use @mdx-js/mdx compile in a safe dynamic import
        const mod = await import('@mdx-js/mdx');
        await mod.compile(active.mdx || '');
        setParseError(null);
      } catch (err: any) {
        setParseError(err.message || String(err));
      }
    }, 400);
    return () => window.clearTimeout(h);
  }, [active?.mdx]);

  // Auto force source mode while parse errors exist, and restore when resolved
  useEffect(() => {
    if (parseError && !sourceMode) {
      autoForcedRef.current = true;
      setSourceMode(true);
    } else if (!parseError && sourceMode && autoForcedRef.current) {
      autoForcedRef.current = false;
      setSourceMode(false);
    }
  }, [parseError, sourceMode]);

  // Keep active state synced with latest docs if not dirty
  useEffect(() => {
    if (!active) return;
    const match = docs.find((d) => d.id === active.document.id);
    if (match && match.latestRevision) {
      const latest = match.latestRevision;
      const raw = latest.mdxRaw || '';
      if (!active.dirty && (latest.id !== active.revisionId || raw !== active.mdx)) {
        setActive({
          document: match,
          revisionId: latest.id,
          version: latest.version,
          state: latest.state,
          mdx: raw,
          dirty: false
        });
      }
    }
  }, [docs]);

  async function publishRevision() {
    if (!active) return;
    setPublishing(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Pub($id:String!){ publishRevision(revisionId:$id){ revisionId chunksCreated } }`,
          variables: { id: active.revisionId }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const updatedList = await loadDocs();
      if (updatedList) {
        const updated = updatedList.find((d) => d.id === active.document.id);
        if (updated && updated.latestRevision) {
          setActive({
            document: updated,
            revisionId: updated.latestRevision.id,
            version: updated.latestRevision.version,
            state: updated.latestRevision.state,
            mdx: updated.latestRevision.mdxRaw || active.mdx,
            dirty: false
          });
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }

  async function startDraft(doc: DocItem) {
    setDrafting(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation CreateDraft($id:String!){ createDraft(documentId:$id){ id version state mdxRaw } }`,
          variables: { id: doc.id }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const rev = json.data.createDraft;
      setActive({
        document: doc,
        revisionId: rev.id,
        version: rev.version,
        state: rev.state,
        mdx: rev.mdxRaw || '',
        dirty: false
      });
      await loadDocs();
    } catch (e: any) {
      setError(e.message || 'Failed to create draft');
    } finally {
      setDrafting(false);
    }
  }

  async function createNewDocument() {
    if (!newDocSlug.trim() || !newDocTitle.trim() || !selectedTemplate) return;

    const newDoc = {
      id: 'new',
      slug: newDocSlug.trim(),
      title: newDocTitle.trim(),
      status: 'ACTIVE' as const,
      latestRevision: {
        id: 'new',
        version: 1,
        state: 'DRAFT' as const,
        mdxRaw: selectedTemplate.content(newDocTitle.trim(), newDocSlug.trim())
      }
    };

    setActive({
      document: newDoc,
      revisionId: 'new',
      version: 1,
      state: 'DRAFT',
      mdx: newDoc.latestRevision.mdxRaw,
      dirty: true
    });

    // Close modal and reset
    setCreateModalOpen(false);
    setNewDocSlug('');
    setNewDocTitle('');
    setSelectedTemplate(null);
  }

  async function duplicate(doc: DocItem) {
    if (!duplicateSlug.trim()) return;
    setDuplicating(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Dup($id:String!,$slug:String!){ duplicateDocument(documentId:$id,newSlug:$slug){ id slug title } }`,
          variables: { id: doc.id, slug: duplicateSlug.trim() }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      await loadDocs();
      // Close modal and reset
      setDuplicateModalOpen(false);
      setDuplicateDoc(null);
      setDuplicateSlug('');
    } catch (e: any) {
      setError(e.message || 'Duplicate failed');
    } finally {
      setDuplicating(false);
    }
  }

  async function archive(doc: DocItem) {
    setArchiving(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Arch($id:String!){ archiveDocument(documentId:$id) }`,
          variables: { id: doc.id }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      if (active?.document.id === doc.id) setActive(null);
      await loadDocs();
      // Close modal
      setArchiveModalOpen(false);
      setArchiveDoc(null);
    } catch (e: any) {
      setError(e.message || 'Archive failed');
    } finally {
      setArchiving(false);
    }
  }

  async function restore(doc: DocItem) {
    setRestoring(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Restore($id:String!){ restoreDocument(documentId:$id) }`,
          variables: { id: doc.id }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      await loadDocs();
    } catch (e: any) {
      setError(e.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  async function hardDelete(doc: DocItem) {
    setDeleting(true);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Del($id:String!){ deleteDocument(documentId:$id) }`,
          variables: { id: doc.id }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      if (active?.document.id === doc.id) setActive(null);
      await loadDocs();
      setDeleteModalOpen(false);
      setDeleteDoc(null);
    } catch (e: any) {
      setError(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  // Debounced MDX compilation for live preview
  useEffect(() => {
    if (!clientReady) return; // wait until mounted
    if (!active) {
      setCompiledElement(null);
      setToc([]);
      return;
    }

    let source = active.mdx;

    // Strip frontmatter if present
    if (source.startsWith('---')) {
      const endIndex = source.indexOf('---', 3);
      if (endIndex !== -1) {
        source = source.slice(endIndex + 3).trim();
      }
    }

    if (compileTimeout.current) window.clearTimeout(compileTimeout.current);
    compileTimeout.current = window.setTimeout(async () => {
      try {
        setPreviewError(null);
        // Lazy load evaluate API only once
        if (!mdxRuntimeRef.current) {
          mdxRuntimeRef.current = await import(/* webpackChunkName: "mdx-compiler" */ '@mdx-js/mdx');
        }
        const { evaluate } = mdxRuntimeRef.current;
        const runtime = await import('react/jsx-runtime');
        // Attempt to load dev runtime (provides jsxDEV). If unavailable, fallback gracefully.
        let devRuntime: any = {};
        try {
          devRuntime = await import('react/jsx-dev-runtime');
        } catch {
          /* ignore - not critical in production builds */
        }
        const evaluated = await evaluate(source, {
          ...runtime,
          ...devRuntime, // supplies jsxDEV in development so evaluate stops complaining
          useDynamicImport: false,
          providerImportSource: '@mdx-js/react',
          development: Boolean((devRuntime as any).jsxDEV)
        });
        const MDXContent = evaluated.default; // function component
        // Build TOC
        const tocItems: { depth: number; value: string }[] = [];
        source.split(/\n/).forEach((line) => {
          const m = /^(#{1,6})\s+(.+)$/.exec(line.trim());
          if (m) tocItems.push({ depth: m[1].length, value: m[2].replace(/`/g, '') });
        });
        setToc(tocItems);
        setCompiledElement(
          <MDXProvider>
            <MDXContent />
          </MDXProvider>
        );
      } catch (err: any) {
        setPreviewError(err.message || 'Preview failed');
        setCompiledElement(null);
      }
    }, 350); // debounce
    return () => {
      if (compileTimeout.current) window.clearTimeout(compileTimeout.current);
    };
  }, [active?.mdx, active?.revisionId, clientReady]);

  // Keyboard shortcuts (Ctrl+S save, Ctrl+Enter publish)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (active?.dirty) saveRevision();
      } else if (e.ctrlKey && e.key === 'Enter') {
        if (active && active.state === 'DRAFT') {
          e.preventDefault();
          publishRevision();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <Stack spacing="md">
      <Group spacing="sm">
        <IconFileText size={26} />
        <Title order={2}>Documentation Content</Title>
      </Group>
      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 200px)', overflowX: 'hidden' }}>
        {/* Left column: list */}
        <div style={{ width: 320, display: 'flex', flexDirection: 'column' }}>
          <Card withBorder p="sm" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Group position="apart" mb={4}>
              <Title order={4} style={{ marginBottom: 0 }}>
                Documents
              </Title>
              <Group spacing={4}>
                <Tooltip label="Create new document">
                  <Button size="xs" variant="subtle" onClick={() => setCreateModalOpen(true)}>
                    <IconPlus size={14} />
                  </Button>
                </Tooltip>
                <Tooltip label="Reload">
                  <Button variant="subtle" size="xs" onClick={refreshDocs} compact>
                    ↻
                  </Button>
                </Tooltip>
              </Group>
            </Group>
            <TextInput
              placeholder="Filter..."
              icon={<IconSearch size={14} />}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              size="xs"
              mb={6}
            />
            {loading && <Loader size="sm" />}
            {!loading && filteredDocs.length === 0 && (
              <Text size="sm" color="dimmed">
                No documents found.
              </Text>
            )}
            {!loading && filteredDocs.length > 0 && (
              <ScrollArea style={{ flex: 1 }}>
                <Stack spacing={4}>
                  {filteredDocs.map((d) => {
                    const activeMatch = d.id === active?.document.id;
                    const badgeColor =
                      d.status === 'ARCHIVED' ? 'gray' : d.latestRevision?.state === 'DRAFT' ? 'yellow' : 'blue';
                    return (
                      <Card
                        key={d.id}
                        p="xs"
                        withBorder
                        style={{ cursor: 'pointer', borderColor: activeMatch ? 'var(--mantine-color-blue-5)' : undefined }}
                        onClick={() => {
                          if (!d.latestRevision) {
                            setActive({ document: d, revisionId: '', version: 0, state: 'NONE', mdx: '', dirty: false });
                          } else {
                            setActive({
                              document: d,
                              revisionId: d.latestRevision.id,
                              version: d.latestRevision.version,
                              state: d.latestRevision.state,
                              mdx: d.latestRevision.mdxRaw || '',
                              dirty: false
                            });
                          }
                        }}
                      >
                        <Group position="apart" spacing={4} mb={2}>
                          <Text size="sm" weight={500} lineClamp={1} style={{ maxWidth: 160 }}>
                            {d.slug}
                          </Text>
                          <Badge color={badgeColor} variant={activeMatch ? 'filled' : 'light'} size="xs">
                            {d.status === 'ARCHIVED' ? 'ARCHIVED' : d.latestRevision?.state || '—'}
                          </Badge>
                        </Group>
                        <Text size="xs" color="dimmed" lineClamp={1}>
                          {d.title}
                        </Text>
                        <Group spacing={4} mt={6} position="apart">
                          <Group spacing={4}>
                            <Tooltip label="New draft">
                              <Button
                                size="xs"
                                variant="subtle"
                                compact
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startDraft(d);
                                }}
                                loading={drafting}
                              >
                                <IconFileDiff size={14} />
                              </Button>
                            </Tooltip>
                            <Tooltip label="Duplicate">
                              <Button
                                size="xs"
                                variant="subtle"
                                compact
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDuplicateDoc(d);
                                  setDuplicateSlug(d.slug + '-copy');
                                  setDuplicateModalOpen(true);
                                }}
                                loading={duplicating}
                              >
                                <IconCopy size={14} />
                              </Button>
                            </Tooltip>
                          </Group>
                          {d.status !== 'ARCHIVED' ? (
                            <Group spacing={4}>
                              <Tooltip label="Archive">
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  compact
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setArchiveDoc(d);
                                    setArchiveModalOpen(true);
                                  }}
                                  loading={archiving}
                                >
                                  <IconArchive size={14} />
                                </Button>
                              </Tooltip>
                              <Tooltip label="Delete permanently">
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  compact
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteDoc(d);
                                    setDeleteModalOpen(true);
                                  }}
                                  loading={deleting}
                                >
                                  <IconTrash size={14} />
                                </Button>
                              </Tooltip>
                            </Group>
                          ) : (
                            <Group spacing={4}>
                              <Tooltip label="Restore">
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="green"
                                  compact
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    restore(d);
                                  }}
                                  loading={restoring}
                                >
                                  <IconArrowBackUp size={14} />
                                </Button>
                              </Tooltip>
                              <Tooltip label="Delete permanently">
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  compact
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteDoc(d);
                                    setDeleteModalOpen(true);
                                  }}
                                  loading={deleting}
                                >
                                  <IconTrash size={14} />
                                </Button>
                              </Tooltip>
                            </Group>
                          )}
                        </Group>
                      </Card>
                    );
                  })}
                  {filteredDocs.length === 0 && <Text size="sm">No documents.</Text>}
                </Stack>
              </ScrollArea>
            )}
          </Card>
        </div>

        {/* Right column: editor - full width */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Card withBorder p="sm" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {active ? (
              <>
                <Group position="apart" mb="sm" align="flex-start" style={{ flexWrap: 'wrap', rowGap: 8 }}>
                  <Stack spacing={2} style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <Title order={4} style={{ marginBottom: 0 }}>
                      {editingTitle ? (
                        <TextInput
                          size="xs"
                          value={titleInput}
                          onChange={(e) => setTitleInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTitleInline();
                            if (e.key === 'Escape') setEditingTitle(false);
                          }}
                          onBlur={saveTitleInline}
                          autoFocus
                          style={{ maxWidth: 'min(720px, 100%)', width: '100%', display: 'inline-block' }}
                        />
                      ) : (
                        <span
                          style={{ cursor: 'text', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}
                          onClick={() => {
                            setTitleInput(active.document.title);
                            setEditingTitle(true);
                          }}
                          title="Click to rename title"
                        >
                          {active.document.title}
                        </span>
                      )}{' '}
                      {active.state === 'DRAFT' && (
                        <Badge color={active.dirty ? 'yellow' : 'blue'}>{active.dirty ? 'Unsaved Draft' : 'Draft'}</Badge>
                      )}
                      {active.state === 'PUBLISHED' && <Badge color="green">Published v{active.version}</Badge>}
                    </Title>
                    <Text size="xs" color="dimmed">
                      slug:{' '}
                      {editingSlug ? (
                        <TextInput
                          size="xs"
                          value={slugInput}
                          onChange={(e) => setSlugInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveSlugInline();
                            if (e.key === 'Escape') setEditingSlug(false);
                          }}
                          onBlur={saveSlugInline}
                          autoFocus
                          style={{ maxWidth: 'min(360px, 100%)', width: '100%', display: 'inline-block' }}
                        />
                      ) : (
                        <span
                          style={{ cursor: 'text', textDecoration: 'underline dotted' }}
                          onClick={() => {
                            setSlugInput(active.document.slug);
                            setEditingSlug(true);
                          }}
                          title="Click to rename slug"
                        >
                          {active.document.slug}
                        </span>
                      )}{' '}
                      • version: {active.version}
                    </Text>
                  </Stack>
                  <Group spacing={6} style={{ flexShrink: 0 }}>
                    <Tooltip label="AI Assist (generate or improve content)">
                      <Button
                        size="xs"
                        variant="light"
                        leftIcon={<IconWand size={14} />}
                        onClick={() => {
                          try {
                            const sel = window.getSelection?.()?.toString?.() || '';
                            setEditorSelection(sel);
                          } catch {}
                          setAiOpen(true);
                        }}
                      >
                        AI Assist
                      </Button>
                    </Tooltip>
                    {renaming && (
                      <Badge color="violet" variant="light">
                        Renaming…
                      </Badge>
                    )}
                    {normalizationApplied > 0 && !parseError && active.mdx !== editorMarkdown && (
                      <Tooltip label="Persist normalized code fence languages (aliases → canonical)">
                        <Button
                          size="xs"
                          variant="light"
                          color="violet"
                          onClick={persistNormalization}
                          loading={persistingNormalization}
                        >
                          Persist Normalizations
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip label={sourceMode ? 'Switch to Rich mode' : 'Switch to Source mode'}>
                      <Button size="xs" variant="light" onClick={() => setSourceMode((s) => !s)}>
                        {sourceMode ? 'Rich Mode' : 'Source Mode'}
                      </Button>
                    </Tooltip>
                    <Tooltip label="Save draft (Ctrl+S)">
                      <Button size="xs" variant="outline" onClick={saveRevision} disabled={!active.dirty} loading={saving}>
                        Save Draft
                      </Button>
                    </Tooltip>
                    <Tooltip label="Publish revision (Ctrl+Enter)" disabled={active.state !== 'DRAFT'}>
                      <Button
                        size="xs"
                        color="green"
                        onClick={publishRevision}
                        disabled={active.state !== 'DRAFT'}
                        loading={publishing}
                      >
                        Publish
                      </Button>
                    </Tooltip>
                  </Group>
                </Group>
                <Divider mb="sm" />
                {parseError && (
                  <Alert color="red" mb="sm" title="MDX Parse Error" variant="light">
                    <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                      {parseError}
                    </Text>
                    <Text size="xs" mt={4}>
                      You're in {sourceMode ? 'source' : 'rich'} mode. Fix the syntax above (common causes: unclosed code fence
                      ``` or missing closing tag) then the error will disappear.
                    </Text>
                  </Alert>
                )}

                {/* Responsive Editor and Preview Layout */}
                <div
                  ref={containerRef}
                  className="editor-preview-container"
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    minHeight: 0
                  }}
                >
                  <style>{`
                    @media (min-width: 1200px) {
                      .editor-preview-container {
                        flex-direction: row !important;
                        flex-wrap: nowrap !important;
                        height: 600px !important;
                      }
                      .editor-section { min-width: 0 !important; height: 100% !important; display: flex !important; flex-direction: column !important; }
                      .preview-section { min-width: 0 !important; height: 100% !important; display: flex !important; flex-direction: column !important; }
                      .split-resizer { width: 8px; cursor: col-resize; background: var(--mantine-color-gray-3); border-left: 1px solid var(--mantine-color-gray-4); border-right: 1px solid var(--mantine-color-gray-4); }
                      .split-resizer:hover { background: var(--mantine-color-gray-4); }
                      .split-resizer.active { background: var(--mantine-color-blue-1); }
                      .toc-section {
                        flex: 1 1 100% !important;
                        order: 3 !important;
                      }
                    }
                    @media (max-width: 1199px) {
                      .editor-preview-container {
                        max-height: 80vh !important;
                      }
                      .editor-section { max-height: 40vh !important; }
                      .preview-section { max-height: 40vh !important; }
                      .split-resizer { display: none !important; }
                    }
                  `}</style>

                  {/* Editor Section */}
                  <div
                    className="editor-section"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      flexBasis: `calc(${paneRatio * 100}% - 4px)`,
                      flexGrow: 0,
                      flexShrink: 0
                    }}
                  >
                    <Text size="xs" color="dimmed" mb={4}>
                      MDX Editor
                    </Text>
                    <div
                      style={{
                        flex: 1,
                        border: '1px solid var(--mantine-color-gray-4)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        minHeight: 300,
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      {!clientReady && (
                        <div style={{ padding: '1rem' }}>
                          <Text size="xs" color="dimmed">
                            Loading editor…
                          </Text>
                        </div>
                      )}
                      {clientReady && (
                        <React.Suspense
                          fallback={
                            <div style={{ padding: '1rem' }}>
                              <Text size="xs" color="dimmed">
                                Loading MDX Editor...
                              </Text>
                            </div>
                          }
                        >
                          <div
                            className="mdx-editor-wrapper"
                            style={{
                              height: '100%',
                              minHeight: '300px',
                              fontSize: '14px',
                              position: 'relative',
                              display: 'flex',
                              flexDirection: 'column'
                            }}
                          >
                            <style>{`
                              .mdx-editor-wrapper .mdx-editor {
                                height: 100% !important;
                                border: none !important;
                              }
                              .mdx-editor-wrapper .mdx-editor-content {
                                font-family: var(--mantine-font-family-monospace, Monaco, Menlo, "Ubuntu Mono", monospace) !important;
                                font-size: 14px !important;
                                line-height: 1.5 !important;
                                min-height: 300px !important;
                                overflow-y: auto !important;
                                overflow-x: hidden !important;
                                word-break: break-word !important;
                                overflow-wrap: anywhere !important;
                                padding: 0 0 1rem 0 !important;
                              }
                              /* Ensure CodeMirror code blocks don't expand the page width */
                              .mdx-editor-wrapper .cm-editor {
                                max-width: 100% !important;
                              }
                              .mdx-editor-wrapper .cm-scroller {
                                overflow: auto !important;
                                max-width: 100% !important;
                              }
                              .mdx-editor-wrapper .cm-content {
                                min-width: 0 !important;
                                word-break: break-word !important;
                                overflow-wrap: anywhere !important;
                              }
                              /* Inline code and tables/images inside editor */
                              .mdx-editor-wrapper .mdx-editor-content code {
                                white-space: pre-wrap !important;
                                word-break: break-word !important;
                              }
                              .mdx-editor-wrapper .mdx-editor-content table {
                                display: block !important;
                                max-width: 100% !important;
                                overflow-x: auto !important;
                              }
                              .mdx-editor-wrapper .mdx-editor-content img {
                                max-width: 100% !important;
                                height: auto !important;
                              }
                              .mdx-editor-wrapper .mdx-editor .mdx-toolbar {
                                border-bottom: 1px solid var(--mantine-color-gray-4) !important;
                                background: var(--mantine-color-gray-0) !important;
                              }
                              .mdx-editor-wrapper .mdx-editor-error {
                                background: #fee2e2 !important;
                                border: 1px solid #fecaca !important;
                                border-radius: 4px !important;
                                padding: 8px !important;
                                margin: 8px 0 !important;
                                color: #dc2626 !important;
                                font-size: 12px !important;
                              }
                            `}</style>
                            <div
                              style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}
                            >
                              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }} className="mdx-editor-scroll-container">
                                <MDXEditor
                                  key={active.revisionId}
                                  markdown={editorMarkdown}
                                  onChange={(value) =>
                                    setActive((prev) => (prev ? { ...prev, mdx: value, dirty: true } : prev))
                                  }
                                  plugins={[
                                    frontmatterPlugin(),
                                    headingsPlugin(),
                                    listsPlugin(),
                                    quotePlugin(),
                                    thematicBreakPlugin(),
                                    markdownShortcutPlugin(),
                                    linkPlugin(),
                                    linkDialogPlugin(),
                                    imagePlugin(),
                                    tablePlugin(),
                                    codeBlockPlugin({ defaultCodeBlockLanguage: 'plain' }),
                                    codeMirrorPlugin({ codeBlockLanguages: CANONICAL_LANG_LABELS }),
                                    diffSourcePlugin({
                                      viewMode: sourceMode || parseError ? 'source' : 'rich-text',
                                      diffMarkdown: ''
                                    }),
                                    toolbarPlugin({
                                      toolbarContents: () => (
                                        <>
                                          <UndoRedo />
                                          <Separator />
                                          <BoldItalicUnderlineToggles />
                                          <CodeToggle />
                                          <Separator />
                                          <ListsToggle />
                                          <Separator />
                                          <BlockTypeSelect />
                                          <Separator />
                                          <CreateLink />
                                          <InsertImage />
                                          <Separator />
                                          <InsertTable />
                                          <InsertThematicBreak />
                                          <InsertCodeBlock />
                                        </>
                                      )
                                    })
                                  ]}
                                  contentEditableClassName="mdx-editor-content"
                                  className="mdx-editor"
                                />
                              </div>
                            </div>
                            {normalizationApplied > 0 && !parseError && (
                              <Text size="xs" color="dimmed" mt={4} pl={4}>
                                Normalized {normalizationApplied} code fence{normalizationApplied === 1 ? '' : 's'} (language
                                aliases / blanks → canonical). Save to persist.
                              </Text>
                            )}
                            {normalizationPersistedAt && (
                              <Text size="xs" color="green" mt={4} pl={4}>
                                Normalizations persisted.
                              </Text>
                            )}
                          </div>
                        </React.Suspense>
                      )}
                    </div>
                  </div>

                  {/* Resizer (only meaningful on large screens) */}
                  <div
                    className="split-resizer"
                    role="separator"
                    aria-orientation="vertical"
                    onMouseDown={(e) => {
                      isResizingRef.current = true;
                      (e.currentTarget as HTMLDivElement).classList.add('active');
                      const onMove = (ev: MouseEvent) => {
                        if (!isResizingRef.current || !containerRef.current) return;
                        const rect = containerRef.current.getBoundingClientRect();
                        let ratio = (ev.clientX - rect.left) / rect.width;
                        ratio = Math.max(0.2, Math.min(0.8, ratio));
                        setPaneRatio(ratio);
                      };
                      const onUp = () => {
                        isResizingRef.current = false;
                        (e.currentTarget as HTMLDivElement).classList.remove('active');
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                    onDoubleClick={() => setPaneRatio(0.5)}
                  />

                  {/* Preview Section */}
                  <div
                    className="preview-section"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: 0,
                      flexBasis: `calc(${(1 - paneRatio) * 100}% - 4px)`,
                      flexGrow: 0,
                      flexShrink: 0
                    }}
                  >
                    <Group position="apart" mb={4} spacing={4} align="center">
                      <Text size="xs" color="dimmed">
                        Live Preview
                      </Text>
                      <Group spacing={4}>
                        {previewError && (
                          <Badge color="red" variant="light">
                            Preview Error
                          </Badge>
                        )}
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          onClick={() => setFullscreenPreview(true)}
                          title="Open preview in fullscreen"
                        >
                          <IconMaximize size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Card
                      p="sm"
                      withBorder
                      style={{
                        flex: 1,
                        overflow: 'auto',
                        fontSize: 14,
                        minHeight: 200,
                        maxHeight: '70vh',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <div key={active?.revisionId || active?.document.id} style={{ flex: 1, overflow: 'auto' }}>
                        {renderPreview()}
                      </div>
                    </Card>
                  </div>

                  {/* Table of Contents - spans full width on large screens */}
                  {toc.length > 0 && (
                    <div className="toc-section">
                      <Card withBorder p="xs" style={{ maxHeight: 120, overflow: 'auto' }}>
                        <Text size="xs" weight={500} mb={4}>
                          Headings
                        </Text>
                        <Stack spacing={2}>
                          {toc.map((h, i) => (
                            <Text key={i} size="xs" style={{ paddingLeft: (h.depth - 1) * 8 }}>
                              {h.value}
                            </Text>
                          ))}
                        </Stack>
                      </Card>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Stack align="center" justify="center" style={{ flex: 1 }}>
                <Text size="sm" color="dimmed">
                  Select a document from the list or create a new one to start editing.
                </Text>
              </Stack>
            )}
          </Card>
        </div>
      </div>

      {/* Create Document Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setNewDocSlug('');
          setNewDocTitle('');
          setSelectedTemplate(null);
        }}
        title="Create New Document"
        size="xl"
      >
        <Stack spacing="md">
          {!selectedTemplate ? (
            <>
              <Text size="sm" color="dimmed">
                Choose a template to get started with pre-built content and structure:
              </Text>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                {DOCUMENT_TEMPLATES.map((template) => (
                  <Card
                    key={template.id}
                    withBorder
                    p="md"
                    style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => setSelectedTemplate(template)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--mantine-color-blue-5)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--mantine-color-gray-4)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <Group spacing="sm" mb="xs">
                      {template.icon}
                      <Text weight={500} size="sm">
                        {template.name}
                      </Text>
                      <Badge
                        size="xs"
                        variant="light"
                        color={
                          template.category === 'guide'
                            ? 'blue'
                            : template.category === 'reference'
                              ? 'green'
                              : template.category === 'tutorial'
                                ? 'orange'
                                : 'gray'
                        }
                      >
                        {template.category}
                      </Badge>
                    </Group>
                    <Text size="xs" color="dimmed" lineClamp={3}>
                      {template.description}
                    </Text>
                  </Card>
                ))}
              </div>

              <Group position="right" spacing="sm">
                <Button
                  variant="subtle"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setNewDocSlug('');
                    setNewDocTitle('');
                    setSelectedTemplate(null);
                  }}
                >
                  Cancel
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Card withBorder p="sm" mb="md">
                <Group spacing="sm">
                  {selectedTemplate.icon}
                  <div style={{ flex: 1 }}>
                    <Text weight={500} size="sm">
                      {selectedTemplate.name}
                    </Text>
                    <Text size="xs" color="dimmed">
                      {selectedTemplate.description}
                    </Text>
                  </div>
                  <Button variant="subtle" size="xs" onClick={() => setSelectedTemplate(null)}>
                    Change Template
                  </Button>
                </Group>
              </Card>

              <TextInput
                label="Document Slug"
                description="URL-friendly identifier (e.g., 'getting-started')"
                placeholder="getting-started"
                value={newDocSlug}
                onChange={(e) => setNewDocSlug(e.target.value)}
                required
              />
              <TextInput
                label="Document Title"
                description="Human-readable title for the document"
                placeholder="Getting Started Guide"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                required
              />

              <Group position="right" spacing="sm">
                <Button variant="subtle" onClick={() => setSelectedTemplate(null)}>
                  Back
                </Button>
                <Button onClick={createNewDocument} disabled={!newDocSlug.trim() || !newDocTitle.trim()}>
                  Create Document
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      {/* Duplicate Document Modal */}
      <Modal
        opened={duplicateModalOpen}
        onClose={() => {
          setDuplicateModalOpen(false);
          setDuplicateDoc(null);
          setDuplicateSlug('');
        }}
        title={`Duplicate "${duplicateDoc?.title || ''}"`}
        size="md"
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            Create a copy of "{duplicateDoc?.slug}" with a new slug:
          </Text>
          <TextInput
            label="New Slug"
            description="URL-friendly identifier for the duplicate"
            placeholder={duplicateDoc?.slug + '-copy'}
            value={duplicateSlug}
            onChange={(e) => setDuplicateSlug(e.target.value)}
            required
          />
          <Group position="right" spacing="sm">
            <Button
              variant="subtle"
              onClick={() => {
                setDuplicateModalOpen(false);
                setDuplicateDoc(null);
                setDuplicateSlug('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => duplicateDoc && duplicate(duplicateDoc)}
              disabled={!duplicateSlug.trim()}
              loading={duplicating}
            >
              Duplicate Document
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Archive Document Modal */}
      <Modal
        opened={archiveModalOpen}
        onClose={() => {
          setArchiveModalOpen(false);
          setArchiveDoc(null);
        }}
        title="Archive Document"
        size="md"
      >
        <Stack spacing="md">
          <Text size="sm">Are you sure you want to archive "{archiveDoc?.title}"?</Text>
          <Text size="xs" color="dimmed">
            This document will disappear from active lists but can be restored later. The slug "{archiveDoc?.slug}" will become
            available for new documents.
          </Text>
          <Group position="right" spacing="sm">
            <Button
              variant="subtle"
              onClick={() => {
                setArchiveModalOpen(false);
                setArchiveDoc(null);
              }}
            >
              Cancel
            </Button>
            <Button color="red" onClick={() => archiveDoc && archive(archiveDoc)} loading={archiving}>
              Archive Document
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Document Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteDoc(null);
        }}
        title="Delete Document"
        size="md"
      >
        <Stack spacing="md">
          <Alert color="red" title="This action is permanent" variant="filled">
            <Text size="sm">
              You are about to permanently delete "{deleteDoc?.title}". This will remove the document, all its revisions, and
              any search index entries. This cannot be undone.
            </Text>
          </Alert>
          <Group position="right" spacing="sm">
            <Button
              variant="subtle"
              onClick={() => {
                setDeleteModalOpen(false);
                setDeleteDoc(null);
              }}
            >
              Cancel
            </Button>
            <Button color="red" onClick={() => deleteDoc && hardDelete(deleteDoc)} loading={deleting}>
              Delete Permanently
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Fullscreen Preview Modal */}
      <Modal
        opened={fullscreenPreview}
        onClose={() => setFullscreenPreview(false)}
        title={active ? `Preview: ${active.document.title}` : 'Preview'}
        size="calc(100vw - 3rem)"
        style={{
          maxWidth: 'none',
          margin: '1.5rem'
        }}
        styles={{
          modal: {
            height: 'calc(100vh - 8rem)',
            display: 'flex',
            flexDirection: 'column'
          },
          body: {
            flex: 1,
            overflow: 'auto',
            padding: 0
          }
        }}
      >
        <div
          style={{
            height: '100%',
            overflow: 'auto',
            backgroundColor: 'var(--color-background, #ffffff)'
          }}
        >
          {renderPreview(true)}
        </div>
      </Modal>

      {/* AI Assist Modal */}
      <Modal opened={aiOpen} onClose={() => setAiOpen(false)} title="AI Assist" size="xl">
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            Describe what you’d like to generate or improve. Choose Append to add a new section, Replace to rewrite the page, or
            Improve Selection to only modify highlighted text.
          </Text>
          <TextInput
            label="Instruction"
            placeholder="e.g., Add a Troubleshooting section with common errors and fixes"
            value={aiInstruction}
            onChange={(e) => setAiInstruction(e.target.value)}
          />
          <Group spacing="sm" align="center">
            <Text size="sm">Mode:</Text>
            <Button size="xs" variant={aiMode === 'APPEND' ? 'filled' : 'light'} onClick={() => setAiMode('APPEND')}>
              Append
            </Button>
            <Button size="xs" variant={aiMode === 'REPLACE' ? 'filled' : 'light'} onClick={() => setAiMode('REPLACE')}>
              Replace
            </Button>
            <Button size="xs" variant={aiMode === 'SECTION' ? 'filled' : 'light'} onClick={() => setAiMode('SECTION')}>
              Improve Selection
            </Button>
            <Divider orientation="vertical" />
            <Text size="sm">Style:</Text>
            <Button size="xs" variant={aiStyle === 'CONCISE' ? 'filled' : 'light'} onClick={() => setAiStyle('CONCISE')}>
              Concise
            </Button>
            <Button size="xs" variant={aiStyle === 'TUTORIAL' ? 'filled' : 'light'} onClick={() => setAiStyle('TUTORIAL')}>
              Tutorial
            </Button>
            <Button size="xs" variant={aiStyle === 'REFERENCE' ? 'filled' : 'light'} onClick={() => setAiStyle('REFERENCE')}>
              Reference
            </Button>
            <Button size="xs" variant={aiStyle === 'MARKETING' ? 'filled' : 'light'} onClick={() => setAiStyle('MARKETING')}>
              Marketing-lite
            </Button>
          </Group>
          <Group spacing="xs">
            <Text size="xs" color="dimmed">
              Presets:
            </Text>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setAiInstruction('Draft a Quickstart with a minimal GraphQL query, curl, and environment setup.')}
            >
              Quickstart
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() =>
                setAiInstruction(
                  'Add Integration Guides with TypeScript (fetch), Python (requests), Java (HttpClient), and PHP (cURL).'
                )
              }
            >
              Integrations
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setAiInstruction('Create a Troubleshooting section with 5 common errors, causes, and fixes.')}
            >
              Troubleshooting
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setAiInstruction('Add a concise FAQ section answering 5 frequent questions.')}
            >
              FAQ
            </Button>
          </Group>
          {aiMode === 'SECTION' && (
            <Text size="xs" color="dimmed">
              Selection: {editorSelection ? `${editorSelection.length} characters selected` : 'No selection detected'}
            </Text>
          )}
          <Group position="right" spacing="sm">
            <Button
              onClick={async () => {
                if (!active) return;
                setAiLoading(true);
                setAiError(null);
                setAiPreview('');
                try {
                  const currentMdx = aiMode === 'SECTION' && editorSelection ? editorSelection : active.mdx;
                  const res = await authenticatedFetch('/graphql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      query: `mutation Assist($input:AIDocAssistInput!){ aiDocAssist(input:$input){ snippet usedLLM note } }`,
                      variables: {
                        input: {
                          instruction: aiInstruction,
                          mode: aiMode,
                          style: aiStyle,
                          title: active.document.title,
                          currentMdx
                          // sdl omitted here; can be added if needed from server
                        }
                      }
                    })
                  });
                  const json = await res.json();
                  if (json.errors) throw new Error(json.errors[0].message);
                  const { snippet, usedLLM, note } = json.data.aiDocAssist as {
                    snippet: string;
                    usedLLM: boolean;
                    note?: string;
                  };
                  if (note) console.debug('AI Assist note:', note);
                  setAiPreview(snippet);
                } catch (e: any) {
                  const msg = e.message || 'AI Assist failed';
                  if (msg.includes('Unknown type "AIDocAssistInput"')) {
                    setAiError(
                      'AI Assist is not available on the server yet. Please restart/update the gateway to include the new schema.'
                    );
                  } else {
                    setAiError(msg);
                  }
                } finally {
                  setAiLoading(false);
                }
              }}
              loading={aiLoading}
            >
              Generate
            </Button>
          </Group>
          {aiError && (
            <Alert color="red" withCloseButton onClose={() => setAiError(null)}>
              {aiError}
            </Alert>
          )}
          {aiPreview && (
            <Card withBorder p="sm">
              <Text size="xs" color="dimmed" mb={6}>
                Preview (MDX fragment)
              </Text>
              <ScrollArea style={{ maxHeight: 260 }}>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{aiPreview}</pre>
              </ScrollArea>
              <Group position="right" spacing="sm" mt={8}>
                <Button
                  variant="light"
                  onClick={() => {
                    navigator.clipboard?.writeText(aiPreview).catch(() => {});
                  }}
                  leftIcon={<IconCopy size={14} />}
                >
                  Copy
                </Button>
                <Button
                  onClick={() => {
                    if (!active) return;
                    const sep = active.mdx.endsWith('\n') ? '\n' : '\n\n';
                    let next: string;
                    if (aiMode === 'REPLACE') {
                      next = aiPreview;
                    } else if (aiMode === 'SECTION' && editorSelection) {
                      const safeSel = editorSelection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      const re = new RegExp(safeSel);
                      next = active.mdx.replace(re, aiPreview);
                    } else {
                      const tailMatch = active.mdx.match(/##\s+([^\n]+)\s*$/);
                      const headMatch = aiPreview.match(/^##\s+([^\n]+)/);
                      let append = aiPreview;
                      if (tailMatch && headMatch && tailMatch[1].trim() === headMatch[1].trim()) {
                        append = aiPreview.replace(/^##\s+[^\n]+\n?/, '');
                      }
                      next = active.mdx + sep + append + '\n';
                    }
                    setActive({ ...active, mdx: next, dirty: true });
                    setAiOpen(false);
                    setAiPreview('');
                  }}
                  color="green"
                >
                  {aiMode === 'REPLACE' ? 'Replace Content' : aiMode === 'SECTION' ? 'Replace Selection' : 'Insert at End'}
                </Button>
              </Group>
            </Card>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
};

export default DocsContentManager;
