import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import { App, ErrorBoundary } from './pages/app.js';
import { installApiPortfolioTagging } from './lib/activePortfolio.js';
import { AuthGate } from './components/AuthGate.js';
import { installApiAuth } from './lib/apiClientAuth.js';
import { supabase } from './lib/supabase.js';

// MP-2: before anything fetches, tag every same-origin /api/* request with the
// chosen portfolio (a no-op on the default account). Fail-closed: api/trading.js
// refuses account-level actions for a non-default portfolio until MP-3.
installApiPortfolioTagging();

// AUTH-2: and with the signed-in user's access token. Every /api route refuses a
// request without one. getSession() refreshes an expiring token, so it is asked
// per request rather than cached here.
installApiAuth(globalThis, async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  // AUTH-1: no session, no terminal. Nothing inside App mounts -- and so no
  // loader fires -- until a signed-in session exists, so every first fetch
  // carries the user's token.
  React.createElement(ErrorBoundary, null,
    React.createElement(AuthGate, null, React.createElement(App, null)))
);
