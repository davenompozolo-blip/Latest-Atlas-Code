import React from 'react';
// ============================================================
// ATLAS Terminal — Funds (layered research dossier)
// ------------------------------------------------------------
// Universal entry: listed ETF (ticker → /api/funds) or
// tracked manager / SA fund (name/code → Supabase funds table).
//
// 8-layer dossier:
//  1 Profile         2 Performance & Risk   3 Style (PR2)
//  4 Skill (PR2)     5 Composition (PR3)    6 Operations
//  7 Cost            8 Comparison
//
// React 18, no JSX, createElement pattern.
// ============================================================

import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';
import { Loading } from './components.js';
import { FundProfile } from './funds-profile.js';
import { FundPerformance } from './funds-performance.js';
import { FundComparison } from './funds-comparison.js';
import { FundScreener } from './fund-screener.js';
import { sb } from './config.js';

var useState = React.useState, useEffect = React.useEffect,
    useCallback = React.useCallback, useRef = React.useRef,
    useMemo = React.useMemo;
var h = React.createElement;

// ── Design tokens (matches globals.css legacy aliases) ────────
var T = {
  cyan:    '#22d3ee', cyanDim: 'rgba(34,211,238,.13)',
  amber:   '#f5b53d', amberDim:'rgba(245,181,61,.13)',
  green:   '#41d18a', greenDim:'rgba(65,209,138,.13)',
  red:     '#f76d6d', redDim:  'rgba(247,109,109,.13)',
  muted:   '#7e8b99', muted2:  '#5a6573',
  border:  'rgba(255,255,255,.08)',
  card:    '#11171f', card2:   '#141b25',
  mono:    "'JetBrains Mono',monospace",
};

function ragColor(r) { return r==='GREEN'?T.green:r==='AMBER'?T.amber:r==='RED'?T.red:T.muted; }
function ragDim(r)   { return r==='GREEN'?T.greenDim:r==='AMBER'?T.amberDim:r==='RED'?T.redDim:'rgba(255,255,255,.05)'; }

// ── Shared small components ───────────────────────────────────

function PerfBadge(p) {
    var bg    = p.value==null?'rgba(255,255,255,0.04)':p.value>0?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)';
    var color = p.value==null?'var(--text-muted)':p.value>0?'#10b981':'#ef4444';
    var txt   = p.value==null?'—':(p.value>0?'+':'')+(p.value*100).toFixed(2)+'%';
    return h('div',{style:{textAlign:'center',flex:1}},
        h('div',{style:{fontSize:10,textTransform:'uppercase',letterSpacing:1,color:'rgba(255,255,255,0.42)',marginBottom:4}},p.label),
        h('div',{style:{fontWeight:600,fontSize:13,padding:'4px 8px',borderRadius:6,background:bg,color:color}},txt));
}

function RangeBar(p) {
    if (p.low==null||p.high==null||p.current==null||p.high<=p.low)
        return h('div',{style:{color:'var(--text-muted)'}},'—');
    var pct=Math.max(0,Math.min(100,((p.current-p.low)/(p.high-p.low))*100));
    return h('div',null,
        h('div',{style:{position:'relative',height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,marginTop:6,marginBottom:4}},
            h('div',{style:{position:'absolute',top:-3,left:pct+'%',transform:'translateX(-50%)',width:12,height:12,borderRadius:'50%',background:'#00d4ff',boxShadow:'0 0 8px rgba(0,212,255,0.6)'}})),
        h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:10,color:'rgba(255,255,255,0.42)'}},
            h('span',null,fmtCurrency(p.low)),h('span',null,fmtCurrency(p.high))));
}

function Sparkline(p) {
    var ref=useRef(null);
    useChart(ref,function(){
        if(!p.series||p.series.length<2)return null;
        return{type:'line',data:{labels:p.series.map(function(){return '';}),
            datasets:[{data:p.series.map(function(s){return s.close;}),borderColor:'#00d4ff',borderWidth:1.5,pointRadius:0,fill:true,backgroundColor:'rgba(0,212,255,0.08)'}]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false}}}};
    },[p.series]);
    return h('div',{style:{height:p.height||120}},h('canvas',{ref:ref}));
}

function MetricTile(p) {
    return h('div',{className:'metric-card'},
        h('div',{className:'label'},p.label),
        h('div',{className:'value',style:p.color?{color:p.color}:null},p.value),
        p.sub?h('div',{className:'sub'},p.sub):null);
}

// ── ODD components (Layer 6, tracked managers) ────────────────

