export type Student = {
  id: string;
  name: string;
  email?: string;
  allowedDeviceId?: string;
};

export type ClassItem = {
  id: number;
  name: string;
};

export type AdminClassItem = ClassItem & {
  usage_count: number;
};

export type ChromebookStatus = {
  id: string;
  label: string;
  assetTag?: string;
  status: string;
  statusNote?: string;
  checkedOut: boolean;
  currentHolder?: string;
  className?: string;
  checkoutTime?: string;
};

export type ChromebookInventory = {
  id: string;
  label: string;
  assetTag?: string;
  status: string;
  statusNote?: string;
};

export type ActiveCheckout = {
  device_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  checkout_time: string;
  label: string;
};

export type Dashboard = {
  active: ActiveCheckout[];
  topStudents: { name: string; count: number }[];
  topClasses: { name: string; count: number }[];
  recentHistory: {
    device_id: string;
    student_name: string;
    class_name: string;
    checkout_time: string;
    return_time: string;
    outcome: string;
  }[];
  stats: {
    activeCount: number;
    historyCount: number;
    unreturnedCount: number;
  };
};

export type AdminStudent = {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  email?: string | null;
  labels?: string | null;
  banned: number;
  allowed_device_id?: string | null;
  notes?: string | null;
  total_checkouts: number;
};

export type AdminHistory = {
  device_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  checkout_time: string;
  return_time: string;
  outcome: string;
};

export type AdminUnreturned = {
  device_id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  checkout_time: string;
  flagged_time: string;
  reason: string;
  label?: string;
  asset_tag?: string;
};

export type VerificationInfo = {
  studentName: string;
  className: string;
  expiresAt: string;
  verified: boolean;
  allowedDeviceId?: string;
};

export type Settings = {
  requireClass: boolean;
  allowVerification: boolean;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://chromebook-register.tehj8036.workers.dev";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export const api = {
  getSettings: () => request<Settings>("/api/settings"),
  getStudents: () => request<{ students: Student[] }>("/api/students"),
  getClasses: () => request<{ classes: ClassItem[] }>("/api/classes"),
  getChromebooks: () => request<{ chromebooks: ChromebookStatus[] }>("/api/chromebooks"),
  checkout: (payload: {
    action?: "register" | "signout";
    studentId: string;
    studentName: string;
    className?: string;
    deviceId?: string;
  }) =>
    request<{
      status: "checked_out" | "returned" | "reassigned" | "recorded";
      message: string;
    }>("/api/checkout", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  requestVerification: (payload: {
    studentId: string;
    studentName: string;
    className?: string;
  }) =>
    request<{ status: "verification_sent"; message: string }>("/api/verification/request", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getVerification: (token: string) =>
    request<VerificationInfo>(`/api/verification/${token}`),
  confirmVerification: (token: string, deviceId: string) =>
    request<{ status: "checked_out" | "reassigned" | "already_checked_out"; message: string }>(
      "/api/verification/confirm",
      {
        method: "POST",
        body: JSON.stringify({ token, deviceId })
      }
    ),
  loginAdmin: (password: string) =>
    request<{ ok: true }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    }),
  logoutAdmin: () =>
    request<{ ok: true }>("/api/admin/logout", {
      method: "POST"
    }),
  getAdminSettings: () => request<Settings>("/api/admin/settings"),
  updateSettings: (payload: Partial<Settings>) =>
    request<Settings>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  getDashboard: () => request<Dashboard>("/api/admin/dashboard"),
  addClass: (name: string) =>
    request<{ ok: true }>("/api/admin/classes", {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  deleteClass: (id: number) =>
    request<{ ok: true }>(`/api/admin/classes/${id}`, {
      method: "DELETE"
    }),
  listClasses: () => request<{ classes: AdminClassItem[] }>("/api/admin/classes"),
  listChromebooks: () =>
    request<{ chromebooks: ChromebookInventory[] }>("/api/admin/chromebooks"),
  addChromebook: (payload: {
    id: string;
    label: string;
    assetTag?: string;
    status?: string;
    statusNote?: string;
  }) =>
    request<{ ok: true }>("/api/admin/chromebooks", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteChromebook: (id: string) =>
    request<{ ok: true }>(`/api/admin/chromebooks/${id}`, {
      method: "DELETE"
    }),
  updateChromebook: (id: string, payload: { status: string; statusNote?: string }) =>
    request<{ ok: true }>(`/api/admin/chromebooks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  listAdminStudents: () => request<{ students: AdminStudent[] }>("/api/admin/students"),
  addStudent: (payload: {
    name: string;
    email?: string;
    labels?: string;
    banned?: boolean;
    allowedDeviceId?: string;
  }) =>
    request<{ ok: true }>("/api/admin/students", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateStudent: (id: string, payload: { banned?: boolean; allowedDeviceId?: string | null }) =>
    request<{ ok: true }>(`/api/admin/students/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteStudent: (id: string) =>
    request<{ ok: true }>(`/api/admin/students/${id}`, {
      method: "DELETE"
    }),
  listHistory: () => request<{ history: AdminHistory[] }>("/api/admin/history"),
  listUnreturned: () => request<{ unreturned: AdminUnreturned[] }>("/api/admin/unreturned"),
  importStudents: (csv: string, mode: "replace" | "append") =>
    request<{ ok: true; imported: number; mode: "replace" | "append" }>(
      "/api/admin/students/import",
      {
        method: "POST",
        body: JSON.stringify({ csv, mode })
      }
    )
};
