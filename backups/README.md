# Storage backup, 2026-10-05

Exported from Supabase project `vdmojjszvvcithuxwexx` before rows were deleted
to bring the database under the Free plan's 500 MB (ST-1). One JSON object per
line, gzipped, columns exactly as the table had them.

| file | rows | what was deleted from the database |
|---|---:|---|
| `company_reported_lines.jsonl.gz` | 145,552 | all of it (Finnhub as-reported XBRL lines for 101 financial filers) |
| `regime_theme_states.jsonl.gz` | 18,538 | all of it (`logic_version = 'v0-uncalibrated'` only; v0.1 kept) |
| `fund_prices_raw.jsonl.gz` | 265,837 | every row except the latest per (source, fund_code) |

Restore a table (example):

```sql
insert into public.company_reported_lines
select * from jsonb_populate_recordset(null::public.company_reported_lines, $1::jsonb)
on conflict do nothing;
```

`regime_theme_states` is append-only by trigger; inserts are allowed.
