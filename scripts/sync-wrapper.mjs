// ============================================
// ATLAS Sync Wrapper
// Wraps Alpaca sync operations with:
//   - Sync logging to atlas_sync_log
//   - Retry logic with exponential backoff
//   - Post-sync validation
//   - Status updates to atlas_sync_status
//   - Critical failures written to atlas_memory
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALPACA_BASE = process.env.ALPACA_API_URL || 'https://paper-api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';
const ALPACA_HEADERS = {
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
  'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
  'Content-Type': 'application/json'
};

const PORTFOLIO_ID = 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8';
const PORTFOLIO_BASE_VALUE = 100000;

// ── Retry Logic ──────────────────────────────────────────

async function withRetry(fn, label, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // 2s, 4s, 8s cap at 10s
      console.log(`[RETRY] ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}. Waiting ${delay}ms...`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Sync Log Helpers ─────────────────────────────────────

async function createSyncLog(syncType, metadata = {}) {
  const { data, error } = await supabase
    .from('atlas_sync_log')
    .insert({
      sync_type: syncType,
      status: 'started',
      metadata: { trigger: 'github-actions', ...metadata }
    })
    .select()
    .single();

  if (error) {
    console.error('[SYNC LOG] Failed to create log entry:', error.message);
    return null;
  }
  return data;
}

async function updateSyncLog(logId, updates) {
  if (!logId) return;
  const { error } = await supabase
    .from('atlas_sync_log')
    .update(updates)
    .eq('id', logId);

  if (error) console.error('[SYNC LOG] Failed to update:', error.message);
}

async function completeSyncLog(logId, { records_fetched, records_upserted, records_skipped, startTime, validationPassed, validationErrors }) {
  if (!logId) return;
  await updateSyncLog(logId, {
    status: validationPassed === false ? 'partial' : 'completed',
    records_fetched: records_fetched || 0,
    records_upserted: records_upserted || 0,
    records_skipped: records_skipped || 0,
    validation_passed: validationPassed,
    validation_errors: validationErrors || [],
    duration_ms: Date.now() - startTime,
    completed_at: new Date().toISOString()
  });
}

async function failSyncLog(logId, error, startTime, retryCount = 0) {
  if (!logId) return;
  await updateSyncLog(logId, {
    status: 'failed',
    error_message: error.message,
    error_stack: error.stack?.substring(0, 2000),
    retry_count: retryCount,
    duration_ms: Date.now() - startTime,
    completed_at: new Date().toISOString()
  });
}

// ── Status Table Update ──────────────────────────────────

async function updateSyncStatus(syncType, status, { duration_ms, records, validationPassed, errorMessage } = {}) {
  const updates = {
    last_sync_at: new Date().toISOString(),
    last_sync_status: status,
    last_sync_type: syncType,
    updated_at: new Date().toISOString()
  };

  if (duration_ms) updates.last_sync_duration_ms = duration_ms;
  if (records !== undefined) updates.last_sync_records = records;
  if (validationPassed !== undefined) updates.last_validation_passed = validationPassed;

  if (status === 'failed') {
    const { data: current } = await supabase
      .from('atlas_sync_status')
      .select('consecutive_failures')
      .eq('id', 1)
      .single();

    updates.consecutive_failures = (current?.consecutive_failures || 0) + 1;
    updates.last_failure_message = errorMessage;
  } else if (status === 'completed') {
    updates.consecutive_failures = 0;
    updates.last_failure_message = null;
  }

  await supabase.from('atlas_sync_status').update(updates).eq('id', 1);
}

// ── Memory System Integration ────────────────────────────

async function writeFailureToMemory(syncType, error, consecutiveFailures) {
  const key = `sync-failure-${syncType}`;
  const content = `Sync "${syncType}" has failed ${consecutiveFailures} consecutive time(s). Last error: ${error.message}. Timestamp: ${new Date().toISOString()}`;
  const priority = consecutiveFailures >= 3 ? 2 : 1;

  await supabase
    .from('atlas_memory')
    .upsert({
      category: 'bug',
      key,
      content,
      tags: ['sync', 'failure', syncType, 'automated'],
      priority,
      source: 'auto-sync'
    }, { onConflict: 'category,key' });
}

async function clearFailureFromMemory(syncType) {
  await supabase
    .from('atlas_memory')
    .delete()
    .eq('category', 'bug')
    .eq('key', `sync-failure-${syncType}`);
}

async function writeSyncContextToMemory(stats) {
  const content = `Last successful sync: ${new Date().toISOString()}. ` +
    `Positions: ${stats.positions}, Transactions: ${stats.transactions}, ` +
    `Snapshots: ${stats.snapshots}, Equity curve rows: ${stats.equityCurve || 0}, ` +
    `Price history bars: ${stats.priceHistory || 0}. ` +
    `All validations ${stats.allPassed ? 'passed' : 'had warnings'}.`;

  await supabase
    .from('atlas_memory')
    .upsert({
      category: 'context',
      key: 'last-sync-summary',
      content,
      tags: ['sync', 'status', 'automated'],
      priority: 1,
      source: 'auto-sync'
    }, { onConflict: 'category,key' });
}

// ── Alpaca API Calls ─────────────────────────────────────

async function fetchAlpacaPositions() {
  const res = await fetch(`${ALPACA_BASE}/v2/positions`, { headers: ALPACA_HEADERS });
  if (!res.ok) throw new Error(`Alpaca positions API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAlpacaAccount() {
  const res = await fetch(`${ALPACA_BASE}/v2/account`, { headers: ALPACA_HEADERS });
  if (!res.ok) throw new Error(`Alpaca account API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAlpacaActivities(activityType = 'FILL', after = null) {
  let url = `${ALPACA_BASE}/v2/account/activities/${activityType}?direction=desc&page_size=100`;
  if (after) url += `&after=${after}`;
  const res = await fetch(url, { headers: ALPACA_HEADERS });
  if (!res.ok) throw new Error(`Alpaca activities API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Sync Operations ──────────────────────────────────────

async function syncPositions() {
  const syncType = 'positions';
  const startTime = Date.now();
  const logEntry = await createSyncLog(syncType);

  try {
    const positions = await withRetry(() => fetchAlpacaPositions(), 'positions');
    const today = new Date().toISOString().slice(0, 10);

    const records = positions.map(p => ({
      portfolio_id: PORTFOLIO_ID,
      asset_id: p.asset_id,           // UUID from Alpaca — matches assets.id
      quantity: parseFloat(p.qty),
      side: p.side,
      market_value: parseFloat(p.market_value),
      average_cost: parseFloat(p.avg_entry_price),
      as_of_date: today,
      updated_at: new Date().toISOString()
    }));

    // Clear today's positions and replace with fresh Alpaca snapshot
    const { error: deleteError } = await supabase
      .from('positions')
      .delete()
      .eq('portfolio_id', PORTFOLIO_ID)
      .eq('as_of_date', today);
    if (deleteError) throw new Error(`Delete positions failed: ${deleteError.message}`);

    let upserted = 0;
    if (records.length > 0) {
      const { error: insertError } = await supabase.from('positions').insert(records);
      if (insertError) throw new Error(`Insert positions failed: ${insertError.message}`);
      upserted = records.length;
    }

    await completeSyncLog(logEntry?.id, {
      records_fetched: positions.length,
      records_upserted: upserted,
      records_skipped: 0,
      startTime,
      validationPassed: true,
      validationErrors: []
    });

    return { fetched: positions.length, upserted };

  } catch (err) {
    await failSyncLog(logEntry?.id, err, startTime, 3);
    throw err;
  }
}

async function syncAccountSnapshot() {
  const syncType = 'account_snapshot';
  const startTime = Date.now();
  const logEntry = await createSyncLog(syncType);

  try {
    const account = await withRetry(() => fetchAlpacaAccount(), 'account');

    const snapshot = {
      portfolio_id: PORTFOLIO_ID,
      equity: parseFloat(account.equity),
      cash: parseFloat(account.cash),
      buying_power: parseFloat(account.buying_power),
      portfolio_value: parseFloat(account.portfolio_value),
      long_market_value: parseFloat(account.long_market_value),
      short_market_value: parseFloat(account.short_market_value),
      as_of: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('account_snapshots')
      .insert(snapshot);

    if (error) throw new Error(`Upsert snapshot failed: ${error.message}`);

    await completeSyncLog(logEntry?.id, {
      records_fetched: 1,
      records_upserted: 1,
      records_skipped: 0,
      startTime,
      validationPassed: true,
      validationErrors: []
    });

    return { equity: snapshot.equity, cash: snapshot.cash };

  } catch (err) {
    await failSyncLog(logEntry?.id, err, startTime, 3);
    throw err;
  }
}

async function syncTransactions() {
  const syncType = 'transactions';
  const startTime = Date.now();
  const logEntry = await createSyncLog(syncType);

  try {
    const { data: latest } = await supabase
      .from('transactions')
      .select('transaction_date')
      .order('transaction_date', { ascending: false })
      .limit(1)
      .single();

    const after = latest?.transaction_date || null;
    const activities = await withRetry(() => fetchAlpacaActivities('FILL', after), 'transactions');

    if (activities.length === 0) {
      await completeSyncLog(logEntry?.id, {
        records_fetched: 0,
        records_upserted: 0,
        records_skipped: 0,
        startTime,
        validationPassed: true,
        validationErrors: []
      });
      return { fetched: 0, upserted: 0 };
    }

    const records = activities.map(a => ({
      activity_id: a.id,
      symbol: a.symbol,
      side: a.side,
      qty: parseFloat(a.qty),
      price: parseFloat(a.price),
      transaction_date: a.transaction_time || a.date,
      order_id: a.order_id,
      type: a.type,
      leaves_qty: parseFloat(a.leaves_qty || 0),
      cum_qty: parseFloat(a.cum_qty || a.qty),
      updated_at: new Date().toISOString()
    }));

    const { data: upserted, error } = await supabase
      .from('transactions')
      .upsert(records, { onConflict: 'activity_id' })
      .select();

    if (error) throw new Error(`Upsert transactions failed: ${error.message}`);

    const skipped = activities.length - (upserted?.length || 0);

    await completeSyncLog(logEntry?.id, {
      records_fetched: activities.length,
      records_upserted: upserted?.length || 0,
      records_skipped: skipped,
      startTime,
      validationPassed: true,
      validationErrors: []
    });

    return { fetched: activities.length, upserted: upserted?.length || 0 };

  } catch (err) {
    await failSyncLog(logEntry?.id, err, startTime, 3);
    throw err;
  }
}

// ── Equity Curve Sync ────────────────────────────────────
// Translates daily account_snapshots into portfolio_equity_curve rows.
// Takes the last equity value per calendar day, fills any gap since the
// last existing curve row.

async function syncEquityCurve() {
  const syncType = 'equity_curve';
  const startTime = Date.now();
  const logEntry = await createSyncLog(syncType);

  try {
    // Latest date already in the curve
    const { data: latest } = await supabase
      .from('portfolio_equity_curve')
      .select('ts')
      .eq('portfolio_id', PORTFOLIO_ID)
      .eq('timeframe', '1D')
      .order('ts', { ascending: false })
      .limit(1)
      .single();

    const afterTs = latest ? latest.ts : '2000-01-01T00:00:00Z';

    // Grab all snapshots after that timestamp
    const { data: snapshots, error: snapErr } = await supabase
      .from('account_snapshots')
      .select('as_of, equity')
      .gt('as_of', afterTs)
      .order('as_of', { ascending: true });

    if (snapErr) throw new Error('account_snapshots: ' + snapErr.message);

    if (!snapshots || snapshots.length === 0) {
      console.log('  — Equity curve up to date');
      await completeSyncLog(logEntry?.id, { records_fetched: 0, records_upserted: 0, records_skipped: 0, startTime, validationPassed: true, validationErrors: [] });
      return { upserted: 0 };
    }

    // Group by calendar date, last snapshot per day wins
    const byDate = {};
    snapshots.forEach(s => {
      const d = s.as_of.slice(0, 10);
      byDate[d] = parseFloat(s.equity);
    });

    // Only write days that are fully closed (not today, since today's equity
    // changes during the session — next run will capture it)
    const today = new Date().toISOString().slice(0, 10);
    const rows = Object.entries(byDate)
      .filter(([date]) => date < today)
      .map(([date, equity]) => ({
        portfolio_id: PORTFOLIO_ID,
        ts: date + 'T21:00:00+00:00', // 4 PM ET close
        equity,
        profit_loss: equity - PORTFOLIO_BASE_VALUE,
        profit_loss_pct: (equity - PORTFOLIO_BASE_VALUE) / PORTFOLIO_BASE_VALUE,
        base_value: PORTFOLIO_BASE_VALUE,
        timeframe: '1D',
      }));

    if (rows.length === 0) {
      console.log('  — No completed days to add');
      await completeSyncLog(logEntry?.id, { records_fetched: snapshots.length, records_upserted: 0, records_skipped: 0, startTime, validationPassed: true, validationErrors: [] });
      return { upserted: 0 };
    }

    // Delete any existing rows for these dates then insert fresh
    for (const row of rows) {
      const dateStart = row.ts.slice(0, 10) + 'T00:00:00+00:00';
      const dateEnd   = row.ts.slice(0, 10) + 'T23:59:59+00:00';
      await supabase
        .from('portfolio_equity_curve')
        .delete()
        .eq('portfolio_id', PORTFOLIO_ID)
        .eq('timeframe', '1D')
        .gte('ts', dateStart)
        .lte('ts', dateEnd);
    }

    const { error: insertErr } = await supabase
      .from('portfolio_equity_curve')
      .insert(rows);
    if (insertErr) throw new Error('equity_curve insert: ' + insertErr.message);

    await completeSyncLog(logEntry?.id, { records_fetched: snapshots.length, records_upserted: rows.length, records_skipped: 0, startTime, validationPassed: true, validationErrors: [] });
    return { upserted: rows.length };

  } catch (err) {
    await failSyncLog(logEntry?.id, err, startTime, 0);
    throw err;
  }
}

// ── Price History Sync ───────────────────────────────────
// Fetches daily OHLCV bars from Alpaca for all assets in the DB
// since the last recorded date, upserts into price_history.

async function fetchAlpacaBars(symbols, startDate, endDate) {
  let allBars = {};
  let pageToken = null;

  do {
    let url = `${ALPACA_DATA_URL}/v2/stocks/bars?symbols=${symbols.join(',')}&timeframe=1Day&start=${startDate}&end=${endDate}&limit=1000&adjustment=all&feed=iex`;
    if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url, { headers: ALPACA_HEADERS });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Alpaca bars ${res.status}: ${body}`);
    }
    const json = await res.json();

    for (const [sym, bars] of Object.entries(json.bars || {})) {
      if (!allBars[sym]) allBars[sym] = [];
      allBars[sym].push(...bars);
    }
    pageToken = json.next_page_token || null;
  } while (pageToken);

  return allBars;
}

async function syncPriceHistory() {
  const syncType = 'price_history';
  const startTime = Date.now();
  const logEntry = await createSyncLog(syncType);

  try {
    const { data: assets, error: assetErr } = await supabase
      .from('assets')
      .select('id, symbol');
    if (assetErr) throw new Error('assets: ' + assetErr.message);
    if (!assets || assets.length === 0) {
      console.log('  — No assets in DB');
      await completeSyncLog(logEntry?.id, { records_fetched: 0, records_upserted: 0, records_skipped: 0, startTime, validationPassed: true, validationErrors: [] });
      return { upserted: 0 };
    }

    // Fetch from day after last known row to yesterday (last closed session)
    const { data: latestRow } = await supabase
      .from('price_history')
      .select('price_date')
      .order('price_date', { ascending: false })
      .limit(1)
      .single();

    const lastKnown = latestRow?.price_date || '2021-01-01';
    const startDt = new Date(lastKnown);
    startDt.setDate(startDt.getDate() + 1);
    const startStr = startDt.toISOString().slice(0, 10);

    const endDt = new Date();
    endDt.setDate(endDt.getDate() - 1); // yesterday — last fully closed session
    const endStr = endDt.toISOString().slice(0, 10);

    if (startStr > endStr) {
      console.log(`  — Price history current (${lastKnown})`);
      await completeSyncLog(logEntry?.id, { records_fetched: 0, records_upserted: 0, records_skipped: 0, startTime, validationPassed: true, validationErrors: [] });
      return { upserted: 0 };
    }

    // Filter out OCC options symbols (e.g. GDX280121P00070000) — Alpaca stock bars
    // endpoint rejects them and they would corrupt the batch fetch for valid tickers.
    const OCC_PATTERN = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/;
    const equityAssets = assets.filter(a => !OCC_PATTERN.test(a.symbol));

    const symbolToId = Object.fromEntries(equityAssets.map(a => [a.symbol, a.id]));
    const symbols    = equityAssets.map(a => a.symbol);

    let totalFetched = 0, totalUpserted = 0;
    const BATCH = 50; // Alpaca multi-symbol limit

    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      console.log(`  Fetching bars [${i + 1}–${i + batch.length}/${symbols.length}] ${startStr}→${endStr}`);

      let bars;
      try {
        bars = await withRetry(() => fetchAlpacaBars(batch, startStr, endStr), `bars-${i}`);
      } catch (err) {
        console.warn(`  ⚠ Bars fetch failed (batch ${i}): ${err.message}`);
        continue;
      }

      const rows = [];
      for (const [symbol, barList] of Object.entries(bars)) {
        const assetId = symbolToId[symbol];
        if (!assetId) continue;
        for (const bar of barList) {
          rows.push({
            asset_id:       assetId,
            price_date:     bar.t.slice(0, 10),
            open:           parseFloat(bar.o),
            high:           parseFloat(bar.h),
            low:            parseFloat(bar.l),
            close:          parseFloat(bar.c),
            adjusted_close: parseFloat(bar.c), // Alpaca returns split/div-adjusted
            volume:         parseInt(bar.v) || 0,
            interval:       '1d',
            source:         'alpaca',
          });
        }
      }

      totalFetched += rows.length;
      if (rows.length === 0) continue;

      // Unique constraint: (asset_id, price_date, interval) — matches migration index
      const { error: upsertErr } = await supabase
        .from('price_history')
        .upsert(rows, { onConflict: 'asset_id,price_date,interval' });

      if (upsertErr) {
        console.warn(`  ⚠ Upsert error: ${upsertErr.message}`);
      } else {
        totalUpserted += rows.length;
      }
    }

    await completeSyncLog(logEntry?.id, { records_fetched: totalFetched, records_upserted: totalUpserted, records_skipped: 0, startTime, validationPassed: true, validationErrors: [] });
    return { upserted: totalUpserted };

  } catch (err) {
    await failSyncLog(logEntry?.id, err, startTime, 0);
    throw err;
  }
}

// ── Post-Sync Validation ─────────────────────────────────

async function runValidation(syncLogId) {
  const results = [];

  // CHECK 1: Position count sanity
  try {
    const { count: posCount } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true });

    const { count: txSymbols } = await supabase
      .from('transactions')
      .select('symbol', { count: 'exact', head: true });

    if (posCount === 0 && txSymbols > 0) {
      results.push({
        check_name: 'position_count',
        status: 'warning',
        severity: 'warning',
        message: `No positions found but ${txSymbols} transaction records exist. Possible sync issue.`,
        details: { positions: posCount, transaction_records: txSymbols }
      });
    } else {
      results.push({
        check_name: 'position_count',
        status: 'passed',
        severity: 'info',
        message: `${posCount} positions synced.`,
        details: { positions: posCount }
      });
    }
  } catch (err) {
    results.push({
      check_name: 'position_count',
      status: 'failed',
      severity: 'critical',
      message: `Position count check failed: ${err.message}`,
      details: {}
    });
  }

  // CHECK 2: NAV reconciliation
  try {
    const { data: positions } = await supabase.from('positions').select('market_value');
    const { data: snapshot } = await supabase
      .from('account_snapshots')
      .select('equity, cash')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (positions && snapshot) {
      const calculatedMV = positions.reduce((sum, p) => sum + (parseFloat(p.market_value) || 0), 0);
      const totalWithCash = calculatedMV + (parseFloat(snapshot.cash) || 0);
      const brokerEquity = parseFloat(snapshot.equity) || 0;

      if (brokerEquity > 0) {
        const driftPct = Math.abs((totalWithCash - brokerEquity) / brokerEquity) * 100;

        if (driftPct > 2) {
          results.push({
            check_name: 'nav_reconciliation',
            status: 'failed',
            severity: 'critical',
            message: `NAV drift of ${driftPct.toFixed(2)}%. Calculated: $${totalWithCash.toFixed(2)}, Broker: $${brokerEquity.toFixed(2)}`,
            details: { calculated: totalWithCash, broker: brokerEquity, drift_pct: driftPct }
          });
        } else if (driftPct > 0.5) {
          results.push({
            check_name: 'nav_reconciliation',
            status: 'warning',
            severity: 'warning',
            message: `Minor NAV drift of ${driftPct.toFixed(2)}%. Within tolerance but worth monitoring.`,
            details: { calculated: totalWithCash, broker: brokerEquity, drift_pct: driftPct }
          });
        } else {
          results.push({
            check_name: 'nav_reconciliation',
            status: 'passed',
            severity: 'info',
            message: `NAV reconciled. Drift: ${driftPct.toFixed(4)}%`,
            details: { calculated: totalWithCash, broker: brokerEquity, drift_pct: driftPct }
          });
        }
      }
    }
  } catch (err) {
    results.push({
      check_name: 'nav_reconciliation',
      status: 'failed',
      severity: 'critical',
      message: `NAV reconciliation check failed: ${err.message}`,
      details: {}
    });
  }

  // CHECK 3: Snapshot continuity
  try {
    const { data: snapshots } = await supabase
      .from('account_snapshots')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(5);

    if (snapshots && snapshots.length >= 2) {
      const dates = snapshots.map(s => new Date(s.snapshot_date));
      let maxGapDays = 0;

      for (let i = 0; i < dates.length - 1; i++) {
        const gap = (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
        if (gap > maxGapDays) maxGapDays = gap;
      }

      if (maxGapDays > 3) { // 3 days accounts for weekends
        results.push({
          check_name: 'snapshot_continuity',
          status: 'warning',
          severity: 'warning',
          message: `Snapshot gap of ${maxGapDays} days detected in recent history.`,
          details: { max_gap_days: maxGapDays, recent_dates: snapshots.map(s => s.snapshot_date) }
        });
      } else {
        results.push({
          check_name: 'snapshot_continuity',
          status: 'passed',
          severity: 'info',
          message: `Snapshot continuity OK. Max gap: ${maxGapDays} days.`,
          details: { max_gap_days: maxGapDays }
        });
      }
    }
  } catch (err) {
    results.push({
      check_name: 'snapshot_continuity',
      status: 'failed',
      severity: 'critical',
      message: `Continuity check failed: ${err.message}`,
      details: {}
    });
  }

  // CHECK 4: Data freshness
  try {
    const { data: latest } = await supabase
      .from('atlas_sync_log')
      .select('completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    if (latest) {
      const hoursAgo = (Date.now() - new Date(latest.completed_at).getTime()) / (1000 * 60 * 60);

      if (hoursAgo > 48) {
        results.push({
          check_name: 'data_freshness',
          status: 'failed',
          severity: 'critical',
          message: `Last successful sync was ${hoursAgo.toFixed(1)} hours ago. Data is stale.`,
          details: { hours_ago: hoursAgo, last_sync: latest.completed_at }
        });
      } else if (hoursAgo > 24) {
        results.push({
          check_name: 'data_freshness',
          status: 'warning',
          severity: 'warning',
          message: `Last successful sync was ${hoursAgo.toFixed(1)} hours ago.`,
          details: { hours_ago: hoursAgo, last_sync: latest.completed_at }
        });
      } else {
        results.push({
          check_name: 'data_freshness',
          status: 'passed',
          severity: 'info',
          message: `Data is fresh. Last sync ${hoursAgo.toFixed(1)} hours ago.`,
          details: { hours_ago: hoursAgo }
        });
      }
    }
  } catch (err) {
    results.push({
      check_name: 'data_freshness',
      status: 'failed',
      severity: 'critical',
      message: `Freshness check failed: ${err.message}`,
      details: {}
    });
  }

  // Write validation results
  if (results.length > 0) {
    const rows = results.map(r => ({
      ...r,
      sync_log_id: syncLogId || null
    }));
    await supabase.from('atlas_validation_log').insert(rows);
  }

  // Write critical failures to memory
  const criticals = results.filter(r => r.severity === 'critical' && r.status !== 'passed');
  for (const c of criticals) {
    await supabase
      .from('atlas_memory')
      .upsert({
        category: 'bug',
        key: `validation-${c.check_name}`,
        content: c.message,
        tags: ['validation', c.check_name, 'automated', 'critical'],
        priority: 2,
        source: 'auto-sync'
      }, { onConflict: 'category,key' });
  }

  // Clear memory entries for checks that now pass
  const passed = results.filter(r => r.status === 'passed');
  for (const p of passed) {
    await supabase
      .from('atlas_memory')
      .delete()
      .eq('category', 'bug')
      .eq('key', `validation-${p.check_name}`);
  }

  return results;
}

