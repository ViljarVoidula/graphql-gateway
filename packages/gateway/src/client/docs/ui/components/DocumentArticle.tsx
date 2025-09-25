import React from 'react';
import { CompiledDocComponent, PublishedDoc } from '../types';

interface DocumentArticleProps {
  activeSlug: string;
  doc: PublishedDoc | undefined;
  compiledDoc: CompiledDocComponent;
  loading: boolean;
  error: string | null;
}

export const DocumentArticle: React.FC<DocumentArticleProps> = ({
  activeSlug,
  doc,
  compiledDoc: CompiledDoc,
  loading,
  error,
}) => {
  if (loading) {
    return (
      <div className="doc-article">
        <p>Loading document...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="doc-article">
        <div
          style={{
            color: 'red',
            padding: '1rem',
            background: '#ffeaea',
            borderRadius: '4px',
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="doc-article">
        <h1>Document Not Found</h1>
        <p>The document "{activeSlug}" could not be found.</p>
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
          color: 'var(--color-text-secondary)',
        }}
      >
        <p>
          Last updated: {new Date(doc.publishedAt).toLocaleDateString()}|
          Version: {doc.version}
        </p>
      </div>
    </article>
  );
};
