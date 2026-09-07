// Test stub for src/pages/components.js — pulls in the whole shared component
// tree otherwise, none of which the three level renderers touch.
import React from 'react';
export function Loading() { return React.createElement('div', null, 'loading'); }
export function EmptyState() { return React.createElement('div', null, 'empty'); }
