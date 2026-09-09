# C2 — Axis orientation, stated in data

**Applied 2026-09-09** to `vdmojjszvvcithuxwexx`.
Migration `20260909124500_c2_state_axis_orientation_in_data.sql`.

## What changed

Two columns on `factor_axes`, both `NOT NULL`. Nothing else. **No axis renamed, no
loading flipped, no stored score or beta touched.**

| axis_key | pc_rank | pc_sign_flipped | positive_means |
|---|---:|---|---|
| `cyclical` | 1 | `false` | risk appetite rising: cyclicals, credit and inflation-sensitives leading, gold lagging |
| `concentration` | 2 | `true` | leadership narrowing into mega-cap growth; QQQ/SPY rising, DIA/SPY and RSP/SPY falling |
| `dollar` | 3 | `true` | dollar strengthening; EEM/SPY, GLD/SPY and IWM/SPY falling |

`positive_means` also carries a non-blank CHECK. `NOT NULL` alone would admit an
empty string, which reads as documented while saying nothing — the same guard
`market_instruments.caveats` carries in A0.

## The orientation was verified, not assumed

The withdrawn rename would have required flipping the loadings back, invalidating
every row of `factor_axis_scores` and every beta in `book_factor_betas` — an
append-only history that cannot be restated. So the stored orientation was checked
before anything was written, two ways, and both agree it is already correct.

**Against the derivation.** `20260908190632_b0_persist_a1_axes_and_loadings.sql`
records the sign decision explicitly: cyclical PC1 as computed, concentration PC2
negated, dollar PC3 negated. That is where `pc_sign_flipped` comes from.

**Against the loadings themselves**, which is the check that does not depend on
trusting the note. Each stored vector points at the thing the spec's
`positive_means` string names:

| axis | top positive loadings | top negative loadings | agrees with `positive_means`? |
|---|---|---|---|
| `cyclical` | `xli_xlu` +0.405, `xle_xlu` +0.370, `xly_xlp` +0.370, `hyg_tlt` +0.368 | `gld_spy` −0.350 | yes — cyclicals and credit up, gold down |
| `concentration` | `qqq_spy` +0.546 | `dia_spy` −0.472, `rsp_spy` −0.466 | yes — exactly the three pairs named |
| `dollar` | `hyg_tlt` +0.371 | `gld_spy` −0.504, `iwm_spy` −0.472, `eem_spy` −0.427 | yes — exactly the three pairs named |

## One caveat on `pc_sign_flipped`

An eigenvector's raw sign is solver-dependent: a different LAPACK build can return
the negated vector for the same matrix, and `variance_explained` is sign-invariant
either way. So `pc_sign_flipped` is only meaningful **relative to the A1 derivation
recorded in the B0 migration**, and it is documented in the column comment as
provenance for auditing rather than as a rendering control.

`positive_means` has no such dependency. **Render from `positive_means`; audit with
`pc_sign_flipped`.** That distinction is the reason the question is now closed
rather than settled once.

## Not done — deliberately

- No rename of `concentration`, and no loading flipped. See above.
- No UI change. Surfaces now *can* read `positive_means`; making them do so is not
  in this unit's scope.
