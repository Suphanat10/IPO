"use client";

import * as React from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";

export type SectionKey = "fa" | "leadCo" | "fundamental";

export type VisibleSections = Record<SectionKey, boolean>;

const STORAGE_KEY = "ipo-ui:visibleSections";

const ALL_VISIBLE: VisibleSections = {
  fa: true,
  leadCo: true,
  fundamental: true,
};

const LABELS: Record<SectionKey, string> = {
  fa: "FA Analysis",
  leadCo: "Lead-Co Underwriter",
  fundamental: "Fundamental",
};

const ORDER: SectionKey[] = ["fa", "leadCo", "fundamental"];

export function useVisibleSections(): [
  VisibleSections,
  (k: SectionKey, v: boolean) => void,
] {
  const [state, setState] = React.useState<VisibleSections>(ALL_VISIBLE);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VisibleSections>;
        setState({ ...ALL_VISIBLE, ...parsed });
      }
    } catch {
      // ignore
    }
  }, []);

  const update = React.useCallback((k: SectionKey, v: boolean) => {
    setState((prev) => {
      const next = { ...prev, [k]: v };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return [state, update];
}

export default function SectionToggle({
  value,
  onChange,
}: {
  value: VisibleSections;
  onChange: (k: SectionKey, v: boolean) => void;
}) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "#fafbfd",
        px: 2,
        py: 1.25,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}
      >
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mr: 1 }}>
          <TuneRoundedIcon sx={{ fontSize: 18, color: "primary.main" }} />
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 13 }}>
            แสดง section:
          </Typography>
        </Stack>
        {ORDER.map((k) => (
          <FormControlLabel
            key={k}
            sx={{ mr: 0.5 }}
            control={
              <Checkbox
                size="small"
                checked={value[k]}
                onChange={(e) => onChange(k, e.target.checked)}
              />
            }
            label={
              <Typography variant="body2" sx={{ fontSize: 13 }}>
                {LABELS[k]}
              </Typography>
            }
          />
        ))}
      </Stack>
    </Box>
  );
}
