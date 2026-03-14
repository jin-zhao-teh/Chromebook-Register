import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

type Env = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  EMAIL_API_URL?: string;
  EMAIL_API_KEY?: string;
  LOCAL_TIMEZONE?: string;
  APP_URL?: string;
};

type Student = {
  id: string;
  name: string;
  email?: string;
  allowedDeviceId?: string;
};

type StudentRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string | null;
  labels: string | null;
  banned: number;
  allowed_device_id: string | null;
  notes: string | null;
};

type SettingsRow = {
  require_class: number;
  allow_verification: number;
  updated_at: string;
};

type ChromebookRow = {
  id: string;
  label: string;
  asset_tag: string | null;
  status: string;
  status_note: string | null;
  student_name?: string | null;
  class_name?: string | null;
  checkout_time?: string | null;
};

type VerificationRow = {
  token: string;
  student_id: string;
  student_name: string;
  class_name: string;
  created_at: string;
  expires_at: string;
  device_id: string | null;
  verified_at: string | null;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: ["https://chromebook-register.pages.dev", "http://localhost:5173"], credentials: true }));

const DEFAULT_CLASSES = [
  "7M1",
  "7M2",
  "7M3",
  "8M1",
  "8M2",
  "9M1",
  "9M2",
  "10M1",
  "10M2"
];

const VERIFICATION_TTL_MINUTES = 30;

function nowIso() {
  return new Date().toISOString();
}

function sanitizeName(raw: string) {
  return raw
    .replace(/[^a-zA-Z0-9 '\\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeId(raw: string) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
}

function normalizeStudentId(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) {
    return trimmed.toLowerCase();
  }
  return normalizeId(trimmed);
}

function resolveAppUrl(c: Context<{ Bindings: Env }>) {
  return (
    c.req.header("Origin") ||
    c.req.header("Referer") ||
    c.env.APP_URL ||
    "https://chromebook-register.pages.dev"
  );
}

function buildVerificationLink(c: Context<{ Bindings: Env }>, token: string) {
  const origin = resolveAppUrl(c);
  const url = new URL("/verify", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildStudentName(row: Pick<StudentRow, "first_name" | "middle_name" | "last_name" | "nickname">) {
  const parts = [row.first_name, row.middle_name ?? "", row.last_name ?? ""]
    .map((part) => part.trim())
    .filter(Boolean);
  let name = sanitizeName(parts.join(" "));
  if (!name && row.nickname) {
    name = sanitizeName(row.nickname);
  }
  return name;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseStudentsCsv(text: string): StudentRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headerCells = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const hasHeader = headerCells.length > 1;

  let start = 0;
  let firstIndex = 0;
  let middleIndex = -1;
  let lastIndex = -1;
  let nicknameIndex = -1;
  let emailIndex = -1;
  let labelsIndex = -1;

  if (hasHeader) {
    start = 1;
    firstIndex = headerCells.findIndex((cell) => cell === "first name");
    middleIndex = headerCells.findIndex((cell) => cell === "middle name");
    lastIndex = headerCells.findIndex((cell) => cell === "last name");
    nicknameIndex = headerCells.findIndex((cell) => cell === "nickname");
    emailIndex = headerCells.findIndex((cell) => cell === "e-mail 1 - value");
    labelsIndex = headerCells.findIndex((cell) => cell === "labels");
    if (firstIndex < 0) {
      firstIndex = 0;
    }
  }

  return lines
    .slice(start)
    .map((line) => {
      const cells = parseCsvLine(line);
      const first = sanitizeName(cells[firstIndex]?.trim() ?? "");
      const middle = middleIndex >= 0 ? sanitizeName(cells[middleIndex]?.trim() ?? "") : "";
      const last = lastIndex >= 0 ? sanitizeName(cells[lastIndex]?.trim() ?? "") : "";
      const nickname = nicknameIndex >= 0 ? sanitizeName(cells[nicknameIndex]?.trim() ?? "") : "";
      const emailRaw = emailIndex >= 0 ? cells[emailIndex]?.trim() ?? "" : "";
      const email = emailRaw ? emailRaw.toLowerCase() : null;
      const labels = labelsIndex >= 0 ? cells[labelsIndex]?.trim() ?? "" : "";
      const displayName = sanitizeName([first, middle, last].filter(Boolean).join(" ")) || nickname;
      const id = normalizeStudentId(email ?? displayName);
      return {
        id,
        first_name: first,
        middle_name: middle || null,
        last_name: last || null,
        nickname: nickname || null,
        email,
        labels: labels || null,
        banned: 0,
        allowed_device_id: null,
        notes: null
      };
    })
    .filter((student) => Boolean(student.first_name || student.last_name || student.nickname));
}

async function batchStatements(
  db: D1Database,
  statements: D1PreparedStatement[],
  chunkSize = 50
) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize));
  }
}