// ── Full Sync Orchestrator ───────────────────────────────

async function runFullSync() {
  const fullStartTime = Date.now();
  const fullLog = await createSyncLog('full');

  console.log('═══════════════════════════════════════════');
  console.log('  ATLAS SYNC — Starting full sync');
  console.log('═══════════════════════════════════════════');

  const stats = { positions: 0, transactions: 0, snapshots: 0, equityCurve: 0, priceHistory: 0, allPassed: true };
  let hasFailure = false;

  // 1. Sync Positions
  try {
    console.log('\n[1/5] Syncing positions...');
    const result = await syncPositions();
    stats.positions = result.upserted;
    console.log(`  ✓ ${result.fetched} fetched, ${result.upserted} upserted`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Positions failed: ${err.message}`);
  }

  // 2. Sync Account Snapshot
  try {
    console.log('\n[2/5] Syncing account snapshot...');
    const result = await syncAccountSnapshot();
    stats.snapshots = 1;
    console.log(`  ✓ Equity: $${result.equity}, Cash: $${result.cash}`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Account snapshot failed: ${err.message}`);
  }

  // 3. Sync Transactions
  try {
    console.log('\n[3/5] Syncing transactions...');
    const result = await syncTransactions();
    stats.transactions = result.upserted;
    console.log(`  ✓ ${result.fetched} fetched, ${result.upserted} new`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Transactions failed: ${err.message}`);
  }

  // 4. Sync Equity Curve (account_snapshots → portfolio_equity_curve daily rows)
  try {
    console.log('\n[4/5] Syncing equity curve...');
    const result = await syncEquityCurve();
    stats.equityCurve = result.upserted;
    console.log(`  ✓ ${result.upserted} new daily rows added`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Equity curve failed: ${err.message}`);
  }

  // 5. Sync Price History (Alpaca bars for all tracked assets)
  try {
    console.log('\n[5/5] Syncing price history...');
    const result = await syncPriceHistory();
    stats.priceHistory = result.upserted;
    console.log(`  ✓ ${result.upserted} bars upserted`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Price history failed: ${err.message}`);
  }

  // 5b. Refresh Nexus holdings snapshot (materialized view) so the terminal
  //     home reads fresh data instantly within the anon role's 3s timeout.
  try {
    console.log('\n[5b] Refreshing Nexus holdings snapshot...');
    const { error } = await supabase.rpc('refresh_nexus_holdings');
    if (error) throw error;
    console.log('  ✓ mv_nexus_holdings refreshed');
  } catch (err) {
    // Non-fatal: a stale snapshot is preferable to a failed sync.
    console.error(`  ⚠ Nexus snapshot refresh failed: ${err.message}`);
  }

  // 6. Run Validation
  console.log('\n[VALIDATION] Running post-sync checks...');
  const validationResults = await runValidation(fullLog?.id);

  for (const v of validationResults) {
    const icon = v.status === 'passed' ? '✓' : v.status === 'warning' ? '⚠' : '✗';
    console.log(`  ${icon} ${v.check_name}: ${v.message}`);
  }

  const allPassed = validationResults.every(v => v.status === 'passed');
  stats.allPassed = allPassed;

  // 5. Update status table
  const finalStatus = hasFailure ? 'failed' : (allPassed ? 'completed' : 'partial');
  const totalRecords = stats.positions + stats.transactions + stats.snapshots;

  await completeSyncLog(fullLog?.id, {
    records_fetched: totalRecords,
    records_upserted: totalRecords,
    records_skipped: 0,
    startTime: fullStartTime,
    validationPassed: allPassed,
    validationErrors: validationResults.filter(v => v.status !== 'passed')
  });

  await updateSyncStatus('full', finalStatus, {
    duration_ms: Date.now() - fullStartTime,
    records: totalRecords,
    validationPassed: allPassed,
    errorMessage: hasFailure ? 'One or more sync operations failed' : null
  });

  // 6. Update memory
  if (hasFailure) {
    const { data: status } = await supabase
      .from('atlas_sync_status')
      .select('consecutive_failures')
      .eq('id', 1)
      .single();
    await writeFailureToMemory('full', new Error('Partial sync failure'), status?.consecutive_failures || 1);
  } else {
    await clearFailureFromMemory('full');
    await writeSyncContextToMemory(stats);
  }

  // 7. Summary
  console.log('\n═══════════════════════════════════════════');
  console.log(`  ATLAS SYNC — ${finalStatus.toUpperCase()}`);
  console.log(`  Duration: ${Date.now() - fullStartTime}ms`);
  console.log(`  Records: ${totalRecords}`);
  console.log(`  Validation: ${allPassed ? 'ALL PASSED' : 'ISSUES DETECTED'}`);
  console.log('═══════════════════════════════════════════');

  if (hasFailure) process.exit(1);
}

// ── Run ──────────────────────────────────────────────────
runFullSync().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
