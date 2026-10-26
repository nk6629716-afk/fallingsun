import { UserProfile } from '@shared/types';
import {
  Layers,
  Radio,
  Crosshair,
  Compass,
  HeartPulse,
  Activity,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  UserPlus,
  LogOut,
  LogIn,
} from 'lucide-react';

export type NavModuleId = 'dashboard' | 'fieldlink' | 'skywatch' | 'geointel' | 'mediroute' | 'vitals' | 'vitalwatch' | 'auth';

export interface SidebarProps {
  activeModule: NavModuleId;
  onNavigate: (module: NavModuleId) => void;
  pendingSyncCount: number;
  unackAlertsCount: number;
  isOfflineMode: boolean;
  onCloseMobile?: () => void;
  isOpenMobile?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  currentUser?: UserProfile | null;
  onSignOut?: () => void;
  onOpenAddPersonnel?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onNavigate,
  pendingSyncCount,
  unackAlertsCount,
  isOfflineMode,
  onCloseMobile,
  isOpenMobile = false,
  isCollapsed = false,
  onToggleCollapse,
  currentUser,
  onSignOut,
  onOpenAddPersonnel,
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavModuleId,
      code: 'COP',
      label: 'Overview & COP',
      icon: Layers,
      description: 'Common operational picture',
    },
    {
      id: 'fieldlink' as NavModuleId,
      code: 'FLK',
      label: 'FieldLink Reports',
      icon: Radio,
      badge: pendingSyncCount > 0 ? pendingSyncCount : undefined,
      badgeType: 'warn' as const,
      description: 'Offline ground outbox',
    },
    {
      id: 'skywatch' as NavModuleId,
      code: 'SKY',
      label: 'SkyWatch Airspace',
      icon: Crosshair,
      badge: unackAlertsCount > 0 ? unackAlertsCount : undefined,
      badgeType: 'crit' as const,
      description: 'Airspace and geofence alerts',
    },
    {
      id: 'geointel' as NavModuleId,
      code: 'GEO',
      label: 'GeoIntel Recon',
      icon: Compass,
      description: 'Satellite change review',
    },
    {
      id: 'mediroute' as NavModuleId,
      code: 'MED',
      label: 'MediRoute Logistics',
      icon: HeartPulse,
      description: 'Triage and evacuation',
    },
    { id: 'vitals' as NavModuleId, code: 'SOL', label: 'Soldier Vitals', icon: Activity, description: 'Soldier monitoring and history' },
    {
      id: 'vitalwatch' as NavModuleId,
      code: 'VIT',
      label: 'VitalWatch Health',
      icon: Activity,
      description: 'Personnel vitals & GPS',
    },

  ];

  return (
    <aside
      className={`app-sidebar ${isOpenMobile ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}
      aria-label="Tactical Navigation Sidebar"
      style={{
        width: isCollapsed ? 'var(--sidebar-collapsed-width, 76px)' : 'var(--sidebar-width, 240px)',
      }}
    >
      {/* 1. Brand Masthead */}
      <div
        style={{
          padding: isCollapsed ? '12px 8px 10px 8px' : '14px 14px 12px 14px',
          borderBottom: 'var(--border-width, 1.2px) solid var(--color-line)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isCollapsed ? 'center' : 'stretch',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
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
              justifyContent: isCollapsed ? 'center' : 'flex-start',
            }}
          >
            {/* Custom Technical Emblem Tile */}
            <div
              style={{
                width: '36px',
                height: '36px',
                minWidth: '36px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-paper)',
                border: 'var(--border-width, 1.2px) solid var(--color-edge)',
                boxShadow: 'var(--shadow-flat-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
              title="Sentinel Operations Platform 2.6"
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

            {!isCollapsed && (
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      fontSize: '1.2rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      lineHeight: 1.1,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Sentinel
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 700,
                      color: 'var(--accent)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    2.6
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    lineHeight: 1.1,
                    marginTop: '1px',
                  }}
                >
                  Operations platform
                </div>
              </div>
            )}
          </div>

          {/* Minimize / Expand Toggle Button at Top Right of Masthead */}
          {!isCollapsed && onToggleCollapse && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={onToggleCollapse}
              aria-label="Minimize sidebar (Ctrl+B)"
              aria-expanded={true}
              title="Minimize sidebar (Ctrl+B)"
              style={{
                width: '26px',
                height: '26px',
                minWidth: '26px',
                minHeight: '26px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={16} />
            </button>
          )}

          {/* Mobile close button */}
          {onCloseMobile && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={onCloseMobile}
              style={{
                width: '26px',
                height: '26px',
                minWidth: '26px',
                minHeight: '26px',
                padding: 0,
                display: isOpenMobile ? 'inline-flex' : 'none',
              }}
              aria-label="Close navigation drawer"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Minimized mode expand button */}
        {isCollapsed && onToggleCollapse && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar (Ctrl+B)"
            aria-expanded={false}
            title="Expand sidebar (Ctrl+B)"
            style={{
              width: '28px',
              height: '28px',
              minWidth: '28px',
              minHeight: '28px',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '4px',
            }}
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Tactical Situational Engine Chip (Expanded only) */}
        {!isCollapsed && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 7px',
              border: 'var(--border-width, 1.2px) solid var(--color-line)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              fontSize: '0.68rem',
              color: 'var(--text-secondary)',
              marginTop: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                width: '5px',
                height: '5px',
                background: 'var(--accent)',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Tactical situational engine</span>
          </div>
        )}
      </div>

      {/* 2. Navigation Items */}
      <nav
        style={{
          padding: isCollapsed ? '10px 4px' : '12px 8px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
        aria-label="Operational modules"
      >
        {!isCollapsed && (
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              paddingLeft: '6px',
              marginBottom: '4px',
              letterSpacing: '0.01em',
            }}
          >
            Operational modules
          </div>
        )}

        {navItems.map((item) => {
          const isActive = activeModule === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onNavigate(item.id as any);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              aria-label={`${item.label}: ${item.description}`}
              aria-current={isActive ? 'page' : undefined}
              style={{
                borderLeft: isActive ? '4px solid var(--accent)' : '4px solid transparent',
                background: isActive ? 'var(--color-paper)' : 'transparent',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                padding: isCollapsed ? '8px 0' : '6px 8px',
              }}
            >
              {/* Icon column */}
              <div
                className="sidebar-icon-col"
                style={{
                  width: isCollapsed ? '44px' : '36px',
                  minWidth: isCollapsed ? '44px' : '36px',
                }}
              >
                <Icon
                  size={19}
                  color={isActive ? 'var(--accent)' : 'var(--text-secondary)'}
                  strokeWidth={isActive ? 2.3 : 1.9}
                  aria-hidden="true"
                />

                {/* Minimized badge dot on icon corner */}
                {item.badge !== undefined && isCollapsed && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '8px',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: item.badgeType === 'crit' ? 'var(--color-crit)' : 'var(--color-warn)',
                    }}
                    aria-label={`${item.badge} notifications`}
                  />
                )}
              </div>

              {/* Expanded labels */}
              {!isCollapsed && (
                <div style={{ flex: 1, minWidth: 0, paddingRight: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: isActive ? 700 : 600,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      lineHeight: 1.2,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: '0.69rem',
                      color: 'var(--text-secondary)',
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
              {!isCollapsed && item.badge !== undefined && (
                <span
                  style={{
                    backgroundColor: item.badgeType === 'crit' ? 'var(--color-crit)' : 'var(--color-warn)',
                    color: '#FFFFFF',
                    borderRadius: '50%',
                    width: '18px',
                    height: '18px',
                    minWidth: '18px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    marginRight: '4px',
                    flexShrink: 0,
                  }}
                >
                  {item.badge}
                </span>
              )}

              {/* Minimized Tooltip on Hover / Focus */}
              {isCollapsed && (
                <div className="rail-tooltip" role="tooltip">
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#FFFFFF' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
                    {item.description}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. Operator Session & Personnel Actions */}
      <div
        style={{
          borderTop: '1px solid var(--border-grid, #14221E)',
          padding: isCollapsed ? '8px 4px' : '10px 12px',
          backgroundColor: 'var(--bg-shell, #0D1412)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {currentUser ? (
          <div>
            {!isCollapsed && (
              <div style={{ marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '0.68rem',
                      color: 'var(--accent-primary, #00E676)',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    {currentUser.role.toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: currentUser.status === 'approved' ? 'var(--status-safe, #00E676)' : 'var(--status-warning, #FFB300)',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    {currentUser.status.toUpperCase()}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: 'var(--text-primary, #F0FDF4)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={currentUser.name}
                >
                  {currentUser.callsign ? `${currentUser.callsign} (${currentUser.name})` : currentUser.name}
                </div>
              </div>
            )}

            {/* If admin or commander: Add Personnel action */}
            {(currentUser.role === 'admin' || currentUser.role === 'commander') && onOpenAddPersonnel && (
              <button
                type="button"
                onClick={onOpenAddPersonnel}
                title="Add Personnel Profile (Authorized Officials Only)"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'flex-start',
                  gap: '6px',
                  padding: isCollapsed ? '6px' : '5px 8px',
                  background: 'var(--bg-elevated, #1A2925)',
                  border: '1px solid var(--border-card, #263D37)',
                  color: 'var(--accent-primary, #00E676)',
                  borderRadius: '3px',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  cursor: 'pointer',
                  marginBottom: '4px',
                }}
              >
                <UserPlus size={13} />
                {!isCollapsed && <span>+ Add Personnel</span>}
              </button>
            )}

            {/* Logout button */}
            <button
              type="button"
              onClick={onSignOut}
              title="Sign Out"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                gap: '6px',
                padding: isCollapsed ? '6px' : '5px 8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #869E96)',
                borderRadius: '3px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                cursor: 'pointer',
              }}
            >
              <LogOut size={13} />
              {!isCollapsed && <span>Sign Out</span>}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onNavigate('auth')}
            title="Sign in to SENTINEL"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'center',
              gap: '6px',
              padding: isCollapsed ? '8px 4px' : '6px 10px',
              background: 'var(--accent-primary, #00E676)',
              border: '1px solid var(--accent-primary, #00E676)',
              color: '#060A09',
              borderRadius: '3px',
              fontSize: '0.74rem',
              fontWeight: 700,
              fontFamily: 'var(--font-mono, monospace)',
              cursor: 'pointer',
            }}
          >
            <LogIn size={13} />
            {!isCollapsed && <span>Sign In</span>}
          </button>
        )}
      </div>

    </aside>
  );
};
