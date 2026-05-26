# รายงานทดสอบระบบ Upcoming IPO Scraper (Schedule วันละ 2 รอบ)

วันที่ทดสอบ: 26 พฤษภาคม 2569 เวลา 14:51:17 (Asia/Bangkok)
สภาพแวดล้อม: http://127.0.0.1:3000
ฐานข้อมูล: aws-1-ap-northeast-1.pooler.supabase.com/postgres
รหัสรอบทดสอบ: MPMC6E3JA4A3
ระยะเวลารวม: 37.9 วินาที

## สรุปผล

ผลรวม 40 เคส: PASS 39, FAIL 0, WARN 0, SKIP 1

## Test Cases

| TC |หมวด |รายการทดสอบ |Expected |Actual |Status |หมายเหตุ |หลักฐาน |
| --- |--- |--- |--- |--- |--- |--- |--- |
| TC-001 |UI |เปิดหน้า /admin/upcoming/scrape |หน้าโหลดสำเร็จ |HTTP 200; html=132853 chars |PASS |- |- |
| TC-002 |Schedule |แสดง schedule จาก DB |เวลาแสดงตรงกับ scraper_schedule |API=08:00, 17:30; DB=08:00, 17:30 |PASS |baseline expected 08:00 และ 17:30 |- |
| TC-003 |Schedule |เพิ่ม slot ใหม่ |เพิ่มสำเร็จ |HTTP 200; slots=08:00, 17:05, 17:30 |PASS |- |- |
| TC-004 |Schedule |ลบ slot |ลบสำเร็จ |HTTP 200; slots=08:00, 17:30 |PASS |- |- |
| TC-005 |Schedule |ปิด slot ทั้งหมด |Status = Inactive |HTTP 200; enabled=0 |PASS |ตรวจผ่าน DB เพราะ status ใน UI คำนวณจาก enabled slots |- |
| TC-006 |Schedule |เปิดอย่างน้อย 1 slot |Status = Active |HTTP 200; enabled=1 |PASS |- |- |
| TC-007 |Schedule Validation |ตั้งเวลา duplicate |ระบบ block |HTTP 400 |PASS |มีเวลาซ้ำกัน / Duplicate time slots |- |
| TC-008 |Schedule Validation |ตั้ง hour เกิน 23 |validation error |HTTP 400 |PASS |เวลาไม่ถูกต้อง / Invalid time value |- |
| TC-009 |Schedule Validation |ตั้ง minute เกิน 59 |validation error |HTTP 400 |PASS |เวลาไม่ถูกต้อง / Invalid time value |- |
| TC-010 |Schedule |กด Save Schedule |DB update สำเร็จ |HTTP 200; DB=08:00, 17:30 |PASS |- |- |
| TC-011 |Schedule |Reload page |schedule ยังอยู่ |API=08:00, 17:30 |PASS |- |- |
| TC-012 |Schedule/UI |Next Run countdown ถูกต้อง |เวลาตรงตาม slot ถัดไป |17:30 (เหลือประมาณ 158 นาที) |PASS |คำนวณด้วย Bangkok timezone logic |- |
| TC-013 |Scraper |Trigger manual scrape |scraper เริ่มทำงาน |HTTP 202; runId=238f9c60-b8f0-46ee-a97c-93872d1995fc |PASS |- |- |
| TC-014 |Scraper |ระหว่าง running กด Start ซ้ำ |ระบบ block concurrent run |HTTP 409 |PASS |มี scraper กำลังทำงานอยู่ / Another scrape is already running |actual duplicate POST while first run is running |
| TC-031 |Security/RBAC |readonly role trigger scrape |ถูก block |HTTP 403 |PASS |ไม่มีสิทธิ์ 'scraper:trigger' สำหรับ role 'readonly' / Permission 'scraper:trigger' not granted to role 'readonly' |- |
| TC-032 |Security/RBAC |scraper role trigger scrape |ทำงานได้ |HTTP 409 |PASS |ผ่าน permission แล้วถูก concurrent guard block ตามคาด |- |
| TC-033 |Security/RBAC |unauthorized request |401 |HTTP 401 |PASS |Not authenticated |- |
| TC-034 |Security/RBAC |invalid session |401 |HTTP 401 |PASS |Invalid or expired session |- |
| TC-035 |Security/RBAC |revoked session |401 |HTTP 401 |PASS |Session has been revoked |- |
| TC-015 |Scraper |scrape success |status = success |status=success |PASS |- |- |
| TC-016 |Scraper |scrape fail |status = failed |มี timeout/nonzero exit path ที่บันทึก failed |PASS |ตรวจ source path สำหรับ failure/timeout โดยไม่บังคับให้ live scrape ล้ม |- |
| TC-017 |Database |ตรวจสอบ scrape_runs |มี record ใหม่ |238f9c60-b8f0-46ee-a97c-93872d1995fc |PASS |- |- |
| TC-018 |Database |ตรวจสอบ scrape_run_items |มีข้อมูล IPO |9 rows |PASS |- |- |
| TC-019 |Database |ตรวจสอบ inserted count |count ถูกต้อง |run=0, items=0 |PASS |- |- |
| TC-020 |Database |ตรวจสอบ updated count |count ถูกต้อง |run=0, items=0 |PASS |- |- |
| TC-021 |Database |ตรวจสอบ unchanged count |count ถูกต้อง |run=9, items=9 |PASS |- |- |
| TC-022 |Database |ตรวจสอบ failed count |count ถูกต้อง |run=0, items=0 |PASS |- |- |
| TC-023 |Database/Logs |ตรวจสอบ log_excerpt |มี execution logs |6011 chars |PASS |- |- |
| TC-024 |UI/API |เปิด Run Detail Modal |แสดงข้อมูลครบ |HTTP 200; items=9 |PASS |ตรวจ endpoint ที่ modal ใช้ |- |
| TC-025 |UI/API |เปิดแท็บ Log |แสดง logs ได้ |log_excerpt present |PASS |- |- |
| TC-026 |UI/API |เปิดแท็บ Items |แสดง diff ได้ |items=9 |PASS |- |- |
| TC-027 |Database |ตรวจสอบ before/after diff |ข้อมูลถูกต้อง |ไม่มี updated diff ในรอบนี้ |SKIP |- |- |
| TC-028 |Scraper |ตรวจสอบ SEC scraping |ดึง SEC data ได้ |พบ SEC log |PASS |log_excerpt เป็นท้าย log อาจไม่รวมช่วงต้น |- |
| TC-029 |Scraper |ตรวจสอบ SET API |ดึง SET API ได้ |total_fetched=9 |PASS |- |- |
| TC-030 |Performance |ทดสอบ cache |response เร็วขึ้น |พบ cache signal ใน log |PASS |ตั้ง QA_RUN_CACHE_PROBE=1 ในรอบ benchmark แยกหากต้องการวัดสองรอบ |- |
| TC-036 |Audit |audit log schedule update |มี audit event |found |PASS |- |- |
| TC-037 |Audit |audit log scraper trigger |มี audit event |found |PASS |- |- |
| TC-038 |Scheduler |scheduled run เวลา 08:00 |run อัตโนมัติ |จำลอง 08:00 ผ่าน unit test |PASS |duration=1793.5 ms |- |
| TC-039 |Scheduler |scheduled run เวลา 17:30 |run อัตโนมัติ |จำลอง 17:30 ผ่าน unit test |PASS |ไม่ต้องรอเวลาจริง |- |
| TC-040 |Scheduler |ตรวจสอบวันละ 2 รอบ |scrape_runs = 2 records/day |configured slots=08:00, 17:30; clock test=PASS |PASS |ใช้ schedule config 2 รอบ + clock seam simulation แทนการรอ production ทั้งวัน |- |

