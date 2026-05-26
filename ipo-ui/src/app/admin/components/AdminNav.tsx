"use client";

import * as React from "react";
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import CloudDownloadRoundedIcon from "@mui/icons-material/CloudDownloadRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import KeyboardArrowRightRoundedIcon from "@mui/icons-material/KeyboardArrowRightRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_RADIUS, ADMIN_SIDEBAR_WIDTH, adminColors } from "./AdminPrimitives";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
  requiredPermission?: string;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", description: "System health", icon: DashboardRoundedIcon },
  { href: "/admin/ipos", label: "IPO Explorer", description: "Search and edit records", icon: TableChartRoundedIcon },
  { href: "/admin/upcoming", label: "IPO กำลังจะเข้า", description: "ความพร้อมก่อนเข้าตลาด", icon: EventAvailableRoundedIcon },
  { href: "/admin/upcoming/scrape", label: "Scraper / ดึงข้อมูล IPO", description: "SET + SEC, diff history", icon: CloudDownloadRoundedIcon, requiredPermission: "scraper:trigger" },
  { href: "/admin/validation", label: "ตรวจคุณภาพ / Validation", description: "คิวตรวจคุณภาพข้อมูล / Data quality queue", icon: FactCheckRoundedIcon },
  { href: "/admin/import", label: "Import CSV", description: "Preview and commit", icon: UploadFileRoundedIcon, requiredPermission: "ipos:write" },
  { href: "/admin/builds", label: "สร้างไฟล์ / Builds", description: "สายงานไฟล์ผลลัพธ์ / Artifact pipeline", icon: BuildRoundedIcon },
  { href: "/admin/admins", label: "แอดมิน / Admins", description: "เพิ่ม ลบ แก้ไขผู้ดูแลระบบ / Manage admins", icon: ManageAccountsRoundedIcon, requiredPermission: "admins:manage" },
  { href: "/admin/audit", label: "ตรวจย้อนหลัง / Audit", description: "", icon: HistoryRoundedIcon },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"],
  admin: [
    "ipos:read", "ipos:write", "ipos:delete",
    "validation:read", "validation:write",
    "builds:read", "builds:trigger",
    "scraper:trigger",
  ],
  scraper: ["ipos:read", "scraper:trigger"],
  readonly: ["ipos:read", "validation:read", "builds:read"],
};

function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes("*") || perms.includes(permission);
}

function filterNavByRole(items: NavItem[], role: string): NavItem[] {
  return items.filter(
    (item) => !item.requiredPermission || hasPermission(role, item.requiredPermission),
  );
}

function getNavGroups(role: string) {
  const filtered = filterNavByRole(NAV, role);
  const overviewHrefs = new Set(["/admin", "/admin/ipos", "/admin/upcoming", "/admin/upcoming/scrape"]);
  return [
    { label: "Overview", items: filtered.filter((i) => overviewHrefs.has(i.href)) },
    { label: "Operations", items: filtered.filter((i) => !overviewHrefs.has(i.href)) },
  ].filter((g) => g.items.length > 0);
}

type CurrentAdmin = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  // Exact match or a deeper segment, but never let a shorter href win over a longer one.
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // If a longer NAV entry also matches, defer to it.
  return !NAV.some(
    (entry) => entry.href !== href && entry.href.startsWith(`${href}/`) && pathname.startsWith(entry.href),
  );
}

function adminDisplayName(admin: CurrentAdmin | null) {
  if (!admin) return "Admin";
  const name = [admin.firstName, admin.lastName].filter(Boolean).join(" ").trim();
  return name || admin.email;
}

function BrandMark() {
  return (
    <Stack direction="row" spacing={1.1} sx={{ alignItems: "center", minWidth: 0, px: 0.25 }}>
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: `${ADMIN_RADIUS + 2}px`,
          display: "grid",
          placeItems: "center",
          bgcolor: "rgba(14, 165, 233, 0.16)",
          border: "1px solid rgba(56, 189, 248, 0.24)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 14px 28px rgba(0, 0, 0, 0.22)",
        }}
      >
        <Box
          component="img"
          src="/logo.c3dc7eeab8aedb0021bc.png"
          alt="IPO logo"
          sx={{
            width: 29,
            height: 23,
            display: "block",
            objectFit: "contain",
            opacity: 0.92,
          }}
        />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: "#f8fafc", fontWeight: 900, fontSize: 15, lineHeight: 1.1, letterSpacing: 0 }}>
          Admin Console
        </Typography>
        <Typography sx={{ color: "rgba(226, 232, 240, 0.68)", fontSize: 12, lineHeight: 1.3, mt: 0.25, letterSpacing: 0 }}>
          Data operations
        </Typography>
      </Box>
    </Stack>
  );
}