async function ensureDefaultClasses(db: D1Database) {
  const result = await db
    .prepare("SELECT COUNT(*) as count FROM classes")
    .first<{ count: number }>();
  const count = Number(result?.count ?? 0);
  if (count > 0) {
    return;
  }
  const now = nowIso();
  const inserts = DEFAULT_CLASSES.map((name) =>
    db.prepare("INSERT INTO classes (name, created_at) VALUES (?, ?)").bind(name, now)
  );
  if (inserts.length > 0) {
    await db.batch(inserts);
  }
}

async function ensureSettings(db: D1Database): Promise<SettingsRow> {
  const existing = await db
    .prepare("SELECT require_class, allow_verification, updated_at FROM settings WHERE id = 1")
    .first<SettingsRow>();
  if (existing) {
    return existing;
  }
  const now = nowIso();
  await db
    .prepare("INSERT INTO settings (id, require_class, allow_verification, updated_at) VALUES (1, ?, ?, ?)")
    .bind(1, 1, now)
    .run();
  return { require_class: 1, allow_verification: 1, updated_at: now };
}

async function getSettings(db: D1Database) {
  const settings = await ensureSettings(db);
  return {
    requireClass: settings.require_class === 1,
    allowVerification: settings.allow_verification === 1
  };
}

async function listStudents(db: D1Database): Promise<Student[]> {
  const result = await db
    .prepare(
      "SELECT id, first_name, middle_name, last_name, nickname, email, allowed_device_id FROM students ORDER BY last_name, first_name"
    )
    .all<StudentRow>();

  return (result.results ?? [])
    .map((row) => ({
      id: row.id,
      name: buildStudentName(row),
      email: row.email ?? undefined,
      allowedDeviceId: row.allowed_device_id ?? undefined
    }))
    .filter((student) => student.name.length > 0);
}

async function getStudentEmailMap(db: D1Database) {
  const result = await db
    .prepare("SELECT id, email FROM students WHERE email IS NOT NULL")
    .all<{ id: string; email: string }>();
  return new Map((result.results ?? []).map((row) => [row.id, row.email]));
}

async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  const token =
    getCookie(c, "admin_session") ||
    c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await c.env.DB
    .prepare("SELECT token, expires_at FROM admin_sessions WHERE token = ?")
    .bind(token)
    .first<{ token: string; expires_at: string }>();

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const expiresAt = new Date(session.expires_at).getTime();
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
    return c.json({ error: "Session expired" }, 401);
  }

  await next();
}

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/settings", async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.json(settings);
});

app.get("/api/students", async (c) => {
  const students = await listStudents(c.env.DB);
  return c.json({ students });
});

app.get("/api/classes", async (c) => {
  await ensureDefaultClasses(c.env.DB);
  const result = await c.env.DB
    .prepare("SELECT id, name FROM classes ORDER BY name")
    .all<{ id: number; name: string }>();
  return c.json({ classes: result.results ?? [] });
});

app.get("/api/chromebooks", async (c) => {
  const result = await c.env.DB
    .prepare(
      "SELECT c.id, c.label, c.asset_tag, c.status, c.status_note, co.student_name, co.class_name, co.checkout_time " +
        "FROM chromebooks c LEFT JOIN checkouts co ON co.device_id = c.id " +
        "ORDER BY c.label COLLATE NOCASE"
    )
    .all<ChromebookRow>();

  const chromebooks = (result.results ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    assetTag: row.asset_tag ?? undefined,
    status: row.status,
    statusNote: row.status_note ?? undefined,
    checkedOut: Boolean(row.student_name),
    currentHolder: row.student_name ?? undefined,
    className: row.class_name ?? undefined,
    checkoutTime: row.checkout_time ?? undefined
  }));

  return c.json({ chromebooks });
});

