import React from 'react';
import { sb, loadView } from './config.js';
import { fmtCurrency, fmtPct, fmt } from './utils.js';
import { usePortfolioConstructionStore } from '../stores/usePortfolioConstructionStore.js';

const { useState, useEffect, useCallback } = React;
const h = React.createElement;

// ─── Layer metadata ───────────────────────────────────────────────────────────
const LAYERS = [
  { id: 1, code: 'L1', name: 'IPS Builder',                  sub: 'Investment Policy Statement · Foundation Layer' },
  { id: 2, code: 'L2', name: 'SAA / TAA Engine',             sub: 'Strategic & Tactical Asset Allocation · Target Setting' },
  { id: 3, code: 'L3', name: 'Factor Exposure Dashboard',    sub: 'Factor Tilts · Active Share · Style Classification' },
  { id: 4, code: 'L4', name: 'Risk Budget Console',          sub: 'Marginal Risk Contribution · Correlation · Diversification' },
  { id: 5, code: 'L5', name: 'Optimizer',                    sub: 'Mean-Variance · Black-Litterman · Risk Parity' },
  { id: 6, code: 'L6', name: 'Rebalancing',                  sub: 'Trade Generation · Tax-Loss Harvesting · Costs' },
  { id: 7, code: 'L7', name: 'Construction Report',          sub: 'AI-Generated Attribution · Forward Projections' },
];

const TEAL   = '#00c8e0';
const GREEN  = '#10b981';
const GOLD   = '#f4a261';
const RED    = '#ef4444';
const PURPLE = '#8b5cf6';
const NAVY   = '#060f1e';
const NAVY1  = '#0a1628';
const NAVY2  = '#0d1b2e';
const BORDER = 'rgba(255,255,255,0.07)';
const T1     = 'rgba(255,255,255,0.92)';
const T2     = 'rgba(255,255,255,0.60)';
const T3     = 'rgba(255,255,255,0.32)';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function layerStatus(id, active, completed) {
  if (completed.includes(id)) return 'complete';
  if (id === active)          return 'active';
  if (id <= active)           return 'active';
  return 'locked';
}

function statusBadge(status) {
  const cfg = {
    complete:    { label: 'COMPLETE',    bg: 'rgba(16,185,129,0.12)', color: GREEN,  border: 'rgba(16,185,129,0.25)' },
    active:      { label: 'IN PROGRESS', bg: 'rgba(0,200,224,0.12)',  color: TEAL,   border: 'rgba(0,200,224,0.25)' },
    locked:      { label: 'LOCKED',      bg: 'rgba(255,255,255,0.04)',color: T3,     border: BORDER },
  };
  const c = cfg[status] || cfg.locked;
  return h('span', {
    style: {
      padding: '3px 10px', borderRadius: 3, fontSize: 9, fontFamily: 'JetBrains Mono',
      fontWeight: 700, letterSpacing: 1.5, border: `1px solid ${c.border}`,
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }
  }, c.label);
}

function metricTile(label, value, color, sub) {
  return h('div', {
    style: {
      background: NAVY2, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '20px 24px', flex: 1, minWidth: 0,
    }
  },
    h('div', { style: { fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: 1.5, color: T3, textTransform: 'uppercase', marginBottom: 10 } }, label),
    h('div', { style: { fontSize: 32, fontWeight: 700, fontFamily: 'Syne', color: color || T1, lineHeight: 1, marginBottom: 6 } }, value),
    sub && h('div', { style: { fontSize: 10, color: T3, fontFamily: 'JetBrains Mono' } }, sub)
  );
}

function sectionLabel(text) {
  return h('div', {
    style: {
      fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: 2,
      color: T3, textTransform: 'uppercase', marginBottom: 10,
      paddingBottom: 6, borderBottom: `1px solid ${BORDER}`,
    }
  }, '— ' + text);
}

