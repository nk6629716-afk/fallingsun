import { db } from '../db/database';
import {
  TelemetryTrack,
  Alert,
  AnomalyRuleName,
} from '../../../shared/types';
import { eventBus } from '../realtime/eventBus';

const VALID_ANOMALY_RULES: readonly AnomalyRuleName[] = [
  'NO_FLY_ZONE_INCURSION',
  'ZONE_INCURSION',
  'RAPID_ACCELERATION_SPIKE',
  'SUDDEN_ACCELERATION',
  'UNUSUAL_ALTITUDE_DROP',
  'FLIGHT_PATH_DEVIATION',
  'ROUTE_DEVIATION',
  'STALE_TELEMETRY_SIGNAL',
  'STALE_TELEMETRY',
  'speed_anomaly',
  'route_deviation',
  'restricted_zone_entry',
  'stale_telemetry',
] as const;

function isAnomalyRuleName(rule: string): rule is AnomalyRuleName {
  for (let i = 0; i < VALID_ANOMALY_RULES.length; i++) {
    if (VALID_ANOMALY_RULES[i] === rule) return true;
  }
  return false;
}

export class TelemetryService {
  // Configured fictional restricted zone for demo
  private restrictedZone = {
    name: 'Sector Echo - Humanitarian Corridor',
    centerLat: 34.0580,
    centerLng: -118.2510,
    radiusKm: 0.6,
  };

  private running: boolean = true;
  private lastTickAt: string = new Date().toISOString();

  public isRunning(): boolean {
    return this.running;
  }

  public pause(): void {
    this.running = false;
  }

  public resume(): void {
    this.running = true;
  }

  public getLastTickAt(): string {
    return this.lastTickAt;
  }

  public getTracks(): TelemetryTrack[] {
    return db.getTracks();
  }

  public getTrackById(id: string): TelemetryTrack | null {
    return db.getTrackById(id);
  }

  public getAlerts(filter?: { acknowledged?: boolean; trackId?: string; severity?: string }): Alert[] {
    return db.getAlerts(filter);
  }

  public getAlertById(id: string): Alert | null {
    return db.getAlertById(id);
  }

  public acknowledgeAlert(id: string): Alert | null {
    const alert = db.getAlertById(id);
    if (!alert) return null;

    const updated: Alert = {
      ...alert,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
    };

    db.saveAlert(updated);
    eventBus.publish('alert:acknowledged', updated);
    return updated;
  }

  private previousSpeeds: Map<string, number> = new Map();

  private hasActiveAlert(trackId: string, ruleName: string): boolean {
    const alerts = db.getAlerts({ trackId, acknowledged: false });
    return alerts.some((a) => a.ruleName === ruleName);
  }

