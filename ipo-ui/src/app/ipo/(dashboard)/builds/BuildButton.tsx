"use client";

import * as React from "react";
import { Button, CircularProgress, Stack } from "@mui/material";
import PlayCircleFilledRoundedIcon from "@mui/icons-material/PlayCircleFilledRounded";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

export default function BuildButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function trigger() {
    const confirm = await Swal.fire({
      title: "สร้าง ipo.json ตอนนี้? / Build ipo.json now?",
      text: "ระบบจะดึงข้อมูลจาก Postgres แล้วสร้าง ipo.json ใหม่ / The system will read from Postgres and generate a new ipo.json file. ใช้เวลาประมาณ 10-30 วินาที / Takes about 10-30 seconds.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "สร้างเลย / Build now",
      cancelButtonText: "ยกเลิก / Cancel",
      confirmButtonColor: "#0284c7",
    });
    if (!confirm.isConfirmed) return;

    setBusy(true);

    // Show loading overlay while triggering the build
    Swal.fire({
      title: "กำลังสั่ง Build / Triggering build...",
      html: `<span style="color:#475569">เริ่มสายงานบนเซิร์ฟเวอร์ / Starting the server pipeline</span>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const res = await fetch("/api/ipo/builds/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger_type: "manual" }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      const data = await res.json();

      Swal.close();
      await Swal.fire({
        title: "เริ่ม Build แล้ว / Build started",
        html: `Run <b>#${data.runId}</b> กำลังทำงานอยู่ / is running. รีเฟรชหน้าเพื่อดูผลลัพธ์ / Refresh the page to see the result.`,
        icon: "success",
        timer: 2500,
        showConfirmButton: false,
      });

      // Poll for completion (simple — reload after 5s)
      setTimeout(() => router.refresh(), 5000);
    } catch (err) {
      Swal.close();
      const message = err instanceof Error ? err.message : String(err);
      await Swal.fire({
        title: "Build ล้มเหลว / Build failed",
        text: message,
        icon: "error",
        confirmButtonText: "ตกลง / OK",
        confirmButtonColor: "#be123c",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack direction="row" spacing={1}>
      <Button
        variant="contained"
        size="medium"
        onClick={trigger}
        disabled={busy}
        startIcon={
          busy ? (
            <CircularProgress size={16} color="inherit" />
          ) : (
            <PlayCircleFilledRoundedIcon />
          )
        }
        sx={{
          textTransform: "none",
          fontWeight: 700,
        }}
    >
        {busy ? "กำลัง Build... / Building..." : "Build ตอนนี้ / Build now"}
      </Button>
    </Stack>
  );
}
