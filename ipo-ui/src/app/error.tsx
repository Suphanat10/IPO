"use client";

import { Box, Button, Stack, Typography } from "@mui/material";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Box
      sx={{
        borderRadius: 3,
        border: "1px solid #fecaca",
        bgcolor: "#fff1f2",
        color: "#991b1b",
        p: { xs: 2, md: 3 },
      }}
    >
      <Stack spacing={1.5} sx={{ alignItems: "flex-start" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <ErrorOutlineRoundedIcon sx={{ fontSize: 22 }} />
          <Typography sx={{ fontWeight: 900, fontSize: { xs: 16, md: 18 } }}>
            โหลดข้อมูลหน้า IPO ไม่สำเร็จ
          </Typography>
        </Stack>
        <Typography sx={{ color: "#7f1d1d", fontSize: 13, lineHeight: 1.6 }}>
          ระบบพบปัญหาระหว่างดึงข้อมูลจาก server กรุณาลองใหม่อีกครั้ง
          {error.digest ? ` (digest: ${error.digest})` : ""}
        </Typography>
        <Button
          variant="contained"
          color="error"
          onClick={reset}
          sx={{ borderRadius: 2, textTransform: "none", fontWeight: 800 }}
        >
          ลองใหม่
        </Button>
      </Stack>
    </Box>
  );
}
