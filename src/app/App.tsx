import React, { useState, useEffect, useCallback } from 'react';
import {
  IncidentReport,
  TelemetryTrack,
  AirspaceAlert,
  RestrictedAirspaceZone,
  GeoIntelObservation,
  CasualtyRecord,
  RoadHazardEdge,
  DashboardSummary,
  SharedMapMarker,
  SimulationMeasurableMetrics,
} from '@shared/types';
import { api } from '../services/api/apiClient';
import { dbService } from '../services/storage/indexedDb';
import {
  EVACUATION_NODES,
  INITIAL_INCIDENTS,
  INITIAL_TRACKS,
  INITIAL_ALERTS,
  RESTRICTED_AIRSPACE_ZONES,
  INITIAL_GEO_OBSERVATIONS,
  INITIAL_CASUALTIES,
  ROAD_HAZARD_EDGES,
} from '../services/data/fixtures';
import { Sidebar } from './Sidebar';
import { CommandHeader } from './CommandHeader';
import { Dashboard } from '../dashboard/Dashboard';
import { FieldLinkModule } from '../modules/fieldlink/FieldLinkModule';
import { SkyWatchModule } from '../modules/skywatch/SkyWatchModule';
import { GeoIntelModule } from '../modules/geointel/GeoIntelModule';
import { SoldierVitalsModule } from '../modules/vitals/SoldierVitalsModule';
import { MediRouteSubTab } from '../modules/mediroute/medirouteTypes';
import { MediRouteModule } from '../modules/mediroute/MediRouteModule';
import { VitalWatchModule } from '../modules/vitalwatch/VitalWatchModule';
import { AddPersonnelModal } from '../modules/auth/AddPersonnelModal';
import { UserProfile } from '@shared/types';
import { realtimeService, RealtimeState } from '../services/api/realtimeService';
import { syncManager } from '../services/sync/syncManager';
import { selectPendingOutbox, selectOpenAlerts } from '../selectors';
import { Layers, Radio, Crosshair, Compass, HeartPulse, Activity, Shield } from 'lucide-react';

export type ModuleId = 'dashboard' | 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute' | 'vitals' | 'vitalwatch' | 'auth';

export const VALID_MODULES: readonly ModuleId[] = ['dashboard', 'fieldlink', 'skywatch', 'geointel', 'mediroute', 'vitals', 'vitalwatch'] as const;

export const DEFAULT_INITIAL_SUMMARY: DashboardSummary = {
  systemStatus: 'nominal',
  pendingSyncCount: 0,
  activeIncidentsCount: 3,
  activeAirspaceTracksCount: 6,
  unacknowledgedAlertsCount: 2,
  pendingGeoReviewsCount: 2,
  criticalPatientsAwaitingEvac: 2,
  blockedRoadSegmentsCount: 1,
  lastSyncTimestamp: new Date().toISOString(),
  isSimulated: true,
};