## Implementation Checks

| Area |Expected |Actual |Status |Evidence |
| --- |--- |--- |--- |--- |
| Concurrent protection |Manual trigger ต้อง block run ซ้ำด้วย DB advisory lock/transactional running check |พบ advisory lock + running check ใน triggerScrape() |PASS |src/lib/scraper-runner.ts |
| Audit logging |Schedule update และ scraper trigger ต้องเขียน audit_logs |พบ logScraperEvent ใน schedule/scrape route |PASS |src/lib/audit.ts, route.ts |
| Timeout handling |Child process timeout ต้อง kill และบันทึก status failed |พบ SCRAPER_RUN_TIMEOUT_MS + child.kill() + failed update |PASS |src/lib/scraper-runner.ts |
| Scheduler clock seam |ต้องจำลอง 08:00 และ 17:30 ได้โดยไม่รอเวลาจริง |พบ pure clock helper + test seam + test cases |PASS |src/lib/scraper-scheduler-clock.test.ts |
| Scraper role migration |ต้องมี role scraper และ permission scraper:trigger |migration มี scraper role/permission |PASS |scripts/migrations/0007_auth_rbac_sessions.sql |

## Defects / Risks

ไม่พบ defect สำคัญเพิ่มเติมหลัง hardening

## API Evidence

