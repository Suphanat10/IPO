"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ADMIN_RADIUS, adminColors } from "../components/AdminPrimitives";

const fieldSx = {
  "& .MuiOutlinedInput-root": {
    minHeight: 52,
    borderRadius: `${ADMIN_RADIUS}px`,
  },
  "& .MuiOutlinedInput-input": { py: 1.4 },
  "& .MuiInputLabel-root": { fontWeight: 700 },
};

function RegisterContent() {
  const router = useRouter();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("รหัสผ่านไม่ตรงกัน");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      router.replace("/ipo/Dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        bgcolor: adminColors.appBg,
        px: { xs: 1.5, sm: 2 },
        py: { xs: 2, md: 4 },
      }}
    >
      <Container maxWidth="lg">
        <Paper
          sx={{
            borderRadius: `${ADMIN_RADIUS}px`,
            overflow: "hidden",
            border: `1px solid ${adminColors.border}`,
            boxShadow:
              "0 4px 16px rgba(56,189,248,0.15), 0 2px 8px rgba(10,25,41,0.08)",
            backgroundImage: "none",
          }}
        >
          <Grid container>
            <Grid
              size={{ xs: 12, md: 5 }}
              sx={{
                bgcolor: adminColors.sidebar,
                color: "#fff",
                p: { xs: 2.25, sm: 3, md: 4 },
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: { md: 560 },
              }}
            >
              <Stack spacing={{ xs: 2, md: 3.5 }}>
                <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: `${ADMIN_RADIUS}px`,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.16)",
                    }}
                  >
                    <Box
                      component="img"
                      src="/logo.c3dc7eeab8aedb0021bc.png"
                      alt="IPO logo"
                      sx={{
                        width: 34,
                        height: 28,
                        display: "block",
                        objectFit: "contain",
                        filter: "brightness(0) invert(1)",
                        opacity: 0.96,
                      }}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 850, fontSize: 16, lineHeight: 1.15 }}>
                      IPO Performance
                    </Typography>
                    <Typography sx={{ color: adminColors.sidebarMuted, fontSize: 12, mt: 0.35 }}>
                      Admin workspace
                    </Typography>
                  </Box>
                </Stack>

                <Box>
                  <Typography
                    variant="overline"
                    sx={{ color: adminColors.cyan, fontWeight: 850, letterSpacing: 0 }}
                  >
                    New Admin
                  </Typography>
                  <Typography
                    variant="h3"
                    sx={{
                      fontWeight: 900,
                      fontSize: { xs: 25, sm: 30, md: 38 },
                      lineHeight: 1.05,
                      mt: 0.75,
                    }}
                  >
                    สมัครแอดมินใหม่
                  </Typography>
                  <Typography
                    sx={{
                      color: adminColors.sidebarMuted,
                      mt: 1.25,
                      lineHeight: 1.55,
                      maxWidth: 360,
                      fontSize: { xs: 13, md: 16 },
                    }}
                  >
                    สร้างบัญชีแอดมินเพื่อจัดการข้อมูล IPO, ตรวจสอบข้อมูล, และดูแลระบบ
                  </Typography>
                </Box>
              </Stack>
            </Grid>

            <Grid
              size={{ xs: 12, md: 7 }}
              sx={{
                p: { xs: 2.5, sm: 3, md: 5 },
                bgcolor: "#ffffff",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Stack spacing={2.5} sx={{ width: "100%", maxWidth: 440, mx: "auto" }}>
                <Box>
                  <Typography
                    variant="overline"
                    sx={{ color: adminColors.accent, fontWeight: 800, letterSpacing: 0 }}
                  >
                    Register
                  </Typography>
                  <Typography
                    variant="h4"
                    sx={{ fontWeight: 900, fontSize: { xs: 26, md: 32 }, mt: 0.25 }}
                  >
                    สร้างบัญชี
                  </Typography>
                  <Typography variant="body2" sx={{ color: adminColors.muted, mt: 0.75 }}>
                    กรอกข้อมูลด้านล่างเพื่อสมัครแอดมิน
                  </Typography>
                </Box>

                {error ? (
                  <Alert
                    severity="error"
                    sx={{
                      borderRadius: `${ADMIN_RADIUS}px`,
                      border: "1px solid #fecdd3",
                      bgcolor: "#fff1f2",
                    }}
                  >
                    {error}
                  </Alert>
                ) : null}

                <form onSubmit={submit}>
                  <Stack spacing={1.75}>
                    <Stack direction="row" spacing={1.5}>
                      <TextField
                        fullWidth
                        label="ชื่อ"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        autoComplete="given-name"
                        sx={fieldSx}
                        slotProps={{
                          input: {
                            startAdornment: (
                              <InputAdornment position="start">
                                <PersonRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
                              </InputAdornment>
                            ),
                          },
                        }}
                      />
                      <TextField
                        fullWidth
                        label="นามสกุล"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        autoComplete="family-name"
                        sx={fieldSx}
                      />
                    </Stack>
                    <TextField
                      fullWidth
                      type="email"
                      label="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      sx={fieldSx}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <EmailRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <TextField
                      fullWidth
                      type={showPassword ? "text" : "password"}
                      label="รหัสผ่าน"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      sx={fieldSx}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>
                                <IconButton
                                  edge="end"
                                  onClick={() => setShowPassword((v) => !v)}
                                >
                                  {showPassword ? (
                                    <VisibilityOffRoundedIcon fontSize="small" />
                                  ) : (
                                    <VisibilityRoundedIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <TextField
                      fullWidth
                      type={showPassword ? "text" : "password"}
                      label="ยืนยันรหัสผ่าน"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      sx={fieldSx}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
                            </InputAdornment>
                          ),
                        },
                      }}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={busy}
                      startIcon={<PersonAddRoundedIcon />}
                      size="large"
                      sx={{
                        mt: 1,
                        alignSelf: "stretch",
                        minHeight: 52,
                        borderRadius: `${ADMIN_RADIUS}px`,
                      }}
                    >
                      {busy ? "กำลังสมัคร..." : "สมัครแอดมิน"}
                    </Button>
                  </Stack>
                </form>

                <Typography sx={{ color: adminColors.muted, fontSize: 13, textAlign: "center" }}>
                  มีบัญชีอยู่แล้ว?{" "}
                  <Link
                    href="/ipo/login"
                    style={{ color: adminColors.blue, fontWeight: 700, textDecoration: "none" }}
                  >
                    เข้าสู่ระบบ
                  </Link>
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
}

export default function RegisterPage() {
  return <RegisterContent />;
}
