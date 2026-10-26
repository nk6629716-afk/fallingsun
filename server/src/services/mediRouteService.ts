import crypto from 'crypto';
import { db } from '../db/database';
import {
  Patient,
  CreatePatientInput,
  UpdatePatientInput,
  HazardEdge,
  CreateHazardInput,
  RouteCalculationRequest,
  RouteCalculationResponse,
  TriageCategory,
  PatientVitals,
} from '../../../shared/types';
import { eventBus } from '../realtime/eventBus';

export class MediRouteService {
  // ------------------------------------------------------------------------
  // Patients
  // ------------------------------------------------------------------------
  public listPatients(filter?: { workflowStatus?: string; triageCategory?: string }): Patient[] {
    return db.getPatients(filter);
  }

  public getPatientById(id: string): Patient | null {
    return db.getPatientById(id);
  }

  public createPatient(input: CreatePatientInput): Patient {
    if ((input as any).id) {
      const existing = db.getPatientById((input as any).id);
      if (existing) return existing;
    }
    const id = (input as any).id || `PAT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const now = new Date().toISOString();

    const { category, reason } = this.evaluateDemoTriage(input.vitals, input.triageCategory);

    const patient: Patient = {
      id,
      fictionalName: input.fictionalName,
      age: input.age,
      gender: input.gender,
      triageCategory: category,
      ruleVersion: 'DEMO_START_TRIAGE_V1',
      triageReason: reason,
      status: input.workflowStatus || 'awaiting_assessment',
      workflowStatus: input.workflowStatus || 'awaiting_assessment',
      vitals: input.vitals,
      location: input.location,
      createdAt: now,
      updatedAt: now,
      isSimulated: true,
    };

    const saved = db.savePatient(patient);
    eventBus.publish('patient:created', saved);
    return saved;
  }

  public updatePatient(id: string, input: UpdatePatientInput): Patient | null {
    const existing = db.getPatientById(id);
    if (!existing) return null;

    const updated: Patient = {
      ...existing,
      workflowStatus: input.workflowStatus !== undefined ? input.workflowStatus : existing.workflowStatus,
      triageCategory: input.triageCategory !== undefined ? input.triageCategory : existing.triageCategory,
      assignedFacilityId: input.assignedFacilityId !== undefined ? input.assignedFacilityId : existing.assignedFacilityId,
      triageReason: input.triageReason !== undefined ? input.triageReason : existing.triageReason,
      updatedAt: new Date().toISOString(),
    };

    const saved = db.savePatient(updated);
    eventBus.publish('patient:updated', saved);
    return saved;
  }

  // ------------------------------------------------------------------------
  // Hazards
  // ------------------------------------------------------------------------
  public listHazards(filter?: { blocked?: boolean }): HazardEdge[] {
    return db.getHazards(filter);
  }

  public getHazardById(id: string): HazardEdge | null {
    return db.getHazardById(id);
  }

  public saveHazard(input: CreateHazardInput): HazardEdge {
    const existing = db.getHazardByEdgeId(input.edgeId);
    const now = new Date().toISOString();

    const hazard: HazardEdge = {
      id: existing ? existing.id : `HAZ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
      edgeId: input.edgeId,
      fromNode: input.fromNode,
      toNode: input.toNode,
      hazardType: input.hazardType || 'road_blocked',
      blocked: input.blocked,
      reportedBy: input.reportedBy || 'Field Unit',
      reportedAt: now,
      isSimulated: true,
    };

