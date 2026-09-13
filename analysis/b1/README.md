# B1 · factor model validation

Reproduces the published `book_factor_betas` estimate set, then runs the
diagnostics in `docs/B1_FACTOR_MODEL_VALIDATION_SPEC.md` against it.

```bash
export SB_ANON='<supabase anon key>'   # never commit this
export B1_DATA=./data                  # where the fetched json lands
python3 fetch.py                       # pulls equity curve, SPY, axis scores, betas
python3 repro.py                       # MUST reproduce the published betas first
python3 b1.py                          # the diagnostics; writes $B1_DATA/result.json
```

`repro.py` is not optional. It is what makes the diagnostics a statement about
the model rather than about the arithmetic, and it is what caught that the
market term is SPY **`adj_close`** and not `close` — the two differ enough to
change the market beta in the third decimal while still looking like a
successful reproduction.

Findings are written up in `docs/B1_FACTOR_MODEL_VALIDATION_REPORT.md` and
persisted to `public.book_model_diagnostics`.