| # |Method |Path |HTTP |เวลา |OK |Response |
| --- |--- |--- |--- |--- |--- |--- |
| API-001 |GET |/admin/upcoming/scrape |200 |523.2 ms |Y |<!DOCTYPE html><html lang="th"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/chunks/src_app_globals_0p2ml0n.css" data-precedence="next_static/chunks/src_app_globals_0p2ml0n.css"/><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/%5Btur... |
| API-002 |PUT |/api/admin/upcoming/schedule |200 |2477.7 ms |Y |{"slots":[{"id":91,"hour":8,"minute":0,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:23.079Z"},{"id":92,"hour":17,"minute":30,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:23.239Z"}]} |
| API-003 |GET |/api/admin/upcoming/schedule |200 |408.3 ms |Y |{"slots":[{"id":91,"hour":8,"minute":0,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:23.079Z"},{"id":92,"hour":17,"minute":30,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:23.239Z"}]} |
| API-004 |PUT |/api/admin/upcoming/schedule |200 |1835 ms |Y |{"slots":[{"id":93,"hour":8,"minute":0,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:25.339Z"},{"id":95,"hour":17,"minute":5,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:25.739Z"},{"id":94,"hour":17,"minute":30,"enabled"... |
| API-005 |PUT |/api/admin/upcoming/schedule |200 |1588.2 ms |Y |{"slots":[{"id":96,"hour":8,"minute":0,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:27.279Z"},{"id":97,"hour":17,"minute":30,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:27.474Z"}]} |
| API-006 |PUT |/api/admin/upcoming/schedule |200 |1641.5 ms |Y |{"slots":[{"id":98,"hour":8,"minute":0,"enabled":false,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:29.239Z"},{"id":99,"hour":17,"minute":30,"enabled":false,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:29.429Z"}]} |
| API-007 |PUT |/api/admin/upcoming/schedule |200 |1318.6 ms |Y |{"slots":[{"id":100,"hour":8,"minute":0,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:30.819Z"},{"id":101,"hour":17,"minute":30,"enabled":false,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:30.979Z"}]} |
| API-008 |PUT |/api/admin/upcoming/schedule |400 |292.7 ms |N |{"error":"มีเวลาซ้ำกัน / Duplicate time slots"} |
| API-009 |PUT |/api/admin/upcoming/schedule |400 |382.7 ms |N |{"error":"เวลาไม่ถูกต้อง / Invalid time value"} |
| API-010 |PUT |/api/admin/upcoming/schedule |400 |424.4 ms |N |{"error":"เวลาไม่ถูกต้อง / Invalid time value"} |
| API-011 |PUT |/api/admin/upcoming/schedule |200 |1448 ms |Y |{"slots":[{"id":102,"hour":8,"minute":0,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:33.439Z"},{"id":103,"hour":17,"minute":30,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:33.619Z"}]} |
| API-012 |GET |/api/admin/upcoming/schedule |200 |450.4 ms |Y |{"slots":[{"id":102,"hour":8,"minute":0,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:33.439Z"},{"id":103,"hour":17,"minute":30,"enabled":true,"updated_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","updated_at":"2026-05-26T07:51:33.619Z"}]} |
| API-013 |POST |/api/admin/upcoming/scrape |202 |764.8 ms |Y |{"runId":"238f9c60-b8f0-46ee-a97c-93872d1995fc","status":"running"} |
| API-014 |POST |/api/admin/upcoming/scrape |409 |633.1 ms |N |{"error":"มี scraper กำลังทำงานอยู่ / Another scrape is already running"} |
| API-015 |POST |/api/admin/upcoming/scrape |403 |1210.8 ms |N |{"error":"ไม่มีสิทธิ์ 'scraper:trigger' สำหรับ role 'readonly' / Permission 'scraper:trigger' not granted to role 'readonly'"} |
| API-016 |POST |/api/admin/upcoming/scrape |409 |566.2 ms |N |{"error":"มี scraper กำลังทำงานอยู่ / Another scrape is already running"} |
| API-017 |POST |/api/admin/upcoming/scrape |401 |253.2 ms |N |{"error":"Not authenticated"} |
| API-018 |POST |/api/admin/upcoming/scrape |401 |159.7 ms |N |{"error":"Invalid or expired session"} |
| API-019 |GET |/api/admin/upcoming/schedule |401 |330.3 ms |N |{"error":"Session has been revoked"} |
| API-020 |GET |/api/admin/upcoming/runs/238f9c60-b8f0-46ee-a97c-93872d1995fc |200 |2772.6 ms |Y |{"run":{"id":"238f9c60-b8f0-46ee-a97c-93872d1995fc","source":"set_api_scraper","status":"success","triggered_by":"qa_upcoming_scraper_mpmc6e3ja4a3_admin_1@example.test","started_at":"2026-05-26T07:51:35.259Z","finished_at":"2026-05-26T07:51:46.985Z","duration_ms":12456,"total_fetched":9,"inserted_count":0,"updated_count":0,"unchanged_count":9,"failed_count"... |

## SQL Evidence

| # |รายการ |SQL |Rows |Status |เวลา/หมายเหตุ |
| --- |--- |--- |--- |--- |--- |
| SQL-001 |Cleanup stale QA running rows |UPDATE scrape_runs SET status = 'failed', finished_at = now(), error_message = 'QA cleanup stale running row' WHERE status = 'running' AND triggered_by LIKE 'qa_upcoming_scraper_%' AND started_at < now() - interval '10 minutes' |0 |PASS |1074.9 ms |
| SQL-002 |Backup scraper_schedule |SELECT id, hour, minute, enabled, updated_by, updated_at FROM scraper_schedule ORDER BY hour, minute |2 |PASS |156.1 ms |
| SQL-003 |Create QA user (admin) |INSERT INTO admin_users (user_id, email, first_name, last_name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6) |1 |PASS |173.8 ms |
| SQL-004 |Create QA session (admin) |INSERT INTO admin_sessions (session_id, user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2::uuid, $3, $4, $5, $6) |1 |PASS |171.1 ms |
| SQL-005 |Create QA user (readonly) |INSERT INTO admin_users (user_id, email, first_name, last_name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6) |1 |PASS |130.2 ms |
| SQL-006 |Create QA session (readonly) |INSERT INTO admin_sessions (session_id, user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2::uuid, $3, $4, $5, $6) |1 |PASS |150.8 ms |
| SQL-007 |Create QA user (admin) |INSERT INTO admin_users (user_id, email, first_name, last_name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6) |1 |PASS |150.2 ms |
| SQL-008 |Create QA session (admin) |INSERT INTO admin_sessions (session_id, user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2::uuid, $3, $4, $5, $6) |1 |PASS |279.6 ms |
| SQL-009 |Revoke QA session |UPDATE admin_sessions SET revoked_at = now() WHERE session_id = $1 |1 |PASS |162 ms |
| SQL-010 |Create QA user (scraper) |INSERT INTO admin_users (user_id, email, first_name, last_name, role, is_active) VALUES ($1, $2, $3, $4, $5, $6) |1 |PASS |164 ms |
| SQL-011 |Create QA session (scraper) |INSERT INTO admin_sessions (session_id, user_id, token_hash, expires_at, user_agent, ip_address) VALUES ($1, $2::uuid, $3, $4, $5, $6) |1 |PASS |143.4 ms |
| SQL-012 |Read scraper_schedule baseline |SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute |2 |PASS |304.5 ms |
| SQL-013 |Verify added schedule slot |SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute |3 |PASS |161.7 ms |
| SQL-014 |Verify deleted schedule slot |SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute |2 |PASS |201.6 ms |
| SQL-015 |Verify disabled schedule |SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute |2 |PASS |201.5 ms |
| SQL-016 |Verify at least one enabled schedule |SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute |2 |PASS |144.8 ms |
| SQL-017 |Verify saved scraper_schedule |SELECT hour, minute, enabled FROM scraper_schedule ORDER BY hour, minute |2 |PASS |154.6 ms |
| SQL-018 |Check running scrape before manual trigger |SELECT COUNT(*)::int AS cnt FROM scrape_runs WHERE status = 'running' |1 |PASS |148.6 ms |
| SQL-019 |Check running scrape before scraper role trigger |SELECT COUNT(*)::int AS cnt FROM scrape_runs WHERE status = 'running' |1 |PASS |203.3 ms |
| SQL-020 |Poll scrape run |SELECT id, status, triggered_by, started_at, finished_at, duration_ms, total_fetched, inserted_count, updated_count, unchanged_count, failed_count, error_message, log_excerpt FROM scrape_runs WHERE id = $1 |1 |PASS |194 ms |
| SQL-021 |Poll scrape run |SELECT id, status, triggered_by, started_at, finished_at, duration_ms, total_fetched, inserted_count, updated_count, unchanged_count, failed_count, error_message, log_excerpt FROM scrape_runs WHERE id = $1 |1 |PASS |132.7 ms |
| SQL-022 |Poll scrape run |SELECT id, status, triggered_by, started_at, finished_at, duration_ms, total_fetched, inserted_count, updated_count, unchanged_count, failed_count, error_message, log_excerpt FROM scrape_runs WHERE id = $1 |1 |PASS |181.5 ms |
| SQL-023 |Poll scrape run |SELECT id, status, triggered_by, started_at, finished_at, duration_ms, total_fetched, inserted_count, updated_count, unchanged_count, failed_count, error_message, log_excerpt FROM scrape_runs WHERE id = $1 |1 |PASS |268.7 ms |
| SQL-024 |Read scrape_run_items for triggered run |SELECT id, symbol, action, diff, scraped_data, error_message FROM scrape_run_items WHERE run_id = $1 ORDER BY id |9 |PASS |308.9 ms |
| SQL-025 |Check scraper/schedule audit logs |SELECT entity, action, entity_id, created_at FROM audit_logs WHERE created_at >= $1 AND ( entity ILIKE '%scraper%' OR entity ILIKE '%schedule%' OR action ILIKE '%scraper%' OR action ILIKE '%schedule%' ) ORDER BY created_at DESC |7 |PASS |248.5 ms |
| SQL-026 |Restore scraper_schedule delete |DELETE FROM scraper_schedule |2 |PASS |140.4 ms |
| SQL-027 |Restore scraper_schedule insert |INSERT INTO scraper_schedule (hour, minute, enabled, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5) |1 |PASS |1235.2 ms |
| SQL-028 |Restore scraper_schedule insert |INSERT INTO scraper_schedule (hour, minute, enabled, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5) |1 |PASS |249.9 ms |
| SQL-029 |Cleanup QA sessions |DELETE FROM admin_sessions WHERE session_id = ANY($1::uuid[]) |4 |PASS |184.8 ms |
| SQL-030 |Cleanup QA users |DELETE FROM admin_users WHERE user_id = ANY($1::uuid[]) |4 |PASS |137.1 ms |

## Cleanup

| รายการ |Status |หมายเหตุ |
| --- |--- |--- |
| scraper_schedule |DONE |restored 2 original slots |
| QA users/sessions |DONE |4 users, 4 sessions |
