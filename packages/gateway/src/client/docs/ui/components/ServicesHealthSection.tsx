import { motion } from 'framer-motion';
import React, { useMemo } from 'react';
import { Service, ServiceSummary } from '../types';

interface ServicesHealthSectionProps {
  services: Service[];
  servicesLoading: boolean;
  servicesError: string | null;
  serviceSummary: ServiceSummary;
}

const formatErrorRate = (value: number) => {
  const pct = Math.max(0, (value || 0) * 100);
  if (pct === 0) {
    return '0%';
  }

  if (pct > 0 && pct < 0.01) {
    return '<0.01%';
  }

  return pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(2)}%`;
};

const formatStatus = (status: string) => {
  if (!status) {
    return 'Unknown';
  }

  return status
    .toLowerCase()
    .split(/ |_|-/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const getStatusIcon = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized.includes('degraded')) {
    return '🟡';
  }

  if (normalized.includes('error') || normalized.includes('fail')) {
    return '🔴';
  }

  return '🟢';
};

const getStatusColor = (status: string) => {
  const normalized = status.toLowerCase();

  if (normalized.includes('degraded')) {
    return 'var(--color-warning)';
  }

  if (normalized.includes('error') || normalized.includes('fail')) {
    return 'var(--color-error)';
  }

  return 'var(--color-success)';
};

const getErrorColorByPct = (pct: number) => {
  if (pct > 5) {
    return 'var(--color-error)';
  }

  if (pct > 1) {
    return 'var(--color-warning)';
  }

  return 'var(--color-success)';
};

export const ServicesHealthSection: React.FC<ServicesHealthSectionProps> = ({
  services,
  servicesLoading,
  servicesError,
  serviceSummary,
}) => {
  const legend = useMemo(
    () => [
      { color: 'var(--color-success)', label: 'Healthy (<1%)', icon: '🟢' },
      { color: 'var(--color-warning)', label: 'Warning (1–5%)', icon: '🟡' },
      { color: 'var(--color-error)', label: 'Critical (>5%)', icon: '🔴' },
    ],
    []
  );

  const primaryService = useMemo(() => {
    const gatewayCandidate = services.find((service) =>
      service.name.toLowerCase().includes('gateway')
    );

    return gatewayCandidate ?? null;
  }, [services]);

  const secondaryServices = useMemo(() => {
    if (!primaryService) {
      return services;
    }

    return services.filter((service) => service !== primaryService);
  }, [services, primaryService]);

  const renderServiceCard = (
    service: Service,
    index: number,
    options: { isPrimary?: boolean; downstreamServices?: Service[] } = {}
  ) => {
    const { isPrimary = false, downstreamServices = [] } = options;
    const errorRatePct = Math.max(0, (service.errorRate24h || 0) * 100);
    const errorColor = getErrorColorByPct(errorRatePct);
    const statusColor = getStatusColor(service.status);
    const hasElevatedErrors = errorRatePct >= 1;

    if (isPrimary) {
      const downstreamPreview = downstreamServices.slice(0, 3);
      const remainingCount = Math.max(
        0,
        downstreamServices.length - downstreamPreview.length
      );

      return (
        <motion.div
          key={`${service.name}-${index}`}
          style={{
            width: 'min(720px, 100%)',
            padding: '1.9rem',
            background: 'var(--color-background-secondary)',
            borderRadius: '20px',
            border: `1px solid ${hasElevatedErrors ? errorColor : 'var(--color-border)'}`,
            boxShadow: hasElevatedErrors
              ? '0 28px 60px -30px rgba(239, 68, 68, 0.55)'
              : 'var(--shadow-xl, 0 28px 55px -30px rgba(15, 23, 42, 0.55))',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 1.4, duration: 0.45, ease: 'easeOut' }}
          whileHover={{
            translateY: -8,
            boxShadow: hasElevatedErrors
              ? '0 30px 70px -28px rgba(239, 68, 68, 0.6)'
              : 'var(--shadow-2xl, 0 35px 75px -32px rgba(15, 23, 42, 0.6))',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '0 auto auto 50%',
              width: '440px',
              height: '440px',
              marginLeft: '-220px',
              opacity: 0.35,
              background: `radial-gradient(circle at center, ${statusColor}25, transparent 70%)`,
              pointerEvents: 'none',
              filter: 'blur(120px)',
            }}
            aria-hidden
          />

          <div
            style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <motion.div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '18px',
                  backgroundColor: `${statusColor}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.1rem',
                  color: statusColor,
                }}
                animate={{ rotate: [0, 6, -6, 0] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                {getStatusIcon(service.status)}
              </motion.div>
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    marginBottom: '0.5rem',
                  }}
                >
                  Core Gateway
                </div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    color: 'var(--color-text-primary)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {service.name}
                </h3>
                <p
                  style={{
                    margin: '0.35rem 0 0 0',
                    fontSize: '0.9rem',
                    color: 'var(--color-text-secondary)',
                    maxWidth: '32ch',
                  }}
                >
                  Acts as the unified edge for all product queries and federated
                  subgraphs.
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '0.5rem',
                minWidth: '140px',
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Error rate (24h)
              </span>
              <span
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: errorColor,
                }}
              >
                {formatErrorRate(service.errorRate24h)}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.75rem',
                  color: errorColor,
                  fontWeight: 600,
                }}
              >
                {hasElevatedErrors
                  ? 'Requires attention'
                  : 'Operating nominally'}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              Downstream services
            </span>
            {downstreamPreview.map((downstream) => {
              const downstreamColor = getStatusColor(downstream.status);
              return (
                <span
                  key={`downstream-${downstream.name}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '999px',
                    backgroundColor: `${downstreamColor}18`,
                    border: `1px solid ${downstreamColor}35`,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: downstreamColor,
                  }}
                >
                  {getStatusIcon(downstream.status)} {downstream.name}
                </span>
              );
            })}
            {remainingCount > 0 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                }}
              >
                +{remainingCount} more
              </span>
            )}
          </div>

          {hasElevatedErrors ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
              }}
            >
              <div
                style={{
                  height: '12px',
                  borderRadius: '999px',
                  background: 'var(--color-background-tertiary)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  style={{
                    height: '100%',
                    borderRadius: '999px',
                    background: `linear-gradient(90deg, ${errorColor}, ${errorColor}90)`,
                  }}
                  initial={{ width: '0%' }}
                  animate={{
                    width: `${Math.max(8, Math.min(100, errorRatePct))}%`,
                  }}
                  transition={{ delay: 0.3, duration: 0.7, ease: 'easeOut' }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: errorColor,
                }}
              >
                {errorRatePct > 5
                  ? '🔴 Critical downstream degradation detected.'
                  : '🟡 Elevated downstream errors observed.'}
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  ({formatErrorRate(service.errorRate24h)} of requests affected)
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.8rem 1rem',
                borderRadius: '14px',
                backgroundColor: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: 'var(--color-success)',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              ✅ Gateway routing all traffic without notable errors in the last
              24h.
            </div>
          )}
        </motion.div>
      );
    }

    return (
      <motion.div
        key={`${service.name}-${index}`}
        style={{
          padding: '1.5rem',
          background: 'var(--color-background-secondary)',
          borderRadius: '18px',
          border: `1px solid ${hasElevatedErrors ? errorColor : 'var(--color-border)'}`,
          boxShadow: hasElevatedErrors
            ? '0 20px 45px -24px rgba(239, 68, 68, 0.45)'
            : 'var(--shadow-lg, 0 18px 38px -25px rgba(15, 23, 42, 0.45))',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.6 + index * 0.08, duration: 0.35 }}
        whileHover={{
          translateY: -6,
          boxShadow: hasElevatedErrors
            ? '0 24px 48px -20px rgba(239, 68, 68, 0.55)'
            : 'var(--shadow-xl, 0 28px 55px -30px rgba(15, 23, 42, 0.55))',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <motion.div
            style={{
              fontSize: '1.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              backgroundColor: `${statusColor}20`,
              color: statusColor,
            }}
            animate={{
              rotate:
                service.status.toLowerCase() === 'active' ? [0, 10, -10, 0] : 0,
              scale:
                service.status.toLowerCase() === 'active' ? [1, 1.1, 1] : 1,
            }}
            transition={{ duration: 2.2, repeat: Infinity }}
          >
            {getStatusIcon(service.status)}
          </motion.div>
          <div style={{ flex: 1 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
              }}
            >
              {service.name}
            </h3>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginTop: '0.4rem',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '999px',
                  backgroundColor: `${statusColor}15`,
                  border: `1px solid ${statusColor}35`,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: statusColor,
                }}
              >
                {formatStatus(service.status)}
              </span>
              {service.breakingChanges24h > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '999px',
                    backgroundColor: 'var(--color-error)10',
                    border: '1px solid var(--color-error)35',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'var(--color-error)',
                  }}
                >
                  ⚠️ {service.breakingChanges24h} break
                  {service.breakingChanges24h > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.4rem',
              minWidth: '110px',
            }}
          >
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Error rate
            </span>
            <span
              style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                color: errorColor,
              }}
            >
              {formatErrorRate(service.errorRate24h)}
            </span>
          </div>
        </div>

        {hasElevatedErrors ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div
              style={{
                height: '10px',
                borderRadius: '999px',
                background: 'var(--color-background-tertiary)',
                overflow: 'hidden',
              }}
            >
              <motion.div
                style={{
                  height: '100%',
                  borderRadius: '999px',
                  background: `linear-gradient(90deg, ${errorColor}, ${errorColor}90)`,
                }}
                initial={{ width: '0%' }}
                animate={{
                  width: `${Math.max(8, Math.min(100, errorRatePct))}%`,
                }}
                transition={{ delay: 0.25, duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: errorColor,
              }}
            >
              {errorRatePct > 5 ? '🔴 Critical errors' : '🟡 Elevated errors'}
              <span style={{ color: 'var(--color-text-secondary)' }}>
                ({formatErrorRate(service.errorRate24h)} impacted)
              </span>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: '0.6rem 0.8rem',
              borderRadius: '12px',
              backgroundColor: 'var(--color-background-tertiary)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.8rem',
            }}
          >
            ✅ Stable in the last 24h
          </div>
        )}
      </motion.div>
    );
  };

  if (servicesLoading) {
    return (
      <motion.section
        style={{ marginBottom: '3rem' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.h2
          style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            marginBottom: '1.5rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: 'inherit' }}>⚡</span>
          Gateway Services Health
        </motion.h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`loading-card-${index}`}
              style={{
                height: '160px',
                borderRadius: '16px',
                background:
                  'linear-gradient(120deg, rgba(148,163,184,0.15), rgba(148,163,184,0.05))',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <motion.div
                style={{
                  position: 'absolute',
                  inset: '-40% 0 auto -60%',
                  width: '220%',
                  height: '120%',
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                }}
                animate={{ x: ['0%', '120%'] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.8,
                  ease: 'easeInOut',
                  delay: index * 0.12,
                }}
              />
            </div>
          ))}
        </div>
      </motion.section>
    );
  }

  if (servicesError) {
    return (
      <motion.section
        style={{
          marginBottom: '3rem',
          padding: '1.5rem',
          borderRadius: '16px',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          background: 'rgba(239, 68, 68, 0.1)',
          color: 'var(--color-error)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span role="img" aria-label="Error">
          ⚠️
        </span>
        Unable to load service health right now. {servicesError}
      </motion.section>
    );
  }

  if (!services.length) {
    return (
      <motion.section
        style={{
          marginBottom: '3rem',
          padding: '2rem',
          borderRadius: '18px',
          border: '1px dashed var(--color-border)',
          background: 'var(--color-background-secondary)',
          color: 'var(--color-text-secondary)',
          textAlign: 'center',
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3
          style={{
            margin: '0 0 0.75rem 0',
            fontSize: '1.1rem',
            fontWeight: 600,
          }}
        >
          No services registered yet
        </h3>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          Once services start reporting health, they will appear here with
          gateway context.
        </p>
      </motion.section>
    );
  }

  return (
    <motion.section
      style={{ marginBottom: '3rem' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8, duration: 0.5 }}
    >
      <motion.h2
        style={{
          fontSize: 'clamp(1.5rem, 3vw, 2rem)',
          marginBottom: '1.5rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
      >
        <span style={{ fontSize: 'inherit' }}>⚡</span>
        <span
          style={{
            background: 'linear-gradient(135deg, #10b981, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Gateway Services Health
        </span>
      </motion.h2>

      <motion.div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          margin: '0 0 2rem 0',
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.4 }}
      >
        {[
          {
            label: 'Active Services',
            value: `${serviceSummary.active} / ${serviceSummary.total}`,
            icon: '🟢',
            color: 'var(--color-success)',
          },
          {
            label: 'Avg Error Rate (24h)',
            value: formatErrorRate(serviceSummary.avgErrorPct / 100),
            icon: '📈',
            color: getErrorColorByPct(serviceSummary.avgErrorPct),
          },
          {
            label: 'Breaking Changes (24h)',
            value: serviceSummary.totalBreaking.toString(),
            icon: '⚠️',
            color:
              serviceSummary.totalBreaking > 0
                ? 'var(--color-warning)'
                : 'var(--color-success)',
          },
        ].map((metric, index) => (
          <motion.div
            key={metric.label}
            style={{
              padding: '1.25rem',
              background: 'var(--color-background-secondary)',
              borderRadius: '14px',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 + index * 0.1, duration: 0.3 }}
          >
            <span style={{ fontSize: '1.75rem' }}>{metric.icon}</span>
            <div>
              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '0.25rem',
                }}
              >
                {metric.label}
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: metric.color,
                }}
              >
                {metric.value}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '2rem',
          padding: '0.75rem 1rem',
          background: 'var(--color-background-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-secondary)',
          fontSize: '0.85rem',
          flexWrap: 'wrap',
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3, duration: 0.4 }}
      >
        {legend.map((item, index) => (
          <motion.span
            key={item.label}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.35 + index * 0.1, duration: 0.3 }}
          >
            <span style={{ fontSize: '1rem' }}>{item.icon}</span>
            {item.label}
          </motion.span>
        ))}
      </motion.div>

      <div
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.75rem',
        }}
      >
        {primaryService &&
          renderServiceCard(primaryService, 0, {
            isPrimary: true,
            downstreamServices: secondaryServices,
          })}

        {primaryService && secondaryServices.length > 0 && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <div
              style={{
                width: '2px',
                height: '28px',
                background:
                  'linear-gradient(180deg, rgba(59,130,246,0.6), transparent)',
              }}
            />
            <div
              style={{
                width: 'min(78%, 540px)',
                height: '1px',
                background:
                  'linear-gradient(90deg, transparent, var(--color-border), transparent)',
              }}
            />
          </div>
        )}

        {secondaryServices.length > 0 ? (
          <motion.div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1.5rem',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            {secondaryServices.map((service, index) =>
              renderServiceCard(service, index)
            )}
          </motion.div>
        ) : (
          <div
            style={{
              padding: '1rem 1.25rem',
              borderRadius: '12px',
              backgroundColor: 'var(--color-background-secondary)',
              border: '1px dashed var(--color-border)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.85rem',
            }}
          >
            No downstream services registered yet.
          </div>
        )}
      </div>
    </motion.section>
  );
};