app.post("/api/checkout", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | {
        action?: string;
        studentId?: string;
        studentName?: string;
        className?: string;
        deviceId?: string;
      }
    | null;

  if (!body) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const rawName = body.studentName ?? "";
  const action = body.action === "signout" ? "signout" : "register";
  const cleanName = sanitizeName(rawName);
  const studentId = normalizeStudentId(body.studentId ?? cleanName);
  const rawClass = (body.className ?? "").trim();
  const cleanClass = rawClass || "Unknown";
  const cleanDeviceId = normalizeId(body.deviceId ?? "");

  if (!cleanName) {
    return c.json({ error: "Student name is required" }, 400);
  }

  const settings = await getSettings(c.env.DB);
  if (action === "register" && settings.requireClass && !rawClass) {
    return c.json({ error: "Class name is required" }, 400);
  }

  const studentRecord = await c.env.DB
    .prepare("SELECT banned, allowed_device_id FROM students WHERE id = ?")
    .bind(studentId)
    .first<{ banned: number; allowed_device_id: string | null }>();

  if (!studentRecord) {
    return c.json({ error: "Student not found" }, 404);
  }

  if (studentRecord.banned) {
    return c.json({ error: "Student is banned from Chromebook use" }, 403);
  }

  const allowedDevice = studentRecord.allowed_device_id
    ? normalizeId(studentRecord.allowed_device_id)
    : "";

  if (allowedDevice && cleanDeviceId && allowedDevice !== cleanDeviceId) {
    return c.json({ error: "Student is restricted to a specific Chromebook" }, 403);
  }

  const now = nowIso();

  if (action === "signout" && !cleanDeviceId) {
    const active = await c.env.DB
      .prepare(
        "SELECT co.device_id, co.student_id, co.student_name, co.class_name, co.checkout_time, c.label " +
          "FROM checkouts co LEFT JOIN chromebooks c ON c.id = co.device_id " +
          "WHERE co.student_id = ?"
      )
      .bind(studentId)
      .all<{
        device_id: string;
        student_id: string;
        student_name: string;
        class_name: string;
        checkout_time: string;
        label: string | null;
      }>();

    const rows = active.results ?? [];
    if (rows.length === 0) {
      return c.json({ error: "No active Chromebook checkout found for this student" }, 404);
    }
    if (rows.length > 1) {
      return c.json({ error: "Multiple Chromebooks are checked out. Please see staff for help." }, 409);
    }

    const record = rows[0];
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          "INSERT INTO history (device_id, student_id, student_name, class_name, checkout_time, return_time, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          record.device_id,
          record.student_id,
          record.student_name,
          record.class_name,
          record.checkout_time,
          now,
          "returned"
        ),
      c.env.DB.prepare("DELETE FROM checkouts WHERE device_id = ?").bind(record.device_id)
    ]);

    const label = record.label ?? record.device_id;
    return c.json({
      status: "returned",
      message: `${record.student_name} returned ${label}.`,
      checkout: {
        deviceId: record.device_id,
        studentId: record.student_id,
        studentName: record.student_name,
        className: record.class_name,
        checkoutTime: record.checkout_time,
        returnTime: now
      }
    });
  }

  if (action === "register" && cleanDeviceId) {
    const active = await c.env.DB
      .prepare("SELECT device_id FROM checkouts WHERE student_id = ?")
      .bind(studentId)
      .all<{ device_id: string }>();

    if ((active.results ?? []).length > 0) {
      return c.json({ error: "Student already has a Chromebook checked out" }, 409);
    }
  }

  if (!cleanDeviceId) {
    await c.env.DB
      .prepare(
        "INSERT INTO history (device_id, student_id, student_name, class_name, checkout_time, return_time, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind("NAME_ONLY", studentId, cleanName, cleanClass, now, now, "name_only")
      .run();

    return c.json({
      status: "recorded",
      message: `${cleanName} recorded.`
    });
  }

  const device = await c.env.DB
    .prepare("SELECT id, label, status FROM chromebooks WHERE id = ?")
    .bind(cleanDeviceId)
    .first<{ id: string; label: string; status: string }>();

  if (!device) {
    return c.json({ error: "Chromebook not found" }, 404);
  }

  const existing = await c.env.DB
    .prepare("SELECT * FROM checkouts WHERE device_id = ?")
    .bind(cleanDeviceId)
    .first<{
      device_id: string;
      student_id: string;
      student_name: string;
      class_name: string;
      checkout_time: string;
    }>();

  if (existing && existing.student_id === studentId) {
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          "INSERT INTO history (device_id, student_id, student_name, class_name, checkout_time, return_time, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          existing.device_id,
          existing.student_id,
          existing.student_name,
          existing.class_name,
          existing.checkout_time,
          now,
          "returned"
        ),
      c.env.DB
        .prepare("DELETE FROM checkouts WHERE device_id = ?")
        .bind(cleanDeviceId)
    ]);

    return c.json({
      status: "returned",
      message: `${cleanName} returned ${device.label}.`,
      checkout: {
        deviceId: cleanDeviceId,
        studentId,
        studentName: cleanName,
        className: cleanClass,
        checkoutTime: existing.checkout_time,
        returnTime: now
      }
    });
  }

  if (device.status !== "available") {
    return c.json({ error: `Chromebook status is ${device.status}` }, 409);
  }

  if (!existing) {
    await c.env.DB
      .prepare(
        "INSERT INTO checkouts (device_id, student_id, student_name, class_name, checkout_time) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(cleanDeviceId, studentId, cleanName, cleanClass, now)
      .run();

    return c.json({
      status: "checked_out",
      message: `${cleanName} checked out ${device.label}.`,
      checkout: {
        deviceId: cleanDeviceId,
        studentId,
        studentName: cleanName,
        className: cleanClass,
        checkoutTime: now
      }
    });
  }

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        "INSERT INTO unreturned (device_id, student_id, student_name, class_name, checkout_time, flagged_time, reason) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        existing.device_id,
        existing.student_id,
        existing.student_name,
        existing.class_name,
        existing.checkout_time,
        now,
        "reassigned"
      ),
    c.env.DB
      .prepare("DELETE FROM checkouts WHERE device_id = ?")
      .bind(cleanDeviceId),
    c.env.DB
      .prepare(
        "INSERT INTO checkouts (device_id, student_id, student_name, class_name, checkout_time) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(cleanDeviceId, studentId, cleanName, cleanClass, now)
  ]);

  return c.json({
    status: "reassigned",
    message: `${device.label} was reassigned from ${existing.student_name} to ${cleanName}.`,
    checkout: {
      deviceId: cleanDeviceId,
      studentId,
      studentName: cleanName,
      className: cleanClass,
      checkoutTime: now
    },
    previous: {
      studentId: existing.student_id,
      studentName: existing.student_name,
      className: existing.class_name,
      checkoutTime: existing.checkout_time
    }
  });
});

