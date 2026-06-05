import React from 'react';
// ============================================================
// ATLAS Terminal — Fund Research v2
// ------------------------------------------------------------
// Seven-tab manager research surface.
// PR1: Overview + ODD Scorecard (data from Supabase).
// PR2: Style (RBSA) · PR3: Skill vs Luck · PR4: Attribution,
//      Holdings & Overlap, Fees & Alignment.
// React 18, no JSX, createElement pattern.
// ============================================================
import { sb } from './config.js';

var h = React.createElement;
var useState  = React.useState;
var useEffect = React.useEffect;
var useMemo   = React.useMemo;

// ── Design tokens (aligned with globals.css aliases) ─────────
var T = {
  bg:      '#0a0e13',
  card:    '#11171f',
  card2:   '#141b25',
  border:  'rgba(255,255,255,.08)',
  border2: 'rgba(255,255,255,.13)',
  cyan:    '#22d3ee',
  cyanDim: 'rgba(34,211,238,.13)',
  amber:   '#f5b53d',
  amberDim:'rgba(245,181,61,.13)',
  green:   '#41d18a',
  greenDim:'rgba(65,209,138,.13)',
  red:     '#f76d6d',
  redDim:  'rgba(247,109,109,.13)',
  text:    '#e7eef5',
  muted:   '#7e8b99',
  muted2:  '#5a6573',
  mono:    "'JetBrains Mono',monospace",
  body:    "'DM Sans',sans-serif",
  display: "'Syne',sans-serif",
};

// ── Colour helpers ────────────────────────────────────────────
function ragColor(rag) {
  if (rag === 'GREEN') return T.green;
  if (rag === 'AMBER') return T.amber;
  if (rag === 'RED')   return T.red;
  return T.muted;
}
function ragDim(rag) {
  if (rag === 'GREEN') return T.greenDim;
  if (rag === 'AMBER') return T.amberDim;
  if (rag === 'RED')   return T.redDim;
  return 'rgba(255,255,255,.05)';
}

// ── Small primitives ─────────────────────────────────────────

function Mono(p) {
  return h('span', { style: { fontFamily: T.mono, ...p.style } }, p.children);
}

function Pill(p) {
  var col = p.color || T.cyan;
  var bg  = p.bg    || T.cyanDim;
  return h('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontFamily: T.mono, fontSize: 10, padding: '3px 8px',
      borderRadius: 5, letterSpacing: '.05em',
      background: bg, color: col,
    }
  }, p.children);
}

function KpiCell(p) {
  var valColor = p.color || T.text;
  return h('div', {
    style: {
      border: '1px solid ' + T.border, borderRadius: 11,
      padding: '15px 16px', background: T.card2, flex: '1 1 0',
    }
  },
    h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase' } }, p.label),
    h('div', { style: { fontFamily: T.mono, fontSize: 25, fontWeight: 600, marginTop: 7, color: valColor } }, p.value || '—'),
    p.sub && h('div', { style: { fontSize: 10.5, color: T.muted2, marginTop: 5 } }, p.sub),
  );
}

function Card(p) {
  return h('div', {
    style: {
      border: '1px solid ' + T.border, borderRadius: 13,
      background: T.card, padding: 20, ...p.style,
    }
  }, p.children);
}

function CardHeader(p) {
  return h('div', {
    style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }
  },
    h('div', { style: { fontFamily: T.mono, fontSize: 11, letterSpacing: '.15em', color: T.muted, textTransform: 'uppercase' } },
      p.title,
      p.badge && h('span', {
        style: { fontFamily: T.mono, fontSize: 8.5, letterSpacing: '.1em', color: T.cyan,
          border: '1px solid rgba(34,211,238,.4)', borderRadius: 4, padding: '2px 5px', marginLeft: 8, verticalAlign: 'middle' }
      }, p.badge),
    ),
    p.meta && h('div', { style: { fontFamily: T.mono, fontSize: 10, color: T.muted2 } }, p.meta),
  );
}

// ── Cumulative return chart ───────────────────────────────────

