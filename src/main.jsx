import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import { App, ErrorBoundary } from './pages/app.js';
import { installApiPortfolioTagging } from './lib/activePortfolio.js';

// MP-2: before anything fetches, tag every same-origin /api/* request with the
// chosen portfolio (a no-op on the default account). Fail-closed: api/trading.js
// refuses account-level actions for a non-default portfolio until MP-3.
installApiPortfolioTagging();

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null, React.createElement(App, null))
);