// ─── Right panel ─────────────────────────────────────────────────────────────
function RightPanel({ ips, positions, cmd }) {
  const nav     = cmd ? cmd.portfolio_nav     : null;
  const mtd     = cmd ? cmd.mtd_return_pct    : null;
  const ytd     = cmd ? cmd.ytd_return_pct    : null;
  const sharpe  = cmd ? cmd.sharpe_ratio      : null;
  const beta    = 1.24; // placeholder until we have it in vw_command_centre

  // Drift = sum of |actual_weight - target_weight| for top positions
  const drift = positions.length
    ? (positions.reduce((s, p) => {
        const target = (ips.maxConcentration / 100) * 0.5; // simplified
        return s + Math.abs((p.weight_equity_pct || 0) - target * 100);
      }, 0) / positions.length).toFixed(1)
    : '7.2';

  const pnlColor = mtd >= 0 ? GREEN : RED;

  return h('div', {
    style: {
      width: 260, minWidth: 260, flexShrink: 0,
      background: NAVY1, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 20,
      overflowY: 'auto', maxHeight: '100%',
    }
  },
    // Active IPS
    h('div', null,
      sectionLabel('Active IPS'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        ipsRow('Risk Tolerance', `${ips.riskTolerance} / 10`, ips.riskTolerance >= 7 ? RED : ips.riskTolerance >= 5 ? GOLD : GREEN),
        ipsRow('Return Target', `${ips.returnTarget}% p.a.`, TEAL),
        ipsRow('Time Horizon', `${ips.timeHorizon} Years`, T2),
        ipsRow('Benchmark', ips.benchmark, T2),
        ipsRow('Max Concentration', `${ips.maxConcentration}%`, T2),
        ips.sectorRestrictions.length
          ? ipsRow('Excluded Sectors', ips.sectorRestrictions.join(', '), RED)
          : null,
      )
    ),
    // Portfolio snapshot
    nav != null && h('div', null,
      sectionLabel('Portfolio Snapshot'),
      h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
        snapTile('NAV',       fmtCurrency(nav),       T1),
        snapTile('Positions', positions.length || cmd?.position_count || '—', T1),
        snapTile('MTD',       mtd != null ? (mtd >= 0 ? '+' : '') + fmtPct(mtd) : '—', mtd != null ? (mtd >= 0 ? GREEN : RED) : T2),
        snapTile('YTD',       ytd != null ? (ytd >= 0 ? '+' : '') + fmtPct(ytd) : '—', ytd != null ? (ytd >= 0 ? GREEN : RED) : T2),
        snapTile('Sharpe',    sharpe != null ? fmt(sharpe) : '—', PURPLE),
        snapTile('Beta',      fmt(beta), GOLD),
      ),
      parseFloat(drift) > 5 && h('div', {
        style: {
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 6, padding: '8px 12px', marginTop: 8,
          fontSize: 10, fontFamily: 'JetBrains Mono', color: RED,
        }
      }, `● Drift alert: ${drift}% aggregate`)
    ),
    // Layer progress
    h('div', null,
      sectionLabel('Layer Progress'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5 } },
        LAYERS.map(l => h('div', {
          key: l.id,
          style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 10, fontFamily: 'JetBrains Mono', color: T2,
            padding: '3px 0',
          }
        },
          h('span', { style: { color: T3 } }, `${l.id <= 3 ? '✓' : l.id === 4 ? '→' : '○'} L${l.id} · ${l.name.split(' ')[0]}`),
          h('span', { style: { color: l.id <= 3 ? GREEN : l.id === 4 ? TEAL : T3 } },
            l.id <= 3 ? 'Done' : l.id === 4 ? 'Active' : 'Locked')
        ))
      )
    ),
    // Quick actions
    h('div', null,
      sectionLabel('Quick Actions'),
      h('button', {
        style: {
          width: '100%', padding: '10px', background: 'rgba(0,200,224,0.1)',
          border: `1px solid rgba(0,200,224,0.3)`, borderRadius: 6,
          color: TEAL, fontFamily: 'JetBrains Mono', fontSize: 11,
          fontWeight: 700, letterSpacing: 1.2, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        },
        onClick: () => {},
      }, '🇺🇸  SAVE DRAFT')
    )
  );
}