function CumulativeChart(p) {
  var fundRets = p.fundReturns || [];
  var bmkRets  = p.bmkReturns  || [];

  var series = useMemo(function() {
    if (!fundRets.length || !bmkRets.length) return { fund: [], bmk: [] };
    var bmkMap = {};
    bmkRets.forEach(function(r) { bmkMap[r.period] = r.return_pct; });
    var fundCum = 100, bmkCum = 100;
    var fund = [], bmk = [];
    fundRets.sort(function(a, b) { return a.period < b.period ? -1 : 1; }).forEach(function(r) {
      fundCum *= (1 + r.return_pct / 100);
      bmkCum  *= (1 + (bmkMap[r.period] || 0) / 100);
      fund.push(fundCum - 100);
      bmk.push(bmkCum  - 100);
    });
    return { fund: fund, bmk: bmk };
  }, [fundRets, bmkRets]);

  var n = series.fund.length;
  if (!n) {
    return h('div', { style: { height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.muted2, fontFamily: T.mono, fontSize: 11 } }, 'Loading chart…');
  }

  // Scale to SVG 560×180 canvas
  var W = 560, H = 180, PAD = 10;
  var allVals = [...series.fund, ...series.bmk];
  var minV = Math.min(...allVals);
  var maxV = Math.max(...allVals);
  var range = Math.max(maxV - minV, 1);
  var zero  = H - PAD - ((0 - minV) / range) * (H - PAD * 2);

  function toPoints(arr) {
    return arr.map(function(v, i) {
      var x = PAD + (i / (arr.length - 1)) * (W - PAD * 2);
      var y = H - PAD - ((v - minV) / range) * (H - PAD * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  var lastFund = series.fund[n - 1];
  var lastBmk  = series.bmk[n - 1];

  return h('svg', { width: '100%', height: 180, viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none' },
    h('line', { x1: 0, y1: zero, x2: W, y2: zero, stroke: 'rgba(255,255,255,.06)' }),
    h('polyline', { points: toPoints(series.bmk), fill: 'none', stroke: T.muted2, strokeWidth: 2, strokeDasharray: '5 4' }),
    h('polyline', { points: toPoints(series.fund), fill: 'none', stroke: T.cyan,   strokeWidth: 2.5 }),
    h('text', { x: W - 6, y: 18, fill: T.cyan,   fontFamily: T.mono, fontSize: 10, textAnchor: 'end' },
      'Fund +' + lastFund.toFixed(0) + '%'),
    h('text', { x: W - 6, y: 34, fill: T.muted,  fontFamily: T.mono, fontSize: 10, textAnchor: 'end' },
      'Bmk +' + lastBmk.toFixed(0) + '%'),
  );
}

// ── Score ring SVG ────────────────────────────────────────────

function ScoreRing(p) {
  var score   = p.score || 0;
  var color   = ragColor(p.rag);
  var R = 48, CIRC = 2 * Math.PI * R;
  var filled  = (score / 100) * CIRC;
  var offset  = CIRC - filled;
  return h('div', { style: { position: 'relative', width: 112, height: 112, flexShrink: 0 } },
    h('svg', { width: 112, height: 112, viewBox: '0 0 112 112' },
      h('circle', { cx: 56, cy: 56, r: R, fill: 'none', stroke: 'rgba(255,255,255,.07)', strokeWidth: 9 }),
      h('circle', { cx: 56, cy: 56, r: R, fill: 'none', stroke: color, strokeWidth: 9,
        strokeLinecap: 'round', strokeDasharray: CIRC, strokeDashoffset: offset,
        transform: 'rotate(-90 56 56)', opacity: .9 }),
    ),
    h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center' } },
      h('b', { style: { fontFamily: T.mono, fontSize: 30, fontWeight: 600, color: color } }, score),
      h('span', { style: { fontSize: 9, fontFamily: T.mono, letterSpacing: '.14em', color: T.muted, marginTop: 2 } }, '/ 100'),
    ),
  );
}

// ── Mandate ribbon ────────────────────────────────────────────

function MandateRibbon(p) {
  var fund    = p.fund    || {};
  var metrics = p.metrics || {};
  var odd     = p.odd     || {};

  var reg28Color  = fund.reg28_compliant ? T.green : T.amber;
  var rankColor   = metrics.peer_rank_3y <= 37 ? T.green : metrics.peer_rank_3y <= 74 ? T.amber : T.red;
  var oddColor    = ragColor(odd.rating);

  var cells = [
    { label: 'Reg 28', value: fund.reg28_compliant ? 'Compliant' : 'Review', color: reg28Color,
      sub: 'EQ 72% / 75% · OFF 28% / 45%' },
    { label: 'ASISA category', value: fund.asisa_category || '—', color: T.text,
      sub: 'peer universe n=' + (fund.peer_count || '—') },
    { label: 'ZAR / Offshore', value: metrics.offshore_pct != null ? (100 - metrics.offshore_pct * 100).toFixed(0) + ' / ' + (metrics.offshore_pct * 100).toFixed(0) : '— / —',
      color: T.text, sub: 'offshore drifting ▲' },
    { label: '3-yr peer rank', value: metrics.peer_rank_3y ? 'Q' + Math.ceil(metrics.peer_rank_3y / (fund.peer_count / 4)) + ' · ' + metrics.peer_rank_3y + 'th' : '—',
      color: rankColor, sub: metrics.peer_rank_5y ? '5-yr: Q' + Math.ceil(metrics.peer_rank_5y / (fund.peer_count / 4)) + ' · ' + metrics.peer_rank_5y + 'st' : '' },
    { label: 'ODD rating', value: odd.rating ? odd.rating.charAt(0) + odd.rating.slice(1).toLowerCase() + ' · ' + (odd.composite_score || '—') : '—',
      color: oddColor, sub: odd.rating === 'AMBER' ? 'conditional pass' : odd.rating === 'GREEN' ? 'full pass' : 'requires remediation' },
  ];

  return h('div', {
    style: {
      display: 'flex', border: '1px solid ' + T.border, borderRadius: 11,
      background: 'linear-gradient(135deg,' + T.card2 + ',' + T.card + ')',
      overflow: 'hidden', marginBottom: 16,
    }
  }, cells.map(function(c, i) {
    return h('div', { key: i, style: {
      flex: 1, padding: '13px 18px',
      borderRight: i < cells.length - 1 ? '1px solid ' + T.border : 'none',
      display: 'flex', flexDirection: 'column', gap: 3,
    } },
      h('div', { style: { fontFamily: T.mono, fontSize: 9, letterSpacing: '.12em', color: T.muted2, textTransform: 'uppercase' } }, c.label),
      h('div', { style: { fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: c.color } }, c.value),
      h('div', { style: { fontSize: 9, color: T.muted, marginTop: 1 } }, c.sub),
    );
  }));
}

// ── Overview tab ──────────────────────────────────────────────

function OverviewTab(p) {
  var m = p.metrics || {};
  var f = p.fund    || {};

  var kpis = [
    { label: 'Sharpe (3y)',       value: m.sharpe,        color: m.sharpe >= 1 ? T.green : T.text,   sub: 'peer median 0.78' },
    { label: 'Sortino',           value: m.sortino,       color: m.sortino >= 1 ? T.green : T.text,  sub: 'downside-adj' },
    { label: 'Calmar',            value: m.calmar,        color: T.text,                              sub: 'return / max DD' },
    { label: 'Information Ratio', value: m.info_ratio,    color: m.info_ratio >= 0.5 ? T.green : T.text, sub: 'vs ASISA bmk' },
    { label: 'Max Drawdown',      value: m.max_dd != null ? (m.max_dd > 0 ? '-' : '') + Math.abs(m.max_dd).toFixed(1) + '%' : null,
      color: T.red, sub: m.dd_recovery_months ? 'recovered ' + m.dd_recovery_months + 'mo' : '' },
    { label: 'Up capture',        value: m.up_capture != null ? Math.round(m.up_capture * 100) + '%' : null,
      color: T.green, sub: 'of bmk up-months' },
    { label: 'Down capture',      value: m.down_capture != null ? Math.round(m.down_capture * 100) + '%' : null,
      color: m.down_capture < 0.9 ? T.green : T.amber, sub: 'convex profile' },
    { label: 'Ann. alpha',        value: m.alpha != null ? m.alpha.toFixed(1) + '%' : null,
      color: T.text, sub: m.alpha_tstat ? 't-stat ' + m.alpha_tstat.toFixed(1) : '' },
  ];

  return h('div', null,
    // KPI grid
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 } },
      kpis.map(function(k, i) {
        return h(KpiCell, { key: i, label: k.label,
          value: typeof k.value === 'number' ? k.value.toFixed(2) : (k.value || '—'),
          color: k.color, sub: k.sub });
      }),
    ),
    // Cumulative chart + verdict
    h('div', { style: { display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 14 } },
      h(Card, null,
        h(CardHeader, { title: 'Cumulative vs ASISA Benchmark', badge: 'NEW', meta: 'since inception, ZAR' }),
        h(CumulativeChart, { fundReturns: p.fundReturns, bmkReturns: p.bmkReturns }),
      ),
      h(Card, null,
        h(CardHeader, { title: 'Allocator Verdict' }),
        h('div', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 9,
            border: '1px solid ' + T.green, borderRadius: 8, padding: '7px 13px',
            background: 'rgba(65,209,138,.08)', marginBottom: 14,
          }
        },
          h('span', { style: { width: 9, height: 9, borderRadius: '50%', background: T.green, boxShadow: '0 0 9px ' + T.green, display: 'inline-block' } }),
          h('b', { style: { fontFamily: T.mono, fontSize: 12, color: T.green, letterSpacing: '.04em' } }, 'SHORTLIST — TIER 1'),
        ),
        h('p', { style: { fontSize: 12, color: T.muted, lineHeight: 1.55 } },
          'Genuine downside protection (', h('b', null, Math.round((m.down_capture||.78)*100) + '%'), ' down-capture) with near-full upside participation, statistically significant alpha, and top-quartile 3-yr peer rank. The reservation is operational, not performance: investability is gated on the ODD liquidity finding. Clear remediation path.',
        ),
      ),
    ),
  );
}

