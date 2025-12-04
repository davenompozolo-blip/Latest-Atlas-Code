# 🤝 Contributing to ATLAS Terminal

First off, thank you for considering contributing to ATLAS Terminal! It's people like you that make ATLAS Terminal such a great tool.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Workflow](#development-workflow)
- [Style Guidelines](#style-guidelines)
- [Testing Guidelines](#testing-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Community](#community)

---

## 📜 Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to davenompozolo@gmail.com.

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of:
- Age, body size, disability, ethnicity
- Gender identity and expression
- Level of experience, education
- Nationality, personal appearance, race, religion
- Sexual identity and orientation

### Our Standards

**Examples of behavior that contributes to a positive environment:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

**Examples of unacceptable behavior:**
- Trolling, insulting/derogatory comments, personal or political attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have:
- Python 3.9 or higher
- Git
- A GitHub account
- Basic knowledge of:
  - Python programming
  - Git & GitHub
  - Financial concepts (optional but helpful)

### Fork & Clone

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
```bash
   git clone https://github.com/YOUR_USERNAME/Latest-Atlas-Code.git
   cd Latest-Atlas-Code
```

3. **Add upstream remote**:
```bash
   git remote add upstream https://github.com/davenompozolo-blip/Latest-Atlas-Code.git
```

### Setup Development Environment

1. **Create virtual environment**:
```bash
   python -m venv atlas_env
   source atlas_env/bin/activate  # On Windows: atlas_env\Scripts\activate
```

2. **Install dependencies**:
```bash
   pip install -r requirements.txt
   pip install pytest black flake8 mypy  # Development tools
```

3. **Copy environment template**:
```bash
   cp .env.example .env
   # Edit .env with your API keys
```

4. **Run tests**:
```bash
   python tests/test_all.py
```

5. **Verify setup**:
```bash
   streamlit run atlas_app.py
```

---

## 💡 How Can I Contribute?

### Reporting Bugs

**Before submitting a bug report:**
- Check the [existing issues](https://github.com/davenompozolo-blip/Latest-Atlas-Code/issues)
- Check the [documentation](docs/)
- Try to reproduce the bug with the latest version

**When submitting a bug report, include:**
- **Descriptive title** - Clear and specific
- **Steps to reproduce** - Detailed steps
- **Expected behavior** - What should happen
- **Actual behavior** - What actually happens
- **Screenshots** - If applicable
- **Environment**:
  - OS (e.g., Windows 10, macOS 13, Ubuntu 22.04)
  - Python version (e.g., 3.11.5)
  - ATLAS version (e.g., 10.0.0)
  - Browser (if UI issue)
- **Additional context** - Logs, error messages, etc.

**Example:**
```markdown
### Bug: Leverage calculation incorrect for 3x positions

**Steps to reproduce:**
1. Create portfolio with 3x leverage
2. Add position: $100 equity, $300 position
3. Position increases to $330
4. Check calculated return

**Expected:** 30% return
**Actual:** 10% return

**Environment:**
- OS: macOS 13
- Python: 3.11.5
- ATLAS: 10.0.0

**Error log:**
```
[Paste relevant logs here]
```
```

### Suggesting Enhancements

**Before submitting an enhancement:**
- Check if it's already suggested
- Check if it aligns with project goals
- Consider if it benefits most users

**When suggesting an enhancement:**
- **Clear title** - Describe the enhancement
- **Use case** - Why is it needed?
- **Proposed solution** - How should it work?
- **Alternatives** - Other approaches considered?
- **Additional context** - Mockups, examples, etc.

**Example:**
```markdown
### Enhancement: Add crypto portfolio support

**Use case:**
Many users hold cryptocurrency alongside traditional assets
and want unified portfolio tracking.

**Proposed solution:**
1. Add crypto data sources (Coinbase, CoinGecko)
2. Extend optimizer to handle 24/7 markets
3. Add crypto-specific risk metrics

**Alternatives:**
- Separate crypto-only tracking
- Integration with existing crypto platforms

**Mockup:**
[Attach screenshot or diagram]
```

### Code Contributions

Areas where we welcome contributions:

**High Priority:**
- 🐛 Bug fixes
- 📝 Documentation improvements
- 🧪 Test coverage
- ♿ Accessibility improvements
- 🌐 Internationalization

**Medium Priority:**
- ✨ New features (discuss first!)
- 🎨 UI/UX improvements
- ⚡ Performance optimizations
- 🔒 Security enhancements

**Low Priority:**
- 🎯 Code refactoring
- 📊 Additional visualizations
- 🔌 New integrations

---

## 🔄 Development Workflow

### 1. Create a Branch
```bash
# Update your fork
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
# OR for bugs
git checkout -b fix/bug-description
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation
- `test/` - Tests
- `refactor/` - Code refactoring
- `perf/` - Performance improvements

### 2. Make Changes

- Write clean, readable code
- Follow style guidelines (see below)
- Add tests for new features
- Update documentation
- Keep commits focused and atomic

### 3. Test Your Changes
```bash
# Run all tests
python tests/test_all.py

# Run specific tests
pytest tests/test_optimizer.py -v

# Check code style
black . --check
flake8 .

# Type checking
mypy quant_optimizer/ --ignore-missing-imports
```

### 4. Commit Changes
```bash
git add .
git commit -m "feat: add crypto portfolio support"
```

See [Commit Messages](#commit-messages) for guidelines.

### 5. Push & Create Pull Request
```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## 📝 Style Guidelines

### Python Code Style

We follow [PEP 8](https://pep8.org/) with some modifications:

**General:**
- Max line length: 100 characters (not 79)
- Use 4 spaces for indentation (no tabs)
- Use double quotes for strings
- Use type hints where possible

**Formatting:**
```python
# Good
def calculate_sharpe_ratio(
    returns: pd.Series,
    risk_free_rate: float = 0.03
) -> float:
    """
    Calculate Sharpe ratio.

    Args:
        returns: Daily returns series
        risk_free_rate: Annual risk-free rate

    Returns:
        Sharpe ratio
    """
    excess_returns = returns - risk_free_rate / 252
    return excess_returns.mean() / returns.std() * np.sqrt(252)
```

**Naming Conventions:**
- `snake_case` for functions and variables
- `PascalCase` for classes
- `UPPER_CASE` for constants
- `_private_method` for internal methods

**Imports:**
```python
# Standard library
import os
import sys
from pathlib import Path

# Third-party
import numpy as np
import pandas as pd
import streamlit as st

# Local
from quant_optimizer import MultivariablePortfolioOptimizer
from config import DEFAULT_LEVERAGE
```

### Documentation Style

**Docstrings:**
Use Google-style docstrings:
```python
def optimize_portfolio(
    returns: pd.DataFrame,
    constraints: PortfolioConstraints
) -> OptimizationResult:
    """
    Optimize portfolio allocation.

    This function finds the optimal portfolio weights that maximize
    the Sharpe ratio subject to the given constraints.

    Args:
        returns: DataFrame of daily returns (rows=days, columns=assets)
        constraints: Portfolio constraints (min/max weights, leverage)

    Returns:
        OptimizationResult containing optimal weights and metrics

    Raises:
        ValueError: If returns DataFrame is empty
        OptimizationError: If optimization fails to converge

    Example:
        >>> returns = pd.DataFrame(...)
        >>> constraints = PortfolioConstraints(max_leverage=2.0)
        >>> result = optimize_portfolio(returns, constraints)
        >>> print(result.sharpe_ratio)
        1.85
    """
```

**Comments:**
```python
# Good: Explain WHY, not WHAT
# Use 2σ threshold to detect outliers while avoiding false positives
outliers = np.abs(values - mean) > 2 * std

# Bad: Redundant comment
# Check if value is greater than threshold
if value > threshold:
```

### Markdown Style

- Use ATX-style headers (`#`)
- One blank line before and after headers
- Use fenced code blocks with language
- Use meaningful link text
- Break lines at sentences

---

## 🧪 Testing Guidelines

### Test Requirements

**All new code must include tests:**
- Unit tests for functions
- Integration tests for modules
- End-to-end tests for features

**Test Coverage:**
- Aim for >80% code coverage
- 100% for critical paths (optimization, risk calculations)

### Writing Tests
```python
# tests/test_optimizer.py

import pytest
import numpy as np
import pandas as pd
from quant_optimizer import MultivariablePortfolioOptimizer

class TestPortfolioOptimizer:
    """Tests for portfolio optimizer"""

    @pytest.fixture
    def sample_returns(self):
        """Generate sample returns data"""
        np.random.seed(42)
        return pd.DataFrame({
            'AAPL': np.random.normal(0.001, 0.02, 252),
            'GOOGL': np.random.normal(0.001, 0.02, 252)
        })

    def test_optimization_convergence(self, sample_returns):
        """Test that optimization converges"""
        optimizer = MultivariablePortfolioOptimizer(sample_returns)
        result = optimizer.optimize_sharpe()

        assert result.sharpe_ratio > 0
        assert abs(result.weights.sum() - 1.0) < 0.01

    def test_weights_respect_constraints(self, sample_returns):
        """Test that weights respect min/max constraints"""
        constraints = PortfolioConstraints(
            min_weight=0.2,
            max_weight=0.8
        )

        optimizer = MultivariablePortfolioOptimizer(sample_returns)
        result = optimizer.optimize_sharpe(constraints)

        assert all(result.weights >= 0.19)  # Allow small tolerance
        assert all(result.weights <= 0.81)

    def test_invalid_input_raises_error(self):
        """Test that invalid input raises appropriate error"""
        with pytest.raises(ValueError):
            optimizer = MultivariablePortfolioOptimizer(pd.DataFrame())
```

### Running Tests
```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_optimizer.py -v

# Run specific test
pytest tests/test_optimizer.py::TestPortfolioOptimizer::test_optimization_convergence -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Run fast tests only
pytest tests/ -m "not slow"
```

---

## 📝 Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding/updating tests
- `build`: Build system or dependencies
- `ci`: CI configuration
- `chore`: Maintenance tasks

### Examples

**Good:**
```
feat(optimizer): add support for short positions

Implement short selling capability in portfolio optimizer:
- Add long_only parameter to PortfolioConstraints
- Handle negative weights in optimization
- Update documentation with examples

Closes #42
```
```
fix(leverage): correct return calculation for 2x margin

Portfolio returns were calculated incorrectly for leveraged
positions. Changed formula from (value - cost) / cost to
(value - cost) / equity.

Before: 10% return (incorrect)
After: 20% return (correct)

Fixes #127
```

**Bad:**
```
update stuff
```
```
Fixed bug
```

---

## 🔀 Pull Request Process

### Before Submitting

**Checklist:**
- [ ] Code follows style guidelines
- [ ] All tests pass
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main
- [ ] No merge conflicts

### PR Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Testing
How was this tested?

## Screenshots
If applicable

## Checklist
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Code follows style guide

## Related Issues
Closes #XXX
```

### Review Process

1. **Automated checks** run (CI/CD)
2. **Code review** by maintainers
3. **Feedback** addressed
4. **Approval** from 1+ maintainers
5. **Merge** to main

**Review timeline:**
- Small PRs: 1-2 days
- Medium PRs: 3-5 days
- Large PRs: 1-2 weeks

### After Merge

- Your branch will be deleted
- Changes included in next release
- You'll be credited in CHANGELOG

---

## 👥 Community

### Communication Channels

- **GitHub Issues** - Bug reports, feature requests
- **GitHub Discussions** - Questions, ideas
- **Email** - davenompozolo@gmail.com

### Getting Help

**Stuck? Here's how to get help:**

1. **Check documentation** - docs/
2. **Search issues** - Someone may have asked already
3. **Ask in discussions** - Community can help
4. **Open an issue** - Describe your problem

**When asking for help:**
- Be specific
- Include code examples
- Show what you've tried
- Include error messages

### Recognition

Contributors are recognized in:
- README.md contributors section
- CHANGELOG.md for specific contributions
- GitHub contributors page

---

## 🎓 Learning Resources

**New to open source?**
- [First Contributions](https://github.com/firstcontributions/first-contributions)
- [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)

**Financial concepts:**
- Modern Portfolio Theory
- Sharpe Ratio calculation
- Monte Carlo simulation
- Risk metrics (VaR, CVaR)

**Python libraries:**
- [NumPy Documentation](https://numpy.org/doc/)
- [Pandas Documentation](https://pandas.pydata.org/docs/)
- [SciPy Optimization](https://docs.scipy.org/doc/scipy/reference/optimize.html)
- [Streamlit Documentation](https://docs.streamlit.io/)

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## 🙏 Thank You!

Thank you for taking the time to contribute! Every contribution, no matter how small, makes a difference.

**Happy coding! 🚀**

---

**Questions?** Contact davenompozolo@gmail.com
