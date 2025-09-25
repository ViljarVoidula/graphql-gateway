import { motion } from 'framer-motion';
import React from 'react';
import { PublishedDoc } from '../types';

interface DocsSidebarProps {
  active: string;
  brandName: string;
  brandIconUrl: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  docsByCategory: Record<string, PublishedDoc[]>;
  voyagerEnabled: boolean;
  voyagerLoading: boolean;
  playgroundEnabled: boolean;
  playgroundLoading: boolean;
}

interface NavItem {
  key: string;
  label: string;
  icon: string;
  disabled?: boolean;
}

const buildNavItems = (
  voyagerEnabled: boolean,
  voyagerLoading: boolean,
  playgroundEnabled: boolean,
  playgroundLoading: boolean
): NavItem[] => {
  const base: NavItem[] = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'schema', label: 'Schema', icon: '🔍' },
  ];

  if (voyagerLoading) {
    base.push({
      key: 'voyager-loading',
      label: 'Checking Voyager...',
      icon: '⏳',
      disabled: true,
    });
  } else if (voyagerEnabled) {
    base.push({ key: 'voyager', label: 'GraphQL Voyager', icon: '🗺️' });
  }

  if (playgroundLoading) {
    base.push({
      key: 'playground-loading',
      label: 'Checking Playground...',
      icon: '⏳',
      disabled: true,
    });
  } else if (playgroundEnabled) {
    base.push({ key: 'playground', label: 'GraphQL Playground', icon: '🎮' });
  }

  return base;
};

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  active,
  brandName,
  brandIconUrl,
  search,
  onSearchChange,
  docsByCategory,
  voyagerEnabled,
  voyagerLoading,
  playgroundEnabled,
  playgroundLoading,
}) => {
  const navItems = buildNavItems(
    voyagerEnabled,
    voyagerLoading,
    playgroundEnabled,
    playgroundLoading
  );

  return (
    <motion.aside
      className="docs-nav"
      initial={{ x: -280, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <motion.div
        className="nav-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <motion.h1 whileHover={{ scale: 1.05 }} transition={{ duration: 0.2 }}>
          <a
            href="#/home"
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem',
              borderRadius: '12px',
              transition: 'background-color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                'var(--color-background-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {brandIconUrl ? (
              <motion.img
                src={brandIconUrl}
                alt="Brand icon"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  objectFit: 'cover',
                  border: '2px solid var(--color-border)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  delay: 0.5,
                  duration: 0.6,
                  type: 'spring',
                  bounce: 0.3,
                }}
                whileHover={{ scale: 1.1, rotate: 5 }}
              />
            ) : (
              <motion.div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background:
                    'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: 'white',
                  border: '2px solid var(--color-border)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                }}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{
                  delay: 0.5,
                  duration: 0.6,
                  type: 'spring',
                  bounce: 0.3,
                }}
                whileHover={{ scale: 1.1, rotate: 5 }}
              >
                📚
              </motion.div>
            )}
            <motion.div
              style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7, duration: 0.4 }}
            >
              <span
                style={{
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  lineHeight: '1.2',
                  color: 'var(--color-text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                {brandName}
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--color-text-muted)',
                  fontWeight: '500',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Documentation
              </span>
            </motion.div>
          </a>
        </motion.h1>
      </motion.div>

      <motion.div
        style={{ marginBottom: '1.5rem' }}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        <label
          htmlFor="docs-search"
          style={{
            display: 'block',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-muted)',
            marginBottom: '0.5rem',
            fontWeight: 600,
          }}
        >
          Search
        </label>
        <input
          id="docs-search"
          className="search-input"
          type="search"
          value={search}
          placeholder="Search documentation..."
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </motion.div>

      <motion.ul
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        {navItems.map((item, index) => (
          <motion.li
            key={item.key}
            className={active === item.key ? 'active' : ''}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + index * 0.1, duration: 0.3 }}
            whileHover={{ scale: 1.02, x: 5 }}
          >
            {item.disabled ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </span>
            ) : (
              <a
                href={`#/${item.key}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </a>
            )}
          </motion.li>
        ))}

        {Object.entries(docsByCategory).map(
          ([category, categoryDocs], categoryIndex) => (
            <motion.li
              key={category}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + categoryIndex * 0.1, duration: 0.3 }}
            >
              <motion.div
                style={{
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  color: 'var(--color-text-secondary)',
                  padding: '0.75rem 0 0.25rem 0',
                  borderTop:
                    categoryIndex === 0
                      ? '1px solid var(--color-border)'
                      : 'none',
                  marginTop: categoryIndex === 0 ? '0.5rem' : '0.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                whileHover={{ x: 2 }}
                transition={{ duration: 0.2 }}
              >
                📁 {category}
              </motion.div>
              <motion.ul
                style={{ marginLeft: '1rem' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 + categoryIndex * 0.1, duration: 0.3 }}
              >
                {categoryDocs.map((doc, docIndex) => (
                  <motion.li
                    key={doc.slug}
                    className={doc.slug === active ? 'active' : ''}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 1 + categoryIndex * 0.1 + docIndex * 0.05,
                      duration: 0.2,
                    }}
                    whileHover={{ scale: 1.02, x: 3 }}
                  >
                    <a href={`#/${doc.slug}`} title={doc.description}>
                      {doc.title}
                    </a>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.li>
          )
        )}
      </motion.ul>
    </motion.aside>
  );
};
