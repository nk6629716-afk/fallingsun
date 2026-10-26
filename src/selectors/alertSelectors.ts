import { AirspaceAlert } from '@shared/types';

/**
 * Returns all unacknowledged (open) airspace alerts.
 */
export function selectOpenAlerts(alerts: AirspaceAlert[] = []): AirspaceAlert[] {
  const seen = new Set<string>();
  // Informational activity entries and closed stale alerts do not count as open alerts
  const unack = alerts.filter(
    (a) => !a.acknowledged && (a.severity as string) !== 'info' && !(a as any).closed && (a as any).status !== 'closed'
  );
  const deduplicated: AirspaceAlert[] = [];
  for (const a of unack) {
    const key = `${a.trackId || 'unknown'}:${a.ruleName || a.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(a);
    }
  }
  return deduplicated;
}

/**
 * Returns all acknowledged alerts.
 */
export function selectAcknowledgedAlerts(alerts: AirspaceAlert[] = []): AirspaceAlert[] {
  return alerts.filter((a) => a.acknowledged);
}

/**
 * Computes alert summary counts.
 */
export function selectAlertCounts(alerts: AirspaceAlert[] = []) {
  const open = selectOpenAlerts(alerts);
  const critical = open.filter((a) => a.severity === 'critical');
  return {
    total: alerts.length,
    openCount: open.length,
    criticalCount: critical.length,
  };
}