// ── ODD Scorecard tab ─────────────────────────────────────────

function OddTab(p) {
  var odd      = p.odd      || {};
  var scores   = p.scores   || [];
  var findings = p.findings || [];

  var openFindings = findings.filter(function(f) { return f.status === 'OPEN'; });

  return h('div', null,
    // Hero
    h('div', {
      style: {
        display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 26, alignItems: 'center',
        border: '1px solid ' + T.amber, borderRadius: 13,
        background: 'linear-gradient(135deg,' + T.amberDim + ',transparent 70%)',
        padding: '22px 26px', marginBottom: 14,
      }
    },
      h(ScoreRing, { score: odd.composite_score || 0, rag: odd.rating }),
      h('div', null,
        h('div', { style: { fontFamily: T.mono, fontSize: 11, letterSpacing: '.15em', color: T.muted, textTransform: 'uppercase', marginBottom: 8 } },
          'Composite Operational Due Diligence',
          h('span', { style: { fontFamily: T.mono, fontSize: 8.5, letterSpacing: '.1em', color: T.cyan,
            border: '1px solid rgba(34,211,238,.4)', borderRadius: 4, padding: '2px 5px', marginLeft: 8, verticalAlign: 'middle' } }, 'NEW'),
        ),
        h('div', {
          style: {
            display: 'inline-flex', alignItems: 'center', gap: 9,
            border: '1px solid ' + T.amber, borderRadius: 8, padding: '7px 13px',
            background: 'rgba(245,181,61,.08)',
          }
        },
          h('span', { style: { width: 9, height: 9, borderRadius: '50%', background: T.amber,
            boxShadow: '0 0 9px ' + T.amber, display: 'inline-block' } }),
          h('b', { style: { fontFamily: T.mono, fontSize: 12, color: T.amber, letterSpacing: '.04em' } },
            odd.rating + ' — ' + (odd.rating === 'AMBER' ? 'CONDITIONAL PASS' : odd.rating === 'GREEN' ? 'PASS' : 'FAIL')),
        ),
        h('p', { style: { fontSize: 12, color: T.muted, lineHeight: 1.55, marginTop: 12 } },
          'Investable subject to remediation of the liquidity-term mismatch and a documented CIO succession plan within 6 months.'),
      ),
    ),

    // Open findings
    openFindings.length > 0 && h(Card, { style: { marginBottom: 14 } },
      h(CardHeader, { title: '⬤  Open Findings' }),
      openFindings.map(function(f, i) {
        var isRed = f.severity === 'RED';
        return h('div', { key: i, style: {
          display: 'flex', alignItems: 'flex-start', gap: 11,
          padding: '10px 0',
          borderBottom: i < openFindings.length - 1 ? '1px solid ' + T.border : 'none',
        } },
          h('span', {
            style: {
              flexShrink: 0, fontFamily: T.mono, fontSize: 9, letterSpacing: '.1em',
              padding: '3px 7px', borderRadius: 4, marginTop: 1,
              background: isRed ? T.redDim : T.amberDim,
              color: isRed ? T.red : T.amber,
              border: '1px solid ' + (isRed ? 'rgba(247,109,109,.3)' : 'rgba(245,181,61,.3)'),
            }
          }, f.severity),
          h('div', null,
            h('b', { style: { fontSize: 13 } }, f.title),
            h('p', { style: { fontSize: 12, color: T.muted, marginTop: 2 } }, f.detail),
          ),
        );
      }),
    ),

    // Category grid
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 } },
      scores.map(function(s, i) {
        var col = ragColor(s.rag);
        var dim = ragDim(s.rag);
        return h('div', { key: i, style: {
          border: '1px solid ' + T.border,
          borderLeft: '3px solid ' + col,
          borderRadius: 11, background: T.card, padding: 15,
        } },
          h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 12 } },
              h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: col,
                boxShadow: '0 0 7px ' + col, display: 'inline-block' } }),
              s.name,
            ),
            h('span', { style: { fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: col } }, s.score),
          ),
          s.items && s.items.map(function(item, j) {
            return h('div', { key: j, style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 } },
              h('span', { style: { color: T.muted } }, item.label),
              h('span', { style: {
                fontFamily: T.mono, fontSize: 9,
                color: item.status === 'ok' ? T.green : item.status === 'warn' ? T.amber : T.red,
              } }, item.value),
            );
          }),
        );
      }),
    ),
  );
}