function ipsRow(label, value, color) {
  return h('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 10 }
  },
    h('span', { style: { fontFamily: 'JetBrains Mono', color: T3, letterSpacing: 0.5 } }, label),
    h('span', { style: { fontFamily: 'JetBrains Mono', fontWeight: 600, color: color || T1 } }, value)
  );
}

function snapTile(label, value, color) {
  return h('div', {
    style: { background: NAVY, borderRadius: 6, padding: '8px 10px', border: `1px solid ${BORDER}` }
  },
    h('div', { style: { fontSize: 8, fontFamily: 'JetBrains Mono', color: T3, letterSpacing: 1.5, marginBottom: 4 } }, label),
    h('div', { style: { fontSize: 14, fontFamily: 'Syne', fontWeight: 700, color: color || T1 } }, value)
  );
}

// ─── Layer strip ─────────────────────────────────────────────────────────────
function LayerStrip({ activeLayer, completedLayers, onSelect }) {
  return h('div', {
    style: {
      display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
      background: NAVY1, border: `1px solid ${BORDER}`,
      borderRadius: 10, marginBottom: 20, overflow: 'hidden',
    }
  },
    LAYERS.map((l, i) => {
      const done   = completedLayers.includes(l.id);
      const active = l.id === activeLayer;
      const locked = !done && l.id > activeLayer;
      return h('button', {
        key: l.id,
        onClick: () => !locked && onSelect(l.id),
        style: {
          padding: '14px 8px', background: active ? 'rgba(0,200,224,0.10)' : 'none',
          border: 'none', borderRight: i < 6 ? `1px solid ${BORDER}` : 'none',
          cursor: locked ? 'default' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          borderBottom: active ? `2px solid ${TEAL}` : '2px solid transparent',
          opacity: locked ? 0.45 : 1, transition: 'background 0.15s',
        }
      },
        h('div', { style: { fontSize: 9, fontFamily: 'JetBrains Mono', color: done ? GREEN : active ? TEAL : T3, fontWeight: 700, letterSpacing: 1 } }, l.code),
        h('div', { style: { fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 600, color: active ? T1 : T2, textTransform: 'uppercase', letterSpacing: 0.8 } }, l.name.split(' ')[0]),
        h('div', { style: { width: 6, height: 6, borderRadius: '50%', background: done ? GREEN : active ? TEAL : T3 } })
      );
    })
  );
}

// ─── Layer card ──────────────────────────────────────────────────────────────
function LayerCard({ layer, status, isExpanded, onToggle, children }) {
  const accentColor = status === 'complete' ? GREEN : status === 'active' ? TEAL : T3;
  return h('div', {
    style: {
      background: NAVY1, border: `1px solid ${isExpanded ? accentColor + '40' : BORDER}`,
      borderRadius: 10, overflow: 'hidden',
      boxShadow: isExpanded ? `0 0 20px ${accentColor}18` : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }
  },
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 20px', cursor: status === 'locked' ? 'default' : 'pointer',
      },
      onClick: status !== 'locked' ? onToggle : undefined,
    },
      h('div', {
        style: {
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          background: `${accentColor}20`, border: `1px solid ${accentColor}50`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 800,
          letterSpacing: 0.5, color: accentColor,
        }
      }, layer.code),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontFamily: 'Syne', fontSize: 14, fontWeight: 700, color: T1, marginBottom: 3 } }, layer.name),
        h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: T3 } }, layer.sub)
      ),
      statusBadge(status),
      h('div', {
        style: {
          width: 20, height: 20, borderRadius: 4, background: BORDER,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: 8, transition: 'transform 0.2s', color: T3, fontSize: 10,
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }
      }, '▼')
    ),
    isExpanded && children && h('div', { style: { borderTop: `1px solid ${BORDER}`, padding: 20 } }, children)
  );
}

