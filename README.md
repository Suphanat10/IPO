# IPO Performance Analytics

ระบบวิเคราะห์ IPO เชิงลึกของตลาดหุ้นไทย — รวมสถิติย้อนหลังของ **ที่ปรึกษาทางการเงิน (FA)**, **ผู้จัดจำหน่าย (Underwriter)** และ **ปัจจัยพื้นฐาน (Fundamentals)** ของบริษัท เพื่อประเมินโอกาสปิดบวกวันแรก พร้อมให้สัญญาณ **BUY / NEUTRAL / AVOID** และตามติด IPO ที่กำลังจะเข้าเทรด

โปรเจกต์นี้เป็นเครื่องมือใช้งานส่วนตัว (single-user) — ออกแบบให้ deploy ง่ายด้วย **Docker Compose** (แอป + PostgreSQL ในชุดเดียว)

---

## สารบัญ

- [Features](#features)
- [สถาปัตยกรรม](#สถาปัตยกรรม)
- [Quick Start (Docker — แนะนำ)](#quick-start-docker--แนะนำ)
- [Local Development](#local-development)
- [โครงสร้างโปรเจกต์](#โครงสร้างโปรเจกต์)
- [Data Pipeline](#data-pipeline)
- [Environment Variables](#environment-variables)
- [ฐานข้อมูลและ Migration](#ฐานข้อมูลและ-migration)
- [Scheduled Scraper (อัตโนมัติ)](#scheduled-scraper-อัตโนมัติ)
- [Deployment](#deployment)
- [การจัดการข้อมูล (Backup / Import / Re-build)](#การจัดการข้อมูล-backup--import--re-build)
- [npm Scripts](#npm-scripts)
- [Testing](#testing)
- [หมายเหตุสำคัญ](#หมายเหตุสำคัญ)

---

## Features

| ด้าน | รายละเอียด |
|---|---|
| **FA Analysis** | กรอกชื่อที่ปรึกษาทางการเงิน (บุคคล/บริษัท) → ดึงสถิติย้อนหลัง (โอกาสปิดบวก, ผลตอบแทนเฉลี่ย, downside, sample size) |
| **Lead-Co Underwriter Analysis** | วิเคราะห์ผู้จัดจำหน่ายหลัก + ผู้ร่วมจำหน่าย พร้อม peer-matching |
| **Fundamental Analysis** | กรอกข้อมูลจาก Filing (ราคา IPO, financials) → คำนวณ ROE / DE / PE / EY / cost ratio → ตี tier → lookup สถิติ |
| **Live Performance Summary** | รวม 3 มิติเป็น Overall Score + Combo signals (FA+UW, FA+Fund, UW+Fund) |
| **Earnings Yield peer-relative** | เปรียบเทียบ EY กับ peer ในหมวดธุรกิจ/กลุ่มอุตสาหกรรมเดียวกัน |
| **Historical Performance Explorer** | เปิดดูตารางสถิติย้อนหลังของ FA / Lead / Lead-Co |
| **Compare Performance** | เปรียบเทียบ Entity 2 ราย side-by-side |
| **Upcoming IPO Board** | ติดตาม IPO ที่กำลังจะเข้า พร้อม readiness score (ดึงจาก SET/SEC ผ่าน scraper) |
| **Admin Dashboard (`/ipo`)** | จัดการข้อมูล IPO, import CSV, validation, build artifact, ตั้งเวลา scraper |

---

## สถาปัตยกรรม

แอปเป็น **hybrid** ระหว่าง static artifact และ DB:

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 16 app (single container)                             │
│                                                                │
│  หน้าสาธารณะ ( / , /explore )                                   │
│   ├─ สถิติย้อนหลัง FA/UW/Fundamental ──► อ่านจาก ipo.json        │
│   │                                      (build artifact)       │
│   └─ Upcoming / dropdown / recommend ──► query PostgreSQL       │
│                                                                │
│  Admin dashboard ( /ipo/* ) + API routes ──► PostgreSQL        │
│                                                                │
│  In-process Scheduler (instrumentation.ts) ──► ยิง scraper      │
│                                              ตามตาราง scraper_schedule │
└──────────────────────────────────────────────────────────────┘
              │                                  │
              ▼                                  ▼
        ipo.json (artifact)              PostgreSQL (DATA ทั้งหมด)
        build จาก DB ด้วย build:data
```

- **สถิติย้อนหลัง** (FA/UW/Fundamental) อ่านจาก `src/app/data/ipo.json` ซึ่ง pre-compute มาจาก DB → เร็ว ไม่ query ตอน render
- **ข้อมูลสด** (upcoming IPO, dropdown options, recommendations) และ **ทั้ง admin** query PostgreSQL โดยตรงผ่าน `pg`
- ใช้ Postgres ตรง ๆ — **ไม่ได้ใช้** supabase-js (Supabase เป็นแค่ตัวเลือก host หนึ่ง)

---

## Quick Start (Docker — แนะนำ)

วิธีนี้ได้ครบในชุดเดียว: เว็บแอป + PostgreSQL + รัน migration อัตโนมัติ

**ต้องมี:** Docker Desktop / Docker Engine + Docker Compose

```bash
git clone https://github.com/Suphanat10/IPO.git
cd IPO/ipo-ui

# 1. สร้าง .env (compose ต้องการไฟล์นี้)
cp .env.example .env

# 2. build + start ทั้ง stack
docker compose up -d --build
```

เปิด [http://localhost:3000](http://localhost:3000)

สิ่งที่เกิดขึ้นอัตโนมัติ:
- สร้าง PostgreSQL 17 (`db` service) + named volume `pgdata` เก็บข้อมูลถาวร
- รัน SQL ทั้งหมดใน [`db/migrations/`](db/migrations) เรียงตามเลข → สร้าง schema ครบในการ init ครั้งแรก
- `web` รอจน DB `healthy` ก่อนค่อยสตาร์ต และชี้ `DATABASE_URL` ไปที่ `db` ภายใน network
- ตั้ง timezone ทั้ง 2 container เป็น **Asia/Bangkok**

> DB เริ่มต้นจะมีแต่ schema เปล่า — ดู [การจัดการข้อมูล](#การจัดการข้อมูล-backup--import--re-build) เพื่อ import ข้อมูลตั้งต้น

คำสั่งที่ใช้บ่อย:
```bash
docker compose ps                 # สถานะ container
docker compose logs -f web        # ดู log แอป (รวม scheduler)
docker compose down               # หยุด (data ใน pgdata คงอยู่)
docker compose down -v            # หยุด + ลบ data ทิ้งทั้งหมด
```

---

## Local Development

รันแบบ dev โดยต่อ Postgres ที่มีอยู่ (local หรือ remote):

```bash
cd ipo-ui
cp .env.example .env.local        # เติม DATABASE_URL ของ DB ที่ใช้ dev
npm install
npm run dev                       # http://localhost:3000 (Turbopack/webpack dev)
```

> ถ้าไม่ตั้ง `DATABASE_URL` หน้าสถิติย้อนหลังยังเปิดได้จาก `ipo.json` แต่ฟีเจอร์ที่ต้องใช้ DB (upcoming, admin) จะใช้ไม่ได้

---

## โครงสร้างโปรเจกต์

```
IPO/
├── ipo-ui/                         ← Next.js 16 web app (หลัก)
│   ├── Dockerfile                  ← production image (standalone output)
│   ├── docker-compose.yml          ← web + bundled Postgres + auto-migrate
│   ├── vercel.json                 ← Vercel Cron (เฉพาะตอน deploy บน Vercel)
│   ├── src/
│   │   ├── instrumentation.ts      ← startup hook → สตาร์ต in-process scheduler
│   │   ├── app/
│   │   │   ├── page.tsx            ← หน้าแรก (public)
│   │   │   ├── explore/            ← Historical Performance + Compare
│   │   │   ├── ipo/(dashboard)/    ← Admin: ipos, import, validation, builds,
│   │   │   │                          sync, upcoming, predictions, audit
│   │   │   ├── api/                ← API routes (DB-backed)
│   │   │   ├── components/         ← UI primitives
│   │   │   ├── sections/           ← FA / Lead-Co / Fundamental / Summary
│   │   │   ├── lib/                ← logic ฝั่ง client/analytics
│   │   │   │   ├── fundamentalFactors.ts   ← 7-factor classification + IPO score
│   │   │   │   ├── scoring.ts              ← Performance score (FA+UW+Fund)
│   │   │   │   ├── ipoAnalytics.ts         ← conclusion generators
│   │   │   │   ├── leadCoStats.ts          ← Lead-Co pair stats
│   │   │   │   └── publicHomeData.ts       ← server-only DB queries (homepage)
│   │   │   └── data/
│   │   │       ├── *.csv           ← seed CSV (git-tracked)
│   │   │       └── ipo.json        ← build artifact (generated)
│   │   └── lib/                    ← logic ฝั่ง server (db, scraper, builder, …)
│   │       ├── db.ts               ← pg Pool + query() + withTransaction()
│   │       ├── scraper-scheduler.ts← in-process scheduler (setInterval)
│   │       └── scraper.ts          ← Node scraper (SET/SEC)
│   ├── scripts/                    ← build / import / export / backup / scrape
│   └── docs/ADMIN_SETUP.md         ← คู่มือเชื่อม DB + import ละเอียด
├── db/migrations/                  ← SQL schema (PostgreSQL มาตรฐาน, รันด้วย psql)
├── backups/                        ← DB dumps (จาก backup-db.mjs)
└── outputs/                        ← reports จาก test automation
```

---

## Data Pipeline

### Build-time — สร้าง `ipo.json`

```bash
cd ipo-ui
npm run build:data    # ดึงจาก DB (scripts/build-from-db.mjs)  ← ใช้ปกติ
# หรือ
npm run build:csv     # build จาก seed CSV (scripts/build-data.mjs)
```

อ่านข้อมูล → คำนวณ:

| สิ่งที่สร้าง | คำอธิบาย |
|---|---|
| `globalFundamentalStats` | สถิติของแต่ละ tier (n, mean return, prob_gain/loss) |
| `tierThresholds` | qcut bins (q33/q67) สำหรับ ROE / EY / DE / cost / existing |
| `peerBySector`, `peerByIndustry` | สำหรับ Earnings Yield peer-relative |
| `faPersons`, `faCompanies`, `leadUnderwriters`, `leadCo` | pre-aggregated stats per entity |

Output: `src/app/data/ipo.json`

### Runtime

- สถิติย้อนหลัง: sections re-compute จาก `ipo.json` ฝั่ง client ทันทีเมื่อผู้ใช้กรอกข้อมูล
- ข้อมูลสด/admin: API routes + server components query PostgreSQL

---

## Environment Variables

คัดลอก [`ipo-ui/.env.example`](ipo-ui/.env.example) → `.env` (Docker) หรือ `.env.local` (dev) แล้วเติมค่าจริง
(`.env*` ถูก gitignore — **ห้าม commit secret**)

| ตัวแปร | จำเป็น | ใช้ทำอะไร |
|---|---|---|
| `DATABASE_URL` | ✅ | connection string ของ PostgreSQL เช่น `postgresql://user:pass@host:5432/db` (ใน Docker compose จะ override ให้ชี้ `db` อัตโนมัติ). ถ้าไม่ตั้ง จะ fallback ไป `POSTGRES_HOST/PORT/DB/USER/PASSWORD` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | – | ใช้กับ Docker compose (db service + ประกอบ DATABASE_URL); ค่า default = `postgres` / `postgres` / `ipo` |
| `TZ` | – | timezone (default ในภาพ Docker = `Asia/Bangkok`) |
| `CRON_SECRET` | – | ถ้าตั้ง จะบังคับให้ `GET /api/ipo/upcoming/scrape` ต้องมี header `Authorization: Bearer <CRON_SECRET>` (ป้องกันการ trigger scrape มั่ว) |
| `SCHEDULER_DISABLED` | – | ตั้ง `1` เพื่อปิด in-process scheduler (ใช้เมื่อย้ายไป serverless/multi-replica แล้วขับด้วย external cron แทน) |
| `GH_TOKEN`, `GH_REPO`, `GH_WORKFLOW` | – | สำหรับปุ่ม trigger build (GitHub Actions) ในหน้า `/ipo/builds` |
| `NEXT_PUBLIC_APP_URL` | – | base URL ตอน self-host (บน Vercel ใช้ `VERCEL_URL` อัตโนมัติ) |
| `NODE_OPTIONS` | – | เช่น `--max-old-space-size=4096` กัน OOM ตอน build (ipo.json ใหญ่) |
| `SCRAPER_*` | – | ตั้งค่า scraper (page/doc mode, cache, workers, timeout) — ดู `.env.example` |

> ไม่ได้ใช้ supabase-js → **ไม่ต้องตั้ง** `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
> (ตัวแปรกลุ่ม Supabase ใน `.env.example` ใช้เฉพาะกับ scripts บางตัวที่เรียก Supabase API)

---

## ฐานข้อมูลและ Migration

Schema ทั้งหมดอยู่ใน [`db/migrations/`](db/migrations) เป็น **PostgreSQL มาตรฐาน** (รันด้วย `psql` ได้ตรง ๆ)

- **Docker:** mount เข้า `/docker-entrypoint-initdb.d` → รันอัตโนมัติเรียงตามเลขในการ init ครั้งแรก
- **รันเอง (psql):**
  ```bash
  # Linux/macOS
  for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
  ```
  ```powershell
  # Windows PowerShell
  Get-ChildItem db/migrations/*.sql | Sort-Object Name | ForEach-Object {
    psql $env:DATABASE_URL -f $_.FullName
  }
  ```

### ตารางหลัก (ย่อ)

| กลุ่ม | ตาราง/วิว |
|---|---|
| Core IPO | `ipos`, `ipo_financials`, `sectors`, `fa_normalizations` |
| SEC source | `sec_source_files` (+ evidence/review workflow) |
| Validation | `validation_rules`, `validation_results` |
| Build/scrape | `build_runs`, `build_logs`, `sync_jobs`, `scrape_runs`, `scraper_schedule` |
| Recommendation | ตาราง tracking ผลคำแนะนำ IPO |
| Views | `v_dashboard_stats`, `v_ipo_completeness`, `v_ipo_missing_fields`, `v_recent_updates`, `v_upcoming_ipos` |

> ข้อมูล FA/underwriter เก็บเป็น array (`fa_persons`, `fa_companies`, `lead_uw`, `co_uws`) บนตาราง `ipos` โดยตรง — ไม่มีตาราง normalize แยก (ถูกลบใน migration 0012/0020)
>
> migration เขียนแบบ idempotent (`IF EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT`) จึงรันซ้ำได้ปลอดภัย

---

## Scheduled Scraper (อัตโนมัติ)

การ scrape upcoming IPO อัตโนมัติทำงานด้วย **in-process scheduler**:

- [`src/instrumentation.ts`](ipo-ui/src/instrumentation.ts) เรียก `startScheduler()` ตอนแอปบูต (เฉพาะ runtime Node และเมื่อ `SCHEDULER_DISABLED !== "1"`)
- [`src/lib/scraper-scheduler.ts`](ipo-ui/src/lib/scraper-scheduler.ts) `setInterval` ทุก 60 วินาที → อ่าน slot ที่ `enabled` จากตาราง `scraper_schedule` → ถ้าตรงเวลา (เทียบ **เวลากรุงเทพ**) และไม่มี scrape ค้างอยู่ ก็ยิง `triggerScrape`
- ตั้งเวลาผ่านหน้า `/ipo/upcoming` หรือแก้ตาราง `scraper_schedule` โดยตรง

> โมเดล deploy คือ **single long-running container** จึงใช้ in-process scheduler เป็นเจ้าของงานนี้
> ถ้าย้ายไป **serverless/multi-replica** ให้ตั้ง `SCHEDULER_DISABLED=1` แล้วขับด้วย external cron แทน
> (บน Vercel มี [`vercel.json`](ipo-ui/vercel.json) เรียก `GET /api/ipo/upcoming/scrape` — ควรตั้ง `CRON_SECRET` ด้วย)

---

## Deployment

### A) Docker (แนะนำ) — single container + bundled Postgres

ตาม [Quick Start](#quick-start-docker--แนะนำ): `docker compose up -d --build`

- ใช้ Postgres ที่ bundle มา (default) หรือชี้ไป Postgres ภายนอกก็ได้ — comment ส่วน `db` service, `depends_on`, และ `DATABASE_URL` override ของ `web` ออก แล้วใส่ `DATABASE_URL` ของภายนอกใน `.env`
- ข้อมูลอยู่ใน named volume `pgdata` (รอด `down`, หายเมื่อ `down -v`)

### B) Vercel

1. Push repo ขึ้น GitHub → ที่ Vercel **New Project** → import repo
2. ตั้ง **Root Directory** = `ipo-ui`
3. ใส่ Environment Variables (อย่างน้อย `DATABASE_URL`; ตั้ง `SCHEDULER_DISABLED=1` + `CRON_SECRET` ถ้าใช้ Vercel Cron)
4. Deploy (auto-detect Next.js)

> ถ้าใช้ Supabase เป็น host ให้ใช้ **pooler host** (`...pooler.supabase.com:6543`) ใน `DATABASE_URL` — host direct (`db.<ref>.supabase.co`) เป็น IPv6-only มักต่อไม่ได้บน Vercel

### C) Self-host / VPS (Node 20+)

```bash
cd ipo-ui
cp .env.example .env.local   # เติม DATABASE_URL
npm ci
npm run build:data           # สร้าง ipo.json จาก DB
npm run build                # build production
npm run start                # port 3000
```

แนะนำรันด้วย process manager (เช่น `pm2`) + reverse proxy (Nginx/Caddy) พร้อม HTTPS

---

## การจัดการข้อมูล (Backup / Import / Re-build)

**Backup ก่อนแตะ DB production เสมอ:**
```bash
cd ipo-ui
node scripts/backup-db.mjs        # dump ลง ../backups/
```

**Import ข้อมูลตั้งต้นจาก seed CSV (DB เปล่า):**
```bash
# local / self-host
npm run db:import                 # โหลด CSV ใน src/app/data/ เข้า DB

# ใน Docker
docker compose exec web node scripts/import-csv-to-db.mjs
```
importer จะ insert ข้อมูล → เรียก `run_validations()` → บันทึก `sync_jobs`
(ใส่ `--dry-run` เพื่อตรวจก่อนเขียนจริง)

**อัปเดต DB ที่มีข้อมูลแล้ว:**
1. รัน **เฉพาะ migration ไฟล์ใหม่** (เรียงตามเลข)
2. หลังข้อมูลเปลี่ยน → `npm run build:data` เพื่อ regenerate `ipo.json`
3. ถ้า deploy แบบ build-from-git (Vercel) ต้อง **commit `ipo.json` ที่ regenerate แล้ว** ไม่งั้น production เห็นข้อมูลเก่า

---

## npm Scripts

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server (port 3000) |
| `npm run build` | build production (Next standalone) |
| `npm run start` | รัน production build |
| `npm run lint` | ESLint |
| `npm run test` | Jest |
| `npm run build:data` | สร้าง `ipo.json` จาก DB |
| `npm run build:csv` | สร้าง `ipo.json` จาก seed CSV |
| `npm run db:import` | import seed CSV เข้า DB |
| `npm run db:export` | export ข้อมูลจาก DB เป็น CSV |
| `npm run scrape:upcoming` | รัน Python scraper (มี `:dry` สำหรับ dry-run) |

---

## Testing

```bash
cd ipo-ui
npm run test
```

Jest + Testing Library ครอบคลุม logic วิเคราะห์ (scoring, fundamental factors, lead-co stats), SEC extractor และ component บางส่วน

---

## หมายเหตุสำคัญ

- **ไม่มีระบบ login — ตั้งใจ:** เป็นเครื่องมือ single-user ส่วนตัว หน้า `/ipo` และ API ที่แก้ข้อมูลได้ **ไม่มี auth** ถ้า deploy สาธารณะ ต้องกันการเข้าถึงเองที่ชั้น network/reverse-proxy
- **Timezone:** ภาพ Docker ตั้ง `Asia/Bangkok`; scheduler ใช้เวลากรุงเทพเสมอไม่ว่า TZ ของ container จะเป็นอะไร
- **`ipo.json` เป็น build artifact** ที่ commit ลง repo — ถ้า deploy แบบ build-from-git ต้อง commit ตัวที่ regenerate ใหม่ทุกครั้งที่ข้อมูลเปลี่ยน

---

## Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Material-UI v9 · PostgreSQL (ผ่าน `pg`) · Jest · Docker
