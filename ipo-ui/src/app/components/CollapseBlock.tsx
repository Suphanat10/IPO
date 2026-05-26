"use client";

import * as React from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";

type Props = {
  title: string;
  subtitle?: string;
  chipLabel?: string;
  defaultExpanded?: boolean;
  /** Controlled expand — when provided, overrides internal state. */
  expanded?: boolean;
  children: React.ReactNode;
};

export default function CollapseBlock({
  title,
  subtitle,
  chipLabel,
  defaultExpanded = false,
  expanded: controlledExpanded,
  children,
}: Props) {
  const [internalExpanded, setInternalExpanded] = React.useState(defaultExpanded);

  const isExpanded = controlledExpanded ?? internalExpanded;

  return (
    <Accordion
      expanded={isExpanded}
      onChange={(_, val) => setInternalExpanded(val)}
      disableGutters
      elevation={0}
      sx={{
        border: "1px dashed",
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "#fafbfd",
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "center", width: "100%", flexWrap: "wrap" }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {chipLabel ? (
            <Chip
              size="small"
              label={chipLabel}
              sx={{ fontWeight: 600, bgcolor: "primary.main", color: "#fff" }}
            />
          ) : null}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}