// ── Stub tab for future PRs ───────────────────────────────────

function StubTab(p) {
  return h('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 320, gap: 12,
    }
  },
    h('div', { style: { fontFamily: T.mono, fontSize: 13, color: T.muted2, letterSpacing: '.08em' } },
      p.label + ' — Coming in ' + p.pr),
    h('div', { style: { fontSize: 12, color: T.muted2 } }, p.description),
  );
}

// ── ODD category items lookup ─────────────────────────────────
// These static check-items supplement the score data from DB.
var CAT_ITEMS = {
  'Governance':     [{ label: 'Independent board', value: 'PASS',    status: 'ok' }, { label: 'Co-investment', value: 'PASS',    status: 'ok' }],
  'Compliance':     [{ label: 'FSCA license',      value: 'CURRENT', status: 'ok' }, { label: 'AML / KYC',    value: 'PASS',    status: 'ok' }],
  'Valuation':      [{ label: 'Admin pricing',     value: 'PASS',    status: 'ok' }, { label: 'L3 verification', value: 'QTRLY', status: 'warn' }],
  'Custody':        [{ label: 'Tier-1 PB',         value: 'PASS',    status: 'ok' }, { label: 'Segregation',  value: 'PASS',    status: 'ok' }],
  'Key-Person/BCP': [{ label: 'Succession',        value: 'ABSENT',  status: 'bad' }, { label: 'DR tested',   value: 'PASS',    status: 'ok' }],
  'Liquidity':      [{ label: 'A/L match',         value: 'MISMATCH',status: 'bad' }, { label: 'Gates',       value: 'UNTESTED',status: 'warn' }],
  'Fees':           [{ label: 'High-water mark',   value: 'PASS',    status: 'ok' }, { label: 'Hurdle',      value: 'NONE',    status: 'warn' }],
  'Operations':     [{ label: 'Independent admin', value: 'PASS',    status: 'ok' }, { label: 'Recon',       value: 'DAILY',   status: 'ok' }],
};

