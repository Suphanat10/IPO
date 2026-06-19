# Admin Dashboard Setup

End-to-end guide for wiring the `/ipo` admin dashboard to a real PostgreSQL
database, including a Supabase-hosted Postgres project, and importing the existing
CSV data. Skip steps that already apply to your environment.

## 1. Create the database

1. Sign in to https://supabase.com and create a new project (Region: `Singapore` is closest to Thai users).
2. From **Project Settings -> API**, copy these only if you still use the import/export scripts that call Supabase APIs:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (keep secret) → `SUPABASE_SERVICE_ROLE_KEY`
3. From **Project Settings -> Database**, copy the direct Postgres connection string for `psql` → `DATABASE_URL` (replace `[YOUR-PASSWORD]`). The admin app uses this direct PostgreSQL connection.

## 2. Configure local environment

```bash
cd ipo-ui
cp .env.example .env.local
# fill in DATABASE_URL first, then any Supabase API variables needed by scripts
```

The admin UI reads `DATABASE_URL` through `src/lib/db.ts`. The older Supabase API
variables are only for scripts that still call Supabase APIs directly.

## 3. Apply the database schema

You can either paste each migration into the Supabase SQL Editor in order, or use
the Supabase CLI:

```bash
# from repo root
supabase link --project-ref <your-project-ref>
supabase db push
```

Order matters — apply them sequentially:

| File | What it does |
| --- | --- |
| `0001_init_schema.sql` | Core tables: `ipos`, `ipo_financials`, `validation_*`, `build_runs`, `build_logs`, `sync_jobs`, `fa_normalizations`, `sectors` |
| `0002_views.sql` | `v_ipo_completeness`, `v_dashboard_stats`, `v_upcoming_ipos` |
| `0003_validation_rules_seed.sql` | Seeds validation rules + defines `run_validations()` |
| `0004_rls.sql` | Row-Level Security policies (admins only) |
| `0005_underwriters_fa_companies.sql` | `underwriters`, `fa_companies` directories + junction tables + stats views + missing-fields/recent-updates views + `sync_underwriters_from_ipos()` |
| `0006_widen_numeric.sql` | Widens numeric fields for larger IPO data |
| `0007_expand_completeness.sql` | Expands completeness checks |
| `0008_postgres_admin_auth.sql` | Adds `first_name`, `last_name`, `password_hash`, and admin email uniqueness for PostgreSQL auth |

## 4. Import the CSV data

```bash
cd ipo-ui
node scripts/import-csv-to-db.mjs --dry-run   # sanity check
node scripts/import-csv-to-db.mjs             # real import
```

The importer:

1. Inserts `sectors`, `fa_normalizations`, `ipos`, `ipo_financials`.
2. Calls `sync_underwriters_from_ipos()` to populate the directories + junction tables.
3. Calls `run_validations()` to detect data-quality issues.
4. Records the run in `sync_jobs` so `/ipo/sync` and the dashboard pick it up.

Run with `--dry-run` first to verify CSV parsing before writing anything.

## 5. Access & authentication

This app ships with **no built-in authentication** — it is a single-user personal
tool. The `/ipo` dashboard and its mutation APIs are open to anyone who can reach
the app, so it must run behind a network boundary (private host, VPN, or a
reverse-proxy that enforces access) rather than being exposed publicly.

The only request gate is on the cron entry `GET /api/ipo/upcoming/scrape`: set
`CRON_SECRET` (and the matching value in your Vercel project) to require an
`Authorization: Bearer <CRON_SECRET>` header. See `.env.example`.

## 6. Periodic re-validation

`scripts/run-validations.mjs` calls `run_validations()` and records a row in
`build_runs` + `build_logs`. Schedule it via cron / GitHub Actions:

```bash
node scripts/run-validations.mjs --cron --json
```

Exit code 2 means blocking errors remain — handy for CI gates.

## 7. Without a database

If `DATABASE_URL` is unset, admin data pages fall back to mock data where
available so you can preview the UI offline.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Module not found: `@mui/icons-material/X`" | Check the icon name — some MUI icons need the `Outlined`/`Rounded` suffix. |
| Import shows `(skipped — migration 0005 may not be applied)` | Apply `0005_underwriters_fa_companies.sql` and re-run. |
| Validation runner exits 2 | At least one blocking `error` rule fires. Visit `/ipo/validation`. |
