import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  RotateCcw,
  Menu,
  MoreVertical,
} from 'lucide-react';
import { getLiveIST } from '../utils/time';
import { createWavefrontRipple } from '../utils/motion';

import { authService } from '../services/auth/authService';
import { UserRole, UserProfile } from '@shared/types';
import { Shield, ChevronDown } from 'lucide-react';

export interface CommandHeaderProps {
  activeModule: 'dashboard' | 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute' | 'vitals';
  pendingSyncCount: number;
  isOfflineMode: boolean;
  onToggleOffline: () => void;
  onTriggerSync: () => Promise<void>;
  onResetDemo: () => Promise<void>;
  isSyncing: boolean;
  onToggleMobileMenu?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
  isHeaderCompact?: boolean;
  onToggleHeaderCompact?: () => void;
  isHeaderMinimized?: boolean;
  onToggleHeaderMinimized?: () => void;
  realtimeStatus?: 'connected' | 'reconnecting' | 'disconnected' | 'stale';
  lastEventTimestamp?: string | null;
  simSpeed?: number;
  onSetSimSpeed?: (speed: 1 | 2 | 5) => void;
  onToggleSimPause?: () => void;
  isSimPaused?: boolean;
  onSimulateSlowLoad?: () => void;
}

export const CommandHeader: React.FC<CommandHeaderProps> = ({
  activeModule,
  pendingSyncCount,
  isOfflineMode,
  onToggleOffline,
  onTriggerSync,
  onResetDemo,
  isSyncing,
  onToggleMobileMenu,
  isSidebarCollapsed = false,
  onToggleSidebarCollapse,
  isHeaderCompact = false,
  onToggleHeaderCompact,
  isHeaderMinimized = false,
  onToggleHeaderMinimized,
  realtimeStatus = 'disconnected',
  lastEventTimestamp = null,
}) => {
  const [istTime, setIstTime] = useState<string>(() => getLiveIST());

  // Live IST Clock (ticking each second in Asia/Kolkata UTC+05:30)
  useEffect(() => {
    const update = () => {
      setIstTime(getLiveIST());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getUser());
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (roleMenuRef.current && !roleMenuRef.current.contains(target)) {
        setIsRoleMenuOpen(false);
      }
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(target)) {
        setIsOverflowOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsRoleMenuOpen(false);
        setIsOverflowOpen(false);
      }
    };
    if (isRoleMenuOpen || isOverflowOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRoleMenuOpen, isOverflowOpen]);

  // Auth subscription
  useEffect(() => {
    const unsub = authService.subscribe((sess) => {
      setCurrentUser(sess?.user || null);
    });
    return unsub;
  }, []);

  const handleRoleSwitch = (newRole: UserRole) => {
    authService.demoLogin(newRole);
    setIsRoleMenuOpen(false);
  };
  const getModuleTitle = () => {
    switch (activeModule) {
      case 'dashboard':
        return {
          title: 'Overview & COP',
          subtitle: 'Common operational picture and live situation',
        };
      case 'fieldlink':
        return {
          title: 'FieldLink Reports',
          subtitle: 'Offline-first ground incident intake',
        };
      case 'skywatch':
        return {
          title: 'SkyWatch Airspace',
          subtitle: 'Airspace surveillance and geofence alerts',
        };
      case 'geointel':
        return {
          title: 'GeoIntel Recon',
          subtitle: 'Satellite change detection and analyst review',
        };
      case 'mediroute':
        return {
          title: 'MediRoute Logistics',
          subtitle: 'Triage scoring and evacuation routing',
        };
      case 'vitals':
        return {
          title: 'Soldier Vitals',
          subtitle: 'Physiological recordkeeping and telemetry',
        };
    }
  };

  const moduleInfo = getModuleTitle();

  return (
    <header className="command-header" aria-label="Command Header">
      {/* Left: Mobile Toggle & Module Name + Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {onToggleMobileMenu && (
          <button
            type="button"
            className="btn btn-sm btn-mobile-nav"
            onClick={onToggleMobileMenu}
            style={{
              display: 'none',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
              padding: '4px 8px',
            }}
            aria-label="Toggle mobile menu"
          >
            <Menu size={16} />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0, whiteSpace: 'nowrap' }}>
          <h1
            style={{
              fontSize: '0.95rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--text-primary, #e9ece9)',
              letterSpacing: '0.04em',
              margin: 0,
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            {moduleInfo.title}
          </h1>
          <span
            className="header-subtitle"
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary, #94a192)',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '0.03em',
            }}
          >
            // {moduleInfo.subtitle}
          </span>
        </div>
      </div>

      {/* Right: Controls Strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
        {/* Live Clock with Telemetry Monospace */}
        <div
          className="clock-value"
          style={{
            fontSize: '0.78rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-primary, #e9ece9)',
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.04em',
            background: 'rgba(18, 22, 20, 0.60)',
            border: '1px solid rgba(115, 138, 101, 0.20)',
            padding: '3px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
          }}
        >
          {istTime}
        </div>

        {/* Desktop-only action controls */}
        <div className="header-actions-desktop" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {/* Go Offline / Offline Mode Button */}
          <button
            type="button"
            className="btn-tactical"
            onClick={(e) => {
              createWavefrontRipple(e);
              onToggleOffline();
            }}
            style={{
              padding: '4px 10px',
              fontSize: '0.68rem',
              borderColor: isOfflineMode ? 'rgba(212, 163, 115, 0.45)' : 'rgba(97, 115, 37, 0.30)',
              background: isOfflineMode ? 'rgba(212, 163, 115, 0.12)' : '#181d1a',
              color: isOfflineMode ? 'var(--highlight-amber, #d4a373)' : 'var(--text-secondary, #94a192)',
            }}
            title={isOfflineMode ? 'Air-gap mode active (Click to restore online simulation)' : 'Simulate tactical radio blackout'}
          >
            {isOfflineMode ? <WifiOff size={13} color="var(--highlight-amber, #d4a373)" /> : <Wifi size={13} color="var(--text-secondary, #94a192)" />}
            <span>{isOfflineMode ? 'BLACKOUT' : 'GO_OFFLINE'}</span>
          </button>

          {/* Reset Scenario Button */}
          <button
            type="button"
            className="btn-tactical"
            onClick={(e) => {
              createWavefrontRipple(e);
              onResetDemo();
            }}
            style={{
              padding: '4px 10px',
              fontSize: '0.68rem',
              color: 'var(--text-secondary, #94a192)',
            }}
            title="Reset scenario to deterministic baseline fixtures"
          >
            <RotateCcw size={12} />
            <span>RESET</span>
          </button>

          {/* User Identity & Role Badge / Switcher */}
          <div ref={roleMenuRef} style={{ position: 'relative' }}>
            <button
              id="header-user-menu-btn"
              type="button"
              onClick={() => setIsRoleMenuOpen((prev) => !prev)}
              aria-haspopup="true"
              aria-expanded={isRoleMenuOpen}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid rgba(0, 229, 255, 0.4)',
                background: 'rgba(0, 229, 255, 0.1)',
                color: '#00E5FF',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Current user session & settings"
            >
              <Shield size={12} color="#00E5FF" />
              <span>{currentUser?.badgeName || currentUser?.callsign || currentUser?.role?.toUpperCase() || 'USER'}</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  background: 'rgba(255,255,255,0.15)',
                  color: '#FFFFFF',
                }}
              >
                {currentUser?.role?.replace('_', ' ').toUpperCase()}
              </span>
              <ChevronDown size={11} />
            </button>

            {isRoleMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: '#141C28',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  minWidth: '240px',
                  zIndex: 200,
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#e9ece9', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                  {currentUser?.badgeName || currentUser?.email}
                  <div style={{ fontSize: '0.68rem', color: '#8D9A8F', fontWeight: 400 }}>
                    {currentUser?.email} {currentUser?.regimentNo ? `• Reg ${currentUser.regimentNo}` : ''}
                  </div>
                </div>

                {/* Admin Approvals Link (only for approved administrator) */}
                {currentUser?.role === 'administrator' && (
                  <button
                    id="nav-admin-approvals-btn"
                    type="button"
                    onClick={() => {
                      setIsRoleMenuOpen(false);
                      window.location.hash = '#admin/approvals';
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '7px 10px',
                      background: 'rgba(115, 138, 101, 0.2)',
                      border: '1px solid rgba(115, 138, 101, 0.4)',
                      borderRadius: '4px',
                      color: '#738a65',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Shield size={13} />
                    <span>Administrator Approvals</span>
                  </button>
                )}

                {/* Demo Switcher only visible in explicit demo session */}
                {currentUser?.isDemo && (
                  <>
                    <div style={{ fontSize: '0.68rem', color: '#8D9A8F', padding: '2px 4px', fontWeight: 600 }}>
                      Switch Demo Operational Role
                    </div>
                    {[
                      { role: 'administrator' as UserRole, label: 'Administrator', desc: 'Full access & scenario controls' },
                      { role: 'medical_officer' as UserRole, label: 'Medical Officer', desc: 'Triage & Soldier Vitals intake' },
                    ].map((item) => (
                      <button
                        key={item.role}
                        type="button"
                        onClick={() => handleRoleSwitch(item.role)}
                        style={{
                          textAlign: 'left',
                          padding: '5px 8px',
                          background: currentUser?.role === item.role ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                          border: currentUser?.role === item.role ? '1px solid #00E5FF' : '1px solid transparent',
                          borderRadius: '4px',
                          color: '#FFFFFF',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, color: currentUser?.role === item.role ? '#00E5FF' : '#FFFFFF' }}>
                          {item.label}
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Actual Logout Button */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                  <button
                    id="header-logout-btn"
                    type="button"
                    onClick={async () => {
                      setIsRoleMenuOpen(false);
                      await authService.logout();
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 10px',
                      background: 'rgba(200, 90, 83, 0.15)',
                      border: '1px solid rgba(200, 90, 83, 0.35)',
                      borderRadius: '4px',
                      color: '#c85a53',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sync Button */}
        <button
          type="button"
          onClick={(e) => {
            createWavefrontRipple(e);
            onTriggerSync();
          }}
          disabled={isSyncing || isOfflineMode || pendingSyncCount === 0}
          className={pendingSyncCount > 0 ? 'btn-tactical btn-tactical-olive' : 'btn-tactical'}
          style={{
            padding: '4px 10px',
            fontSize: '0.68rem',
            opacity: isOfflineMode ? 0.45 : 1,
            cursor: pendingSyncCount > 0 ? 'pointer' : 'default',
          }}
          title="Synchronize local outbox queue"
        >
          <span>{isSyncing ? 'SYNCING...' : 'SYNC'}</span>
          {pendingSyncCount > 0 && (
            <span
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#121614',
                color: 'var(--highlight-amber, #d4a373)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.62rem',
                fontWeight: 800,
                border: '1px solid #d4a373',
                marginLeft: '2px',
              }}
            >
              {pendingSyncCount}
            </span>
          )}
        </button>

        {/* Live SSE / Command Link Status Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid rgba(115, 138, 101, 0.25)',
            background: 'rgba(24, 29, 26, 0.70)',
            fontSize: '0.65rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: isOfflineMode ? 'var(--status-critical, #c85a53)' : '#588157',
            height: '24px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
          title={
            isOfflineMode
              ? 'Telemetry Bus: Offline Simulation Active'
              : 'Telemetry Bus: Command Link Active & Realtime Stream Synchronized'
          }
        >
          <span
            className={isOfflineMode ? 'status-dot status-dot-crit' : 'status-dot status-dot-live'}
          />
          <span className="link-status-text">
            {isOfflineMode ? 'OFFLINE' : 'LINK ACTIVE'}
          </span>
        </div>

        {/* Mobile Overflow Menu Button (under 768px) */}
        <div ref={overflowMenuRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-sm header-overflow-trigger"
            onClick={() => setIsOverflowOpen((prev) => !prev)}
            aria-haspopup="true"
            aria-expanded={isOverflowOpen}
            style={{
              display: 'none',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
              padding: '4px 6px',
            }}
            title="More actions"
            aria-label="More actions"
          >
            <MoreVertical size={14} />
          </button>

          {isOverflowOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                background: 'var(--color-strip)',
                border: '1px solid var(--color-edge)',
                boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 100,
                minWidth: '180px',
              }}
              onClick={() => setIsOverflowOpen(false)}
            >
              <button
                type="button"
                className="btn btn-sm"
                onClick={(e) => { e.stopPropagation(); onToggleOffline(); }}
                style={{ justifyContent: 'flex-start', padding: '6px 8px' }}
              >
                {isOfflineMode ? <Wifi size={13} /> : <WifiOff size={13} />}
                <span>{isOfflineMode ? 'Switch to Online' : 'Go Offline'}</span>
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={(e) => { e.stopPropagation(); onResetDemo(); }}
                style={{ justifyContent: 'flex-start', padding: '6px 8px' }}
              >
                <RotateCcw size={13} />
                <span>Reset scenario</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
