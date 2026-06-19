export const dynamic = "force-dynamic";

import { Alert, Stack } from "@mui/material";
import {
  AdminPageHeader,
  AdminPanel,
} from "../../components/AdminPrimitives";
import { getRecommendationPerformance } from "@/lib/ipo-recommendation-tracking";
import PredictionHistoryTable from "./PredictionHistoryTable";

export default async function PredictionPerformancePage() {
  const performance = await getRecommendationPerformance(800);
  const { summary, rows } = performance;

  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="ประวัติคะแนนคำแนะนำ"
        title="ประวัติคำแนะนำ IPO"
        description="เก็บคะแนน อัตราชนะ เป้าหมาย และคำแนะนำของ IPO ตอนยังไม่เข้าเทรด แล้วเทียบกับผลจริงหลังเข้าตลาด เพื่อดูว่าโมเดลแม่นแค่ไหนและผลตอบแทนออกมาเป็นอย่างไร"
      />

      {!summary.schemaReady ? (
        <Alert severity="warning">
          ยังไม่พบตารางเก็บประวัติ prediction กรุณารัน migration `0021_ipo_recommendation_tracking.sql` ก่อนใช้งานหน้านี้
        </Alert>
      ) : null}

      <AdminPanel
        title="ประวัติคะแนนล่าสุดต่อ IPO"
        subtitle="เรียงตามคะแนนจากมากไปน้อย ค้นหาหุ้น/ชื่อบริษัทได้ และแบ่งหน้าแสดงทีละ 10 รายการ"
        noPadding
      >
        <PredictionHistoryTable rows={rows} />
      </AdminPanel>
    </Stack>
  );
}
