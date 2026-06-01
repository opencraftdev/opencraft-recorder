import { useCallback, useEffect, useRef, useState } from "react";
import { G, page, card, primaryBtn, textBtn, outlineBtn } from "../theme";
import type { Permissions, PermissionStatus } from "../../../shared/types";

// First-run checklist: guides the user to grant Camera/Mic and Screen Recording
// so they never have to touch System Settings blind (or run terminal commands).
// Statuses refresh live (on focus + a short poll) as the user flips toggles.

function chip(s: PermissionStatus): { label: string; color: string } {
  if (s === "granted") return { label: "✓ Allowed", color: G.green };
  if (s === "denied" || s === "restricted") return { label: "✕ Blocked", color: G.red };
  return { label: "Not set", color: G.textFaint };
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
  const granted = status === "granted";
  return (
    <div
      style={{
        ...card,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderColor: granted ? "rgba(30,142,62,0.4)" : G.cardBorder,
        background: granted ? "#F2FBF5" : G.card,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: G.text }}>{title}</div>
        <div style={{ fontSize: 12, color: G.textSub, marginTop: 2 }}>{desc}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: c.color, marginTop: 6 }}>{c.label}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

const smallPrimary = { ...primaryBtn(), padding: "8px 16px", fontSize: 13 };
const smallOutline = { ...outlineBtn, padding: "7px 14px", fontSize: 13 };

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
    <div style={{ ...page, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 600, color: G.text }}>Let&apos;s set up recording</div>
        <div style={{ fontSize: 13, color: G.textSub, marginTop: 4 }}>
          Grant these two permissions once — that&apos;s all the setup there is.
        </div>
      </div>

      <Row title="Camera & microphone" desc="So your webcam and voice are in the video." status={camMic}>
        {camMic === "granted" ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: G.green }}>Done</span>
        ) : (
          <button style={smallPrimary} onClick={() => void window.api.requestCameraMic().then(refresh)}>
            Enable
          </button>
        )}
      </Row>

      <Row title="Screen recording" desc="So the app can capture your screen." status={scr}>
        {scr === "granted" ? (
          <span style={{ fontSize: 12, fontWeight: 700, color: G.green }}>Done</span>
        ) : (
          <>
            <button style={smallPrimary} onClick={() => void window.api.openScreenSettings()}>
              Open settings
            </button>
            <button style={smallOutline} onClick={() => void window.api.relaunchApp()}>
              Restart app
            </button>
          </>
        )}
      </Row>

      {scr !== "granted" && (
        <div style={{ fontSize: 12, color: G.textSub, lineHeight: 1.6 }}>
          In the window that opens, turn on <strong>OpenCraft Recorder</strong> under Screen
          Recording, then click <strong>Restart app</strong> — macOS only applies it after a restart.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <button style={{ ...primaryBtn(!ready), flex: 1 }} disabled={!ready} onClick={onDone}>
          Continue
        </button>
        <button style={textBtn} onClick={onDone}>
          Skip
        </button>
      </div>
    </div>
  );
}