function NavLinkItem({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV)[number];
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Tooltip title={item.description ? `${item.label} - ${item.description}` : item.label} placement="right" arrow>
      <Link href={item.href} onClick={onClick} style={{ textDecoration: "none" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "34px minmax(0, 1fr) 18px",
            columnGap: 1.05,
            alignItems: "center",
            minHeight: 50,
            px: 1.05,
            py: 0.65,
            borderRadius: `${ADMIN_RADIUS + 2}px`,
            color: active ? "#ffffff" : "rgba(226, 232, 240, 0.78)",
            bgcolor: active ? "rgba(14, 165, 233, 0.17)" : "transparent",
            border: "1px solid transparent",
            position: "relative",
            transition: "background-color 140ms ease, color 140ms ease, border-color 140ms ease",
            "&::before": {
              content: '""',
              position: "absolute",
              left: 0,
              top: 9,
              bottom: 9,
              width: 3,
              borderRadius: 99,
              bgcolor: active ? adminColors.cyan : "transparent",
            },
            "&:hover": {
              color: "#ffffff",
              bgcolor: active ? "rgba(14, 165, 233, 0.2)" : "rgba(148, 163, 184, 0.1)",
              borderColor: "rgba(148, 163, 184, 0.16)",
            },
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: `${ADMIN_RADIUS}px`,
              display: "grid",
              placeItems: "center",
              bgcolor: active ? "rgba(56, 189, 248, 0.2)" : "rgba(148, 163, 184, 0.14)",
              color: active ? adminColors.cyan : "rgba(226, 232, 240, 0.78)",
              flexShrink: 0,
            }}
          >
            <Icon fontSize="small" />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 900,
                lineHeight: 1.22,
                letterSpacing: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Typography>
            {item.description ? (
              <Typography
                sx={{
                  color: active ? "rgba(224, 242, 254, 0.78)" : "rgba(203, 213, 225, 0.56)",
                  fontSize: 11,
                  lineHeight: 1.25,
                  letterSpacing: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.description}
              </Typography>
            ) : null}
          </Box>
          <KeyboardArrowRightRoundedIcon
            fontSize="small"
            sx={{
              opacity: active ? 1 : 0,
              color: "#e0f2fe",
              justifySelf: "center",
              flexShrink: 0,
            }}
          />
        </Box>
      </Link>
    </Tooltip>
  );
}