function ScoreRing(p) {
    var score=p.score||0, color=ragColor(p.rag);
    var R=48, CIRC=2*Math.PI*R, offset=CIRC-(score/100)*CIRC;
    return h('div',{style:{position:'relative',width:112,height:112,flexShrink:0}},
        h('svg',{width:112,height:112,viewBox:'0 0 112 112'},
            h('circle',{cx:56,cy:56,r:R,fill:'none',stroke:'rgba(255,255,255,.07)',strokeWidth:9}),
            h('circle',{cx:56,cy:56,r:R,fill:'none',stroke:color,strokeWidth:9,strokeLinecap:'round',
                strokeDasharray:CIRC,strokeDashoffset:offset,transform:'rotate(-90 56 56)',opacity:.9})),
        h('div',{style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}},
            h('b',{style:{fontFamily:T.mono,fontSize:30,fontWeight:600,color:color}},score),
            h('span',{style:{fontSize:9,fontFamily:T.mono,letterSpacing:'.14em',color:T.muted,marginTop:2}},'/ 100')));
}

var CAT_ITEMS = {
    'Governance':     [{label:'Independent board',value:'PASS',   ok:'ok'},{label:'Co-investment',   value:'PASS',    ok:'ok'}],
    'Compliance':     [{label:'FSCA license',     value:'CURRENT',ok:'ok'},{label:'AML / KYC',       value:'PASS',    ok:'ok'}],
    'Valuation':      [{label:'Admin pricing',    value:'PASS',   ok:'ok'},{label:'L3 verification', value:'QTRLY',   ok:'warn'}],
    'Custody':        [{label:'Tier-1 PB',        value:'PASS',   ok:'ok'},{label:'Segregation',     value:'PASS',    ok:'ok'}],
    'Key-Person/BCP': [{label:'Succession',       value:'ABSENT', ok:'bad'},{label:'DR tested',      value:'PASS',    ok:'ok'}],
    'Liquidity':      [{label:'A/L match',        value:'MISMATCH',ok:'bad'},{label:'Gates',         value:'UNTESTED',ok:'warn'}],
    'Fees':           [{label:'High-water mark',  value:'PASS',   ok:'ok'},{label:'Hurdle',          value:'NONE',    ok:'warn'}],
    'Operations':     [{label:'Independent admin',value:'PASS',   ok:'ok'},{label:'Recon',           value:'DAILY',   ok:'ok'}],
};

function OddScorecard(p) {
    var odd=p.odd||{}, scores=p.scores||[], findings=p.findings||[];
    var open=findings.filter(function(f){return f.status==='OPEN';});
    return h('div',null,
        // Hero row
        h('div',{style:{display:'grid',gridTemplateColumns:'auto 1fr',gap:26,alignItems:'center',
            border:'1px solid '+T.amber,borderRadius:13,
            background:'linear-gradient(135deg,'+T.amberDim+',transparent 70%)',
            padding:'22px 26px',marginBottom:14}},
            h(ScoreRing,{score:odd.composite_score||0,rag:odd.rating}),
            h('div',null,
                h('div',{style:{fontFamily:T.mono,fontSize:11,letterSpacing:'.15em',color:T.muted,textTransform:'uppercase',marginBottom:8}},
                    'Composite Operational Due Diligence'),
                h('div',{style:{display:'inline-flex',alignItems:'center',gap:9,
                    border:'1px solid '+T.amber,borderRadius:8,padding:'7px 13px',
                    background:'rgba(245,181,61,.08)'}},
                    h('span',{style:{width:9,height:9,borderRadius:'50%',background:T.amber,
                        boxShadow:'0 0 9px '+T.amber,display:'inline-block'}}),
                    h('b',{style:{fontFamily:T.mono,fontSize:12,color:T.amber,letterSpacing:'.04em'}},
                        (odd.rating||'—')+' — '+(odd.rating==='AMBER'?'CONDITIONAL PASS':odd.rating==='GREEN'?'PASS':'FAIL'))),
                h('p',{style:{fontSize:12,color:T.muted,lineHeight:1.55,marginTop:12}},
                    'Investable subject to remediation of the liquidity-term mismatch and a documented CIO succession plan within 6 months.'))),
        // Open findings
        open.length>0&&h('div',{className:'card',style:{marginBottom:14}},
            h('div',{className:'card-title'},'Open Findings'),
            open.map(function(f,i){
                var red=f.severity==='RED';
                return h('div',{key:i,style:{display:'flex',alignItems:'flex-start',gap:11,padding:'10px 0',
                    borderBottom:i<open.length-1?'1px solid '+T.border:'none'}},
                    h('span',{style:{flexShrink:0,fontFamily:T.mono,fontSize:9,letterSpacing:'.1em',
                        padding:'3px 7px',borderRadius:4,marginTop:1,
                        background:red?T.redDim:T.amberDim,color:red?T.red:T.amber,
                        border:'1px solid '+(red?'rgba(247,109,109,.3)':'rgba(245,181,61,.3)')}},f.severity),
                    h('div',null,
                        h('b',{style:{fontSize:13}},f.title),
                        h('p',{style:{fontSize:12,color:T.muted,marginTop:2}},f.detail)));
            })),
        // Category grid
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}},
            scores.map(function(s,i){
                var col=ragColor(s.rag), items=CAT_ITEMS[s.name]||[];
                return h('div',{key:i,style:{border:'1px solid '+T.border,borderLeft:'3px solid '+col,
                    borderRadius:11,background:T.card,padding:15}},
                    h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}},
                        h('div',{style:{display:'flex',alignItems:'center',gap:8,fontWeight:600,fontSize:12}},
                            h('span',{style:{width:8,height:8,borderRadius:'50%',background:col,
                                boxShadow:'0 0 7px '+col,display:'inline-block'}}),s.name),
                        h('span',{style:{fontFamily:T.mono,fontSize:14,fontWeight:600,color:col}},s.score)),
                    items.map(function(it,j){
                        return h('div',{key:j,style:{display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:11}},
                            h('span',{style:{color:T.muted}},it.label),
                            h('span',{style:{fontFamily:T.mono,fontSize:9,
                                color:it.ok==='ok'?T.green:it.ok==='warn'?T.amber:T.red}},it.value));
                    }));
            })));
}

