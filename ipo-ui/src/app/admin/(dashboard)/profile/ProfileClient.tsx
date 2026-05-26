"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import BadgeRoundedIcon from "@mui/icons-material/BadgeRounded";
import CalendarTodayRoundedIcon from "@mui/icons-material/CalendarTodayRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import FingerprintRoundedIcon from "@mui/icons-material/FingerprintRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import {
  ADMIN_RADIUS,
  adminColors,
  adminPanelSx,
} from "../../components/AdminPrimitives";

type ProfileData = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function fmtDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function fmtRelative(value: string | null) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "เมื่อสักครู่ / just now";
  if (mins < 60) return `${mins} นาทีที่แล้ว / ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว / ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว / ${days}d ago`;
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        px: 2.5,
        py: 2,
        borderBottom: `1px solid ${adminColors.borderSoft}`,
        bgcolor: adminColors.panelAlt,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: `${ADMIN_RADIUS}px`,
            display: "grid",
            placeItems: "center",
            bgcolor: "#dbeafe",
            color: adminColors.blue,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: adminColors.text, fontSize: 14, fontWeight: 850 }}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography sx={{ color: adminColors.muted, fontSize: 11.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Stack>
  );
}

function InfoField({
  icon,
  label,
  value,
  mono,
  copyable,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{
        alignItems: "center",
        p: 1.75,
        borderRadius: `${ADMIN_RADIUS}px`,
        border: `1px solid ${adminColors.borderSoft}`,
        bgcolor: "#ffffff",
        transition: "border-color 0.15s ease",
        "&:hover": { borderColor: "rgba(10,25,41,0.16)" },
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: `${ADMIN_RADIUS}px`,
          display: "grid",
          placeItems: "center",
          bgcolor: "#eef4fb",
          color: adminColors.accent,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ color: adminColors.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.02em" }}>
          {label}
        </Typography>
        <Typography
          sx={{
            color: adminColors.text,
            fontSize: 13.5,
            fontWeight: 800,
            mt: 0.2,
            fontFamily: mono ? "monospace" : "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </Typography>
      </Box>
      {copyable ? (
        <Tooltip title={copied ? "คัดลอกแล้ว / Copied!" : "คัดลอก / Copy"}>
          <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? "#059669" : adminColors.muted }}>
            {copied ? <CheckCircleRoundedIcon fontSize="small" /> : <ContentCopyRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      ) : null}
    </Stack>
  );
}

export default function ProfileClient({
  currentUserId,
}: {
  currentUserId: string | null;
}) {
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");

  const [changingPassword, setChangingPassword] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showCurrentPw, setShowCurrentPw] = React.useState(false);
  const [showNewPw, setShowNewPw] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/admin/profile", { cache: "no-store" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to load profile" }));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (alive) {
          setProfile(data.user);
          setFirstName(data.user.first_name ?? "");
          setLastName(data.user.last_name ?? "");
          setEmail(data.user.email ?? "");
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, []);

  function startEditing() {
    setEditing(true);
    setSuccess(null);
    setError(null);
    setFirstName(profile?.first_name ?? "");
    setLastName(profile?.last_name ?? "");
    setEmail(profile?.email ?? "");
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
  }

  async function handleSaveProfile() {
    setError(null);
    setSuccess(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน / All fields are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setProfile(data.user);
      setEditing(false);
      setSuccess("บันทึกโปรไฟล์เรียบร้อย / Profile updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("กรุณากรอกรหัสผ่านปัจจุบัน / Current password is required.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร / New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("รหัสผ่านใหม่ไม่ตรงกัน / Passwords do not match.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: profile?.first_name ?? "",
          last_name: profile?.last_name ?? "",
          email: profile?.email ?? "",
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      setProfile(data.user);
      setChangingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("เปลี่ยนรหัสผ่านเรียบร้อย / Password changed successfully.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) {
    return (
      <Stack spacing={2.5}>
        <Paper sx={{ ...adminPanelSx, overflow: "hidden" }}>
          <Skeleton variant="rectangular" height={120} />
          <Stack sx={{ p: 3, mt: -3 }} spacing={2}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end" }}>
              <Skeleton variant="circular" width={96} height={96} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="rounded" width="50%" height={28} />
                <Skeleton variant="rounded" width="35%" height={16} sx={{ mt: 1 }} />
              </Box>
            </Stack>
          </Stack>
        </Paper>
        <Paper sx={{ ...adminPanelSx, p: 3 }}>
          <Stack spacing={2}>
            <Skeleton variant="rounded" width="100%" height={64} />
            <Skeleton variant="rounded" width="100%" height={64} />
          </Stack>
        </Paper>
      </Stack>
    );
  }

  if (!profile) {
    return (
      <Alert severity="error" sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
        {error ?? "ไม่สามารถโหลดโปรไฟล์ได้ / Could not load profile."}
      </Alert>
    );
  }

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;
  const initials = [profile.first_name?.[0], profile.last_name?.[0]].filter(Boolean).join("").toUpperCase() || profile.email?.[0]?.toUpperCase() || "?";

  return (
    <Stack spacing={2.5}>
      {success ? (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
          {success}
        </Alert>
      ) : null}

      {/* ── Profile Header ── */}
      <Paper sx={{ ...adminPanelSx, overflow: "hidden" }}>
        <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2.5}
            sx={{ alignItems: { xs: "center", sm: "center" } }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: `${ADMIN_RADIUS + 4}px`,
                background: "linear-gradient(135deg, #0a1929 0%, #0284c7 100%)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                boxShadow: "0 2px 10px rgba(2,132,199,0.2)",
              }}
            >
              <Typography sx={{ color: "#ffffff", fontSize: 28, fontWeight: 900, letterSpacing: "0.04em" }}>
                {initials}
              </Typography>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0, textAlign: { xs: "center", sm: "left" } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: { xs: "center", sm: "flex-start" }, flexWrap: "wrap", gap: 0.75 }}>
                <Typography sx={{ color: adminColors.text, fontSize: { xs: 20, sm: 24 }, fontWeight: 900 }}>
                  {displayName}
                </Typography>
                <Chip
                  size="small"
                  icon={<ShieldRoundedIcon sx={{ fontSize: "14px !important" }} />}
                  label="Admin"
                  sx={{
                    bgcolor: "#dcfce7",
                    color: "#047857",
                    fontWeight: 800,
                    fontSize: 11.5,
                    height: 24,
                    border: "1px solid #bbf7d0",
                  }}
                />
              </Stack>
              <Typography sx={{ color: adminColors.muted, fontSize: 13, mt: 0.5 }}>
                {profile.email}
              </Typography>
            </Box>

            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                flexShrink: 0,
                alignItems: "center",
              }}
            >
              {profile.updated_at ? (
                <Typography sx={{ color: adminColors.muted, fontSize: 11.5, textAlign: "right" }}>
                  อัปเดตล่าสุด
                  <br />
                  {fmtRelative(profile.updated_at)}
                </Typography>
              ) : null}
            </Stack>
          </Stack>
        </Box>
      </Paper>

      <Grid container spacing={2.5}>
        {/* ── Personal Information ── */}
        <Grid size={{ xs: 12, lg: 7 }}>
          <Paper sx={{ ...adminPanelSx, overflow: "hidden", height: "100%" }}>
            <SectionHeader
              icon={<BadgeRoundedIcon fontSize="small" />}
              title="ข้อมูลส่วนตัว / Personal information"
              subtitle="ชื่อ อีเมล และข้อมูลพื้นฐาน"
              action={
                !editing ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditRoundedIcon />}
                    onClick={startEditing}
                    sx={{ borderRadius: `${ADMIN_RADIUS}px`, fontWeight: 800, fontSize: 12 }}
                  >
                    แก้ไข / Edit
                  </Button>
                ) : null
              }
            />

            <Box sx={{ p: 2.5 }}>
              {!editing ? (
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <InfoField
                      icon={<BadgeRoundedIcon fontSize="small" />}
                      label="ชื่อ / First name"
                      value={profile.first_name || "-"}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <InfoField
                      icon={<BadgeRoundedIcon fontSize="small" />}
                      label="นามสกุล / Last name"
                      value={profile.last_name || "-"}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <InfoField
                      icon={<EmailRoundedIcon fontSize="small" />}
                      label="อีเมล / Email"
                      value={profile.email || "-"}
                      copyable
                    />
                  </Grid>
                </Grid>
              ) : (
                <Stack spacing={2}>
                  {error ? (
                    <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
                      {error}
                    </Alert>
                  ) : null}

                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="ชื่อ / First name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        fullWidth
                        required
                        disabled={saving}
                        size="small"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="นามสกุล / Last name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        fullWidth
                        required
                        disabled={saving}
                        size="small"
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="อีเมล / Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        fullWidth
                        required
                        type="email"
                        disabled={saving}
                        size="small"
                      />
                    </Grid>
                  </Grid>

                  <Divider />

                  <Stack direction="row" spacing={1.5} sx={{ justifyContent: "flex-end" }}>
                    <Button
                      variant="outlined"
                      onClick={cancelEditing}
                      disabled={saving}
                      sx={{ borderRadius: `${ADMIN_RADIUS}px`, fontWeight: 800 }}
                    >
                      ยกเลิก / Cancel
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />}
                      onClick={handleSaveProfile}
                      disabled={saving}
                      sx={{ borderRadius: `${ADMIN_RADIUS}px`, fontWeight: 800 }}
                    >
                      {saving ? "กำลังบันทึก..." : "บันทึก / Save"}
                    </Button>
                  </Stack>
                </Stack>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* ── Account Details ── */}
        <Grid size={{ xs: 12, lg: 5 }}>
          <Paper sx={{ ...adminPanelSx, overflow: "hidden", height: "100%" }}>
            <SectionHeader
              icon={<FingerprintRoundedIcon fontSize="small" />}
              title="ข้อมูลบัญชี / Account details"
              subtitle="รหัสผู้ใช้และวันที่สร้างบัญชี"
            />

            <Stack spacing={1.5} sx={{ p: 2.5 }}>
              <InfoField
                icon={<FingerprintRoundedIcon fontSize="small" />}
                label="User ID"
                value={profile.user_id}
                mono
                copyable
              />
              <InfoField
                icon={<CalendarTodayRoundedIcon fontSize="small" />}
                label="สร้างเมื่อ / Created"
                value={fmtDateTime(profile.created_at)}
              />
              <InfoField
                icon={<CalendarTodayRoundedIcon fontSize="small" />}
                label="อัปเดตล่าสุด / Last updated"
                value={fmtDateTime(profile.updated_at)}
              />

              <Box
                sx={{
                  mt: 0.5,
                  p: 1.5,
                  borderRadius: `${ADMIN_RADIUS}px`,
                  bgcolor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <AdminPanelSettingsRoundedIcon sx={{ fontSize: 18, color: "#059669" }} />
                  <Box>
                    <Typography sx={{ color: "#047857", fontSize: 12, fontWeight: 800 }}>
                      บัญชีแอดมินที่ใช้งานอยู่ / Active admin account
                    </Typography>
                    <Typography sx={{ color: "#059669", fontSize: 11, opacity: 0.8 }}>
                      สิทธิ์เข้าถึงแดชบอร์ดเต็มรูปแบบ / Full dashboard access
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* ── Security ── */}
        <Grid size={{ xs: 12 }}>
          <Paper sx={{ ...adminPanelSx, overflow: "hidden" }}>
            <SectionHeader
              icon={<SecurityRoundedIcon fontSize="small" />}
              title="ความปลอดภัย / Security"
              subtitle="จัดการรหัสผ่านและการตั้งค่าความปลอดภัย"
            />

            <Box sx={{ p: 2.5 }}>
              {passwordSuccess ? (
                <Alert
                  severity="success"
                  onClose={() => setPasswordSuccess(null)}
                  sx={{ borderRadius: `${ADMIN_RADIUS}px`, mb: 2 }}
                >
                  {passwordSuccess}
                </Alert>
              ) : null}

              <Grid container spacing={2.5}>
                <Grid size={{ xs: 12, md: 5 }}>
                  <Stack spacing={1.5}>
                    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                      <LockRoundedIcon fontSize="small" sx={{ color: adminColors.accent }} />
                      <Typography sx={{ color: adminColors.text, fontSize: 14, fontWeight: 850 }}>
                        เปลี่ยนรหัสผ่าน / Change password
                      </Typography>
                    </Stack>
                    <Typography sx={{ color: adminColors.muted, fontSize: 12.5, lineHeight: 1.65 }}>
                      เพื่อความปลอดภัย กรุณากรอกรหัสผ่านปัจจุบันก่อนตั้งรหัสผ่านใหม่ รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร
                    </Typography>
                    <Typography sx={{ color: adminColors.muted, fontSize: 12.5, lineHeight: 1.65 }}>
                      For security, enter your current password before setting a new one. The new password must be at least 6 characters.
                    </Typography>

                    <Box
                      sx={{
                        mt: 1,
                        p: 1.5,
                        borderRadius: `${ADMIN_RADIUS}px`,
                        bgcolor: "#eff6ff",
                        border: "1px solid #bfdbfe",
                      }}
                    >
                      <Stack spacing={0.75}>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <CheckCircleRoundedIcon sx={{ fontSize: 14, color: "#059669" }} />
                          <Typography sx={{ fontSize: 11.5, color: adminColors.text, fontWeight: 700 }}>
                            เข้ารหัสด้วย scrypt / Encrypted with scrypt
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <CheckCircleRoundedIcon sx={{ fontSize: 14, color: "#059669" }} />
                          <Typography sx={{ fontSize: 11.5, color: adminColors.text, fontWeight: 700 }}>
                            เก็บใน PostgreSQL / Stored in PostgreSQL
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                          <CheckCircleRoundedIcon sx={{ fontSize: 14, color: "#059669" }} />
                          <Typography sx={{ fontSize: 11.5, color: adminColors.text, fontWeight: 700 }}>
                            Session JWT หมดอายุ 7 วัน / 7-day JWT expiry
                          </Typography>
                        </Stack>
                      </Stack>
                    </Box>
                  </Stack>
                </Grid>

                <Grid size={{ xs: 12, md: 7 }}>
                  {!changingPassword ? (
                    <Box
                      sx={{
                        p: 3,
                        borderRadius: `${ADMIN_RADIUS}px`,
                        border: `1px solid ${adminColors.borderSoft}`,
                        bgcolor: adminColors.panelAlt,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: 220,
                        gap: 2,
                      }}
                    >
                      <Box
                        sx={{
                          width: 56,
                          height: 56,
                          borderRadius: "50%",
                          bgcolor: "#dbeafe",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <LockRoundedIcon sx={{ fontSize: 28, color: adminColors.blue }} />
                      </Box>
                      <Typography sx={{ color: adminColors.muted, fontSize: 13, textAlign: "center" }}>
                        รหัสผ่านของคุณถูกเข้ารหัสอย่างปลอดภัย
                      </Typography>
                      <Button
                        variant="outlined"
                        startIcon={<LockRoundedIcon />}
                        onClick={() => {
                          setChangingPassword(true);
                          setPasswordError(null);
                          setPasswordSuccess(null);
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                        sx={{ borderRadius: `${ADMIN_RADIUS}px`, fontWeight: 800 }}
                      >
                        เปลี่ยนรหัสผ่าน / Change password
                      </Button>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        p: 2.5,
                        borderRadius: `${ADMIN_RADIUS}px`,
                        border: `1px solid #fde68a`,
                        bgcolor: "#fffbeb",
                      }}
                    >
                      <Stack spacing={2}>
                        {passwordError ? (
                          <Alert severity="error" onClose={() => setPasswordError(null)} sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
                            {passwordError}
                          </Alert>
                        ) : null}

                        <TextField
                          label="รหัสผ่านปัจจุบัน / Current password"
                          type={showCurrentPw ? "text" : "password"}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          fullWidth
                          required
                          disabled={savingPassword}
                          size="small"
                          slotProps={{
                            input: {
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton onClick={() => setShowCurrentPw(!showCurrentPw)} edge="end" size="small">
                                    {showCurrentPw ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                                  </IconButton>
                                </InputAdornment>
                              ),
                            },
                          }}
                        />
                        <TextField
                          label="รหัสผ่านใหม่ / New password"
                          type={showNewPw ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          fullWidth
                          required
                          disabled={savingPassword}
                          size="small"
                          helperText="อย่างน้อย 6 ตัวอักษร / At least 6 characters"
                          slotProps={{
                            input: {
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton onClick={() => setShowNewPw(!showNewPw)} edge="end" size="small">
                                    {showNewPw ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                                  </IconButton>
                                </InputAdornment>
                              ),
                            },
                          }}
                        />
                        <TextField
                          label="ยืนยันรหัสผ่านใหม่ / Confirm new password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          fullWidth
                          required
                          disabled={savingPassword}
                          size="small"
                          error={confirmPassword.length > 0 && newPassword !== confirmPassword}
                          helperText={
                            confirmPassword.length > 0 && newPassword !== confirmPassword
                              ? "รหัสผ่านไม่ตรงกัน / Passwords do not match"
                              : undefined
                          }
                        />

                        <Divider />

                        <Stack direction="row" spacing={1.5} sx={{ justifyContent: "flex-end" }}>
                          <Button
                            variant="outlined"
                            onClick={() => {
                              setChangingPassword(false);
                              setCurrentPassword("");
                              setNewPassword("");
                              setConfirmPassword("");
                              setPasswordError(null);
                            }}
                            disabled={savingPassword}
                            sx={{ borderRadius: `${ADMIN_RADIUS}px`, fontWeight: 800 }}
                          >
                            ยกเลิก / Cancel
                          </Button>
                          <Button
                            variant="contained"
                            startIcon={savingPassword ? <CircularProgress size={16} color="inherit" /> : <LockRoundedIcon />}
                            onClick={handleChangePassword}
                            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                            sx={{ borderRadius: `${ADMIN_RADIUS}px`, fontWeight: 800 }}
                          >
                            {savingPassword ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน / Change"}
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  )}
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Stack>
  );
}
