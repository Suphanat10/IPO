# รายงานผลการทดสอบ Authentication, Authorization และ Permission Management - IPO Admin

## Executive Summary

| รายการ | ผลลัพธ์ |
|---|---:|
| วันที่ทดสอบ | 26 พฤษภาคม 2569 เวลา 11:21:44 |
| Environment | Local Next.js via http://127.0.0.1:3000 |
| Database | aws-1-ap-northeast-1.pooler.supabase.com/postgres |
| Build version | 0.1.0 (2dec4c6) |
| Test cases ทั้งหมด | 68 |
| PASS | 67 |
| WARNING | 1 |
| FAIL | 0 |
| Overall system status | **CONDITIONAL READY** |
| Production readiness | **พร้อมแบบมีเงื่อนไข: ต้องรับความเสี่ยง warning** |
| Execution time | 85757.6 ms |
| Records loaded | admin_users=1, API calls=92, SQL statements=33 |
| Workbook validation | PASS |

## Scope ที่ทดสอบ

- Admin login/logout, JWT cookie, session validation, route protection
- **Session replay/tampering**: tampered signature, forged role escalation, stolen userId, revoked session replay, concurrent sessions, future iat, empty payload
- **RBAC matrix**: super_admin/admin/readonly × scraper, build, import, IPO CRUD, admin-users, schedule, stats, profile
- **CSRF-ish behavior**: state-changing without cookie, wrong Content-Type, DELETE/PATCH/PUT without session
- **Admin user lifecycle**: create → login → password change → deactivate → reactivate → self-delete protection, duplicate email, empty fields, weak password
- **Audit coverage**: login success/failure, mutation events, permission denied events, audit category analysis
- API authorization, SQL injection, XSS attempts
- PostgreSQL integration: admin_users, audit_logs, schema discovery, cleanup

## Security Findings

- ไม่พบ critical findings

## Test Cases

