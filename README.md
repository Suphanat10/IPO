# IPO Performance Analytics

ระบบวิเคราะห์ IPO เชิงลึกของตลาดหุ้นไทย — รวมสถิติย้อนหลังของ **ที่ปรึกษาทางการเงิน (FA)**, **ผู้จัดจำหน่าย (Underwriter)** และ **ปัจจัยพื้นฐาน (Fundamentals)** ของบริษัท เพื่อประเมินโอกาสปิดบวกวันแรก พร้อมให้สัญญาณ **BUY / NEUTRAL / AVOID** และตามติด IPO ที่กำลังจะเข้าเทรด

เป็นเครื่องมือใช้งานส่วนตัว (single-user) deploy เป็น **single Docker container + PostgreSQL** ในชุดเดียว

---

## รายละเอียดงาน

### ฟีเจอร์หลัก

| ด้าน | รายละเอียด |
|---|---|
| **FA Analysis** | กรอกชื่อที่ปรึกษาทางการเงิน (บุคคล/บริษัท) → ดึงสถิติย้อนหลัง (โอกาสปิดบวก, ผลตอบแทนเฉลี่ย, downside, sample size) |
| **Lead-Co Underwriter Analysis** | วิเคราะห์ผู้จัดจำหน่ายหลัก + ผู้ร่วมจำหน่าย พร้อม peer-matching |
| **Fundamental Analysis** | กรอกข้อมูลจาก Filing → คำนวณ ROE / DE / PE / EY / cost ratio → ตี tier → lookup สถิติ |
| **Live Performance Summary** | รวม 3 มิติเป็น Overall Score + Combo signals (FA+UW, FA+Fund, UW+Fund) |
| **Earnings Yield peer-relative** | เปรียบเทียบ EY กับ peer ในหมวดธุรกิจ/กลุ่มอุตสาหกรรมเดียวกัน |
| **Historical Explorer / Compare** | เปิดตารางสถิติย้อนหลัง + เปรียบเทียบ Entity 2 รายแบบ side-by-side |
| **Upcoming IPO Board** | ติดตาม IPO ที่กำลังจะเข้า พร้อม readiness score (ดึงจาก SET/SEC ผ่าน scraper) |
| **Admin Dashboard (`/ipo`)** | จัดการข้อมูล IPO, import CSV, validation, build artifact, ตั้งเวลา scraper |

### สถาปัตยกรรม

แอปเป็น **hybrid** ระหว่าง static artifact และ DB:

- **สถิติย้อนหลัง** (FA/UW/Fundamental) อ่านจาก `src/app/data/ipo.json` ที่ pre-compute มาจาก DB → render เร็ว ไม่ query
- **ข้อมูลสด** (upcoming IPO, dropdown, recommendations) และ **ทั้ง admin** query PostgreSQL โดยตรงผ่าน `pg`
- **In-process scheduler** (`src/instrumentation.ts`) ยิง scraper ตามเวลาในตาราง `scraper_schedule` (เวลากรุงเทพ)

### Tech Stack

Next.js 16 (App Router) · React 19 · TypeScript · Material-UI v9 · PostgreSQL (`pg`) · Jest · Docker

### โครงสร้างย่อ

```
IPO/
├── ipo-ui/              ← Next.js 16 web app
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── src/             ← app (pages, api, components, sections, lib)
│   └── scripts/         ← build / import / export / backup / scrape
├── db/migrations/       ← SQL schema (PostgreSQL มาตรฐาน)
└── backups/             ← DB dumps
```

---

## รันด้วย Docker

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

### สิ่งที่ compose จัดการให้อัตโนมัติ

- สร้าง **PostgreSQL 17** (`db` service) + named volume `pgdata` เก็บข้อมูลถาวร
- รัน SQL ทั้งหมดใน [`db/migrations/`](db/migrations) เรียงตามเลข → สร้าง schema ครบในการ init ครั้งแรก
- `web` รอจน DB `healthy` ก่อนสตาร์ต และชี้ `DATABASE_URL` ไปที่ `db` ภายใน network ให้เอง
- ตั้ง timezone ทั้ง 2 container เป็น **Asia/Bangkok**

> DB เริ่มต้นมีแต่ schema เปล่า — import ข้อมูลตั้งต้นจาก seed CSV ด้วย:
> ```bash
> docker compose exec web node scripts/import-csv-to-db.mjs
> ```

### คำสั่งที่ใช้บ่อย

```bash
docker compose ps             # สถานะ container
docker compose logs -f web    # ดู log แอป (รวม scheduler)
docker compose down           # หยุด (data ใน pgdata คงอยู่)
docker compose down -v        # หยุด + ลบ data ทั้งหมด
```

### Environment ที่เกี่ยวข้อง

ตั้งใน `ipo-ui/.env` (ดูทั้งหมดใน [`.env.example`](ipo-ui/.env.example)):

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | credentials ของ Postgres ที่ bundle มา (default `postgres` / `postgres` / `ipo`) |
| `DATABASE_URL` | compose override ให้ชี้ `db` อัตโนมัติ — ตั้งเองเฉพาะกรณีใช้ Postgres ภายนอก |
| `TZ` | timezone (default `Asia/Bangkok`) |
| `CRON_SECRET` | ถ้าตั้ง จะบังคับ `Authorization: Bearer` บน `GET /api/ipo/upcoming/scrape` |
| `SCHEDULER_DISABLED` | ตั้ง `1` เพื่อปิด in-process scheduler |

### ใช้ Postgres ภายนอกแทน bundled DB

comment ส่วน `db` service, `depends_on`, และ `DATABASE_URL` override ของ `web` ใน [`docker-compose.yml`](ipo-ui/docker-compose.yml) ออก แล้วใส่ `DATABASE_URL` ของ DB ภายนอกใน `.env`
