# 🧮 ATLAS Quant Portfolio Optimizer - Quick Start Guide

## What Is This?

The ATLAS Quant Portfolio Optimizer uses **institutional-grade mathematics** to find the optimal portfolio allocation:

- 🎯 **Maximize Sharpe Ratio** - Best risk-adjusted returns
- 📉 **Minimize Volatility** - Lowest risk portfolio
- 📊 **Efficient Frontier** - All optimal portfolios
- 🎲 **Monte Carlo Simulation** - 10,000+ scenarios
- 📈 **Risk Metrics** - VaR, CVaR, Maximum Drawdown

**This is the same math used by hedge funds and institutional investors!**

---

## 🚀 5-Minute Quick Start

### **Step 1: Prepare Your Data**

You need a DataFrame of **daily returns** for your assets:
```python
import pandas as pd
import numpy as np

# Example: Create returns DataFrame
# Rows = days, Columns = assets
returns = pd.DataFrame({
    'AAPL': [0.01, -0.005, 0.02, ...],   # Daily returns
    'GOOGL': [0.015, 0.008, -0.01, ...],
    'MSFT': [0.012, 0.003, 0.015, ...]
})

# Make sure index is datetime
returns.index = pd.date_range(start='2022-01-01', periods=len(returns), freq='D')
```

**Important:** Returns should be in decimal format (0.01 = 1%)

---

### **Step 2: Initialize Optimizer**
```python
from atlas_quant_portfolio_optimizer import (
    MultivariablePortfolioOptimizer,
    PortfolioConstraints
)

# Create optimizer
optimizer = MultivariablePortfolioOptimizer(
    returns=returns,
    risk_free_rate=0.03  # 3% annual risk-free rate
)
```

---

### **Step 3: Set Constraints**
```python
# Define portfolio constraints
constraints = PortfolioConstraints(
    min_weight=0.05,        # Min 5% per asset
    max_weight=0.30,        # Max 30% per asset
    max_leverage=1.0,       # 1.0 = no leverage, 2.0 = 2x leverage
    long_only=True,         # No shorting
    target_return=None      # Let optimizer decide
)
```

---

### **Step 4: Optimize!**
```python
# Maximize Sharpe Ratio
result = optimizer.optimize_sharpe(constraints)

# Print results
print(f"Expected Return: {result.expected_return * 100:.2f}%")
print(f"Volatility: {result.volatility * 100:.2f}%")
print(f"Sharpe Ratio: {result.sharpe_ratio:.3f}")
print(f"VaR 95%: {result.var_95 * 100:.2f}%")

print("\nOptimal Weights:")
for asset, weight in zip(result.asset_names, result.weights):
    print(f"  {asset}: {weight * 100:.2f}%")
```

**Output:**
```
Expected Return: 28.60%
Volatility: 13.32%
Sharpe Ratio: 1.922
VaR 95%: -7.30%

Optimal Weights:
  AAPL: 5.32%
  GOOGL: 30.00%
  MSFT: 11.90%
  ...
```

---

## 📊 Using the Streamlit UI

### **Launch the UI:**
```python
import streamlit as st
from atlas_quant_optimizer_ui import setup_quant_optimizer_ui

# In your Streamlit app
setup_quant_optimizer_ui()
```

### **UI Features:**

**Tab 1: Optimize**
- Configure optimization settings
- Set constraints (min/max weights, leverage)
- Run optimization
- View results and optimal weights

**Tab 2: Efficient Frontier**
- Calculate 50+ optimal portfolios
- View risk-return tradeoff curve
- Compare different risk levels

**Tab 3: Monte Carlo**
- Run 10,000+ simulations
- See distribution of possible outcomes
- Understand portfolio risk

**Tab 4: Sensitivity**
- View gradient heatmap (∂Sharpe/∂w_i)
- See which assets matter most
- Track convergence

**Tab 5: Risk Metrics**
- Comprehensive risk analysis
- VaR, CVaR, Max Drawdown
- Risk/return profile

---

## 🎯 Common Use Cases

