import * as React from "react";
import { Box, Typography } from "@mui/material";
import Link from "next/link";
import { adminColors } from "../components/AdminPrimitives";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        bgcolor: adminColors.appBg,
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 56px)",
      }}
    >
      <Box
        component="main"
        sx={{
          flex: 1,
          maxWidth: 1500,
          mx: "auto",
          width: "100%",
          px: { xs: 2, md: 3.5, xl: 5 },
          py: { xs: 2.5, md: 4 },
        }}
      >
        {children}
      </Box>

      <Box
        component="footer"
        sx={{
          py: 2,
          px: { xs: 2, md: 3.5 },
          textAlign: "center",
          borderTop: `1px solid ${adminColors.border}`,
        }}
      >
        <Typography sx={{ fontSize: 11.5, color: adminColors.muted, fontWeight: 500 }}>
          &copy; {new Date().getFullYear()} IPO Performance Analytics &middot;{" "}
          <Link
            href=""
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: adminColors.blue, textDecoration: "none" }}
          >
            IDE Trade
          </Link>
          {" "}&middot; Admin Dashboard
        </Typography>
      </Box>
    </Box>
  );
}