// ── Main component ────────────────────────────────────────────

function FundResearchV2() {
  var _tab   = useState('overview');
  var activeTab    = _tab[0];
  var setActiveTab = _tab[1];

  var _fund  = useState(null);
  var fund         = _fund[0];
  var setFund      = _fund[1];

  var _met   = useState(null);
  var metrics      = _met[0];
  var setMetrics   = _met[1];

  var _odd   = useState(null);
  var oddData      = _odd[0];
  var setOddData   = _odd[1];

  var _scores = useState([]);
  var oddScores    = _scores[0];
  var setOddScores = _scores[1];

  var _finds  = useState([]);
  var oddFindings  = _finds[0];
  var setOddFindings = _finds[1];

  var _fr    = useState([]);
  var fundReturns  = _fr[0];
  var setFundReturns = _fr[1];

  var _br    = useState([]);
  var bmkReturns   = _br[0];
  var setBmkReturns = _br[1];

  var _err   = useState(null);
  var error        = _err[0];
  var setError     = _err[1];

  var _load  = useState(true);
  var loading      = _load[0];
  var setLoading   = _load[1];

  useEffect(function() {
    if (!sb) { setLoading(false); return; }
    (async function() {
      try {
        // Fund identity (first fund in table for PR1)
        var fr = await sb.from('funds').select('*').limit(1).single();
        if (fr.error) throw fr.error;
        var fundRow = fr.data;
        setFund(fundRow);

        // Fund metrics (latest)
        var mr = await sb.from('fund_metrics')
          .select('*').eq('fund_id', fundRow.id).order('as_of', { ascending: false }).limit(1).single();
        if (!mr.error) setMetrics(mr.data);

        // Monthly returns (all)
        var rr = await sb.from('fund_returns')
          .select('period,return_pct').eq('fund_id', fundRow.id).order('period');
        if (!rr.error) setFundReturns(rr.data || []);

        // Benchmark returns
        if (fundRow.benchmark_id) {
          var br = await sb.from('benchmark_returns')
            .select('period,return_pct').eq('benchmark_id', fundRow.benchmark_id).order('period');
          if (!br.error) setBmkReturns(br.data || []);
        }

        // ODD assessment (latest cycle)
        var oa = await sb.from('odd_assessments')
          .select('*').eq('fund_id', fundRow.id).order('cycle', { ascending: false }).limit(1).single();
        if (oa.error) throw oa.error;
        var asmt = oa.data;
        setOddData(asmt);

        // ODD scores joined with category names
        var os = await sb.from('odd_scores')
          .select('score,rag,odd_categories(name,weight)')
          .eq('assessment_id', asmt.id);
        if (!os.error) {
          var enriched = (os.data || []).map(function(s) {
            return {
              name:  s.odd_categories ? s.odd_categories.name  : '—',
              weight:s.odd_categories ? s.odd_categories.weight : 1,
              score: s.score,
              rag:   s.rag,
              items: CAT_ITEMS[s.odd_categories ? s.odd_categories.name : ''] || [],
            };
          });
          setOddScores(enriched);
        }

        // ODD findings
        var of_ = await sb.from('odd_findings')
          .select('severity,title,detail,status').eq('assessment_id', asmt.id);
        if (!of_.error) setOddFindings(of_.data || []);

      } catch(e) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  var TABS = [
    { id: 'overview',  label: 'Overview' },
    { id: 'odd',       label: 'ODD Scorecard' },
    { id: 'style',     label: 'Style (RBSA)' },
    { id: 'skill',     label: 'Skill vs Luck' },
    { id: 'attr',      label: 'Attribution' },
    { id: 'holdings',  label: 'Holdings & Overlap' },
    { id: 'fees',      label: 'Fees & Alignment' },
  ];

  // ── Render ──────────────────────────────────────────────────
  return h('div', { style: { padding: '24px 28px', background: T.bg, minHeight: '100vh', fontFamily: T.body, color: T.text, lineHeight: 1.5 } },
    h('div', { style: { maxWidth: 1200, margin: '0 auto' } },

      // Top bar
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid ' + T.border } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 13 } },
          h('div', { style: { fontFamily: T.display, fontWeight: 800, fontSize: 18, letterSpacing: '.18em' } },
            'ATLAS', h('span', { style: { color: T.cyan } }, '.'),
          ),
          h('div', { style: { fontFamily: T.mono, fontSize: 10, letterSpacing: '.22em', color: T.muted,
            border: '1px solid ' + T.border2, borderRadius: 5, padding: '5px 9px', textTransform: 'uppercase' } },
            'Fund Research',
          ),
        ),
        fund && h('div', { style: { textAlign: 'right' } },
          h('div', { style: { fontFamily: T.display, fontWeight: 700, fontSize: 16 } }, fund.name),
          h('div', { style: { fontSize: 11, color: T.muted, fontFamily: T.mono } },
            [fund.location, fund.asisa_category,
             fund.aum ? 'AUM R' + (fund.aum / 1e9).toFixed(1) + 'bn' : null,
             fund.inception ? 'Inception ' + fund.inception.slice(0, 4) : null,
            ].filter(Boolean).join(' · '),
          ),
        ),
      ),

      // Loading / error states
      loading && h('div', { style: { padding: '60px 0', textAlign: 'center', fontFamily: T.mono,
        fontSize: 11, color: T.muted2, letterSpacing: '.12em' } }, 'LOADING FUND DATA…'),
      !loading && error && h('div', { style: { padding: '20px 0', fontFamily: T.mono, fontSize: 11,
        color: T.red } }, 'Error: ' + error),

      // Mandate ribbon
      !loading && fund && h(MandateRibbon, { fund: fund, metrics: metrics || {}, odd: oddData || {} }),

      // Tab bar
      !loading && h('div', { style: { display: 'flex', gap: 4, marginBottom: 18,
        borderBottom: '1px solid ' + T.border, flexWrap: 'wrap' } },
        TABS.map(function(t) {
          var active = t.id === activeTab;
          return h('button', {
            key: t.id,
            onClick: function() { setActiveTab(t.id); },
            style: {
              fontFamily: T.mono, fontSize: 11.5, letterSpacing: '.04em',
              color: active ? T.cyan : T.muted,
              background: 'none', border: 'none',
              borderBottom: active ? '2px solid ' + T.cyan : '2px solid transparent',
              padding: '11px 14px', cursor: 'pointer',
              textTransform: 'uppercase', transition: '.15s',
            }
          }, t.label);
        }),
      ),

      // Panel content
      !loading && fund && h('div', null,
        activeTab === 'overview' && h(OverviewTab, {
          fund: fund, metrics: metrics || {},
          fundReturns: fundReturns, bmkReturns: bmkReturns,
        }),
        activeTab === 'odd' && h(OddTab, {
          odd: oddData || {}, scores: oddScores, findings: oddFindings,
        }),
        activeTab === 'style' && h(StubTab, {
          label: 'Style (RBSA)',
          pr: 'PR2',
          description: 'Sharpe returns-based style analysis + rolling 36m drift chart.',
        }),
        activeTab === 'skill' && h(StubTab, {
          label: 'Skill vs Luck',
          pr: 'PR3',
          description: 'Rolling alpha/t-stat, Bayesian-shrunk alpha via Claude API, quartile consistency.',
        }),
        activeTab === 'attr' && h(StubTab, {
          label: 'Attribution',
          pr: 'PR4',
          description: 'Brinson-Fachler allocation / selection / interaction by sector.',
        }),
        activeTab === 'holdings' && h(StubTab, {
          label: 'Holdings & Overlap',
          pr: 'PR4',
          description: 'Active share, pairwise overlap heatmap, hidden-concentration alert.',
        }),
        activeTab === 'fees' && h(StubTab, {
          label: 'Fees & Alignment',
          pr: 'PR4',
          description: 'Beta vs alpha decomposition, fee-on-alpha ratio, cost vs peer universe.',
        }),
      ),

      // Footer
      h('div', { style: { marginTop: 20, paddingTop: 14, borderTop: '1px solid ' + T.border,
        display: 'flex', justifyContent: 'space-between',
        fontFamily: T.mono, fontSize: 10, color: T.muted2, letterSpacing: '.08em' } },
        h('div', null, 'ATLAS TERMINAL · FUND RESEARCH v2 · ILLUSTRATIVE / FICTIONAL MANAGER'),
        h('div', null, 'ODD MODEL · RETURNS ANALYSIS · BRINSON · RBSA · BAYESIAN α'),
      ),
    ),
  );
}

export { FundResearchV2 };