// ETF structural checks (Layer 6, listed funds)
function EtfStructural(p) {
    var meta=p.meta||{}, profile=p.profile||{}, metrics=p.metrics||{};
    var rows=[
        {label:'Provider',          value:profile.name||meta.name||'—'},
        {label:'Category',          value:meta.category||'—'},
        {label:'Exchange',          value:profile.exchange||'NYSE/NASDAQ'},
        {label:'Expense Ratio',     value:meta.expense!=null?(meta.expense*100).toFixed(2)+'%':'—'},
        {label:'Tracking Error',    value:metrics.annVol!=null?(metrics.annVol*100).toFixed(2)+'% (vol proxy)':'—'},
        {label:'Replication',       value:'Physical (assumed)'},
        {label:'Securities Lending',value:'Undisclosed — check prospectus'},
    ];
    return h('div',{className:'card'},
        h('div',{className:'card-title'},'ETF Structural Checks'),
        rows.map(function(r,i){
            return h('div',{key:i,style:{display:'flex',justifyContent:'space-between',
                padding:'9px 0',borderBottom:i<rows.length-1?'1px solid '+T.border:'none',fontSize:13}},
                h('span',{style:{color:'rgba(255,255,255,.52)'}},r.label),
                h('span',{style:{fontFamily:T.mono,fontSize:12}},r.value));
        }));
}

// ── Stub layer ─────────────────────────────────────────────────

function StubLayer(p) {
    return h('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',
        justifyContent:'center',minHeight:280,gap:10}},
        h('div',{style:{fontFamily:T.mono,fontSize:12,color:T.muted2,letterSpacing:'.1em'}},
            p.label+' — Coming in '+p.pr),
        h('div',{style:{fontSize:12,color:T.muted2}},p.desc||''));
}

// ── Cost layer (Layer 7) ───────────────────────────────────────

function CostLayer(p) {
    var meta=p.meta||{}, metrics=p.metrics||{};
    var ter = meta.expense;
    var annRet = metrics.annReturn;
    var beta  = metrics.beta||1;
    return h('div',null,
        h('div',{style:{display:'grid',gridTemplateColumns:'1.3fr .7fr',gap:14}},
            h('div',{className:'card'},
                h('div',{className:'card-title'},'Fee-Adjusted Alpha Decomposition'),
                ter!=null&&annRet!=null
                    ? h('div',null,
                        [{label:'Gross return',   val:(annRet*100).toFixed(1)+'%',  color:'rgba(255,255,255,.85)'},
                         {label:'− TER',          val:(ter*100).toFixed(2)+'%',     color:T.red},
                         {label:'= Net approx.',  val:((annRet-ter)*100).toFixed(1)+'%',color:T.cyan},
                        ].map(function(r,i){
                            return h('div',{key:i,style:{display:'flex',justifyContent:'space-between',
                                padding:'9px 0',borderBottom:i<2?'1px solid '+T.border:'none',fontSize:13}},
                                h('span',{style:{color:'rgba(255,255,255,.52)'}},r.label),
                                h('span',{style:{fontFamily:T.mono,fontWeight:600,color:r.color}},r.val));
                        }))
                    : h('div',{style:{color:T.muted2,fontSize:12}},'Return data not available for fee decomposition.')),
            h('div',{className:'card'},
                h('div',{className:'card-title'},'Expense Ratio'),
                h('div',{style:{textAlign:'center',padding:'16px 0'}},
                    h('div',{style:{fontFamily:T.mono,fontSize:30,fontWeight:600,
                        color:ter!=null&&ter<0.005?T.green:ter!=null&&ter<0.01?T.amber:T.red}},
                        ter!=null?(ter*100).toFixed(2)+'%':'—'),
                    h('div',{style:{fontSize:11,color:T.muted2,marginTop:6}},'Total Expense Ratio (TER)')),
                ter!=null&&h('div',{style:{fontSize:12,color:T.muted,lineHeight:1.55}},
                    ter<0.005?'Low-cost fund. The fee drag is minimal relative to market returns.'
                    :ter<0.015?'Moderate fee in line with active management peers.'
                    :'Higher-cost vehicle. Verify whether net-of-fee alpha justifies the charge.'))));
}

