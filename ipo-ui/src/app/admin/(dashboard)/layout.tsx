import * as React from "react";
import { Box, Typography } from "@mui/material";
import AdminNav from "../components/AdminNav";
import { ADMIN_SIDEBAR_WIDTH, adminColors } from "../components/AdminPrimitives";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: adminColors.appBg }}>
      <AdminNav />
      <Box
        component="main"
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          ml: { lg: `${ADMIN_SIDEBAR_WIDTH}px` },
          pt: { xs: 8, lg: 0 },
        }}
      >
        <Box
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
            py: 2.5,
            px: { xs: 2, md: 3.5 },
            borderTop: `1px solid ${adminColors.border}`,
            textAlign: "center",
          }}
        >
          <Typography variant="caption" sx={{ color: adminColors.muted }}>
            © {new Date().getFullYear()} IPO Analytics Admin — All rights
            reserved.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