export function parseModuleFromHash(hash: string): { module: ModuleId; subTab?: MediRouteSubTab } {
  const clean = hash.replace(/^#\/?/, '').toLowerCase().trim();
  const parts = clean.split('/');
  const base = ['login', 'signup', 'auth'].includes(parts[0]) ? 'dashboard' : parts[0];
  const sub = parts[1] as MediRouteSubTab | undefined;

  const validSubTabs: MediRouteSubTab[] = ['overview', 'monitoring', 'triage', 'routing', 'facilities', 'dispatch'];

  if ((VALID_MODULES as readonly string[]).includes(base)) {
    return {
      module: base as ModuleId,
      subTab: sub && validSubTabs.includes(sub) ? sub : undefined,
    };
  }
  return { module: 'dashboard' };
}

export const App: React.FC<{ currentUser: UserProfile; onSignOut: () => void }> = ({ currentUser, onSignOut }) => {
  const [activeModule, setActiveModuleState] = useState<ModuleId>(() => {
    if (typeof window !== 'undefined') {
      return parseModuleFromHash(window.location.hash).module;
    }
    return 'dashboard';
  });

  const [medirouteSubTab, setMedirouteSubTab] = useState<MediRouteSubTab>(() => {
    if (typeof window !== 'undefined') {
      return parseModuleFromHash(window.location.hash).subTab || 'overview';
    }
    return 'overview';
  });

  const handleNavigate = useCallback((mod: ModuleId) => {
    setActiveModuleState(mod);
    if (typeof window !== 'undefined') {
      const targetHash = mod === 'mediroute' && medirouteSubTab !== 'overview' ? `#mediroute/${medirouteSubTab}` : `#${mod}`;
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
  }, [medirouteSubTab]);

  const handleNavigateMediRouteSubTab = useCallback((subTab: MediRouteSubTab) => {
    setMedirouteSubTab(subTab);
    setActiveModuleState('mediroute');
    if (typeof window !== 'undefined') {
      window.location.hash = `#mediroute/${subTab}`;
    }
  }, []);

  // Listen to hash changes (browser back/forward or manual hash changes)
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseModuleFromHash(window.location.hash);
      setActiveModuleState(parsed.module);
      if (parsed.subTab) {
        setMedirouteSubTab(parsed.subTab);
      }
      const clean = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
      const base = clean.split('/')[0];
      if (!(VALID_MODULES as readonly string[]).includes(base)) {
        window.history.replaceState(null, '', '#dashboard');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    const initialClean = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
    const initialBase = initialClean.split('/')[0];
    if (!(VALID_MODULES as readonly string[]).includes(initialBase)) {
      window.history.replaceState(null, '', '#dashboard');
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [isAddPersonnelOpen, setIsAddPersonnelOpen] = useState(false);
  const handleSignOut = onSignOut;

  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // App Shell States & Persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('sentinel_sidebar_collapsed');
      return val !== null ? JSON.parse(val) : false;
    } catch (e) {
      return false;
    }
  });


  const [isHeaderCompact, setIsHeaderCompact] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('sentinel_header_compact');
      return val !== null ? JSON.parse(val) : false;
    } catch (e) {
      return false;
    }
  });

  const [isHeaderMinimized, setIsHeaderMinimized] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('sentinel_header_minimized');
      return val !== null ? JSON.parse(val) : false;
    } catch (e) {
      return false;
    }
  });

  // Core Data States with Resilient Defaults
  const [summary, setSummary] = useState<DashboardSummary>(DEFAULT_INITIAL_SUMMARY);
  const [incidents, setIncidents] = useState<IncidentReport[]>(INITIAL_INCIDENTS);
  const [tracks, setTracks] = useState<TelemetryTrack[]>(INITIAL_TRACKS);
  const [alerts, setAlerts] = useState<AirspaceAlert[]>(INITIAL_ALERTS);
  const [zones, setZones] = useState<RestrictedAirspaceZone[]>(RESTRICTED_AIRSPACE_ZONES);
  const [observations, setObservations] = useState<GeoIntelObservation[]>(INITIAL_GEO_OBSERVATIONS);
  const [casualties, setCasualties] = useState<CasualtyRecord[]>(INITIAL_CASUALTIES);
  const [hazards, setHazards] = useState<RoadHazardEdge[]>(ROAD_HAZARD_EDGES);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>(() => realtimeService.getState());
  const [backendHealth, setBackendHealth] = useState<any>(null);
  const [markers, setMarkers] = useState<SharedMapMarker[]>([]);
  const [simMetrics, setSimMetrics] = useState<SimulationMeasurableMetrics | null>(null);
  const [simSpeed, setSimSpeed] = useState<1 | 2 | 5>(1);
  const [isSimPaused, setIsSimPaused] = useState<boolean>(false);

  // Realtime Simulation Bus (Phase 1)
  useEffect(() => {
    api.resumeSimulation();
    const unsubscribe = api.subscribeSimulation((simState) => {
      setTracks(simState.tracks);
      setCasualties(simState.casualties);
      setHazards(simState.hazards);
      setMarkers(simState.markers);
      setSimMetrics(simState.metrics);
      setIsSimPaused(simState.isPaused);
      setSimSpeed(simState.speed);
    });

    return () => {
      unsubscribe();
      api.pauseSimulation();
    };
  }, []);

  const handleSetSimSpeed = (speed: 1 | 2 | 5) => {
    setSimSpeed(speed);
    api.setSimulationSpeed(speed);
  };

  // 1. Initial Database Seed & Resilient Load (Uses Promise.allSettled so failures never block UI)
  const refreshAllData = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        api.getDashboardSummary(),
        api.getIncidents(),
        api.getTelemetryTracks(),
        api.getAirspaceAlerts(),
        api.getRestrictedZones(),
        api.getGeoObservations(),
        api.getCasualties(),
        api.getRoadHazards(),
        api.getHealthInfo(),
        api.getSimulationStatus(),
      ]);

      const [sum, inc, trk, alt, zone, obs, cas, haz, health, sim] = results;

      if (sum.status === 'fulfilled' && sum.value) setSummary(sum.value);
      if (inc.status === 'fulfilled' && inc.value) setIncidents(inc.value);
      if (trk.status === 'fulfilled' && trk.value) setTracks(trk.value);
      if (alt.status === 'fulfilled' && alt.value) {
        const seen = new Set<string>();
        const deduped = alt.value.filter((a) => {
          if (a.acknowledged) return true;
          const key = `${a.trackId || 'unknown'}:${a.ruleName}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setAlerts(deduped);
      }
      if (zone.status === 'fulfilled' && zone.value) setZones(zone.value);
      if (obs.status === 'fulfilled' && obs.value) setObservations(obs.value);
      if (cas.status === 'fulfilled' && cas.value) setCasualties(cas.value);
      if (haz.status === 'fulfilled' && haz.value) setHazards(haz.value);
      if (health.status === 'fulfilled' && health.value) setBackendHealth(health.value);
      if (sim.status === 'fulfilled' && sim.value) setIsSimPaused(!sim.value.isRunning);
    } catch (err) {
      console.error('Error refreshing SENTINEL data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real-time SSE Stream Connection & Event Multiplexer
  useEffect(() => {
    if (isOfflineMode) {
      realtimeService.disconnect();
      return;
    }

    realtimeService.connect();

    const unsubState = realtimeService.onStateChange(setRealtimeState);
    const unsubTelemetry = realtimeService.onTelemetry((newTracks) => {
      setTracks(newTracks);
    });
    const unsubAlert = realtimeService.onAlertTriggered((alert) => {
      setAlerts((prev) => {
        const existingIdx = prev.findIndex(
          (a) => a.id === alert.id || (a.trackId === alert.trackId && a.ruleName === alert.ruleName && !a.acknowledged)
        );
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], ...alert };
          return updated;
        }
        return [alert, ...prev];
      });
    });
    const unsubAlertAck = realtimeService.onAlertAcknowledged((alert) => {
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? alert : a)));
    });
    const unsubIncident = realtimeService.onIncident((inc) => {
      setIncidents((prev) => [inc, ...prev.filter((i) => i.id !== inc.id)]);
    });
    const unsubHazard = realtimeService.onHazard((haz) => {
      setHazards((prev) => prev.map((h) => (h.id === haz.id ? haz : h)));
    });
    const unsubGeo = realtimeService.onGeoIntel((obs) => {
      setObservations((prev) => prev.map((o) => (o.id === obs.id ? obs : o)));
    });
    const unsubPatient = realtimeService.onPatient((cas) => {
      setCasualties((prev) => [cas, ...prev.filter((c) => c.id !== cas.id)]);
    });
    const unsubReset = realtimeService.onReset(() => {
      refreshAllData();
    });

    return () => {
      unsubState();
      unsubTelemetry();
      unsubAlert();
      unsubAlertAck();
      unsubIncident();
      unsubHazard();
      unsubGeo();
      unsubPatient();
      unsubReset();
      realtimeService.disconnect();
    };
  }, [isOfflineMode, refreshAllData]);

  const handleToggleSimPause = async () => {
    if (isSimPaused) {
      const ok = await api.resumeSimulation();
      if (ok) setIsSimPaused(false);
    } else {
      const ok = await api.pauseSimulation();
      if (ok) setIsSimPaused(true);
    }
  };

  const handleStepSimulation = async () => {
    const res = await api.stepSimulation();
    if (res && res.data && res.data.tracks) {
      setTracks(res.data.tracks);
      if (res.data.newAlerts && res.data.newAlerts.length > 0) {
        setAlerts((prev) => {
          const merged = [...prev];
          for (const newAlt of res.data.newAlerts) {
            const idx = merged.findIndex(
              (a) => a.id === newAlt.id || (a.trackId === newAlt.trackId && a.ruleName === newAlt.ruleName && !a.acknowledged)
            );
            if (idx !== -1) {
              merged[idx] = { ...merged[idx], ...newAlt };
            } else {
              merged.unshift(newAlt);
            }
          }
          return merged;
        });
      }
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Safety watchdog: ensure loading screen is never stuck longer than 1000ms
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    }, 1000);

    async function boot() {
      try {
        await dbService.seedDefaultFixturesIfEmpty();
      } catch (err) {
        console.warn('[App] Local IndexedDB seed skipped or failed, using in-memory baseline:', err);
      }
      try {
        await refreshAllData();
      } catch (err) {
        console.warn('[App] Initial data refresh warning:', err);
      } finally {
        if (isMounted) {
          clearTimeout(safetyTimer);
          setIsLoading(false);
        }
      }
    }
    boot();

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, [refreshAllData]);

  // 2. Hardware Browser Network Listeners
  useEffect(() => {
    const handleOnline = () => {
      console.log('Browser online event detected');
      setIsOfflineMode(false);
      api.setOfflineSimulation(false);
      refreshAllData();
    };

    const handleOffline = () => {
      console.log('Browser offline event detected');
      setIsOfflineMode(true);
      api.setOfflineSimulation(true);
      refreshAllData();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshAllData]);

  // 3. User Toggle Offline Mode
  const handleToggleOffline = () => {
    const nextState = !isOfflineMode;
    setIsOfflineMode(nextState);
    api.setOfflineSimulation(nextState);
    refreshAllData();
  };

  // 4. Batch Sync Outbox Queue
  const handleTriggerSync = async () => {
    if (isOfflineMode) return;
    setIsSyncing(true);
    try {
      await syncManager.triggerSync();
      await refreshAllData();
    } catch (err: any) {
      console.warn('Sync issue:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // 5. Deterministic Reset Demo
  const handleResetDemo = async () => {
    if (window.confirm('Reset all modules to deterministic baseline fixtures for judge demonstration replay?')) {
      setIsLoading(true);
      await api.resetDemoBaseline();
      await refreshAllData();
      setIsLoading(false);
    }
  };

  // 6. Global Keyboard Shortcuts (Ctrl+B / Cmd+B for sidebar, Escape for mobile menu)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (window.innerWidth < 900) {
          setIsMobileMenuOpen((prev) => !prev);
        } else {
          setIsSidebarCollapsed((prev) => {
            const next = !prev;
            try {
              localStorage.setItem('sentinel_sidebar_collapsed', JSON.stringify(next));
            } catch (err) {}
            return next;
          });
        }
      }
      if (e.key === 'Escape') {
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sentinel_sidebar_collapsed', JSON.stringify(next));
      } catch (err) {}
      return next;
    });
  };

  const handleToggleHeaderCompact = () => {
    setIsHeaderCompact((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sentinel_header_compact', JSON.stringify(next));
      } catch (err) {}
      return next;
    });
  };

  const handleToggleHeaderMinimized = () => {
    setIsHeaderMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sentinel_header_minimized', JSON.stringify(next));
      } catch (err) {}
      return next;
    });
  };

  const effectiveSidebarWidth = isSidebarCollapsed ? 76 : 240;
  const effectiveHeaderHeight = 48;

  const pendingSyncCount = selectPendingOutbox(incidents).length;
  const unackAlertsCount = selectOpenAlerts(alerts).length;

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: 'var(--surface)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface-raised)',
            boxShadow: 'var(--shadow-raised)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 10px rgba(70, 105, 168, 0.6)',
            }}
          />
        </div>
        <div style={{ letterSpacing: '0.04em', fontSize: '1rem', fontWeight: 700 }}>
          INITIALIZING SENTINEL NEUMORPHIC CONSOLE...
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
          Mounting IndexedDB stores and deterministic scenario fixtures
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}
      style={{
        '--sidebar-width': `${effectiveSidebarWidth}px`,
        '--header-height': `${effectiveHeaderHeight}px`,
      } as React.CSSProperties}
    >
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. Neumorphic Sidebar Navigation */}
      <Sidebar
        activeModule={activeModule}
        onNavigate={handleNavigate}
        pendingSyncCount={pendingSyncCount}
        unackAlertsCount={unackAlertsCount}
        isOfflineMode={isOfflineMode}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebarCollapse}
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onOpenAddPersonnel={() => setIsAddPersonnelOpen(true)}
      />

      {/* 2. Sticky Command Header */}
      <CommandHeader
        currentUser={currentUser}
        activeModule={activeModule}
        pendingSyncCount={pendingSyncCount}
        isOfflineMode={isOfflineMode}
        onToggleOffline={handleToggleOffline}
        onTriggerSync={handleTriggerSync}
        onResetDemo={handleResetDemo}
        isSyncing={isSyncing}
        simSpeed={simSpeed}
        isSimPaused={isSimPaused}
        onSetSimSpeed={handleSetSimSpeed}
        onToggleSimPause={handleToggleSimPause}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebarCollapse={handleToggleSidebarCollapse}
        isHeaderCompact={isHeaderCompact}
        onToggleHeaderCompact={handleToggleHeaderCompact}
        isHeaderMinimized={isHeaderMinimized}
        onToggleHeaderMinimized={handleToggleHeaderMinimized}
        realtimeStatus={isOfflineMode ? 'disconnected' : realtimeState.status}
        lastEventTimestamp={realtimeState.lastEventTimestamp}
      />

      {/* 3. Main Content Area */}
      <main className="app-main" style={{ padding: 0 }}>
            {activeModule === 'dashboard' && (
              <Dashboard
                summary={summary}
                incidents={incidents}
                tracks={tracks}
                alerts={alerts}
                zones={zones}
                observations={observations}
                casualties={casualties}
                hazards={hazards}
                nodes={EVACUATION_NODES}
                onNavigate={handleNavigate}
                onNavigateMediRouteSubTab={handleNavigateMediRouteSubTab}
                onResetDemo={handleResetDemo}
                isOfflineMode={isOfflineMode}
                realtimeStatus={isOfflineMode ? 'disconnected' : realtimeState.status}
                lastEventTimestamp={realtimeState.lastEventTimestamp}
                backendHealth={backendHealth}
                onStepSimulation={handleStepSimulation}
                onToggleSimulationPause={handleToggleSimPause}
                isSimPaused={isSimPaused}
              />
            )}

            {activeModule === 'fieldlink' && (
              <FieldLinkModule
                incidents={incidents}
                isOfflineMode={isOfflineMode}
                onRefreshIncidents={refreshAllData}
                onTriggerSync={handleTriggerSync}
                isSyncing={isSyncing}
                onToggleSimulationPause={handleToggleSimPause}
                isSimPaused={isSimPaused}
              />
            )}

            {activeModule === 'skywatch' && (
              <SkyWatchModule
                tracks={tracks}
                alerts={alerts}
                zones={zones}
                onRefreshAlerts={refreshAllData}
                onStepSimulation={handleStepSimulation}
                onToggleSimulationPause={handleToggleSimPause}
                isSimPaused={isSimPaused}
              />
            )}

            {activeModule === 'geointel' && (
              <GeoIntelModule
                observations={observations}
                onRefreshObservations={refreshAllData}
              />
            )}

            {activeModule === 'mediroute' && (
              <MediRouteModule
                initialSubTab={medirouteSubTab}
                onSubTabChange={handleNavigateMediRouteSubTab}
                casualties={casualties}
                hazards={hazards}
                nodes={EVACUATION_NODES}
                onRefreshCasualties={refreshAllData}
                onRefreshHazards={refreshAllData}
                onToggleSimulationPause={handleToggleSimPause}
                isSimPaused={isSimPaused}
              />
            )}

            {activeModule === 'vitalwatch' && (
              <VitalWatchModule currentUser={currentUser} />
            )}

            {activeModule === 'vitals' && <SoldierVitalsModule />}
      </main>

      {/* Mobile Bottom Dock (< 768px) */}
      <nav className="mobile-bottom-dock" aria-label="Mobile Navigation Dock">
        <button
          type="button"
          className={`mobile-dock-item ${activeModule === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNavigate('dashboard')}
        >
          <Layers size={18} />
          <span>Overview</span>
        </button>

        <button
          type="button"
          className={`mobile-dock-item ${activeModule === 'fieldlink' ? 'active' : ''}`}
          onClick={() => handleNavigate('fieldlink')}
          style={{ position: 'relative' }}
        >
          <Radio size={18} />
          <span>FieldLink</span>
          {pendingSyncCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '4px',
                right: '18px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--color-warn)',
              }}
            />
          )}
        </button>

        <button
          type="button"
          className={`mobile-dock-item ${activeModule === 'skywatch' ? 'active' : ''}`}
          onClick={() => handleNavigate('skywatch')}
          style={{ position: 'relative' }}
        >
          <Crosshair size={18} />
          <span>SkyWatch</span>
          {unackAlertsCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '4px',
                right: '18px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--color-crit)',
              }}
            />
          )}
        </button>

        <button
          type="button"
          className={`mobile-dock-item ${activeModule === 'geointel' ? 'active' : ''}`}
          onClick={() => handleNavigate('geointel')}
        >
          <Compass size={18} />
          <span>GeoIntel</span>
        </button>

        <button
          type="button"
          className={`mobile-dock-item ${activeModule === 'mediroute' ? 'active' : ''}`}
          onClick={() => handleNavigate('mediroute')}
        >
          <HeartPulse size={18} />
          <span>MediRoute</span>
        </button>

        <button
          type="button"
          className={`mobile-dock-item ${activeModule === 'vitalwatch' ? 'active' : ''}`}
          onClick={() => handleNavigate('vitalwatch')}
        >
          <Activity size={18} />
          <span>VitalWatch</span>
        </button>

        <button
          type="button"
          className={`mobile-dock-item ${activeModule === 'vitals' ? 'active' : ''}`}
          onClick={() => handleNavigate('vitals')}
        >
          <Shield size={18} />
          <span>Vitals</span>
        </button>
      </nav>

      {/* Authorized Officer Add Personnel Workflow Modal */}
      <AddPersonnelModal
        isOpen={isAddPersonnelOpen}
        onClose={() => setIsAddPersonnelOpen(false)}
        currentUserRole={currentUser?.role || 'admin'}
        onPersonnelAdded={() => refreshAllData()}
      />
    </div>
  );
};