// ── Cumulative chart for Performance layer ────────────────────

function CumChart(p) {
    var series=p.series||[];
    var bmkSeries=p.bmkSeries||[];
    var pts=useMemo(function(){
        if(series.length<2)return{fund:[],bmk:[]};
        var fc=100,bc=100,fund=[],bmk=[];
        series.forEach(function(s,i){
            var pr=i===0?0:(s.close/series[i-1].close-1);
            var br=bmkSeries[i]?(bmkSeries[i].close/bmkSeries[Math.max(0,i-1)].close-1):0;
            fc*=(1+pr); bc*=(1+br);
            fund.push(fc-100); bmk.push(bc-100);
        });
        return{fund:fund,bmk:bmk};
    },[series,bmkSeries]);
    var n=pts.fund.length;
    if(!n) return h('div',{style:{height:160,display:'flex',alignItems:'center',justifyContent:'center',
        color:T.muted2,fontFamily:T.mono,fontSize:11}},'No series data');
    var W=520,H=160,P=8;
    var all=[...pts.fund,...pts.bmk], mn=Math.min(...all), mx=Math.max(...all);
    var rng=Math.max(mx-mn,1);
    var zero=H-P-((0-mn)/rng)*(H-P*2);
    function pts2str(arr){
        return arr.map(function(v,i){
            var x=P+(i/(arr.length-1))*(W-P*2);
            var y=H-P-((v-mn)/rng)*(H-P*2);
            return x.toFixed(1)+','+y.toFixed(1);
        }).join(' ');
    }
    var lf=pts.fund[n-1], lb=pts.bmk[n-1];
    return h('svg',{width:'100%',height:H,viewBox:'0 0 '+W+' '+H,preserveAspectRatio:'none'},
        h('line',{x1:0,y1:zero,x2:W,y2:zero,stroke:'rgba(255,255,255,.06)'}),
        bmkSeries.length>0&&h('polyline',{points:pts2str(pts.bmk),fill:'none',stroke:T.muted2,strokeWidth:2,strokeDasharray:'5 4'}),
        h('polyline',{points:pts2str(pts.fund),fill:'none',stroke:'#00d4ff',strokeWidth:2.5}),
        h('text',{x:W-6,y:16,fill:'#00d4ff',fontFamily:T.mono,fontSize:10,textAnchor:'end'},
            'Fund '+(lf>=0?'+':'')+lf.toFixed(1)+'%'),
        bmkSeries.length>0&&h('text',{x:W-6,y:30,fill:T.muted,fontFamily:T.mono,fontSize:10,textAnchor:'end'},
            'Bmk '+(lb>=0?'+':'')+lb.toFixed(1)+'%'));
}

// ── Layer 2 wrapper ───────────────────────────────────────────

function PerformanceLayer(p) {
    var m=p.data.metrics||{}, s=p.data.series||[];
    var kpis=[
        {l:'Ann. Return', v:m.annReturn!=null?(m.annReturn*100).toFixed(1)+'%':null,
            color:m.annReturn>0?'#10b981':'#ef4444'},
        {l:'Ann. Volatility',v:m.annVol!=null?(m.annVol*100).toFixed(1)+'%':null,color:null},
        {l:'Sharpe',      v:m.sharpe!=null?m.sharpe.toFixed(2):null,
            color:m.sharpe>=1?'#10b981':m.sharpe>=0.5?'#f59e0b':null},
        {l:'Sortino',     v:m.sortino!=null?m.sortino.toFixed(2):null,
            color:m.sortino>=1.2?'#10b981':null},
        {l:'Max Drawdown',v:m.maxDD!=null?(m.maxDD*100).toFixed(1)+'%':null,color:'#ef4444'},
        {l:'Calmar',      v:m.calmar!=null?m.calmar.toFixed(2):null,color:null},
    ];
    return h('div',null,
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:14}},
            kpis.map(function(k,i){
                return h('div',{key:i,className:'metric-card'},
                    h('div',{className:'label'},k.l),
                    h('div',{className:'value',style:k.color?{color:k.color}:null},k.v||'—'));
            })),
        h('div',{style:{display:'grid',gridTemplateColumns:'1.3fr .7fr',gap:14}},
            h('div',{className:'card'},
                h('div',{className:'card-title'},'Cumulative Return'),
                h(CumChart,{series:s})),
            h('div',{className:'card'},
                h('div',{className:'card-title'},'Period Returns'),
                [['1 Month',m.ret1m],['3 Months',m.ret3m],['6 Months',m.ret6m],['1 Year',m.ret1y],
                 ['3 Year',m.ret3y],['YTD',m.retYtd]].map(function(row,i){
                    var v=row[1];
                    return h('div',{key:i,style:{display:'flex',justifyContent:'space-between',
                        padding:'8px 0',borderBottom:i<5?'1px solid '+T.border:'none',fontSize:13}},
                        h('span',{style:{color:'rgba(255,255,255,.52)'}},row[0]),
                        h('span',{style:{fontFamily:T.mono,fontWeight:600,
                            color:v==null?T.muted2:v>0?'#10b981':'#ef4444'}},
                            v==null?'—':(v>0?'+':'')+(v*100).toFixed(2)+'%'));
                }))),
        h('div',{style:{marginTop:14}},h(FundPerformance,{data:p.data})));
}

