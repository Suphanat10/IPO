"use client";

import * as React from "react";
import {
  AppBar,
  Box,
  Button,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/ipos", label: "IPO Explorer" },
  { href: "/admin/upcoming", label: "Upcoming" },
  { href: "/admin/validation", label: "Validation" },
  { href: "/admin/builds", label: "Builds" },
  { href: "/admin/audit", label: "Audit" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: "#0a1929",
        borderBottom: "1px solid rgba(14, 165, 233, 0.2)",
      }}
    >
      <Toolbar sx={{ minHeight: 56, gap: 2 }}>
        <Typography
          sx={{ color: "#fff", fontWeight: 700, fontSize: 15, mr: 2 }}
        >
          IPO Admin
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ flex: 1, overflowX: "auto" }}>
          {NAV.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{ textDecoration: "none" }}
              >
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 1.5,
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    color: active ? "#fff" : "rgba(255,255,255,0.7)",
                    bgcolor: active ? "rgba(255,255,255,0.14)" : "transparent",
                    "&:hover": {
                      color: "#fff",
                      bgcolor: "rgba(255,255,255,0.1)",
                    },
                  }}
                >
                  {item.label}
                </Box>
              </Link>
            );
          })}
        </Stack>
        <Button
          size="small"
          variant="outlined"
          onClick={logout}
          sx={{
            color: "#fff",
            borderColor: "rgba(255,255,255,0.3)",
            "&:hover": { borderColor: "#fff" },
          }}
        >
          Logout
        </Button>
      </Toolbar>
    </AppBar>
  );
}