app.post("/api/verification/request", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | {
        studentId?: string;
        studentName?: string;
        className?: string;
      }
    | null;

  if (!body) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const rawName = body.studentName ?? "";
  const cleanName = sanitizeName(rawName);
  const studentId = normalizeStudentId(body.studentId ?? cleanName);
  const rawClass = (body.className ?? "").trim();
  const cleanClass = rawClass || "Unknown";

  const settings = await getSettings(c.env.DB);
  if (!settings.allowVerification) {
    return c.json({ error: "Verification emails are disabled" }, 403);
  }
  if (settings.requireClass && !rawClass) {
    return c.json({ error: "Class name is required" }, 400);
  }

  const studentRecord = await c.env.DB
    .prepare(
      "SELECT first_name, middle_name, last_name, nickname, email, banned FROM students WHERE id = ?"
    )
    .bind(studentId)
    .first<Pick<StudentRow, "first_name" | "middle_name" | "last_name" | "nickname" | "email"> & {
      banned: number;
    }>();

  if (!studentRecord) {
    return c.json({ error: "Student not found" }, 404);
  }

  if (studentRecord.banned) {
    return c.json({ error: "Student is banned from Chromebook use" }, 403);
  }

  const activeCheckout = await c.env.DB
    .prepare("SELECT device_id FROM checkouts WHERE student_id = ?")
    .bind(studentId)
    .first<{ device_id: string }>();

  if (activeCheckout) {
    return c.json({ error: "Student already has a Chromebook checked out" }, 409);
  }

  const studentName = buildStudentName(studentRecord) || cleanName;
  if (!studentName) {
    return c.json({ error: "Student name is required" }, 400);
  }

  const email = studentRecord.email ?? "";
  if (!email) {
    return c.json({ error: "Student email is required for verification" }, 400);
  }

  const token = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1000).toISOString();

  await c.env.DB
    .prepare(
      "INSERT INTO verification_requests (token, student_id, student_name, class_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(token, studentId, studentName, cleanClass, createdAt, expiresAt)
    .run();

  const link = buildVerificationLink(c, token);
  const subject = "Verify your Chromebook checkout";
  const text =
    `Hi ${studentName},\n\n` +
    `Please open this link on the Chromebook you picked up to confirm the device:\n${link}\n\n` +
    `This link expires in ${VERIFICATION_TTL_MINUTES} minutes.\n\nThank you.`;
  const html =
    `<p>Hi ${studentName},</p>` +
    `<p>Please open this link on the Chromebook you picked up to confirm the device:</p>` +
    `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#0e7c86;color:#ffffff;border-radius:8px;text-decoration:none;">Verify Chromebook</a></p>` +
    `<p>Or paste this link into your browser: ${link}</p>` +
    `<p>This link expires in ${VERIFICATION_TTL_MINUTES} minutes.</p>`;

  const sent = await sendEmail(c.env, email, subject, text, html);
  if (!sent) {
    await c.env.DB.prepare("DELETE FROM verification_requests WHERE token = ?").bind(token).run();
    return c.json({ error: "Unable to send verification email" }, 500);
  }

  return c.json({
    status: "verification_sent",
    message: `Verification email sent to ${email}.`
  });
});

app.get("/api/verification/:token", async (c) => {
  const token = c.req.param("token");
  if (!token) {
    return c.json({ error: "Invalid token" }, 400);
  }

  const record = await c.env.DB
    .prepare(
      "SELECT token, student_id, student_name, class_name, expires_at, verified_at FROM verification_requests WHERE token = ?"
    )
    .bind(token)
    .first<
      Pick<VerificationRow, "token" | "student_id" | "student_name" | "class_name" | "expires_at" | "verified_at">
    >();

  if (!record) {
    return c.json({ error: "Verification not found" }, 404);
  }

  const studentMeta = await c.env.DB
    .prepare("SELECT allowed_device_id FROM students WHERE id = ?")
    .bind(record.student_id)
    .first<{ allowed_device_id: string | null }>();
  const allowedDeviceId = studentMeta?.allowed_device_id ?? undefined;

  if (record.verified_at) {
    return c.json({
      studentName: record.student_name,
      className: record.class_name,
      expiresAt: record.expires_at,
      verified: true,
      allowedDeviceId
    });
  }

  const expiresAt = new Date(record.expires_at).getTime();
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    return c.json({ error: "Verification expired" }, 410);
  }

  return c.json({
    studentName: record.student_name,
    className: record.class_name,
    expiresAt: record.expires_at,
    verified: false,
    allowedDeviceId
  });
});

