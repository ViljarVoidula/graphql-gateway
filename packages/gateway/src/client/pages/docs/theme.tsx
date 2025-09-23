import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  ColorInput,
  CopyButton,
  Divider,
  Group,
  LoadingOverlay,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  IconBorderRadius,
  IconCheck,
  IconColorSwatch,
  IconCopy,
  IconDownload,
  IconEye,
  IconLayout,
  IconPalette,
  IconRefresh,
  IconRuler,
  IconShadow,
  IconTypography,
  IconUpload,
  IconWand,
  IconX
} from '@tabler/icons-react';
import React, { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../utils/auth';
import { DEFAULT_THEME_TOKENS, THEME_PRESETS, type ThemePreset, type ThemeToken } from './theme-defaults';

interface TokenRow extends ThemeToken {
  original?: string;
  dirty?: boolean;
  saving?: boolean;
  error?: string | null;
}

const getCategoryIcon = (category: ThemeToken['category']) => {
  switch (category) {
    case 'colors':
      return <IconColorSwatch size={16} />;
    case 'typography':
      return <IconTypography size={16} />;
    case 'spacing':
      return <IconRuler size={16} />;
    case 'borders':
      return <IconBorderRadius size={16} />;
    case 'shadows':
      return <IconShadow size={16} />;
    case 'layout':
      return <IconLayout size={16} />;
    default:
      return <IconPalette size={16} />;
  }
};

export const DocsThemeEditor: React.FC = () => {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const MAX_ASSET_BYTES = Math.floor(4.8 * 1024 * 1024); // 4.8 MB limit
  // Branding (whitelabel) state
  const [brandName, setBrandName] = useState<string>('Gateway Docs');
  const [heroTitle, setHeroTitle] = useState<string>('Welcome to the Documentation Portal');
  const [heroSubtitle, setHeroSubtitle] = useState<string>(
    'Explore our comprehensive guides and API documentation. Stay updated with the latest!'
  );
  const [brandingInitial, setBrandingInitial] = useState<{
    brandName: string;
    heroTitle: string;
    heroSubtitle: string;
  } | null>(null);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [activeTab, setActiveTab] = useState<string>('colors');
  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastAppliedHash, setLastAppliedHash] = useState('');
  // We load the real docs app and allow navigation inside the iframe
  // Import helpers state
  const [importUrl, setImportUrl] = useState('');
  const [importImageUrl, setImportImageUrl] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; value: string; confidence?: number }>>([]);
  const [selectedSuggest, setSelectedSuggest] = useState<Record<string, boolean>>({});
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importUsedLLM, setImportUsedLLM] = useState<boolean>(false);
  const [importPalette, setImportPalette] = useState<string[] | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  // Branding assets
  const [heroUploading, setHeroUploading] = useState(false);
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [brandIconUploading, setBrandIconUploading] = useState(false);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [brandIconPreview, setBrandIconPreview] = useState<string | null>(null);
  const [heroDragOver, setHeroDragOver] = useState(false);
  const [faviconDragOver, setFaviconDragOver] = useState(false);
  const [brandIconDragOver, setBrandIconDragOver] = useState(false);

  // Helper function to merge defaults with loaded tokens
  const mergeWithDefaults = (loadedTokens: { name: string; value: string }[]): TokenRow[] => {
    const loadedMap = new Map(loadedTokens.map((t) => [t.name, t.value]));

    return DEFAULT_THEME_TOKENS.map((defaultToken) => ({
      ...defaultToken,
      value: loadedMap.get(defaultToken.name) || defaultToken.value,
      original: loadedMap.get(defaultToken.name) || defaultToken.value,
      dirty: false
    }));
  };

  // Helper function to initialize defaults if no tokens exist
  const initializeDefaults = (): TokenRow[] => {
    return DEFAULT_THEME_TOKENS.map((token) => ({
      ...token,
      original: token.value,
      dirty: false
    }));
  };

  // Apply a theme preset
  const applyPreset = async (preset: ThemePreset) => {
    setTokens((prevTokens) =>
      prevTokens.map((token) => {
        const presetValue = preset.tokens[token.name];
        if (presetValue) {
          return {
            ...token,
            value: presetValue,
            dirty: true
          };
        }
        return token;
      })
    );
    setPresetsModalOpen(false);
  };

  // Save a preset as the active theme
  const savePresetAsActive = async (preset: ThemePreset) => {
    try {
      setLoading(true);

      // Apply preset to current tokens
      const updatedTokens = tokens.map((token) => {
        const presetValue = preset.tokens[token.name];
        if (presetValue) {
          return { ...token, value: presetValue, dirty: true };
        }
        return token;
      });

      // Save all preset tokens to the backend
      const savePromises = updatedTokens
        .filter((token) => preset.tokens[token.name])
        .map(async (token) => {
          const res = await authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `mutation SetTheme($n:String!,$v:String!){ setThemeToken(name:$n,value:$v) }`,
              variables: { n: token.name, v: token.value }
            })
          });
          const json = await res.json();
          if (json.errors) throw new Error(json.errors[0].message);
          return token;
        });

      await Promise.all(savePromises);

      // Update local state to reflect saved changes
      setTokens((prevTokens) =>
        prevTokens.map((token) => {
          const presetValue = preset.tokens[token.name];
          if (presetValue) {
            return {
              ...token,
              value: presetValue,
              original: presetValue,
              dirty: false
            };
          }
          return token;
        })
      );

      setPresetsModalOpen(false);
      applyOverrides();

      // Notify docs UI to refresh theme CSS
      window.dispatchEvent(new CustomEvent('themeUpdated'));

      // Show success message
      console.log(`✅ Theme preset "${preset.name}" saved and applied to public documentation at /docs`);
    } catch (error: any) {
      setError(`Failed to save preset: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save all dirty tokens at once
  const saveAllTokens = async () => {
    const dirtyTokens = tokens.filter((t) => t.dirty);
    if (dirtyTokens.length === 0) return;

    try {
      setLoading(true);

      const savePromises = dirtyTokens.map(async (token, index) => {
        // Mark as saving
        setTokens((prev) =>
          prev.map((t, i) =>
            tokens.findIndex((tk) => tk.name === t.name) === tokens.findIndex((tk) => tk.name === token.name)
              ? { ...t, saving: true }
              : t
          )
        );

        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `mutation SetTheme($n:String!,$v:String!){ setThemeToken(name:$n,value:$v) }`,
            variables: { n: token.name, v: token.value }
          })
        });

        const json = await res.json();
        if (json.errors) throw new Error(`${token.name}: ${json.errors[0].message}`);

        return token;
      });

      await Promise.all(savePromises);

      // Mark all as saved
      setTokens((prev) =>
        prev.map((t) => (t.dirty ? { ...t, dirty: false, saving: false, original: t.value, error: null } : t))
      );

      // Notify docs UI to refresh theme CSS
      window.dispatchEvent(new CustomEvent('themeUpdated'));

      // Show success message
      console.log('✅ Themes saved successfully and applied to public documentation at /docs');
    } catch (error: any) {
      setError(`Failed to save tokens: ${error.message}`);
      // Reset saving states on error
      setTokens((prev) => prev.map((t) => ({ ...t, saving: false })));
    } finally {
      setLoading(false);
    }
  };

  function computeHash(rows: TokenRow[]) {
    return rows
      .map((r) => `${r.name}:${r.value}`)
      .sort()
      .join('|');
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Attempt detailed query first
      const detailedQuery = `query ThemeTokensDetailed { themeTokensDetailed { name value } docsThemePreviewHtml }`;
      let res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: detailedQuery })
      });
      let json = await res.json();
      if (json.errors) {
        const msg: string = json.errors.map((e: any) => e.message).join('\n');
        const missingField = /Cannot query field "themeTokensDetailed"/.test(msg);
        if (missingField) {
          // Fallback path: query legacy fields and parse CSS file for values
          const legacyQuery = `query LegacyThemeTokens { themeTokens }`;
          res = await authenticatedFetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: legacyQuery })
          });
          json = await res.json();
          if (json.errors) throw new Error(json.errors[0].message);
          const names: string[] = json.data.themeTokens;
          // Fetch current CSS to extract values
          let cssText = '';
          try {
            const cssRes = await fetch('/docs-theme.css');
            cssText = await cssRes.text();
          } catch {}
          const rootMatch = cssText.match(/:root\s*{([\s\S]*?)}/);
          const map: Record<string, string> = {};
          if (rootMatch) {
            const body = rootMatch[1];
            body.split(/;\n?|\n/).forEach((line) => {
              const m = line.match(/--([A-Za-z0-9_-]+):\s*([^;]+)\s*/);
              if (m) map[m[1]] = m[2].trim();
            });
          }
          const detailed = names.map((n) => ({ name: n, value: map[n] || '' }));

          // Use helper function to merge with defaults
          if (!hasInitialized && detailed.length === 0) {
            setTokens(initializeDefaults());
            setHasInitialized(true);
          } else {
            setTokens(mergeWithDefaults(detailed));
          }

          // Use real docs app for preview
          if (iframeRef.current) {
            setPreviewLoading(true);
            // src will be set via effect based on previewSlug
          }
        } else {
          throw new Error(msg);
        }
      } else {
        const detailed: { name: string; value: string }[] = json.data.themeTokensDetailed;

        // Use helper function to merge with defaults
        if (!hasInitialized && detailed.length === 0) {
          setTokens(initializeDefaults());
          setHasInitialized(true);
        } else {
          setTokens(mergeWithDefaults(detailed));
        }

        if (iframeRef.current) {
          setPreviewLoading(true);
          // src will be set via effect based on previewSlug
        }
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load tokens');
      // Initialize with defaults on error if not initialized
      if (!hasInitialized) {
        setTokens(initializeDefaults());
        setHasInitialized(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Load current docs branding (admin route)
  useEffect(() => {
    (async () => {
      try {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `query { docsBranding { brandName heroTitle heroSubtitle } }` })
        });
        const json = await res.json();
        const b = json?.data?.docsBranding;
        if (b) {
          setBrandName(b.brandName || brandName);
          setHeroTitle(b.heroTitle || heroTitle);
          setHeroSubtitle(b.heroSubtitle || heroSubtitle);
          setBrandingInitial({ brandName: b.brandName, heroTitle: b.heroTitle, heroSubtitle: b.heroSubtitle });
        }
      } catch (e) {
        // ignore in this view if fails; user might not have rights
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load existing branding assets for preview
  useEffect(() => {
    (async () => {
      try {
        const res = await authenticatedFetch('/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { docsBrandingAssets { heroImageUrl faviconUrl brandIconUrl } }`
          })
        });
        const json = await res.json();
        const assets = json?.data?.docsBrandingAssets;
        if (assets) {
          if (assets.heroImageUrl) {
            setHeroPreview(assets.heroImageUrl);
          }
          if (assets.faviconUrl) {
            setFaviconPreview(assets.faviconUrl);
          }
          if (assets.brandIconUrl) {
            setBrandIconPreview(assets.brandIconUrl);
          }
        }
      } catch (e) {
        // ignore if fails; user might not have rights or no assets exist
      }
    })();
  }, []);

  // No separate dropdown; navigate inside the iframe using docs app sidebar/links

  async function saveToken(idx: number) {
    setTokens((prev) => prev.map((t, i) => (i === idx ? { ...t, saving: true, error: null } : t)));
    const row = tokens[idx];
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation SetTheme($n:String!,$v:String!){ setThemeToken(name:$n,value:$v) }`,
          variables: { n: row.name, v: row.value }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      setTokens((prev) => prev.map((t, i) => (i === idx ? { ...t, dirty: false, saving: false, original: t.value } : t)));
      applyOverrides();
    } catch (e: any) {
      setTokens((prev) => prev.map((t, i) => (i === idx ? { ...t, saving: false, error: e.message } : t)));
    }
  }

  async function addNew() {
    if (!newName || !newValue) return;
    const newToken: TokenRow = {
      name: newName,
      value: newValue,
      category: 'colors', // Default category
      description: 'Custom token',
      dirty: true,
      original: ''
    };
    setTokens((prev) => [...prev, newToken]);
    setNewName('');
    setNewValue('');
    applyOverrides();
  }

  function applyOverrides() {
    if (!iframeRef.current) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    // Get all tokens with their current values
    const activeTokens = tokens.filter((t) => t.value && t.value.trim() !== '');
    const css = `:root{${activeTokens.map((t) => `--${t.name}:${t.value};`).join('')}}`;
    const adjustCss = `/* Theme Editor preview adjustments */
      /* Hide floating debug toggle button inside preview to avoid overlap */
      .docs-shell > button { display: none !important; }
    `;

    const hash = computeHash(tokens);
    // If style tag already present with same hash, skip; otherwise (new doc load) continue
    let styleTag = doc.getElementById('override-vars');
    if (hash === lastAppliedHash && styleTag) return;
    // Remove existing override styles if any
    if (styleTag) styleTag.remove();

    // Create new style tag with current tokens
    styleTag = doc.createElement('style');
    styleTag.id = 'override-vars';
    styleTag.textContent = css;
    doc.head.appendChild(styleTag);

    // Ensure layout adjustments style is present or refreshed
    let adjustTag = doc.getElementById('theme-preview-adjustments');
    if (adjustTag) adjustTag.remove();
    adjustTag = doc.createElement('style');
    adjustTag.id = 'theme-preview-adjustments';
    adjustTag.textContent = adjustCss;
    doc.head.appendChild(adjustTag);

    setLastAppliedHash(hash);

    // Trigger a small reflow to ensure styles are applied
    if (doc.body) {
      doc.body.style.display = 'none';
      doc.body.offsetHeight; // Force reflow
      doc.body.style.display = '';
    }

    // Ensure our override style stays last in <head> (in case SPA injects styles later)
    try {
      if (observerRef.current) observerRef.current.disconnect();
      const head = doc.head;
      const ensureLast = () => {
        const st = doc.getElementById('override-vars');
        if (st && head.lastElementChild !== st) {
          head.appendChild(st);
        }
      };
      // Run once immediately
      ensureLast();
      const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList') {
            // Defer to end of microtask to avoid thrash
            setTimeout(ensureLast, 0);
            break;
          }
        }
      });
      obs.observe(head, { childList: true });
      observerRef.current = obs;
    } catch {
      // best-effort only
    }
  }

  useEffect(() => {
    applyOverrides();
  }, [tokens]);

  // --- Import Theme Logic ---
  function paletteAutoMap(palette?: string[] | null, existingNames?: Set<string>) {
    const result: Array<{ name: string; value: string }> = [];
    if (!palette || !palette.length) return result;
    const addIfMissing = (name: string, idx: number) => {
      if (existingNames && existingNames.has(name)) return;
      const val = palette[idx] ?? palette[0];
      if (typeof val === 'string' && val.trim()) result.push({ name, value: val.trim() });
    };
    // Heuristic mapping
    addIfMissing('color-primary', 0);
    addIfMissing('color-primary-hover', 1);
    addIfMissing('color-primary-light', 3);
    addIfMissing('color-secondary', 2);
    // Background/text fallbacks (best-effort)
    addIfMissing('color-background', 4);
    addIfMissing('color-text-primary', 5);
    addIfMissing('color-text-inverse', 6);
    return result;
  }

  function applyImportResult(data: any) {
    setSuggestions(data.tokens || []);
    setSelectedSuggest(Object.fromEntries((data.tokens || []).map((t: any) => [t.name, true])));
    setImportNote(data.note || null);
    setImportUsedLLM(!!data.usedLLM);
    setImportPalette(data.palette || null);

    // Build combined list: explicit suggestions + palette-based fallbacks for missing key tokens
    const explicit: Array<{ name: string; value: string }> = (data.tokens || []).filter((t: any) => t && t.name && t.value);
    const nameSet = new Set(explicit.map((t) => t.name));
    const paletteMapped = paletteAutoMap(data.palette || null, nameSet);
    const combined = [...explicit, ...paletteMapped];

    if (combined.length) {
      setTokens((prev) =>
        prev.map((t) => {
          const match = combined.find((s) => s.name === t.name);
          return match ? { ...t, value: match.value, dirty: true } : t;
        })
      );
    }
  }
  async function importFromUrl() {
    if (!importUrl) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($url:String!){ aiImportThemeFromUrl(url:$url){ usedLLM note palette tokens{ name value confidence } } }`,
          variables: { url: importUrl }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const data = json.data.aiImportThemeFromUrl;
      applyImportResult(data);
    } catch (e: any) {
      setImportError(e.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  async function importFromImage() {
    if (!importImageUrl && !imageBase64) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($imageUrl:String,$imageBase64:String){ aiImportThemeFromImage(imageUrl:$imageUrl,imageBase64:$imageBase64){ usedLLM note palette tokens{ name value confidence } } }`,
          variables: { imageUrl: importImageUrl || null, imageBase64: imageBase64 || null }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0].message);
      const data = json.data.aiImportThemeFromImage;
      applyImportResult(data);
    } catch (e: any) {
      setImportError(e.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setImageBase64(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result; // handle data URL
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  function applySelectedSuggestions() {
    if (!suggestions.length) return;
    const selected = suggestions.filter((s) => selectedSuggest[s.name]);
    if (!selected.length) return;
    setTokens((prev) =>
      prev.map((t) => {
        const match = selected.find((s) => s.name === t.name);
        return match ? { ...t, value: match.value, dirty: true } : t;
      })
    );
  }

  function clearSuggestions() {
    setSuggestions([]);
    setSelectedSuggest({});
    setImportNote(null);
    setImportPalette(null);
    setImportUsedLLM(false);
  }

  // Force reload the iframe with cache-busting and preserve current in-iframe hash when possible
  const reloadPreview = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    setPreviewLoading(true);
    // Clear any previous timeout
    if (previewTimeoutRef.current) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    let hash = '#/home';
    try {
      const w = iframe.contentWindow;
      if (w && w.location && typeof w.location.hash === 'string' && w.location.hash) {
        hash = w.location.hash;
      }
    } catch {}
    const ts = Date.now();
    iframe.src = `/docs?t=${ts}${hash}`;
    // Fallback: if load event doesn't fire due to SPA nuances, hide spinner after 6s
    previewTimeoutRef.current = window.setTimeout(() => {
      setPreviewLoading(false);
      previewTimeoutRef.current = null;
    }, 6000);
  };

  // Helper to handle file uploads for hero, favicon, and brand icon
  const handleFileUpload = async (file: File, type: 'hero' | 'favicon' | 'brandIcon') => {
    if (file.size > MAX_ASSET_BYTES) {
      setBrandingError(
        `${type === 'hero' ? 'Hero image' : type === 'favicon' ? 'Favicon' : 'Brand icon'} is too large (${(
          file.size /
          1024 /
          1024
        ).toFixed(2)} MB). Max allowed is 4.8 MB.`
      );
      return;
    }

    // Validate file type
    const heroTypes = ['image/png', 'image/jpeg', 'image/webp'];
    const faviconTypes = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml'];
    const brandIconTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    const allowedTypes = type === 'hero' ? heroTypes : type === 'favicon' ? faviconTypes : brandIconTypes;

    if (!allowedTypes.includes(file.type)) {
      setBrandingError(
        `Invalid file type for ${type === 'hero' ? 'hero image' : type === 'favicon' ? 'favicon' : 'brand icon'}. ${
          type === 'hero'
            ? 'Accepted: PNG, JPEG, WEBP'
            : type === 'favicon'
              ? 'Accepted: ICO, PNG, SVG'
              : 'Accepted: PNG, JPEG, WEBP, SVG'
        }`
      );
      return;
    }

    // Show local thumbnail preview
    try {
      const reader = new FileReader();
      reader.onload = () => {
        if (type === 'hero') {
          setHeroPreview(reader.result as string);
        } else if (type === 'favicon') {
          setFaviconPreview(reader.result as string);
        } else {
          setBrandIconPreview(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    } catch {}

    // Upload file
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    if (type === 'hero') {
      setHeroUploading(true);
    } else if (type === 'favicon') {
      setFaviconUploading(true);
    } else {
      setBrandIconUploading(true);
    }

    try {
      const mutation = type === 'hero' ? 'setDocsHeroImage' : type === 'favicon' ? 'setDocsFavicon' : 'setBrandIcon';
      const res = await authenticatedFetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($b:String!,$ct:String!){ ${mutation}(base64:$b,contentType:$ct) }`,
          variables: {
            b: base64,
            ct: file.type || (type === 'hero' ? 'image/png' : type === 'favicon' ? 'image/x-icon' : 'image/png')
          }
        })
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Upload failed');

      // Show success notification
      showNotification({
        title: 'Upload successful',
        message: `${type === 'hero' ? 'Hero image' : type === 'favicon' ? 'Favicon' : 'Brand icon'} uploaded successfully`,
        color: 'green'
      });

      // Trigger brand icon refresh if it's a brand icon upload
      if (type === 'brandIcon') {
        window.dispatchEvent(new CustomEvent('brandIconUpdated'));
      }

      reloadPreview();
    } catch (err: any) {
      setBrandingError(
        err?.message || `Failed to upload ${type === 'hero' ? 'hero image' : type === 'favicon' ? 'favicon' : 'brand icon'}`
      );
    } finally {
      if (type === 'hero') {
        setHeroUploading(false);
      } else if (type === 'favicon') {
        setFaviconUploading(false);
      } else {
        setBrandIconUploading(false);
      }
    }
  };

  return (
    <Stack>
      <Group>
        <IconPalette size={28} />
        <Title order={2}>Documentation Theme Editor</Title>
        <Badge color="grape" variant="light">
          Enhanced
        </Badge>
      </Group>
      <Text size="sm" color="dimmed">
        Customize the visual design of your documentation portal with professional theme tokens and presets. Changes are
        automatically applied to the public documentation at <code>/docs</code>.
      </Text>

      <Group align="flex-start" spacing="lg" grow noWrap>
        <Stack style={{ flex: 1, minWidth: 400 }} spacing="md">
          {/* Docs Branding Section */}
          <Card withBorder shadow="sm" p="md">
            <Group position="apart" mb="sm">
              <Group spacing="xs">
                <IconPalette size={20} />
                <Text weight={600}>Docs Branding</Text>
                <Badge color="gray" variant="light" radius="sm">
                  Whitelabel
                </Badge>
              </Group>
            </Group>
            {brandingError && (
              <Alert color="red" title="Failed to save" mb="sm">
                {brandingError}
              </Alert>
            )}
            <Stack spacing="xs">
              <TextInput label="Brand Name" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
              <TextInput label="Hero Title" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} />
              <TextInput label="Hero Subtitle" value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} />
              <Divider my="xs" label="Brand Images" labelPosition="center" />
              <Stack spacing={6}>
                <Text size="sm" weight={500}>
                  Hero Image
                </Text>
                <Paper
                  withBorder
                  p="md"
                  style={{
                    borderStyle: 'dashed',
                    borderWidth: 2,
                    borderColor: heroDragOver ? '#339af0' : heroPreview ? '#51cf66' : '#ced4da',
                    backgroundColor: heroDragOver ? '#e7f5ff' : heroPreview ? '#f3f9f3' : '#f8f9fa',
                    cursor: heroUploading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!heroUploading) setHeroDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setHeroDragOver(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setHeroDragOver(false);
                    if (heroUploading) return;
                    const file = e.dataTransfer.files[0];
                    if (file) await handleFileUpload(file, 'hero');
                  }}
                  onClick={() => {
                    if (heroUploading) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/webp';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) await handleFileUpload(file, 'hero');
                    };
                    input.click();
                  }}
                >
                  {heroUploading ? (
                    <Group position="center" spacing="xs">
                      <IconUpload size={24} color="#868e96" />
                      <Text color="dimmed" align="center">
                        Uploading hero image...
                      </Text>
                    </Group>
                  ) : heroPreview ? (
                    <Stack spacing="xs" align="center">
                      <img src={heroPreview} alt="Hero preview" style={{ maxWidth: '100%', maxHeight: 100, borderRadius: 4 }} />
                      <Group spacing="xs">
                        <Text size="xs" color="green" weight={500}>
                          Hero image ready
                        </Text>
                        <ActionIcon
                          size="xs"
                          color="red"
                          variant="light"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHeroPreview(null);
                          }}
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  ) : (
                    <Stack align="center" spacing="xs">
                      <IconUpload size={32} color={heroDragOver ? '#339af0' : '#868e96'} />
                      <Text color="dimmed" align="center" size="sm">
                        {heroDragOver ? 'Drop hero image here' : 'Drag & drop or click to upload'}
                      </Text>
                    </Stack>
                  )}
                </Paper>
                <Text size="xs" color="dimmed">
                  Max 4.8 MB. Accepted: PNG, JPEG, WEBP. Recommended ~1600×400 for a wide banner.
                </Text>
              </Stack>
              <Stack spacing={6}>
                <Text size="sm" weight={500}>
                  Brand Icon
                </Text>
                <Paper
                  withBorder
                  p="md"
                  style={{
                    borderStyle: 'dashed',
                    borderWidth: 2,
                    borderColor: brandIconDragOver ? '#339af0' : brandIconPreview ? '#51cf66' : '#ced4da',
                    backgroundColor: brandIconDragOver ? '#e7f5ff' : brandIconPreview ? '#f3f9f3' : '#f8f9fa',
                    cursor: brandIconUploading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!brandIconUploading) setBrandIconDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setBrandIconDragOver(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setBrandIconDragOver(false);
                    if (brandIconUploading) return;
                    const file = e.dataTransfer.files[0];
                    if (file) await handleFileUpload(file, 'brandIcon');
                  }}
                  onClick={() => {
                    if (brandIconUploading) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) await handleFileUpload(file, 'brandIcon');
                    };
                    input.click();
                  }}
                >
                  {brandIconUploading ? (
                    <Group position="center" spacing="xs">
                      <IconUpload size={24} color="#868e96" />
                      <Text color="dimmed" align="center">
                        Uploading brand icon...
                      </Text>
                    </Group>
                  ) : brandIconPreview ? (
                    <Stack spacing="xs" align="center">
                      <img src={brandIconPreview} alt="Brand icon preview" style={{ width: 48, height: 48, borderRadius: 4 }} />
                      <Group spacing="xs">
                        <Text size="xs" color="green" weight={500}>
                          Brand icon ready
                        </Text>
                        <ActionIcon
                          size="xs"
                          color="red"
                          variant="light"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBrandIconPreview(null);
                          }}
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  ) : (
                    <Stack align="center" spacing="xs">
                      <IconUpload size={32} color={brandIconDragOver ? '#339af0' : '#868e96'} />
                      <Text color="dimmed" align="center" size="sm">
                        {brandIconDragOver ? 'Drop brand icon here' : 'Drag & drop or click to upload'}
                      </Text>
                    </Stack>
                  )}
                </Paper>
                <Text size="xs" color="dimmed">
                  Max 4.8 MB. Accepted: PNG, JPEG, WEBP, SVG. Recommended square (e.g., 64×64 or 128×128). Displays in admin UI.
                </Text>
              </Stack>
              <Stack spacing={6}>
                <Text size="sm" weight={500}>
                  Favicon
                </Text>
                <Paper
                  withBorder
                  p="md"
                  style={{
                    borderStyle: 'dashed',
                    borderWidth: 2,
                    borderColor: faviconDragOver ? '#339af0' : faviconPreview ? '#51cf66' : '#ced4da',
                    backgroundColor: faviconDragOver ? '#e7f5ff' : faviconPreview ? '#f3f9f3' : '#f8f9fa',
                    cursor: faviconUploading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!faviconUploading) setFaviconDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setFaviconDragOver(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setFaviconDragOver(false);
                    if (faviconUploading) return;
                    const file = e.dataTransfer.files[0];
                    if (file) await handleFileUpload(file, 'favicon');
                  }}
                  onClick={() => {
                    if (faviconUploading) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/x-icon,image/png,image/svg+xml';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) await handleFileUpload(file, 'favicon');
                    };
                    input.click();
                  }}
                >
                  {faviconUploading ? (
                    <Group position="center" spacing="xs">
                      <IconUpload size={24} color="#868e96" />
                      <Text color="dimmed" align="center">
                        Uploading favicon...
                      </Text>
                    </Group>
                  ) : faviconPreview ? (
                    <Stack spacing="xs" align="center">
                      <img src={faviconPreview} alt="Favicon preview" style={{ width: 48, height: 48, borderRadius: 4 }} />
                      <Group spacing="xs">
                        <Text size="xs" color="green" weight={500}>
                          Favicon ready
                        </Text>
                        <ActionIcon
                          size="xs"
                          color="red"
                          variant="light"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFaviconPreview(null);
                          }}
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  ) : (
                    <Stack align="center" spacing="xs">
                      <IconUpload size={32} color={faviconDragOver ? '#339af0' : '#868e96'} />
                      <Text color="dimmed" align="center" size="sm">
                        {faviconDragOver ? 'Drop favicon here' : 'Drag & drop or click to upload'}
                      </Text>
                    </Stack>
                  )}
                </Paper>
                <Text size="xs" color="dimmed">
                  Max 4.8 MB. Accepted: ICO, PNG, SVG. Recommended square (e.g., 32×32 or 64×64). Browser tab icon.
                </Text>
              </Stack>
              <Group spacing="xs">
                <Button
                  size="xs"
                  loading={brandingSaving}
                  disabled={
                    brandingSaving ||
                    (brandingInitial !== null &&
                      brandingInitial.brandName === brandName &&
                      brandingInitial.heroTitle === heroTitle &&
                      brandingInitial.heroSubtitle === heroSubtitle)
                  }
                  onClick={async () => {
                    setBrandingSaving(true);
                    setBrandingError(null);
                    try {
                      const res = await authenticatedFetch('/graphql', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          query: `mutation Set($brandName:String,$heroTitle:String,$heroSubtitle:String){ setDocsBranding(brandName:$brandName,heroTitle:$heroTitle,heroSubtitle:$heroSubtitle){ brandName heroTitle heroSubtitle } }`,
                          variables: { brandName, heroTitle, heroSubtitle }
                        })
                      });
                      const json = await res.json();
                      if (json.errors) throw new Error(json.errors[0]?.message || 'Failed to save');
                      const b = json.data.setDocsBranding;
                      setBrandingInitial(b);
                      // Reload preview to reflect new branding
                      reloadPreview();
                    } catch (e: any) {
                      setBrandingError(e?.message || 'Failed to save');
                    } finally {
                      setBrandingSaving(false);
                    }
                  }}
                >
                  Save
                </Button>
                {brandingInitial &&
                  (brandingInitial.brandName !== brandName ||
                    brandingInitial.heroTitle !== heroTitle ||
                    brandingInitial.heroSubtitle !== heroSubtitle) && (
                    <Button
                      variant="subtle"
                      size="xs"
                      disabled={brandingSaving}
                      onClick={() => {
                        setBrandName(brandingInitial.brandName);
                        setHeroTitle(brandingInitial.heroTitle);
                        setHeroSubtitle(brandingInitial.heroSubtitle);
                      }}
                    >
                      Reset
                    </Button>
                  )}
              </Group>
              <Alert color="blue" variant="light">
                <Text size="xs">
                  Brand name updates the sidebar heading in the public docs. Hero text controls the large heading and subtitle
                  on the docs homepage.
                </Text>
              </Alert>
            </Stack>
          </Card>

          {/* Import Theme Section */}
          <Card withBorder shadow="sm" p="md">
            <Group position="apart" mb="sm">
              <Group spacing="xs">
                <IconPalette size={20} />
                <Text weight={600}>Import Theme</Text>
                {importUsedLLM && (
                  <Badge color="grape" variant="light" radius="sm">
                    AI assisted
                  </Badge>
                )}
              </Group>
            </Group>
            <Stack spacing="xs">
              <Group align="flex-end" grow>
                <TextInput
                  label="From Page URL"
                  placeholder="https://example.com"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                />
                <Button onClick={importFromUrl} loading={importLoading} disabled={!importUrl}>
                  Import from URL
                </Button>
              </Group>
              <Group align="flex-end" grow>
                <TextInput
                  label="From Image URL (optional)"
                  placeholder="https://example.com/logo.png"
                  value={importImageUrl}
                  onChange={(e) => setImportImageUrl(e.target.value)}
                />
                <input type="file" accept="image/*" onChange={onFileChange} />
                <Button onClick={importFromImage} loading={importLoading} disabled={!importImageUrl && !imageBase64}>
                  Import from Image
                </Button>
              </Group>
              {importError && (
                <Alert color="red" title="Import Error">
                  {importError}
                </Alert>
              )}
              {importPalette && importPalette.length > 0 && (
                <Group spacing={6}>
                  <Text size="xs" color="dimmed">
                    Palette:
                  </Text>
                  {importPalette.map((c, idx) => (
                    <div
                      key={idx}
                      title={c}
                      style={{ width: 18, height: 18, borderRadius: 3, background: c, border: '1px solid #ddd' }}
                    />
                  ))}
                </Group>
              )}
              {importNote && (
                <Text size="xs" color="dimmed">
                  {importNote}
                </Text>
              )}
            </Stack>
            {suggestions.length > 0 && (
              <Card withBorder shadow="xs" p="sm" mt="sm">
                <Group position="apart" mb="xs">
                  <Text weight={600} size="sm">
                    Suggestions ({suggestions.length})
                  </Text>
                  <Group spacing={6}>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => setSelectedSuggest(Object.fromEntries(suggestions.map((s) => [s.name, true])))}
                    >
                      Select All
                    </Button>
                    <Button size="xs" variant="light" onClick={() => setSelectedSuggest({})}>
                      Clear
                    </Button>
                    <Button size="xs" color="green" onClick={applySelectedSuggestions}>
                      Apply Selected
                    </Button>
                    <Button size="xs" variant="outline" onClick={clearSuggestions}>
                      Dismiss
                    </Button>
                  </Group>
                </Group>
                <ScrollArea style={{ maxHeight: 220 }}>
                  <Stack spacing={6}>
                    {suggestions.map((s) => {
                      const isColor = /^#|^(rgb|hsl)a?\(/i.test(s.value);
                      return (
                        <Group key={s.name} position="apart" align="center" noWrap>
                          <Group spacing={8} align="center" style={{ minWidth: 0, flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={!!selectedSuggest[s.name]}
                              onChange={(e) => setSelectedSuggest((prev) => ({ ...prev, [s.name]: e.target.checked }))}
                              style={{ marginRight: 6 }}
                            />
                            <Text
                              size="sm"
                              style={{ width: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {s.name}
                            </Text>
                            {isColor && (
                              <div
                                title={s.value}
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 3,
                                  background: s.value,
                                  border: '1px solid #ddd'
                                }}
                              />
                            )}
                            <Text size="sm" style={{ fontFamily: 'monospace' }}>
                              {s.value}
                            </Text>
                          </Group>
                          {typeof s.confidence === 'number' && (
                            <Badge
                              color={s.confidence >= 80 ? 'green' : s.confidence >= 50 ? 'yellow' : 'gray'}
                              variant="light"
                            >
                              {s.confidence}%
                            </Badge>
                          )}
                        </Group>
                      );
                    })}
                  </Stack>
                </ScrollArea>
              </Card>
            )}
          </Card>
          {/* Theme Presets Section */}
          <Card withBorder shadow="sm" p="md">
            <Group position="apart" mb="sm">
              <Group spacing="xs">
                <IconWand size={20} />
                <Text weight={600}>Theme Presets</Text>
              </Group>
              <Button
                size="xs"
                variant="light"
                onClick={() => setPresetsModalOpen(true)}
                leftIcon={<IconColorSwatch size={14} />}
              >
                Browse Presets
              </Button>
            </Group>
            <Text size="xs" color="dimmed">
              Apply professionally designed themes instantly or save them as your active documentation theme.
            </Text>
          </Card>

          {/* Batch Actions */}
          {tokens.some((t) => t.dirty) && (
            <Card withBorder shadow="sm" p="md" style={{ backgroundColor: '#fef3c7' }}>
              <Group position="apart">
                <Group spacing="xs">
                  <IconDownload size={20} />
                  <div>
                    <Text weight={600} size="sm">
                      Unsaved Changes
                    </Text>
                    <Text size="xs" color="dimmed">
                      {tokens.filter((t) => t.dirty).length} tokens have been modified
                    </Text>
                  </div>
                </Group>
                <Group spacing="xs">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTokens((prev) =>
                        prev.map((t) => ({
                          ...t,
                          value: t.original || t.value,
                          dirty: false
                        }))
                      );
                      applyOverrides();
                    }}
                  >
                    Reset All
                  </Button>
                  <Button size="sm" onClick={saveAllTokens} loading={loading} leftIcon={<IconDownload size={14} />}>
                    Save All Changes
                  </Button>
                </Group>
              </Group>
            </Card>
          )}

          {/* Add New Token Section */}
          <Card withBorder shadow="sm" p="md">
            <Group position="apart" mb="sm">
              <Text weight={600}>Add Custom Token</Text>
            </Group>
            <Group align="flex-end" spacing="xs">
              <TextInput
                label="Name"
                placeholder="color-accent"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{ flex: 1 }}
              />
              <TextInput
                label="Value"
                placeholder="#2563eb"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                style={{ flex: 1 }}
              />
              <Button onClick={addNew} disabled={!newName || !newValue}>
                Add
              </Button>
            </Group>
          </Card>

          {loading && <Text>Loading tokens…</Text>}
          {error && (
            <Alert color="red" title="Loading Error">
              {error}
            </Alert>
          )}

          {!loading && !error && (
            <Card withBorder shadow="sm" p={0}>
              <Tabs value={activeTab} onTabChange={(value) => setActiveTab(value || 'colors')} orientation="horizontal">
                <Tabs.List p="md" style={{ borderBottom: '1px solid #eee' }}>
                  <Tabs.Tab value="colors" icon={<IconColorSwatch size={16} />}>
                    Colors
                  </Tabs.Tab>
                  <Tabs.Tab value="typography" icon={<IconTypography size={16} />}>
                    Typography
                  </Tabs.Tab>
                  <Tabs.Tab value="spacing" icon={<IconRuler size={16} />}>
                    Spacing
                  </Tabs.Tab>
                  <Tabs.Tab value="borders" icon={<IconBorderRadius size={16} />}>
                    Borders
                  </Tabs.Tab>
                  <Tabs.Tab value="shadows" icon={<IconShadow size={16} />}>
                    Shadows
                  </Tabs.Tab>
                  <Tabs.Tab value="layout" icon={<IconLayout size={16} />}>
                    Layout
                  </Tabs.Tab>
                </Tabs.List>

                {(['colors', 'typography', 'spacing', 'borders', 'shadows', 'layout'] as const).map((category) => (
                  <Tabs.Panel key={category} value={category} p="md">
                    <ScrollArea style={{ maxHeight: '50vh' }}>
                      <Stack spacing="sm">
                        {tokens
                          .filter((t) => t.category === category)
                          .map((t, i) => {
                            const globalIndex = tokens.findIndex((token) => token.name === t.name);
                            return (
                              <Card key={t.name} withBorder p="sm" radius="md">
                                <Group position="apart" align="flex-start" noWrap>
                                  <Stack spacing={4} style={{ flex: 1 }}>
                                    <Group spacing="xs">
                                      {getCategoryIcon(t.category)}
                                      <Text weight={500} size="sm">
                                        {t.name}
                                      </Text>
                                      {t.dirty && (
                                        <Badge size="xs" color="yellow">
                                          unsaved
                                        </Badge>
                                      )}
                                    </Group>
                                    <Text size="xs" color="dimmed">
                                      {t.description}
                                    </Text>
                                    <Group spacing="xs" align="flex-end" grow>
                                      {t.category === 'colors' && t.value.startsWith('#') ? (
                                        <ColorInput
                                          value={t.value}
                                          onChange={(value) =>
                                            setTokens((prev) =>
                                              prev.map((row, idx) =>
                                                idx === globalIndex ? { ...row, value, dirty: true } : row
                                              )
                                            )
                                          }
                                          label="Color Value"
                                          size="sm"
                                        />
                                      ) : (
                                        <TextInput
                                          value={t.value}
                                          onChange={(e) =>
                                            setTokens((prev) =>
                                              prev.map((row, idx) =>
                                                idx === globalIndex ? { ...row, value: e.target.value, dirty: true } : row
                                              )
                                            )
                                          }
                                          label="Value"
                                          size="sm"
                                        />
                                      )}
                                      <Group spacing={4}>
                                        <Tooltip label="Save token">
                                          <ActionIcon
                                            color="green"
                                            loading={t.saving}
                                            disabled={!t.dirty || t.saving}
                                            onClick={() => saveToken(globalIndex)}
                                          >
                                            <IconCheck size={14} />
                                          </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Revert changes" disabled={!t.dirty}>
                                          <ActionIcon
                                            color="gray"
                                            disabled={!t.dirty}
                                            onClick={() =>
                                              setTokens((prev) =>
                                                prev.map((row, idx) =>
                                                  idx === globalIndex
                                                    ? { ...row, value: row.original || '', dirty: false }
                                                    : row
                                                )
                                              )
                                            }
                                          >
                                            <IconRefresh size={14} />
                                          </ActionIcon>
                                        </Tooltip>
                                      </Group>
                                    </Group>
                                    {t.error && (
                                      <Alert color="red" title="Save failed" p="xs">
                                        <Text size="xs">{t.error}</Text>
                                      </Alert>
                                    )}
                                  </Stack>
                                </Group>
                              </Card>
                            );
                          })}
                      </Stack>
                    </ScrollArea>
                  </Tabs.Panel>
                ))}
              </Tabs>
            </Card>
          )}
        </Stack>

        {/* Preview Panel */}
        <Card
          withBorder
          shadow="sm"
          p={0}
          style={{ flex: 2, height: '78vh', minHeight: 480, position: 'relative', display: 'flex', flexDirection: 'column' }}
        >
          <Group p="sm" position="apart" style={{ borderBottom: '1px solid #eee' }}>
            <Group spacing="xs">
              <IconEye size={16} />
              <Text weight={500}>Live Preview</Text>
              <Badge color="grape" variant="light" radius="sm">
                Real-time updates
              </Badge>
            </Group>
            <Group spacing="xs">
              <CopyButton value={tokens.map((t) => `--${t.name}:${t.value};`).join('\n')}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? 'Copied!' : 'Copy CSS variables'}>
                    <Button size="xs" variant="light" onClick={copy} leftIcon={<IconCopy size={14} />}>
                      {copied ? 'Copied' : 'Copy CSS'}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
              <Button size="xs" variant="outline" onClick={reloadPreview} leftIcon={<IconRefresh size={14} />}>
                Reload
              </Button>
            </Group>
          </Group>
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <LoadingOverlay visible={previewLoading} />
            <iframe
              ref={iframeRef}
              title="Docs Theme Preview"
              style={{ display: 'block', width: '100%', height: '100%', border: '0' }}
              sandbox="allow-scripts allow-same-origin"
              src={`/docs?t=init#/${'home'}`}
              onLoad={() => {
                // Apply overrides after docs app loads
                try {
                  applyOverrides();
                } finally {
                  setPreviewLoading(false);
                  if (previewTimeoutRef.current) {
                    window.clearTimeout(previewTimeoutRef.current);
                    previewTimeoutRef.current = null;
                  }
                }
              }}
            />
          </div>
        </Card>
      </Group>

      {/* Theme Presets Modal */}
      <Modal
        opened={presetsModalOpen}
        onClose={() => setPresetsModalOpen(false)}
        title={
          <Group spacing="xs">
            <IconColorSwatch size={20} />
            <Text weight={600}>Theme Presets</Text>
          </Group>
        }
        size="lg"
      >
        <Stack>
          <Text size="sm" color="dimmed">
            Choose from professionally designed theme presets. You can preview them first or save them directly as your active
            documentation theme.
          </Text>
          <Stack spacing="md">
            {THEME_PRESETS.map((preset) => (
              <Paper key={preset.name} withBorder p="md" radius="md">
                <Group position="apart" align="flex-start">
                  <Stack spacing={4} style={{ flex: 1 }}>
                    <Text weight={500}>{preset.name}</Text>
                    <Text size="sm" color="dimmed">
                      {preset.description}
                    </Text>
                    <Group spacing="xs" mt="xs">
                      {Object.entries(preset.tokens).map(([name, value]) => (
                        <div
                          key={name}
                          style={{
                            width: 24,
                            height: 24,
                            backgroundColor: value,
                            borderRadius: 4,
                            border: '1px solid #ddd'
                          }}
                          title={`${name}: ${value}`}
                        />
                      ))}
                    </Group>
                  </Stack>
                  <Group spacing="xs">
                    <Button size="sm" variant="light" onClick={() => applyPreset(preset)}>
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      color="green"
                      onClick={() => savePresetAsActive(preset)}
                      leftIcon={<IconDownload size={14} />}
                      loading={loading}
                    >
                      Save as Active
                    </Button>
                  </Group>
                </Group>
              </Paper>
            ))}
          </Stack>
          <Divider />
          <Group position="center">
            <Text size="xs" color="dimmed" align="center">
              💡 <strong>Preview</strong> applies changes temporarily for testing.
              <br />
              <strong>Save as Active</strong> immediately saves the theme to your public documentation.
            </Text>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