### **Use Case 1: Maximum Sharpe Ratio (Best Risk-Adjusted Returns)**
```python
# Default optimization - maximize Sharpe
result = optimizer.optimize_sharpe(constraints)

# This finds the portfolio with the best return per unit of risk
# Perfect for: Long-term investors, retirement accounts
```

---

### **Use Case 2: Minimum Volatility (Lowest Risk)**
```python
# Minimize risk
result = optimizer.optimize_minimum_volatility(constraints)

# This finds the lowest-risk portfolio
# Perfect for: Conservative investors, capital preservation
```

---

### **Use Case 3: Target Return (Specific Return Goal)**
```python
# Set target return
constraints.target_return = 0.20  # 20% annual return

# Optimizer will find lowest-risk portfolio that achieves this return
result = optimizer.optimize_minimum_volatility(constraints)

# Perfect for: Goal-based investing, meeting specific targets
```

---

### **Use Case 4: Leveraged Portfolio (2x Margin)**
```python
# Use 2x leverage
constraints.max_leverage = 2.0

result = optimizer.optimize_sharpe(constraints)

# Portfolio weights will sum to 200%
# Returns and risk are amplified 2x
# Perfect for: Aggressive growth, margin accounts
```

---

### **Use Case 5: Sector Limits**
```python
# Limit exposure to specific sectors
constraints.sector_limits = {
    'Tech': 0.50,      # Max 50% in tech
    'Finance': 0.30,   # Max 30% in finance
    'Healthcare': 0.20 # Max 20% in healthcare
}

result = optimizer.optimize_sharpe(constraints)

# Perfect for: Diversification, risk management
```

---

## 📈 Understanding the Results

### **Expected Return**
- Annualized expected portfolio return
- Based on historical mean returns
- Example: 28.60% = Portfolio expected to return 28.6% per year

### **Volatility**
- Annualized standard deviation of returns
- Measure of portfolio risk
- Example: 13.32% = Portfolio moves ±13.3% in typical year

### **Sharpe Ratio**
- Return per unit of risk: (Return - RiskFree) / Volatility
- Higher is better (>1.0 is good, >2.0 is excellent)
- Example: 1.922 = Getting 1.92% extra return for each 1% of risk

### **VaR 95% (Value at Risk)**
- Worst expected loss at 95% confidence
- Example: -7.30% = Only 5% chance of losing more than 7.3%

### **CVaR 95% (Conditional VaR)**
- Average loss when VaR is exceeded
- Measures tail risk
- Example: -10% = When bad things happen, expect -10% average loss

### **Maximum Drawdown**
- Largest peak-to-trough decline
- Example: -15% = Worst decline from peak in simulations

---

## 🧮 The Mathematics Behind It

### **Portfolio Return:**
```
r_p = Σ(w_i × r_i) = w^T × r

Where:
- w_i = weight of asset i
- r_i = return of asset i
```

### **Portfolio Volatility:**
```
σ_p = sqrt(w^T × Σ × w)

Where:
- Σ = covariance matrix of returns
```

### **Sharpe Ratio:**
```
Sharpe = (r_p - r_f) / σ_p

Where:
- r_f = risk-free rate
```

### **Optimization (Gradient Descent):**
```
∂Sharpe/∂w_i = (1/σ_p) × [∂r_p/∂w_i - Sharpe × ∂σ_p/∂w_i]

The optimizer uses partial derivatives to find optimal weights
```

### **Stochastic Simulation (Geometric Brownian Motion):**
```
dS_t = μ × S_t × dt + σ × S_t × dW_t

Where:
- S_t = asset price at time t
- μ = drift (expected return)
- σ = volatility
- dW_t = Wiener process (random walk)
```

---

## ⚙️ Advanced Settings

### **Optimization Parameters:**
```python
# Access optimizer settings
optimizer = MultivariablePortfolioOptimizer(
    returns=returns,
    risk_free_rate=0.03
)

# Customize optimization
result = optimizer.optimize_sharpe(
    constraints=constraints,
    # These are internal to scipy.optimize.minimize:
    # method='SLSQP'          # Sequential Least Squares Programming
    # maxiter=1000            # Maximum iterations
    # ftol=1e-9               # Function tolerance
)
```

