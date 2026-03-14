import { useEffect, useMemo, useState } from "react";
import {
  AdminClassItem,
  AdminHistory,
  AdminStudent,
  AdminUnreturned,
  api,
  ChromebookInventory,
  Dashboard,
  Settings
} from "../api";
import {
  AlertIcon,
  ChartIcon,
  CheckIcon,
  ClassIcon,
  HistoryIcon,
  LaptopIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
  UsersIcon
} from "../components/Icons";
import { ToastStack, useToasts } from "../components/Toast";

type AdminTab = "overview" | "students" | "history" | "chromebooks" | "classes" | "unreturned";

type SessionWindow = {
  label: string;
  start: string;
  end: string;
};

const SESSION_WINDOWS: SessionWindow[] = [
  { label: "Session 1", start: "08:30", end: "09:30" },
  { label: "Session 2", start: "09:30", end: "10:30" },
  { label: "Session 3", start: "11:00", end: "12:00" },
  { label: "Session 4", start: "12:00", end: "13:00" },
  { label: "Session 5", start: "13:50", end: "14:50" },
  { label: "End of Day", start: "14:50", end: "24:00" }
];

const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "maintenance", label: "Maintenance" },
  { value: "broken", label: "Broken" },
  { value: "missing", label: "Missing" }
];

const navItems: { id: AdminTab; label: string; icon: JSX.Element }[] = [
  { id: "overview", label: "Overview", icon: <ChartIcon size={18} /> },
  { id: "students", label: "Students", icon: <UsersIcon size={18} /> },
  { id: "history", label: "History", icon: <HistoryIcon size={18} /> },
  { id: "unreturned", label: "Unreturned", icon: <AlertIcon size={18} /> },
  { id: "chromebooks", label: "Chromebooks", icon: <LaptopIcon size={18} /> },
  { id: "classes", label: "Classes", icon: <ClassIcon size={18} /> }
];

const parseMinutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const toMinutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });

