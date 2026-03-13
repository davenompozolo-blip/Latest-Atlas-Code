/**
 * Demo script for manual verification against a live Supabase project.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/supabaseDemo.mjs
 */
import {
  fetchPortfolioSnapshot,
  fetchPortfolioWithPositions,
  insertPortfolio,
  insertPosition,
  insertPriceHistory,
  insertTransaction,
  upsertAsset,
} from '../services/portfolioDataService.js';

async function runDemo() {
  const today = new Date().toISOString().slice(0, 10);

  const portfolio = await insertPortfolio({
    external_id: `atlas-demo-${Date.now()}`,
    name: 'Atlas Demo Portfolio',
    broker: 'alpaca',
    base_currency: 'USD',
  });

  const asset = await upsertAsset({
    symbol: 'AAPL',
    name: 'Apple Inc.',
    asset_class: 'equity',
    exchange: 'NASDAQ',
    currency: 'USD',
  });

  const position = await insertPosition({
    portfolio_id: portfolio.id,
    asset_id: asset.id,
    quantity: 10,
    average_cost: 170,
    market_value: 1750,
    as_of_date: today,
  });

  const transaction = await insertTransaction({
    portfolio_id: portfolio.id,
    asset_id: asset.id,
    transaction_type: 'buy',
    quantity: 10,
    price: 170,
    fees: 1,
    transaction_date: `${today}T14:00:00Z`,
    external_id: `txn-${Date.now()}`,
    notes: 'Initial seed for demo',
  });

  const price = await insertPriceHistory({
    asset_id: asset.id,
    price_date: today,
    open: 174,
    high: 177,
    low: 173,
    close: 175,
    adjusted_close: 175,
    volume: 1234567,
    source: 'demo',
  });

  const withPositions = await fetchPortfolioWithPositions(portfolio.id);
  const snapshot = await fetchPortfolioSnapshot(portfolio.id, today);

  console.log('Inserted portfolio:', portfolio.id);
  console.log('Inserted asset:', asset.id);
  console.log('Inserted position:', position.id);
  console.log('Inserted transaction:', transaction.id);
  console.log('Inserted price row:', price.id);
  console.log('Portfolio with positions:', JSON.stringify(withPositions, null, 2));
  console.log('Snapshot:', JSON.stringify(snapshot, null, 2));
}

runDemo().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
