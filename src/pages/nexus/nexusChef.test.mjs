// Chef nudge — tab selection from the live book. Pure, runs under node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChef } from './nexusLiveCompute.js';

test('wide theme dispersion → nudge to Theme with leader/laggard', () => {
    const c = buildChef({
        spine: [{ theme: 'Energy', movePct: 2.0 }, { theme: 'Tech', movePct: -1.8 }],
        holdings: [], concentration: null,
    });
    assert.equal(c.hotTab, 'theme');
    assert.match(c.reason, /Energy/);
    assert.match(c.reason, /Tech/);
});

test('fragile concentration → nudge to Drift with the cluster', () => {
    const c = buildChef({
        spine: [{ theme: 'A', movePct: 0.1 }, { theme: 'B', movePct: 0 }],
        holdings: [],
        concentration: { verdictChip: 'Fragile', fragilityCluster: ['AMD', 'TSM', 'ASML'] },
    });
    assert.equal(c.hotTab, 'drift');
    assert.match(c.reason, /AMD/);
});

test('a crop of cheap names → nudge to Opportunities', () => {
    const c = buildChef({
        spine: [{ theme: 'A', movePct: 0.2 }],
        holdings: [
            { tk: 'KMI', fvGapPct: 35 }, { tk: 'PFE', fvGapPct: 40 }, { tk: 'GILD', fvGapPct: 26 },
        ],
        concentration: { verdictChip: 'Diversified' },
    });
    assert.equal(c.hotTab, 'opp');
    assert.match(c.reason, /cheap/);
});

test('nothing salient → stay on Flagship', () => {
    const c = buildChef({ spine: [{ theme: 'A', movePct: 0.3 }], holdings: [], concentration: null });
    assert.equal(c.hotTab, 'flagship');
});

test('stale cheap names are ignored', () => {
    const c = buildChef({
        spine: [{ theme: 'A', movePct: 0.1 }],
        holdings: [{ tk: 'X', fvGapPct: 40, stale: true }, { tk: 'Y', fvGapPct: 40, stale: true }, { tk: 'Z', fvGapPct: 40, stale: true }],
        concentration: null,
    });
    assert.equal(c.hotTab, 'flagship');
});
