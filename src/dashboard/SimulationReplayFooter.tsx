import React, { useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface SimulationReplayFooterProps {
  isSimPaused?: boolean;
  onToggleSimulationPause?: () => Promise<void>;
  latestActivity?: string | null;
}

export const SimulationReplayFooter = React.memo<SimulationReplayFooterProps>(
  ({ isSimPaused = false, onToggleSimulationPause, latestActivity = null }) => {
    const [sessionStartTime] = useState<number>(() => Date.now());
    const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

    // Elapsed simulation counter isolated to footer to prevent whole-dashboard re-renders
    useEffect(() => {
      if (isSimPaused) return;
      const interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - sessionStartTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }, [isSimPaused, sessionStartTime]);

    return (
      <footer
        className="bottom-replay-bar"
        style={{
          height: '36px',
          minHeight: '36px',
          borderTop: 'var(--border-width, 1.2px) solid var(--color-edge, #172622)',
          background: 'var(--color-sheet, #0D1412)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          fontSize: '0.74rem',
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Simulation Pause / Resume Button */}
          {onToggleSimulationPause && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={onToggleSimulationPause}
              style={{
                width: '24px',
                height: '24px',
                minWidth: '24px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-control, #172622)',
                border: '1px solid var(--border-subtle, #1F332D)',
                color: 'var(--text-primary, #F0FDF4)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              title={isSimPaused ? 'Resume simulation' : 'Pause simulation'}
            >
              {isSimPaused ? <Play size={12} /> : <Pause size={12} />}
            </button>
          )}

          {/* Live Indicator & Elapsed Time */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: isSimPaused ? 'var(--color-warn, #FFB300)' : 'var(--color-ok, #00E676)',
                }}
              />
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-heading, sans-serif)',
                  fontWeight: 600,
                  color: isSimPaused ? 'var(--color-warn, #FFB300)' : 'var(--color-ok, #00E676)',
                }}
              >
                {isSimPaused ? 'Paused' : 'Simulation running'}
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  color: 'var(--text-muted, #546E66)',
                  marginLeft: '4px',
                }}
              >
                (Simulated data)
              </span>
            </div>

            <span
              className="mono"
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-secondary, #869E96)',
                fontFamily: 'var(--font-mono, monospace)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Elapsed: {elapsedSeconds}s
            </span>
          </div>
        </div>

        {/* Real Activity Ticker */}
        {latestActivity && (
          <div
            style={{
              color: 'var(--text-secondary, #869E96)',
              fontSize: '0.72rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '60%',
            }}
          >
            {latestActivity}
          </div>
        )}
      </footer>
    );
  }
);
