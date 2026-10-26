import { RoadHazardEdge, CalculatedRoute } from '@shared/types';
import { formatDuration } from '../utils/units';

/**
 * Returns all blocked road hazard segments.
 */
export function selectBlockedHazards(hazards: RoadHazardEdge[] = []): RoadHazardEdge[] {
  return hazards.filter((h) => h.blocked);
}

/**
 * Returns all unblocked (open) road segments.
 */
export function selectOpenHazards(hazards: RoadHazardEdge[] = []): RoadHazardEdge[] {
  return hazards.filter((h) => !h.blocked);
}

/**
 * Returns active route ETA string formatted for display.
 */
export function selectActiveRouteEta(route: CalculatedRoute | null): string {
  if (!route || typeof route.estimatedMinutes !== 'number') {
    return '--';
  }
  return formatDuration(route.estimatedMinutes);
}

/**
 * Counts actual reroute occurrences based on active calculated route and hazard state.
 */
export function selectRerouteCount(route: CalculatedRoute | null, recalculationCount: number = 0): number {
  const isRerouted = Boolean(
    (route as any)?.isRerouted ||
    (route?.avoidedHazardIds && route.avoidedHazardIds.length > 0) ||
    route?.alternativeFound
  );
  if (isRerouted) {
    return Math.max(1, recalculationCount);
  }
  return recalculationCount;
}
