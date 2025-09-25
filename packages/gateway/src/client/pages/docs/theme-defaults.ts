// Default theme tokens for an engaging, modern documentation site
export interface ThemeToken {
  name: string;
  value: string;
  category:
    | 'colors'
    | 'typography'
    | 'spacing'
    | 'borders'
    | 'shadows'
    | 'layout';
  description: string;
}

export const DEFAULT_THEME_TOKENS: ThemeToken[] = [
  // Brand Colors
  {
    name: 'color-primary',
    value: '#3b82f6',
    category: 'colors',
    description: 'Primary brand color used for CTAs and highlights',
  },
  {
    name: 'color-primary-hover',
    value: '#2563eb',
    category: 'colors',
    description: 'Darker variant of primary color for hover states',
  },
  {
    name: 'color-primary-light',
    value: '#dbeafe',
    category: 'colors',
    description: 'Light variant for backgrounds and subtle highlights',
  },
  {
    name: 'color-secondary',
    value: '#8b5cf6',
    category: 'colors',
    description: 'Secondary accent color for variety',
  },
  {
    name: 'color-success',
    value: '#10b981',
    category: 'colors',
    description: 'Success state color for positive feedback',
  },
  {
    name: 'color-warning',
    value: '#f59e0b',
    category: 'colors',
    description: 'Warning state color for cautions',
  },
  {
    name: 'color-error',
    value: '#ef4444',
    category: 'colors',
    description: 'Error state color for negative feedback',
  },

  // Text Colors
  {
    name: 'color-text-primary',
    value: '#1f2937',
    category: 'colors',
    description: 'Primary text color for headings and important content',
  },
  {
    name: 'color-text-secondary',
    value: '#6b7280',
    category: 'colors',
    description: 'Secondary text color for descriptions and metadata',
  },
  {
    name: 'color-text-muted',
    value: '#9ca3af',
    category: 'colors',
    description: 'Muted text color for subtle information',
  },
  {
    name: 'color-text-inverse',
    value: '#ffffff',
    category: 'colors',
    description: 'Text color on dark backgrounds',
  },

  // Background Colors
  {
    name: 'color-background',
    value: '#ffffff',
    category: 'colors',
    description: 'Main background color',
  },
  {
    name: 'color-background-secondary',
    value: '#f9fafb',
    category: 'colors',
    description: 'Secondary background for cards and sections',
  },
  {
    name: 'color-background-tertiary',
    value: '#f3f4f6',
    category: 'colors',
    description: 'Tertiary background for subtle differentiation',
  },
  {
    name: 'color-background-code',
    value: '#1e293b',
    category: 'colors',
    description: 'Background color for code blocks',
  },

  // Border Colors
  {
    name: 'color-border',
    value: '#e5e7eb',
    category: 'colors',
    description: 'Default border color',
  },
  {
    name: 'color-border-light',
    value: '#f3f4f6',
    category: 'colors',
    description: 'Light border for subtle separation',
  },
  {
    name: 'color-border-dark',
    value: '#d1d5db',
    category: 'colors',
    description: 'Darker border for emphasis',
  },

  // Typography
  {
    name: 'font-family-sans',
    value:
      '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    category: 'typography',
    description: 'Primary font family for body text',
  },
  {
    name: 'font-family-mono',
    value:
      '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
    category: 'typography',
    description: 'Monospace font for code',
  },
  {
    name: 'font-size-xs',
    value: '0.75rem',
    category: 'typography',
    description: 'Extra small text size',
  },
  {
    name: 'font-size-sm',
    value: '0.875rem',
    category: 'typography',
    description: 'Small text size',
  },
  {
    name: 'font-size-base',
    value: '1rem',
    category: 'typography',
    description: 'Base text size',
  },
  {
    name: 'font-size-lg',
    value: '1.125rem',
    category: 'typography',
    description: 'Large text size',
  },
  {
    name: 'font-size-xl',
    value: '1.25rem',
    category: 'typography',
    description: 'Extra large text size',
  },
  {
    name: 'font-size-2xl',
    value: '1.5rem',
    category: 'typography',
    description: 'XXL text size for headings',
  },
  {
    name: 'font-size-3xl',
    value: '1.875rem',
    category: 'typography',
    description: 'XXXL text size for major headings',
  },
  {
    name: 'font-weight-normal',
    value: '400',
    category: 'typography',
    description: 'Normal font weight',
  },
  {
    name: 'font-weight-medium',
    value: '500',
    category: 'typography',
    description: 'Medium font weight',
  },
  {
    name: 'font-weight-semibold',
    value: '600',
    category: 'typography',
    description: 'Semi-bold font weight',
  },
  {
    name: 'font-weight-bold',
    value: '700',
    category: 'typography',
    description: 'Bold font weight',
  },
  {
    name: 'line-height-tight',
    value: '1.25',
    category: 'typography',
    description: 'Tight line height for headings',
  },
  {
    name: 'line-height-normal',
    value: '1.5',
    category: 'typography',
    description: 'Normal line height for body text',
  },
  {
    name: 'line-height-relaxed',
    value: '1.625',
    category: 'typography',
    description: 'Relaxed line height for comfortable reading',
  },

  // Spacing
  {
    name: 'spacing-xs',
    value: '0.25rem',
    category: 'spacing',
    description: 'Extra small spacing (4px)',
  },
  {
    name: 'spacing-sm',
    value: '0.5rem',
    category: 'spacing',
    description: 'Small spacing (8px)',
  },
  {
    name: 'spacing-md',
    value: '1rem',
    category: 'spacing',
    description: 'Medium spacing (16px)',
  },
  {
    name: 'spacing-lg',
    value: '1.5rem',
    category: 'spacing',
    description: 'Large spacing (24px)',
  },
  {
    name: 'spacing-xl',
    value: '2rem',
    category: 'spacing',
    description: 'Extra large spacing (32px)',
  },
  {
    name: 'spacing-2xl',
    value: '3rem',
    category: 'spacing',
    description: 'XXL spacing (48px)',
  },
  {
    name: 'spacing-3xl',
    value: '4rem',
    category: 'spacing',
    description: 'XXXL spacing (64px)',
  },

  // Border Radius
  {
    name: 'border-radius-sm',
    value: '0.25rem',
    category: 'borders',
    description: 'Small border radius',
  },
  {
    name: 'border-radius-md',
    value: '0.375rem',
    category: 'borders',
    description: 'Medium border radius',
  },
  {
    name: 'border-radius-lg',
    value: '0.5rem',
    category: 'borders',
    description: 'Large border radius',
  },
  {
    name: 'border-radius-xl',
    value: '0.75rem',
    category: 'borders',
    description: 'Extra large border radius',
  },
  {
    name: 'border-radius-full',
    value: '9999px',
    category: 'borders',
    description: 'Full border radius for pills and circles',
  },

  // Shadows
  {
    name: 'shadow-sm',
    value: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    category: 'shadows',
    description: 'Small shadow for subtle elevation',
  },
  {
    name: 'shadow-md',
    value:
      '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    category: 'shadows',
    description: 'Medium shadow for cards',
  },
  {
    name: 'shadow-lg',
    value:
      '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    category: 'shadows',
    description: 'Large shadow for prominent elements',
  },
  {
    name: 'shadow-xl',
    value:
      '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    category: 'shadows',
    description: 'Extra large shadow for modals',
  },

  // Layout
  {
    name: 'max-width-prose',
    value: '65ch',
    category: 'layout',
    description: 'Maximum width for readable text content',
  },
  {
    name: 'max-width-container',
    value: '1200px',
    category: 'layout',
    description: 'Maximum width for main container',
  },
  {
    name: 'sidebar-width',
    value: '280px',
    category: 'layout',
    description: 'Default sidebar width',
  },
  {
    name: 'header-height',
    value: '64px',
    category: 'layout',
    description: 'Header height',
  },

  // Transitions
  {
    name: 'transition-fast',
    value: '150ms ease-in-out',
    category: 'layout',
    description: 'Fast transition for interactions',
  },
  {
    name: 'transition-normal',
    value: '300ms ease-in-out',
    category: 'layout',
    description: 'Normal transition speed',
  },
  {
    name: 'transition-slow',
    value: '500ms ease-in-out',
    category: 'layout',
    description: 'Slow transition for complex animations',
  },
];

