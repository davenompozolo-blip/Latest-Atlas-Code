import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import { App, ErrorBoundary } from './pages/app.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(ErrorBoundary, null, React.createElement(App, null))
);
