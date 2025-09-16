import React from 'react';
import '../styles.css';

// Temporary placeholder for future documentation experience
// Original schema explorer, query runner and graph visualization removed intentionally.
// TODO: Reintroduce rich docs UI once design is finalized.

export const DocsApp: React.FC = () => {
  return (
    <div className="docs-root placeholder-only">
      <header className="docs-header">
        <h1>API Documentation (Coming Soon)</h1>
      </header>
      <main className="docs-main">
        <div className="placeholder-box">
          <p>A new interactive documentation experience is on the way. This will include:</p>
          <ul>
            <li>Schema explorer & type reference</li>
            <li>Interactive query & mutation examples</li>
            <li>Service graph visualization</li>
            <li>Rate limit & usage insights</li>
            <li>Security & audit log guidance</li>
          </ul>
          <p>
            For now you can continue using the GraphQL endpoint at <code>/graphql</code> (with GraphiQL enabled) for
            exploration.
          </p>
          <p style={{ marginTop: '2rem', fontStyle: 'italic', opacity: 0.75 }}>
            Placeholder build: {new Date().toLocaleString()}
          </p>
        </div>
      </main>
      <footer className="docs-footer">Documentation UI under construction</footer>
    </div>
  );
};
