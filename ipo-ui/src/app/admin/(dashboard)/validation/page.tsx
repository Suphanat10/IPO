export const dynamic = "force-dynamic";

import { Grid, Stack, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { getDashboardStats, getMissingFields, getValidations } from "@/lib/admin/queries";
import type { DashboardStats, MissingFieldsRow, ValidationResult } from "@/lib/admin/types";
import {
  AdminPageHeader,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
  adminColors,
} from "../../components/AdminPrimitives";
import MissingFieldsDonutChart, { type MissingFieldChartStat } from "./MissingFieldsDonutChart";
import MissingFieldsTable from "./MissingFieldsTable";

const MISSING_FIELD_LABEL: Record<string, string> = {
  company_name: "ชื่อบริษัท / Company name",
  listing_date: "วันที่เข้าเทรด / Listing date",
  ipo_price: "ราคา IPO / IPO price",
  market: "ตลาด / Market",
  industry: "กลุ่มอุตสาหกรรม / Industry",
  sector: "หมวดธุรกิจ / Sector",
  fa_persons: "บุคคล FA / FA persons",
  fa_companies: "บริษัท FA / FA companies",
  lead_uw: "ผู้จัดจำหน่ายหลัก / Lead underwriters",
  co_uws: "ผู้จัดจำหน่ายร่วม / Co-underwriters",
  open_d1: "ราคาเปิดวันแรก / Day-1 open",
  high_d1: "ราคาสูงสุดวันแรก / Day-1 high",
  low_d1: "ราคาต่ำสุดวันแรก / Day-1 low",
  close_d1: "ราคาปิดวันแรก / Day-1 close",
  close_d2: "ราคาปิด D2 / D2 close",
  close_d3: "ราคาปิด D3 / D3 close",
  close_d4: "ราคาปิด D4 / D4 close",
  close_d5: "ราคาปิด D5 / D5 close",
  close_1w: "ราคาปิด 1W / 1W close",
  close_1m: "ราคาปิด 1M / 1M close",
  close_3m: "ราคาปิด 3M / 3M close",
  close_6m: "ราคาปิด 6M / 6M close",
  gross_proceeds: "เงินระดมทุน / Gross proceeds",
  total_expense: "ค่าใช้จ่ายรวม / Total expense",
  offered_shares: "หุ้นเสนอขาย / Offered shares",
  offered_ratio_pct: "สัดส่วนเสนอขาย / Offered ratio",
  existing_shares_pct: "ผู้ถือหุ้นเดิม / Existing holders",
  executive_total_pct: "ผู้บริหาร / Executives",
  total_assets: "สินทรัพย์รวม / Total assets",
  total_liabilities: "หนี้สินรวม / Total liabilities",
  total_equity: "ส่วนของผู้ถือหุ้น / Total equity",
  revenue_latest: "รายได้ล่าสุด / Revenue latest",
  revenue_prev: "รายได้ปีก่อน / Revenue prev",
  net_income_latest: "กำไรล่าสุด / Net income latest",
  net_income_prev: "กำไรปีก่อน / Net income prev",
};

const DONUT_COLORS = [
  "#0284c7",
  "#14b8a6",
  "#f59e0b",
  "#be123c",
  "#7c3aed",
  "#16a34a",
  "#db2777",
  "#475569",
  "#94a3b8",
];

function buildMissingFieldStats(rows: MissingFieldsRow[]): {
  stats: MissingFieldChartStat[];
  total: number;
} {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const field of row.missing_fields) {
      counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }

  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const chartRows = rest.length
    ? [...top, ["other", rest.reduce((sum, [, count]) => sum + count, 0)] as [string, number]]
    : top;

  return {
    total,
    stats: chartRows.map(([key, count], index) => ({
      key,
      label: key === "other" ? "อื่น ๆ / Other" : MISSING_FIELD_LABEL[key] ?? key,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
      color: DONUT_COLORS[index % DONUT_COLORS.length],
    })),
  };
}

