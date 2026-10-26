export type TrackClassification = 'FRIENDLY' | 'CIVILIAN' | 'HOSTILE' | 'UNKNOWN';

export const TRACK_CLASSIFICATION_LABELS: Record<TrackClassification, string> = {
  FRIENDLY: 'Friendly Force',
  CIVILIAN: 'Civilian Traffic',
  HOSTILE: 'Hostile Incursion',
  UNKNOWN: 'Unidentified Contact',
};

/**
 * Canonical classification logic for all 5 presentation surfaces:
 * 1. Map symbol
 * 2. Map label
 * 3. Threat queue
 * 4. Alert text
 * 5. Inspection card
 */
export function classifyTrack(track?: {
  classification?: string;
  type?: string;
  status?: string;
  callsign?: string;
  squawk?: string | number;
  threatScore?: number;
}): TrackClassification {
  if (!track) return 'UNKNOWN';

  const cls = (track.classification || '').toUpperCase();
  const type = (track.type || '').toLowerCase();
  const status = (track.status || '').toLowerCase();
  const callsign = (track.callsign || '').toUpperCase();
  const squawk = String(track.squawk ?? '');

  // 1. FRIENDLY
  if (
    cls === 'FRIENDLY' ||
    type === 'friendly_uav' ||
    status === 'friendly' ||
    callsign.includes('FRIENDLY') ||
    callsign.includes('BLUE') ||
    callsign.includes('GUARDIAN') ||
    callsign.includes('SENTINEL-BLUE')
  ) {
    return 'FRIENDLY';
  }

  // 2. CIVILIAN with authorized squawk or commercial registry
  if (
    cls === 'CIVILIAN' ||
    cls === 'NEUTRAL' ||
    type === 'commercial_fixed_wing' ||
    status === 'neutral' ||
    squawk === '1200' ||
    squawk === '7000' ||
    callsign.includes('PIPER') ||
    callsign.includes('CESSNA') ||
    callsign.includes('AIRLINER')
  ) {
    return 'CIVILIAN';
  }

  // 3. HOSTILE
  if (
    cls === 'HOSTILE' ||
    status === 'hostile' ||
    type === 'stealth_incursion' ||
    (track.threatScore !== undefined && track.threatScore >= 80)
  ) {
    return 'HOSTILE';
  }

  return 'UNKNOWN';
}
