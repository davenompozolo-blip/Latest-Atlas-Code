import {
  fetchPortfolioWithPositions,
  fetchPortfolioSnapshot,
} from './portfolioDataService.js';
import { supabaseClient } from './supabaseClient.js';

/**
 * Fetch all portfolios ordered by creation date.
 * @returns {Promise<object[]>}
 */
export async function fetchPortfolios() {
  const { data, error } = await supabaseClient
    .from('portfolios')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Fetch latest positions for a specific portfolio with joined assets.
 * @param {string} portfolioId
 * @returns {Promise<object[]>}
 */
export async function fetchPositionsForPortfolio(portfolioId) {
  const { positions } = await fetchPortfolioWithPositions(portfolioId);
  return positions;
}

export { fetchPortfolioWithPositions, fetchPortfolioSnapshot };
