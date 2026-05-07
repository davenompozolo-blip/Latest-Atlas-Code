// ============================================
// ATLAS Sync Status Component
//
// Persistent header indicator showing:
// - Current sync health (green/yellow/red)
// - Last sync time
// - Record count
// - Validation status
// - Expandable detail panel with sync history
// ============================================

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase'; // adjust to your client path

const STATUS_CONFIG = {
  healthy: { icon: '🟢', color: '#10B981', label: 'Synced' },
  stale:   { icon: '🟡', color: '#F59E0B', label: 'Stale' },
  error:   { icon: '🔴', color: '#EF4444', label: 'Error' },
  unknown: { icon: '⚪', color: '#6B7280', label: 'Unknown' }
};

function getHealthLevel(status) {
  if (!status?.last_sync_at) return 'unknown';

  const hoursAgo = (Date.now() - new Date(status.last_sync_at).getTime()) / (1000 * 60 * 60);

  if (status.consecutive_failures >= 2) return 'error';
  if (status.last_sync_status === 'failed') return 'error';
  if (!status.last_validation_passed) return 'stale';
  if (hoursAgo > 36) return 'error';
  if (hoursAgo > 18) return 'stale';
  return 'healthy';
}

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function SyncStatus() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [validations, setValidations] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    try {
      const { data: statusData } = await supabase
        .from('atlas_sync_status')
        .select('*')
        .eq('id', 1)
        .single();
      setStatus(statusData);

      const { data: historyData } = await supabase
        .from('atlas_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);
      setHistory(historyData || []);

      const { data: valData } = await supabase
        .from('atlas_validation_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setValidations(valData || []);
    } catch (err) {
      console.error('Failed to load sync status:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={styles.indicator}>⏳ Loading...</div>;

  const health = getHealthLevel(status);
  const config = STATUS_CONFIG[health];

  return (
    <div style={styles.container}>
      {/* Compact indicator — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ ...styles.indicator, borderColor: config.color }}
      >
        <span>{config.icon}</span>
        <span style={{ color: config.color }}>{config.label}</span>
        <span style={styles.time}>{timeAgo(status?.last_sync_at)}</span>
        {status?.last_sync_records && (
          <span style={styles.count}>{status.last_sync_records} records</span>
        )}
        {status?.last_validation_passed === false && (
          <span style={styles.warning}>⚠ Validation issues</span>
        )}
        <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div style={styles.panel}>
          {/* Status Summary */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Sync Status</h4>
            <div style={styles.grid}>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Last Sync</span>
                <span style={styles.statValue}>
                  {status?.last_sync_at
                    ? new Date(status.last_sync_at).toLocaleString()
                    : 'Never'}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Duration</span>
                <span style={styles.statValue}>
                  {status?.last_sync_duration_ms
                    ? `${(status.last_sync_duration_ms / 1000).toFixed(1)}s`
                    : '—'}
                </span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Consecutive Failures</span>
                <span style={{
                  ...styles.statValue,
                  color: (status?.consecutive_failures || 0) > 0 ? '#EF4444' : '#10B981'
                }}>
                  {status?.consecutive_failures || 0}
                </span>
              </div>
            </div>
            {status?.last_failure_message && (
              <div style={styles.errorBox}>
                {status.last_failure_message}
              </div>
            )}
          </div>

          {/* Recent Validations */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Validation Checks</h4>
            {validations.slice(0, 8).map(v => (
              <div key={v.id} style={styles.validationRow}>
                <span style={{
                  color: v.status === 'passed' ? '#10B981' : v.status === 'warning' ? '#F59E0B' : '#EF4444'
                }}>
                  {v.status === 'passed' ? '✓' : v.status === 'warning' ? '⚠' : '✗'}
                </span>
                <span style={styles.checkName}>{v.check_name}</span>
                <span style={styles.checkMessage}>{v.message}</span>
              </div>
            ))}
          </div>

          {/* Sync History */}
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>Sync History</h4>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Records</th>
                  <th style={styles.th}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={styles.td}>{timeAgo(h.started_at)}</td>
                    <td style={styles.td}>{h.sync_type}</td>
                    <td style={{
                      ...styles.td,
                      color: h.status === 'completed' ? '#10B981' :
                             h.status === 'failed' ? '#EF4444' : '#F59E0B'
                    }}>
                      {h.status}
                    </td>
                    <td style={styles.td}>{h.records_upserted || 0}</td>
                    <td style={styles.td}>
                      {h.duration_ms ? `${(h.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    zIndex: 100
  },
  indicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    background: '#1a1a2e',
    border: '1px solid',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#e0e0e0',
    fontFamily: 'monospace'
  },
  time: {
    color: '#888',
    fontSize: '12px'
  },
  count: {
    color: '#666',
    fontSize: '11px'
  },
  warning: {
    color: '#F59E0B',
    fontSize: '11px'
  },
  chevron: {
    color: '#666',
    fontSize: '10px',
    marginLeft: '4px'
  },
  panel: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    width: '560px',
    maxHeight: '500px',
    overflowY: 'auto',
    background: '#0f0f23',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '16px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
  },
  section: {
    marginBottom: '16px'
  },
  sectionTitle: {
    color: '#aaa',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
    borderBottom: '1px solid #222',
    paddingBottom: '4px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px'
  },
  statLabel: {
    color: '#666',
    fontSize: '11px'
  },
  statValue: {
    color: '#e0e0e0',
    fontSize: '14px',
    fontFamily: 'monospace'
  },
  errorBox: {
    marginTop: '8px',
    padding: '8px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    color: '#EF4444',
    fontSize: '12px',
    fontFamily: 'monospace'
  },
  validationRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '4px 0',
    fontSize: '12px',
    borderBottom: '1px solid #1a1a1a'
  },
  checkName: {
    color: '#aaa',
    minWidth: '140px',
    fontFamily: 'monospace',
    fontSize: '11px'
  },
  checkMessage: {
    color: '#ccc',
    fontSize: '12px',
    flex: 1
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px'
  },
  th: {
    textAlign: 'left',
    color: '#666',
    padding: '4px 8px',
    borderBottom: '1px solid #222',
    fontSize: '11px'
  },
  td: {
    padding: '4px 8px',
    color: '#ccc',
    borderBottom: '1px solid #111',
    fontFamily: 'monospace'
  }
};
