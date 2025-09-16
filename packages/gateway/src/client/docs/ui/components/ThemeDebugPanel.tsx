import React, { useEffect, useMemo, useState } from 'react';

interface ThemeVar {
  name: string;
  value: string;
  source: 'css' | 'override';
}

interface ThemeDebugPanelProps {
  open: boolean;
  onClose: () => void;
  expected?: string[];
}

// Utility: parse :root { --var:value; } blocks from a CSS string
function extractRootVariables(cssText: string): Record<string, string> {
  const map: Record<string, string> = {};
  const rootMatch = cssText.match(/:root\s*{([\s\S]*?)}/);
  if (!rootMatch) return map;
  rootMatch[1].split(/;\s*/).forEach((line) => {
    const m = line.match(/--([A-Za-z0-9_-]+):\s*([^;]+)\s*/);
    if (m) map[m[1]] = m[2];
  });
  return map;
}

function readComputedRoot(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  // heuristic: only include those starting with --color or --font or --spacing etc.
  const prefixes = [
    '--color-',
    '--font-',
    '--spacing-',
    '--border-',
    '--shadow-',
    '--line-height',
    '--transition',
    '--max-width'
  ];
  for (let i = 0; i < styles.length; i++) {
    const prop = styles[i];
    if (prefixes.some((p) => prop.startsWith(p))) {
      out[prop.replace(/^--/, '')] = styles.getPropertyValue(prop).trim();
    }
  }
  return out;
}

export const ThemeDebugPanel: React.FC<ThemeDebugPanelProps> = ({ open, onClose, expected }) => {
  const [cssVars, setCssVars] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('docsThemeOverrides') || '{}');
    } catch {
      return {};
    }
  });
  const [rawCss, setRawCss] = useState('');

  // Load link CSS text
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const link = document.querySelector('link[href*="/docs-theme.css"]') as HTMLLinkElement | null;
        if (link?.href) {
          const res = await fetch(link.href);
          const text = await res.text();
          setRawCss(text);
          setCssVars(extractRootVariables(text));
        }
      } catch {}
    })();
  }, [open]);

  const merged = useMemo(() => {
    return { ...cssVars, ...overrides };
  }, [cssVars, overrides]);

  const missing = useMemo(() => {
    if (!expected) return [];
    return expected.filter((name) => !(name in merged));
  }, [expected, merged]);

  const computedSnapshot = useMemo(() => readComputedRoot(), [cssVars, overrides]);

  function updateOverride(name: string, value: string) {
    setOverrides((prev) => {
      const next = { ...prev, [name]: value };
      localStorage.setItem('docsThemeOverrides', JSON.stringify(next));
      applyOverrideStyle(next);
      return next;
    });
  }

  function removeOverride(name: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[name];
      localStorage.setItem('docsThemeOverrides', JSON.stringify(next));
      applyOverrideStyle(next);
      return next;
    });
  }

  function applyOverrideStyle(map: Record<string, string>) {
    let tag = document.getElementById('docs-theme-overrides');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'docs-theme-overrides';
      document.head.appendChild(tag);
    }
    const body = Object.entries(map)
      .map(([k, v]) => `--${k}:${v};`)
      .join('');
    tag.textContent = `:root{${body}}`;
  }

  useEffect(() => {
    // Apply persisted overrides on mount
    applyOverrideStyle(overrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  const sorted = Object.keys(merged).sort();

  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        right: 20,
        width: 420,
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: 8,
        boxShadow: '0 4px 18px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '70vh'
      }}
    >
      <div
        style={{
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid #eee',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <strong style={{ fontSize: 14 }}>Theme Debug</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ fontSize: 12 }}
            onClick={() => {
              // refresh
              const link = document.querySelector('link[href*="/docs-theme.css"]') as HTMLLinkElement | null;
              if (link) link.href = `/docs-theme.css?t=${Date.now()}`;
            }}
          >
            Reload CSS
          </button>
          <button
            style={{ fontSize: 12 }}
            onClick={() => {
              localStorage.removeItem('docsThemeOverrides');
              setOverrides({});
              applyOverrideStyle({});
            }}
          >
            Clear Overrides
          </button>
          <button style={{ fontSize: 12 }} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div style={{ padding: '0.5rem 0.75rem', fontSize: 11, background: '#f9fafb', borderBottom: '1px solid #eee' }}>
        <div style={{ marginBottom: 4 }}>
          CSS vars loaded: {Object.keys(cssVars).length} • Overrides: {Object.keys(overrides).length}
        </div>
        {missing.length > 0 && (
          <div style={{ color: '#dc2626' }}>
            Missing ({missing.length}): {missing.slice(0, 8).join(', ')}
            {missing.length > 8 ? '…' : ''}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem 0.75rem' }}>
        {sorted.map((name) => {
          const val = merged[name];
          const overridden = overrides.hasOwnProperty(name);
          const computed = computedSnapshot[name] || '';
          return (
            <div
              key={name}
              style={{
                marginBottom: 6,
                border: '1px solid #eee',
                borderRadius: 4,
                padding: 6,
                background: overridden ? '#fff7ed' : '#fff'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <code style={{ fontSize: 11 }}>--{name}</code>
                <div style={{ display: 'flex', gap: 4 }}>
                  {/^#([0-9a-f]{3,8})$/i.test(val) && (
                    <span style={{ width: 16, height: 16, background: val, border: '1px solid #ccc', borderRadius: 3 }} />
                  )}
                  <button style={{ fontSize: 11 }} onClick={() => navigator.clipboard.writeText(val)}>
                    Copy
                  </button>
                  {overridden && (
                    <button style={{ fontSize: 11 }} onClick={() => removeOverride(name)}>
                      Revert
                    </button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 4 }}>
                <input
                  value={val}
                  onChange={(e) => updateOverride(name, e.target.value)}
                  style={{ width: '100%', fontSize: 11, fontFamily: 'monospace', padding: '2px 4px' }}
                />
              </div>
              {computed && computed !== val && (
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Computed: {computed}</div>
              )}
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>Source: {overridden ? 'override' : 'css'}</div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
        <button
          style={{ fontSize: 12 }}
          onClick={() => {
            const css =
              ':root{' +
              Object.entries(merged)
                .map(([k, v]) => `--${k}:${v};`)
                .join('') +
              '}';
            navigator.clipboard.writeText(css);
          }}
        >
          Copy All
        </button>
        <button
          style={{ fontSize: 12 }}
          onClick={() => {
            const missingSet: Record<string, string> = {};
            missing.forEach((n) => (missingSet[n] = merged[n] || ''));
            navigator.clipboard.writeText(JSON.stringify(missingSet, null, 2));
          }}
          disabled={!missing.length}
        >
          Copy Missing JSON
        </button>
      </div>
    </div>
  );
};

export default ThemeDebugPanel;