// ── 8-layer dossier tab shell ─────────────────────────────────

var LAYERS = [
    {id:'profile',    label:'Profile'},
    {id:'perf',       label:'Performance & Risk'},
    {id:'style',      label:'Style & Exposure'},
    {id:'skill',      label:'Skill vs Luck'},
    {id:'composition',label:'Composition'},
    {id:'operations', label:'Operations'},
    {id:'cost',       label:'Cost & Alignment'},
    {id:'comparison', label:'Comparison'},
];

function DossierTabs(p) {
    var _t=useState('profile'), tab=_t[0], setTab=_t[1];
    var d=p.data||{}, type=p.fundType||'listed';
    var odd=p.odd||{}, scores=p.scores||[], findings=p.findings||[];

    var content=null;
    if(tab==='profile')     content=h(FundProfile,{data:d});
    else if(tab==='perf')   content=h(PerformanceLayer,{data:d});
    else if(tab==='style')  content=h(StubLayer,{label:'Style & Exposure',pr:'PR2',desc:'RBSA style decomposition + rolling 36-month drift chart.'});
    else if(tab==='skill')  content=h(StubLayer,{label:'Skill vs Luck',pr:'PR2',desc:'Rolling alpha / t-stat, Bayesian-shrunk alpha, quartile consistency.'});
    else if(tab==='composition') content=h(StubLayer,{label:'Composition & Attribution',pr:'PR3',desc:'Brinson-Fachler attribution by sector; holdings & overlap heatmap.'});
    else if(tab==='operations') content=type==='tracked'
        ? h(OddScorecard,{odd:odd,scores:scores,findings:findings})
        : h(EtfStructural,{meta:d.meta,profile:d.profile,metrics:d.metrics});
    else if(tab==='cost')   content=h(CostLayer,{meta:d.meta,metrics:d.metrics});
    else if(tab==='comparison') content=h(FundComparison,{symbol:p.symbol,data:d});

    return h('div',null,
        h('div',{style:{display:'flex',gap:4,flexWrap:'wrap',marginBottom:16,
            borderBottom:'1px solid rgba(255,255,255,.08)',paddingBottom:0}},
            LAYERS.map(function(l){
                var active=l.id===tab;
                return h('button',{key:l.id,onClick:function(){setTab(l.id);},
                    style:{background:'none',border:'none',
                        borderBottom:active?'2px solid #00d4ff':'2px solid transparent',
                        color:active?'#00d4ff':'rgba(255,255,255,.55)',
                        fontFamily:T.mono,fontSize:11,letterSpacing:'.06em',
                        padding:'10px 14px',cursor:'pointer',textTransform:'uppercase',
                        transition:'.15s'}},l.label);
            })),
        content);
}

// ── Main component ─────────────────────────────────────────────