| Test Case ID | Category | Scenario | Expected Result | Actual Result | Status | Execution Time | API Status Code | Notes |
|---|---|---|---|---|---:|---:|---:|---|
| TC-001 | LOGIN | Login สำเร็จด้วย email/password ถูกต้อง | HTTP 200 พร้อม session cookie | HTTP 200; cookie=created | PASS | 639 ms | 200 | ใช้บัญชี super_admin ชั่วคราว |
| TC-002 | LOGIN | Login fail ด้วย password ผิด | HTTP 401 และไม่มี session cookie | HTTP 401; error=Email or password is incorrect. | PASS | 688.8 ms | 401 | ไม่พบ Set-Cookie สำหรับ session |
| TC-003 | LOGIN | Login fail ด้วย email ที่ไม่มีในระบบ | HTTP 401 และข้อความ generic | HTTP 401; error=Email or password is incorrect. | PASS | 464.2 ms | 401 | ไม่เปิดเผยว่า email มีอยู่จริงหรือไม่ |
| TC-004 | LOGIN | Login fail เมื่อ account inactive | HTTP 401/403 จาก inactive flag | HTTP 403; inactive column=present | PASS | 569.8 ms | 403 | Blocked by admin_users.is_active=false after password verification |
| TC-005 | LOGIN | Login fail เมื่อ password ว่าง | HTTP 400 | HTTP 400 | PASS | 236.4 ms | 400 | ตรวจ required field ก่อน query password verify |
| TC-006 | LOGIN | Login fail เมื่อ email format invalid | HTTP 400 format validation | HTTP 400; treated as normal unknown email | PASS | 232.1 ms | 400 | ควรเพิ่ม email format validation เพื่อแยก bad request จาก auth failure |
| TC-007 | LOGIN | Session cookie ถูกสร้างหลัง login | Set-Cookie admin_session พร้อม HttpOnly, SameSite=Lax, Path=/ | HTTP 200; HttpOnly=true; SameSite=Lax=true; Path=/=true; loginCookie=captured | PASS | 571.9 ms | 200 | Secure flag เปิดตาม NODE_ENV=production เท่านั้น |
| TC-008 | LOGIN | Logout สำเร็จและ session ถูกลบ | HTTP 200, cookie expired, old token unusable on auth and admin APIs | logout HTTP 200; cookie expired=true; replay /me=401; replay admin=401 | PASS | 1257.7 ms | 200/401/401 | admin_sessions.revoked_at invalidates replayed cookies on auth and admin APIs |
| TC-009 | LOGIN | Session expiration ทำงานถูกต้อง | API 401 และ route redirect ไป login | API 401; /admin 307 -> /admin/login?next=%2Fadmin | PASS | 366.6 ms | 401/307 | ทดสอบด้วย JWT exp ย้อนหลัง 60 วินาที |
| TC-010 | LOGIN | Remember session/login persistence ทำงานถูกต้อง | Session ใช้งานต่อได้และอายุประมาณ 8 ชั่วโมง | login=200; me=200; lifetime≈8 hours | PASS | 1471.1 ms | 200/200 | ระบบยังไม่มี remember-me option แยก เป็น fixed 8-hour session |
| TC-011 | AUTHORIZATION | Unauthorized user เข้า /admin ไม่ได้ | Redirect ไป /admin/login | HTTP 307; location=/admin/login?next=%2Fadmin | PASS | 8.2 ms | 307 | Proxy route guard ทำงานกับ /admin/:path* |
| TC-012 | AUTHORIZATION | Unauthorized API request ได้ 401 | HTTP 401 | HTTP 401; error=Not authenticated | PASS | 1605.9 ms | 401 | ใช้ endpoint scraper ที่มี requireAdmin |
| TC-013 | AUTHORIZATION | Readonly role ดูข้อมูลได้แต่แก้ไขไม่ได้ | GET allowed, mutation denied 403/401 | GET profile=200; POST admin-users=403 | PASS | 1262.1 ms | 200/403 | GET profile uses authenticated session; admin user creation requires admin_users:create and should deny readonly |
| TC-014 | AUTHORIZATION | Admin role แก้ไข IPO ได้ | Admin cookie create/update IPO สำเร็จ | POST=201; PATCH=200; ipo_id=825 | PASS | 2996.6 ms | 201/200 | Admin role has ipos:write permission and can create/update IPO records |
| TC-015 | AUTHORIZATION | Super admin จัดการ admin users ได้ | Create/Delete admin user สำเร็จเฉพาะ super_admin | POST=201; DELETE=200 | PASS | 2649 ms | 201/200 | Super admin has admin_users:create/delete permissions |
| TC-016 | AUTHORIZATION | Admin ปกติไม่สามารถลบ super admin ได้ | HTTP 403/401 | HTTP 403 | PASS | 801.5 ms | 403 | Admin role lacks admin_users:delete permission |
| TC-017 | AUTHORIZATION | User ไม่สามารถแก้ไข role ตัวเองเป็น super_admin | Role escalation ถูก reject หรือ field ถูก ignore อย่างปลอดภัย | HTTP 200; role returned=false; db role after=admin | PASS | 2978.3 ms | 200 | Profile update ignores role payload; DB role must remain non-super_admin |
| TC-018 | AUTHORIZATION | Route guard redirect ทำงานถูกต้อง | Protected route redirect ไป login | HTTP 307; location=/admin/login?next=%2Fadmin%2Fipos | PASS | 9.6 ms | 307 | ตรวจ route ย่อย /admin/ipos |
| TC-019 | AUTHORIZATION | Expired session ถูก redirect ไป login | Redirect ไป login พร้อม next path | HTTP 307; location=/admin/login?next=%2Fadmin%2Fipos | PASS | 8.5 ms | 307 | ตรวจ Next proxy ด้วย expired JWT |
| TC-020 | AUTHORIZATION | Invalid token/session ถูก reject | HTTP 401 | HTTP 401 | PASS | 326.4 ms | 401 | JWT malformed ถูก reject โดย jwtVerify |
| TC-021 | DATA ACCESS | User อ่านข้อมูล IPO ได้ตามสิทธิ์ | เฉพาะ authenticated/authorized user อ่าน admin IPO API ได้ | anonymous GET /api/admin/ipos => HTTP 401 | PASS | 229.4 ms | 401 | Proxy/API guard blocks anonymous admin IPO reads |
| TC-022 | DATA ACCESS | User แก้ไข IPO ได้ตามสิทธิ์ | Anonymous/unauthorized mutation ถูก block | anonymous PATCH => HTTP 401 | PASS | 347.4 ms | 401 | Proxy/API guard blocks anonymous IPO mutation |
| TC-023 | DATA ACCESS | User ลบ IPO ได้ตามสิทธิ์ | Anonymous/unauthorized delete ถูก block | anonymous DELETE => HTTP 401 | PASS | 222.2 ms | 401 | Proxy/API guard blocks anonymous IPO delete/cancel |
| TC-024 | DATA ACCESS | Restricted endpoint block readonly role | Readonly role ได้ HTTP 403/401 | PATCH admin-users => HTTP 403 | PASS | 1144.8 ms | 403 | admin-users PATCH requires admin_users:update and denies readonly |
| TC-025 | DATA ACCESS | Admin users API require authorization | HTTP 401 without cookie | HTTP 401 | PASS | 231.8 ms | 401 | Endpoint requires admin_users:read permission |
| TC-026 | DATA ACCESS | Validation API require authorization | HTTP 401/403 without cookie | HTTP 401 | PASS | 350.8 ms | 401 | Validation API is protected by proxy/validation:read permission |
| TC-027 | DATA ACCESS | Build trigger API require authorization | HTTP 401/403 without cookie | HTTP 401; runId=- | PASS | 328 ms | 401 | Build trigger blocked before DB side effect |
| TC-028 | DATA ACCESS | Scraper API require authorization | HTTP 401 without cookie | HTTP 401 | PASS | 349.2 ms | 401 | Endpoint มี requireAdmin ก่อน insert scrape_runs |
| TC-029 | DATA ACCESS | SQL injection attempt ผ่าน login form ถูก block | HTTP 401/400, ไม่มี session, ไม่มี SQL error | HTTP 400; cookie=none; error=รูปแบบอีเมลไม่ถูกต้อง / Invalid email format | PASS | 233.6 ms | 400 | Blocked before session creation; 400 validation or 401 generic auth failure are both acceptable |
| TC-030 | DATA ACCESS | XSS attempt ผ่าน auth form ถูก sanitize/reject | Reject/block และไม่ reflect script payload | HTTP 401; reflected=false | PASS | 438.8 ms | 401 | API response ใช้ generic error ไม่สะท้อน payload |
| TC-031 | SESSION TAMPERING | JWT ที่ signature ถูก tamper ถูก reject | HTTP 401 | HTTP 401 | PASS | 254 ms | 401 | Reversed signature bytes to simulate tampering |
| TC-032 | SESSION TAMPERING | JWT role escalation ด้วย wrong secret ถูก reject | HTTP 401 เพราะ signature invalid | HTTP 401 | PASS | 335.9 ms | 401 | Forged JWT with role=super_admin signed with wrong secret |
| TC-033 | SESSION TAMPERING | JWT with stolen userId ถูก reject ถ้ามี server-side session | HTTP 401 หรือ session ไม่ match ใน DB | HTTP 401; session_in_db=1 | PASS | 445.5 ms | 401 | Server-side session validation should catch userId mismatch |
| TC-034 | SESSION TAMPERING | Revoked session replay ถูก block ทุก endpoint | ทุก endpoint return 401 หลัง logout | GET /api/admin/profile=401; GET /api/admin/ipos?limit=1=401; GET /api/admin/stats=401; POST /api/admin/upcoming/scrape=401 | PASS | 2551.6 ms | 401/401/401/401 | Session revocation ครอบคลุมทุก protected endpoint |
| TC-035 | SESSION TAMPERING | Concurrent sessions จาก user เดียวกัน | ทั้งสอง session ใช้งานได้พร้อมกัน (หรือ old session ถูก revoke) | session1=200; session2=200 | PASS | 1571.8 ms | 200/200 | Multiple concurrent sessions allowed |
| TC-036 | SESSION TAMPERING | JWT with future iat (clock skew attack) ถูก reject | HTTP 401 เพราะ iat > now | HTTP 401 | PASS | 231 ms | 401 | Future iat rejected |
| TC-037 | SESSION TAMPERING | JWT with empty payload ถูก reject | HTTP 401 | HTTP 401 | PASS | 221.9 ms | 401 | Empty payload JWT should be treated as invalid |
| TC-038 | RBAC MATRIX | Readonly ไม่สามารถ trigger scraper ได้ | HTTP 401/403 | HTTP 403 | PASS | 815 ms | 403 | Scraper trigger requires write permission |
| TC-039 | RBAC MATRIX | Readonly ไม่สามารถ trigger build ได้ | HTTP 401/403 | HTTP 403 | PASS | 805.9 ms | 403 | Build trigger requires write permission |
| TC-040 | RBAC MATRIX | Readonly ไม่สามารถ commit import ได้ | HTTP 401/403 | HTTP 403 | PASS | 706.9 ms | 403 | Import commit requires write permission |
| TC-041 | RBAC MATRIX | Readonly ไม่สามารถลบ IPO ได้ | HTTP 401/403 | HTTP 403 | PASS | 788.8 ms | 403 | Delete requires ipos:delete permission |
| TC-042 | RBAC MATRIX | Admin ปกติไม่สามารถสร้าง admin user ได้ (เฉพาะ super_admin) | HTTP 401/403 | HTTP 403 | PASS | 677.6 ms | 403 | admin_users:create restricted to super_admin |
| TC-043 | RBAC MATRIX | Admin ปกติไม่สามารถลบ admin user ได้ | HTTP 401/403 | HTTP 403 | PASS | 694.8 ms | 403 | admin_users:delete restricted to super_admin |
| TC-044 | RBAC MATRIX | Readonly role สามารถอ่านข้อมูล IPO ได้ | HTTP 200 | HTTP 200 | PASS | 1603.6 ms | 200 | Read access should be granted to all authenticated roles |
| TC-045 | RBAC MATRIX | Admin role สามารถดู dashboard stats ได้ | HTTP 200 | HTTP 200 | PASS | 608.1 ms | 200 | Stats endpoint accessible to admin role |
| TC-046 | RBAC MATRIX | Super admin สามารถดูรายชื่อ admin users ได้ | HTTP 200 | HTTP 200 | PASS | 559.7 ms | 200 | admin_users:read granted to super_admin |
| TC-047 | RBAC MATRIX | ทุก role เข้าถึง /api/admin/profile ได้ | ทุก role return HTTP 200 | super_admin=200; admin=200; readonly=200 | PASS | 1363.1 ms | 200/200/200 | Profile endpoint accessible to all authenticated roles |
| TC-048 | RBAC MATRIX | Readonly ไม่สามารถแก้ไข scraper schedule ได้ | HTTP 401/403 | HTTP 403 | PASS | 804.9 ms | 403 | Schedule update requires write permission |
| TC-049 | RBAC MATRIX | Readonly ไม่สามารถสร้าง IPO ได้ | HTTP 401/403 | HTTP 403 | PASS | 694 ms | 403 | IPO creation requires ipos:write |
| TC-050 | RBAC MATRIX | Readonly สามารถดูประวัติ scrape runs ได้ | HTTP 200 (read-only access) | HTTP 200 | PASS | 460.4 ms | 200 | Scrape run history is read-only data accessible to all authenticated roles |
| TC-051 | CSRF | State-changing POST ถูก block เมื่อไม่มี session cookie | HTTP 401/403 | HTTP 401 | PASS | 232.3 ms | 401 | SameSite=Lax cookie + requireAdmin = CSRF mitigation |
| TC-052 | CSRF | POST ด้วย Content-Type: text/plain ถูก reject หรือ parse ไม่ได้ | HTTP 400/415 (wrong content type) | HTTP 415 | PASS | 453 ms | 415 | Content-Type enforcement active |
| TC-053 | CSRF | DELETE/PATCH ถูก block เมื่อไม่มี session cookie | HTTP 401/403 ทั้ง DELETE และ PATCH | DELETE=401; PATCH=401 | PASS | 586.9 ms | 401/401 | All state-changing methods require session cookie |
| TC-054 | CSRF | PUT schedule ถูก block เมื่อไม่มี session cookie | HTTP 401/403 | HTTP 401 | PASS | 221.7 ms | 401 | Schedule mutation requires authentication |
| TC-055 | CSRF | Logout ไม่มี side effect เมื่อไม่มี session | HTTP 200 (no-op) หรือ 401 | HTTP 200 | PASS | 18 ms | 200 | Logout without cookie should be safe no-op |
| TC-056 | ADMIN LIFECYCLE | สร้าง admin user ใหม่แล้ว login ได้ทันที | Create 201 แล้ว login 200 | create=201; login=200 | PASS | 1508.6 ms | 201/200 | Full lifecycle: create → login |
| TC-057 | ADMIN LIFECYCLE | เปลี่ยน password แล้ว old password ใช้ไม่ได้ | Change 200, old pwd 401, new pwd 200 | change=200; old=401; new=200 | PASS | 3921.3 ms | 200/401/200 | Password rotation works correctly |
| TC-058 | ADMIN LIFECYCLE | สร้าง admin user ด้วย email ซ้ำถูก reject | HTTP 400/409/422 | HTTP 409 | PASS | 472.1 ms | 409 | Duplicate email uniqueness enforced |
| TC-059 | ADMIN LIFECYCLE | Admin ไม่สามารถลบตัวเองได้ | HTTP 400/403 (self-delete protection) | DELETE=400; me after=200 | PASS | 676 ms | 400 | Self-delete protection active |
| TC-060 | ADMIN LIFECYCLE | Deactivated user ไม่สามารถ login ได้ | HTTP 401/403 หลัง deactivate | deactivate=400; login=403 | PASS | 2903.3 ms | 400/403 | is_active=false blocks login |
| TC-061 | ADMIN LIFECYCLE | Reactivated user สามารถ login ได้อีกครั้ง | HTTP 200 หลัง reactivate | HTTP 200 | PASS | 805.2 ms | 200 | Reactivation restores login access |
| TC-062 | ADMIN LIFECYCLE | สร้าง admin user ด้วยข้อมูลว่าง ถูก reject | HTTP 400/422 validation error | HTTP 400 | PASS | 341.7 ms | 400 | Empty field validation active |
| TC-063 | ADMIN LIFECYCLE | สร้าง admin user ด้วย weak password ถูก reject | HTTP 400/422 (password too weak) | HTTP 400 | PASS | 219.5 ms | 400 | Password strength validation active |
| TC-064 | AUDIT | Login สำเร็จถูกบันทึกใน audit log | audit_logs มี row สำหรับ login action | login=200; audit_rows=9 | PASS | 1376.5 ms | 200 | Login success events logged |
| TC-065 | AUDIT | Login ล้มเหลวถูกบันทึกใน audit log | audit_logs มี row สำหรับ failed login | audit_rows=21 | PASS | 1359.4 ms | - | Failed login events logged |
| TC-066 | AUDIT | QA suite สร้าง audit events ครอบคลุม | มี audit events > 0 จากกิจกรรมทั้งหมด | total=52; new_during_suite=1 | WARNING | 237.6 ms | - | Very few audit events — coverage gaps likely |
| TC-067 | AUDIT | Data mutation events ถูกบันทึกใน audit | มี create/update/delete audit events | unauthorized_api(26), permission_denied(11), login_failed(8), admin_profile_updated(2), admin_user_created(2), login_rejected(2), admin_user_deleted(1) | PASS | 231 ms | - | Mutation audit trail present |
| TC-068 | AUDIT | Permission denied events ถูกบันทึกใน audit | มี denied/unauthorized audit events จาก RBAC tests | denied_events=37 | PASS | 230.1 ms | - | Permission denied events logged for security monitoring |

