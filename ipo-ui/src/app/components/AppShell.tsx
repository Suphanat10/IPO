"use client";

import * as React from "react";
import {
  AppBar,
  Box,
  Container,
  CircularProgress,
  Drawer,
  IconButton,
  LinearProgress,
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
import { preloadDropdownOptions } from "../lib/useDropdownOptions";
import StockHeroBackground from "./StockHeroBackground";
import { preloadUpcomingIpos } from "./UpcomingIpoHero";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/", label: "IPO Analysis" },
  { href: "/explore", label: "Database Explorer" },
];

let homeDataReady = false;
let homeDataInflight: Promise<void> | null = null;

function preloadHomePageData() {
  if (homeDataReady) return Promise.resolve();

  if (!homeDataInflight) {
    homeDataInflight = Promise.allSettled([
      preloadUpcomingIpos(),
      preloadDropdownOptions(),
    ]).then(() => {
      homeDataReady = true;
      homeDataInflight = null;
    });
  }

  return homeDataInflight;
}

function HomeLoadingScreen() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
        bgcolor: "#0a1929",
        color: "#fff",
        backgroundImage: [
          "linear-gradient(135deg, rgba(10,25,41,0.98) 0%, rgba(15,39,68,0.96) 48%, rgba(6,16,28,1) 100%)",
          "repeating-linear-gradient(90deg, rgba(56,189,248,0.08) 0 1px, transparent 1px 42px)",
          "linear-gradient(16deg, transparent 0 42%, rgba(34,197,94,0.16) 42.4%, transparent 43.2% 100%)",
        ].join(","),
      }}
    >
      <Stack
        spacing={2.25}
        sx={{
          width: "min(420px, 100%)",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Box sx={{ position: "relative", width: 76, height: 76 }}>
          <CircularProgress
            size={76}
            thickness={3.4}
            sx={{
              color: "rgba(56,189,248,0.22)",
              position: "absolute",
              inset: 0,
            }}
            variant="determinate"
            value={100}
          />
          <CircularProgress
            size={76}
            thickness={3.4}
            sx={{ color: "#38bdf8", position: "absolute", inset: 0 }}
          />
        </Box>
        <Box>
          <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 900, lineHeight: 1.2 }}>
            กำลังโหลดข้อมูล IPO
          </Typography>
          <Typography sx={{ mt: 0.75, color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 1.6 }}>
            รอข้อมูลวิเคราะห์และตัวเลือกทั้งหมดให้พร้อมก่อนแสดงหน้าเว็บ
          </Typography>
        </Box>
        <LinearProgress
          sx={{
            width: "100%",
            height: 6,
            borderRadius: 999,
            bgcolor: "rgba(255,255,255,0.12)",
            "& .MuiLinearProgress-bar": {
              borderRadius: 999,
              bgcolor: "#38bdf8",
            },
          }}
        />
      </Stack>
    </Box>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const isAdmin = pathname.startsWith("/admin");
  const isHome = pathname === "/";
  const [homeReady, setHomeReady] = React.useState(() => homeDataReady);

  React.useEffect(() => {
    if (!isHome || homeDataReady) return;

    let active = true;
    const fallbackId = window.setTimeout(() => {
      if (!active) return;
      homeDataReady = true;
      setHomeReady(true);
    }, 8000);

    preloadHomePageData().finally(() => {
      window.clearTimeout(fallbackId);
      if (active) setHomeReady(true);
    });

    return () => {
      active = false;
      window.clearTimeout(fallbackId);
    };
  }, [isHome]);

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isHome && !homeDataReady && !homeReady) {
    return <HomeLoadingScreen />;
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f0f2f5" }}>
      {/* ── Navbar ── */}
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backgroundColor: "#0a1929",
          borderBottom: "1px solid rgba(56,189,248,0.15)",
          boxShadow: "0 1px 12px rgba(0,0,0,0.25)",
          zIndex: 1200,
        }}
      >
        <Toolbar sx={{ py: 0.75, minHeight: { xs: 56, md: 64 } }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: { xs: 36, md: 44 },
                height: { xs: 36, md: 44 },
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
                sx={{
                  lineHeight: 1.15,
                  fontSize: { xs: 14, sm: 17 },
                  color: "#fff",
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                }}
              >
                IPO Analytics
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 10, sm: 11 },
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                }}
              >
                Performance Intelligence Platform
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flex: 1 }} />

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
                        px: 2,
                        py: 0.85,
                        borderRadius: 2,
                        fontSize: 13,
                        fontWeight: 700,
                        color: active ? "#fff" : "rgba(255,255,255,0.6)",
                        bgcolor: active ? "rgba(56,189,248,0.15)" : "transparent",
                        border: active ? "1px solid rgba(56,189,248,0.25)" : "1px solid transparent",
                        transition: "all 0.2s",
                        "&:hover": {
                          color: "#fff",
                          bgcolor: "rgba(255,255,255,0.08)",
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
        slotProps={{ paper: { sx: { width: 260, bgcolor: "#0f1d30" } } }}
      >
        <Box sx={{ p: 2, display: "flex", justifyContent: "flex-end" }}>
          <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: "#fff" }}>
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
                      borderRadius: 2,
                      mx: 1,
                      color: active ? "#38bdf8" : "rgba(255,255,255,0.7)",
                      "&.Mui-selected": {
                        bgcolor: "rgba(56,189,248,0.1)",
                      },
                      "& .MuiListItemText-primary": {
                        fontWeight: active ? 700 : 500,
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

      {/* ── Hero Banner (homepage only) ── */}
      {isHome && (
        <StockHeroBackground>
          <Container maxWidth="lg" sx={{ position: "relative", py: { xs: 4, md: 5 }, px: { xs: 2, md: 3 } }}>
            <Stack spacing={1}>
              <Typography
                sx={{
                  fontSize: { xs: 11, md: 12 },
                  fontWeight: 800,
                  letterSpacing: "0.15em",
                  color: "#38bdf8",
                  textTransform: "uppercase",
                }}
              >
                IPO Performance Analytics
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 24, md: 36 },
                  fontWeight: 900,
                  color: "#fff",
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  maxWidth: 700,
                }}
              >
                วิเคราะห์ IPO เชิงลึก
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 13, md: 15 },
                  color: "rgba(255,255,255,0.6)",
                  maxWidth: 600,
                  lineHeight: 1.6,
                }}
              >
                ระบบวิเคราะห์ผลงาน FA, Underwriter และปัจจัยพื้นฐาน จากฐานข้อมูล IPO ย้อนหลัง เพื่อช่วยตัดสินใจลงทุน
              </Typography>

              {/* Quick stats row */}
              <Stack
                direction="row"
                spacing={{ xs: 2, md: 4 }}
                sx={{ mt: { xs: 1.5, md: 2 } }}
              >
                {[
                  { value: "3", label: "หมวดวิเคราะห์" },
                  { value: "FA", label: "ที่ปรึกษาทางการเงิน" },
                  { value: "UW", label: "ผู้จัดจำหน่าย" },
                  { value: "Fund.", label: "ปัจจัยพื้นฐาน" },
                ].map((stat) => (
                  <Box key={stat.label}>
                    <Typography
                      sx={{
                        fontSize: { xs: 18, md: 24 },
                        fontWeight: 900,
                        color: "#38bdf8",
                        lineHeight: 1,
                      }}
                    >
                      {stat.value}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: { xs: 10, md: 11 },
                        color: "rgba(255,255,255,0.45)",
                        fontWeight: 600,
                        mt: 0.25,
                      }}
                    >
                      {stat.label}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>
          </Container>
        </StockHeroBackground>
      )}

      {/* ── Non-home hero (explore, etc.) ── */}
      {!isHome && (
        <StockHeroBackground>
          <Container maxWidth="lg" sx={{ position: "relative", py: { xs: 3, md: 5 }, px: { xs: 2, md: 3 } }}>
            <Stack spacing={1}>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.15em",
                  color: "#38bdf8",
                  textTransform: "uppercase",
                }}
              >
                DATABASE EXPLORER
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 20, md: 30 },
                  fontWeight: 900,
                  color: "#fff",
                  lineHeight: 1.2,
                }}
              >
                สำรวจฐานข้อมูล IPO ย้อนหลัง
              </Typography>
              <Typography
                sx={{
                  fontSize: { xs: 13, md: 15 },
                  color: "rgba(255,255,255,0.6)",
                  maxWidth: 600,
                }}
              >
                ดูสถิติย้อนหลังของ FA / Underwriter รายบุคคล และเปรียบเทียบผลงาน A vs B
              </Typography>
            </Stack>
          </Container>
        </StockHeroBackground>
      )}

      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
        {children}
      </Container>

      {/* Footer */}
      <Box
        sx={{
          py: 3,
          textAlign: "center",
          color: "rgba(255,255,255,0.5)",
          bgcolor: "#0a1929",
          borderTop: "1px solid rgba(56,189,248,0.1)",
          mt: 4,
          px: 2,
        }}
      >
        <Typography sx={{ fontSize: 11 }}>
          &copy; {new Date().getFullYear()} IPO Performance Analytics. All rights reserved. | Developed by{" "}
          <Link
            href=""
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#38bdf8", textDecoration: "none" }}
          >
            IDE Trade
          </Link>
        </Typography>
      </Box>
    </Box>
  );
}
