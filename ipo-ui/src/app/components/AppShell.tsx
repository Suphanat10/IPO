"use client";

import * as React from "react";
import {
  AppBar,
  Box,
  Chip,
  Container,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "IPO Analysis" },
  { href: "/explore", label: "Database Explorer" },
];

const HERO: Record<string, { chip: string; title: string; subtitle: string }> = {
  "/": {
    chip: "IPO ANALYSIS",
    title: "วิเคราะห์ IPO เชิงลึก — FA, Underwriter, ปัจจัยพื้นฐาน",
    subtitle:
      "กรอกข้อมูล IPO ตัวใหม่ (FA / Lead-Co / Fundamental) เพื่อดูสถิติและคะแนนรวมจากฐานข้อมูล IPO ย้อนหลัง",
  },
  "/explore": {
    chip: "DATABASE EXPLORER",
    title: "สำรวจฐานข้อมูล IPO ย้อนหลัง",
    subtitle:
      "ดูสถิติย้อนหลังของ FA / Underwriter รายบุคคล และเปรียบเทียบผลงาน A vs B",
  },
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hero = HERO[pathname] ?? HERO["/"];
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backgroundColor: "#0a1929",
          borderBottom: "1px solid rgba(14, 165, 233, 0.2)",
          boxShadow: "0 2px 8px rgba(10, 25, 41, 0.12)",
        }}
      >
        <Toolbar sx={{ py: 1 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: { xs: 40, md: 56 },
                height: { xs: 40, md: 56 },
                position: "relative",
                flexShrink: 0,
              }}
            >
              <Image
                src="/logo.c3dc7eeab8aedb0021bc.png"
                alt="IPO Logo"
                fill
                style={{
                  objectFit: "contain",
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.45))",
                }}
                priority
              />
            </Box>
            <Box>
              <Typography
                variant="h6"
                sx={{
                  lineHeight: 1,
                  fontSize: { xs: 13, sm: 17 },
                  color: "#fff",
                  fontWeight: 700,
                  letterSpacing: 0.2,
                }}
              >
                IPO Performance Analytics
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontSize: { xs: 10, sm: 12 },
                  color: "rgba(255,255,255,0.72)",
                }}
              >
            
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flex: 1 }} />

          {/* Desktop nav */}
          {!isMobile && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ textDecoration: "none" }}
                  >
                    <Box
                      sx={{
                        px: 1.75,
                        py: 0.75,
                        borderRadius: 1.5,
                        fontSize: 14,
                        fontWeight: 600,
                        color: active ? "#fff" : "rgba(255,255,255,0.72)",
                        bgcolor: active ? "rgba(255,255,255,0.14)" : "transparent",
                        transition: "all 0.15s",
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
          )}

          {/* Mobile hamburger */}
          {isMobile && (
            <IconButton
              edge="end"
              onClick={() => setDrawerOpen(true)}
              aria-label="open menu"
              sx={{ color: "#fff" }}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { sx: { width: 240 } } }}
      >
        <Box sx={{ p: 2, display: "flex", justifyContent: "flex-end" }}>
          <IconButton onClick={() => setDrawerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        <List>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <ListItem key={item.href} disablePadding>
                <Link
                  href={item.href}
                  style={{ textDecoration: "none", width: "100%" }}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemButton
                    selected={active}
                    sx={{
                      borderRadius: 1.5,
                      mx: 1,
                      color: active ? "primary.main" : "text.primary",
                      "&.Mui-selected": {
                        bgcolor: "rgba(10,25,41,0.08)",
                      },
                      "& .MuiListItemText-primary": {
                        fontWeight: active ? 700 : 400,
                      },
                    }}
                  >
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                </Link>
              </ListItem>
            );
          })}
        </List>
      </Drawer>

      {/* Hero */}
      <Box
        sx={{
          position: "relative",
          py: { xs: 4, md: 7 },
          px: { xs: 2, md: 0 },
          background:
            "radial-gradient(1000px 400px at 20% -10%, rgba(56,189,248,0.14), transparent 60%), radial-gradient(900px 380px at 85% -10%, rgba(10,25,41,0.14), transparent 60%)",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={1.5}>
            <Chip
              label={hero.chip}
              size="small"
              sx={{
                alignSelf: "flex-start",
                bgcolor: "rgba(10,25,41,0.08)",
                color: "primary.main",
                fontWeight: 700,
                letterSpacing: "0.1em",
              }}
            />
            <Typography variant="h4" sx={{ fontSize: { xs: 20, md: 32 } }}>
              {hero.title}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ maxWidth: 780, fontSize: { xs: 13, md: 16 } }}
            >
              {hero.subtitle}
            </Typography>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 5 }, px: { xs: 2, md: 3 } }}>
        {children}
      </Container>

      <Box
        sx={{
          py: 4,
          textAlign: "center",
          color: "text.secondary",
          borderTop: "1px solid",
          borderColor: "divider",
          mt: 6,
          px: 2,
        }}
      >
        <Typography variant="caption">
          &copy; {new Date().getFullYear()} IPO Performance Analytics. All rights reserved. | Developed by{" "}
          <Link
            href=""

            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
           IDE Trade 
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}