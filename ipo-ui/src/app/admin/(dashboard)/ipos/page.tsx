import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import Link from "next/link";
import IposTable from "./IposTable";
import { isSupabaseConfigured, MOCK_COMPLETENESS } from "@/lib/supabase/mock";
import { getIposList } from "@/lib/supabase/queries";
import type { CompletenessRow } from "@/lib/supabase/types";

export default async function IposPage(props: {
  searchParams: Promise<{ q?: string; status?: string; min?: string }>;
}) {
  const params = await props.searchParams;
  const usingMock = !isSupabaseConfigured();

  let rows: CompletenessRow[] = [];
  let total = 0;

  if (usingMock) {
    rows = MOCK_COMPLETENESS.filter((r) => {
      if (params.q && !r.symbol.toLowerCase().includes(params.q.toLowerCase()))
        return false;
      if (params.status && r.status !== params.status) return false;
      if (params.min && r.completeness_pct < Number(params.min)) return false;
      return true;
    });
    total = rows.length;
  } else {
    const r = await getIposList({
      search: params.q,
      status: params.status,
      minCompleteness: params.min ? Number(params.min) : undefined,
      limit: 100,
    });
    rows = r.rows;
    total = r.total;
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="overline" color="primary" sx={{ letterSpacing: 0.6 }}>
            IPO EXPLORER
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            All IPOs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ค้นหา / กรอง / แก้ไขข้อมูล IPO ทุกรายการ
          </Typography>
        </Box>
        <Link href="/admin/ipos/new" style={{ textDecoration: "none" }}>
          <Button variant="contained" startIcon={<AddRoundedIcon />}>
            New IPO
          </Button>
        </Link>
      </Stack>

      {usingMock ? (
        <Alert severity="info">Mock data — connect Supabase เพื่อดูข้อมูลจริง</Alert>
      ) : null}

      <Paper sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <Chip label={`${total} rows`} size="small" />
          {params.status ? (
            <Chip label={`status: ${params.status}`} size="small" color="primary" />
          ) : null}
          {params.q ? <Chip label={`search: "${params.q}"`} size="small" /> : null}
          {params.min ? (
            <Chip label={`min completeness: ${params.min}%`} size="small" />
          ) : null}
        </Stack>
        <IposTable rows={rows} />
      </Paper>
    </Stack>
  );
}
