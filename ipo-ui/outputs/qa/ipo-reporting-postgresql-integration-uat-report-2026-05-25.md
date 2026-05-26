# IPO Reporting and PostgreSQL Integration QA/UAT Report

**Report Date:** 2026-05-25 11:51 ICT  
**Environment:** Local IPO UI workspace connected to PostgreSQL via `DATABASE_URL`  
**Scope:** IPO Reporting, PostgreSQL integration, reporting queries, data joins, completeness checks, scraper console output, and scraper dry-run performance  
**Execution Mode:** Database checks executed in `BEGIN READ ONLY` transaction and rolled back. Scraper executed with `--dry-run`, so database writes were skipped.

## Executive Summary

The IPO Reporting and PostgreSQL integration is operational. Core PostgreSQL connectivity, IPO table reads, financial joins, aggregation queries, ranking calculations, and scraper console formatting passed. No database transaction failure or unresolved validation result was detected during the test window.

The system is not fully production-clean from a data-quality perspective. Several warnings were found around missing market values, missing financial fields, incomplete completeness scores, upcoming IPO listing dates, and relation sync gaps for some underwriter/FA records.

**Overall System Status:** WARNING  
**Production Readiness:** Conditional readiness. The system is functionally ready for controlled production use, but data-quality remediation should be completed before relying on all analytics as final management reporting.

## Test Execution Metrics

| Metric | Result |
|---|---:|
| PostgreSQL connection time | 992.05 ms |
| Query suite total time | 3,100.84 ms |
| Query count | 18 |
| Average query time | 172.27 ms |
| Slowest query | 308.14 ms, executive ownership detection |
| Query suite peak memory | 0.06 MB, Python measurement context |
| Scraper dry-run execution time | 1.92 s |
| Scraper peak working set | 96.49 MB |
| Scraper exit code | 0 |
| Records loaded from `ipos` | 558 |
| Financial records loaded | 558 |
| Underwriter links loaded | 3,353 |
| FA links loaded | 589 |
| Scrape runs in DB | 16 |
| Database transaction status | READ ONLY transaction rolled back, no data mutation |

## Data Volume Snapshot

| Dataset | Count |
|---|---:|
| Total IPO records | 558 |
| Listed IPOs | 548 |
| Upcoming IPOs | 9 |
| Cancelled IPOs | 1 |
| Financial records | 558 |
| Underwriter master records | 54 |
| IPO-underwriter relation rows | 3,353 |
| FA company master records | 117 |
| IPO-FA relation rows | 589 |
| Unresolved validation results | 0 |

## Query Performance Summary

| Query Area | Execution Time |
|---|---:|
| Connection probe | 125.58 ms |
| Table existence check | 145.41 ms |
| View existence check | 124.28 ms |
| Record counts | 168.41 ms |
| IPO table sample query | 119.25 ms |
| Financial join integrity | 139.40 ms |
| Underwriter relation integrity | 164.54 ms |
| FA relation integrity | 166.90 ms |
| Upcoming IPO filtering | 204.88 ms |
| Market distribution aggregation | 204.65 ms |
| Top IPO ranking | 205.75 ms |
| Net income average | 204.80 ms |
| Completeness score | 204.25 ms |
| Missing financial detection | 204.49 ms |
| Executive ownership detection | 308.14 ms |

## Test Cases