  // Simulation step: advance track positions and evaluate rules deterministically
  public stepSimulation(): { tracks: TelemetryTrack[]; newAlerts: Alert[] } {
    const tracks = db.getTracks();
    const newAlerts: Alert[] = [];
    const now = new Date().toISOString();
    this.lastTickAt = now;

    for (const track of tracks) {
      const speedKts = track.speedKts ?? (track.speed ? track.speed * 1.94384 : 40);
      const headingDeg = track.headingDeg ?? track.heading ?? 0;
      const speedKmPerMin = (speedKts * 1.852) / 60;
      const headingRad = (headingDeg * Math.PI) / 180;

      const trackLat = track.position?.lat ?? track.lat ?? 0;
      const trackLng = track.position?.lng ?? track.lng ?? 0;
      const altitudeMeters = track.position?.altitudeMeters ?? track.altitude ?? 120;

      const deltaLat = (Math.cos(headingRad) * (speedKmPerMin * 0.05)) / 111;
      const deltaLng = (Math.sin(headingRad) * (speedKmPerMin * 0.05)) / (111 * Math.cos((trackLat * Math.PI) / 180));

      const newLat = parseFloat((trackLat + deltaLat).toFixed(6));
      const newLng = parseFloat((trackLng + deltaLng).toFixed(6));

      // Kinematic acceleration tracking
      const prevSpeed = this.previousSpeeds.get(track.id) ?? speedKts;
      const speedDelta = speedKts - prevSpeed;
      this.previousSpeeds.set(track.id, speedKts);

      // Current active anomaly flags set for this track (runtime-validated via type guard)
      const validFlags = (track.anomalyFlags || []).filter(isAnomalyRuleName);
      const currentFlags = new Set<AnomalyRuleName>(validFlags);

      // Check Anomaly Rules
      // 1. Zone incursion
      const distToZone = this.calculateDistanceKm(
        newLat,
        newLng,
        this.restrictedZone.centerLat,
        this.restrictedZone.centerLng
      );

      const isInsideZone = distToZone <= this.restrictedZone.radiusKm;
      if (isInsideZone) {
        if (!currentFlags.has('ZONE_INCURSION') && !this.hasActiveAlert(track.id, 'ZONE_INCURSION')) {
          currentFlags.add('ZONE_INCURSION');
          const alert: Alert = {
            id: `ALT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
            trackId: track.id,
            severity: 'critical',
            ruleName: 'ZONE_INCURSION',
            observedValue: `${(distToZone * 1000).toFixed(0)}m from center of ${this.restrictedZone.name}`,
            threshold: `Within ${this.restrictedZone.radiusKm * 1000}m boundary`,
            explanation: `Simulated track entered protected zone airspace (${this.restrictedZone.name}) without flight clearance.`,
            timestamp: now,
            acknowledged: false,
            isSimulated: true,
          };

          db.saveAlert(alert);
          newAlerts.push(alert);
          eventBus.publish('alert:triggered', alert);
        }
      } else {
        // Track has cleared the zone perimeter
        currentFlags.delete('ZONE_INCURSION');
      }

      // 2. High speed / sudden acceleration rule
      // Triggers if sudden velocity spike (delta >= 25 kts) OR unauthorized speed ceiling (> 75 kts for non-commercial aircraft)
      const isAccelerating = speedDelta >= 25 || (speedKts > 75 && track.type !== 'commercial_fixed_wing');
      if (isAccelerating) {
        if (!currentFlags.has('SUDDEN_ACCELERATION') && !this.hasActiveAlert(track.id, 'SUDDEN_ACCELERATION')) {
          currentFlags.add('SUDDEN_ACCELERATION');
          const observed = speedDelta >= 20
            ? `+${speedDelta.toFixed(0)} kts in 3s (${speedKts} kts)`
            : `${speedKts} kts observed`;
          const alert: Alert = {
            id: `ALT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
            trackId: track.id,
            severity: 'high',
            ruleName: 'SUDDEN_ACCELERATION',
            observedValue: observed,
            threshold: '> 75 kts maximum authorized ceiling',
            explanation: 'Rapid kinetic acceleration or ceiling breach detected exceeding standard civilian flight envelope.',
            timestamp: now,
            acknowledged: false,
            isSimulated: true,
          };

          db.saveAlert(alert);
          newAlerts.push(alert);
          eventBus.publish('alert:triggered', alert);
        }
      } else if (speedKts <= 75) {
        // Track speed normalized
        currentFlags.delete('SUDDEN_ACCELERATION');
      }

      const updatedTrack: TelemetryTrack = {
        ...track,
        lat: newLat,
        lng: newLng,
        heading: headingDeg,
        speed: track.speed ?? Math.round(speedKts / 1.94384),
        speedKts,
        headingDeg,
        position: {
          lat: newLat,
          lng: newLng,
          altitudeMeters,
        },
        timestamp: now,
        anomalyFlags: Array.from(currentFlags),
      };

      db.updateTrack(updatedTrack);
    }

    eventBus.publish('telemetry:update', db.getTracks());
    return {
      tracks: db.getTracks(),
      newAlerts,
    };
  }

  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const telemetryService = new TelemetryService();
