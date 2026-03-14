import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ChromebookStatus } from "../api";
import { CheckIcon, LaptopIcon, UserIcon } from "../components/Icons";
import SearchSelect, { SearchOption } from "../components/SearchSelect";
import { ToastStack, useToasts } from "../components/Toast";

type VerificationDetails = {
  studentName: string;
  className: string;
  expiresAt: string;
  verified: boolean;
  allowedDeviceId?: string;
};

export default function VerificationPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [details, setDetails] = useState<VerificationDetails | null>(null);
  const [chromebooks, setChromebooks] = useState<ChromebookStatus[]>([]);
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const { toasts, pushToast, dismissToast } = useToasts();

  const deviceInfo = useMemo(() => {
    if (typeof navigator === "undefined") {
      return null;
    }
    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    const platform = uaData?.platform ?? navigator.platform;
    return `${platform} · ${navigator.userAgent}`;
  }, []);

  useEffect(() => {
    if (!token) {
      setPageError("Missing verification token.");
      setLoadingData(false);
      return;
    }

    const load = async () => {
      try {
        const [detailsResponse, chromebooksResponse] = await Promise.all([
          api.getVerification(token),
          api.getChromebooks()
        ]);
        setDetails(detailsResponse);
        setChromebooks(chromebooksResponse.chromebooks);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : "Unable to load verification.");
      } finally {
        setLoadingData(false);
      }
    };

    load().catch(() => {
      setPageError("Unable to load verification.");
      setLoadingData(false);
    });
  }, [token]);

  useEffect(() => {
    const currentDevice = chromebooks.find((device) => device.id === deviceId);
    if (currentDevice?.label) {
      setDeviceQuery(currentDevice.label);
    }
  }, [chromebooks, deviceId]);

  const deviceDisabled = (device: ChromebookStatus) => device.status !== "available";

  const deviceLabel = (device: ChromebookStatus) => {
    if (device.checkedOut) {
      return `${device.label} - In use`;
    }
    if (device.status !== "available") {
      return `${device.label} - ${device.status}`;
    }
    return device.label;
  };

  const deviceOptions: SearchOption[] = chromebooks.map((device) => ({
    id: device.id,
    label: deviceLabel(device),
    disabled: deviceDisabled(device),
    meta: device.assetTag ? `Tag ${device.assetTag}` : undefined
  }));

  const allowedDeviceId = details?.allowedDeviceId?.trim();
  const filteredDeviceOptions = useMemo(() => {
    if (!allowedDeviceId) {
      return deviceOptions;
    }
    return deviceOptions.filter(
      (device) => device.id.toLowerCase() === allowedDeviceId.toLowerCase()
    );
  }, [deviceOptions, allowedDeviceId]);

  const deviceEmptyLabel = allowedDeviceId ? "Assigned Chromebook not found" : "No Chromebooks found";

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

  const handleConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!deviceId) {
      pushToast("Select your Chromebook to finish verification.", "error");
      return;
    }
    if (!token) {
      pushToast("Missing verification token.", "error");
      return;
    }
    setLoading(true);
    try {
      const response = await api.confirmVerification(token, deviceId);
      const tone = response.status === "reassigned" ? "info" : "success";
      pushToast(response.message, tone);
      setDeviceId("");
      setDeviceQuery("");
      setShowDeviceList(false);
      setDetails((prev) => (prev ? { ...prev, verified: true } : prev));
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Verification failed.", "error");
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="verification-page">
        <section className="card verification-card">
          <h2>Loading verification...</h2>
        </section>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="verification-page">
        <section className="card verification-card">
          <h2>Verification Error</h2>
          <p>{pageError}</p>
        </section>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="verification-page">
        <section className="card verification-card">
          <h2>Verification not found.</h2>
        </section>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="verification-page">
      <section className="card verification-card">
        <div className="card-header">
          <span className="icon-badge">
            <LaptopIcon size={22} />
          </span>
          <div>
            <h2>Chromebook Verification</h2>
            <p>Confirm the Chromebook you picked up.</p>
          </div>
        </div>

        <div className="verification-meta">
          <div className="verification-chip">
            <UserIcon size={16} />
            <span>{details.studentName}</span>
          </div>
          <div className="verification-chip">
            <CheckIcon size={16} />
            <span>{details.className}</span>
          </div>
          <div className="verification-chip">
            <span>Expires {new Date(details.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </div>
        </div>

        {details.verified ? (
          <div className="verification-banner">
            <p>Your verification link has already been used.</p>
          </div>
        ) : (
          <form onSubmit={handleConfirm} className="verification-form">
            <h3 className="wizard-question">
              <LaptopIcon size={18} /> Select your Chromebook
            </h3>
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
            <p className="wizard-helper">In-use or unavailable devices are greyed out.</p>

            {deviceInfo && (
              <div className="device-info">
                <p>Detected device info</p>
                <span>{deviceInfo}</span>
              </div>
            )}

            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Confirm Chromebook"}
            </button>
          </form>
        )}
      </section>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
