import { supabaseClient } from './supabaseClient.js';

/**
 * Validate that a required string is present.
 * @param {string} value - Input value.
 * @param {string} fieldName - Field name for readable errors.
 */
function assertRequiredString(value, fieldName) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }
}

/**
 * Insert a single portfolio row.
 * @param {{name: string, external_id?: string, broker?: string, base_currency?: string, metadata?: object}} portfolioInput
 * @returns {Promise<object>} Inserted portfolio row.
 */
export async function insertPortfolio(portfolioInput) {
  assertRequiredString(portfolioInput?.name, 'portfolio.name');

  const payload = {
    name: portfolioInput.name,
    external_id: portfolioInput.external_id ?? null,
    broker: portfolioInput.broker ?? null,
    base_currency: portfolioInput.base_currency ?? 'USD',
    metadata: portfolioInput.metadata ?? {},
  };

  const { data, error } = await supabaseClient
    .from('portfolios')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert or update an asset by symbol so downstream foreign keys can safely reference it.
 * @param {{symbol: string, name?: string, asset_class?: string, exchange?: string, currency?: string, metadata?: object}} assetInput
 * @returns {Promise<object>} Inserted or existing asset row.
 */
export async function upsertAsset(assetInput) {
  assertRequiredString(assetInput?.symbol, 'asset.symbol');

  const payload = {
    symbol: assetInput.symbol.toUpperCase(),
    name: assetInput.name ?? null,
    asset_class: assetInput.asset_class ?? null,
    exchange: assetInput.exchange ?? null,
    currency: assetInput.currency ?? 'USD',
    metadata: assetInput.metadata ?? {},
  };

  const { data, error } = await supabaseClient
    .from('assets')
    .upsert(payload, { onConflict: 'symbol' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert a position if one does not already exist for the same portfolio/asset/date key.
 * @param {{portfolio_id: string, asset_id: string, quantity: number, average_cost?: number, market_value?: number, as_of_date?: string}} positionInput
 * @returns {Promise<object>} Inserted position row.
 */
export async function insertPosition(positionInput) {
  assertRequiredString(positionInput?.portfolio_id, 'position.portfolio_id');
  assertRequiredString(positionInput?.asset_id, 'position.asset_id');

  const asOfDate = positionInput.as_of_date ?? new Date().toISOString().slice(0, 10);

  const { data: existing, error: existingError } = await supabaseClient
    .from('positions')
    .select('id')
    .eq('portfolio_id', positionInput.portfolio_id)
    .eq('asset_id', positionInput.asset_id)
    .eq('as_of_date', asOfDate)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    throw new Error('Duplicate position for portfolio_id + asset_id + as_of_date.');
  }

  const { data, error } = await supabaseClient
    .from('positions')
    .insert({
      portfolio_id: positionInput.portfolio_id,
      asset_id: positionInput.asset_id,
      quantity: positionInput.quantity,
      average_cost: positionInput.average_cost ?? null,
      market_value: positionInput.market_value ?? null,
      as_of_date: asOfDate,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert a transaction while preventing duplicates.
 * Duplicate rule: same portfolio_id + external_id (if supplied), otherwise same portfolio/asset/type/date/qty/price.
 * @param {{portfolio_id: string, asset_id: string, transaction_type: string, quantity: number, price?: number, fees?: number, transaction_date: string, external_id?: string, notes?: string, metadata?: object}} transactionInput
 * @returns {Promise<object>} Inserted transaction row.
 */
export async function insertTransaction(transactionInput) {
  assertRequiredString(transactionInput?.portfolio_id, 'transaction.portfolio_id');
  assertRequiredString(transactionInput?.asset_id, 'transaction.asset_id');
  assertRequiredString(transactionInput?.transaction_type, 'transaction.transaction_type');
  assertRequiredString(transactionInput?.transaction_date, 'transaction.transaction_date');

  let duplicateQuery = supabaseClient
    .from('transactions')
    .select('id')
    .eq('portfolio_id', transactionInput.portfolio_id);

  if (transactionInput.external_id) {
    duplicateQuery = duplicateQuery.eq('external_id', transactionInput.external_id);
  } else {
    duplicateQuery = duplicateQuery
      .eq('asset_id', transactionInput.asset_id)
      .eq('transaction_type', transactionInput.transaction_type)
      .eq('transaction_date', transactionInput.transaction_date)
      .eq('quantity', transactionInput.quantity)
      .eq('price', transactionInput.price ?? null);
  }

  const { data: duplicateRow, error: duplicateError } = await duplicateQuery.maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicateRow) throw new Error('Duplicate transaction detected.');

  const { data, error } = await supabaseClient
    .from('transactions')
    .insert({
      portfolio_id: transactionInput.portfolio_id,
      asset_id: transactionInput.asset_id,
      transaction_type: transactionInput.transaction_type,
      quantity: transactionInput.quantity,
      price: transactionInput.price ?? null,
      fees: transactionInput.fees ?? 0,
      transaction_date: transactionInput.transaction_date,
      external_id: transactionInput.external_id ?? null,
      notes: transactionInput.notes ?? null,
      metadata: transactionInput.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert daily OHLCV price history while preventing duplicate asset/date rows.
 * @param {{asset_id: string, price_date: string, open?: number, high?: number, low?: number, close: number, adjusted_close?: number, volume?: number, source?: string}} priceInput
 * @returns {Promise<object>} Inserted price_history row.
 */
export async function insertPriceHistory(priceInput) {
  assertRequiredString(priceInput?.asset_id, 'price_history.asset_id');
  assertRequiredString(priceInput?.price_date, 'price_history.price_date');

  const { data: existing, error: existingError } = await supabaseClient
    .from('price_history')
    .select('id')
    .eq('asset_id', priceInput.asset_id)
    .eq('price_date', priceInput.price_date)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    throw new Error('Duplicate price_history row for asset_id + price_date.');
  }

  const { data, error } = await supabaseClient
    .from('price_history')
    .insert({
      asset_id: priceInput.asset_id,
      price_date: priceInput.price_date,
      open: priceInput.open ?? null,
      high: priceInput.high ?? null,
      low: priceInput.low ?? null,
      close: priceInput.close,
      adjusted_close: priceInput.adjusted_close ?? null,
      volume: priceInput.volume ?? null,
      source: priceInput.source ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch a portfolio row with all positions and joined asset rows.
 * @param {string} portfolioId
 * @returns {Promise<{portfolio: object, positions: object[]}>}
 */
export async function fetchPortfolioWithPositions(portfolioId) {
  assertRequiredString(portfolioId, 'portfolioId');

  const { data: portfolio, error: portfolioError } = await supabaseClient
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .single();
  if (portfolioError) throw portfolioError;

  const { data: positions, error: positionError } = await supabaseClient
    .from('positions')
    .select('*, assets(*)')
    .eq('portfolio_id', portfolioId)
    .order('as_of_date', { ascending: false });
  if (positionError) throw positionError;

  return {
    portfolio,
    positions,
  };
}

/**
 * Fetch snapshot data at a date including portfolio details, latest positions <= date,
 * matching price history rows, and computed total portfolio value.
 * @param {string} portfolioId
 * @param {string} snapshotDate - ISO date string (YYYY-MM-DD)
 * @returns {Promise<{portfolio: object, snapshot_date: string, positions: object[], prices: object[], portfolio_value: number}>}
 */
export async function fetchPortfolioSnapshot(portfolioId, snapshotDate) {
  assertRequiredString(portfolioId, 'portfolioId');
  assertRequiredString(snapshotDate, 'snapshotDate');

  const { portfolio, positions } = await fetchPortfolioWithPositions(portfolioId);

  const latestByAsset = new Map();
  for (const position of positions) {
    if (position.as_of_date > snapshotDate) continue;
    const existing = latestByAsset.get(position.asset_id);
    if (!existing || existing.as_of_date < position.as_of_date) {
      latestByAsset.set(position.asset_id, position);
    }
  }

  const snapshotPositions = [...latestByAsset.values()];
  const assetIds = snapshotPositions.map((p) => p.asset_id);

  let prices = [];
  if (assetIds.length > 0) {
    const { data: priceRows, error: priceError } = await supabaseClient
      .from('price_history')
      .select('*')
      .in('asset_id', assetIds)
      .eq('price_date', snapshotDate);
    if (priceError) throw priceError;
    prices = priceRows;
  }

  const priceByAsset = new Map(prices.map((row) => [row.asset_id, row]));
  const portfolioValue = snapshotPositions.reduce((sum, position) => {
    const close = priceByAsset.get(position.asset_id)?.close;
    if (close != null) return sum + Number(position.quantity) * Number(close);
    if (position.market_value != null) return sum + Number(position.market_value);
    return sum;
  }, 0);

  return {
    portfolio,
    snapshot_date: snapshotDate,
    positions: snapshotPositions,
    prices,
    portfolio_value: Number(portfolioValue.toFixed(2)),
  };
}
