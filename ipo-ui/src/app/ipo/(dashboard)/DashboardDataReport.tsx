import {
  Grid,
  Stack,
} from "@mui/material";
import type { DashboardReport } from "@/lib/admin/report";
import { AdminPanel } from "../components/AdminPrimitives";
import DashboardReportCharts from "./DashboardReportCharts";
import MarketMixDoughnutChart from "./MarketMixDoughnutChart";
import TopSectorsChart from "./TopSectorsChart";

export default function DashboardDataReport({
  report,
  totalRecords,
}: {
  report: DashboardReport;
  totalRecords: number;
}) {
  const chartReport = {
    yearlyListings: report.yearlyListings,
    statusMix: report.statusMix,
  };

  return (
    <Stack spacing={2}>
      <DashboardReportCharts report={chartReport} totalRecords={totalRecords} />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <AdminPanel
            title="ตลาด / Market mix"
            subtitle="Doughnut แสดงสัดส่วนจำนวน IPO ตามตลาด พร้อมความครบถ้วนเฉลี่ย"
            sx={{ height: "100%" }}
          >
            <MarketMixDoughnutChart rows={report.marketMix} />
          </AdminPanel>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <AdminPanel
            title="กลุ่มธุรกิจสูงสุด / Top sectors"
            subtitle="กราฟแท่งแนวนอนจัดอันดับ sector ที่มีจำนวน IPO มากที่สุด"
            sx={{ height: "100%" }}
          >
            <TopSectorsChart rows={report.sectorLeaders} />
          </AdminPanel>
        </Grid>
      </Grid>
    </Stack>
  );
}