// Predefined theme presets
export interface ThemePreset {
  name: string;
  description: string;
  tokens: Partial<Record<string, string>>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Default Blue',
    description: 'Clean blue theme with modern styling',
    tokens: {
      'color-background': '#ffffff',
      'color-background-secondary': '#f6f8fb',
      'color-background-tertiary': '#eef2f8',
      'color-text-primary': '#1f2937',
      'color-text-secondary': '#4b5563',
      'color-text-muted': '#6b7280',
      'color-border': '#dde3ec',
      'color-border-light': '#e7edf5',
      'color-border-dark': '#c3ccd9',
      'color-code-bg': '#1e293b',
      'color-code-text': '#e2e8f0',
      'color-primary': '#3b82f6',
      'color-primary-hover': '#2563eb',
      'color-primary-light': '#dbeafe',
      'color-secondary': '#8b5cf6',
    },
  },
  {
    name: 'Forest Green',
    description: 'Professional green theme for enterprise',
    tokens: {
      'color-primary': '#059669',
      'color-primary-hover': '#047857',
      'color-primary-light': '#d1fae5',
      'color-secondary': '#0891b2',
    },
  },
  {
    name: 'Sunset Orange',
    description: 'Warm orange theme for creative projects',
    tokens: {
      'color-primary': '#ea580c',
      'color-primary-hover': '#c2410c',
      'color-primary-light': '#fed7aa',
      'color-secondary': '#dc2626',
    },
  },
  {
    name: 'Royal Purple',
    description: 'Elegant purple theme for premium feel',
    tokens: {
      'color-primary': '#7c3aed',
      'color-primary-hover': '#6d28d9',
      'color-primary-light': '#e9d5ff',
      'color-secondary': '#be185d',
    },
  },
  {
    name: 'Dark Mode',
    description: 'Modern dark theme for reduced eye strain',
    tokens: {
      'color-background': '#0f172a',
      'color-background-secondary': '#1e293b',
      'color-background-tertiary': '#334155',
      'color-text-primary': '#f1f5f9',
      'color-text-secondary': '#cbd5e1',
      'color-text-muted': '#94a3b8',
      'color-border': '#334155',
      'color-border-light': '#475569',
      'color-primary': '#60a5fa',
      'color-primary-hover': '#3b82f6',
    },
  },
];
