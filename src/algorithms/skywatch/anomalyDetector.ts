import {
  TelemetryTrackPoint,
  SkyWatchAlert,
  AnomalyDetectorConfig,
  RestrictedZone
} from '../../../shared/contracts';
import { haversineDistanceMeters } from './simulator';
import { classifyTrack, TRACK_CLASSIFICATION_LABELS } from '../../utils/trackClassification';

export const DEFAULT_ANOMALY_CONFIG: AnomalyDetectorConfig = {
  speedChangeThresholdKnots: 45,        // Acceleration or deceleration > 45 knots in one step
  routeDeviationThresholdMeters: 800,   // More than 800m off expected corridor
  staleTelemetryThresholdSec: 20,       // No update for > 20s
  restrictedZones: [
    {
      id: 'ZONE-BRAVO',
      name: 'Restricted Airspace Zone Bravo (High-Value Asset)',
      centerLat: 34.062,
      centerLng: -118.255,
      radiusKm: 1.5,
      maxAltitudeMeters: 1000
    }
  ]
};

export const KNOTS_TO_MS = 0.514444;
export const SUDDEN_ACCEL_THRESHOLD_MS2 = 150 * 0.514444; // 150 kts per second in SI m/s^2

interface AlertKeyState {
  isOpen: boolean;
  alertId: string;
  falseSinceSimTimeMs: number | null;
}

export class SkyWatchAnomalyDetector {
  private config: AnomalyDetectorConfig;
  private previousTrackPoints: Map<string, TelemetryTrackPoint> = new Map();
  private firstSampleFlags: Set<string> = new Set();
  private activeAlertKeys: Map<string, AlertKeyState> = new Map();
  private alerts: SkyWatchAlert[] = [];
  private alertCounter: number = 100;

  public accelThresholdMs2: number = SUDDEN_ACCEL_THRESHOLD_MS2;

  constructor(customConfig?: Partial<AnomalyDetectorConfig>) {
    this.config = {
      ...DEFAULT_ANOMALY_CONFIG,
      ...customConfig
    };
    if (customConfig?.speedChangeThresholdKnots !== undefined) {
      this.accelThresholdMs2 = (customConfig.speedChangeThresholdKnots / 5) * KNOTS_TO_MS;
    } else {
      this.accelThresholdMs2 = SUDDEN_ACCEL_THRESHOLD_MS2;
    }
  }

  public getConfig(): AnomalyDetectorConfig {
    return this.config;
  }

  /**
   * Reset the detector state (e.g. after simulation reset or test setup)
   */
  public reset(): void {
    this.previousTrackPoints.clear();
    this.firstSampleFlags.clear();
    this.activeAlertKeys.clear();
    this.alerts = [];
  }

  /**
   * Reconnect hook to mark subsequent track updates as first sample
   */
  public reconnect(): void {
    this.previousTrackPoints.clear();
    this.firstSampleFlags.clear();
    this.activeAlertKeys.clear();
  }

  /**
   * State machine managing open alert keys, 5s close timer, and de-duplication.
   */
  private processAlertCondition(
    trackId: string,
    ruleName: string,
    isConditionTrue: boolean,
    simTimeMs: number,
    createAlertFn: () => SkyWatchAlert
  ): SkyWatchAlert | null {
    const key = `${trackId}:${ruleName}`;
    let state = this.activeAlertKeys.get(key);
    if (!state) {
      state = { isOpen: false, alertId: '', falseSinceSimTimeMs: null };
      this.activeAlertKeys.set(key, state);
    }

    if (isConditionTrue) {
      state.falseSinceSimTimeMs = null;
      if (!state.isOpen) {
        state.isOpen = true;
        const alert = createAlertFn();
        state.alertId = alert.id;
        return alert;
      }
      return null;
    } else {
      if (state.isOpen) {
        if (state.falseSinceSimTimeMs === null) {
          state.falseSinceSimTimeMs = simTimeMs;
        } else if (simTimeMs - state.falseSinceSimTimeMs >= 5000) {
          // Closed after 5 consecutive simulated seconds of condition being false
          state.isOpen = false;
          state.alertId = '';
          state.falseSinceSimTimeMs = null;
        }
      }
      return null;
    }
  }

  /**
   * Returns whether an alert key is currently open
   */
  public isAlertKeyOpen(trackId: string, ruleName: string): boolean {
    const key = `${trackId}:${ruleName}`;
    const state = this.activeAlertKeys.get(key);
    return Boolean(state?.isOpen);
  }