## Failed / Unexpected Access Attempts

| Test Case | Actor | Endpoint | Expected | Actual | Outcome | Notes |
|---|---|---|---|---|---|---|
| TC-002 | known email | POST /api/auth/login | 401 | HTTP 401 | Blocked | Wrong password |
| TC-003 | unknown email | POST /api/auth/login | 401 | HTTP 401 | Blocked | - |
| TC-011 | anonymous | GET /admin | redirect | HTTP 307 | Blocked | /admin/login?next=%2Fadmin |
| TC-012 | anonymous | POST /api/admin/upcoming/scrape | 401 | HTTP 401 | Blocked | - |
| TC-029 | attacker | POST /api/auth/login | 401/400 | HTTP 400 | Blocked | SQLi payload |
| TC-030 | attacker | POST /api/auth/login | 400/401 | HTTP 401 | Blocked | XSS payload |

## Query Performance Summary

- API average response time: 542.8 ms
- API max response time: 1961.7 ms
- SQL average query time: 355.6 ms
- SQL max query time: 1519.2 ms

## Database Transaction Status

- Test users: สร้างด้วย prefix `qa_auth_uat_mpm4ow9518c2` และ cleanup แล้ว
- Test IPO symbol: `QAAUTH9518C2` และ cleanup แล้ว
- sessions table: พบ
- audit_logs: -

## Runtime Observations

- Node RSS memory: 493 MB
- JWT session ใช้ signed HttpOnly cookie และตรวจ server-side revocation ผ่าน `admin_sessions` เมื่อ migration พร้อม
- API admin routes ถูกครอบด้วย Next proxy และ endpoint-level `requireAdmin` / `requirePermission` ตาม route ที่ตรวจ

## สรุปท้ายรายงาน

- จำนวน test ที่ผ่าน: **67**
- จำนวน warning: **1**
- จำนวน fail: **0**
- Overall system status: **CONDITIONAL READY**
- Readiness for production: **พร้อมแบบมีเงื่อนไข: ต้องรับความเสี่ยง warning**
