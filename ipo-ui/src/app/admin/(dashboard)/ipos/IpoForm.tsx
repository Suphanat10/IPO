"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import { useRouter } from "next/navigation";
import type { IpoRow, IpoFinancialsRow } from "@/lib/supabase/types";

type FormState = Partial<IpoRow> & {
  financials?: Partial<IpoFinancialsRow>;
};

function arrToInput(arr: string[] | null | undefined): string {
  return (arr ?? []).join("\n");
}
function inputToArr(s: string): string[] | null {
  const parts = s.split("\n").map((x) => x.trim()).filter(Boolean);
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
      inputProps={{ step: props.step ?? "any" }}
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
  const [state, setState] = React.useState<FormState>({
    ...ipo,
    financials: financials ?? {},
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

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
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const method = isNew ? "POST" : "PATCH";
      const url = isNew ? "/api/admin/ipos" : `/api/admin/ipos/${ipo.id}`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSuccess(true);
      if (isNew && data.id) {
        router.push(`/admin/ipos/${data.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={3}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">บันทึกแล้ว</Alert> : null}

        <Box>
          <Typography variant="overline" color="text.secondary">
            Identity
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small" fullWidth required label="Symbol *"
                value={state.symbol ?? ""}
                onChange={(e) => patch("symbol", e.target.value.toUpperCase())}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField
                size="small" fullWidth label="Company name"
                value={state.company_name ?? ""}
                onChange={(e) => patch("company_name", e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small" fullWidth select label="Status"
                value={state.status ?? "listed"}
                onChange={(e) => patch("status", e.target.value as IpoRow["status"])}
              >
                <MenuItem value="upcoming">Upcoming</MenuItem>
                <MenuItem value="listed">Listed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                size="small" fullWidth label="Listing date"
                type="date"
                slotProps={{ inputLabel: { shrink: true } }}
                value={state.listing_date ?? ""}
                onChange={(e) => patch("listing_date", e.target.value || null)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <NumField label="IPO price"
                value={state.ipo_price}
                onChange={(v) => patch("ipo_price", v)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField size="small" fullWidth label="Market"
                value={state.market ?? ""}
                onChange={(e) => patch("market", e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField size="small" fullWidth label="Industry"
                value={state.industry ?? ""}
                onChange={(e) => patch("industry", e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField size="small" fullWidth label="Sector"
                value={state.sector ?? ""}
                onChange={(e) => patch("sector", e.target.value)} />
            </Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography variant="overline" color="text.secondary">
            FA / Underwriters (one per line)
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small" fullWidth multiline minRows={2} label="FA persons"
                value={arrToInput(state.fa_persons)}
                onChange={(e) => patch("fa_persons", inputToArr(e.target.value))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small" fullWidth multiline minRows={2} label="FA companies"
                value={arrToInput(state.fa_companies)}
                onChange={(e) => patch("fa_companies", inputToArr(e.target.value))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small" fullWidth multiline minRows={2} label="Lead underwriters"
                value={arrToInput(state.lead_uw)}
                onChange={(e) => patch("lead_uw", inputToArr(e.target.value))}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                size="small" fullWidth multiline minRows={2} label="Co-underwriters"
                value={arrToInput(state.co_uws)}
                onChange={(e) => patch("co_uws", inputToArr(e.target.value))}
              />
            </Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography variant="overline" color="text.secondary">
            Day-1 prices
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="Open"  value={state.open_d1}  onChange={(v) => patch("open_d1", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="High"  value={state.high_d1}  onChange={(v) => patch("high_d1", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="Low"   value={state.low_d1}   onChange={(v) => patch("low_d1", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="Close" value={state.close_d1} onChange={(v) => patch("close_d1", v)} /></Grid>
          </Grid>
        </Box>

        <Box>
          <Typography variant="overline" color="text.secondary">
            Post-IPO closes
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="D2"  value={state.close_d2} onChange={(v) => patch("close_d2", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="D3"  value={state.close_d3} onChange={(v) => patch("close_d3", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="D4"  value={state.close_d4} onChange={(v) => patch("close_d4", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="D5"  value={state.close_d5} onChange={(v) => patch("close_d5", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="1W"  value={state.close_1w} onChange={(v) => patch("close_1w", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="1M"  value={state.close_1m} onChange={(v) => patch("close_1m", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="3M"  value={state.close_3m} onChange={(v) => patch("close_3m", v)} /></Grid>
            <Grid size={{ xs: 6, sm: 3 }}><NumField label="6M"  value={state.close_6m} onChange={(v) => patch("close_6m", v)} /></Grid>
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Typography variant="overline" color="text.secondary">
            Financials
          </Typography>
          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Gross proceeds"
                value={state.financials?.gross_proceeds}
                onChange={(v) => patchFin("gross_proceeds", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Total expense"
                value={state.financials?.total_expense}
                onChange={(v) => patchFin("total_expense", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Offered shares"
                value={state.financials?.offered_shares}
                onChange={(v) => patchFin("offered_shares", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Offered ratio %"
                value={state.financials?.offered_ratio_pct}
                onChange={(v) => patchFin("offered_ratio_pct", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Existing %"
                value={state.financials?.existing_shares_pct}
                onChange={(v) => patchFin("existing_shares_pct", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Executive %"
                value={state.financials?.executive_total_pct}
                onChange={(v) => patchFin("executive_total_pct", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Total assets"
                value={state.financials?.total_assets}
                onChange={(v) => patchFin("total_assets", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Total liabilities"
                value={state.financials?.total_liabilities}
                onChange={(v) => patchFin("total_liabilities", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Total equity"
                value={state.financials?.total_equity}
                onChange={(v) => patchFin("total_equity", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Revenue (latest)"
                value={state.financials?.revenue_latest}
                onChange={(v) => patchFin("revenue_latest", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Revenue (prev)"
                value={state.financials?.revenue_prev}
                onChange={(v) => patchFin("revenue_prev", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Net income (latest)"
                value={state.financials?.net_income_latest}
                onChange={(v) => patchFin("net_income_latest", v)} />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <NumField label="Net income (prev)"
                value={state.financials?.net_income_prev}
                onChange={(v) => patchFin("net_income_prev", v)} />
            </Grid>
          </Grid>
        </Box>

        <Stack direction="row" justifyContent="flex-end" spacing={1}>
          <Button type="submit" variant="contained" startIcon={<SaveRoundedIcon />} disabled={busy}>
            {busy ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