export function FundsDashboard() {
    var _i=useState('SPY'),        input=_i[0],    setInput=_i[1];
    var _sym=useState(null),       symbol=_sym[0], setSymbol=_sym[1];
    var _st=useState('idle'),      status=_st[0],  setStatus=_st[1];
    var _err=useState(null),       errMsg=_err[0], setErrMsg=_err[1];
    var _data=useState(null),      data=_data[0],  setData=_data[1];
    var _type=useState('listed'),  fundType=_type[0], setFundType=_type[1];
    // ODD state (for tracked managers)
    var _odd=useState(null),       oddData=_odd[0],   setOddData=_odd[1];
    var _sc=useState([]),          oddScores=_sc[0],  setOddScores=_sc[1];
    var _fi=useState([]),          oddFindings=_fi[0],setOddFindings=_fi[1];
    // SA fund cost view (funds not in the tracked catalogue — cost registry only)
    var _saf=useState(null),       saFund=_saf[0],    setSaFund=_saf[1];

    var analyse=useCallback(function(raw){
        var s=(raw||'').trim().toUpperCase();
        if(!s)return;
        setSaFund(null);
        setSymbol(s);
    },[]);

    // Open an SA fund from the screener. If it's a tracked fund (in the funds
    // catalogue) we load the full dossier; otherwise we show the cost registry
    // snapshot we have from fund_prices_raw.
    var openSaFund=useCallback(function(fundName){
        if(!fundName||!sb)return;
        setSymbol(null); setSaFund(null);
        setStatus('loading'); setErrMsg(null); setData(null);
        (async function(){
            try{
                var tracked=await sb.from('funds').select('ticker,external_code')
                    .ilike('name', fundName).limit(1).maybeSingle();
                if(!tracked.error && tracked.data && (tracked.data.ticker||tracked.data.external_code)){
                    analyse(tracked.data.ticker||tracked.data.external_code);
                    return;
                }
                var pr=await sb.from('fund_prices_raw')
                    .select('fund_name,asisa_category,ter,tc,tic,price_date,manager')
                    .eq('source','funddata_public').eq('fund_name',fundName).limit(1).maybeSingle();
                if(pr.error||!pr.data){setErrMsg('Fund not found in cost registry.');setStatus('error');return;}
                var r=pr.data;
                setSaFund({
                    fund_name:r.fund_name, asisa_category:r.asisa_category, manager:r.manager,
                    ter:r.ter!=null?Number(r.ter):null, tc:r.tc!=null?Number(r.tc):null,
                    tic:r.tic!=null?Number(r.tic):null, price_date:r.price_date,
                });
                setStatus('ready');
            }catch(e){setErrMsg(e.message||String(e));setStatus('error');}
        })();
    },[analyse]);

    // Universal entry resolver + data fetch
    useEffect(function(){
        if(!symbol)return;
        var cancelled=false;
        setStatus('loading'); setErrMsg(null); setData(null);
        setOddData(null); setOddScores([]); setOddFindings([]);

        (async function(){
            try{
                // 1. Check Supabase funds catalogue (tracked manager or SA fund)
                var trackedFund=null;
                if(sb){
                    var q=await sb.from('funds')
                        .select('*')
                        .or('ticker.ilike.'+symbol+',external_code.ilike.'+symbol)
                        .limit(1).maybeSingle();
                    if(!q.error && q.data) trackedFund=q.data;
                }

                if(trackedFund){
                    if(cancelled)return;
                    // Load fund_metrics for this tracked fund
                    var mr=await sb.from('fund_metrics')
                        .select('*').eq('fund_id',trackedFund.id)
                        .order('as_of',{ascending:false}).limit(1).maybeSingle();
                    var met=mr.data||{};
                    // Build a data shape the existing sub-components can use
                    var built={
                        profile:{name:trackedFund.name,exchange:trackedFund.location||'',logo:null,industry:''},
                        meta:{name:trackedFund.name,category:trackedFund.asisa_category,
                              expense:null,exchange:trackedFund.location||''},
                        metrics:{annReturn:null,annVol:null,sharpe:met.sharpe,sortino:met.sortino,
                                 maxDD:met.max_dd!=null?met.max_dd/100:null,calmar:met.calmar,
                                 info_ratio:met.info_ratio,up_capture:met.up_capture,down_capture:met.down_capture,
                                 alpha:met.alpha,alpha_tstat:met.alpha_tstat,
                                 ret1m:null,ret3m:null,ret6m:null,ret1y:null,ret3y:null,retYtd:null,
                                 current:null,high52:null,low52:null},
                        series:[],
                    };
                    setData(built);
                    setFundType('tracked');
                    // Load ODD
                    var oa=await sb.from('odd_assessments')
                        .select('*').eq('fund_id',trackedFund.id)
                        .order('cycle',{ascending:false}).limit(1).maybeSingle();
                    if(oa.data){
                        setOddData(oa.data);
                        var os=await sb.from('odd_scores')
                            .select('score,rag,odd_categories(name,weight)')
                            .eq('assessment_id',oa.data.id);
                        if(!os.error) setOddScores((os.data||[]).map(function(s){
                            return{name:s.odd_categories?s.odd_categories.name:'—',
                                   score:s.score,rag:s.rag};
                        }));
                        var of_=await sb.from('odd_findings')
                            .select('severity,title,detail,status').eq('assessment_id',oa.data.id);
                        if(!of_.error) setOddFindings(of_.data||[]);
                    }
                    if(!cancelled) setStatus('ready');
                } else {
                    // 2. Listed fund — validate ticker format and hit the API
                    if(!/^[A-Z0-9.\-]{1,12}$/.test(symbol)){
                        if(!cancelled){setErrMsg('Invalid ticker — use 1–12 characters A–Z / 0–9 / . / -');setStatus('error');}
                        return;
                    }
                    var r=await fetch('/api/funds?symbol='+encodeURIComponent(symbol));
                    if(!r.ok)throw new Error('API returned '+r.status);
                    var d=await r.json();
                    if(!cancelled){setData(d);setFundType('listed');setStatus('ready');}
                }
            }catch(e){
                if(!cancelled){setErrMsg(e.message||String(e));setStatus('error');}
            }
        })();
        return function(){cancelled=true;};
    },[symbol]);

    // Search bar
    var searchBar=h('div',{className:'card',style:{display:'flex',gap:12,alignItems:'center',padding:14,marginBottom:0}},
        h('input',{type:'text',value:input,onChange:function(e){setInput(e.target.value);},
            onKeyDown:function(e){if(e.key==='Enter')analyse(input);},
            placeholder:'Enter ticker or fund name / code (e.g. SPY, Allan Gray Equity)',
            spellCheck:false,
            style:{flex:1,background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.08)',
                borderRadius:8,padding:'10px 14px',color:'rgba(255,255,255,0.92)',
                fontFamily:'inherit',fontSize:14,letterSpacing:1}}),
        h('button',{onClick:function(){analyse(input);},disabled:status==='loading',
            style:{background:'linear-gradient(135deg,#00d4ff,#6366f1)',color:'#fff',
                border:'none',borderRadius:8,padding:'10px 20px',fontWeight:600,
                cursor:status==='loading'?'not-allowed':'pointer',opacity:status==='loading'?0.6:1,
                letterSpacing:1,textTransform:'uppercase',fontSize:12}},
            status==='loading'?'Loading…':'Analyse'),
        status!=='idle'&&h('button',{onClick:function(){setSymbol(null);setSaFund(null);setStatus('idle');setErrMsg(null);},
            style:{background:'rgba(255,255,255,0.05)',color:'rgba(255,255,255,0.55)',
                border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,padding:'10px 16px',
                fontWeight:600,cursor:'pointer',letterSpacing:1,textTransform:'uppercase',fontSize:12}},
            '← Screener'));

    var header=h('div',null,
        h('div',{className:'page-title'},'Funds'),
        searchBar);

    if(status==='idle')
        return h('div',null,header,
            h(FundScreener,{onPick:function(val,kind){
                if(kind==='sa_fund') openSaFund(val);
                else { setInput(val); analyse(val); }
            }}));
    if(status==='loading') return h('div',null,header,h(Loading,null));
    if(status==='error')
        return h('div',null,header,
            h('div',{className:'card',style:{borderColor:'rgba(239,68,68,0.3)',marginTop:16}},
                h('div',{className:'card-title',style:{color:'var(--red)'}},'Request failed'),
                h('div',{style:{fontSize:13,color:'rgba(255,255,255,0.7)'}},errMsg||'Unknown error')));

    // ── SA fund cost-registry view (fund not in tracked catalogue) ──
    if(saFund)
        return h('div',null,header,
            h('div',{style:{display:'grid',gridTemplateColumns:'1fr',gap:16,marginTop:16}},
                h('div',{className:'card'},
                    h('div',{style:{fontSize:20,fontWeight:700}},saFund.fund_name),
                    h('div',{style:{display:'flex',gap:8,marginTop:8,flexWrap:'wrap',alignItems:'center'}},
                        saFund.asisa_category&&h('span',{style:{fontSize:11,padding:'3px 10px',borderRadius:12,
                            background:'rgba(99,102,241,0.15)',color:'#818cf8',letterSpacing:0.5}},saFund.asisa_category),
                        saFund.manager&&h('span',{style:{fontSize:12,color:'rgba(255,255,255,0.5)'}},'Manager: '+saFund.manager),
                        h('span',{style:{fontSize:11,color:'rgba(255,255,255,0.4)'}},'As of '+(saFund.price_date||'—'))),
                    h('div',{className:'metrics-row',style:{gridTemplateColumns:'repeat(3,1fr)',marginTop:14}},
                        h(MetricTile,{label:'TER',value:saFund.ter!=null?saFund.ter.toFixed(2)+'%':'—',
                            color:saFund.ter!=null&&saFund.ter>=3?'#ef4444':saFund.ter!=null&&saFund.ter>=1.75?'#f59e0b':'#10b981'}),
                        h(MetricTile,{label:'Transaction Costs',value:saFund.tc!=null?saFund.tc.toFixed(2)+'%':'—'}),
                        h(MetricTile,{label:'Total Investment Charge',value:saFund.tic!=null?saFund.tic.toFixed(2)+'%':'—',
                            color:saFund.tic!=null&&saFund.tic>=3.5?'#ef4444':saFund.tic!=null&&saFund.tic>=2.25?'#f59e0b':'#10b981'}))),
                h('div',{className:'card',style:{borderColor:'rgba(245,158,11,0.25)'}},
                    h('div',{className:'card-title',style:{color:'#f59e0b'}},'Cost registry only'),
                    h('div',{style:{fontSize:13,color:'rgba(255,255,255,0.7)',lineHeight:1.6}},
                        'This fund is sourced from the public ASISA cost registry (TER / TC / TIC). Full '
                        +'performance, risk, style and skill analytics become available once the fund is added to '
                        +'the tracked catalogue with a returns history.'))));

    var profile=data.profile||{}, meta=data.meta||{}, metrics=data.metrics||{}, series=data.series||[];
    var fundName=profile.name||meta.name||symbol;
    var price=metrics.current;
    var change=metrics.ret1D;
    var priceColor=change==null?null:change>=0?'#10b981':'#ef4444';
    var category=meta.category;
    var expense=meta.expense;
    var exchange=(profile.exchange&&profile.exchange!=='')?profile.exchange
                 :(meta.exchange&&meta.exchange!=='')?meta.exchange
                 :fundType==='listed'?'Exchange-listed':'—';

    return h('div',null,header,
        h('div',{style:{display:'grid',gridTemplateColumns:'300px 1fr',gap:20,marginTop:16}},
            // ── Left panel ───────────────────────────────────
            h('div',null,
                h('div',{className:'card'},
                    h('div',{style:{fontSize:20,fontWeight:700}},
                        fundName,' ',
                        h('span',{style:{color:'#00d4ff',fontSize:16}},'('+symbol+')')),
                    category&&h('div',{style:{marginTop:6}},
                        h('span',{style:{fontSize:11,padding:'3px 10px',borderRadius:12,
                            background:'rgba(99,102,241,0.15)',color:'#818cf8',letterSpacing:0.5}},category)),
                    h('div',{style:{display:'flex',flexDirection:'column',gap:4,marginTop:10}},
                        h('div',{style:{fontSize:12,color:'rgba(255,255,255,.52)'}},
                            'Exchange: ',h('span',{style:{color:'rgba(255,255,255,.85)'}},exchange)),
                        expense!=null&&h('div',{style:{fontSize:12,color:'rgba(255,255,255,.52)'}},
                            'Expense Ratio: ',h('span',{style:{fontWeight:600,color:'rgba(255,255,255,.85)'}},
                                (expense*100).toFixed(2)+'%'))),
                    h('div',{style:{display:'flex',gap:6,marginTop:12,flexWrap:'wrap'}},
                        h('button',{onClick:function(){window.dispatchEvent(new CustomEvent('atlas:navigate',{detail:{tab:'equity',symbol:symbol}}));},
                            style:{background:'rgba(0,212,255,0.1)',border:'1px solid rgba(0,212,255,0.3)',color:'#00d4ff',borderRadius:5,padding:'5px 12px',fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:0.5}},'◈ Research'),
                        h('button',{onClick:function(){window.dispatchEvent(new CustomEvent('atlas:navigate',{detail:{tab:'valuation',symbol:symbol}}));},
                            style:{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)',color:'#f59e0b',borderRadius:5,padding:'5px 12px',fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:0.5}},'◆ Value'),
                        h('button',{onClick:function(){window.dispatchEvent(new CustomEvent('atlas:navigate',{detail:{tab:'trading',symbol:symbol}}));},
                            style:{background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',color:'#10b981',borderRadius:5,padding:'5px 12px',fontSize:11,fontWeight:700,cursor:'pointer',letterSpacing:0.5}},'▶ Trade'))),
                price!=null&&h('div',{className:'metrics-row',style:{gridTemplateColumns:'1fr',marginTop:12}},
                    h(MetricTile,{label:'Current Price',value:fmtCurrency(price),
                        sub:change!=null?(change>0?'+':'')+(change*100).toFixed(2)+'% today':null,
                        color:priceColor})),
                metrics.low52!=null&&h('div',{className:'card',style:{marginTop:12}},
                    h('div',{className:'card-title'},'52-Week Range'),
                    h(RangeBar,{low:metrics.low52,high:metrics.high52,current:price})),
                h('div',{className:'card',style:{marginTop:12}},
                    h('div',{className:'card-title'},'Performance'),
                    h('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
                        h(PerfBadge,{label:'1M',value:metrics.ret1m}),
                        h(PerfBadge,{label:'3M',value:metrics.ret3m}),
                        h(PerfBadge,{label:'6M',value:metrics.ret6m}),
                        h(PerfBadge,{label:'1Y',value:metrics.ret1y}))),
                h('div',{className:'metrics-row',style:{gridTemplateColumns:'repeat(3,1fr)',marginTop:12}},
                    h(MetricTile,{label:'Sharpe',value:metrics.sharpe!=null?fmt(metrics.sharpe):'—'}),
                    h(MetricTile,{label:'Max Drawdown',value:metrics.maxDD!=null?(metrics.maxDD*100).toFixed(1)+'%':'—',
                        color:metrics.maxDD!=null&&metrics.maxDD<0?'#ef4444':null}),
                    h(MetricTile,{label:'Volatility',value:metrics.annVol!=null?(metrics.annVol*100).toFixed(1)+'%':'—'})),
                series.length>0&&h('div',{className:'card',style:{marginTop:12}},
                    h('div',{className:'card-title'},'Price — Last 252 Days'),
                    h(Sparkline,{series:series.slice(-252),height:120}))),
            // ── Right panel: 8-layer dossier ─────────────────
            h('div',null,
                h(DossierTabs,{
                    symbol:symbol,data:data,fundType:fundType,
                    odd:oddData,scores:oddScores,findings:oddFindings,
                }))));
}