app.post("/api/verification/confirm", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { token?: string; deviceId?: string }
    | null;

  if (!body?.token || !body?.deviceId) {
    return c.json({ error: "Token and device ID required" }, 400);
  }

  const token = body.token;
  const cleanDeviceId = normalizeId(body.deviceId);
  if (!cleanDeviceId) {
    return c.json({ error: "Device ID required" }, 400);
  }

  const record = await c.env.DB
    .prepare(
      "SELECT token, student_id, student_name, class_name, expires_at, verified_at FROM verification_requests WHERE token = ?"
    )
    .bind(token)
    .first<Pick<VerificationRow, "token" | "student_id" | "student_name" | "class_name" | "expires_at" | "verified_at">>();

  if (!record) {
    return c.json({ error: "Verification not found" }, 404);
  }

  if (record.verified_at) {
    return c.json({ error: "Verification already completed" }, 409);
  }

  const expiresAt = new Date(record.expires_at).getTime();
  if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
    return c.json({ error: "Verification expired" }, 410);
  }

  const studentRecord = await c.env.DB
    .prepare("SELECT banned, allowed_device_id FROM students WHERE id = ?")
    .bind(record.student_id)
    .first<{ banned: number; allowed_device_id: string | null }>();

  if (!studentRecord) {
    return c.json({ error: "Student not found" }, 404);
  }

  if (studentRecord.banned) {
    return c.json({ error: "Student is banned from Chromebook use" }, 403);
  }

  const allowedDevice = studentRecord.allowed_device_id
    ? normalizeId(studentRecord.allowed_device_id)
    : "";

  if (allowedDevice && allowedDevice !== cleanDeviceId) {
    return c.json({ error: "Student is restricted to a specific Chromebook" }, 403);
  }

  const device = await c.env.DB
    .prepare("SELECT id, label, status FROM chromebooks WHERE id = ?")
    .bind(cleanDeviceId)
    .first<{ id: string; label: string; status: string }>();

  if (!device) {
    return c.json({ error: "Chromebook not found" }, 404);
  }

  const existing = await c.env.DB
    .prepare("SELECT * FROM checkouts WHERE device_id = ?")
    .bind(cleanDeviceId)
    .first<{
      device_id: string;
      student_id: string;
      student_name: string;
      class_name: string;
      checkout_time: string;
    }>();

  const now = nowIso();

  if (existing && existing.student_id === record.student_id) {
    await c.env.DB
      .prepare("UPDATE verification_requests SET verified_at = ?, device_id = ? WHERE token = ?")
      .bind(now, cleanDeviceId, token)
      .run();

    return c.json({
      status: "already_checked_out",
      message: `${record.student_name} already has ${device.label} checked out.`
    });
  }

  if (device.status !== "available") {
    return c.json({ error: `Chromebook status is ${device.status}` }, 409);
  }

  if (!existing) {
    await c.env.DB.batch([
      c.env.DB
        .prepare(
          "INSERT INTO checkouts (device_id, student_id, student_name, class_name, checkout_time) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(cleanDeviceId, record.student_id, record.student_name, record.class_name, now),
      c.env.DB
        .prepare("UPDATE verification_requests SET verified_at = ?, device_id = ? WHERE token = ?")
        .bind(now, cleanDeviceId, token)
    ]);

    return c.json({
      status: "checked_out",
      message: `${record.student_name} checked out ${device.label}.`
    });
  }

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        "INSERT INTO unreturned (device_id, student_id, student_name, class_name, checkout_time, flagged_time, reason) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        existing.device_id,
        existing.student_id,
        existing.student_name,
        existing.class_name,
        existing.checkout_time,
        now,
        "reassigned"
      ),
    c.env.DB.prepare("DELETE FROM checkouts WHERE device_id = ?").bind(cleanDeviceId),
    c.env.DB
      .prepare(
        "INSERT INTO checkouts (device_id, student_id, student_name, class_name, checkout_time) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(cleanDeviceId, record.student_id, record.student_name, record.class_name, now),
    c.env.DB
      .prepare("UPDATE verification_requests SET verified_at = ?, device_id = ? WHERE token = ?")
      .bind(now, cleanDeviceId, token)
  ]);

  return c.json({
    status: "reassigned",
    message: `${device.label} was reassigned from ${existing.student_name} to ${record.student_name}.`
  });
});

