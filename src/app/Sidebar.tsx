import { UserProfile } from '@shared/types';
import React, { useState, useEffect } from 'react';
import {
  Layers,
  Radio,
  HeartPulse,
  Activity,
  X,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Route as RouteIcon,
  Building2,
  Ambulance,
  LogOut,
  UserPlus,
} from 'lucide-react';
import { MediRouteSubTab } from '../modules/mediroute/medirouteTypes';

export type NavModuleId = 'dashboard' | 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute' | 'vitals' | 'vitalwatch' | 'auth';

export interface SidebarProps {
  currentUser: UserProfile;
  onSignOut: () => void;
  onOpenAddPersonnel?: () => void;
  activeModule: NavModuleId;
  onNavigate: (module: NavModuleId) => void;
  pendingSyncCount: number;
  unackAlertsCount: number;
  isOfflineMode: boolean;
  onCloseMobile?: () => void;
  isOpenMobile?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  medirouteSubTab?: MediRouteSubTab;
  onSelectMediRouteSubTab?: (subTab: MediRouteSubTab) => void;
}

interface NavItem {
  id: NavModuleId;
  code: string;
  label: string;
  icon: any;
  badge?: number;
  badgeType?: 'warn' | 'crit';
  description: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  onSignOut,
  onOpenAddPersonnel,
  activeModule,
  onNavigate,
  pendingSyncCount,
  unackAlertsCount,
  isOfflineMode,
  onCloseMobile,
  isOpenMobile = false,
  isCollapsed = false,
  onToggleCollapse,
  medirouteSubTab = 'overview',
  onSelectMediRouteSubTab,
}) => {
  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      code: 'COP',
      label: 'Overview & COP',
      icon: Layers,
      description: 'Common operational picture',
    },
    {
      id: 'fieldlink',
      code: 'FLK',
      label: 'FieldLink Reports',
      icon: Radio,
      badge: pendingSyncCount > 0 ? pendingSyncCount : undefined,
      badgeType: 'warn',
      description: 'Offline ground outbox',
    },
    {
      id: 'mediroute',
      code: 'MED',
      label: 'MediRoute — Medical Operations',
      icon: HeartPulse,
      description: 'Triage, monitoring & evac',
    },
    {
      id: 'vitals',
      code: 'VTL',
      label: 'Soldier Vitals',
      icon: Activity,
      description: 'Physiological health telemetry',
    },
    { id: 'vitalwatch', code: 'VIT', label: 'VitalWatch Health', icon: Activity, description: 'Personnel vitals & GPS' },
  ];

  const medirouteSubNav = [
    { id: 'overview' as MediRouteSubTab, label: 'Operations Overview', icon: Activity },
    { id: 'triage' as MediRouteSubTab, label: 'Triage Board', icon: ClipboardList },
    { id: 'routing' as MediRouteSubTab, label: 'Evacuation Routing', icon: RouteIcon },
    { id: 'facilities' as MediRouteSubTab, label: 'Resources & Facilities', icon: Building2 },
    { id: 'dispatch' as MediRouteSubTab, label: 'Transport Dispatch', icon: Ambulance },
  ];

  // On small screens (<768px) or when mobile drawer is open, NEVER collapse (no icons-only preview).
  // Full labels, descriptions, and badges must always be visible.
  const [isWindowSmall, setIsWindowSmall] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsWindowSmall(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isCollapsedEffective = !isWindowSmall && !isOpenMobile && isCollapsed;

  return (
    <aside
      className={`app-sidebar ${isOpenMobile ? 'open' : ''} ${isCollapsedEffective ? 'collapsed' : ''}`}
      data-overlay="sidebar"
      aria-label="Tactical Navigation Sidebar"
      style={{
        width: isCollapsedEffective ? 'var(--sidebar-collapsed-width, 72px)' : 'var(--sidebar-width, 240px)',
      }}
    >
      {/* 1. Brand Masthead */}
      <div
        style={{
          padding: isCollapsedEffective ? '12px 8px 10px 8px' : '12px 12px 10px 12px',
          borderBottom: 'var(--border-width, 1.2px) solid var(--color-line)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isCollapsedEffective ? 'center' : 'stretch',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsedEffective ? 'center' : 'space-between',
            width: '100%',
          }}
        >
          {/* Emblem + Brand Title */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: 0,
              justifyContent: isCollapsedEffective ? 'center' : 'flex-start',
            }}
          >
            {/* Refined Emblem Tile with Tactical Accent Glow */}
            <div
              style={{
                width: '34px',
                height: '34px',
                minWidth: '34px',
                borderRadius: '6px',
                background: 'rgba(91, 112, 80, 0.20)',
                border: '1px solid rgba(115, 138, 101, 0.40)',
                boxShadow: '0 0 10px rgba(115, 138, 101, 0.20)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-sage, #738a65)',
                flexShrink: 0,
              }}
              title="SENTINEL C2 Tactical System v2.7"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>

            {!isCollapsedEffective && (
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      fontSize: '1.02rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--text-primary, #e9ece9)',
                      lineHeight: 1.1,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Sentinel
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--accent-sage, #738a65)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    OP-C2
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.62rem',
                    color: 'var(--text-secondary, #94a192)',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 500,
                    lineHeight: 1.1,
                    marginTop: '3px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  28.6139° N, 77.2090° E
                </div>
              </div>
            )}
          </div>

          {/* Minimize / Expand Toggle Button at Top Right of Masthead (Desktop only) */}
          {!isWindowSmall && !isCollapsedEffective && onToggleCollapse && (
            <button
              type="button"
              className="icon-btn"
              onClick={onToggleCollapse}
              aria-label="Minimize sidebar (Ctrl+B)"
              aria-expanded={true}
              title="Minimize sidebar (Ctrl+B)"
            >
              <ChevronLeft size={14} />
            </button>
          )}

          {/* Mobile close button */}
          {onCloseMobile && (
            <button
              type="button"
              className="icon-btn"
              onClick={onCloseMobile}
              style={{
                display: isOpenMobile ? 'inline-flex' : 'none',
              }}
              aria-label="Close navigation drawer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Minimized mode expand button (Desktop only) */}
        {!isWindowSmall && isCollapsedEffective && onToggleCollapse && (
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar (Ctrl+B)"
            aria-expanded={false}
            title="Expand sidebar (Ctrl+B)"
            style={{ marginTop: '2px' }}
          >
            <ChevronRight size={14} />
          </button>
        )}

        {/* Tactical Operational Status Badges (expanded only) */}
        {!isCollapsedEffective && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <div
              className={`tactical-badge ${isOfflineMode ? 'tactical-badge-active' : 'tactical-badge-online'}`}
              style={{ padding: '2px 7px' }}
            >
              <span className={isOfflineMode ? 'dot-glowing-amber' : 'dot-glowing-green'} />
              <span>{isOfflineMode ? 'OFFLINE_MODE' : 'SYS_ONLINE'}</span>
            </div>
            <div
              className="tactical-badge tactical-badge-secure"
              style={{ padding: '2px 7px', fontSize: '0.62rem' }}
            >
              SECURE
            </div>
          </div>
        )}
      </div>

      {/* 2. Navigation Items */}
      <nav
        style={{
          padding: isCollapsedEffective ? '8px 4px' : '10px 8px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
        aria-label="Operational modules"
      >
        {!isCollapsedEffective && (
          <div className="sidebar-section-label" style={{ marginBottom: '4px' }}>
            Modules
          </div>
        )}

        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          const Icon = item.icon;

          return (
            <React.Fragment key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onNavigate(item.id as any);
                  if (onCloseMobile) onCloseMobile();
                }}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              aria-label={`${item.label}: ${item.description}`}
              aria-current={isActive ? 'page' : undefined}
              style={{
                borderLeft: isActive ? '3px solid var(--tactical-olive, #617325)' : '3px solid transparent',
                background: isActive ? 'rgba(97, 115, 37, 0.12)' : 'transparent',
                justifyContent: isCollapsedEffective ? 'center' : 'flex-start',
                padding: isCollapsedEffective ? '7px 0' : '5px 8px',
              }}
            >
              {/* Icon column */}
              <div
                className="sidebar-icon-col"
                style={{
                  width: isCollapsedEffective ? '40px' : '32px',
                  minWidth: isCollapsedEffective ? '40px' : '32px',
                }}
              >
                <Icon
                  size={17}
                  color={isActive ? 'var(--tactical-olive, #617325)' : 'var(--text-secondary)'}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  aria-hidden="true"
                />

                {/* Minimized badge dot on icon corner */}
                {item.badge !== undefined && isCollapsedEffective && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '5px',
                      right: '6px',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: item.badgeType === 'crit'
                        ? 'var(--status-critical)'
                        : 'var(--status-warning)',
                      boxShadow: item.badgeType === 'crit'
                        ? '0 0 5px rgba(255, 59, 92, 0.5)'
                        : '0 0 5px rgba(255, 179, 0, 0.5)',
                    }}
                    aria-label={`${item.badge} notifications`}
                  />
                )}
              </div>

              {/* Expanded labels */}
              {!isCollapsedEffective && (
                <div style={{ flex: 1, minWidth: 0, paddingRight: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.25,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.2,
                      marginTop: '1px',
                    }}
                  >
                    {item.description}
                  </div>
                </div>
              )}

              {/* Expanded badge count pill */}
              {!isCollapsedEffective && item.badge !== undefined && (
                <span
                  className={`count-pill ${item.badgeType === 'crit' ? 'count-pill-crit' : 'count-pill-warn'}`}
                >
                  {item.badge}
                </span>
              )}

              {/* Minimized Tooltip on Hover / Focus */}
              {isCollapsedEffective && (
                <div className="rail-tooltip" role="tooltip">
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#FFFFFF' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {item.description}
                  </div>
                </div>
              )}
            </button>

            {/* Nested Sub-Navigation for MediRoute when active */}
            {item.id === 'mediroute' && isActive && !isCollapsedEffective && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  paddingLeft: '32px',
                  paddingRight: '6px',
                  marginTop: '2px',
                  marginBottom: '4px',
                  borderLeft: '2px solid rgba(56, 189, 248, 0.3)',
                  marginLeft: '18px',
                }}
              >
                {medirouteSubNav.map((subItem) => {
                  const isSubActive = medirouteSubTab === subItem.id;
                  const SubIcon = subItem.icon;

                  return (
                    <button
                      key={subItem.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('mediroute');
                        if (onSelectMediRouteSubTab) {
                          onSelectMediRouteSubTab(subItem.id);
                        }
                        if (onCloseMobile) onCloseMobile();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '5px 8px',
                        background: isSubActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                        border: isSubActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                        borderRadius: '4px',
                        color: isSubActive ? '#fff' : 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        fontWeight: isSubActive ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <SubIcon
                        size={13}
                        color={isSubActive ? 'var(--accent)' : 'var(--text-secondary)'}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {subItem.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </React.Fragment>
          );
        })}
      </nav>
      <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border-card)', flexShrink: 0 }}>
        {!isCollapsedEffective && <div style={{ padding: '0 6px 8px', minWidth: 0 }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{currentUser.role} · {currentUser.status}</div>
          <div title={currentUser.name} style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.callsign || currentUser.name}</div>
        </div>}
        {['admin', 'commander', 'administrator', 'operations_officer'].includes(currentUser.role) && onOpenAddPersonnel && <button
          type="button" className="btn btn-sm" onClick={onOpenAddPersonnel} title="Add Personnel" aria-label="Add Personnel"
          style={{ width: '100%', marginBottom: '6px' }}>
          <UserPlus size={14} /> {!isCollapsedEffective && 'Add Personnel'}
        </button>}
        <button type="button" className="btn btn-sm" onClick={onSignOut} title="Sign Out" aria-label="Sign Out" style={{ width: '100%' }}>
          <LogOut size={14} /> {!isCollapsedEffective && 'Sign Out'}
        </button>
      </div>
    </aside>
  );
};