  /**
   * Prunes tracks that have not received an update within 10 simulated seconds.
   * Closes open alert keys through the FIX-02 rule (5s false condition buffer).
   */
  public pruneStaleTracks(currentSimTimeMs: number, staleThresholdMs: number = 10000): string[] {
    const prunedTrackIds: string[] = [];

    for (const [trackId, pt] of this.previousTrackPoints.entries()) {
      const ptMs = new Date(pt.timestamp).getTime();
      const elapsedMs = currentSimTimeMs - ptMs;

      if (elapsedMs >= staleThresholdMs) {
        prunedTrackIds.push(trackId);

        // Close all active alert keys for this track via FIX-02 5s rule
        for (const [key, state] of this.activeAlertKeys.entries()) {
          if (key.startsWith(`${trackId}:`)) {
            if (state.isOpen) {
              // Condition has been false since last sample (elapsedMs >= 10000 >= 5000)
              state.isOpen = false;
              state.alertId = '';
              state.falseSinceSimTimeMs = null;
            }
          }
        }

        // Close associated alerts
        for (const alert of this.alerts) {
          if (alert.trackId === trackId) {
            (alert as any).closed = true;
          }
        }

        this.previousTrackPoints.delete(trackId);
        this.firstSampleFlags.delete(trackId);
      }
    }

    return prunedTrackIds;
  }

  /**
   * Evaluate a newly received telemetry track point against all anomaly rules.
   * Returns newly triggered alerts, if any.
   */
  public evaluate(currentPoint: TelemetryTrackPoint, currentTimeIso?: string): SkyWatchAlert[] {
    const newAlerts: SkyWatchAlert[] = [];
    const prevPoint = this.previousTrackPoints.get(currentPoint.trackId);
    const isFirstSample = !prevPoint || this.firstSampleFlags.has(currentPoint.trackId);
    const currTimeMs = currentTimeIso ? new Date(currentTimeIso).getTime() : new Date(currentPoint.timestamp).getTime();

    // 1. Rule: Speed Change / Acceleration Anomaly
    let isSpeedBreach = false;
    let accelKtsPerSec = 0;
    let deltaKnots = 0;
    let dtSim = 1;

    if (!isFirstSample && prevPoint) {
      const prevTimeMs = new Date(prevPoint.timestamp).getTime();
      dtSim = (currTimeMs - prevTimeMs) / 1000;

      if (dtSim > 0) {
        deltaKnots = Math.abs(currentPoint.speedKnots - prevPoint.speedKnots);
        const speedDeltaMs = deltaKnots * KNOTS_TO_MS;
        const accelMs2 = speedDeltaMs / dtSim;

        const isAccelBreach = accelMs2 >= this.accelThresholdMs2;
        const isStepDeltaBreach = this.config.speedChangeThresholdKnots !== undefined &&
          deltaKnots >= this.config.speedChangeThresholdKnots &&
          dtSim <= 5 &&
          accelMs2 >= (this.config.speedChangeThresholdKnots / 5) * KNOTS_TO_MS;

        if (isAccelBreach || isStepDeltaBreach) {
          isSpeedBreach = true;
          accelKtsPerSec = accelMs2 / KNOTS_TO_MS;
        }
      }
    }

    const speedAlert = this.processAlertCondition(
      currentPoint.trackId,
      'speed_anomaly',
      isSpeedBreach,
      currTimeMs,
      () => ({
        id: `ALT-${this.alertCounter++}`,
        trackId: currentPoint.trackId,
        severity: accelKtsPerSec >= 200 ? 'critical' : 'warning',
        ruleName: 'speed_anomaly',
        observedValue: `${accelKtsPerSec.toFixed(1)} kts/s accel (${deltaKnots.toFixed(1)} kts delta, ${prevPoint?.speedKnots ?? 0} -> ${currentPoint.speedKnots} kts in ${dtSim.toFixed(2)}s)`,
        threshold: `${(this.accelThresholdMs2 / KNOTS_TO_MS).toFixed(1)} kts/s max acceleration`,
        explanation: `Sudden kinematic velocity shift detected: Acceleration reached ${accelKtsPerSec.toFixed(1)} kts/s (${deltaKnots.toFixed(1)} kts delta in ${dtSim.toFixed(2)}s), exceeding threshold of ${(this.accelThresholdMs2 / KNOTS_TO_MS).toFixed(1)} kts/s.`,
        timestamp: currentPoint.timestamp,
        acknowledged: false,
        isSimulated: true
      })
    );
    if (speedAlert) newAlerts.push(speedAlert);

    // 2. Rule: Restricted Zone Breach (with Hysteresis: exit requires 2% radius or 50m outside)
    for (const zone of this.config.restrictedZones) {
      const distMeters = haversineDistanceMeters(
        currentPoint.lat,
        currentPoint.lng,
        zone.centerLat,
        zone.centerLng
      );
      const zoneRadiusMeters = zone.radiusKm * 1000;
      const zoneKey = `${currentPoint.trackId}:restricted_zone_entry`;
      const isKeyCurrentlyOpen = this.activeAlertKeys.get(zoneKey)?.isOpen ?? false;

      // Hysteresis calculation: if already inside, exit boundary extends by 2% of radius (or 50m)
      const hysteresisBuffer = Math.max(50, 0.02 * zoneRadiusMeters);
      const boundaryThresholdMeters = isKeyCurrentlyOpen
        ? zoneRadiusMeters + hysteresisBuffer
        : zoneRadiusMeters;

      const isInside = distMeters <= boundaryThresholdMeters && currentPoint.altitudeMeters <= zone.maxAltitudeMeters;
      const trackClass = classifyTrack(currentPoint as any);
      const isFriendlyOrCivilian = trackClass === 'FRIENDLY' || trackClass === 'CIVILIAN';

      const zoneAlert = this.processAlertCondition(
        currentPoint.trackId,
        'restricted_zone_entry',
        isInside,
        currTimeMs,
        () => ({
          id: `ALT-${this.alertCounter++}`,
          trackId: currentPoint.trackId,
          severity: isFriendlyOrCivilian ? 'info' : 'critical',
          ruleName: 'restricted_zone_entry',
          observedValue: `${(distMeters / 1000).toFixed(2)} km from zone center [${TRACK_CLASSIFICATION_LABELS[trackClass]}]`,
          threshold: `Inside ${zone.radiusKm} km radius (${zone.name})`,
          explanation: isFriendlyOrCivilian
            ? `Authorized transit: ${TRACK_CLASSIFICATION_LABELS[trackClass]} "${currentPoint.callsign || currentPoint.trackId}" operating within "${zone.name}". Informational entry logged.`
            : `Airspace violation: Track entered protected perimeter of "${zone.name}". Distance to epicenter is ${(distMeters / 1000).toFixed(2)} km (threshold: ${zone.radiusKm} km, altitude: ${currentPoint.altitudeMeters}m / max: ${zone.maxAltitudeMeters}m).`,
          timestamp: currentPoint.timestamp,
          acknowledged: false,
          isSimulated: true
        })
      );
      if (zoneAlert) newAlerts.push(zoneAlert);
    }

    // 3. Rule: Stale Telemetry
    let isStale = false;
    let elapsedSec = 0;
    if (prevPoint) {
      const prevTimeMs = new Date(prevPoint.timestamp).getTime();
      elapsedSec = (currTimeMs - prevTimeMs) / 1000;
      if (elapsedSec > this.config.staleTelemetryThresholdSec) {
        isStale = true;
      }
    }

    const staleAlert = this.processAlertCondition(
      currentPoint.trackId,
      'stale_telemetry',
      isStale,
      currTimeMs,
      () => ({
        id: `ALT-${this.alertCounter++}`,
        trackId: currentPoint.trackId,
        severity: 'warning',
        ruleName: 'stale_telemetry',
        observedValue: `${elapsedSec.toFixed(0)} seconds elapsed`,
        threshold: `${this.config.staleTelemetryThresholdSec} seconds max silence`,
        explanation: `Signal dropout anomaly: Telemetry silence of ${elapsedSec.toFixed(0)} seconds exceeded heartbeat limit of ${this.config.staleTelemetryThresholdSec} seconds. Potential transponder outage or jamming.`,
        timestamp: currentPoint.timestamp,
        acknowledged: false,
        isSimulated: true
      })
    );
    if (staleAlert) newAlerts.push(staleAlert);

    // Store track point for subsequent delta calculations
    this.previousTrackPoints.set(currentPoint.trackId, { ...currentPoint });
    this.firstSampleFlags.delete(currentPoint.trackId);

    // Append to master alert list
    this.alerts.push(...newAlerts);
    return newAlerts;
  }

