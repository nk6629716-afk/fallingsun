/**
 * SENTINEL Numeric Safety & Sanitization System
 * FIX-06: Normalization, clamping, division guards, NaN/Infinity fallback with single-log warning.
 */

const loggedWarnings = new Set<string>();

/**
 * Logs a warning exactly once per unique key
 */
export function logWarningOnce(key: string, message: string): void {
  if (!loggedWarnings.has(key)) {
    loggedWarnings.add(key);
    console.warn(`[NumericSafety] ${message}`);
  }
}

/**
 * Resets logged warning keys (useful for testing)
 */
export function resetWarningLogs(): void {
  loggedWarnings.clear();
}

/**
 * Normalizes heading to [0, 360) using canonical ((h % 360) + 360) % 360.
 * Replaces NaN/Infinity with fallback (or 0) and logs once.
 */
export function normalizeHeading(h: number, fallback: number = 0): number {
  if (typeof h !== 'number' || isNaN(h) || !isFinite(h)) {
    logWarningOnce('invalid_heading', `Invalid heading encountered: ${h}. Replaced with ${fallback}.`);
    h = fallback;
  }
  return ((h % 360) + 360) % 360;
}

/**
 * Clamps speed to >= 0.
 * Replaces NaN/Infinity with fallback (or 0) and logs once.
 */
export function clampSpeed(speed: number, fallback: number = 0): number {
  if (typeof speed !== 'number' || isNaN(speed) || !isFinite(speed)) {
    logWarningOnce('invalid_speed', `Invalid speed encountered: ${speed}. Replaced with ${fallback}.`);
    speed = fallback;
  }
  return Math.max(0, speed);
}

/**
 * Clamps altitude to >= 0.
 * Replaces NaN/Infinity with fallback (or 0) and logs once.
 */
export function clampAltitude(altitude: number, fallback: number = 0): number {
  if (typeof altitude !== 'number' || isNaN(altitude) || !isFinite(altitude)) {
    logWarningOnce('invalid_altitude', `Invalid altitude encountered: ${altitude}. Replaced with ${fallback}.`);
    altitude = fallback;
  }
  return Math.max(0, altitude);
}

/**
 * Clamps threat score to an integer 0..100.
 * Replaces NaN/Infinity with fallback (or 0) and logs once.
 */
export function clampThreatScore(score: number, fallback: number = 0): number {
  if (typeof score !== 'number' || isNaN(score) || !isFinite(score)) {
    logWarningOnce('invalid_threat_score', `Invalid threat score encountered: ${score}. Replaced with ${fallback}.`);
    score = fallback;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Guards division against zero, NaN, and Infinity.
 */
export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (
    typeof numerator !== 'number' ||
    typeof denominator !== 'number' ||
    isNaN(numerator) ||
    isNaN(denominator) ||
    !isFinite(numerator) ||
    !isFinite(denominator) ||
    denominator === 0
  ) {
    logWarningOnce('safe_divide_guard', `Division guarded: ${numerator} / ${denominator}. Fallback: ${fallback}`);
    return fallback;
  }
  const result = numerator / denominator;
  if (!isFinite(result) || isNaN(result)) {
    return fallback;
  }
  return result;
}

/**
 * Sanitizes track telemetry object:
 * Replaces NaN/Infinity with last valid value, normalizes heading, clamps speed, altitude, and threat score.
 */
export function sanitizeTrack<T extends {
  heading: number;
  speed: number;
  altitude: number;
  threatScore?: number;
  lat: number;
  lng: number;
}>(track: T, previousValidTrack?: Partial<T>): T {
  const prevHeading = previousValidTrack?.heading !== undefined && isFinite(previousValidTrack.heading) ? previousValidTrack.heading : 0;
  const prevSpeed = previousValidTrack?.speed !== undefined && isFinite(previousValidTrack.speed) ? previousValidTrack.speed : 0;
  const prevAltitude = previousValidTrack?.altitude !== undefined && isFinite(previousValidTrack.altitude) ? previousValidTrack.altitude : 0;
  const prevLat = previousValidTrack?.lat !== undefined && isFinite(previousValidTrack.lat) ? previousValidTrack.lat : 34.05;
  const prevLng = previousValidTrack?.lng !== undefined && isFinite(previousValidTrack.lng) ? previousValidTrack.lng : -118.25;
  const prevThreatScore = previousValidTrack?.threatScore !== undefined && isFinite(previousValidTrack.threatScore) ? previousValidTrack.threatScore : 0;

  let lat = track.lat;
  if (typeof lat !== 'number' || isNaN(lat) || !isFinite(lat)) {
    logWarningOnce('invalid_lat', `Invalid lat: ${lat}. Using fallback ${prevLat}`);
    lat = prevLat;
  }

  let lng = track.lng;
  if (typeof lng !== 'number' || isNaN(lng) || !isFinite(lng)) {
    logWarningOnce('invalid_lng', `Invalid lng: ${lng}. Using fallback ${prevLng}`);
    lng = prevLng;
  }

  const heading = normalizeHeading(track.heading, prevHeading);
  const speed = clampSpeed(track.speed, prevSpeed);
  const altitude = clampAltitude(track.altitude, prevAltitude);

  const res: T = {
    ...track,
    lat,
    lng,
    heading,
    speed,
    altitude,
  };

  if (track.threatScore !== undefined) {
    res.threatScore = clampThreatScore(track.threatScore, prevThreatScore);
  }

  return res;
}