app.post("/api/admin/login", async (c) => {
  const body = await c.req.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || body.password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "Invalid password" }, 401);
  }

  const token = crypto.randomUUID();
  const createdAt = nowIso();
  const ttlHours = 8;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  await c.env.DB
    .prepare(
      "INSERT INTO admin_sessions (token, created_at, expires_at) VALUES (?, ?, ?)"
    )
    .bind(token, createdAt, expiresAt)
    .run();

  const isSecure = new URL(c.req.url).protocol === "https:";
  const sameSite = isSecure ? "None" : "Lax";
  setCookie(c, "admin_session", token, {
    httpOnly: true,
    sameSite: sameSite,
    secure: isSecure,
    maxAge: ttlHours * 60 * 60,
    path: "/"
  });

  return c.json({ ok: true });
});

app.post("/api/admin/logout", async (c) => {
  const token = getCookie(c, "admin_session");
  if (token) {
    await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token = ?").bind(token).run();
  }
  deleteCookie(c, "admin_session", { path: "/" });
  return c.json({ ok: true });
});

app.use("/api/admin/*", async (c, next) => {
  if (c.req.path.endsWith("/login")) {
    await next();
    return;
  }
  await requireAdmin(c, next);
});

app.get("/api/admin/settings", async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.json(settings);
});

app.patch("/api/admin/settings", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { requireClass?: boolean; allowVerification?: boolean }
    | null;
  const existing = await ensureSettings(c.env.DB);
  const requireClass =
    typeof body?.requireClass === "boolean" ? body.requireClass : existing.require_class === 1;
  const allowVerification =
    typeof body?.allowVerification === "boolean"
      ? body.allowVerification
      : existing.allow_verification === 1;
  await c.env.DB
    .prepare("UPDATE settings SET require_class = ?, allow_verification = ?, updated_at = ? WHERE id = 1")
    .bind(requireClass ? 1 : 0, allowVerification ? 1 : 0, nowIso())
    .run();
  return c.json({ requireClass, allowVerification });
});

app.get("/api/admin/dashboard", async (c) => {
  const active = await c.env.DB
    .prepare(
      "SELECT co.device_id, co.student_id, co.student_name, co.class_name, co.checkout_time, c.label " +
        "FROM checkouts co LEFT JOIN chromebooks c ON c.id = co.device_id " +
        "ORDER BY co.checkout_time DESC"
    )
    .all<{
      device_id: string;
      student_id: string;
      student_name: string;
      class_name: string;
      checkout_time: string;
      label: string;
    }>();

  const topStudents = await c.env.DB
    .prepare(
      "SELECT student_name as name, COUNT(*) as count FROM history GROUP BY student_name ORDER BY count DESC LIMIT 5"
    )
    .all<{ name: string; count: number }>();

  const topClasses = await c.env.DB
    .prepare(
      "SELECT class_name as name, COUNT(*) as count FROM history GROUP BY class_name ORDER BY count DESC LIMIT 5"
    )
    .all<{ name: string; count: number }>();

  const recentHistory = await c.env.DB
    .prepare(
      "SELECT device_id, student_name, class_name, checkout_time, return_time, outcome FROM history ORDER BY return_time DESC LIMIT 20"
    )
    .all<{
      device_id: string;
      student_name: string;
      class_name: string;
      checkout_time: string;
      return_time: string;
      outcome: string;
    }>();

  const historyCount = await c.env.DB
    .prepare("SELECT COUNT(*) as count FROM history")
    .first<{ count: number }>();

  const unreturnedCount = await c.env.DB
    .prepare("SELECT COUNT(*) as count FROM unreturned")
    .first<{ count: number }>();

  return c.json({
    active: active.results ?? [],
    topStudents: topStudents.results ?? [],
    topClasses: topClasses.results ?? [],
    recentHistory: recentHistory.results ?? [],
    stats: {
      activeCount: active.results?.length ?? 0,
      historyCount: Number(historyCount?.count ?? 0),
      unreturnedCount: Number(unreturnedCount?.count ?? 0)
    }
  });
});

app.get("/api/admin/classes", async (c) => {
  const result = await c.env.DB
    .prepare(
      "SELECT c.id, c.name, COUNT(h.id) as usage_count " +
        "FROM classes c LEFT JOIN history h ON h.class_name = c.name " +
        "GROUP BY c.id ORDER BY c.name"
    )
    .all<{ id: number; name: string; usage_count: number }>();
  return c.json({ classes: result.results ?? [] });
});

app.post("/api/admin/classes", async (c) => {
  const body = await c.req.json().catch(() => null) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) {
    return c.json({ error: "Class name required" }, 400);
  }
  await c.env.DB
    .prepare("INSERT INTO classes (name, created_at) VALUES (?, ?)")
    .bind(name, nowIso())
    .run();
  return c.json({ ok: true });
});

app.delete("/api/admin/classes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Invalid class id" }, 400);
  }
  await c.env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