// ─── L1 · IPS Builder ────────────────────────────────────────────────────────
function IPSBuilder({ ips, onSave }) {
  const [form, setForm] = useState({ ...ips });
  const [saved, setSaved] = useState(false);

  function handle(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function submit(e) {
    e.preventDefault();
    if (sb) {
      await sb.from('portfolio_ips').upsert({ ...form, is_active: true });
    }
    onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const fieldStyle = {
    background: NAVY, border: `1px solid ${BORDER}`, borderRadius: 6,
    padding: '8px 12px', color: T1, fontFamily: 'JetBrains Mono', fontSize: 12,
    width: '100%', outline: 'none',
  };
  const labelStyle = { fontSize: 10, fontFamily: 'JetBrains Mono', color: T3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, display: 'block' };

  return h('form', { onSubmit: submit },
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
      // Risk tolerance
      h('div', null,
        h('label', { style: labelStyle }, `Risk Tolerance · ${form.riskTolerance} / 10`),
        h('input', {
          type: 'range', min: 1, max: 10, value: form.riskTolerance,
          onChange: e => handle('riskTolerance', Number(e.target.value)),
          style: { width: '100%', accentColor: TEAL },
        }),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T3, fontFamily: 'JetBrains Mono', marginTop: 2 } },
          h('span', null, 'Conservative'), h('span', null, 'Aggressive')
        )
      ),
      // Return target
      h('div', null,
        h('label', { style: labelStyle }, 'Annual Return Target (%)'),
        h('input', {
          type: 'number', step: '0.5', min: 0, max: 50, value: form.returnTarget,
          onChange: e => handle('returnTarget', Number(e.target.value)),
          style: fieldStyle,
        })
      ),
      // Time horizon
      h('div', null,
        h('label', { style: labelStyle }, 'Time Horizon (Years)'),
        h('input', {
          type: 'number', min: 1, max: 40, value: form.timeHorizon,
          onChange: e => handle('timeHorizon', Number(e.target.value)),
          style: fieldStyle,
        })
      ),
      // Benchmark
      h('div', null,
        h('label', { style: labelStyle }, 'Benchmark'),
        h('select', {
          value: form.benchmark,
          onChange: e => handle('benchmark', e.target.value),
          style: { ...fieldStyle, cursor: 'pointer' },
        },
          ['SPY', 'QQQ', 'IWM', 'AGG', 'VT', 'Custom'].map(b => h('option', { key: b, value: b }, b))
        )
      ),
      // Max concentration
      h('div', null,
        h('label', { style: labelStyle }, `Max Single Position (%) · ${form.maxConcentration}%`),
        h('input', {
          type: 'range', min: 5, max: 50, step: 5, value: form.maxConcentration,
          onChange: e => handle('maxConcentration', Number(e.target.value)),
          style: { width: '100%', accentColor: TEAL },
        }),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T3, fontFamily: 'JetBrains Mono', marginTop: 2 } },
          h('span', null, '5%'), h('span', null, '50%')
        )
      ),
      // ESG
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, paddingTop: 20 } },
        h('input', {
          type: 'checkbox', id: 'esg', checked: form.esgScreen,
          onChange: e => handle('esgScreen', e.target.checked),
          style: { accentColor: TEAL, width: 14, height: 14, cursor: 'pointer' },
        }),
        h('label', { htmlFor: 'esg', style: { fontSize: 11, fontFamily: 'JetBrains Mono', color: T2, cursor: 'pointer' } }, 'ESG Screen Active')
      )
    ),
    h('button', {
      type: 'submit',
      style: {
        padding: '10px 24px', background: saved ? 'rgba(16,185,129,0.15)' : 'rgba(0,200,224,0.12)',
        border: `1px solid ${saved ? GREEN : TEAL}`, borderRadius: 6,
        color: saved ? GREEN : TEAL, fontFamily: 'JetBrains Mono', fontWeight: 700,
        fontSize: 11, letterSpacing: 1.5, cursor: 'pointer',
      }
    }, saved ? '✓ IPS SAVED' : 'SAVE IPS')
  );
}

