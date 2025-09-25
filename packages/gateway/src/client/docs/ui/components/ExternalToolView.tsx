import React from 'react';

interface ExternalToolViewProps {
  title: string;
  icon: string;
  url: string;
  backHref?: string;
}

interface ExternalToolUnavailableProps {
  title: string;
  message: string;
  backHref?: string;
}

export const ExternalToolView: React.FC<ExternalToolViewProps> = ({
  title,
  icon,
  url,
  backHref = '#/home',
}) => (
  <div
    className="doc-article"
    style={{ padding: 0, height: '100vh', overflow: 'hidden' }}
  >
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
        color: 'var(--color-text-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {icon} {title}
      </div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          onClick={() => window.open(url, '_blank')}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-primary)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '500',
            transition: 'background-color 0.2s ease',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor =
              'var(--color-primary-hover)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'var(--color-primary)';
          }}
        >
          Open in New Tab ↗
        </button>
        <a
          href={backHref}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-background)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: '500',
            transition: 'all 0.2s ease',
          }}
        >
          ← Back to Docs
        </a>
      </div>
    </div>
    <iframe
      src={url}
      style={{
        width: '100%',
        height: 'calc(100vh - 80px)',
        border: 'none',
        display: 'block',
      }}
      title={title}
    />
  </div>
);

export const ExternalToolUnavailable: React.FC<
  ExternalToolUnavailableProps
> = ({ title, message, backHref = '#/home' }) => (
  <div className="doc-article">
    <h1>{title} Not Available</h1>
    <p>{message}</p>
    <a href={backHref}>← Back to home</a>
  </div>
);