const formatStudentName = (student: AdminStudent) => {
  const parts = [student.first_name, student.middle_name ?? "", student.last_name ?? ""]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(" ") || student.nickname || student.id;
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [classes, setClasses] = useState<AdminClassItem[]>([]);
  const [chromebooks, setChromebooks] = useState<ChromebookInventory[]>([]);
  const [students, setStudents] = useState<AdminStudent[]>([]);
  const [history, setHistory] = useState<AdminHistory[]>([]);
  const [unreturned, setUnreturned] = useState<AdminUnreturned[]>([]);
  const [newClass, setNewClass] = useState("");
  const [newDeviceId, setNewDeviceId] = useState("");
  const [newDeviceLabel, setNewDeviceLabel] = useState("");
  const [newDeviceTag, setNewDeviceTag] = useState("");
  const [newDeviceStatus, setNewDeviceStatus] = useState("available");
  const [newDeviceNote, setNewDeviceNote] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentEmail, setNewStudentEmail] = useState("");
  const [newStudentLabels, setNewStudentLabels] = useState("");
  const [newStudentAllowed, setNewStudentAllowed] = useState("");
  const [newStudentBanned, setNewStudentBanned] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvMode, setCsvMode] = useState<"replace" | "append">("replace");
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [deviceEdits, setDeviceEdits] = useState<Record<string, { status: string; statusNote: string }>>(
    {}
  );
  const [settings, setSettings] = useState<Settings | null>(null);

  const { toasts, pushToast, dismissToast } = useToasts();

  const loadAll = async () => {
    const [
      dashboardResponse,
      classesResponse,
      chromebooksResponse,
      studentsResponse,
      historyResponse,
      unreturnedResponse,
      settingsResponse
    ] = await Promise.all([
      api.getDashboard(),
      api.listClasses(),
      api.listChromebooks(),
      api.listAdminStudents(),
      api.listHistory(),
      api.listUnreturned(),
      api.getAdminSettings()
    ]);
    setDashboard(dashboardResponse);
    setClasses(classesResponse.classes);
    setChromebooks(chromebooksResponse.chromebooks);
    setStudents(studentsResponse.students);
    setHistory(historyResponse.history);
    setUnreturned(unreturnedResponse.unreturned);
    setSettings(settingsResponse);
  };

  useEffect(() => {
    loadAll().catch(() => {
      setDashboard(null);
      pushToast("Unable to load admin data.", "error");
    });
  }, [pushToast]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.loginAdmin(password);
      setPassword("");
      await loadAll();
      pushToast("Admin access granted.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed.";
      setError(message);
      pushToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logoutAdmin();
      setDashboard(null);
      pushToast("Logged out.", "info");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Logout failed.", "error");
    }
  };

  const handleAddClass = async () => {
    if (!newClass.trim()) {
      pushToast("Enter a class name first.", "error");
      return;
    }
    try {
      await api.addClass(newClass.trim());
      setNewClass("");
      await loadAll();
      pushToast("Class added.", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to add class.", "error");
    }
  };

  const handleDeleteClass = async (id: number) => {
    try {
      await api.deleteClass(id);
      await loadAll();
      pushToast("Class deleted.", "info");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to delete class.", "error");
    }
  };

  const handleAddChromebook = async () => {
    if (!newDeviceId.trim() || !newDeviceLabel.trim()) {
      pushToast("Device ID and label are required.", "error");
      return;
    }
    try {
      await api.addChromebook({
        id: newDeviceId.trim(),
        label: newDeviceLabel.trim(),
        assetTag: newDeviceTag.trim() || undefined,
        status: newDeviceStatus,
        statusNote: newDeviceNote.trim() || undefined
      });
      setNewDeviceId("");
      setNewDeviceLabel("");
      setNewDeviceTag("");
      setNewDeviceStatus("available");
      setNewDeviceNote("");
      await loadAll();
      pushToast("Chromebook added.", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to add Chromebook.", "error");
    }
  };

  const handleDeleteChromebook = async (id: string) => {
    try {
      await api.deleteChromebook(id);
      await loadAll();
      pushToast("Chromebook deleted.", "info");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to delete Chromebook.", "error");
    }
  };

  const handleChromebookEdit = (id: string, updates: Partial<{ status: string; statusNote: string }>) => {
    setDeviceEdits((prev) => ({
      ...prev,
      [id]: {
        status: updates.status ?? prev[id]?.status ?? "available",
        statusNote: updates.statusNote ?? prev[id]?.statusNote ?? ""
      }
    }));
  };

  const handleSaveChromebook = async (device: ChromebookInventory) => {
    const edit = deviceEdits[device.id] ?? {
      status: device.status,
      statusNote: device.statusNote ?? ""
    };
    try {
      await api.updateChromebook(device.id, {
        status: edit.status,
        statusNote: edit.statusNote || undefined
      });
      await loadAll();
      pushToast("Chromebook updated.", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to update Chromebook.", "error");
    }
  };

  const handleAddStudent = async () => {
    if (!newStudentName.trim()) {
      pushToast("Student name is required.", "error");
      return;
    }
    try {
      await api.addStudent({
        name: newStudentName.trim(),
        email: newStudentEmail.trim() || undefined,
        labels: newStudentLabels.trim() || undefined,
        banned: newStudentBanned,
        allowedDeviceId: newStudentAllowed.trim() || undefined
      });
      setNewStudentName("");
      setNewStudentEmail("");
      setNewStudentLabels("");
      setNewStudentAllowed("");
      setNewStudentBanned(false);
      await loadAll();
      pushToast("Student added.", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to add student.", "error");
    }
  };

  const handleUpdateStudent = async (student: AdminStudent, updates: { banned?: boolean; allowedDeviceId?: string | null }) => {
    try {
      await api.updateStudent(student.id, updates);
      setStudents((prev) =>
        prev.map((item) =>
          item.id === student.id
            ? {
                ...item,
                banned: updates.banned !== undefined ? (updates.banned ? 1 : 0) : item.banned,
                allowed_device_id:
                  updates.allowedDeviceId !== undefined ? updates.allowedDeviceId : item.allowed_device_id
              }
            : item
        )
      );
      pushToast("Student updated.", "success");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to update student.", "error");
    }
  };

  const handleDeleteStudent = async (id: string) => {
    try {
      await api.deleteStudent(id);
      await loadAll();
      pushToast("Student deleted.", "info");
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Unable to delete student.", "error");
    }
  };

  const handleUpdateSettings = async (updates: Partial<Settings>) => {
    if (!settings) {
      return;
    }
    const previous = settings;
    const next = { ...settings, ...updates };
    setSettings(next);
    try {
      const response = await api.updateSettings(updates);
      setSettings(response);
      pushToast("Settings updated.", "success");
    } catch (err) {
      setSettings(previous);
      pushToast(err instanceof Error ? err.message : "Unable to update settings.", "error");
    }
  };


  const handleImportStudents = async () => {
    if (!csvFile) {
      setCsvStatus("Select a CSV file first.");
      pushToast("Select a CSV file first.", "error");
      return;
    }
    setCsvLoading(true);
    setCsvStatus(null);
    try {
      const text = await csvFile.text();
      const response = await api.importStudents(text, csvMode);
      setCsvStatus(`Imported ${response.imported} students (${response.mode}).`);
      setCsvFile(null);
      await loadAll();
      pushToast(`Imported ${response.imported} students (${response.mode}).`, "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed.";
      setCsvStatus(message);
      pushToast(message, "error");
    } finally {
      setCsvLoading(false);
    }
  };

  const todaySessions = useMemo(() => {
    const today = new Date();
    const todayHistory = history.filter((entry) => isSameDay(new Date(entry.return_time), today));

    return SESSION_WINDOWS.map((session) => {
      const startMin = parseMinutes(session.start);
      const endMin = parseMinutes(session.end);
      const entries = todayHistory.filter((entry) => {
        const minutes = toMinutes(new Date(entry.return_time));
        return minutes >= startMin && minutes < endMin;
      });
      return {
        label: session.label,
        entries
      };
    });
  }, [history]);

  const studentStats = useMemo(() => {
    const total = students.length;
    const banned = students.filter((student) => student.banned).length;
    const restricted = students.filter((student) => student.allowed_device_id).length;
    return { total, banned, restricted };
  }, [students]);

  const filteredStudents = useMemo(() => {
    const term = studentSearch.trim().toLowerCase();
    if (!term) {
      return students;
    }
    return students.filter((student) => {
      const name = formatStudentName(student).toLowerCase();
      const email = student.email?.toLowerCase() ?? "";
      const labels = student.labels?.toLowerCase() ?? "";
      const id = student.id.toLowerCase();
      return (
        name.includes(term) ||
        email.includes(term) ||
        labels.includes(term) ||
        id.includes(term)
      );
    });
  }, [students, studentSearch]);

  const classStats = useMemo(() => {
    const total = classes.length;
    const usage = classes.reduce((sum, item) => sum + item.usage_count, 0);
    return { total, usage };
  }, [classes]);

  if (!dashboard) {
    return (
      <div className="admin-login-screen">
        <section className="card admin-login-card">
          <div className="card-header">
            <span className="icon-badge">
              <ShieldIcon size={22} />
            </span>
            <div>
              <h2>Admin Login</h2>
              <p>Secure dashboard for staff only.</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="admin-login">
            <input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? "Checking..." : "Unlock Dashboard"}
            </button>
            {error && <p className="form-error">{error}</p>}
          </form>
        </section>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <header className="admin-header">
          <div>
            <p className="admin-kicker">Chromebook Register</p>
            <h2>{navItems.find((item) => item.id === activeTab)?.label}</h2>
          </div>
          <button className="ghost-btn" type="button" onClick={handleLogout}>
            Log out
          </button>
        </header>

        <div className="admin-scroll">
          {activeTab === "overview" && (
            <section className="admin-panel">
              <div className="admin-stat-grid">
                <div className="admin-stat">
                  <p>Active Checkouts</p>
                  <strong>{dashboard.stats.activeCount}</strong>
                </div>
                <div className="admin-stat">
                  <p>Total History</p>
                  <strong>{dashboard.stats.historyCount}</strong>
                </div>
                <div className="admin-stat">
                  <p>Unreturned Log</p>
                  <strong>{dashboard.stats.unreturnedCount}</strong>
                </div>
              </div>

              <div className="admin-grid-two">
                <div className="admin-card-panel">
                  <h3>Current Chromebooks Out</h3>
                  <div className="admin-table">
                    <div className="admin-row admin-row--head">
                      <span>Device</span>
                      <span>Student</span>
                      <span>Class</span>
                      <span>Checked Out</span>
                    </div>
                    {dashboard.active.length === 0 && <p className="admin-empty">No active checkouts.</p>}
                    {dashboard.active.map((item) => (
                      <div key={item.device_id} className="admin-row">
                        <span>{item.label}</span>
                        <span>{item.student_name}</span>
                        <span>{item.class_name}</span>
                        <span>{formatTime(item.checkout_time)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-card-panel">
                  <h3>Today by Session</h3>
                  <div className="session-blocks">
                    {todaySessions.map((session) => (
                      <div key={session.label} className="session-block">
                        <div className="session-title">{session.label}</div>
                        {session.entries.length === 0 ? (
                          <p className="admin-empty">No activity.</p>
                        ) : (
                          session.entries.map((entry, index) => (
                            <div key={`${entry.device_id}-${index}`} className="session-row">
                              <span>{entry.device_id}</span>
                              <span>{entry.student_name}</span>
                              <span>{formatTime(entry.return_time)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-card-panel">
                  <h3>Kiosk Settings</h3>
                  <div className="stacked-form">
                    <label className="toggle-line">
                      <input
                        type="checkbox"
                        checked={settings?.requireClass ?? true}
                        onChange={(event) => handleUpdateSettings({ requireClass: event.target.checked })}
                        disabled={!settings}
                      />
                      <span>Require class selection</span>
                    </label>
                    <label className="toggle-line">
                      <input
                        type="checkbox"
                        checked={settings?.allowVerification ?? true}
                        onChange={(event) => handleUpdateSettings({ allowVerification: event.target.checked })}
                        disabled={!settings}
                      />
                      <span>Allow verification email option</span>
                    </label>
                  </div>
                  {!settings && <p className="form-helper">Loading settings...</p>}
                </div>
              </div>
            </section>
          )}

          {activeTab === "students" && (
            <section className="admin-panel admin-panel--split">
              <div className="admin-panel-column">
                <div className="admin-stat-grid">
                  <div className="admin-stat">
                    <p>Total Students</p>
                    <strong>{studentStats.total}</strong>
                  </div>
                  <div className="admin-stat">
                    <p>Banned</p>
                    <strong>{studentStats.banned}</strong>
                  </div>
                  <div className="admin-stat">
                    <p>Restricted</p>
                    <strong>{studentStats.restricted}</strong>
                  </div>
                </div>

                <div className="admin-stack">
                  <div className="admin-card-panel">
                    <h3>Add Student</h3>
                    <div className="stacked-form">
                      <input
                        type="text"
                        placeholder="Student name"
                        value={newStudentName}
                        onChange={(event) => setNewStudentName(event.target.value)}
                      />
                      <input
                        type="email"
                        placeholder="Email (optional)"
                        value={newStudentEmail}
                        onChange={(event) => setNewStudentEmail(event.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Labels (optional)"
                        value={newStudentLabels}
                        onChange={(event) => setNewStudentLabels(event.target.value)}
                      />
                      <select
                        value={newStudentAllowed}
                        onChange={(event) => setNewStudentAllowed(event.target.value)}
                      >
                        <option value="">Allowed Chromebook: Any</option>
                        {chromebooks.map((device) => (
                          <option key={device.id} value={device.id}>
                            {device.label}
                          </option>
                        ))}
                      </select>
                      <label className="toggle-line">
                        <input
                          type="checkbox"
                          checked={newStudentBanned}
                          onChange={(event) => setNewStudentBanned(event.target.checked)}
                        />
                        <span>Ban from Chromebook usage</span>
                      </label>
                      <button className="primary-btn" type="button" onClick={handleAddStudent}>
                        <PlusIcon size={16} /> Add Student
                      </button>
                    </div>
                  </div>

                  <div className="admin-card-panel">
                    <h3>Import Students</h3>
                    <p className="panel-note">
                      Upload the Google Contacts CSV with headers like "First Name" and "E-mail 1 - Value".
                    </p>
                    <div className="stacked-form">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={(event) => {
                          setCsvFile(event.target.files?.[0] ?? null);
                          setCsvStatus(null);
                        }}
                      />
                      <select
                        value={csvMode}
                        onChange={(event) => setCsvMode(event.target.value as "replace" | "append")}
                      >
                        <option value="replace">Replace existing students</option>
                        <option value="append">Append to existing students</option>
                      </select>
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={handleImportStudents}
                        disabled={csvLoading}
                      >
                        {csvLoading ? "Importing..." : "Import CSV"}
                      </button>
                    </div>
                    {csvStatus && <p className="form-helper">{csvStatus}</p>}
                  </div>
                </div>
              </div>

              <div className="admin-panel-column admin-panel-column--table">
                <div className="admin-card-panel admin-card-panel--table admin-card-panel--stretch">
                  <h3>Student Directory</h3>
                  <div className="admin-table-controls">
                    <input
                      className="admin-search"
                      type="text"
                      placeholder="Search students"
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                    />
                    <span className="admin-table-count">
                      {filteredStudents.length} of {students.length}
                    </span>
                  </div>
                  <div className="admin-table admin-table--students">
                    <div className="admin-row admin-row--head">
                      <span>Name</span>
                      <span>Email</span>
                      <span>Labels</span>
                      <span>Checkouts</span>
                      <span>Allowed Device</span>
                      <span>Banned</span>
                      <span>Actions</span>
                    </div>
                    {filteredStudents.map((student) => (
                      <div key={student.id} className="admin-row">
                        <span>{formatStudentName(student)}</span>
                        <span>{student.email ?? "-"}</span>
                        <span>{student.labels ?? "-"}</span>
                        <span>{student.total_checkouts}</span>
                        <span>
                          <select
                            value={student.allowed_device_id ?? ""}
                            onChange={(event) =>
                              handleUpdateStudent(student, {
                                allowedDeviceId: event.target.value || null,
                                banned: Boolean(student.banned)
                              })
                            }
                          >
                            <option value="">Any</option>
                            {chromebooks.map((device) => (
                              <option key={device.id} value={device.id}>
                                {device.label}
                              </option>
                            ))}
                          </select>
                        </span>
                        <span>
                          <label className="toggle-line">
                            <input
                              type="checkbox"
                              checked={Boolean(student.banned)}
                              onChange={(event) =>
                                handleUpdateStudent(student, {
                                  banned: event.target.checked,
                                  allowedDeviceId: student.allowed_device_id ?? null
                                })
                              }
                            />
                            <span>{student.banned ? "Yes" : "No"}</span>
                          </label>
                        </span>
                        <span>
                          <button
                            className="icon-btn icon-btn--danger"
                            type="button"
                            onClick={() => handleDeleteStudent(student.id)}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "chromebooks" && (
            <section className="admin-panel admin-panel--split">
              <div className="admin-panel-column">
                <div className="admin-card-panel">
                  <h3>Add Chromebook</h3>
                  <div className="stacked-form">
                    <input
                      type="text"
                      placeholder="Device ID (ex: CB-101)"
                      value={newDeviceId}
                      onChange={(event) => setNewDeviceId(event.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Label (ex: Chromebook 101)"
                      value={newDeviceLabel}
                      onChange={(event) => setNewDeviceLabel(event.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Asset tag (optional)"
                      value={newDeviceTag}
                      onChange={(event) => setNewDeviceTag(event.target.value)}
                    />
                    <select
                      value={newDeviceStatus}
                      onChange={(event) => setNewDeviceStatus(event.target.value)}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Status note (optional)"
                      value={newDeviceNote}
                      onChange={(event) => setNewDeviceNote(event.target.value)}
                    />
                    <button className="primary-btn" type="button" onClick={handleAddChromebook}>
                      <PlusIcon size={16} /> Add Device
                    </button>
                  </div>
                </div>
              </div>

              <div className="admin-panel-column admin-panel-column--table">
                <div className="admin-card-panel admin-card-panel--table admin-card-panel--stretch">
                  <h3>Chromebook Inventory</h3>
                  <div className="admin-table admin-table--devices">
                    <div className="admin-row admin-row--head">
                      <span>Device</span>
                      <span>Asset Tag</span>
                      <span>Status</span>
                      <span>Note</span>
                      <span>Save</span>
                      <span>Delete</span>
                    </div>
                    {chromebooks.map((device) => {
                      const edit = deviceEdits[device.id] ?? {
                        status: device.status,
                        statusNote: device.statusNote ?? ""
                      };
                      return (
                        <div key={device.id} className="admin-row">
                          <span>{device.label}</span>
                          <span>{device.assetTag ?? "-"}</span>
                          <span>
                            <select
                              value={edit.status}
                              onChange={(event) =>
                                handleChromebookEdit(device.id, { status: event.target.value })
                              }
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                          </span>
                          <span>
                            <input
                              type="text"
                              value={edit.statusNote}
                              onChange={(event) =>
                                handleChromebookEdit(device.id, { statusNote: event.target.value })
                              }
                              placeholder="Optional"
                            />
                          </span>
                          <span>
                            <button
                              className="icon-btn"
                              type="button"
                              onClick={() => handleSaveChromebook(device)}
                            >
                              <CheckIcon size={14} />
                            </button>
                          </span>
                          <span>
                            <button
                              className="icon-btn icon-btn--danger"
                              type="button"
                              onClick={() => handleDeleteChromebook(device.id)}
                            >
                              <TrashIcon size={14} />
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "classes" && (
            <section className="admin-panel admin-panel--split">
              <div className="admin-panel-column">
                <div className="admin-stat-grid">
                  <div className="admin-stat">
                    <p>Total Classes</p>
                    <strong>{classStats.total}</strong>
                  </div>
                  <div className="admin-stat">
                    <p>Total Usage</p>
                    <strong>{classStats.usage}</strong>
                  </div>
                </div>
                <div className="admin-card-panel">
                  <h3>Add Class</h3>
                  <div className="inline-form">
                    <input
                      type="text"
                      placeholder="Class name"
                      value={newClass}
                      onChange={(event) => setNewClass(event.target.value)}
                    />
                    <button className="icon-btn" type="button" onClick={handleAddClass}>
                      <PlusIcon size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="admin-panel-column admin-panel-column--table">
                <div className="admin-card-panel admin-card-panel--table admin-card-panel--stretch">
                  <h3>Classes</h3>
                  <div className="admin-table admin-table--classes">
                    <div className="admin-row admin-row--head">
                      <span>Class</span>
                      <span>Usage</span>
                      <span>Delete</span>
                    </div>
                    {classes.map((cls) => (
                      <div key={cls.id} className="admin-row">
                        <span>{cls.name}</span>
                        <span>{cls.usage_count}</span>
                        <span>
                          <button
                            className="icon-btn icon-btn--danger"
                            type="button"
                            onClick={() => handleDeleteClass(cls.id)}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeTab === "unreturned" && (
            <section className="admin-panel admin-panel--table-only">
              <div className="admin-card-panel admin-card-panel--table admin-card-panel--stretch">
                <h3>Unreturned Log</h3>
                <div className="admin-table admin-table--unreturned">
                  <div className="admin-row admin-row--head">
                    <span>Device</span>
                    <span>Student</span>
                    <span>Class</span>
                    <span>Checked Out</span>
                    <span>Flagged</span>
                    <span>Reason</span>
                  </div>
                  {unreturned.length === 0 && <p className="admin-empty">No unreturned records.</p>}
                  {unreturned.map((entry, index) => (
                    <div key={`${entry.device_id}-${index}`} className="admin-row">
                      <span>{entry.label ?? entry.device_id}</span>
                      <span>{entry.student_name}</span>
                      <span>{entry.class_name}</span>
                      <span>{formatDateTime(entry.checkout_time)}</span>
                      <span>{formatDateTime(entry.flagged_time)}</span>
                      <span className="status-pill">{entry.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "history" && (
            <section className="admin-panel admin-panel--table-only">
              <div className="admin-card-panel admin-card-panel--table admin-card-panel--stretch">
                <h3>Complete History</h3>
                <div className="admin-table admin-table--history">
                  <div className="admin-row admin-row--head">
                    <span>Device</span>
                    <span>Student</span>
                    <span>Class</span>
                    <span>Out</span>
                    <span>In</span>
                    <span>Outcome</span>
                  </div>
                  {history.map((entry, index) => (
                    <div key={`${entry.device_id}-${index}`} className="admin-row">
                      <span>{entry.device_id}</span>
                      <span>{entry.student_name}</span>
                      <span>{entry.class_name}</span>
                      <span>{formatDateTime(entry.checkout_time)}</span>
                      <span>{formatDateTime(entry.return_time)}</span>
                      <span className="status-pill">{entry.outcome}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <aside className="admin-nav">
        <div>
          <div className="admin-nav-title">Admin</div>
          <div className="admin-nav-list">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-nav-item ${activeTab === item.id ? "is-active" : ""}`}
                onClick={() => setActiveTab(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-nav-footer">
          <p>Signed in</p>
          <button className="ghost-btn" type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}



