"use client";

import * as React from "react";
import { Box } from "@mui/material";
import { DataGrid, type GridColDef, type GridRowsProp } from "@mui/x-data-grid";
import { COLUMN_LABELS, VIEW_COLUMNS, type SummaryRow, type ViewKey } from "../lib/types";

type Props = {
  rows: (SummaryRow & { co?: string })[];
  nameLabel: string;
  view: ViewKey;
  showCo?: boolean;
  minIpo?: number | null;
  maxIpo?: number | null;
  defaultSort?: keyof SummaryRow;
};

const pct = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "—" : `${v.toFixed(2)}`;

export default function SummaryDataGrid({
  rows,
  nameLabel,
  view,
  showCo,
  minIpo,
  maxIpo,
  defaultSort = "avg_return_close_d1",
}: Props) {
  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (minIpo != null && r.ipo_count < minIpo) return false;
      if (maxIpo != null && r.ipo_count > maxIpo) return false;
      return true;
    });
  }, [rows, minIpo, maxIpo]);

  const columns = React.useMemo<GridColDef[]>(() => {
    const spec = VIEW_COLUMNS[view];
    const metricKeys = spec === "ALL"
      ? ([
          "ipo_count",
          "prob_open_above_ipo",
          "prob_high_above_ipo",
          "prob_low_above_ipo",
          "prob_close_above_ipo",
          "avg_return_open_d1",
          "avg_return_high_d1",
          "avg_return_low_d1",
          "avg_return_close_d1",
          "best_return_d1",
          "worst_return_d1",
          "avg_intraday_range_d1",
          "avg_return_1W",
          "avg_return_1M",
          "avg_return_3M",
          "avg_return_6M",
          "max_return_week",
          "min_return_week",
          "prob_close_d5_above_ipo",
        ] as (keyof SummaryRow)[])
      : (spec as (keyof SummaryRow)[]);

    const nameCol: GridColDef = {
      field: "name",
      headerName: nameLabel,
      flex: 1.5,
      minWidth: 220,
      sortable: true,
    };
    const coCol: GridColDef = {
      field: "co",
      headerName: "Co-Underwriter",
      flex: 1.2,
      minWidth: 200,
    };

    const metrics: GridColDef[] = metricKeys.map((k) => ({
      field: k as string,
      headerName: COLUMN_LABELS[k as string] ?? String(k),
      flex: 1,
      minWidth: 140,
      type: "number",
      align: "right",
      headerAlign: "right",
      valueFormatter: (value) => {
        if (value == null || Number.isNaN(value)) return "—";
        if (k === "ipo_count") return `${value}`;
        return pct(value as number);
      },
      renderCell: (params) => {
        const raw = params.value as number | undefined;
        if (raw == null || Number.isNaN(raw)) return "—";
        if (k === "ipo_count") return <span>{raw}</span>;
        const isReturn = String(k).includes("return") || String(k).includes("range");
        const color =
          isReturn && raw !== 0
            ? raw > 0
              ? "#15803d"
              : "#b91c1c"
            : "inherit";
        return <span style={{ color, fontWeight: 600 }}>{pct(raw)}</span>;
      },
    }));

    return showCo ? [nameCol, coCol, ...metrics] : [nameCol, ...metrics];
  }, [view, nameLabel, showCo]);

  const gridRows: GridRowsProp = filtered.map((r, i) => ({ id: i, ...r }));

  return (
    <Box sx={{ width: "100%" }}>
      <DataGrid
        rows={gridRows}
        columns={columns}
        initialState={{
          sorting: { sortModel: [{ field: defaultSort as string, sort: "desc" }] },
          pagination: { paginationModel: { pageSize: 10 } },
        }}
        pageSizeOptions={[5, 10, 20, 50]}
        disableRowSelectionOnClick
        density="comfortable"
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          "& .MuiDataGrid-columnHeaders": {
            bgcolor: "#f8fafc",
            fontWeight: 700,
          },
          "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": {
            outline: "none",
          },
          "& .MuiDataGrid-row:hover": { bgcolor: "rgba(10,25,41,0.04)" },
        }}
      />
    </Box>
  );
}
