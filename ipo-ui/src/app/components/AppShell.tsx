"use client";

import * as React from "react";
import {
  AppBar,
  Box,
  Container,
  Drawer,
  Fade,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Popper,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
  ClickAwayListener,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import HandymanRoundedIcon from "@mui/icons-material/HandymanRounded";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { preloadDropdownOptions } from "../lib/useDropdownOptions";
import { preloadUpcomingIpos } from "./UpcomingIpoHero";

/* ── Navigation data ── */

type NavItem = {
  href: string;
  label: string;
  icon?: React.ElementType;
  desc?: string;
};

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "IPO Analysis" },
  { href: "/explore", label: "Database Explorer" },
];

const TOOLS_NAV: NavItem[] = [
  { href: "/ipo/dashboard", label: "Dashboard", icon: DashboardRoundedIcon, desc: "ภาพรวมระบบ" },
  { href: "/ipo/ipos", label: "IPO Explorer", icon: TableChartRoundedIcon, desc: "ค้นหาและแก้ไขข้อมูล" },
  { href: "/ipo/upcoming", label: "IPO กำลังจะเข้า", icon: EventAvailableRoundedIcon, desc: "ความพร้อมก่อนเข้าตลาด" },
  { href: "/ipo/upcoming/scrape", label: "Scraper", icon: CloudDownloadRoundedIcon, desc: "ดึงข้อมูลจาก SET / SEC" },
  { href: "/ipo/validation", label: "Validation", icon: FactCheckRoundedIcon, desc: "ตรวจคุณภาพข้อมูล" },
  { href: "/ipo/import", label: "Import CSV", icon: UploadFileRoundedIcon, desc: "นำเข้าไฟล์ CSV" },
  { href: "/ipo/builds", label: "Builds", icon: BuildRoundedIcon, desc: "สร้างไฟล์ผลลัพธ์" },
];

const ALL_NAV = [...MAIN_NAV, ...TOOLS_NAV];

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/" || href === "/ipo/dashboard") return pathname === href;
  if (!pathname.startsWith(href)) return false;
  return !ALL_NAV.some(
    (other) =>
      other.href !== href &&
      other.href.startsWith(href + "/") &&
      pathname.startsWith(other.href),
  );
}

/* ── Preload ── */

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

/* ── Loading screen ── */

function HomeLoadingScreen() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "#0a1929",
        color: "#fff",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: "-40%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)",
          pointerEvents: "none",
        },
      }}
    >
      <Stack spacing={4} sx={{ alignItems: "center", zIndex: 1 }}>
        {/* Logo + spinner */}
        <Box sx={{ position: "relative", width: 80, height: 80 }}>
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid rgba(56,189,248,0.08)",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid transparent",
              borderTopColor: "#38bdf8",
              animation: "spin 1.2s linear infinite",
              "@keyframes spin": {
                "0%": { transform: "rotate(0deg)" },
                "100%": { transform: "rotate(360deg)" },
              },
            }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Image
              src="/logo.c3dc7eeab8aedb0021bc.png"
              alt="IPO Logo"
              width={36}
              height={36}
              style={{ objectFit: "contain" }}
              priority
            />
          </Box>
        </Box>

        {/* Text */}
        <Stack spacing={0.75} sx={{ alignItems: "center", textAlign: "center" }}>
          <Typography
            sx={{
              fontSize: { xs: 16, md: 18 },
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            IPO Analytics
          </Typography>
          <Typography
            sx={{
              fontSize: 13,
              color: "rgba(255,255,255,0.35)",
              fontWeight: 500,
            }}
          >
            กำลังเตรียมข้อมูลวิเคราะห์
          </Typography>
        </Stack>

        {/* Dots loader */}
        <Stack direction="row" spacing={1}>
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: "#38bdf8",
                opacity: 0.3,
                animation: "pulse 1.4s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
                "@keyframes pulse": {
                  "0%, 80%, 100%": { opacity: 0.3, transform: "scale(1)" },
                  "40%": { opacity: 1, transform: "scale(1.3)" },
                },
              }}
            />
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

/* ── Nav link pill (desktop) ── */

function NavPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} style={{ display: "block", textDecoration: "none" }}>
      <Box
        sx={{
          px: 2,
          py: 0.75,
          borderRadius: "10px",
          fontSize: 13.5,
          fontWeight: 600,
          whiteSpace: "nowrap",
          color: active ? "#fff" : "rgba(255,255,255,0.55)",
          bgcolor: active ? "rgba(255,255,255,0.1)" : "transparent",
          transition: "all 0.15s ease",
          "&:hover": {
            color: "#fff",
            bgcolor: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
          },
        }}
      >
        {label}
      </Box>
    </Link>
  );
}

