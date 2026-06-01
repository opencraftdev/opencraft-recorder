import { useEffect, useState } from "react";
import { popup, popupLabel, G, type DraggableCSS } from "../theme";
import type { BusMessage, SessionPhase } from "../../../shared/types";

type CmdAction = "record" | "pause" | "resume" | "stop" | "zoomIn" | "zoomOut" | "toggleAuto";

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function pill(bg: string): DraggableCSS {
  return {
    WebkitAppRegion: "no-drag",
    appearance: "none",
    border: "none",
    cursor: "pointer",
    borderRadius: 9999,
    padding: "9px 0",
    width: "100%",
    fontWeight: 700,
    fontSize: 12,
    color: "#fff",
    background: bg,
    fontFamily: G.font,
  };
}

const zBtn: DraggableCSS = {
  WebkitAppRegion: "no-drag",
  appearance: "none",
  border: "1px solid rgba(255,255,255,0.25)",
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  cursor: "pointer",
  width: 28,
  height: 28,
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
  fontFamily: G.font,
};

const closeBtn: DraggableCSS = {
  WebkitAppRegion: "no-drag",
  appearance: "none",
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.6)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: 2,
};

// The control popup: pause / stop / record + a small zoom control. It drives the
// engine (Screen popup) over the bus and reflects the state the engine reports.
export function ControlWindow(): JSX.Element {
  const [phase, setPhase] = useState<SessionPhase>("armed");
  const [elapsed, setElapsed] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(
    () =>
      window.api.busOn((msg: BusMessage) => {
        if (msg.type === "state") {
          setPhase(msg.phase);
          setElapsed(msg.elapsed);
          setZoom(msg.zoom);
        }
      }),
    [],
  );

  const cmd = (action: CmdAction): void => window.api.busSend({ type: "cmd", action });

  const recording = phase === "recording";

  return (
    <div style={{ ...popup, padding: 10, gap: 10, alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={popupLabel}>Control</span>
        <button style={closeBtn} onClick={() => void window.api.endSession()} aria-label="End">
          ✕
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: recording ? G.red : phase === "paused" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)",
          }}
        />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 16, fontWeight: 700 }}>
          {fmtClock(elapsed)}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {phase === "armed" && (
          <button style={pill(G.red)} onClick={() => cmd("record")}>
            ● Record
          </button>
        )}
        {recording && (
          <button style={pill("rgba(255,255,255,0.16)")} onClick={() => cmd("pause")}>
            ❚❚ Pause
          </button>
        )}
        {phase === "paused" && (
          <button style={pill(G.red)} onClick={() => cmd("resume")}>
            ● Resume
          </button>
        )}
        {(recording || phase === "paused") && (
          <button style={pill(G.blue)} onClick={() => cmd("stop")}>
            ■ Stop
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <button style={zBtn} onClick={() => cmd("zoomOut")} aria-label="Zoom out">
          −
        </button>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, minWidth: 34, textAlign: "center" }}>
          {zoom.toFixed(1)}×
        </span>
        <button style={zBtn} onClick={() => cmd("zoomIn")} aria-label="Zoom in">
          +
        </button>
      </div>
    </div>
  );
}
