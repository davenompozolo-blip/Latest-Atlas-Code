import { supabaseClient } from './supabaseClient';

/**
 * Fetch all portfolios ordered by creation date.
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
 * Fetch latest positions for a specific portfolio.
 * @param {string} portfolioId
 */
export async function fetchPositionsForPortfolio(portfolioId) {
  const { data, error } = await supabaseClient
    .from('positions')
    .select('*, assets(*)')
    .eq('portfolio_id', portfolioId)
    .order('as_of_date', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}