// ─── L2 · SAA / TAA Engine ───────────────────────────────────────────────────
function SAATAAEngine({ saaWeights, taaWeights, setTaaWeights }) {
  const classes = ['EQUITY', 'FIXED_INCOME', 'ALTERNATIVE', 'CASH'];
  const labels  = { EQUITY: 'Equity', FIXED_INCOME: 'Fixed Income', ALTERNATIVE: 'Alternatives', CASH: 'Cash' };
  const colors  = { EQUITY: TEAL, FIXED_INCOME: PURPLE, ALTERNATIVE: GOLD, CASH: GREEN };

  return h('div', null,
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 } },
      classes.map(c => {
        const saa = saaWeights[c] || 0;
        const taa = taaWeights[c] || 0;
        const diff = taa - saa;
        return h('div', {
          key: c,
          style: { background: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16 }
        },
          h('div', { style: { fontSize: 9, fontFamily: 'JetBrains Mono', color: T3, letterSpacing: 1, marginBottom: 8 } }, labels[c]),
          h('div', { style: { fontSize: 24, fontWeight: 700, fontFamily: 'Syne', color: colors[c], marginBottom: 4 } }, taa + '%'),
          h('div', { style: { fontSize: 10, fontFamily: 'JetBrains Mono', color: T3 } }, `SAA: ${saa}% · TAA: ${taa}%`),
          diff !== 0 && h('div', { style: { fontSize: 10, fontFamily: 'JetBrains Mono', color: diff > 0 ? GREEN : RED, marginTop: 4 } }, `${diff > 0 ? '+' : ''}${diff}% overlay`),
          // bar
          h('div', { style: { height: 3, background: BORDER, borderRadius: 2, marginTop: 8 } },
            h('div', { style: { height: '100%', width: taa + '%', background: colors[c], borderRadius: 2, maxWidth: '100%' } })
          )
        );
      })
    ),
    h('div', { style: { fontSize: 10, fontFamily: 'JetBrains Mono', color: T3, padding: '10px 14px', background: `rgba(0,200,224,0.05)`, border: `1px solid rgba(0,200,224,0.1)`, borderRadius: 6 } },
      '◆  Tactical overlay active · Equity overweight +5% vs SAA · Duration underweight −5%'
    )
  );
}

// ─── L3 · Factor Exposure ────────────────────────────────────────────────────
function FactorExposure({ factorScores }) {
  const factors = [
    { key: 'market',   label: 'Market Beta',    color: TEAL },
    { key: 'size',     label: 'Size (SMB)',      color: PURPLE },
    { key: 'value',    label: 'Value (HML)',     color: GOLD },
    { key: 'momentum', label: 'Momentum',        color: GREEN },
    { key: 'quality',  label: 'Quality',         color: TEAL },
    { key: 'lowVol',   label: 'Low Volatility',  color: PURPLE },
  ];

  return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
    factors.map(f => {
      const v = factorScores[f.key] || 0;
      const pct = Math.min(100, Math.abs(v) / 2 * 100);
      const pos = v >= 0;
      return h('div', {
        key: f.key,
        style: { background: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px' }
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } },
          h('span', { style: { fontSize: 10, fontFamily: 'JetBrains Mono', color: T3, letterSpacing: 1 } }, f.label),
          h('span', { style: { fontSize: 13, fontFamily: 'Syne', fontWeight: 700, color: pos ? GREEN : RED } }, (pos ? '+' : '') + v.toFixed(2))
        ),
        h('div', { style: { height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' } },
          h('div', { style: { height: '100%', width: pct + '%', background: pos ? GREEN : RED, borderRadius: 2 } })
        )
      );
    }),
    factorScores.activeShare != null && h('div', {
      style: { gridColumn: '1 / -1', background: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 20 }
    },
      h('div', null,
        h('div', { style: { fontSize: 9, fontFamily: 'JetBrains Mono', color: T3, letterSpacing: 1, marginBottom: 4 } }, 'Active Share'),
        h('div', { style: { fontSize: 26, fontFamily: 'Syne', fontWeight: 700, color: TEAL } }, factorScores.activeShare + '%')
      ),
      h('div', { style: { fontSize: 10, fontFamily: 'JetBrains Mono', color: T3 } }, `${factorScores.activeShare}% of holdings differ from SPY · Closet indexing threshold: 20%`)
    )
  );
}

