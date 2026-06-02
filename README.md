# IPO Performance Analytics

ระบบวิเคราะห์ IPO เชิงลึกของตลาดหุ้นไทย — รวมสถิติย้อนหลังของ **ที่ปรึกษาทางการเงิน (FA)**, **ผู้จัดจำหน่าย (Underwriter)** และ **ปัจจัยพื้นฐาน** ของบริษัทเพื่อประเมินโอกาสปิดบวกวันแรก และให้คำแนะนำลงทุน (BUY / NEUTRAL / AVOID) แบบ real-time

สร้างเพื่อ replicate logic ของ Python notebook (`analyze_ipo_v4`) ที่ใช้วิเคราะห์ IPO ย้อนหลังจากฐานข้อมูล 548 IPO

---

##  Features

- **FA Analysis** — กรอกชื่อที่ปรึกษาทางการเงิน (บุคคล / บริษัท) → ดึงสถิติย้อนหลัง (โอกาสปิดบวก, ผลตอบแทนเฉลี่ย, downside, sample size)
- **Lead-Co Underwriter Analysis** — วิเคราะห์ผู้จัดจำหน่ายหลัก + ผู้ร่วมจำหน่าย พร้อม peer-matching
- **Fundamental Analysis** — กรอกข้อมูลจาก Filing (ราคา IPO, financials) → คำนวณ ROE / DE / PE / EY / cost ratio → ตี tier → lookup สถิติ
- **Live Performance Summary** — รวม 3 มิติเป็น Overall Score + Combo signals (FA+UW, FA+Fund, UW+Fund)
- **Earnings Yield peer-relative** — เปรียบเทียบ EY กับ peer ในหมวดธุรกิจ / กลุ่มอุตสาหกรรมเดียวกัน
- **Historical Performance Explorer** — เปิดดูตารางสถิติย้อนหลังของ FA / Lead / Lead-Co
- **Compare Performance** — เปรียบเทียบ Entity 2 ราย side-by-side

---

## Quick Start
```bash
git clone https://github.com/Suphanat10/IPO.git
cd IPO/ipo-ui
npm install
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

---

## โครงสร้าง

```
IPO/
├── ipo-ui/                          ← Next.js 16 web app (main)
│   ├── src/app/
│   │   ├── data/
│   │   │   ├── base.csv             ← per-IPO base (returns, FA, lead, ราคา)
│   │   │   ├── financials.csv       ← per-IPO financials
│   │   │   ├── df_sector.csv        ← symbol → market / industry / sector
│   │   │   ├── fa_company_norm.csv  ← FA company name normalization
│   │   │   └── ipo.json             ← built artifact (generated)
│   │   ├── lib/                     ← logic
│   │   │   ├── fundamentalFactors.ts   ← 7 factor classification + IPO score
│   │   │   ├── scoring.ts              ← Performance score (FA + UW + Fund)
│   │   │   ├── ipoAnalytics.ts         ← FA / Lead conclusion generators
│   │   │   ├── leadCoStats.ts          ← Lead-Co pair stats
│   │   │   ├── AnalysisContext.tsx     ← React Context (global state)
│   │   │   └── mockData.ts             ← typed wrappers ของ ipo.json
│   │   ├── components/              ← UI primitives
│   │   ├── sections/                ← FA / Lead-Co / Fundamental / Summary
│   │   ├── explore/                 ← Historical Performance + Compare
│   │   └── page.tsx                 ← main page
│   └── scripts/
│       └── build-data.mjs           ← สร้าง ipo.json จาก CSVs
└── outputs/                         ← reports จาก test automation
```

---

## Pipeline การทำงาน

### Build-time

```bash
cd ipo-ui
node scripts/build-data.mjs
```

อ่าน CSVs ใน `src/app/data/` → คำนวณ:

| สิ่งที่สร้าง | คำอธิบาย |
|---|---|
| `globalFundamentalStats` | สถิติของแต่ละ tier (n, mean return, prob_gain_strong/gain/loss/loss_strong) |
| `tierThresholds` | qcut bins (q33/q67) สำหรับ ROE / EY / DE / cost / existing |
| `peerBySector`, `peerByIndustry` | สำหรับ Earnings Yield peer-relative comparison |
| `faPersons`, `faCompanies`, `leadUnderwriters`, `leadCo` | pre-aggregated stats per entity |

Output: `src/app/data/ipo.json` (~3.3 MB)

### Runtime

ผู้ใช้กรอกข้อมูล → React Context อัปเดต state → sections re-compute และ render สถิติ + score ทันที (ไม่มี backend)

---


## Tech Stack

- **Framework** — Next.js 16 (App Router) + React 19
- **UI** — Material-UI (MUI) v9
- **Language** — TypeScript
- **Data** — Static JSON (precompute จาก CSV)
- **State** — React Context (no backend)
- **Testing** — Jest + Testing Library
- **Admin / API** — Next.js API routes + **PostgreSQL** ผ่าน `pg` (เฉพาะ `/ipo` dashboard)

> หน้า analytics สาธารณะ (`/`) เป็น static ล้วน อ่านจาก `ipo.json` ไม่ต้องมี DB —
> ส่วน admin dashboard ที่ `/ipo` ต้องเชื่อม PostgreSQL จึงต้องตั้งค่า env ด้านล่าง
>
> DB เป็น **PostgreSQL มาตรฐาน** — รัน schema ด้วย `psql` ได้ตรง ๆ ไม่ต้องใช้ Supabase CLI/SDK
> (Supabase เป็นเพียงตัวเลือกหนึ่งของ host; จะใช้ Postgres ที่ไหนก็ได้)

---

## Environment Variables

คัดลอก `ipo-ui/.env.example` → `ipo-ui/.env.local` แล้วเติมค่าจริง
(`.env.local` ถูก gitignore ไว้ — **ห้าม commit secret**)

| ตัวแปร | จำเป็น | ใช้ทำอะไร |
|---|---|---|
| `DATABASE_URL` | ✅ | connection string ของ PostgreSQL เช่น `postgresql://user:pass@host:5432/db`. ถ้าไม่ตั้ง จะ fallback ไปใช้ `POSTGRES_HOST/PORT/DB/USER/PASSWORD` |
| `SESSION_SECRET` | ✅ | คีย์เซ็น JWT session ของ admin — `openssl rand -base64 32` |
| `NEXT_PUBLIC_API_CIPHER_KEY` | ✅ | คีย์ AES-256-GCM (hex 64 ตัว) เข้ารหัส API response — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GH_TOKEN`, `GH_REPO`, `GH_WORKFLOW` | – | สำหรับปุ่ม trigger build (GitHub Actions) ในหน้า `/ipo/builds` |
| `NEXT_PUBLIC_APP_URL` | – | base URL ตอน self-host (บน Vercel ใช้ `VERCEL_URL` อัตโนมัติ) |
| `NODE_OPTIONS` | – | เช่น `--max-old-space-size=4096` กัน OOM ตอน build (ipo.json ใหญ่) |
| `SCRAPER_*` | – | ตั้งค่า Python scraper ดู `.env.example` |

> หมายเหตุ: โปรเจกต์เชื่อม Postgres ตรงผ่าน `pg` — **ไม่ได้ใช้** supabase-js
> ฉะนั้นไม่ต้องตั้ง `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`

---

## Deployment

### 1. ตั้งค่าฐานข้อมูล (PostgreSQL)

สร้าง database แล้วรัน SQL migration ใน `supabase/migrations/` **เรียงตามลำดับเลข**
ด้วย `psql` (โฟลเดอร์ชื่อ `supabase/` ตามที่มา แต่เป็น Postgres มาตรฐาน):

```bash
# Linux/macOS — รันทุกไฟล์เรียงลำดับ
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

