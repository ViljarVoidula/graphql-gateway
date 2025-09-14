export interface ServiceHealthInput {
  status: string; // active | inactive | maintenance
  breakingChanges24h: number;
  errorRate24h: number; // 0..1
}

/**
 * Compute health score as described in dashboard.
 * base = active/total; penalty = avgErrorRate * 0.3 + (totalBreaking * 0.05)/total
 */
export function computeHealthScore(services: ServiceHealthInput[]): number {
  if (services.length === 0) return 100;
  const total = services.length;
  const active = services.filter((s) => s.status === 'active').length;
  const base = active / total;
  const totalBreaking = services.reduce((a, s) => a + (s.breakingChanges24h || 0), 0);
  const avgErrorRate = services.reduce((a, s) => a + (s.errorRate24h || 0), 0) / total;
  const penalty = avgErrorRate * 0.3 + (totalBreaking * 0.05) / total;
  const score = Math.max(0, Math.min(1, base - penalty));
  return Math.round(score * 100);
}

export function offlineServices(services: ServiceHealthInput[]): ServiceHealthInput[] {
  return services.filter((s) => s.status !== 'active');
}

export function servicesWithBreakingChanges(services: ServiceHealthInput[]): ServiceHealthInput[] {
  return services.filter((s) => (s.breakingChanges24h || 0) > 0);
}
