import { create } from 'zustand';

export const usePortfolioConstructionStore = create((set, get) => ({
  // ── Layer navigation ──────────────────────────────────────────
  activeLayer: 1,
  setActiveLayer: (l) => set({ activeLayer: l }),

  // ── L1 · IPS ─────────────────────────────────────────────────
  ips: {
    riskTolerance: 7,
    returnTarget: 12.5,
    timeHorizon: 10,
    benchmark: 'SPY',
    maxConcentration: 20,
    sectorRestrictions: ['Tobacco', 'Weapons'],
    esgScreen: false,
  },
  ipsSaved: false,
  setIps: (ips) => set({ ips }),
  saveIps: (ips) => set({ ips, ipsSaved: true }),

  // ── L2 · SAA / TAA ───────────────────────────────────────────
  saaWeights: {
    EQUITY: 65, FIXED_INCOME: 20, ALTERNATIVE: 10, CASH: 5,
  },
  taaWeights: {
    EQUITY: 70, FIXED_INCOME: 15, ALTERNATIVE: 10, CASH: 5,
  },
  setSaaWeights: (w) => set({ saaWeights: w }),
  setTaaWeights: (w) => set({ taaWeights: w }),

  // ── L3 · Factor Exposure ─────────────────────────────────────
  factorScores: {
    market: 1.18, size: -0.12, value: -0.31, momentum: 0.44,
    quality: 0.62, lowVol: -0.28, activeShare: 58,
  },
  setFactorScores: (f) => set({ factorScores: f }),

  // ── L4 · Risk Budget ─────────────────────────────────────────
  riskBudget: null,
  setRiskBudget: (r) => set({ riskBudget: r }),

  // ── L5 · Optimised weights ───────────────────────────────────
  optimisedWeights: {},
  optimiserMode: 'MVO',
  setOptimisedWeights: (w) => set({ optimisedWeights: w }),
  setOptimiserMode: (m) => set({ optimiserMode: m }),

  // ── L6 · Trade list ──────────────────────────────────────────
  tradeList: [],
  setTradeList: (t) => set({ tradeList: t }),

  // ── L7 · Report ──────────────────────────────────────────────
  report: null,
  setReport: (r) => set({ report: r }),

  // ── Layer completion tracking ────────────────────────────────
  completedLayers: [1, 2, 3],
  completeLayer: (l) => set((s) => ({
    completedLayers: s.completedLayers.includes(l) ? s.completedLayers : [...s.completedLayers, l],
  })),
}));