  /**
   * Check for stale telemetry on active tracks given a wall-clock reference time
   */
  public checkStaleness(referenceTimeIso: string): SkyWatchAlert[] {
    const staleAlerts: SkyWatchAlert[] = [];
    const refMs = new Date(referenceTimeIso).getTime();

    for (const [trackId, pt] of this.previousTrackPoints.entries()) {
      const ptMs = new Date(pt.timestamp).getTime();
      const elapsedSec = (refMs - ptMs) / 1000;

      if (elapsedSec > this.config.staleTelemetryThresholdSec) {
        // Only trigger if we haven't already triggered for this exact timestamp
        const alreadyFlagged = this.alerts.some(
          a => a.trackId === trackId && a.ruleName === 'stale_telemetry' && a.timestamp === referenceTimeIso
        );
        if (!alreadyFlagged) {
          const alert: SkyWatchAlert = {
            id: `ALT-${this.alertCounter++}`,
            trackId,
            severity: 'warning',
            ruleName: 'stale_telemetry',
            observedValue: `${elapsedSec.toFixed(0)} seconds elapsed`,
            threshold: `${this.config.staleTelemetryThresholdSec} seconds max silence`,
            explanation: `Signal dropout anomaly: Track "${pt.callsign}" has ceased transmitting for ${elapsedSec.toFixed(0)} seconds (threshold: ${this.config.staleTelemetryThresholdSec}s).`,
            timestamp: referenceTimeIso,
            acknowledged: false,
            isSimulated: true
          };
          staleAlerts.push(alert);
          this.alerts.push(alert);
        }
      }
    }

    return staleAlerts;
  }

  /**
   * Acknowledge an alert by ID
   */
  public acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  public getAlerts(): SkyWatchAlert[] {
    return this.alerts.map(a => ({ ...a }));
  }

  public getUnacknowledgedAlerts(): SkyWatchAlert[] {
    return this.alerts.filter(a => !a.acknowledged);
  }

  public clear(): void {
    this.previousTrackPoints.clear();
    this.alerts = [];
  }
}
