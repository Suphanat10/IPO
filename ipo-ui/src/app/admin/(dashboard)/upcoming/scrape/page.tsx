import { Stack } from "@mui/material";
import { AdminPageHeader } from "../../../components/AdminPrimitives";
import ScrapeConsole from "./ScrapeConsole";

export default function UpcomingScrapePage() {
  return (
    <Stack spacing={3}>
      <AdminPageHeader
        eyebrow="ดึงข้อมูล IPO กำลังจะเข้า "
        title=" คอนโซลดึงข้อมูล IPO"
        description="สั่งดึงข้อมูล IPO ที่จะเข้าตลาดจาก SET API + SEC, ตรวจดู diff ก่อน apply, และดูประวัติการ scrape ย้อนหลัง "
      />
      <ScrapeConsole />
    </Stack>
  );
}
