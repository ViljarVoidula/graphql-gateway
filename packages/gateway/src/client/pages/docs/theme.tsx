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
  IconWand
} from '@tabler/icons-react';
import React, { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../../utils/auth';
import { DOCS_PREVIEW_HTML } from './preview-template';
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
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [activeTab, setActiveTab] = useState<string>('colors');
  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lastAppliedHash, setLastAppliedHash] = useState('');

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

          // Use enhanced preview HTML template
          if (iframeRef.current) {
            setPreviewLoading(true);
            const doc = iframeRef.current.contentDocument;
            if (doc) {
              doc.open();
              doc.write(DOCS_PREVIEW_HTML);
              doc.close();
            }
            requestAnimationFrame(() => {
              applyOverrides();
              setPreviewLoading(false);
            });
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
          const doc = iframeRef.current.contentDocument;
          if (doc) {
            doc.open();
            // Use the enhanced preview template or fallback to server response
            doc.write(json.data.docsThemePreviewHtml || DOCS_PREVIEW_HTML);
            doc.close();
          }
          requestAnimationFrame(() => {
            applyOverrides();
            setPreviewLoading(false);
          });
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

    const hash = computeHash(tokens);
    if (hash === lastAppliedHash) return;

    // Remove existing override styles
    let styleTag = doc.getElementById('override-vars');
    if (styleTag) {
      styleTag.remove();
    }

    // Create new style tag with current tokens
    styleTag = doc.createElement('style');
    styleTag.id = 'override-vars';
    styleTag.textContent = css;
    doc.head.appendChild(styleTag);

    setLastAppliedHash(hash);

    // Trigger a small reflow to ensure styles are applied
    if (doc.body) {
      doc.body.style.display = 'none';
      doc.body.offsetHeight; // Force reflow
      doc.body.style.display = '';
    }
  }

  useEffect(() => {
    applyOverrides();
  }, [tokens]);

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
        <Card withBorder shadow="sm" p={0} style={{ flex: 2, minHeight: '70vh', position: 'relative' }}>
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
              <Button size="xs" variant="outline" onClick={() => load()} leftIcon={<IconRefresh size={14} />}>
                Reload
              </Button>
            </Group>
          </Group>
          <div style={{ position: 'relative', height: 'calc(100% - 60px)' }}>
            <LoadingOverlay visible={previewLoading} />
            <iframe
              ref={iframeRef}
              title="Docs Theme Preview"
              style={{ width: '100%', height: '100%', border: '0' }}
              sandbox="allow-scripts allow-same-origin"
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