    const saved = db.saveHazard(hazard);
    eventBus.publish('hazard:updated', saved);
    return saved;
  }

  // ------------------------------------------------------------------------
  // Routing: Hazard-aware Dijkstra Algorithm
  // ------------------------------------------------------------------------
  public calculateRoute(req: RouteCalculationRequest): RouteCalculationResponse {
    const graph = db.getRoadGraph();
    const blockedHazards = req.avoidHazards ? db.getHazards({ blocked: true }) : [];
    const blockedEdgeIds = new Set(blockedHazards.map((h) => h.edgeId));

    // Verify nodes exist
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    if (!nodeIds.has(req.startNodeId)) {
      return {
        routeFound: false,
        destinationNodeId: req.destinationNodeId,
        pathNodeIds: [],
        edgesTraversed: [],
        totalDistanceKm: 0,
        estimatedTimeMinutes: 0,
        hazardsAvoided: [],
        message: `Origin node ${req.startNodeId} not found in road graph`,
      };
    }
    if (!nodeIds.has(req.destinationNodeId)) {
      return {
        routeFound: false,
        destinationNodeId: req.destinationNodeId,
        pathNodeIds: [],
        edgesTraversed: [],
        totalDistanceKm: 0,
        estimatedTimeMinutes: 0,
        hazardsAvoided: [],
        message: `Destination node ${req.destinationNodeId} not found in road graph`,
      };
    }

    if (req.startNodeId === req.destinationNodeId) {
      return {
        routeFound: true,
        destinationNodeId: req.destinationNodeId,
        pathNodeIds: [req.startNodeId],
        edgesTraversed: [],
        totalDistanceKm: 0,
        estimatedTimeMinutes: 0,
        hazardsAvoided: [],
        message: 'Origin and destination are identical',
      };
    }

    // Build adjacency list (bi-directional road network)
    const adj = new Map<string, Array<{ to: string; distanceKm: number; edge: (typeof graph.edges)[0] }>>();
    for (const node of graph.nodes) {
      adj.set(node.id, []);
    }

    const bypassedHazards = new Set<string>();

    for (const edge of graph.edges) {
      if (blockedEdgeIds.has(edge.id)) {
        bypassedHazards.add(edge.id);
        continue; // Skip blocked edge!
      }

      const fromId = edge.fromNodeId || edge.from || '';
      const toId = edge.toNodeId || edge.to || '';
      adj.get(fromId)?.push({ to: toId, distanceKm: edge.distanceKm, edge });
      adj.get(toId)?.push({ to: fromId, distanceKm: edge.distanceKm, edge });
    }

    // Dijkstra's Algorithm
    const distances = new Map<string, number>();
    const previous = new Map<string, { node: string; edge: (typeof graph.edges)[0] } | null>();
    const unvisited = new Set<string>();

    for (const node of graph.nodes) {
      distances.set(node.id, Infinity);
      previous.set(node.id, null);
      unvisited.add(node.id);
    }
    distances.set(req.startNodeId, 0);

    while (unvisited.size > 0) {
      // Find lowest distance node in unvisited
      let currNode: string | null = null;
      let minDistance = Infinity;

      for (const node of unvisited) {
        const d = distances.get(node) ?? Infinity;
        if (d < minDistance) {
          minDistance = d;
          currNode = node;
        }
      }

      if (!currNode || minDistance === Infinity) {
        break; // Remaining nodes unreachable
      }

      if (currNode === req.destinationNodeId) {
        break; // Destination reached!
      }

      unvisited.delete(currNode);

      const neighbors = adj.get(currNode) || [];
      for (const { to, distanceKm, edge } of neighbors) {
        if (!unvisited.has(to)) continue;

        const newDist = minDistance + distanceKm;
        if (newDist < (distances.get(to) ?? Infinity)) {
          distances.set(to, newDist);
          previous.set(to, { node: currNode, edge });
        }
      }
    }

    const destDist = distances.get(req.destinationNodeId);
    if (!destDist || destDist === Infinity) {
      return {
        routeFound: false,
        destinationNodeId: req.destinationNodeId,
        pathNodeIds: [],
        edgesTraversed: [],
        totalDistanceKm: 0,
        estimatedTimeMinutes: 0,
        hazardsAvoided: Array.from(bypassedHazards),
        message: 'No available unblocked route between origin and destination',
      };
    }

    // Reconstruct path
    const pathNodes: string[] = [];
    const edgesTraversed: Array<{ id: string; from: string; to: string; distanceKm: number; roadName: string }> = [];
    let curr: string | null = req.destinationNodeId;

    while (curr) {
      pathNodes.unshift(curr);
      const prevStep = previous.get(curr);
      if (prevStep) {
        edgesTraversed.unshift({
          id: prevStep.edge.id,
          from: prevStep.edge.from || prevStep.edge.fromNodeId || '',
          to: prevStep.edge.to || prevStep.edge.toNodeId || '',
          distanceKm: prevStep.edge.distanceKm,
          roadName: prevStep.edge.roadName || '',
        });
        curr = prevStep.node;
      } else {
        curr = null;
      }
    }

    // Estimate speed: average 45 km/h for emergency vehicle in transit
    const estMinutes = Math.round((destDist / 45) * 60);

    return {
      routeFound: true,
      hasRoute: true,
      pathNodeIds: pathNodes,
      edgesTraversed: edgesTraversed.map((e) => e.id),
      pathEdges: edgesTraversed,
      totalDistanceKm: parseFloat(destDist.toFixed(2)),
      estimatedTimeMinutes: Math.max(1, estMinutes),
      estimatedMinutes: Math.max(1, estMinutes),
      hazardsAvoided: Array.from(bypassedHazards),
      destinationNodeId: req.destinationNodeId,
      message: bypassedHazards.size > 0
        ? `Route safely calculated avoiding ${bypassedHazards.size} active road hazard(s)`
        : 'Direct optimal path selected',
    };
  }

  // ------------------------------------------------------------------------
  // Transparent Demo Triage Logic (START Protocol Simulator)
  // ------------------------------------------------------------------------
  public evaluateDemoTriage(
    vitals: PatientVitals,
    forcedCategory?: TriageCategory
  ): { category: TriageCategory; reason: string } {
    if (forcedCategory) {
      return {
        category: forcedCategory,
        reason: 'Manually specified triage category from intake protocol.',
      };
    }

    if (vitals.ambulatory) {
      return {
        category: 'minimal',
        reason: 'Patient is ambulatory (walking wounded) with intact vital signs.',
      };
    }

    if (vitals.respiratoryRate !== undefined) {
      if (vitals.respiratoryRate > 30) {
        return {
          category: 'immediate',
          reason: `Tachypnea detected (respiratory rate ${vitals.respiratoryRate}/min > 30). High priority evacuation required.`,
        };
      }
      if (vitals.respiratoryRate === 0) {
        return {
          category: 'expectant',
          reason: 'Apnea confirmed after positional airway opening attempt.',
        };
      }
    }

    if (vitals.pulsePresent === false) {
      return {
        category: 'immediate',
        reason: 'Absent peripheral radial pulse indicated critical hemodynamic instability.',
      };
    }

    if (vitals.canFollowCommands === false) {
      return {
        category: 'immediate',
        reason: 'Altered mental status; unable to follow simple commands.',
      };
    }

    return {
      category: 'delayed',
      reason: 'Non-ambulatory but normal respiration, palpable pulse, and responsive to commands.',
    };
  }
}

export const mediRouteService = new MediRouteService();
