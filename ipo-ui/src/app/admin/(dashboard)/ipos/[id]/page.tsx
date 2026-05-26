import * as React from "react";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import Link from "next/link";
import IpoForm from "../IpoForm";
import { isSupabaseConfigured, MOCK_IPO_DETAIL } from "@/lib/supabase/mock";
import { getIpo } from "@/lib/supabase/queries";

export default async function IpoEditPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const usingMock = !isSupabaseConfigured();

  const { ipo, financials } = usingMock
    ? MOCK_IPO_DETAIL
    : await getIpo(Number(id));

  if (!ipo) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">ไม่พบ IPO id={id}</Alert>
        <Link href="/admin/ipos">← back</Link>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Link href="/admin/ipos" style={{ fontSize: 13, textDecoration: "none" }}>
          ← All IPOs
        </Link>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.5 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {ipo.symbol}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {ipo.company_name}
          </Typography>
        </Stack>
      </Box>

      {usingMock ? (
        <Alert severity="info">Mock data — connect Supabase เพื่อแก้ไขจริง</Alert>
      ) : null}

      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 2 }}>
        <IpoForm ipo={ipo} financials={financials} />
      </Paper>
    </Stack>
  );
}