app.get("/api/admin/students", async (c) => {
  const result = await c.env.DB
    .prepare(
      "SELECT s.id, s.first_name, s.middle_name, s.last_name, s.nickname, s.email, s.labels, s.banned, s.allowed_device_id, s.notes, " +
        "COUNT(h.id) as total_checkouts " +
        "FROM students s LEFT JOIN history h ON h.student_id = s.id " +
        "GROUP BY s.id ORDER BY s.last_name, s.first_name"
    )
    .all<{
      id: string;
      first_name: string;
      middle_name: string | null;
      last_name: string | null;
      nickname: string | null;
      email: string | null;
      labels: string | null;
      banned: number;
      allowed_device_id: string | null;
      notes: string | null;
      total_checkouts: number;
    }>();
  return c.json({ students: result.results ?? [] });
});

app.post("/api/admin/students", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | {
        name?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        labels?: string;
        banned?: boolean;
        allowedDeviceId?: string;
        notes?: string;
      }
    | null;

  const rawName = body?.name?.trim() ?? "";
  const nameParts = sanitizeName(rawName).split(" ").filter(Boolean);
  const firstName = sanitizeName(body?.firstName ?? (nameParts[0] ?? ""));
  const lastName = sanitizeName(body?.lastName ?? (nameParts.slice(1).join(" ") ?? ""));
  if (!firstName) {
    return c.json({ error: "Student name is required" }, 400);
  }

  const email = body?.email?.trim().toLowerCase() || null;
  const id = normalizeStudentId(email ?? `${firstName} ${lastName}`.trim());
  const labels = body?.labels?.trim() || null;
  const banned = body?.banned ? 1 : 0;
  const allowedDeviceId = body?.allowedDeviceId ? normalizeId(body.allowedDeviceId) : null;
  const notes = body?.notes?.trim() || null;

  await c.env.DB
    .prepare(
      "INSERT OR REPLACE INTO students (id, first_name, middle_name, last_name, nickname, email, labels, banned, allowed_device_id, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      id,
      firstName,
      null,
      lastName || null,
      null,
      email,
      labels,
      banned,
      allowedDeviceId,
      notes,
      nowIso()
    )
    .run();

  return c.json({ ok: true });
});

app.patch("/api/admin/students/:id", async (c) => {
  const id = normalizeStudentId(c.req.param("id"));
  const body = await c.req.json().catch(() => null) as
    | { banned?: boolean; allowedDeviceId?: string | null }
    | null;
  if (!id) {
    return c.json({ error: "Invalid student id" }, 400);
  }
  const banned = body?.banned ? 1 : 0;
  const allowedDeviceId = body?.allowedDeviceId ? normalizeId(body.allowedDeviceId) : null;
  await c.env.DB
    .prepare("UPDATE students SET banned = ?, allowed_device_id = ? WHERE id = ?")
    .bind(banned, allowedDeviceId, id)
    .run();
  return c.json({ ok: true });
});

