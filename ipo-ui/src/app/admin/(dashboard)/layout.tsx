import * as React from "react";
import { Box } from "@mui/material";
import { adminColors } from "../components/AdminPrimitives";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ bgcolor: adminColors.appBg }}>
      <Box
        component="main"
        sx={{
          maxWidth: 1500,
          mx: "auto",
          width: "100%",
          px: { xs: 2, md: 3.5, xl: 5 },
          py: { xs: 2.5, md: 4 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
