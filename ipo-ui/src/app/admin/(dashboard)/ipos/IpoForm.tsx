"use client";

import * as React from "react";
import {
  Autocomplete,
  Button,
  Grid,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";
import { toDateOnly } from "@/lib/date-format";
import type { IpoRow, IpoFinancialsRow } from "@/lib/admin/types";
import { useDropdownOptions } from "@/app/lib/useDropdownOptions";
import { AdminPanel } from "../../components/AdminPrimitives";

type FormState = Partial<IpoRow> & {
  financials?: Partial<IpoFinancialsRow>;
};

function arrToInput(arr: string[] | null | undefined): string {
  return (arr ?? []).join("\n");
}

function inputToArr(s: string): string[] | null {
  const parts = s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function NumField(props: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: string;
}) {
  return (
    <TextField
      size="small"
      fullWidth
      label={props.label}
      type="number"
      slotProps={{ htmlInput: { step: props.step ?? "any" } }}
      value={props.value ?? ""}
      onChange={(e) => {
        const t = e.target.value;
        props.onChange(t === "" ? null : Number(t));
      }}
    />
  );
}

export default function IpoForm({
  ipo,
  financials,
  isNew,
}: {
  ipo: Partial<IpoRow>;
  financials?: Partial<IpoFinancialsRow> | null;
  isNew?: boolean;
}) {
  const router = useRouter();
  const { underwriters } = useDropdownOptions();
  const [state, setState] = React.useState<FormState>({
    ...ipo,
    listing_date: toDateOnly(ipo.listing_date) || null,
    financials: financials ?? {},
  });
  const [busy, setBusy] = React.useState(false);

  function patch<K extends keyof IpoRow>(key: K, value: IpoRow[K] | null) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function patchFin<K extends keyof IpoFinancialsRow>(
    key: K,
    value: IpoFinancialsRow[K] | null,
  ) {
    setState((s) => ({ ...s, financials: { ...(s.financials ?? {}), [key]: value } }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const confirm = await Swal.fire({
      title: isNew ? "สร้าง IPO ใหม่?" : `บันทึกการแก้ไข`,
      text: isNew
        ? `ชื่อย่อ "${state.symbol}" จะถูกเพิ่มเข้าฐานข้อมูล`
        : "ระบบจะบันทึกการเปลี่ยนแปลงลงฐานข้อมูลทันที",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: isNew ? "สร้าง" : "บันทึก",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#0284c7",
    });
    if (!confirm.isConfirmed) return;

    setBusy(true);

    // Show loading overlay (blocking) while we save
    Swal.fire({
      title: isNew ? "กำลังสร้าง / Creating…" : "กำลังบันทึก / Saving…",
      html: `<span style="color:#475569">${isNew ? "สร้าง" : "อัปเดต"} <b>${state.symbol ?? ""}</b> ลงฐานข้อมูล</span>`,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const method = isNew ? "POST" : "PATCH";
      const url = isNew ? "/api/admin/ipos" : `/api/admin/ipos/${ipo.id}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }
      const data = await res.json();

      Swal.close();
      await Swal.fire({
        title: isNew ? "สร้างสำเร็จ" : "บันทึกสำเร็จ",
        text: isNew
          ? `IPO "${state.symbol}" ถูกสร้างเรียบร้อยแล้ว`
          : `IPO "${state.symbol}" ถูกอัปเดตแล้ว`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      if (isNew && data.id) {
        router.push(`/admin/ipos/${data.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      Swal.close();
      const message = err instanceof Error ? err.message : String(err);
      await Swal.fire({
        title: "เกิดข้อผิดพลาด",
        text: message,
        icon: "error",
        confirmButtonText: "ตกลง",
        confirmButtonColor: "#be123c",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2.5}>
        <AdminPanel title="ข้อมูลหลัก / Identity" subtitle="ข้อมูลการเข้าตลาดที่ใช้ในระบบ admin / Core listing information used across the admin console">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                required
                label="ชื่อย่อ / Symbol"
                value={state.symbol ?? ""}
                onChange={(e) => patch("symbol", e.target.value.toUpperCase())}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                select
                label="สถานะ / Status"
                value={state.status ?? "listed"}
                onChange={(e) => patch("status", e.target.value as IpoRow["status"])}
              >
                <MenuItem value="upcoming">IPO กำลังจะเข้า</MenuItem>
                <MenuItem value="listed">จดทะเบียนแล้ว / Listed</MenuItem>
                <MenuItem value="cancelled">ยกเลิก / Cancelled</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="วันที่เข้าเทรด / Listing date"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={state.listing_date ?? ""}
                onChange={(e) => patch("listing_date", e.target.value || null)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <NumField
                label="ราคา IPO / IPO price"
                value={state.ipo_price}
                onChange={(v) => patch("ipo_price", v)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="ตลาด / Market"
                value={state.market ?? ""}
                onChange={(e) => patch("market", e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="กลุ่มอุตสาหกรรม / Industry"
                value={state.industry ?? ""}
                onChange={(e) => patch("industry", e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small"
                fullWidth
                label="หมวดธุรกิจ / Sector"
                value={state.sector ?? ""}
                onChange={(e) => patch("sector", e.target.value)}
              />
            </Grid>
          </Grid>
        </AdminPanel>

        <AdminPanel title="FA และผู้จัดจำหน่าย / FA and underwriters" subtitle="กรอก 1 รายการต่อ 1 บรรทัด / Enter one person or company per line">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                label="บุคคล FA / FA persons"
                value={arrToInput(state.fa_persons)}
                onChange={(e) => patch("fa_persons", inputToArr(e.target.value))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                label="บริษัท FA / FA companies"
                value={arrToInput(state.fa_companies)}
                onChange={(e) => patch("fa_companies", inputToArr(e.target.value))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={underwriters}
                value={state.lead_uw ?? []}
                onChange={(_e, v) => patch("lead_uw", v.length ? v : null)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="ผู้จัดจำหน่ายหลัก / Lead underwriter"
                    placeholder="พิมพ์ชื่อ Lead Underwriter"
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                multiple
                freeSolo
                size="small"
                options={underwriters}
                value={state.co_uws ?? []}
                onChange={(_e, v) => patch("co_uws", v.length ? v : null)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="ผู้จัดจำหน่ายร่วม / Co-underwriters"
                    placeholder="พิมพ์ชื่อ Co-Underwriter"
                  />
                )}
              />
            </Grid>
          </Grid>
        </AdminPanel>

        <AdminPanel title="ราคาวันแรก / Day-1 prices" subtitle="ผลการซื้อขายวันแรก / First trading day performance">
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="เปิด / Open" value={state.open_d1} onChange={(v) => patch("open_d1", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="สูงสุด / High" value={state.high_d1} onChange={(v) => patch("high_d1", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="ต่ำสุด / Low" value={state.low_d1} onChange={(v) => patch("low_d1", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="ปิด / Close" value={state.close_d1} onChange={(v) => patch("close_d1", v)} />
            </Grid>
          </Grid>
        </AdminPanel>

        <AdminPanel title="ราคาปิดหลัง IPO / Post-IPO closes" subtitle="ราคาปิดหลังเข้าตลาด / Closing prices after listing">
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D2" value={state.close_d2} onChange={(v) => patch("close_d2", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D3" value={state.close_d3} onChange={(v) => patch("close_d3", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D4" value={state.close_d4} onChange={(v) => patch("close_d4", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="D5" value={state.close_d5} onChange={(v) => patch("close_d5", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="1W" value={state.close_1w} onChange={(v) => patch("close_1w", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="1M" value={state.close_1m} onChange={(v) => patch("close_1m", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="3M" value={state.close_3m} onChange={(v) => patch("close_3m", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <NumField label="6M" value={state.close_6m} onChange={(v) => patch("close_6m", v)} />
            </Grid>
          </Grid>
        </AdminPanel>

        <AdminPanel title="ข้อมูลการเงิน / Financials" subtitle="โครงสร้างเสนอขายและงบการเงินล่าสุด / Offering structure and latest financial statements">
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="เงินระดมทุน / Gross proceeds" value={state.financials?.gross_proceeds} onChange={(v) => patchFin("gross_proceeds", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="ค่าใช้จ่ายรวม / Total expense" value={state.financials?.total_expense} onChange={(v) => patchFin("total_expense", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="หุ้นเสนอขาย / Offered shares" value={state.financials?.offered_shares} onChange={(v) => patchFin("offered_shares", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="สัดส่วนเสนอขาย % / Offered ratio" value={state.financials?.offered_ratio_pct} onChange={(v) => patchFin("offered_ratio_pct", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="ผู้ถือหุ้นเดิม % / Existing" value={state.financials?.existing_shares_pct} onChange={(v) => patchFin("existing_shares_pct", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="ผู้บริหาร % / Executive" value={state.financials?.executive_total_pct} onChange={(v) => patchFin("executive_total_pct", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="สินทรัพย์รวม / Total assets" value={state.financials?.total_assets} onChange={(v) => patchFin("total_assets", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="หนี้สินรวม / Total liabilities" value={state.financials?.total_liabilities} onChange={(v) => patchFin("total_liabilities", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="ส่วนของผู้ถือหุ้น / Total equity" value={state.financials?.total_equity} onChange={(v) => patchFin("total_equity", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="รายได้ล่าสุด / Revenue latest" value={state.financials?.revenue_latest} onChange={(v) => patchFin("revenue_latest", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="รายได้ปีก่อน / Revenue prev" value={state.financials?.revenue_prev} onChange={(v) => patchFin("revenue_prev", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="กำไรล่าสุด / Net income latest" value={state.financials?.net_income_latest} onChange={(v) => patchFin("net_income_latest", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="กำไรปีก่อน / Net income prev" value={state.financials?.net_income_prev} onChange={(v) => patchFin("net_income_prev", v)} />
            </Grid>
          </Grid>
        </AdminPanel>

        <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="contained" startIcon={<SaveRoundedIcon />} disabled={busy}>
            {busy ? "กำลังบันทึก... / Saving..." : isNew ? "สร้าง IPO / Create IPO" : "บันทึกการแก้ไข / Save changes"}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