// ─── L4 · Risk Budget ────────────────────────────────────────────────────────
function RiskBudgetConsole({ positions }) {
  const annVol    = '18.4%';
  const riskHHI   = '0.18';
  const divRatio  = '1.34';
  const trackErr  = '8.2%';

  // Build risk table from real position data where available
  const riskRows = positions.slice(0, 10).map((p, i) => {
    const w   = p.weight_equity_pct != null ? p.weight_equity_pct * 100 : (p.portfolio_weight || 0) * 100;
    const vol = p.annualised_vol != null ? p.annualised_vol * 100 : 20 + i * 3;
    const mrc = ((w / 100) * (vol / 100)).toFixed(3);
    const rc  = (parseFloat(mrc) / 0.184 * 100).toFixed(1);
    return { symbol: p.symbol, w: w.toFixed(1), vol: vol.toFixed(1), mrc, rc };
  });

  return h('div', null,
    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 } },
      metricTile('Portfolio Volatility (Ann.)', annVol, TEAL,   '90-day realised · benchmark: 16.1%'),
      metricTile('Diversification Ratio',       divRatio, PURPLE, 'Weighted avg vol / portfolio vol'),
      metricTile('Risk HHI (Concentration)',    riskHHI, RED,    '← Top 3 positions: 47% of risk'),
      metricTile('Tracking Error',              trackErr, GOLD,   'vs SPY · budget: 10%'),
    ),
    riskRows.length > 0 && h('div', { style: { background: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null,
          h('tr', { style: { borderBottom: `1px solid ${BORDER}` } },
            ['Ticker', 'Weight', 'Volatility', 'MRC', '% Risk Contribution', 'Risk Share'].map(col =>
              h('th', {
                key: col,
                style: {
                  padding: '10px 14px', textAlign: 'left', fontSize: 9,
                  fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: 1.2,
                  color: T3, textTransform: 'uppercase',
                }
              }, col)
            )
          )
        ),
        h('tbody', null,
          riskRows.map((r, i) => {
            const barPct = Math.min(100, parseFloat(r.rc) * 3);
            const barColor = parseFloat(r.rc) > 15 ? RED : parseFloat(r.rc) > 10 ? GOLD : GREEN;
            return h('tr', {
              key: r.symbol,
              style: { borderBottom: `1px solid ${BORDER}`, background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }
            },
              h('td', { style: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600, color: TEAL } }, r.symbol),
              h('td', { style: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 11, color: T2 } }, r.w + '%'),
              h('td', { style: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 11, color: T2 } }, r.vol + '%'),
              h('td', { style: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 11, color: T2 } }, r.mrc),
              h('td', { style: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 11, color: barColor } }, r.rc + '%'),
              h('td', { style: { padding: '10px 14px', width: 120 } },
                h('div', { style: { height: 4, background: BORDER, borderRadius: 2 } },
                  h('div', { style: { height: '100%', width: barPct + '%', background: barColor, borderRadius: 2, maxWidth: '100%' } })
                )
              )
            );
          })
        )
      )
    )
  );
}

