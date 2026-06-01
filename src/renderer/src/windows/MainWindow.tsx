import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { DesktopRecorder, MIN_ZOOM, MAX_ZOOM } from "../lib/recorder";
import { Onboarding } from "./Onboarding";
import type { Bounds, CaptureSource } from "../../../shared/types";

type Phase = "onboarding" | "setup" | "armed" | "recording" | "paused" | "done";

const ZOOM_STEP = 0.5;

const C = {
  bg: "#16181c",
  panel: "#1f2227",
  text: "#e8eaed",
  sub: "#9aa0a6",
  blue: "#5b9bff",
  red: "#ea4335",
  line: "#2d3137",
};

// What the web app chose, carried in the launch deep link. The desktop app is a
// pure recorder — it never asks for these.
interface RecordingMeta {
  title: string;
  presenterName: string;
  presenterHandle: string;
  script: string;
}

function parseDeepLink(url: string): RecordingMeta | null {
  try {
    const p = new URL(url).searchParams;
    return {
      title: p.get("title") ?? "",
      presenterName: p.get("presenter") ?? "",
      presenterHandle: p.get("handle") ?? "",
      script: p.get("script") ?? "",
    };
  } catch {
    return null;
  }
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const btn = (bg: string, color = "#fff"): CSSProperties => ({
  appearance: "none",
  border: "none",
  cursor: "pointer",
  borderRadius: 9999,
  padding: "9px 16px",
  fontWeight: 600,
  fontSize: 13,
  background: bg,
  color,
  fontFamily: "inherit",
});

const ghostBtn: CSSProperties = {
  ...btn("transparent", C.sub),
  border: `1px solid ${C.line}`,
};

export function MainWindow(): JSX.Element {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [sel, setSel] = useState<string>("");
  const [meta, setMeta] = useState<RecordingMeta>({
    title: "",
    presenterName: "",
    presenterHandle: "",
    script: "",
  });

  const [phase, setPhase] = useState<Phase>("onboarding");
  const [zoom, setZoom] = useState(1);
  const [auto, setAuto] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [camOpen, setCamOpen] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<DesktopRecorder | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const selSource = sources.find((s) => s.id === sel);

  // Load capture sources + watch for the camera bubble closing on its own.
  useEffect(() => {
    void window.api.getSources().then((list) => {
      setSources(list);
      const firstScreen = list.find((s) => s.kind === "screen") ?? list[0];
      if (firstScreen) setSel(firstScreen.id);
    });
    const off = window.api.onCameraClosed(() => setCamOpen(false));
    return off;
  }, []);

  // The recording's title/presenter/script come from the web app via the launch
  // deep link — read it on mount and keep listening for later ones.
  useEffect(() => {
    void window.api.getInitialDeepLink().then((url) => {
      const m = url ? parseDeepLink(url) : null;
      if (m) setMeta(m);
    });
    return window.api.onDeepLink((url) => {
      const m = parseDeepLink(url);
      if (m) setMeta(m);
    });
  }, []);

  // Push zoom/auto into the recorder live.
  useEffect(() => {
    recorderRef.current?.setZoom(zoom);
  }, [zoom]);
  useEffect(() => {
    recorderRef.current?.setAuto(auto);
  }, [auto]);

  // Mount the recorder's output canvas into the preview box.
  useEffect(() => {
    const host = previewRef.current;
    const rec = recorderRef.current;
    if (!host || !rec || phase === "setup" || phase === "done") return;
    const canvas = rec.canvas;
    canvas.style.height = "100%";
    canvas.style.width = "auto";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    host.appendChild(canvas);
    return () => {
      if (canvas.parentElement === host) host.removeChild(canvas);
    };
  }, [phase]);

  const startTimer = (): void => {
    if (timerRef.current != null) return;
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
  };
  const stopTimer = (): void => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const teardown = useCallback((): void => {
    stopTimer();
    void window.api.closeCamera();
    recorderRef.current?.dispose();
    recorderRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const start = async (): Promise<void> => {
    if (!sel) return;
    setError(null);
    try {
      const bounds: Bounds | null = selSource?.displayBounds ?? null;
      const rec = new DesktopRecorder(sel, bounds);
      await rec.init();
      rec.setZoom(zoom);
      rec.setAuto(auto);
      rec.startPreview();
      recorderRef.current = rec;
      setElapsed(0);
      setPhase("armed");
      await window.api.openCamera();
      setCamOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start capture.");
    }
  };

  const onRecord = (): void => {
    recorderRef.current?.startRecording();
    setElapsed(0);
    startTimer();
    setPhase("recording");
  };
  const onPause = (): void => {
    recorderRef.current?.pause();
    stopTimer();
    setPhase("paused");
  };
  const onResume = (): void => {
    recorderRef.current?.resume();
    startTimer();
    setPhase("recording");
  };
  const onStop = async (): Promise<void> => {
    stopTimer();
    const rec = recorderRef.current;
    if (rec) {
      try {
        const blob = await rec.stop();
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
      } catch {
        /* nothing captured */
      }
    }
    void window.api.closeCamera();
    setCamOpen(false);
    rec?.dispose();
    recorderRef.current = null;
    setPhase("done");
  };

  const toggleCamera = async (): Promise<void> => {
    if (camOpen) {
      await window.api.closeCamera();
      setCamOpen(false);
    } else {
      await window.api.openCamera();
      setCamOpen(true);
    }
  };

  const save = async (): Promise<void> => {
    if (!recordedBlob) return;
    const buf = await recordedBlob.arrayBuffer();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const res = await window.api.saveRecording(buf, `recording-${stamp}.webm`);
    if (res.saved) setError(null);
  };

  const reset = (): void => {
    teardown();
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setZoom(1);
    setElapsed(0);
    setPhase("setup");
  };

  const zoomIn = (): void => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = (): void => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)));

  const wrap: CSSProperties = {
    height: "100vh",
    overflowY: "auto",
    background: C.bg,
    color: C.text,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };
  const label: CSSProperties = { fontSize: 11, fontWeight: 700, color: C.sub, letterSpacing: "0.06em" };

  if (phase === "onboarding") {
    return <Onboarding onDone={() => setPhase("setup")} />;
  }

  return (
    <div style={wrap}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>OpenCraft Recorder</div>
      <div style={{ fontSize: 12, color: C.sub, marginTop: -6 }}>
        This window & the camera bubble are hidden from any screen recording.
      </div>

      {error && (
        <div style={{ background: "#3a1f1f", color: "#ffb4ab", borderRadius: 8, padding: 10, fontSize: 12 }}>
          {error}
        </div>
      )}

      {phase === "setup" && (
        <>
          {/* Read-only — the web app chose this. No forms here. */}
          <div style={{ background: C.panel, borderRadius: 10, padding: 12 }}>
            <span style={label}>RECORDING</span>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
              {meta.title || "Untitled recording"}
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
              {meta.presenterName
                ? `${meta.presenterName}${meta.presenterHandle ? ` · ${meta.presenterHandle}` : ""}`
                : "Open from the web app to set the title & presenter"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={label}>CHOOSE WHAT TO RECORD</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 220, overflowY: "auto" }}>
              {sources.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSel(s.id)}
                  style={{
                    appearance: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 4,
                    background: C.panel,
                    border: `2px solid ${sel === s.id ? C.blue : C.line}`,
                    borderRadius: 8,
                    color: C.text,
                  }}
                >
                  <img src={s.thumbnail} alt={s.name} style={{ width: "100%", borderRadius: 4, display: "block" }} />
                  <div style={{ fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.kind === "screen" ? "🖥 " : "🪟 "}
                    {s.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button style={btn(C.blue)} onClick={() => void start()} disabled={!sel}>
            Start — open recorder & camera bubble
          </button>
        </>
      )}

      {(phase === "armed" || phase === "recording" || phase === "paused") && (
        <>
          {/* Live composite preview */}
          <div
            ref={previewRef}
            style={{
              height: "38vh",
              minHeight: 220,
              background: "#000",
              borderRadius: 10,
              overflow: "hidden",
            }}
          />

          {/* Timer + zoom */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: phase === "recording" ? C.red : phase === "paused" ? C.sub : "#3a3f46",
              }}
            />
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 18, fontWeight: 700 }}>
              {fmtClock(elapsed)}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <button style={ghostBtn} onClick={zoomOut} aria-label="Zoom out">−</button>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, minWidth: 40, textAlign: "center" }}>
                {zoom.toFixed(1)}×
              </span>
              <button style={ghostBtn} onClick={zoomIn} aria-label="Zoom in">+</button>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.sub }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Cursor-follow auto-zoom
          </label>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {phase === "armed" && (
              <button style={{ ...btn(C.red), flex: 1 }} onClick={onRecord}>● Record</button>
            )}
            {phase === "recording" && (
              <button style={{ ...btn(C.panel, C.text), flex: 1 }} onClick={onPause}>❚❚ Pause</button>
            )}
            {phase === "paused" && (
              <button style={{ ...btn(C.red), flex: 1 }} onClick={onResume}>● Resume</button>
            )}
            {(phase === "recording" || phase === "paused") && (
              <button style={{ ...btn(C.blue), flex: 1 }} onClick={() => void onStop()}>■ Stop</button>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...ghostBtn, flex: 1 }} onClick={() => void toggleCamera()}>
              {camOpen ? "Hide camera bubble" : "Show camera bubble"}
            </button>
            {phase === "armed" && (
              <button style={ghostBtn} onClick={reset}>Cancel</button>
            )}
          </div>

          {/* Teleprompter — only when the web app sent a script. */}
          {meta.script && (
            <div
              style={{
                flex: 1,
                minHeight: 120,
                overflowY: "auto",
                background: C.panel,
                borderRadius: 10,
                padding: 12,
                fontSize: 15,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {meta.script}
            </div>
          )}
        </>
      )}

      {phase === "done" && (
        <>
          <div style={{ ...label, color: "#7ee2a8" }}>RECORDING READY</div>
          {recordedUrl && (
            <video
              src={recordedUrl}
              controls
              style={{ width: "100%", borderRadius: 10, background: "#000", aspectRatio: "9 / 16" }}
            />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btn(C.blue), flex: 1 }} onClick={() => void save()} disabled={!recordedBlob}>
              Save…
            </button>
            <button style={ghostBtn} onClick={reset}>Record again</button>
          </div>
        </>
      )}
    </div>
  );
}
