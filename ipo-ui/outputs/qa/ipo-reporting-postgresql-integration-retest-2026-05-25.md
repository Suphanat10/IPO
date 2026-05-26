# IPO Reporting และ PostgreSQL Integration Retest Report

**วันที่ทดสอบซ้ำ:** 2026-05-25 12:21 ICT  
**Scope:** นำ feedback จาก QA/UAT รอบก่อนมาปรับปรุงระบบ แล้วทดสอบซ้ำ PostgreSQL integration, relation sync, validation rules, scraper runtime และ build readiness  
**Environment:** Local IPO UI workspace + PostgreSQL ผ่าน `DATABASE_URL`

## สิ่งที่ปรับปรุง

| Area | Improvement | Result |
|---|---|---|
| Environment loading | `scripts/run-validations.mjs` และ `scripts/import-csv-to-db.mjs` รองรับ `DATABASE_URL` แล้ว | Validation runner ใช้งานได้โดยไม่ต้องมี `POSTGRES_HOST/POSTGRES_DB` |
| Underwriter/FA relation sync | เพิ่มการ sync junction tables หลัง CSV import และหลัง upcoming scraper live upsert | Relation gaps ลดจาก lead 1 / FA 11 เป็น 0 / 0 |
| Validation rules | เพิ่ม rules สำหรับ missing market, upcoming missing listing date, upcoming missing IPO price, relation gaps และ executive ownership > 50% | Data-quality feedback ถูกจับเป็น warning/info อย่างเป็นระบบ |
| Blocking severity | แยก `missing_ipo_price` ของ listed เป็น error แต่ upcoming ที่ยังไม่ประกาศราคาเป็น warning | Validation retest ไม่มี blocking error |
| Scraper runtime | ทดสอบ dry-run อีกครั้งด้วย warmed SEC cache | สำเร็จในประมาณ 3.1 วินาที, exit code 0 |

## Retest Metrics

| Metric | Result |
|---|---:|
| Records loaded from `ipos` | 558 |
| Financial records loaded | 558 |
| Underwriter relation rows | 3,358 |
| FA relation rows | 600 |
| Underwriter relation gaps | 0 |
| FA relation gaps | 0 |
| Validation runtime | 877 ms |
| Validation blocking errors | 0 |
| Validation warnings | 1,325 |
| Validation info | 426 |
| Scraper dry-run runtime | ~3.1 s |
| Build status | PASS |

## Test Cases

| Test Case ID | Scenario | Expected Result | Actual Result | Status | Notes |
|---|---|---|---|---|---|
| TC-001 | PostgreSQL connection success | Connect to PostgreSQL and execute validation queries. | Connection via `DATABASE_URL` succeeded. Validation completed in 877 ms. | PASS | No `POSTGRES_HOST/POSTGRES_DB` required. |
| TC-002 | Environment variables loading | Scripts load DB config from environment without exposing secrets. | `DATABASE_URL` loaded successfully by validation/import scripts. | PASS | Secret values were not printed. |
| TC-003 | IPO table query success | `ipos` table returns records. | Loaded 558 IPO records. Status: listed 548, upcoming 9, cancelled 1. | PASS | Query layer operational. |
| TC-004 | Financial data join correctness | Every financial row joins to a valid IPO. | Loaded 558 financial records for 558 IPOs. | PASS | Structural coverage remains 1:1. |
| TC-005 | Underwriter relation join correctness | Raw lead underwriter arrays are synced to relation table. | Underwriter relation rows increased to 3,358 and lead relation gap is now 0. | PASS | Improved from previous warning. |
| TC-006 | FA company/person joins | Raw FA arrays are synced to relation table. | FA relation rows increased to 600 and FA relation gap is now 0. | PASS | Improved from previous warning. |
| TC-007 | Upcoming IPO filtering | `v_upcoming_ipos` matches `ipos.status = 'upcoming'`. | `ipos` upcoming count 9; `v_upcoming_ipos` count 9. | WARNING | Filtering is correct, but all 9 upcoming IPOs still have null `listing_date`. |
| TC-008 | Market distribution aggregation | Market aggregation should sum to total IPO count. | Aggregation totals 558: missing 274, SET 166, mai 117, MKL 1. | WARNING | Missing market values remain a data backlog and are now tracked by validation. |
| TC-009 | Top IPO ranking calculation | Day-1 return ranking calculates from `close_d1` and `ipo_price`. | Top IPO remains `UTP` with 788.00% day-1 return. | PASS | Calculation remains correct. |
| TC-010 | Net income average calculation | Average net income computes over non-null values. | 207 rows have `net_income_latest`; average 7,614,431,248.14; max 1.52T. | WARNING | Calculation works, but outlier skew remains a reporting caveat. |
| TC-011 | Completeness score calculation | Scores stay within 0-100 for all IPOs. | 558 rows calculated; avg 61.15%, min 27.8%, max 100.0%, incomplete 425. | WARNING | Formula valid; data completeness backlog remains. |
| TC-012 | Missing financial detection | Missing financial fields are detectable. | Top missing fields: total_assets/equity/liabilities 352, net_income_latest 351, revenue_latest 351. | WARNING | Detection is working; remediation still required. |
| TC-013 | Executive ownership > 50% detection | Concentrated ownership should be visible for review. | 76 records detected as `high_exec_ownership` info. | WARNING | Not a defect; now tracked as info-level governance signal. |
| TC-014 | Console report formatting | Scraper output is compact and Thai text is readable. | Dry-run output used compact summary lines and rendered Thai text correctly. | PASS | Wide pandas table output did not reappear. |
| TC-015 | Script execution performance | Scraper dry-run completes successfully within runtime budget. | `python scripts/scrape_upcoming_ipos.py --dry-run` completed successfully in ~3.1 s. | PASS | Warmed SEC cache; cold-cache runtime still depends on SEC latency. |

## Summary

| Summary Item | Count |
|---|---:|
| PASS | 9 |
| WARNING | 6 |
| FAIL | 0 |
| Total Test Cases | 15 |

**Overall system status:** PASS with data-quality warnings  
**Readiness for production:** Conditional Go

ระบบดีขึ้นจากรอบก่อนในส่วน integration และ relation integrity โดยไม่มี blocking errors หลัง validation ใหม่ จุดที่ยังเหลือเป็น backlog ด้านคุณภาพข้อมูล ได้แก่ market, upcoming listing_date/IPO price, financial fields, completeness และ ownership concentration ซึ่งถูกติดตามผ่าน validation rules แล้ว.
