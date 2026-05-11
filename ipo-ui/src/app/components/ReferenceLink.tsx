"use client";

import * as React from "react";
import {
  Box,
  Button,
  Divider,
  Link,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import FindInPageRoundedIcon from "@mui/icons-material/FindInPageRounded";

export type ReferenceExample = {
  value?: string;
  excerpt?: string;
  note?: string;
  source?: string;
  url?: string;
};

type Props = {
  example: ReferenceExample;
  label?: string;
};

export default function ReferenceLink({ example, label }: Props) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchor);

  return (
    <>
      <Link
        component="button"
        type="button"
        underline="hover"
        variant="caption"
        onClick={(e) => setAnchor(e.currentTarget as HTMLElement)}
        sx={{
          ml: 0.75,
          display: "inline-flex",
          alignItems: "center",
          gap: 0.25,
          color: "primary.main",
          fontWeight: 600,
        }}
      >
        <FindInPageRoundedIcon sx={{ fontSize: 14 }} />
        {label ?? "ดูตัวอย่าง"}
      </Link>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              boxShadow: "0 12px 32px rgba(15,23,42,0.12)",
              maxWidth: 380,
            },
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography
            variant="overline"
            sx={{ color: "primary.main", fontWeight: 700, letterSpacing: "0.1em" }}
          >
            ตัวอย่างข้อมูลจาก Filing
          </Typography>
          {example.excerpt ? (
            <Box
              sx={{
                mt: 0.75,
                bgcolor: "#f1f5f9",
                p: 1.25,
                borderRadius: 1.5,
                border: "1px dashed",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  display: "block",
                  lineHeight: 1.7,
                }}
              >
                {example.excerpt}
              </Typography>
            </Box>
          ) : null}
          {example.source ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.75 }}
            >
              ที่มา: {example.source}
            </Typography>
          ) : null}
          {example.note ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5 }}
            >
              {example.note}
            </Typography>
          ) : null}
          <Divider sx={{ my: 1.25 }} />
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            <Button
              size="small"
              variant="outlined"
              component="a"
              href={example.url ?? "https://market.sec.or.th/public/ipos/IPOSEARCH01.aspx"}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewRoundedIcon />}
            >
              เปิด Filing ตัวอย่าง
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
}
