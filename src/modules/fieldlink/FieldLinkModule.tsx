import React, { useState, useEffect } from 'react';
import {
  IncidentReport,
  PriorityLevel,
  MeshNodeId,
  MeshMessage,
} from '@shared/types';
import { meshService, NodeLinkQuality } from '../../services/mesh/meshService';
import {
  Play,
  Pause,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FilePlus,
  Radio,
  Clock,
  RotateCw,
  CheckCircle,
} from 'lucide-react';
import { TacticalMap } from '../../components/TacticalMap';
import { api } from '../../services/api/apiClient';
import { selectPendingOutbox, selectSyncedIncidents } from '../../selectors';
import { formatIST } from '../../utils/time';
import { syncManager } from '../../services/sync/syncManager';

interface FieldLinkModuleProps {
  incidents: IncidentReport[];
  isOfflineMode: boolean;
  onRefreshIncidents: () => Promise<void>;
  onTriggerSync: () => Promise<void>;
  isSyncing: boolean;
  onToggleSimulationPause?: () => void;
  isSimPaused?: boolean;
}

const PRESET_LOCATIONS = [
  { name: 'Bridge crossing (Sector 34)', lat: 34.0612, lng: -118.2433 },
  { name: 'Forward Outpost Alpha (Sector 4)', lat: 34.0522, lng: -118.2437 },
  { name: 'Bridge Segment 04-East (Highway 9)', lat: 34.0620, lng: -118.2310 },
  { name: 'Outpost Bravo (North Ridge)', lat: 34.0710, lng: -118.2580 },
  { name: 'Casualty Collection Point Delta', lat: 34.0720, lng: -118.2250 },
];