### **Monte Carlo Settings:**
```python
# More simulations = better accuracy but slower
simulator = StochasticPriceSimulator(returns, risk_free_rate=0.03)

portfolio_paths = simulator.calculate_portfolio_paths(
    weights=result.weights,
    n_simulations=50000,  # Increase for production (default: 10,000)
    n_days=252            # 1 year of trading days
)
```

### **Efficient Frontier:**
```python
# Calculate efficient frontier
frontier = optimizer.efficient_frontier(
    n_portfolios=100,  # More points = smoother curve
    constraints=constraints
)

# Returns DataFrame with:
# - return: Expected return for each portfolio
# - volatility: Risk level
# - sharpe: Sharpe ratio
# - weights: Optimal weights at this risk level
```

---

## 🎓 Best Practices

### **1. Data Quality**
```python
# Use at least 2 years of data (500+ trading days)
assert len(returns) >= 500, "Need more historical data"

# Check for missing data
assert not returns.isna().any().any(), "Remove NaN values"

# Remove outliers (e.g., COVID crash)
returns = returns[returns.abs() < 0.20]  # Remove +/-20% daily moves
```

### **2. Constraints**
```python
# Start conservative
constraints = PortfolioConstraints(
    min_weight=0.05,   # Don't allow too-small positions
    max_weight=0.25,   # Prevent over-concentration
    max_leverage=1.0,  # Start without leverage
    long_only=True     # No shorting to start
)
```

### **3. Risk-Free Rate**
```python
# Use current Treasury rates
# As of 2024: ~4-5% for 10-year Treasury

optimizer = MultivariablePortfolioOptimizer(
    returns=returns,
    risk_free_rate=0.045  # 4.5%
)
```

### **4. Validation**
```python
# Always validate results
assert abs(result.weights.sum() - constraints.max_leverage) < 0.01
assert result.sharpe_ratio > 0
assert all(result.weights >= constraints.min_weight)
assert all(result.weights <= constraints.max_weight)
```

---

## 🚨 Common Pitfalls

### **❌ Pitfall 1: Using Prices Instead of Returns**
```python
# WRONG:
returns = prices  # Don't use prices!

# CORRECT:
returns = prices.pct_change().dropna()  # Calculate returns
```

### **❌ Pitfall 2: Not Annualizing**
```python
# Returns in the DataFrame should be DAILY
# Optimizer automatically annualizes:
# - Returns: × 252 (trading days)
# - Volatility: × sqrt(252)
```

### **❌ Pitfall 3: Over-Constraining**
```python
# WRONG: Too many constraints = no solution
constraints = PortfolioConstraints(
    min_weight=0.20,   # Each asset must be 20%+
    max_weight=0.25,   # But can't exceed 25%
    # With 10 assets, this is impossible!
)

# CORRECT: Reasonable constraints
constraints = PortfolioConstraints(
    min_weight=0.05,
    max_weight=0.30
)
```

### **❌ Pitfall 4: Ignoring Risk**
```python
# Don't just maximize return!
# Always consider risk-adjusted returns (Sharpe ratio)

# GOOD:
result = optimizer.optimize_sharpe(constraints)

# RISKY:
# Just picking highest return asset ignores volatility!
```

---

## 📊 Performance Benchmarks

**Optimization Speed:**
- 10 assets: ~0.5 seconds
- 37 assets: ~1 second
- 100 assets: ~5 seconds

**Monte Carlo:**
- 10,000 simulations: ~3 seconds
- 50,000 simulations: ~15 seconds

**Efficient Frontier:**
- 50 portfolios: ~30 seconds
- 100 portfolios: ~60 seconds

---

## 🎉 You're Ready!

You now have institutional-grade portfolio optimization at your fingertips!

**Next Steps:**
1. Prepare your returns data
2. Run your first optimization
3. Explore the efficient frontier
4. Validate with Monte Carlo simulation
5. Deploy in your portfolio!

**Questions?** Check:
- `ATLAS_V10_PATCH_GUIDE.md` - Patch and integration guide
- Source code with inline comments
- Example implementations in main application

**Happy optimizing! 🚀📈**