export default async function ValidationPage() {
  const [missing, validations, dashboardStats]: [MissingFieldsRow[], (ValidationResult & { symbol: string | null })[], DashboardStats | null] = await Promise.all([
    getMissingFields({ limit: 200 }),
    getValidations({ resolved: false }),
    getDashboardStats(),
  ]);

  const counts = {
    error: validations.filter((v) => v.severity === "error").length,
    warning: validations.filter((v) => v.severity === "warning").length,
    info: validations.filter((v) => v.severity === "info").length,
  };
  const stats = dashboardStats ?? {
    total_ipos: missing.length,
    listed_count: 0,
    upcoming_count: 0,
    cancelled_count: 0,
    complete_count: 0,
    incomplete_count: missing.length,
    last_data_update: null,
    last_build: null,
    error_count: counts.error,
    warning_count: counts.warning,
    info_count: counts.info,
  };
  const totalForRate = stats.total_ipos || stats.complete_count + stats.incomplete_count || missing.length;
  const completeRate = totalForRate ? Math.round((stats.complete_count / totalForRate) * 100) : 0;
  const validationTotal = counts.error + counts.warning + counts.info;
  const lowCompleteness = missing.filter((row) => row.completeness_pct < 70).length;
  const averageMissingCompleteness = missing.length
    ? Math.round(missing.reduce((sum, row) => sum + row.completeness_pct, 0) / missing.length)
    : 100;
  const missingFieldStats = buildMissingFieldStats(missing);

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="ตรวจคุณภาพ / Validation"
        title="คิวตรวจคุณภาพข้อมูล / Data quality queue"
        description="ตรวจรายการ validation ที่ยังไม่แก้ และ IPO ที่ยังขาดข้อมูลก่อนเผยแพร่ผลวิเคราะห์ / Review unresolved validation results and records with missing fields before publishing analysis output."
        chips={
          <>
            <AdminStatusPill label={`${counts.error} ข้อผิดพลาด / Errors`} tone={counts.error > 0 ? "danger" : "neutral"} />
            <AdminStatusPill label={`${counts.warning} คำเตือน / Warnings`} tone={counts.warning > 0 ? "warning" : "neutral"} />
            <AdminStatusPill label={`${counts.info} ข้อมูล / Info`} tone="info" />
            <AdminStatusPill label={`${missing.length} ไม่ครบ / Incomplete`} tone={missing.length > 0 ? "warning" : "success"} />
          </>
        }
      />

      <Stack spacing={1.5}>
        <Typography variant="h6" sx={{ color: adminColors.text, fontWeight: 850 }}>
          สถิติคุณภาพข้อมูล / Data quality statistics
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <AdminStatCard
              label="ข้อมูลครบถ้วน / Complete records"
              value={`${stats.complete_count.toLocaleString()} (${completeRate}%)`}
              helper={`${totalForRate.toLocaleString()} รายการทั้งหมด / total records`}
              icon={<CheckCircleIcon fontSize="small" />}
              tone="success"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <AdminStatCard
              label="ข้อมูลยังไม่ครบ / Incomplete records"
              value={stats.incomplete_count.toLocaleString()}
              helper={`${missing.length.toLocaleString()} รายการอยู่ในคิวเติมข้อมูล / rows in queue`}
              icon={<WarningAmberIcon fontSize="small" />}
              tone={stats.incomplete_count > 0 ? "warning" : "success"}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <AdminStatCard
              label="ความครบถ้วนเฉลี่ยในคิว / Queue avg completeness"
              value={`${averageMissingCompleteness}%`}
              helper="คำนวณจากรายการที่ยังขาดข้อมูล / incomplete rows only"
              icon={<FactCheckRoundedIcon fontSize="small" />}
              tone={averageMissingCompleteness >= 70 ? "info" : "warning"}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <AdminStatCard
              label="ต่ำกว่า 70% / Below 70%"
              value={lowCompleteness.toLocaleString()}
              helper="ควรจัดลำดับตรวจเพิ่มก่อน / prioritize first"
              icon={<ErrorOutlineIcon fontSize="small" />}
              tone={lowCompleteness > 0 ? "danger" : "success"}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <AdminStatCard
              label="ข้อความ validation / Validation messages"
              value={validationTotal.toLocaleString()}
              helper={`${counts.warning.toLocaleString()} คำเตือน, ${counts.info.toLocaleString()} ข้อมูล / warnings & info`}
              icon={<InfoOutlinedIcon fontSize="small" />}
              tone="info"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <AdminStatCard
              label="ข้อผิดพลาดที่ต้องแก้ / Blocking errors"
              value={counts.error.toLocaleString()}
              helper="ควรแก้ก่อน publish / resolve before publishing"
              icon={<ErrorOutlineIcon fontSize="small" />}
              tone={counts.error > 0 ? "danger" : "success"}
            />
          </Grid>
        </Grid>
        <MissingFieldsDonutChart
          stats={missingFieldStats.stats}
          total={missingFieldStats.total}
        />
      </Stack>

      <AdminPanel
        title="ข้อมูลที่ยังขาด / Missing fields"
        subtitle={`${missing.length} รายการ IPO ต้องเติมข้อมูล / IPO records need data`}
        noPadding
      >
        <MissingFieldsTable rows={missing} />
      </AdminPanel>
    </Stack>
  );
}