export const FieldLinkModule: React.FC<FieldLinkModuleProps> = ({
  incidents,
  isOfflineMode,
  onRefreshIncidents,
  onTriggerSync,
  isSyncing,
  onToggleSimulationPause,
  isSimPaused = false,
}) => {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('critical');
  const [selectedLocationIdx, setSelectedLocationIdx] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'outbox' | 'incidents' | 'channel'>('outbox');
  const [currentNode, setCurrentNode] = useState<MeshNodeId>(() => meshService.getCurrentNode());
  const [linkQualities, setLinkQualities] = useState<NodeLinkQuality>(() => meshService.getLinkQualities());
  const [meshMessages, setMeshMessages] = useState<MeshMessage[]>(() => meshService.getMessages());
  const [chatChannel] = useState('#tactical-alpha');
  const [chatTarget, setChatTarget] = useState<MeshNodeId>('Command');
  const [chatContent, setChatContent] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [simElapsedSeconds, setSimElapsedSeconds] = useState(14);
  const [isReportPanelCollapsed, setIsReportPanelCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1100 || window.innerHeight < 700;
    }
    return false;
  });

  // Selectors for real single source of truth
  const pendingIncidents = selectPendingOutbox(incidents);
  const syncedIncidents = selectSyncedIncidents(incidents);

  // Resize listener for default collapsed state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1100 || window.innerHeight < 700) {
        setIsReportPanelCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Timer for elapsed sim seconds
  useEffect(() => {
    if (isSimPaused) return;
    const interval = setInterval(() => {
      setSimElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isSimPaused]);

  // Mesh service subscription for multi-tab BroadcastChannel sync
  useEffect(() => {
    // 1. Initialize BroadcastChannel listener on tab mount
    meshService.initBroadcastChannel();

    // 2. Hydrate message history from storage (IndexedDB) with deduplication
    meshService.refreshMessages().then((msgs) => {
      setMeshMessages(msgs);
    });

    // 3. Update message state immediately when an incoming broadcast arrives
    const unsub = meshService.subscribe((evt) => {
      if (evt.type === 'MESSAGE') {
        setMeshMessages(meshService.getMessages());
      } else if (evt.type === 'LINK_QUALITY') {
        setLinkQualities(meshService.getLinkQualities());
      }
    });

    // 4. Clean up listeners on unmount
    return () => {
      unsub();
    };
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatContent.trim()) return;
    setIsSendingMessage(true);
    try {
      await meshService.sendMessage(chatChannel, chatContent.trim(), chatTarget);
      setChatContent('');
      setMeshMessages(meshService.getMessages());
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const location = PRESET_LOCATIONS[selectedLocationIdx];
      const newReport: IncidentReport = {
        id: isOfflineMode ? `LOCAL-${Date.now()}` : `INC-${Math.floor(Math.random() * 900 + 100)}`,
        sourceModule: 'fieldlink',
        type: 'road_blockage',
        priority,
        title: title.trim(),
        notes: notes.trim() || 'Report submitted from field terminal.',
        location,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: isOfflineMode ? 'pending_sync' : 'active',
        isSimulated: true,
        clientId: `client-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        syncStatus: isOfflineMode ? 'pending' : 'synced',
      };

      await api.createIncident(newReport);
      await syncManager.recordLocalMutation('incident', 'create', newReport);
      await onRefreshIncidents();
      setTitle('');
      setNotes('');
    } catch (err: any) {
      console.error('Failed to submit report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryItem = async (incId: string) => {
    try {
      await onTriggerSync();
      await onRefreshIncidents();
    } catch (err) {
      console.error('Retry failed:', err);
    }
  };

  const latestActivity = incidents.length > 0 ? {
    module: 'FIELDLINK',
    description: `${incidents[0].title} - ${incidents[0].location.name} (${formatIST(incidents[0].createdAt, { seconds: false })})`,
  } : null;

  // Top-left Metrics Toolbar Content (paired with Mode Switch)
  const topLeftMetrics = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--color-sheet)',
        border: 'var(--border-width, 1.2px) solid var(--color-edge)',
        borderRadius: 'var(--radius-sm)',
        padding: '6px 14px',
        gap: '20px',
        boxShadow: 'var(--shadow-flat)',
      }}
    >
      <div>
        <div
          className="numeral"
          style={{
            fontSize: '1.35rem',
            fontFamily: 'var(--font-numerals)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            color: 'var(--color-ink)',
            lineHeight: 1,
          }}
        >
          {incidents.length}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', marginTop: '2px' }}>
          Incidents
        </div>
      </div>

      <div style={{ borderLeft: '1px solid var(--color-line)', paddingLeft: '16px' }}>
        <div
          className="numeral"
          style={{
            fontSize: '1.35rem',
            fontFamily: 'var(--font-numerals)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            color: pendingIncidents.length > 0 ? 'var(--color-warn)' : 'var(--color-ink)',
            lineHeight: 1,
          }}
        >
          {pendingIncidents.length}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', marginTop: '2px' }}>
          Pending Outbox
        </div>
      </div>

      <div style={{ borderLeft: '1px solid var(--color-line)', paddingLeft: '16px' }}>
        <div
          className="numeral"
          style={{
            fontSize: '1.35rem',
            fontFamily: 'var(--font-numerals)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            color: 'var(--color-ok)',
            lineHeight: 1,
          }}
        >
          {syncedIncidents.length}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', marginTop: '2px' }}>
          Synced Records
        </div>
      </div>

      <div style={{ borderLeft: '1px solid var(--color-line)', paddingLeft: '16px' }}>
        <div
          className="numeral"
          style={{
            fontSize: '1.35rem',
            fontFamily: 'var(--font-numerals)',
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 800,
            color: 'var(--color-ink)',
            lineHeight: 1,
          }}
        >
          {PRESET_LOCATIONS.length}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', marginTop: '2px' }}>
          Target Sectors
        </div>
      </div>
    </div>
  );

  // Bottom-left Collapsible Incident Report Panel
  const bottomLeftReport = isReportPanelCollapsed ? (
    <button
      type="button"
      className="overlay-chip-btn"
      onClick={() => setIsReportPanelCollapsed(false)}
      title="Open New incident report panel"
    >
      <FilePlus size={13} />
      <span>New Report</span>
    </button>
  ) : (
    <div
      className="overlay-collapsible-panel"
      style={{
        width: '280px',
        maxHeight: 'calc(100vh - 180px)',
        overflowY: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px',
          paddingBottom: '4px',
          borderBottom: '1px solid var(--color-line)',
        }}
      >
        <span
          style={{
            fontSize: '0.85rem',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            color: 'var(--color-ink)',
          }}
        >
          New incident report
        </span>
        <button
          type="button"
          onClick={() => setIsReportPanelCollapsed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-ink-2)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Collapse report panel"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)', display: 'block', marginBottom: '2px' }}>
            Title <span style={{ color: 'var(--color-crit)' }}>*</span>
          </label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Bridge crossing blocked"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ padding: '5px 8px', fontSize: '0.78rem', width: '100%' }}
          />
          {!title.trim() && (
            <div style={{ fontSize: '0.66rem', color: 'var(--color-crit)', marginTop: '2px' }}>
              Title is required to save to outbox
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)', display: 'block', marginBottom: '3px' }}>
            Priority
          </label>
          <div style={{ display: 'flex', border: '1px solid var(--color-edge)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {(['low', 'high', 'critical'] as PriorityLevel[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                style={{
                  flex: 1,
                  background: priority === p ? 'var(--color-strip)' : 'transparent',
                  color: priority === p ? '#FFFFFF' : 'var(--color-ink)',
                  border: 'none',
                  padding: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)', display: 'block', marginBottom: '2px' }}>
            Location
          </label>
          <select
            className="form-input"
            value={selectedLocationIdx}
            onChange={(e) => setSelectedLocationIdx(Number(e.target.value))}
            style={{ padding: '5px 8px', fontSize: '0.75rem', width: '100%' }}
          >
            {PRESET_LOCATIONS.map((loc, idx) => (
              <option key={idx} value={idx}>
                {loc.name} ({loc.lat.toFixed(4)}N, {Math.abs(loc.lng).toFixed(4)}W)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)', display: 'block', marginBottom: '2px' }}>
            Notes
          </label>
          <textarea
            className="form-input"
            placeholder="Field situation details..."
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ padding: '5px 8px', fontSize: '0.75rem', width: '100%', resize: 'none' }}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting || !title.trim()}
          title={!title.trim() ? 'Enter a title to save to outbox' : 'Save incident to outbox'}
          style={{
            marginTop: '4px',
            padding: '6px',
            opacity: !title.trim() ? 0.6 : 1,
            cursor: !title.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Saving...' : 'Save to outbox'}
        </button>
      </form>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
        {/* Left / Center Map Area */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, minHeight: 0, height: '100%' }}>
          <TacticalMap
            incidents={incidents}
            height="100%"
            showRadarSweep={false}
            initialMode="chart"
            topLeftContent={topLeftMetrics}
            bottomLeftContent={bottomLeftReport}
          />
        </div>

        {/* Right Intel Pane: Fixed width clamp, sticky header, internal scroll */}
        <aside
          style={{
            width: 'clamp(320px, 28vw, 440px)',
            background: 'var(--color-sheet)',
            borderLeft: 'var(--border-width, 1.2px) solid var(--color-edge)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            flexShrink: 0,
            height: '100%',
            minHeight: 0,
            zIndex: 20,
          }}
          aria-label="Field reports pane"
        >
          {/* Sticky Tabs Header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              background: 'var(--color-sheet)',
              zIndex: 10,
              display: 'flex',
              borderBottom: 'var(--border-width, 1.2px) solid var(--color-line)',
              padding: '8px 12px 0 12px',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('outbox')}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'outbox' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                padding: '6px 8px',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                color: activeTab === 'outbox' ? 'var(--color-ink)' : 'var(--color-ink-2)',
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span>Outbox</span>
              <span
                className="numeral"
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: pendingIncidents.length > 0 ? 'var(--color-warn)' : 'var(--color-paper)',
                  color: pendingIncidents.length > 0 ? '#FFFFFF' : 'var(--color-ink-2)',
                  fontFamily: 'var(--font-numerals)',
                }}
              >
                {pendingIncidents.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('incidents')}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'incidents' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                padding: '6px 8px',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                color: activeTab === 'incidents' ? 'var(--color-ink)' : 'var(--color-ink-2)',
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span>Incidents</span>
              <span
                className="numeral"
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: 'var(--color-paper)',
                  color: 'var(--color-ink-2)',
                  fontFamily: 'var(--font-numerals)',
                }}
              >
                {incidents.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channel')}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'channel' ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                padding: '6px 8px',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                color: activeTab === 'channel' ? 'var(--color-ink)' : 'var(--color-ink-2)',
                cursor: 'pointer',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <span>Mesh Comms</span>
              <span
                className="numeral"
                style={{
                  fontSize: '0.72rem',
                  padding: '1px 5px',
                  borderRadius: '10px',
                  background: 'var(--color-paper)',
                  color: 'var(--color-ink-2)',
                  fontFamily: 'var(--font-numerals)',
                }}
              >
                {meshMessages.length}
              </span>
            </button>
          </div>

          {/* Body Content */}
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeTab === 'outbox' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
                    Pending Outbox Queue
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)' }}>
                    Saved on this device
                  </span>
                </div>

                {pendingIncidents.length === 0 ? (
                  <div
                    style={{
                      padding: '18px 12px',
                      textAlign: 'center',
                      background: 'var(--color-paper)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-line)',
                      color: 'var(--color-ink-2)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <CheckCircle size={20} style={{ color: 'var(--color-ok)', margin: '0 auto 6px auto', display: 'block' }} />
                    Outbox empty. All field reports synchronized with command.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {pendingIncidents.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          padding: '8px 10px',
                          border: '1px solid var(--color-line)',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-paper)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                            {item.title}
                          </span>
                          <span
                            style={{
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '2px',
                              border: `1px solid ${item.syncStatus === 'failed' ? 'var(--color-crit)' : 'var(--color-warn)'}`,
                              color: item.syncStatus === 'failed' ? 'var(--color-crit)' : 'var(--color-warn)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {item.syncStatus || 'Pending'}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)' }}>
                          {item.notes}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                          <span
                            className="numeral"
                            style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', fontFamily: 'var(--font-numerals)' }}
                          >
                            {formatIST(item.createdAt)}
                          </span>

                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleRetryItem(item.id)}
                            disabled={isSyncing}
                            style={{ padding: '2px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <RotateCw size={10} className={isSyncing ? 'spin' : ''} />
                            <span>Retry</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onTriggerSync}
                  disabled={isSyncing || isOfflineMode}
                  style={{
                    marginTop: '8px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                  title={isOfflineMode ? 'Cannot sync while Offline Mode is active' : 'Synchronize outbox records with command'}
                >
                  <RotateCw size={12} className={isSyncing ? 'spin' : ''} />
                  <span>{isSyncing ? 'Synchronizing...' : 'Sync outbox now'}</span>
                </button>

                <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)', textAlign: 'center', marginTop: '4px' }}>
                  {isOfflineMode
                    ? 'Offline mode: Records saved on this device.'
                    : 'Connected. Reports synced.'}
                </div>
              </div>
            ) : activeTab === 'incidents' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, fontFamily: 'var(--font-heading)', color: 'var(--color-ink)' }}>
                    Active Incidents
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)' }}>
                    {incidents.length} reported
                  </span>
                </div>

                {incidents.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-ink-2)', fontSize: '0.78rem' }}>
                    No incident reports logged.
                  </div>
                ) : (
                  incidents.map((inc) => (
                    <div
                      key={inc.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        padding: '8px 10px',
                        border: '1px solid var(--color-line)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-paper)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                          {inc.title}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span
                            style={{
                              fontSize: '0.60rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '2px',
                              border: `1px solid ${inc.syncStatus === 'pending' || inc.syncStatus === 'failed' ? '#E8590C' : '#2D7A33'}`,
                              color: inc.syncStatus === 'pending' || inc.syncStatus === 'failed' ? '#FF922B' : '#69DB7C',
                              background: inc.syncStatus === 'pending' || inc.syncStatus === 'failed' ? 'rgba(232, 89, 12, 0.15)' : 'rgba(45, 122, 51, 0.15)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {inc.syncStatus === 'pending' ? 'LOCAL PENDING' : inc.syncStatus === 'failed' ? 'SYNC FAILED' : 'SERVER CONFIRMED'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.64rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '2px',
                              border: `1px solid ${
                                inc.priority === 'critical'
                                  ? 'var(--color-crit)'
                                  : inc.priority === 'high'
                                  ? 'var(--color-warn)'
                                  : 'var(--color-ok)'
                              }`,
                              color:
                                inc.priority === 'critical'
                                  ? 'var(--color-crit)'
                                  : inc.priority === 'high'
                                  ? 'var(--color-warn)'
                                  : 'var(--color-ok)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {inc.priority}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-2)' }}>
                        {inc.notes}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px' }}>
                        <span
                          className="numeral"
                          style={{ fontSize: '0.68rem', color: 'var(--color-ink-2)', fontFamily: 'var(--font-numerals)' }}
                        >
                          {inc.location.lat.toFixed(4)} N, {Math.abs(inc.location.lng).toFixed(4)} W
                        </span>
                        <span
                          className="numeral"
                          style={{ fontSize: '0.66rem', color: 'var(--color-ink-2)', fontFamily: 'var(--font-numerals)' }}
                        >
                          {formatIST(inc.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* activeTab === 'channel': Decentralized Tactical Mesh Comms */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Simulation Disclosure Banner */}
                <div
                  style={{
                    padding: '8px 10px',
                    background: 'var(--color-paper)',
                    border: '1px solid var(--color-warn)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.72rem',
                    color: 'var(--color-ink-2)',
                    lineHeight: 1.4,
                  }}
                >
                  <strong style={{ color: 'var(--color-ink)' }}>Simulated Mesh Transport:</strong> BroadcastChannel provides same-origin browser tab relay for multi-node evaluation; not a physical RF radio network.
                </div>

                {/* Node Identity Switcher */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Active Tab Node:
                  </span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['Alpha', 'Bravo', 'Command'] as MeshNodeId[]).map((node) => (
                      <button
                        key={node}
                        type="button"
                        onClick={() => {
                          meshService.setCurrentNode(node);
                          setCurrentNode(node);
                        }}
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.72rem',
                          borderRadius: 'var(--radius-sm)',
                          border: currentNode === node ? '1.5px solid var(--accent)' : '1px solid var(--color-line)',
                          background: currentNode === node ? 'var(--color-sheet)' : 'transparent',
                          fontWeight: currentNode === node ? 800 : 500,
                          color: currentNode === node ? 'var(--accent)' : 'var(--color-ink-2)',
                          cursor: 'pointer',
                        }}
                      >
                        {node}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Link Quality Sliders */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--color-paper)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-line)' }}>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                    Link Quality Simulation (Pass Rate):
                  </span>
                  {(['Alpha', 'Bravo', 'Command'] as MeshNodeId[]).map((node) => (
                    <div key={node} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.72rem', width: '56px', color: 'var(--color-ink-2)' }}>{node}:</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={linkQualities[node]}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          meshService.setLinkQuality(node, val);
                          setLinkQualities((prev) => ({ ...prev, [node]: val }));
                        }}
                        style={{ flex: 1, accentColor: 'var(--accent)' }}
                      />
                      <span className="numeral" style={{ fontSize: '0.72rem', width: '36px', textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-numerals)' }}>
                        {linkQualities[node]}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Send Tactical Message Form */}
                <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                      value={chatTarget}
                      onChange={(e) => setChatTarget(e.target.value as MeshNodeId)}
                      style={{ fontSize: '0.72rem', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-line)', background: 'var(--color-sheet)', color: 'var(--color-ink)' }}
                    >
                      <option value="Command">To: Command</option>
                      <option value="Alpha">To: Alpha</option>
                      <option value="Bravo">To: Bravo</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Transmit tactical message..."
                      value={chatContent}
                      onChange={(e) => setChatContent(e.target.value)}
                      style={{ flex: 1, fontSize: '0.75rem', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-line)', background: 'var(--color-sheet)', color: 'var(--color-ink)' }}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSendingMessage || !chatContent.trim()}
                      style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                    >
                      Send
                    </button>
                  </div>
                </form>

                {/* Mesh Comms Feed */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                      Mesh Traffic ({meshMessages.length})
                    </span>
                    <span style={{ fontSize: '0.66rem', color: 'var(--color-ink-2)' }}>
                      Store-and-forward relay
                    </span>
                  </div>

                  {meshMessages.map((msg) => {
                    const isDelivered = msg.state === 'delivered';
                    const isRelayed = msg.state === 'relayed';
                    return (
                      <div
                        key={msg.id}
                        style={{
                          padding: '6px 8px',
                          background: 'var(--color-paper)',
                          border: '1px solid var(--color-line)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-ink)' }}>
                            {msg.senderNode} &rarr; {msg.targetNode}
                          </span>
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: '2px',
                              border: `1px solid ${isDelivered ? 'var(--color-ok)' : isRelayed ? 'var(--accent)' : 'var(--color-warn)'}`,
                              color: isDelivered ? 'var(--color-ok)' : isRelayed ? 'var(--accent)' : 'var(--color-warn)',
                            }}
                          >
                            {msg.state.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-ink)' }}>
                          {msg.content}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.64rem', color: 'var(--color-ink-2)', marginTop: '2px' }}>
                          <span>Hops: [{msg.hopPath.join(' &rarr; ')}]</span>
                          <span className="numeral" style={{ fontFamily: 'var(--font-numerals)' }}>
                            {msg.latencyMs ? `${msg.latencyMs}ms` : '--'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Replay / Live Bar */}
      <footer
        style={{
          height: '36px',
          minHeight: '36px',
          borderTop: 'var(--border-width, 1.2px) solid var(--color-edge)',
          background: 'var(--color-sheet)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          fontSize: '0.74rem',
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={onToggleSimulationPause}
            style={{ width: '24px', height: '24px', minWidth: '24px', padding: 0 }}
            title={isSimPaused ? 'Resume simulation' : 'Pause simulation'}
          >
            {isSimPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>

          {/* LIVE indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: isSimPaused ? 'var(--color-warn)' : 'var(--color-crit)',
                boxShadow: isSimPaused ? 'none' : '0 0 6px var(--color-crit)',
              }}
            />
            <span style={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.04em', color: 'var(--color-ink)' }}>
              {isSimPaused ? 'PAUSED' : 'LIVE'}
            </span>
          </div>

          <div
            className="numeral"
            style={{
              fontSize: '0.72rem',
              color: 'var(--color-ink-2)',
              fontFamily: 'var(--font-numerals)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            T+{Math.floor(simElapsedSeconds / 60).toString().padStart(2, '0')}:{(simElapsedSeconds % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Dynamic Activity Ticker */}
        {latestActivity && (
          <div
            style={{
              color: 'var(--color-ink-2)',
              fontSize: '0.72rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '500px',
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--color-ink)', marginRight: '6px' }}>
              [{latestActivity.module.toUpperCase()}]
            </span>
            <span>{latestActivity.description}</span>
          </div>
        )}
      </footer>
    </div>
  );
};
