/**
 * SENTINEL Cross-Tab Event Reducer & Dispatcher
 * FIX-13: Unified reducers for HAZARD_UPDATE, CASUALTY_UPDATE, ALERT_ACK,
 * MARKER_UPDATE, SYNC_EVENT, MESH_MESSAGE_SEND, RESET across all tabs.
 * Routes are recomputed once per hazard version.
 */

import { meshBus, MeshBusEnvelope } from './meshBus';
import { simulationEngine } from '../../simulation/simulationEngine';
import { dbService } from '../storage/indexedDb';
import { api } from '../api/apiClient';
import { RoadHazardEdge, CasualtyRecord, AirspaceAlert, SharedMapMarker, MeshMessage } from '@shared/types';

export type CrossTabEventType =
  | 'HAZARD_UPDATE'
  | 'CASUALTY_UPDATE'
  | 'ALERT_ACK'
  | 'MARKER_UPDATE'
  | 'SYNC_EVENT'
  | 'MESH_MESSAGE_SEND'
  | 'RESET';

export interface HazardUpdatePayload {
  edgeId: string;
  blocked: boolean;
  hazardType?: string;
  version: string;
  updatedAt: string;
}

export type CrossTabEventListener = (event: { type: CrossTabEventType; payload: any }) => void;

export class CrossTabEventManager {
  private lastProcessedHazardVersion: string = '';
  private listeners: Set<CrossTabEventListener> = new Set();
  private rerouteCount: number = 0;
  private unsubscribeBus: (() => void) | null = null;

  constructor() {
    this.initListener();
  }

  public initListener(): void {
    if (this.unsubscribeBus) return;

    this.unsubscribeBus = meshBus.subscribe('*', async (envelope: MeshBusEnvelope) => {
      await this.applyEvent(envelope.type as CrossTabEventType, envelope.payload, false);
    });
  }

  public subscribe(listener: CrossTabEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getRerouteCount(): number {
    return this.rerouteCount;
  }

  /**
   * Applies cross-tab event through canonical reducer
   */
  public async applyEvent(type: CrossTabEventType, payload: any, isLocal: boolean = false): Promise<void> {
    switch (type) {
      case 'HAZARD_UPDATE': {
        const hazardData = payload as HazardUpdatePayload;
        if (!hazardData?.edgeId) return;

        // Apply to simulationEngine
        const hazards = simulationEngine.getState().hazards;
        const edge = hazards.find((h) => h.id === hazardData.edgeId);
        if (edge) {
          edge.blocked = hazardData.blocked;
          if (hazardData.hazardType) edge.hazardType = hazardData.hazardType as any;
          edge.updatedAt = hazardData.updatedAt || new Date().toISOString();
        }

        // Apply to IndexedDB
        if (edge) {
          try {
            await dbService.putHazard(edge);
          } catch (e) {
            // DB fallback
          }
        }

        // Recompute route once per hazard version (FIX-13 / FIX-33)
        const versionKey = hazardData.version || `${hazardData.edgeId}:${hazardData.blocked}:${hazardData.updatedAt}`;
        if (this.lastProcessedHazardVersion !== versionKey) {
          this.lastProcessedHazardVersion = versionKey;
          this.rerouteCount += 1;
          try {
            await api.calculateRoute('NODE-CAS-3', 'NODE-HOSP-1', true);
          } catch (e) {
            // calculation handled
          }
        }
        break;
      }

      case 'CASUALTY_UPDATE': {
        const casualty = payload as CasualtyRecord;
        if (!casualty?.id) return;
        try {
          await dbService.putCasualty(casualty);
        } catch (e) {}
        break;
      }

      case 'ALERT_ACK': {
        const { alertId, acknowledgedBy, acknowledgedAt } = payload || {};
        if (!alertId) return;
        const alerts = simulationEngine.getState().alerts;
        const alert = alerts.find((a) => a.id === alertId);
        if (alert) {
          alert.acknowledged = true;
          alert.acknowledgedBy = acknowledgedBy || 'Duty Officer';
          alert.acknowledgedAt = acknowledgedAt || new Date().toISOString();
          try {
            await dbService.updateAlert(alert);
          } catch (e) {}
        }
        break;
      }

      case 'MARKER_UPDATE': {
        const marker = payload as SharedMapMarker;
        if (!marker?.id) return;
        simulationEngine.addOrUpdateMarker(marker);
        try {
          await dbService.putMarker(marker);
        } catch (e) {}
        break;
      }

      case 'MESH_MESSAGE_SEND': {
        const msg = payload as MeshMessage;
        if (!msg?.id) return;
        simulationEngine.sendMeshMessage(msg);
        try {
          await dbService.putMeshMessage(msg);
        } catch (e) {}
        break;
      }

      case 'RESET': {
        const seed = payload?.seed;
        simulationEngine.reset(seed);
        try {
          await dbService.resetToDeterministicBaseline();
        } catch (e) {}
        break;
      }

      case 'SYNC_EVENT': {
        // Handled by sync subscribers
        break;
      }

      default:
        // Ignore unhandled event types
        return;
    }

    // Notify local listeners
    for (const listener of this.listeners) {
      try {
        listener({ type, payload });
      } catch (err) {
        console.error('[CrossTabEventManager] Listener error:', err);
      }
    }
  }

  /**
   * Dispatches a local action, applies through reducer, and broadcasts to other tabs
   */
  public async dispatch<T>(type: CrossTabEventType, payload: T): Promise<void> {
    await this.applyEvent(type, payload, true);
    meshBus.publish(type, payload);
  }
}

export const crossTabEvents = new CrossTabEventManager();