/* ── Tools dropdown (desktop) ── */

function ToolsDropdown({ pathname }: { pathname: string }) {
  const [open, setOpen] = React.useState(false);
  const [anchorEl, setAnchorEl] = React.useState<HTMLButtonElement | null>(null);
  const isToolsActive = pathname.startsWith("/ipo");

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: "relative" }}>
        <Box
          component="button"
          ref={setAnchorEl}
          onClick={() => setOpen((p) => !p)}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            px: 2,
            py: 0.75,
            borderRadius: "10px",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
            font: "inherit",
            border: "none",
            color: isToolsActive ? "#fff" : "rgba(255,255,255,0.55)",
            bgcolor: isToolsActive || open ? "rgba(255,255,255,0.1)" : "transparent",
            transition: "all 0.15s ease",
            "&:hover": {
              color: "#fff",
              bgcolor: "rgba(255,255,255,0.1)",
            },
          }}
        >
          <HandymanRoundedIcon sx={{ fontSize: 15, opacity: 0.8 }} />
          Tools
          <KeyboardArrowDownRoundedIcon
            sx={{
              fontSize: 16,
              ml: -0.25,
              transition: "transform 0.2s",
              transform: open ? "rotate(180deg)" : "none",
              opacity: 0.7,
            }}
          />
        </Box>

        <Popper
          open={open}
          anchorEl={anchorEl}
          placement="bottom-end"
          transition
          sx={{ zIndex: 1300 }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={120}>
              <Paper
                elevation={0}
                sx={{
                  mt: 1.5,
                  width: 280,
                  bgcolor: "#0f1d2f",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "14px",
                  overflow: "hidden",
                  py: 0.5,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
                }}
              >
                {TOOLS_NAV.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  const Icon = item.icon!;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      style={{ display: "block", textDecoration: "none" }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.25,
                          px: 1.5,
                          py: 1,
                          mx: 0.5,
                          borderRadius: "10px",
                          color: active ? "#fff" : "rgba(255,255,255,0.65)",
                          bgcolor: active ? "rgba(56,189,248,0.12)" : "transparent",
                          transition: "all 0.12s ease",
                          "&:hover": {
                            bgcolor: active ? "rgba(56,189,248,0.16)" : "rgba(255,255,255,0.05)",
                            color: "#fff",
                          },
                        }}
                      >
                        <Box
                          sx={{
                            width: 30,
                            height: 30,
                            borderRadius: "8px",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: active ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.06)",
                            color: active ? "#38bdf8" : "rgba(255,255,255,0.5)",
                            flexShrink: 0,
                          }}
                        >
                          <Icon sx={{ fontSize: 16 }} />
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                            {item.label}
                          </Typography>
                          {item.desc && (
                            <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.3, mt: 0.1 }}>
                              {item.desc}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Link>
                  );
                })}
              </Paper>
            </Fade>
          )}
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

