import { useEffect, useMemo, useState } from "react";
import { api, ChromebookStatus, ClassItem, Settings, Student } from "../api";
import { CheckIcon, ClassIcon, ClockIcon, LaptopIcon, ReturnIcon, UserIcon } from "../components/Icons";
import SearchSelect, { SearchOption } from "../components/SearchSelect";
import { ToastStack, useToasts } from "../components/Toast";

type ActionMode = "register" | "signout";

const SESSION_TIMES = [
  { label: "Session 1", time: "8:30 - 9:30" },
  { label: "Session 2", time: "9:30 - 10:30" },
  { label: "Session 3", time: "11:00 - 12:00" },
  { label: "Session 4", time: "12:00 - 1:00" },
  { label: "Session 5", time: "1:50 - 2:50" },
  { label: "End of Day", time: "2:50" }
];


export default function CheckoutPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [chromebooks, setChromebooks] = useState<ChromebookStatus[]>([]);
  const [studentId, setStudentId] = useState("");
  const [className, setClassName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [action, setAction] = useState<ActionMode | null>(null);
  const [step, setStep] = useState(0);
  const [studentQuery, setStudentQuery] = useState("");
  const [classQuery, setClassQuery] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [showStudentList, setShowStudentList] = useState(false);
  const [showClassList, setShowClassList] = useState(false);
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [useVerificationEmail, setUseVerificationEmail] = useState(false);
  const [settings, setSettings] = useState<Settings>({ requireClass: true, allowVerification: true });

  const { toasts, pushToast, dismissToast } = useToasts();

  const availableCount = useMemo(
    () => chromebooks.filter((device) => !device.checkedOut && device.status === "available").length,
    [chromebooks]
  );

  const currentStudent = students.find((student) => student.id === studentId);
  const currentDevice = chromebooks.find((device) => device.id === deviceId);
  const isReturnMode = action === "signout";

  const loadData = async () => {
    const [studentsResponse, classesResponse, chromebooksResponse, settingsResponse] = await Promise.all([
      api.getStudents(),
      api.getClasses(),
      api.getChromebooks(),
      api.getSettings()
    ]);
    setStudents(studentsResponse.students);
    setClasses(classesResponse.classes);
    setChromebooks(chromebooksResponse.chromebooks);
    setSettings(settingsResponse);
  };

  useEffect(() => {
    loadData().catch(() => {
      pushToast("Unable to load kiosk data.", "error");
    });
  }, [pushToast]);

  useEffect(() => {
    if (currentStudent?.name) {
      setStudentQuery(currentStudent.name);
    }
  }, [currentStudent?.name]);

  useEffect(() => {
    if (className) {
      setClassQuery(className);
    }
  }, [className]);

  useEffect(() => {
    if (currentDevice?.label) {
      setDeviceQuery(currentDevice.label);
    }
  }, [currentDevice?.label]);


  const deviceDisabled = (device: ChromebookStatus, returnMode: boolean) => {
    if (returnMode) {
      return !device.checkedOut;
    }
    return device.checkedOut || device.status !== "available";
  };

  const deviceLabel = (device: ChromebookStatus, returnMode: boolean) => {
    if (device.checkedOut) {
      return `${device.label} - In use`;
    }
    if (!returnMode && device.status !== "available") {
      return `${device.label} - ${device.status}`;
    }
    return device.label;
  };

  const activeStudentNames = useMemo(() => {
    const names = new Set<string>();
    chromebooks.forEach((device) => {
      if (device.checkedOut && device.currentHolder) {
        names.add(device.currentHolder.trim().toLowerCase());
      }
    });
    return names;
  }, [chromebooks]);

  const studentOptions: SearchOption[] = (isReturnMode
    ? students.filter((student) => activeStudentNames.has(student.name.trim().toLowerCase()))
    : students
  ).map((student) => {
    const isActive = activeStudentNames.has(student.name.trim().toLowerCase());
    const disabled = !isReturnMode && isActive;
    return {
      id: student.id,
      label: student.name,
      disabled,
      meta: disabled ? "Already has a Chromebook" : undefined
    };
  });

  const classOptions: SearchOption[] = classes.map((item) => ({
    id: item.name,
    label: item.name
  }));

  const canUseVerification = settings.allowVerification && Boolean(currentStudent?.email);

  useEffect(() => {
    if (isReturnMode || !settings.allowVerification) {
      setUseVerificationEmail(false);
    }
  }, [isReturnMode, settings.allowVerification]);

  useEffect(() => {
    if (!currentStudent?.email) {
      setUseVerificationEmail(false);
    }
  }, [currentStudent?.email]);

  const deviceOptions: SearchOption[] = chromebooks.map((device) => ({
    id: device.id,
    label: deviceLabel(device, isReturnMode),
    disabled: deviceDisabled(device, isReturnMode),
    meta: device.assetTag ? `Tag ${device.assetTag}` : undefined
  }));

  const allowedDeviceId = currentStudent?.allowedDeviceId?.trim();
  const filteredDeviceOptions = useMemo(() => {
    if (isReturnMode || !allowedDeviceId) {
      return deviceOptions;
    }
    return deviceOptions.filter(
      (device) => device.id.toLowerCase() === allowedDeviceId.toLowerCase()
    );
  }, [deviceOptions, isReturnMode, allowedDeviceId]);

  const deviceEmptyLabel =
    !isReturnMode && allowedDeviceId ? "Assigned Chromebook not found" : "No Chromebooks found";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId) {
      pushToast("Please select your name to continue.", "error");
      return;
    }
    if (!isReturnMode && settings.requireClass && !className) {
      pushToast("Please select your class to continue.", "error");
      return;
    }
    if (!isReturnMode && !useVerificationEmail && !deviceId) {
      pushToast("Please select a Chromebook to continue.", "error");
      return;
    }
    setLoading(true);
    try {
      if (!isReturnMode && useVerificationEmail && settings.allowVerification) {
        const response = await api.requestVerification({
          studentId,
          studentName: currentStudent?.name ?? studentQuery,
          className: className || undefined
        });
        pushToast(response.message, "success");
      } else {
        const response = await api.checkout({
          action: isReturnMode ? "signout" : "register",
          studentId,
          studentName: currentStudent?.name ?? studentQuery,
          className: !isReturnMode ? className || undefined : undefined,
          deviceId: deviceId || undefined
        });
        const tone =
          response.status === "reassigned"
            ? "info"
            : response.status === "recorded"
            ? "info"
            : "success";
        pushToast(response.message, tone);
      }
      setStudentId("");
      setStudentQuery("");
      setClassName("");
      setClassQuery("");
      setDeviceId("");
      setDeviceQuery("");
      setAction(null);
      setStep(0);
      setUseVerificationEmail(false);
      await loadData();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Checkout failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleActionSelect = (mode: ActionMode) => {
    setAction(mode);
    setStep(0);
    setStudentId("");
    setStudentQuery("");
    setClassName("");
    setClassQuery("");
    setDeviceId("");
    setDeviceQuery("");
    setUseVerificationEmail(false);
  };

  const handleStudentPick = (student: SearchOption) => {
    setStudentId(student.id);
    setStudentQuery(student.label);
    setShowStudentList(false);
  };

  const handleStudentInput = (value: string) => {
    setStudentQuery(value);
    setStudentId("");
    setShowStudentList(true);
  };

  const handleClassPick = (option: SearchOption) => {
    setClassName(option.id);
    setClassQuery(option.label);
    setShowClassList(false);
  };

  const handleClassInput = (value: string) => {
    setClassQuery(value);
    setClassName("");
    setShowClassList(true);
  };

  const handleDevicePick = (option: SearchOption) => {
    setDeviceId(option.id);
    setDeviceQuery(option.label);
    setShowDeviceList(false);
  };

  const handleDeviceInput = (value: string) => {
    setDeviceQuery(value);
    setDeviceId("");
    setShowDeviceList(true);
  };

  const steps = useMemo(() => {
    if (isReturnMode) {
      return ["student"] as const;
    }
    const items: Array<"student" | "class" | "device"> = ["student"];
    if (settings.requireClass) {
      items.push("class");
    }
    items.push("device");
    return items;
  }, [isReturnMode, settings.requireClass]);

  const maxStep = steps.length - 1;

  useEffect(() => {
    setStep((prev) => Math.min(prev, maxStep));
  }, [maxStep]);

  const handleNext = () => {
    setStep((prev) => Math.min(prev + 1, maxStep));
  };

  const handleBack = () => {
    if (step === 0) {
      setAction(null);
      return;
    }
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const stepValid = useMemo(() => {
    const current = steps[step];
    if (current === "student") {
      return Boolean(studentId);
    }
    if (current === "class") {
      return Boolean(className);
    }
    if (current === "device") {
      return useVerificationEmail && settings.allowVerification ? true : Boolean(deviceId);
    }
    return false;
  }, [steps, step, studentId, className, deviceId, useVerificationEmail, settings.allowVerification]);

  return (
    <div className="kiosk-simple">
      {!action && (
        <div className="action-grid action-grid--simple">
          <button
            className={`action-card action-card--register ${action === "register" ? "is-active" : ""}`}
            type="button"
            onClick={() => handleActionSelect("register")}
          >
            <CheckIcon size={34} />
            <span>Register</span>
          </button>
          <button
            className={`action-card action-card--signout ${action === "signout" ? "is-active" : ""}`}
            type="button"
            onClick={() => handleActionSelect("signout")}
          >
            <ReturnIcon size={34} />
            <span>Sign out</span>
          </button>
        </div>
      )}

      {action && (
        <form onSubmit={handleSubmit} className="wizard wizard--simple">
          <div className="wizard-track" style={{ transform: `translateX(-${step * 100}%)` }}>
            <div className="wizard-slide">
              <h3 className="wizard-question">
                <UserIcon size={20} /> Select your name
              </h3>
              <SearchSelect
                query={studentQuery}
                value={studentId}
                placeholder="Start typing your name"
                emptyLabel="No matches"
                options={studentOptions}
                showList={showStudentList}
                onQueryChange={handleStudentInput}
                onSelect={handleStudentPick}
                onToggleList={setShowStudentList}
              />
            </div>

            {!isReturnMode && settings.requireClass && (
              <div className="wizard-slide">
                <h3 className="wizard-question">
                  <ClassIcon size={20} /> Choose your class
                </h3>
                <SearchSelect
                  query={classQuery}
                  value={className}
                  placeholder="Search class"
                  emptyLabel="No classes found"
                  options={classOptions}
                  showList={showClassList}
                  onQueryChange={handleClassInput}
                  onSelect={handleClassPick}
                  onToggleList={setShowClassList}
                />
              </div>
            )}

            {!isReturnMode && (
              <div className="wizard-slide">
                <h3 className="wizard-question">
                  <LaptopIcon size={20} />
                  Select Chromebook
                </h3>
                {settings.allowVerification && (
                  <label className={`toggle-line ${!canUseVerification ? "is-disabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={useVerificationEmail}
                      onChange={(event) => setUseVerificationEmail(event.target.checked)}
                      disabled={!canUseVerification}
                    />
                    <span>Send verification email instead of selecting a Chromebook</span>
                  </label>
                )}
                {settings.allowVerification && useVerificationEmail ? (
                  <div className="verification-banner">
                    <p>
                      We will email{" "}
                      <strong>{currentStudent?.email ?? "the student"}</strong> a verification link.
                      They should open it on their Chromebook to confirm the device.
                    </p>
                    {!canUseVerification && (
                      <p className="verification-note">
                        Add an email address in the admin panel to use verification.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <SearchSelect
                      query={deviceQuery}
                      value={deviceId}
                      placeholder="Search Chromebook"
                      emptyLabel={deviceEmptyLabel}
                      options={filteredDeviceOptions}
                      showList={showDeviceList}
                      onQueryChange={handleDeviceInput}
                      onSelect={handleDevicePick}
                      onToggleList={setShowDeviceList}
                    />
                    <p className="wizard-helper">
                      In-use or unavailable devices are greyed out.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="wizard-nav">
            <button className="nav-btn" type="button" onClick={handleBack}>
              Back
            </button>
            {isReturnMode ? (
              <button className="nav-btn nav-btn--primary" type="submit" disabled={!stepValid || loading}>
                {loading ? "Submitting..." : "Sign out"}
              </button>
            ) : step < maxStep ? (
              <button
                className="nav-btn nav-btn--primary"
                type="button"
                onClick={handleNext}
                disabled={!stepValid}
              >
                Next
              </button>
            ) : (
              <button className="nav-btn nav-btn--primary" type="submit" disabled={!stepValid || loading}>
                {loading
                  ? "Submitting..."
                  : useVerificationEmail && settings.allowVerification
                  ? "Send verification email"
                  : "Register"}
              </button>
            )}
          </div>
        </form>
      )}

      <section className="info-strip">
        <div className="info-card">
          <CheckIcon size={18} />
          <div>
            <p>Devices Available</p>
            <strong>{availableCount}</strong>
          </div>
        </div>
        <div className="info-card">
          <ClockIcon size={18} />
          <div>
            <p>Session Times</p>
            <div className="session-inline">
              {SESSION_TIMES.map((session) => (
                <span key={session.label} className="session-pill">
                  {session.time}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

