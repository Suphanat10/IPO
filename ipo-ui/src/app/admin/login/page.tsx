"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  CircularProgress,
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
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ADMIN_RADIUS, adminColors } from "../components/AdminPrimitives";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.replace(next);
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
            boxShadow: "0 4px 16px rgba(56,189,248,0.15), 0 2px 8px rgba(10,25,41,0.08)",
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
                minHeight: { md: 500 },
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
                    Data Control
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
                    Sign in to manage IPO intelligence.
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
                    Curate listings, review imports, resolve validation items, and monitor build status from one console.
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
                    Admin Login
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 900, fontSize: { xs: 26, md: 32 }, mt: 0.25 }}>
                    Welcome back
                  </Typography>
                  <Typography variant="body2" sx={{ color: adminColors.muted, mt: 0.75 }}>
                    Use your registered admin account to continue.
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
                    <TextField
                      fullWidth
                      type="email"
                      label="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          minHeight: 56,
                          borderRadius: `${ADMIN_RADIUS}px`,
                        },
                        "& .MuiOutlinedInput-input": {
                          py: 1.6,
                        },
                        "& .MuiInputLabel-root": {
                          fontWeight: 700,
                        },
                      }}
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
                      label="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          minHeight: 56,
                          borderRadius: `${ADMIN_RADIUS}px`,
                        },
                        "& .MuiOutlinedInput-input": {
                          py: 1.6,
                        },
                        "& .MuiInputLabel-root": {
                          fontWeight: 700,
                        },
                      }}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title={showPassword ? "Hide password" : "Show password"}>
                                <IconButton
                                  edge="end"
                                  aria-label={showPassword ? "hide password" : "show password"}
                                  onClick={() => setShowPassword((value) => !value)}
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
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={busy}
                      startIcon={<LoginRoundedIcon />}
                      size="large"
                      sx={{
                        mt: 1,
                        alignSelf: "stretch",
                        minHeight: 52,
                        borderRadius: `${ADMIN_RADIUS}px`,
                      }}
                    >
                      {busy ? "Signing in..." : "Sign in"}
                    </Button>
                  </Stack>
                </form>

                <Typography sx={{ color: adminColors.muted, fontSize: 13, textAlign: "center" }}>
                  ยังไม่มีบัญชี?{" "}
                  <Link
                    href="/admin/register"
                    style={{ color: adminColors.blue, fontWeight: 700, textDecoration: "none" }}
                  >
                    สมัครแอดมิน
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

function LoginFallback() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        bgcolor: adminColors.sidebar,
        color: "#fff",
      }}
    >
      <CircularProgress sx={{ color: adminColors.cyan }} />
    </Box>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </React.Suspense>
  );
}