function NavContent({
  pathname,
  admin,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  admin: CurrentAdmin | null;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <Stack sx={{ height: "100%", p: 2 }}>
      <BrandMark />

      <Link href="/admin/profile" onClick={onNavigate} style={{ textDecoration: "none" }}>
        <Box
          sx={{
            mt: 2,
            p: 1,
            borderRadius: `${ADMIN_RADIUS + 2}px`,
            bgcolor: pathname === "/admin/profile" ? "rgba(14, 165, 233, 0.17)" : "rgba(15, 23, 42, 0.58)",
            border: `1px solid ${pathname === "/admin/profile" ? "rgba(56, 189, 248, 0.35)" : "rgba(56, 189, 248, 0.18)"}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            cursor: "pointer",
            transition: "background-color 140ms ease, border-color 140ms ease",
            "&:hover": {
              bgcolor: "rgba(14, 165, 233, 0.14)",
              borderColor: "rgba(56, 189, 248, 0.3)",
            },
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: `${ADMIN_RADIUS}px`,
                display: "grid",
                placeItems: "center",
                bgcolor: "rgba(56, 189, 248, 0.16)",
                color: adminColors.cyan,
                flexShrink: 0,
              }}
            >
              <AccountCircleRoundedIcon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ color: "#f8fafc", fontSize: 13, fontWeight: 900, lineHeight: 1.2, letterSpacing: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {adminDisplayName(admin)}
              </Typography>
              <Typography sx={{ color: "rgba(226, 232, 240, 0.58)", fontSize: 11, lineHeight: 1.25, letterSpacing: 0, mt: 0.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {admin?.email ?? "ผู้ดูแลระบบ"}
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Link>

      <Stack
        spacing={2}
        sx={{
          flex: 1,
          mt: 2.25,
          minHeight: 0,
          overflowY: "auto",
          pr: 0.25,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(148, 163, 184, 0.32) transparent",
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": {
            bgcolor: "rgba(148, 163, 184, 0.26)",
            borderRadius: 99,
          },
        }}
      >
        {getNavGroups(admin?.role ?? "readonly").map((group) => (
          <Stack key={group.label} spacing={0.55}>
            <Typography
              sx={{
                color: "rgba(148, 163, 184, 0.72)",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 0,
                px: 1,
                textTransform: "uppercase",
              }}
            >
              {group.label}
            </Typography>
            <Stack spacing={0.25}>
              {group.items.map((item) => (
                <NavLinkItem
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  onClick={onNavigate}
                />
              ))}
            </Stack>
          </Stack>
        ))}
      </Stack>

      <Box
        component="button"
        type="button"
        onClick={onLogout}
        sx={{
          mt: 2,
          width: "100%",
          display: "grid",
          gridTemplateColumns: "34px minmax(0, 1fr)",
          columnGap: 1,
          alignItems: "center",
          borderRadius: `${ADMIN_RADIUS}px`,
          color: "#f8fafc",
          bgcolor: "rgba(15, 23, 42, 0.62)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          px: 0.85,
          py: 0.85,
          fontWeight: 850,
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
          transition: "background-color 140ms ease, border-color 140ms ease, color 140ms ease",
          "&:hover": {
            bgcolor: "rgba(244, 63, 94, 0.12)",
            borderColor: "rgba(244, 63, 94, 0.35)",
          },
        }}
      >
        <Box
          sx={{
            width: 30,
            height: 30,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(148, 163, 184, 0.14)",
            color: "rgba(226, 232, 240, 0.88)",
          }}
        >
          <LogoutRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Typography sx={{ fontSize: 13, fontWeight: 900, lineHeight: 1.2, letterSpacing: 0 }}>
          Logout
        </Typography>
      </Box>
    </Stack>
  );
}

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [admin, setAdmin] = React.useState<CurrentAdmin | null>(null);

  React.useEffect(() => {
    let alive = true;

    async function loadAdmin() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json() as CurrentAdmin;
        if (alive) setAdmin(data);
      } catch {
        // Keep the sidebar usable even if session metadata cannot be loaded.
      }
    }

    void loadAdmin();
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <>
      <Box
        component="aside"
        sx={{
          display: { xs: "none", lg: "block" },
          position: "fixed",
          inset: "0 auto 0 0",
          width: ADMIN_SIDEBAR_WIDTH,
          bgcolor: "#071522",
          color: "#fff",
          borderRight: "1px solid rgba(14, 165, 233, 0.14)",
          boxShadow: "12px 0 34px rgba(15, 23, 42, 0.08)",
          zIndex: (theme) => theme.zIndex.drawer,
        }}
      >
        <NavContent pathname={pathname} admin={admin} onLogout={logout} />
      </Box>

      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { xs: "block", lg: "none" },
          bgcolor: "#071522",
          borderBottom: "1px solid rgba(14, 165, 233, 0.14)",
        }}
      >
        <Toolbar sx={{ minHeight: 64 }}>
          <BrandMark />
          <Box sx={{ flex: 1 }} />
          <IconButton
            onClick={() => setMobileOpen(true)}
            aria-label="Open admin navigation"
            sx={{ color: "#fff" }}
          >
            <MenuRoundedIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: Math.min(ADMIN_SIDEBAR_WIDTH, 320),
              bgcolor: "#071522",
              color: "#fff",
            },
          },
        }}
      >
        <Stack direction="row" sx={{ justifyContent: "flex-end", p: 1 }}>
          <IconButton
            onClick={() => setMobileOpen(false)}
            aria-label="Close admin navigation"
            sx={{ color: "#fff" }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <NavContent
          pathname={pathname}
          admin={admin}
          onNavigate={() => setMobileOpen(false)}
          onLogout={logout}
        />
      </Drawer>
    </>
  );
}
