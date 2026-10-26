/**
 * SENTINEL — Central Formatting & Unit Standardization Utility
 *
 * Enforces:
 * 1. Single source of truth for duration, distance, speed, and time.
 * 2. Zero concatenation typos (e.g. prevents "12 minm").
 * 3. Consistent speed in km/h across all labels, cards, alerts, and exports.
 * 4. Human-readable airspace rule names (e.g. NO_FLY_ZONE_INCURSION -> "Restricted Zone Incursion").
 */

export { formatDurationMinutes, formatDistanceKm, formatSpeedKmh, formatAltitudeMeters } from './units';

/**
 * Rule Name Human Translation Map
 */
const RULE_HUMAN_NAMES: Record<string, string> = {
  ZONE_INCURSION: 'Restricted Zone Incursion',
  NO_FLY_ZONE_INCURSION: 'No-Fly Zone Incursion',
  restricted_zone_entry: 'Restricted Airspace Breach',
  SUDDEN_ACCELERATION: 'Kinematic Acceleration Anomaly',
  speed_anomaly: 'Speed Envelope Breach',
  ALTITUDE_CORRIDOR_BREACH: 'Altitude Floor Breach',
  stale_telemetry: 'Signal Dropout Anomaly',
  TRANSPONDER_LOSS: 'Transponder Signal Dropout',
  LOITERING_BEHAVIOR: 'Anomalous Loitering Profile',
};

export function formatRuleName(rawRuleId: string | null | undefined): string {
  if (!rawRuleId) return 'Operational Rule Breach';
  if (RULE_HUMAN_NAMES[rawRuleId]) {
    return RULE_HUMAN_NAMES[rawRuleId];
  }
  // Convert SNAKE_CASE or camelCase to Title Case
  return rawRuleId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Format track classification consistently across symbols, cards, and ledgers.
 */
export type EntityClassification = 'friendly' | 'hostile' | 'neutral' | 'unknown' | 'suspicious';

export function getTrackClassification(track: {
  status?: string;
  type?: string;
  threatScore?: number;
}): EntityClassification {
  const type = (track.type || '').toLowerCase();
  const status = (track.status || '').toLowerCase();
  const score = track.threatScore ?? 0;

  if (type === 'friendly_uav' || status === 'friendly') {
    return 'friendly';
  }
  if (type === 'commercial' || type === 'civilian' || status === 'neutral') {
    return 'neutral';
  }
  if (status === 'hostile' || type === 'stealth_incursion' || score >= 70) {
    return 'hostile';
  }
  if (status === 'suspicious' || score >= 35) {
    return 'suspicious';
  }
  return 'unknown';
}

export function formatClassificationLabel(classification: EntityClassification): string {
  switch (classification) {
    case 'friendly':
      return 'Friendly UAS';
    case 'neutral':
      return 'Civilian Aircraft';
    case 'hostile':
      return 'Hostile Drone Signature';
    case 'suspicious':
      return 'Unidentified / Suspicious Track';
    default:
      return 'Unknown Radar Contact';
  }
}
