"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import VpnKeyRoundedIcon from "@mui/icons-material/VpnKeyRounded";
import Swal from "sweetalert2";
import {
  DataGrid,
  GridActionsCellItem,
  type GridColDef,
} from "@mui/x-data-grid";
import {
  ADMIN_RADIUS,
  AdminPanel,
  adminColors,
  adminDataGridSx,
  adminPanelSx,
} from "../../components/AdminPrimitives";

type AdminUserRow = {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
};

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
};

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortUserId(userId: string) {
  if (userId.length <= 18) return userId;
  return `${userId.slice(0, 8)}...${userId.slice(-6)}`;
}

function displayName(row: AdminUserRow) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return name || "-";
}

async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: text };
  }
}

export default function AdminUsersClient({
  initialRows,
  initialError,
  currentUserId,
}: {
  initialRows: AdminUserRow[];
  initialError: string | null;
  currentUserId: string | null;
}) {
  const [rows, setRows] = React.useState<AdminUserRow[]>(initialRows);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialError);

  const [addDialogOpen, setAddDialogOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState<FormState>(EMPTY_FORM);
  const [addError, setAddError] = React.useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<AdminUserRow | null>(null);
  const [editForm, setEditForm] = React.useState<FormState>(EMPTY_FORM);
  const [editError, setEditError] = React.useState<string | null>(null);

  function startEdit(row: AdminUserRow) {
    setEditingUser(row);
    setEditForm({
      first_name: row.first_name ?? "",
      last_name: row.last_name ?? "",
      email: row.email ?? "",
      password: "",
    });
    setEditError(null);
    setEditDialogOpen(true);
  }

  function openAddDialog() {
    setAddForm(EMPTY_FORM);
    setAddError(null);
    setAddDialogOpen(true);
  }

  function closeAddDialog() {
    setAddDialogOpen(false);
  }

  function handleAddDialogExited() {
    setAddForm(EMPTY_FORM);
    setAddError(null);
  }

  function closeEditDialog() {
    setEditDialogOpen(false);
  }

  function handleEditDialogExited() {
    setEditingUser(null);
    setEditForm(EMPTY_FORM);
    setEditError(null);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (addForm.password.length < 6) {
      setAddError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร / Password must be at least 6 characters.");
      return;
    }

    setSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/ipo/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const payload = await parseResponse(res);
      if (!res.ok) throw new Error(String(payload.error ?? "Failed to save admin user"));
      const savedUser = payload.user as AdminUserRow | undefined;
      if (savedUser) {
        setRows((prev) => [savedUser, ...prev]);
      }
      closeAddDialog();
      await Swal.fire({
        title: "เพิ่มแอดมินแล้ว",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(
        `/api/ipo/admin-users/${encodeURIComponent(editingUser.user_id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editForm),
        },
      );
      const payload = await parseResponse(res);
      if (!res.ok) throw new Error(String(payload.error ?? "Failed to save admin user"));
      const savedUser = payload.user as AdminUserRow | undefined;
      if (savedUser) {
        setRows((prev) =>
          prev.map((row) => (row.user_id === savedUser.user_id ? savedUser : row)),
        );
      }
      closeEditDialog();
      await Swal.fire({
        title: "แก้ไขแอดมินแล้ว",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteAdmin(row: AdminUserRow) {
    if (row.user_id === currentUserId) {
      await Swal.fire({
        title: "ลบตัวเองไม่ได้",
        text: "บัญชีที่กำลังใช้งานอยู่ต้องคงสิทธิ์แอดมินไว้",
        icon: "info",
        confirmButtonText: "ตกลง",
      });
      return;
    }

    const confirm = await Swal.fire({
      title: "ลบแอดมิน?",
      text: `${displayName(row)} (${row.email ?? row.user_id}) จะถูกลบสิทธิ์แอดมิน`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "ลบ / Delete",
      cancelButtonText: "ยกเลิก / Cancel",
      confirmButtonColor: adminColors.rose,
    });
    if (!confirm.isConfirmed) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ipo/admin-users/${encodeURIComponent(row.user_id)}`, {
        method: "DELETE",
      });
      const payload = await parseResponse(res);
      if (!res.ok) throw new Error(String(payload.error ?? "Failed to delete admin user"));
      if (editingUser?.user_id === row.user_id) closeEditDialog();
      setRows((prev) => prev.filter((item) => item.user_id !== row.user_id));
      await Swal.fire({
        title: "ลบแล้ว",
        text: "สิทธิ์แอดมินถูกลบออกแล้ว",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const columns: GridColDef<AdminUserRow>[] = [
    {
      field: "actions",
      type: "actions",
      headerName: "จัดการ",
      width: 96,
      getActions: (p) => {
        const isSelf = p.row.user_id === currentUserId;
        return [
          <GridActionsCellItem
            key="edit"
            icon={<EditRoundedIcon fontSize="small" />}
            label="แก้ไข / Edit"
            onClick={() => startEdit(p.row)}
            disabled={saving}
          />,
          <GridActionsCellItem
            key="delete"
            icon={
              <DeleteOutlineRoundedIcon
                fontSize="small"
                sx={{ color: isSelf ? adminColors.muted : adminColors.rose }}
              />
            }
            label={isSelf ? "ลบตัวเองไม่ได้ / Cannot delete self" : "ลบ / Delete"}
            onClick={() => void deleteAdmin(p.row)}
            disabled={saving || isSelf}
          />,
        ];
      },
    },
    {
      field: "full_name",
      headerName: "ชื่อ-นามสกุล / Name",
      flex: 1,
      minWidth: 240,
      sortable: false,
      valueGetter: (_value, row) => displayName(row),
      renderCell: (p) => {
        const isSelf = p.row.user_id === currentUserId;
        return (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <PersonRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
            <Typography
              sx={{
                fontWeight: 850,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName(p.row)}
            </Typography>
            {isSelf ? (
              <Chip size="small" label="คุณ / You" color="primary" variant="outlined" />
            ) : null}
          </Stack>
        );
      },
    },
    {
      field: "email",
      headerName: "Email",
      flex: 1,
      minWidth: 260,
      renderCell: (p) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
          <EmailRoundedIcon fontSize="small" sx={{ color: adminColors.muted }} />
          <Typography
            sx={{
              fontWeight: 800,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.row.email || "-"}
          </Typography>
        </Stack>
      ),
    },
    {
      field: "user_id",
      headerName: "PostgreSQL user_id",
      flex: 0.9,
      minWidth: 250,
      renderCell: (p) => (
        <Chip
          label={shortUserId(p.row.user_id)}
          title={p.row.user_id}
          size="small"
          variant="outlined"
          sx={{ fontFamily: "monospace", maxWidth: "100%" }}
        />
      ),
    },
    {
      field: "created_at",
      headerName: "เพิ่มเมื่อ / Created",
      width: 210,
      renderCell: (p) => (
        <Typography variant="caption" sx={{ color: adminColors.muted }}>
          {fmtDateTime(p.row.created_at)}
        </Typography>
      ),
    },
  ];

  return (
    <Stack spacing={2.5}>
      {/* Global error (for delete failures) */}
      {error ? (
        <Alert severity="error" sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
          {error}
        </Alert>
      ) : null}

      {/* ② Admin list */}
      <AdminPanel
        title="รายชื่อแอดมิน / Admin users"
        subtitle="คลิกปุ่มแก้ไขเพื่อเปิดหน้าต่างแก้ไขข้อมูล"
        action={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={openAddDialog}
            size="small"
          >
            เพิ่มแอดมิน / Add admin
          </Button>
        }
        noPadding
      >
        <Box sx={{ height: { xs: 540, lg: 620 }, width: "100%", position: "relative" }}>
          <DataGrid
            rows={rows}
            columns={columns}
            getRowId={(row) => row.user_id}
            density="compact"
            disableRowSelectionOnClick
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
            localeText={{ noRowsLabel: "ยังไม่มีแอดมิน / No admin users" }}
            sx={adminDataGridSx}
          />
        </Box>
      </AdminPanel>

      {/* ③ Add Admin Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={closeAddDialog}
        maxWidth="sm"
        fullWidth
        slotProps={{
          transition: { onExited: handleAddDialogExited },
          paper: {
            sx: {
              ...adminPanelSx,
              borderRadius: "16px",
            },
          },
        }}
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: adminColors.text }}>
                เพิ่มแอดมินใหม่ / Add new admin
              </Typography>
              <Typography variant="body2" sx={{ color: adminColors.muted, mt: 0.25 }}>
                กรอกข้อมูลเพื่อสร้างบัญชีผู้ดูแลระบบใหม่
              </Typography>
            </Box>
            <IconButton onClick={closeAddDialog} size="small" sx={{ mt: -0.5, mr: -0.5 }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>

        <Box component="form" onSubmit={submitAdd}>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  size="small"
                  label="ชื่อ / First name"
                  value={addForm.first_name}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  required
                  disabled={saving}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonRoundedIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <TextField
                  size="small"
                  label="นามสกุล / Last name"
                  value={addForm.last_name}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  required
                  disabled={saving}
                  fullWidth
                />
              </Stack>

              <TextField
                size="small"
                label="Email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                required
                disabled={saving}
                fullWidth
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <TextField
                size="small"
                label="รหัสผ่าน / Password"
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm((prev) => ({ ...prev, password: e.target.value }))}
                required
                disabled={saving}
                fullWidth
                helperText="อย่างน้อย 6 ตัวอักษร / At least 6 characters"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <VpnKeyRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              {addError ? (
                <Alert severity="error" sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
                  {addError}
                </Alert>
              ) : null}
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button variant="outlined" onClick={closeAddDialog} disabled={saving}>
              ยกเลิก / Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<AddRoundedIcon />}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : "เพิ่มแอดมิน / Add admin"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* ④ Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={closeEditDialog}
        maxWidth="sm"
        fullWidth
        slotProps={{
          transition: { onExited: handleEditDialogExited },
          paper: {
            sx: {
              ...adminPanelSx,
              borderRadius: "16px",
            },
          },
        }}
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: adminColors.text }}>
                แก้ไขแอดมิน / Edit admin
              </Typography>
              {editingUser ? (
                <Typography variant="body2" sx={{ color: adminColors.muted, mt: 0.25 }}>
                  {displayName(editingUser)} — {editingUser.email ?? "-"}
                </Typography>
              ) : null}
            </Box>
            <IconButton onClick={closeEditDialog} size="small" sx={{ mt: -0.5, mr: -0.5 }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>

        <Box component="form" onSubmit={submitEdit}>
          <DialogContent sx={{ pt: 2 }}>
            <Stack spacing={2}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <TextField
                  size="small"
                  label="ชื่อ / First name"
                  value={editForm.first_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  required
                  disabled={saving}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonRoundedIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <TextField
                  size="small"
                  label="นามสกุล / Last name"
                  value={editForm.last_name}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  required
                  disabled={saving}
                  fullWidth
                />
              </Stack>

              <TextField
                size="small"
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                required
                disabled={saving}
                fullWidth
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <TextField
                size="small"
                label="รหัสผ่านใหม่ / New password"
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
                disabled={saving}
                fullWidth
                helperText="เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยนรหัสผ่าน / Leave blank to keep current password"
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <VpnKeyRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              {editError ? (
                <Alert severity="error" sx={{ borderRadius: `${ADMIN_RADIUS}px` }}>
                  {editError}
                </Alert>
              ) : null}
            </Stack>
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button variant="outlined" onClick={closeEditDialog} disabled={saving}>
              ยกเลิก / Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveRoundedIcon />}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : "บันทึก / Save"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