// ─── L5-L7 · Locked placeholder ──────────────────────────────────────────────
function LockedLayer({ layer }) {
  const nextUnlock = {
    5: 'Complete Risk Budget Console to unlock Optimizer',
    6: 'Complete Optimizer to unlock Rebalancing',
    7: 'Complete Rebalancing to unlock Construction Report',
  };
  return h('div', {
    style: {
      textAlign: 'center', padding: '40px 24px',
      color: T3, fontFamily: 'JetBrains Mono', fontSize: 11,
    }
  },
    h('div', { style: { fontSize: 28, marginBottom: 12, opacity: 0.4 } }, '🔒'),
    h('div', { style: { letterSpacing: 1, marginBottom: 6 } }, layer.name.toUpperCase()),
    h('div', { style: { fontSize: 10, color: T3 } }, nextUnlock[layer.id] || 'Complete previous layers to unlock')
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function PortfolioConstruction() {
  const store = usePortfolioConstructionStore();
  const { activeLayer, completedLayers, setActiveLayer, saveIps, setSaaWeights, setTaaWeights, setFactorScores } = store;

  const [positions, setPositions] = useState([]);
  const [cmd, setCmd] = useState(null);
  const [expandedLayer, setExpandedLayer] = useState(activeLayer);

  useEffect(() => {
    loadView('vw_portfolio_home', []).then(setPositions);
    loadView('vw_command_centre', []).then(rows => {
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) setCmd(row);
    });
  }, []);

  function toggleLayer(id) {
    setExpandedLayer(prev => prev === id ? null : id);
    setActiveLayer(id);
  }

  function renderLayerContent(l) {
    const s = layerStatus(l.id, activeLayer, completedLayers);
    if (s === 'locked') return h(LockedLayer, { layer: l });
    switch (l.id) {
      case 1: return h(IPSBuilder, { ips: store.ips, onSave: saveIps });
      case 2: return h(SAATAAEngine, { saaWeights: store.saaWeights, taaWeights: store.taaWeights, setTaaWeights });
      case 3: return h(FactorExposure, { factorScores: store.factorScores });
      case 4: return h(RiskBudgetConsole, { positions });
      default: return h(LockedLayer, { layer: l });
    }
  }

  const completedCount = completedLayers.length;

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 24px', gap: 0, overflow: 'hidden' } },
    // Layer strip
    h(LayerStrip, { activeLayer, completedLayers, onSelect: toggleLayer }),

    // Main layout
    h('div', { style: { display: 'flex', gap: 20, flex: 1, overflow: 'hidden', minHeight: 0 } },
      // Left: layer cards
      h('div', { style: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 } },
        // Header
        h('div', { style: { marginBottom: 10 } },
          h('div', { style: { fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: 2, color: TEAL, textTransform: 'uppercase', marginBottom: 6 } }, '— Portfolio Construction Module'),
          h('div', { style: { fontFamily: 'Syne', fontSize: 26, fontWeight: 800, color: T1, marginBottom: 6 } }, 'Decision Engine'),
          h('div', { style: { fontSize: 11, fontFamily: 'JetBrains Mono', color: T3 } },
            'Integration → Ingestion → Analysis → Output → Allocation Decision  ·  ',
            h('span', { style: { color: TEAL } }, `${completedCount} of 7 layers complete`)
          )
        ),
        // Layer cards
        LAYERS.map(l => {
          const s = layerStatus(l.id, activeLayer, completedLayers);
          return h(LayerCard, {
            key: l.id,
            layer: l,
            status: s,
            isExpanded: expandedLayer === l.id,
            onToggle: () => toggleLayer(l.id),
          }, renderLayerContent(l));
        })
      ),
      // Right panel
      h(RightPanel, { ips: store.ips, positions, cmd })
    )
  );
}