/* ── Main component ── */

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const isHome = pathname === "/";
  const isAdmin = pathname.startsWith("/ipo");
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
          bgcolor: "rgba(10,25,41,0.92)",
          backdropFilter: "blur(20px) saturate(1.4)",
          WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          zIndex: 1200,
        }}
      >
        <Toolbar
          sx={{
            py: 0.5,
            minHeight: { xs: 52, md: 56 },
            maxWidth: 1400,
            width: "100%",
            mx: "auto",
            px: { xs: 2, md: 3 },
          }}
        >
          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none" }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  width: { xs: 28, md: 32 },
                  height: { xs: 28, md: 32 },
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <Image
                  src="/logo.c3dc7eeab8aedb0021bc.png"
                  alt="IPO Logo"
                  fill
                  style={{ objectFit: "contain" }}
                  priority
                />
              </Box>
              <Typography
                sx={{
                  display: { xs: "none", sm: "block" },
                  fontSize: 15,
                  color: "#fff",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                }}
              >
                IPO Analytics
              </Typography>
            </Stack>
          </Link>

          <Box sx={{ flex: 1 }} />

          {/* Desktop nav */}
          {!isMobile && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              {MAIN_NAV.map((item) => (
                <NavPill
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isNavActive(pathname, item.href)}
                />
              ))}

              <Box sx={{ width: "1px", height: 18, bgcolor: "rgba(255,255,255,0.1)", mx: 0.5 }} />

              <ToolsDropdown pathname={pathname} />
            </Stack>
          )}

          {/* Mobile hamburger */}
          {isMobile && (
            <IconButton
              edge="end"
              onClick={() => setDrawerOpen(true)}
              aria-label="open menu"
              sx={{ color: "rgba(255,255,255,0.8)", p: 1 }}
            >
              <MenuIcon sx={{ fontSize: 22 }} />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* ── Mobile Drawer ── */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: 300,
              bgcolor: "#0b1929",
              borderLeft: "1px solid rgba(255,255,255,0.06)",
            },
          },
        }}
      >
        {/* Drawer header */}
        <Box
          sx={{
            px: 2.5,
            pt: 2,
            pb: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ width: 24, height: 24, position: "relative", flexShrink: 0 }}>
              <Image
                src="/logo.c3dc7eeab8aedb0021bc.png"
                alt="IPO Logo"
                fill
                style={{ objectFit: "contain" }}
              />
            </Box>
            <Typography sx={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
              IPO Analytics
            </Typography>
          </Stack>
          <IconButton
            onClick={() => setDrawerOpen(false)}
            sx={{ color: "rgba(255,255,255,0.4)", p: 0.5 }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        <Box sx={{ px: 2, pt: 1 }}>
          <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)" }} />
        </Box>

        {/* Analysis section */}
        <Box sx={{ px: 2.5, pt: 2 }}>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              mb: 0.75,
            }}
          >
            Analysis
          </Typography>
        </Box>
        <List dense disablePadding sx={{ px: 1 }}>
          {MAIN_NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <ListItem key={item.href} disablePadding>
                <Link
                  href={item.href}
                  style={{ display: "block", textDecoration: "none", width: "100%" }}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemButton
                    selected={active}
                    sx={{
                      borderRadius: "10px",
                      color: active ? "#fff" : "rgba(255,255,255,0.6)",
                      bgcolor: active ? "rgba(56,189,248,0.1)" : "transparent",
                      "&.Mui-selected": { bgcolor: "rgba(56,189,248,0.1)" },
                      "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                      py: 1,
                      px: 1.5,
                    }}
                  >
                    <ListItemText
                      primary={item.label}
                      slotProps={{
                        primary: {
                          sx: { fontWeight: active ? 600 : 500, fontSize: 14 },
                        },
                      }}
                    />
                  </ListItemButton>
                </Link>
              </ListItem>
            );
          })}
        </List>

        {/* Tools section */}
        <Box sx={{ px: 2.5, pt: 2.5 }}>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              mb: 0.75,
            }}
          >
            Tools
          </Typography>
        </Box>
        <List dense disablePadding sx={{ px: 1, pb: 2 }}>
          {TOOLS_NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon!;
            return (
              <ListItem key={item.href} disablePadding>
                <Link
                  href={item.href}
                  style={{ display: "block", textDecoration: "none", width: "100%" }}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemButton
                    selected={active}
                    sx={{
                      borderRadius: "10px",
                      color: active ? "#fff" : "rgba(255,255,255,0.6)",
                      bgcolor: active ? "rgba(56,189,248,0.1)" : "transparent",
                      "&.Mui-selected": { bgcolor: "rgba(56,189,248,0.1)" },
                      "&:hover": { bgcolor: "rgba(255,255,255,0.04)" },
                      py: 0.75,
                      px: 1.5,
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 32,
                        color: active ? "#38bdf8" : "rgba(255,255,255,0.35)",
                      }}
                    >
                      <Icon sx={{ fontSize: 17 }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      secondary={item.desc}
                      slotProps={{
                        primary: {
                          sx: { fontWeight: active ? 600 : 500, fontSize: 13.5 },
                        },
                        secondary: {
                          sx: {
                            fontSize: 11,
                            color: "rgba(255,255,255,0.25)",
                            lineHeight: 1.2,
                            mt: 0.1,
                          },
                        },
                      }}
                    />
                  </ListItemButton>
                </Link>
              </ListItem>
            );
          })}
        </List>
      </Drawer>

      {/* ── Content ── */}
      {isAdmin ? (
        <>{children}</>
      ) : (
        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
          {children}
        </Container>
      )}

      {/* ── Footer ── */}
      {!isAdmin && (
        <Box
          sx={{
            py: 2.5,
            textAlign: "center",
            color: "rgba(255,255,255,0.35)",
            bgcolor: "#0a1929",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            mt: 4,
          }}
        >
          <Typography sx={{ fontSize: 11, fontWeight: 500 }}>
            &copy; {new Date().getFullYear()} IPO Performance Analytics &middot;{" "}
            <Link
              href=""
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "rgba(56,189,248,0.7)", textDecoration: "none" }}
            >
              IDE Trade
            </Link>
          </Typography>
        </Box>
      )}
    </Box>
  );
}
