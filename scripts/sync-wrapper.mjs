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
const ALPACA_HEADERS = {
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
  'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
  'Content-Type': 'application/json'
};

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
    `Snapshots: ${stats.snapshots}. All validations ${stats.allPassed ? 'passed' : 'had warnings'}.`;

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

    const records = positions.map(p => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      side: p.side,
      market_value: parseFloat(p.market_value),
      cost_basis: parseFloat(p.cost_basis),
      unrealized_pl: parseFloat(p.unrealized_pl),
      unrealized_plpc: parseFloat(p.unrealized_plpc),
      current_price: parseFloat(p.current_price),
      lastday_price: parseFloat(p.lastday_price),
      avg_entry_price: parseFloat(p.avg_entry_price),
      asset_class: p.asset_class,
      asset_id: p.asset_id,
      exchange: p.exchange,
      updated_at: new Date().toISOString()
    }));

    // Clear existing positions and replace (Alpaca gives full snapshot)
    const { error: deleteError } = await supabase.from('positions').delete().neq('symbol', '');
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
      equity: parseFloat(account.equity),
      cash: parseFloat(account.cash),
      buying_power: parseFloat(account.buying_power),
      portfolio_value: parseFloat(account.portfolio_value),
      long_market_value: parseFloat(account.long_market_value),
      short_market_value: parseFloat(account.short_market_value),
      initial_margin: parseFloat(account.initial_margin),
      maintenance_margin: parseFloat(account.maintenance_margin),
      last_equity: parseFloat(account.last_equity),
      status: account.status,
      pattern_day_trader: account.pattern_day_trader,
      snapshot_date: new Date().toISOString().split('T')[0],
      captured_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('account_snapshots')
      .upsert(snapshot, { onConflict: 'snapshot_date' });

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

  const stats = { positions: 0, transactions: 0, snapshots: 0, allPassed: true };
  let hasFailure = false;

  // 1. Sync Positions
  try {
    console.log('\n[1/3] Syncing positions...');
    const result = await syncPositions();
    stats.positions = result.upserted;
    console.log(`  ✓ ${result.fetched} fetched, ${result.upserted} upserted`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Positions failed: ${err.message}`);
  }

  // 2. Sync Account Snapshot
  try {
    console.log('\n[2/3] Syncing account snapshot...');
    const result = await syncAccountSnapshot();
    stats.snapshots = 1;
    console.log(`  ✓ Equity: $${result.equity}, Cash: $${result.cash}`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Account snapshot failed: ${err.message}`);
  }

  // 3. Sync Transactions
  try {
    console.log('\n[3/3] Syncing transactions...');
    const result = await syncTransactions();
    stats.transactions = result.upserted;
    console.log(`  ✓ ${result.fetched} fetched, ${result.upserted} new`);
  } catch (err) {
    hasFailure = true;
    console.error(`  ✗ Transactions failed: ${err.message}`);
  }

  // 4. Run Validation
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