app.delete("/api/admin/students/:id", async (c) => {
  const id = normalizeStudentId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Invalid student id" }, 400);
  }
  await c.env.DB.prepare("DELETE FROM students WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

app.get("/api/admin/history", async (c) => {
  const result = await c.env.DB
    .prepare(
      "SELECT device_id, student_id, student_name, class_name, checkout_time, return_time, outcome FROM history ORDER BY return_time DESC LIMIT 500"
    )
    .all<{
      device_id: string;
      student_id: string;
      student_name: string;
      class_name: string;
      checkout_time: string;
      return_time: string;
      outcome: string;
    }>();
  return c.json({ history: result.results ?? [] });
});

app.get("/api/admin/unreturned", async (c) => {
  const result = await c.env.DB
    .prepare(
      "SELECT u.device_id, u.student_id, u.student_name, u.class_name, u.checkout_time, u.flagged_time, u.reason, c.label, c.asset_tag " +
        "FROM unreturned u LEFT JOIN chromebooks c ON c.id = u.device_id " +
        "ORDER BY u.flagged_time DESC"
    )
    .all<{
      device_id: string;
      student_id: string;
      student_name: string;
      class_name: string;
      checkout_time: string;
      flagged_time: string;
      reason: string;
      label: string | null;
      asset_tag: string | null;
    }>();

  return c.json({
    unreturned: (result.results ?? []).map((row) => ({
      device_id: row.device_id,
      student_id: row.student_id,
      student_name: row.student_name,
      class_name: row.class_name,
      checkout_time: row.checkout_time,
      flagged_time: row.flagged_time,
      reason: row.reason,
      label: row.label ?? undefined,
      asset_tag: row.asset_tag ?? undefined
    }))
  });
});

app.post("/api/admin/students/import", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { csv?: string; mode?: "replace" | "append" }
    | null;
  const csv = body?.csv?.trim();
  if (!csv) {
    return c.json({ error: "CSV content required" }, 400);
  }

  const students = parseStudentsCsv(csv);
  if (students.length === 0) {
    return c.json({ error: "No students found in CSV" }, 400);
  }

  const mode = body?.mode === "append" ? "append" : "replace";
  if (mode === "replace") {
    await c.env.DB.prepare("DELETE FROM students").run();
  }

  const now = nowIso();
  const statements = students.map((student) =>
    c.env.DB
      .prepare(
        "INSERT OR REPLACE INTO students (id, first_name, middle_name, last_name, nickname, email, labels, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        student.id,
        student.first_name,
        student.middle_name,
        student.last_name,
        student.nickname,
        student.email,
        student.labels,
        now
      )
  );

  await batchStatements(c.env.DB, statements);

  return c.json({ ok: true, imported: students.length, mode });
});

app.get("/api/admin/chromebooks", async (c) => {
  const result = await c.env.DB
    .prepare(
      "SELECT id, label, asset_tag, status, status_note FROM chromebooks ORDER BY label COLLATE NOCASE"
    )
    .all<{ id: string; label: string; asset_tag: string | null; status: string; status_note: string | null }>();
  return c.json({
    chromebooks: (result.results ?? []).map((row) => ({
      id: row.id,
      label: row.label,
      assetTag: row.asset_tag ?? undefined,
      status: row.status,
      statusNote: row.status_note ?? undefined
    }))
  });
});

app.post("/api/admin/chromebooks", async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { id?: string; label?: string; assetTag?: string; status?: string; statusNote?: string }
    | null;
  const label = body?.label?.trim() ?? "";
  const id = normalizeId(body?.id ?? label);
  if (!label || !id) {
    return c.json({ error: "Device ID and label required" }, 400);
  }
  const status = body?.status?.trim() || "available";
  const statusNote = body?.statusNote?.trim() || null;
  await c.env.DB
    .prepare(
      "INSERT INTO chromebooks (id, label, asset_tag, status, status_note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id, label, body?.assetTag?.trim() || null, status, statusNote, nowIso())
    .run();
  return c.json({ ok: true });
});

app.delete("/api/admin/chromebooks/:id", async (c) => {
  const id = normalizeId(c.req.param("id"));
  if (!id) {
    return c.json({ error: "Invalid device id" }, 400);
  }
  await c.env.DB.prepare("DELETE FROM chromebooks WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

app.patch("/api/admin/chromebooks/:id", async (c) => {
  const id = normalizeId(c.req.param("id"));
  const body = await c.req.json().catch(() => null) as
    | { status?: string; statusNote?: string }
    | null;
  if (!id) {
    return c.json({ error: "Invalid device id" }, 400);
  }
  const status = body?.status?.trim() || "available";
  const statusNote = body?.statusNote?.trim() || null;
  await c.env.DB
    .prepare("UPDATE chromebooks SET status = ?, status_note = ? WHERE id = ?")
    .bind(status, statusNote, id)
    .run();
  return c.json({ ok: true });
});

async function sendEmail(env: Env, to: string, subject: string, body: string, html?: string) {
  if (!env.EMAIL_API_URL || !env.EMAIL_API_KEY) {
    return false;
  }
  const payload: Record<string, string> = { to, subject, text: body };
  if (html) {
    payload.html = html;
  }
  const response = await fetch(env.EMAIL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.EMAIL_API_KEY}`
    },
    body: JSON.stringify(payload)
  });
  return response.ok;
}

function formatLocalTime(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      month: "short",
      day: "numeric"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

async function processOverdue(env: Env) {
  const active = await env.DB
    .prepare("SELECT device_id, student_id, student_name, class_name, checkout_time FROM checkouts")
    .all<{
      device_id: string;
      student_id: string;
      student_name: string;
      class_name: string;
      checkout_time: string;
    }>();

  if (!active.results || active.results.length === 0) {
    return { moved: 0, emailed: 0 };
  }

  const now = nowIso();
  const timezone = env.LOCAL_TIMEZONE || "UTC";
  const emailMap = await getStudentEmailMap(env.DB);

  let emailed = 0;
  for (const record of active.results) {
    await env.DB.batch([
      env.DB
        .prepare(
          "INSERT INTO unreturned (device_id, student_id, student_name, class_name, checkout_time, flagged_time, reason) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          record.device_id,
          record.student_id,
          record.student_name,
          record.class_name,
          record.checkout_time,
          now,
          "scheduled"
        ),
      env.DB.prepare("DELETE FROM checkouts WHERE device_id = ?").bind(record.device_id)
    ]);

    const email = emailMap.get(record.student_id);
    if (email) {
      const formatted = formatLocalTime(record.checkout_time, timezone);
      const subject = `Chromebook return reminder: ${record.device_id}`;
      const text =
        `Hi ${record.student_name},\n\n` +
        `Our records show Chromebook ${record.device_id} was checked out on ${formatted} and has not been returned yet. ` +
        `Please return it to the classroom cart as soon as possible.\n\n` +
        `Thank you.`;
      const ok = await sendEmail(env, email, subject, text);
      if (ok) {
        emailed += 1;
      }
    }
  }

  return { moved: active.results.length, emailed };
}

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(processOverdue(env));
  }
};




