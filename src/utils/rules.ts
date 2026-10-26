/**
 * Canonical Rule IDs and human-readable label mappings for the SkyWatch anomaly engine.
 */
export enum CanonicalRuleId {
  SUDDEN_ACCELERATION = 'SUDDEN_ACCELERATION',
  ZONE_INCURSION = 'ZONE_INCURSION',
  ROUTE_DEVIATION = 'ROUTE_DEVIATION',
  STALE_TELEMETRY = 'STALE_TELEMETRY',
  UNUSUAL_ALTITUDE_DROP = 'UNUSUAL_ALTITUDE_DROP',
}

export const RULE_ID_LABELS: Record<CanonicalRuleId, string> = {
  [CanonicalRuleId.SUDDEN_ACCELERATION]: 'Sudden Acceleration Spike',
  [CanonicalRuleId.ZONE_INCURSION]: 'Restricted Airspace Incursion',
  [CanonicalRuleId.ROUTE_DEVIATION]: 'Flight Corridor Deviation',
  [CanonicalRuleId.STALE_TELEMETRY]: 'Telemetry Signal Loss',
  [CanonicalRuleId.UNUSUAL_ALTITUDE_DROP]: 'Rapid Altitude Loss',
};

/**
 * Normalizes legacy, snake_case, and alternate rule ids into the canonical RuleId enum.
 */
export function normalizeRuleId(rawId: string): CanonicalRuleId {
  const normalized = (rawId || '').trim();
  switch (normalized) {
    case 'RAPID_ACCELERATION_SPIKE':
    case 'speed_anomaly':
    case 'SPEED_ANOMALY':
    case 'SUDDEN_ACCELERATION':
      return CanonicalRuleId.SUDDEN_ACCELERATION;

    case 'NO_FLY_ZONE_INCURSION':
    case 'restricted_zone_entry':
    case 'GEOFENCE_INCURSION':
    case 'ZONE_INCURSION':
      return CanonicalRuleId.ZONE_INCURSION;

    case 'FLIGHT_PATH_DEVIATION':
    case 'route_deviation':
    case 'ROUTE_DEVIATION':
      return CanonicalRuleId.ROUTE_DEVIATION;

    case 'STALE_TELEMETRY_SIGNAL':
    case 'stale_telemetry':
    case 'STALE_TELEMETRY':
      return CanonicalRuleId.STALE_TELEMETRY;

    case 'UNUSUAL_ALTITUDE_DROP':
    case 'altitude_drop':
    default:
      return CanonicalRuleId.UNUSUAL_ALTITUDE_DROP;
  }
}

/**
 * Formats any raw rule id into a friendly, human-readable UI label.
 * Never outputs a raw UPPERCASE_ID in standard UI surfaces.
 */
export function formatRuleLabel(rawId: string): string {
  const canonical = normalizeRuleId(rawId);
  return RULE_ID_LABELS[canonical] || 'Airspace Anomaly';
}
