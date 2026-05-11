# IPO Performance Analytics

ระบบวิเคราะห์ IPO เชิงลึกของตลาดหุ้นไทย — รวมสถิติย้อนหลังของ **ที่ปรึกษาทางการเงิน (FA)**, **ผู้จัดจำหน่าย (Underwriter)** และ **ปัจจัยพื้นฐาน** ของบริษัทเพื่อประเมินโอกาสปิดบวกวันแรก และให้คำแนะนำลงทุน (BUY / NEUTRAL / AVOID) แบบ real-time

สร้างเพื่อ replicate logic ของ Python notebook (`analyze_ipo_v4`) ที่ใช้วิเคราะห์ IPO ย้อนหลังจากฐานข้อมูล 548 IPO

---

## 📸 Features

- **FA Analysis** — กรอกชื่อที่ปรึกษาทางการเงิน (บุคคล / บริษัท) → ดึงสถิติย้อนหลัง (โอกาสปิดบวก, ผลตอบแทนเฉลี่ย, downside, sample size)
- **Lead-Co Underwriter Analysis** — วิเคราะห์ผู้จัดจำหน่ายหลัก + ผู้ร่วมจำหน่าย พร้อม peer-matching
- **Fundamental Analysis** — กรอกข้อมูลจาก Filing (ราคา IPO, financials) → คำนวณ ROE / DE / PE / EY / cost ratio → ตี tier → lookup สถิติ
- **Live Performance Summary** — รวม 3 มิติเป็น Overall Score + Combo signals (FA+UW, FA+Fund, UW+Fund)
- **Earnings Yield peer-relative** — เปรียบเทียบ EY กับ peer ในหมวดธุรกิจ / กลุ่มอุตสาหกรรมเดียวกัน
- **Historical Performance Explorer** — เปิดดูตารางสถิติย้อนหลังของ FA / Lead / Lead-Co
- **Compare Performance** — เปรียบเทียบ Entity 2 ราย side-by-side

---

## 🚀 Quick Start

```bash
git clone https://github.com/Suphanat10/IPO.git
cd IPO/ipo-ui
npm install
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

---

## 📂 โครงสร้าง

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

## 🔄 Pipeline การทำงาน

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


## 🛠️ Tech Stack

- **Framework** — Next.js 16 (App Router) + React 19
- **UI** — Material-UI (MUI) v9
- **Language** — TypeScript
- **Data** — Static JSON (precompute จาก CSV)
- **State** — React Context (no backend)
- **Testing** — Jest + Testing Library

---