```powershell
# Windows PowerShell
Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | ForEach-Object {
  psql $env:DATABASE_URL -f $_.FullName
}
```

จากนั้นรัน migration ของ auth/RBAC (อยู่คนละโฟลเดอร์ — จำเป็นสำหรับ admin login):

```bash
cd ipo-ui && node scripts/run-auth-rbac-migration.mjs
```

แล้วนำเข้าข้อมูล IPO เริ่มต้น (จาก CSV) เข้า DB:

```bash
cd ipo-ui && npm run db:import
```

#### Schema ที่ migration สร้าง

**Core IPO data**
- `ipos` — ตารางหลัก: symbol, ราคา IPO, returns (D1–6M), market/industry/sector, FA/underwriter
- `ipo_financials` — งบการเงินต่อ IPO (ROE/DE/PE ฯลฯ)
- `sectors` — mapping symbol → market / industry / sector
- `fa_normalizations` — normalize ชื่อ FA (บุคคล/บริษัท)

**Data quality / validation**
- `validation_rules` — กฎตรวจความครบถ้วน/ถูกต้องของข้อมูล
- `validation_results` — ผลการตรวจรายเรคคอร์ด

**Build & scrape pipeline**
- `build_runs`, `build_logs` — log การ build `ipo.json`
- `sync_jobs` — งาน sync ข้อมูล
- `scrape_runs`, `scrape_run_items` — log การ scrape upcoming IPO
- `scraper_schedule` — ตารางเวลา scraper

**Admin auth / RBAC**
- `admin_users`, `admin_roles`, `admin_permissions`, `admin_role_permissions`, `admin_sessions`

**Views** (สำหรับ dashboard / รายงาน)
- `v_dashboard_stats`, `v_ipo_completeness`, `v_ipo_missing_fields`, `v_recent_updates`,
  `v_upcoming_ipos`, `v_fa_company_stats`, `v_underwriter_stats`

### 2. Build ข้อมูล (สร้าง `ipo.json`)

ก่อน deploy ทุกแบบ ต้อง build artifact ของหน้า analytics ก่อน:

```bash
cd ipo-ui
npm ci
npm run build:data    # ดึงจาก DB  (หรือ npm run build:csv ถ้าจะ build จาก CSV)
```

### 3a. Deploy บน Vercel

1. Push repo ขึ้น GitHub
2. ที่ Vercel → **New Project** → import repo
3. ตั้ง **Root Directory** = `ipo-ui`
4. **Project Settings → Environment Variables** ใส่ตัวแปรจากตารางด้านบน
   (อย่างน้อย `DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_API_CIPHER_KEY`)
5. Framework auto-detect เป็น Next.js — `npm run build` / output อัตโนมัติ
6. กด **Deploy**

> ถ้าใช้ Supabase เป็น host ให้ใช้ **pooler host** (`...pooler.supabase.com:6543`) ใน `DATABASE_URL` —
> host แบบ direct (`db.<ref>.supabase.co`) เป็น IPv6-only มักต่อไม่ได้บน Vercel

### 3b. Self-host / VPS (Node 20+)

```bash
cd ipo-ui
cp .env.example .env.local   # แล้วเติมค่าจริง
npm ci
npm run build:data           # สร้าง ipo.json
npm run build                # build production
npm run start                # รันที่ port 3000
```

แนะนำรันด้วย process manager (เช่น `pm2 start "npm run start" --name ipo-ui`)
และวาง reverse proxy (Nginx/Caddy) หน้า port 3000 พร้อม HTTPS

---