| Test Case ID | Scenario | Expected Result | Actual Result | Status | Notes |
|---|---|---|---|---|---|
| TC-001 | PostgreSQL connection success | Application can connect to PostgreSQL and run a basic probe query. | Connection succeeded via `DATABASE_URL`. PostgreSQL version reported: PostgreSQL 17.6. Connection time was 992.05 ms. | PASS | Database name resolved as `postgres`; user resolved as `postgres`. |
| TC-002 | Environment variables loading | Required database configuration loads from environment without exposing secrets. | `.env.local`/environment loaded successfully. `DATABASE_URL` is present. `POSTGRES_HOST` and `POSTGRES_DB` are not set, but the application and scraper now support `DATABASE_URL`. | PASS | No secret value was printed in the report. |
| TC-003 | IPO table query success | `ipos` table can be queried and returns records. | `ipos` query returned 558 records. Sample query returned 10 rows with valid symbols and statuses. | PASS | Status distribution: listed 548, upcoming 9, cancelled 1. |
| TC-004 | Financial data join correctness | Every financial row joins to a valid IPO and no orphan financial record exists. | `ipos` to `ipo_financials` join returned 558 joined rows. 558 records have financial rows. Orphan financial rows: 0. | PASS | 1:1 financial coverage is structurally correct. |
| TC-005 | Underwriter relation join correctness | Underwriter relation rows join to IPO and underwriter master tables without broken references. | 3,353 relation rows joined successfully. Broken links: 0. Lead links: 729. Co-underwriter links: 2,624. | WARNING | Raw lead underwriter arrays exist for 548 IPOs, but only 547 IPOs have lead relation links. Sample gap: `TECH`. |
| TC-006 | FA company/person joins | FA relations join to IPO and FA company master tables without broken references. | 589 FA relation rows joined successfully. Broken links: 0. Person-level links: 438. | WARNING | Raw FA arrays exist for 552 IPOs, but only 541 IPOs have FA relation links. Sample gaps: `BAFS`, `FLE`, `MER`, `PETPAL`, `PHAT`, `QUICK`, `SUEN`, `TEBP`, `TECH`, `TIPAK`, `TNCC`. |
| TC-007 | Upcoming IPO filtering | `v_upcoming_ipos` should match `ipos.status = 'upcoming'` and return only upcoming IPOs. | `ipos` upcoming count: 9. `v_upcoming_ipos` count: 9. Past listing dates: 0. | WARNING | Filtering is correct, but all 9 upcoming rows currently have `listing_date` as null, so `days_until` cannot be calculated. |
| TC-008 | Market distribution aggregation | Aggregation by market should sum to total IPO count and expose market distribution. | Aggregation returned 558 total records: missing 274, SET 166, mai 117, MKL 1. | WARNING | Query is correct, but 274 listed records have missing market values. This affects market-level reporting quality. |
| TC-009 | Top IPO ranking calculation | Top IPO ranking by day-1 return should calculate from `close_d1` and `ipo_price`. | Top ranking query returned 10 rows. Top record was `UTP` with 788.00% day-1 return. | PASS | Calculation uses `(close_d1 - ipo_price) / ipo_price * 100` and excludes null/zero IPO prices. |
| TC-010 | Net income average calculation | Average net income should compute over non-null `net_income_latest` values. | 207 rows have `net_income_latest`. Average net income: 7,614,431,248.14. Min: -17,853,005.00. Max: 1,520,000,000,000.00. | WARNING | Calculation succeeds, but coverage is only 207 of 558 and the very high maximum may materially skew the average. |
| TC-011 | Completeness score calculation | Completeness scores should be within 0-100 and calculated for all IPOs. | 558 rows calculated. Average completeness: 61.15%. Min: 27.8%. Max: 100.0%. Invalid scores: 0. | WARNING | Formula is valid, but 425 rows are incomplete. Lowest examples include `A`, `BKD`, `MATCH`, `PHAT`, `PRINC`, `SC`, `TPAC`, `YUASA`. |
| TC-012 | Missing financial detection | Missing financial fields should be detectable through `v_ipo_missing_fields`. | Missing financial fields were detected across 11 financial dimensions. Highest missing counts: total_assets 352, total_equity 352, total_liabilities 352, net_income_latest 351, revenue_latest 351. | WARNING | Detection works, but the volume of missing financial data is high and should be prioritized for remediation. |
| TC-013 | Executive ownership > 50% detection | IPOs with executive ownership above 50% should be identifiable for review. | 76 records have `executive_total_pct > 50`. Examples include `TIPAK` 100.00%, `SUEN` 99.85%, `PROS` 90.00%, `SNNP` 85.00%, `BGRIM` 79.77%. | WARNING | Detection works. High concentration values are not system errors but should be visible in risk/ownership review workflows. |
| TC-014 | Console report formatting | Scraper console output should be readable, compact, and should not emit escaped Thai text. | Dry-run output contained `Scrape summary:` and did not contain escaped Thai Unicode sequences. Output length was 6,720 characters. | PASS | Console output was reduced from a wide pandas table to compact per-symbol summary lines. |
| TC-015 | Script execution performance | Scraper dry-run should complete successfully within an acceptable runtime budget. | `python scripts/scrape_upcoming_ipos.py --dry-run` completed in 1.92 s with exit code 0. Peak working set was 96.49 MB. | PASS | Performance benefited from warmed SEC page/document cache. Cold-cache runs may be slower due to SEC network latency. |

## Anomalies and Missing Data Observed

| Area | Observation | Impact |
|---|---|---|
| Market values | 274 listed IPO records have missing `market`. | Market distribution and market-filtered reports may be incomplete. |
| Upcoming IPO dates | 9 of 9 upcoming IPOs have null `listing_date`. | `days_until` and scheduling-oriented reports cannot calculate countdowns from DB data. |
| Underwriter relation sync | 1 IPO has raw lead underwriter data but no lead relation link. | Underwriter analytics may miss one IPO unless relation sync is corrected. |
| FA relation sync | 11 IPOs have raw FA company data but no FA relation link. | FA analytics and FA/person reports may undercount these IPOs. |
| Financial completeness | 425 of 558 IPOs are incomplete. | Production analytics are operational but should carry data-quality caveats. |
| Financial fields | Multiple financial dimensions have 278-352 missing values. | Financial KPI coverage is partial, especially balance sheet and income fields. |
| Net income average | Average is influenced by a maximum value of 1.52T. | Consider median, trimmed mean, or outlier review for management dashboards. |
| Executive ownership | 76 records exceed 50% executive ownership. | Not a defect, but useful for governance/risk reporting. |

## Database Transaction Status

All SQL validation queries were executed inside a read-only transaction. The transaction was rolled back after completion.

| Transaction Attribute | Result |
|---|---|
| Mode | READ ONLY |
| Mutation performed | No |
| Rollback status | Successful |
| Validation result side effects | None |

## Memory and Runtime Observations

| Component | Observation |
|---|---|
| Query suite | Peak measured Python memory context was 0.06 MB. Query workload was lightweight and bounded. |
| Scraper dry-run | Peak process working set was 96.49 MB. Runtime was 1.92 s with warmed cache. |
| PostgreSQL queries | Slowest query was executive ownership detection at 308.14 ms. No query exceeded 1 second. |
| SEC scraper cache | Warmed SEC cache materially improves runtime. Cold-cache execution remains dependent on SEC site response time. |
| Console output | Compact format is suitable for scraper history logs and avoids overly wide table output. |

## Final Summary

| Summary Item | Count |
|---|---:|
| PASS | 7 |
| WARNING | 8 |
| FAIL | 0 |
| Total Test Cases | 15 |

**Overall System Status:** WARNING  
**Readiness for Production:** Conditional Go

The system is functionally ready for controlled production use. PostgreSQL connectivity, schema availability, joins, views, aggregations, ranking calculations, scraper formatting, and dry-run performance are acceptable. Before full production sign-off, the team should remediate missing market values, upcoming listing dates, financial field gaps, and relation sync discrepancies for underwriter and FA joins.
