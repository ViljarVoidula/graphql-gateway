import { motion } from 'framer-motion';
import React from 'react';
import { PublishedDoc, Service, ServiceSummary } from '../types';
import { ServicesHealthSection } from './ServicesHealthSection';

interface HomeViewProps {
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string | null;
  recentDocs: PublishedDoc[];
  docs: PublishedDoc[];
  docsByCategory: Record<string, PublishedDoc[]>;
  loading: boolean;
  error: string | null;
  services: Service[];
  servicesLoading: boolean;
  servicesError: string | null;
  serviceSummary: ServiceSummary;
  onSelectDoc: (slug: string) => void;
}

const HeroSection: React.FC<
  Pick<HomeViewProps, 'heroTitle' | 'heroSubtitle' | 'heroImageUrl'>
> = ({ heroTitle, heroSubtitle, heroImageUrl }) => (
  <motion.header
    style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 6vw, 3rem)' }}
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: 'easeOut' }}
  >
    <motion.div
      style={{
        background:
          'linear-gradient(135deg, var(--color-primary), var(--color-secondary, var(--color-primary-hover)))',
        borderRadius: '24px',
        padding: 'clamp(2rem, 5vw, 3rem)',
        marginBottom: '2rem',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-xl, 0 40px 80px -35px rgba(15, 23, 42, 0.65))',
        border:
          '1px solid var(--color-border-light, rgba(255, 255, 255, 0.25))',
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        style={{
          position: 'absolute',
          inset: '-40%',
          background:
            'radial-gradient(circle at top, var(--color-primary) 0%, transparent 60%)',
          opacity: 0.25,
          filter: 'blur(90px)',
          transform: 'translateY(-10%)',
        }}
        animate={{ scale: [0.95, 1.05, 0.95], rotate: [0, 6, 0] }}
        transition={{
          duration: 12,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
        }}
      />
      {heroImageUrl && (
        <img
          src={heroImageUrl}
          alt="Hero"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.2,
            pointerEvents: 'none',
          }}
        />
      )}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            'linear-gradient(45deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.05) 100%)',
          borderRadius: '24px',
        }}
        animate={{ x: [-100, 100], opacity: [0, 0.5, 0] }}
        transition={{
          duration: 3,
          repeat: Infinity,
          repeatType: 'loop',
          ease: 'linear',
        }}
      />
      <motion.h1
        style={{
          fontSize: 'clamp(1.8rem, 5vw, 3rem)',
          marginBottom: '1rem',
          color: 'white',
          fontWeight: '800',
          letterSpacing: '-0.02em',
          position: 'relative',
          zIndex: 1,
        }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        🚀 {heroTitle}
      </motion.h1>
      <motion.p
        style={{
          fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
          color: 'rgba(255, 255, 255, 0.9)',
          maxWidth: '600px',
          margin: '0 auto',
          lineHeight: '1.6',
          position: 'relative',
          zIndex: 1,
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        {heroSubtitle}
      </motion.p>
    </motion.div>
  </motion.header>
);

const RecentDocumentsSection: React.FC<{
  recentDocs: PublishedDoc[];
  onSelectDoc: (slug: string) => void;
}> = ({ recentDocs, onSelectDoc }) => (
  <motion.section
    style={{ marginBottom: '3rem' }}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.6, duration: 0.5 }}
  >
    <motion.h2
      style={{
        fontSize: 'clamp(1.5rem, 3vw, 2rem)',
        marginBottom: '1.5rem',
        fontWeight: '700',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <span style={{ fontSize: 'inherit' }}>📚</span>
      <span
        style={{
          background:
            'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        Recent Documents
      </span>
    </motion.h2>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
      }}
    >
      {recentDocs.map((doc, index) => (
        <motion.div
          key={doc.id}
          style={{
            background:
              'linear-gradient(140deg, var(--color-background-secondary), var(--color-background-tertiary))',
            borderRadius: '16px',
            padding: '1.5rem',
            border: '1px solid var(--color-border-light, var(--color-border))',
            boxShadow: 'var(--shadow-lg, 0 12px 30px rgba(15, 23, 42, 0.12))',
            transition:
              'transform var(--transition-normal, 0.3s ease), box-shadow var(--transition-normal, 0.3s ease), border-color var(--transition-fast, 0.2s ease)',
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
            backdropFilter: 'blur(12px)',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 + index * 0.1, duration: 0.4 }}
          whileHover={{
            scale: 1.03,
            boxShadow:
              'var(--shadow-xl, 0 28px 55px -28px rgba(15, 23, 42, 0.6))',
            borderColor: 'var(--color-primary)',
          }}
          onClick={() => onSelectDoc(doc.slug)}
        >
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: '-100%',
              width: '100%',
              height: '100%',
              background:
                'linear-gradient(90deg, transparent, var(--color-primary), transparent)',
              opacity: 0.18,
            }}
            whileHover={{ left: '100%' }}
            transition={{ duration: 0.6 }}
          />
          <h3
            style={{
              margin: '0 0 0.5rem 0',
              color: 'var(--color-primary)',
              fontSize: '1.1rem',
              fontWeight: '600',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {doc.title}
          </h3>
          {doc.description && (
            <p
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: '0.9rem',
                margin: '0 0 1rem 0',
                lineHeight: '1.5',
                position: 'relative',
                zIndex: 1,
              }}
            >
              {doc.description}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem',
              color: 'var(--color-text-muted)',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <span>{new Date(doc.publishedAt).toLocaleDateString()}</span>
            <motion.span
              style={{
                background:
                  'linear-gradient(120deg, var(--color-primary), var(--color-primary-hover))',
                color: 'var(--color-text-inverse)',
                padding: '0.25rem 0.5rem',
                borderRadius: '999px',
                fontSize: '0.7rem',
                fontWeight: '600',
                boxShadow:
                  'var(--shadow-sm, 0 4px 10px rgba(15, 23, 42, 0.25))',
              }}
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.2 }}
            >
              Read →
            </motion.span>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.section>
);

const DocumentsByCategorySection: React.FC<{
  docsByCategory: Record<string, PublishedDoc[]>;
}> = ({ docsByCategory }) => (
  <motion.section
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 2.5, duration: 0.5 }}
  >
    <motion.h2
      style={{
        fontSize: 'clamp(1.5rem, 3vw, 2rem)',
        marginBottom: '2rem',
        fontWeight: '700',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <span style={{ fontSize: 'inherit' }}>📖</span>
      <span
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), #8b5cf6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        All Documents (
        {Object.values(docsByCategory).reduce(
          (acc, docs) => acc + docs.length,
          0
        )}
        )
      </span>
    </motion.h2>
    {Object.entries(docsByCategory).map(
      ([category, categoryDocs], categoryIndex) => (
        <motion.div
          key={category}
          style={{ marginBottom: '2.5rem' }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 2.6 + categoryIndex * 0.1, duration: 0.4 }}
        >
          <motion.h3
            style={{
              color: 'var(--color-primary)',
              fontSize: '1.2rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
            whileHover={{ x: 4 }}
            transition={{ duration: 0.2 }}
          >
            <span>📁</span>
            {category}
          </motion.h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {categoryDocs.map((doc, docIndex) => (
              <motion.div
                key={doc.slug}
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-background-secondary), var(--color-background-tertiary))',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  border: '1px solid var(--color-border)',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 2.7 + categoryIndex * 0.1 + docIndex * 0.05,
                  duration: 0.3,
                }}
                whileHover={{
                  scale: 1.02,
                  boxShadow: '0 18px 40px -10px rgba(15, 23, 42, 0.35)',
                }}
                onClick={() => {
                  window.location.hash = `#/${doc.slug}`;
                }}
              >
                <motion.div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '-100%',
                    width: '100%',
                    height: '100%',
                    background:
                      'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.08), transparent)',
                  }}
                  whileHover={{ left: '100%' }}
                  transition={{ duration: 0.5 }}
                />
                <h4
                  style={{
                    margin: '0 0 0.5rem 0',
                    color: 'var(--color-primary)',
                    fontSize: '1rem',
                    fontWeight: '600',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {doc.title}
                </h4>
                {doc.description && (
                  <p
                    style={{
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.85rem',
                      margin: '0 0 0.75rem 0',
                      lineHeight: '1.4',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {doc.description}
                  </p>
                )}
                <motion.div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.7rem',
                    color: 'white',
                    background: 'var(--color-primary)',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '20px',
                    fontWeight: '500',
                    position: 'relative',
                    zIndex: 1,
                  }}
                  whileHover={{ scale: 1.05, x: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  Read Article →
                </motion.div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )
    )}
  </motion.section>
);

export const HomeView: React.FC<HomeViewProps> = ({
  heroTitle,
  heroSubtitle,
  heroImageUrl,
  recentDocs,
  docs,
  docsByCategory,
  loading,
  error,
  services,
  servicesLoading,
  servicesError,
  serviceSummary,
  onSelectDoc,
}) => (
  <div
    className="doc-article"
    style={{
      maxWidth: 'min(1200px, 95vw)',
      margin: '0 auto',
      padding: '0 clamp(1rem, 4vw, 2rem)',
    }}
  >
    <HeroSection
      heroTitle={heroTitle}
      heroSubtitle={heroSubtitle}
      heroImageUrl={heroImageUrl}
    />

    {loading && (
      <div
        style={{
          textAlign: 'center',
          padding: 'clamp(2rem, 5vw, 3rem)',
          color: 'var(--color-text-secondary)',
        }}
      >
        Loading documents...
      </div>
    )}

    {error && (
      <div
        style={{
          color: 'var(--color-error)',
          padding: 'clamp(1rem, 3vw, 1.5rem)',
          background: 'var(--color-error)10',
          borderRadius: 'var(--border-radius-md)',
          border: '1px solid var(--color-error)30',
          marginBottom: 'clamp(1.5rem, 4vw, 2rem)',
        }}
      >
        <strong>Error:</strong> {error}
      </div>
    )}

    {!loading && !error && docs.length > 0 && (
      <RecentDocumentsSection
        recentDocs={recentDocs}
        onSelectDoc={onSelectDoc}
      />
    )}

    <ServicesHealthSection
      services={services}
      servicesLoading={servicesLoading}
      servicesError={servicesError}
      serviceSummary={serviceSummary}
    />

    {!loading && docs.length === 0 && (
      <div
        style={{ padding: '1rem', background: '#f0f8ff', borderRadius: '4px' }}
      >
        <p>
          No published documents found. Documents will appear here once they are
          published from the admin interface.
        </p>
      </div>
    )}

    {!loading && docs.length > 0 && (
      <DocumentsByCategorySection docsByCategory={docsByCategory} />
    )}
  </div>
);
