// Enhanced preview HTML template that showcases theme tokens
export const DOCS_PREVIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentation Theme Preview</title>
  <style>
    /* Base styles using theme tokens */
    :root {
      /* Default fallback values - will be overridden by theme tokens */
      --color-primary: #3b82f6;
      --color-primary-hover: #2563eb;
      --color-primary-light: #dbeafe;
      --color-secondary: #8b5cf6;
      --color-success: #10b981;
      --color-warning: #f59e0b;
      --color-error: #ef4444;
      --color-text-primary: #1f2937;
      --color-text-secondary: #6b7280;
      --color-text-muted: #9ca3af;
      --color-text-inverse: #ffffff;
      --color-background: #ffffff;
      --color-background-secondary: #f9fafb;
      --color-background-tertiary: #f3f4f6;
      --color-background-code: #1e293b;
      --color-border: #e5e7eb;
      --color-border-light: #f3f4f6;
      --color-border-dark: #d1d5db;
      --font-family-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-family-mono: "JetBrains Mono", "Fira Code", Consolas, monospace;
      --font-size-xs: 0.75rem;
      --font-size-sm: 0.875rem;
      --font-size-base: 1rem;
      --font-size-lg: 1.125rem;
      --font-size-xl: 1.25rem;
      --font-size-2xl: 1.5rem;
      --font-size-3xl: 1.875rem;
      --font-weight-normal: 400;
      --font-weight-medium: 500;
      --font-weight-semibold: 600;
      --font-weight-bold: 700;
      --line-height-tight: 1.25;
      --line-height-normal: 1.5;
      --line-height-relaxed: 1.625;
      --spacing-xs: 0.25rem;
      --spacing-sm: 0.5rem;
      --spacing-md: 1rem;
      --spacing-lg: 1.5rem;
      --spacing-xl: 2rem;
      --spacing-2xl: 3rem;
      --spacing-3xl: 4rem;
      --border-radius-sm: 0.25rem;
      --border-radius-md: 0.375rem;
      --border-radius-lg: 0.5rem;
      --border-radius-xl: 0.75rem;
      --border-radius-full: 9999px;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      --max-width-prose: 65ch;
      --max-width-container: 1200px;
      --sidebar-width: 280px;
      --header-height: 64px;
      --transition-fast: 150ms ease-in-out;
      --transition-normal: 300ms ease-in-out;
      --transition-slow: 500ms ease-in-out;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--font-family-sans);
      font-size: var(--font-size-base);
      line-height: var(--line-height-normal);
      color: var(--color-text-primary);
      background-color: var(--color-background);
    }

    .container {
      max-width: var(--max-width-container);
      margin: 0 auto;
      padding: var(--spacing-lg);
    }

    /* Header */
    .header {
      background-color: var(--color-background-secondary);
      border-bottom: 1px solid var(--color-border);
      padding: var(--spacing-md) 0;
      margin-bottom: var(--spacing-xl);
    }

    .header h1 {
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-bold);
      line-height: var(--line-height-tight);
      color: var(--color-primary);
      margin-bottom: var(--spacing-sm);
    }

    .header p {
      color: var(--color-text-secondary);
      font-size: var(--font-size-lg);
    }

    /* Navigation */
    .nav {
      background-color: var(--color-primary);
      padding: var(--spacing-md) 0;
      margin-bottom: var(--spacing-xl);
    }

    .nav-items {
      display: flex;
      gap: var(--spacing-lg);
      list-style: none;
    }

    .nav-items a {
      color: var(--color-text-inverse);
      text-decoration: none;
      font-weight: var(--font-weight-medium);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius-md);
      transition: background-color var(--transition-fast);
    }

    .nav-items a:hover {
      background-color: var(--color-primary-hover);
    }

    /* Typography Showcase */
    .typography-showcase {
      margin-bottom: var(--spacing-3xl);
    }

    .typography-showcase h2 {
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      margin-bottom: var(--spacing-lg);
    }

    .typography-showcase h3 {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin-bottom: var(--spacing-md);
    }

    .typography-showcase p {
      color: var(--color-text-secondary);
      margin-bottom: var(--spacing-md);
      max-width: var(--max-width-prose);
    }

    .typography-showcase code {
      font-family: var(--font-family-mono);
      background-color: var(--color-background-tertiary);
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--border-radius-sm);
      font-size: var(--font-size-sm);
    }

    .typography-showcase pre {
      background-color: var(--color-background-code);
      color: var(--color-text-inverse);
      padding: var(--spacing-lg);
      border-radius: var(--border-radius-lg);
      overflow-x: auto;
      font-family: var(--font-family-mono);
      font-size: var(--font-size-sm);
      line-height: var(--line-height-relaxed);
      margin: var(--spacing-lg) 0;
    }

    /* Cards */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--spacing-lg);
      margin-bottom: var(--spacing-3xl);
    }

    .card {
      background-color: var(--color-background-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--border-radius-lg);
      padding: var(--spacing-lg);
      box-shadow: var(--shadow-md);
      transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-lg);
    }

    .card h4 {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin-bottom: var(--spacing-sm);
    }

    .card p {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    /* Buttons */
    .button-showcase {
      display: flex;
      gap: var(--spacing-md);
      flex-wrap: wrap;
      margin-bottom: var(--spacing-3xl);
    }

    .btn {
      padding: var(--spacing-sm) var(--spacing-lg);
      border-radius: var(--border-radius-md);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
      display: inline-block;
      transition: all var(--transition-fast);
      border: none;
      cursor: pointer;
      font-size: var(--font-size-base);
    }

    .btn-primary {
      background-color: var(--color-primary);
      color: var(--color-text-inverse);
    }

    .btn-primary:hover {
      background-color: var(--color-primary-hover);
    }

    .btn-secondary {
      background-color: var(--color-secondary);
      color: var(--color-text-inverse);
    }

    .btn-success {
      background-color: var(--color-success);
      color: var(--color-text-inverse);
    }

    .btn-warning {
      background-color: var(--color-warning);
      color: var(--color-text-inverse);
    }

    .btn-error {
      background-color: var(--color-error);
      color: var(--color-text-inverse);
    }

    .btn-outline {
      background-color: transparent;
      color: var(--color-primary);
      border: 1px solid var(--color-primary);
    }

    .btn-outline:hover {
      background-color: var(--color-primary);
      color: var(--color-text-inverse);
    }

    /* Alerts */
    .alert {
      padding: var(--spacing-md);
      border-radius: var(--border-radius-md);
      margin-bottom: var(--spacing-md);
      border-left: 4px solid;
    }

    .alert-success {
      background-color: var(--color-primary-light);
      border-left-color: var(--color-success);
      color: var(--color-text-primary);
    }

    .alert-warning {
      background-color: #fef3c7;
      border-left-color: var(--color-warning);
      color: var(--color-text-primary);
    }

    .alert-error {
      background-color: #fee2e2;
      border-left-color: var(--color-error);
      color: var(--color-text-primary);
    }

    /* Sidebar Layout */
    .layout {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      gap: var(--spacing-xl);
      margin-top: var(--spacing-xl);
    }

    .sidebar {
      background-color: var(--color-background-secondary);
      padding: var(--spacing-lg);
      border-radius: var(--border-radius-lg);
      border: 1px solid var(--color-border);
      height: fit-content;
    }

    .sidebar h4 {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      margin-bottom: var(--spacing-md);
    }

    .sidebar ul {
      list-style: none;
    }

    .sidebar li {
      margin-bottom: var(--spacing-sm);
    }

    .sidebar a {
      color: var(--color-text-secondary);
      text-decoration: none;
      transition: color var(--transition-fast);
    }

    .sidebar a:hover {
      color: var(--color-primary);
    }

    .main-content {
      background-color: var(--color-background);
    }

    /* Footer */
    .footer {
      background-color: var(--color-background-tertiary);
      padding: var(--spacing-xl) 0;
      margin-top: var(--spacing-3xl);
      text-align: center;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }

    @media (max-width: 768px) {
      .layout {
        grid-template-columns: 1fr;
      }
      
      .card-grid {
        grid-template-columns: 1fr;
      }
      
      .button-showcase {
        flex-direction: column;
        align-items: flex-start;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="container">
      <h1>Documentation Theme Preview</h1>
      <p>Preview how your theme tokens affect the documentation appearance</p>
    </div>
  </div>

  <nav class="nav">
    <div class="container">
      <ul class="nav-items">
        <li><a href="#getting-started">Getting Started</a></li>
        <li><a href="#api-reference">API Reference</a></li>
        <li><a href="#tutorials">Tutorials</a></li>
        <li><a href="#examples">Examples</a></li>
      </ul>
    </div>
  </nav>

  <div class="container">
    <div class="typography-showcase">
      <h2>Typography & Content</h2>
      <h3>Sample Documentation Content</h3>
      <p>
        This is a sample paragraph demonstrating how your typography tokens affect readability and visual hierarchy. 
        The text uses your configured font family, sizes, weights, and colors to create a cohesive reading experience.
      </p>
      <p>
        You can use <code>inline code</code> snippets to highlight technical terms, and longer code blocks for examples:
      </p>
      <pre><code>function greetUser(name: string): string {
  return \`Hello, \${name}! Welcome to our documentation.\`;
}

const message = greetUser("Developer");
console.log(message);</code></pre>
    </div>

    <div class="card-grid">
      <div class="card">
        <h4>Quick Start Guide</h4>
        <p>Get up and running in minutes with our comprehensive quick start guide. Learn the basics and start building right away.</p>
      </div>
      <div class="card">
        <h4>API Reference</h4>
        <p>Complete reference documentation for all available APIs, endpoints, and configuration options with detailed examples.</p>
      </div>
      <div class="card">
        <h4>Best Practices</h4>
        <p>Learn recommended patterns, security considerations, and optimization techniques from our team of experts.</p>
      </div>
    </div>

    <div>
      <h3>Interactive Elements</h3>
      <div class="button-showcase">
        <button class="btn btn-primary">Primary Action</button>
        <button class="btn btn-secondary">Secondary</button>
        <button class="btn btn-success">Success</button>
        <button class="btn btn-warning">Warning</button>
        <button class="btn btn-error">Danger</button>
        <button class="btn btn-outline">Outline</button>
      </div>
    </div>

    <div>
      <h3>Status Messages</h3>
      <div class="alert alert-success">
        <strong>Success!</strong> Your configuration has been saved successfully.
      </div>
      <div class="alert alert-warning">
        <strong>Warning:</strong> This feature is currently in beta. Use with caution in production.
      </div>
      <div class="alert alert-error">
        <strong>Error:</strong> Unable to connect to the API. Please check your network connection.
      </div>
    </div>

    <div class="layout">
      <div class="sidebar">
        <h4>Navigation</h4>
        <ul>
          <li><a href="#introduction">Introduction</a></li>
          <li><a href="#installation">Installation</a></li>
          <li><a href="#configuration">Configuration</a></li>
          <li><a href="#api">API Reference</a></li>
          <li><a href="#examples">Examples</a></li>
          <li><a href="#troubleshooting">Troubleshooting</a></li>
        </ul>
      </div>
      <div class="main-content">
        <h3>Main Content Area</h3>
        <p>
          This layout demonstrates how your spacing, colors, and typography work together in a typical documentation layout. 
          The sidebar uses secondary background colors and the main content area showcases primary text styling.
        </p>
        <p>
          Notice how the border radius, shadows, and spacing create visual separation between elements while maintaining 
          a cohesive design language throughout the interface.
        </p>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="container">
      <p>&copy; 2024 Your Documentation Portal. Styled with custom theme tokens.</p>
    </div>
  </div>
</body>
</html>`;
