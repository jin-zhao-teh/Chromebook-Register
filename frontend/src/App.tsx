import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import CheckoutPage from "./pages/CheckoutPage";
import AdminPage from "./pages/AdminPage";
import VerificationPage from "./pages/VerificationPage";

const useFullscreenGuard = () => {
  useEffect(() => {
    const requestFullscreen = () => {
      if (document.fullscreenElement) {
        return;
      }
      const element = document.documentElement as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      };
      element.requestFullscreen?.().catch(() => {
        // Browser may block without a user gesture.
      });
    };

    const handleKeydown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blocked = ["escape", "f11", "f5"].includes(key);
      const ctrlBlocked = event.ctrlKey && ["l", "r", "w", "n", "t", "p", "s", "o", "f", "tab"].includes(key);
      const ctrlShiftBlocked = event.ctrlKey && event.shiftKey && ["i", "j", "c", "r"].includes(key);
      const metaBlocked = event.metaKey && ["l", "r", "w", "n", "t", "q", "tab"].includes(key);
      const altBlocked = event.altKey && ["f4", "tab"].includes(key);
      if (blocked || ctrlBlocked || ctrlShiftBlocked || metaBlocked || altBlocked) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleInteraction = () => requestFullscreen();
    const handleFullscreenChange = () => requestFullscreen();

    requestFullscreen();
    document.addEventListener("click", handleInteraction, { capture: true });
    document.addEventListener("touchstart", handleInteraction, { capture: true });
    document.addEventListener("keydown", handleKeydown, { capture: true });
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("click", handleInteraction, { capture: true } as EventListenerOptions);
      document.removeEventListener("touchstart", handleInteraction, { capture: true } as EventListenerOptions);
      document.removeEventListener("keydown", handleKeydown, { capture: true } as EventListenerOptions);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);
};

export default function App() {
  useFullscreenGuard();

  return (
    <div className="app-shell">
      <main className="kiosk-main">
        <Routes>
          <Route path="/" element={<CheckoutPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/verify" element={<VerificationPage />} />
        </Routes>
      </main>
    </div>
  );
}
