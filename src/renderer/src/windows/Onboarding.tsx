import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { Permissions, PermissionStatus } from "../../../shared/types";

// First-run checklist: guides the user to grant Camera/Mic and Screen Recording
// so they never have to touch System Settings blind (or run terminal commands).
// Statuses refresh live (on focus + a short poll) as the user flips toggles.

const C = {
  bg: "#16181c",
  panel: "#1f2227",
  text: "#e8eaed",
  sub: "#9aa0a6",
  blue: "#5b9bff",
  red: "#ea4335",
  green: "#7ee2a8",
  line: "#2d3137",
};

const btn = (bg: string, color = "#fff"): CSSProperties => ({
  appearance: "none",
  border: "none",
  cursor: "pointer",
  borderRadius: 9999,
  padding: "8px 14px",
  fontWeight: 600,
  fontSize: 13,
  background: bg,
  color,
  fontFamily: "inherit",
});

const ghostBtn: CSSProperties = { ...btn("transparent", C.text), border: `1px solid ${C.line}` };

function chip(s: PermissionStatus): { label: string; color: string } {
  if (s === "granted") return { label: "✓ Allowed", color: C.green };
  if (s === "denied" || s === "restricted") return { label: "✕ Blocked", color: C.red };
  return { label: "Not set", color: C.sub };
}

function Row({
  title,
  desc,
  status,
  children,
}: {
  title: string;
  desc: string;
  status: PermissionStatus;
  children: React.ReactNode;
}): JSX.Element {
  const c = chip(status);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: C.panel,
        border: `1px solid ${status === "granted" ? "rgba(126,226,168,0.4)" : C.line}`,
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{desc}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.color, marginTop: 6 }}>{c.label}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }): JSX.Element {
  const [perms, setPerms] = useState<Permissions | null>(null);
  const advanced = useRef(false);

  const refresh = useCallback(async () => {
    const p = await window.api.getPermissions();
    setPerms(p);
    return p;
  }, []);

  // Poll while onboarding is open + whenever the window regains focus (the user
  // coming back from System Settings).
  useEffect(() => {
    void refresh();
    const onFocus = (): void => void refresh();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(() => void refresh(), 2000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [refresh]);

  // Returning users with everything granted skip straight through.
  useEffect(() => {
    if (perms && !advanced.current && perms.camera === "granted" && perms.screen === "granted") {
      advanced.current = true;
      onDone();
    }
  }, [perms, onDone]);

  const cam = perms?.camera ?? "unknown";
  const mic = perms?.microphone ?? "unknown";
  const scr = perms?.screen ?? "unknown";
  const camMic: PermissionStatus =
    cam === "granted" && mic === "granted"
      ? "granted"
      : cam === "denied" || mic === "denied"
        ? "denied"
        : "not-determined";

  const ready = cam === "granted" && scr === "granted";

  return (
    <div
      style={{
        height: "100vh",
        overflowY: "auto",
        background: C.bg,
        color: C.text,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>Let&apos;s set up recording</div>
        <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>
          Grant these two permissions once — that&apos;s all the setup there is.
        </div>
      </div>

      <Row
        title="Camera & microphone"
        desc="So your webcam and voice are in the video."
        status={camMic}
      >
        {camMic === "granted" ? (
          <span style={{ fontSize: 12, color: C.green }}>Done</span>
        ) : (
          <button style={btn(C.blue)} onClick={() => void window.api.requestCameraMic().then(refresh)}>
            Enable
          </button>
        )}
      </Row>

      <Row
        title="Screen recording"
        desc="So the app can capture your screen."
        status={scr}
      >
        {scr === "granted" ? (
          <span style={{ fontSize: 12, color: C.green }}>Done</span>
        ) : (
          <>
            <button style={btn(C.blue)} onClick={() => void window.api.openScreenSettings()}>
              Open settings
            </button>
            <button style={ghostBtn} onClick={() => void window.api.relaunchApp()}>
              Restart app
            </button>
          </>
        )}
      </Row>

      {scr !== "granted" && (
        <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
          In the window that opens, turn on <strong>OpenCraft Recorder</strong> under Screen
          Recording, then click <strong>Restart app</strong> — macOS only applies it after a restart.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button
          style={{ ...btn(ready ? C.blue : "#33373d", ready ? "#fff" : C.sub), flex: 1, cursor: ready ? "pointer" : "default" }}
          disabled={!ready}
          onClick={onDone}
        >
          Continue
        </button>
        <button style={ghostBtn} onClick={onDone}>
          Skip
        </button>
      </div>
    </div>
  );
}
