import { useEffect, useReducer, useRef } from "react";
import { DesktopRecorder, MIN_ZOOM, MAX_ZOOM } from "../lib/recorder";
import { popup, popupLabel, G } from "../theme";
import type { SessionPhase } from "../../../shared/types";

const ZOOM_STEP = 0.5;

// The recording engine. It captures the primary screen + camera, composites to a
// 1080×1920 canvas and records — driven entirely by commands from the Control
// popup over the bus, and it broadcasts state back. It also shows the live screen
// as the "Screen record" preview.
export function ScreenWindow(): JSX.Element {
  const recRef = useRef<DesktopRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const errRef = useRef<string | null>(null);

  const phaseRef = useRef<SessionPhase>("armed");
  const elapsedRef = useRef(0);
  const zoomRef = useRef(1);
  const autoRef = useRef(true);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const broadcast = (): void =>
    window.api.busSend({
      type: "state",
      phase: phaseRef.current,
      elapsed: elapsedRef.current,
      zoom: zoomRef.current,
      auto: autoRef.current,
    });

  const startTimer = (): void => {
    if (timerRef.current != null) return;
    timerRef.current = window.setInterval(() => {
      elapsedRef.current += 1;
      rerender();
      broadcast();
    }, 1000);
  };
  const stopTimer = (): void => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Capture on mount.
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const src = await window.api.getPrimarySource();
        if (!src) {
          errRef.current = "No screen available to capture.";
          rerender();
          return;
        }
        const rec = new DesktopRecorder(src.id, src.displayBounds);
        await rec.init();
        if (disposed) {
          rec.dispose();
          return;
        }
        rec.setZoom(zoomRef.current);
        rec.setAuto(autoRef.current);
        rec.startPreview();
        recRef.current = rec;
        if (videoRef.current && rec.screenPreview) {
          videoRef.current.srcObject = rec.screenPreview;
          void videoRef.current.play();
        }
        broadcast();
      } catch (e) {
        errRef.current = e instanceof Error ? e.message : "Could not start capture.";
        rerender();
      }
    })();
    return () => {
      disposed = true;
      stopTimer();
      recRef.current?.dispose();
      recRef.current = null;
    };
  }, []);

  const finalize = async (): Promise<void> => {
    const rec = recRef.current;
    stopTimer();
    if (rec) {
      try {
        const blob = await rec.stop();
        const buf = await blob.arrayBuffer();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const res = await window.api.saveRecording(buf, `recording-${stamp}.webm`);
        window.api.busSend({ type: "saved", ok: res.saved });
      } catch {
        window.api.busSend({ type: "saved", ok: false });
      }
    }
    phaseRef.current = "done";
    broadcast();
    void window.api.endSession();
  };

  // Commands from the Control popup.
  useEffect(
    () =>
      window.api.busOn((msg) => {
        if (msg.type !== "cmd") return;
        const rec = recRef.current;
        if (!rec) return;
        switch (msg.action) {
          case "record":
            rec.startRecording();
            elapsedRef.current = 0;
            phaseRef.current = "recording";
            startTimer();
            break;
          case "pause":
            rec.pause();
            stopTimer();
            phaseRef.current = "paused";
            break;
          case "resume":
            rec.resume();
            startTimer();
            phaseRef.current = "recording";
            break;
          case "stop":
            void finalize();
            return;
          case "zoomIn":
            zoomRef.current = Math.min(MAX_ZOOM, +(zoomRef.current + ZOOM_STEP).toFixed(2));
            rec.setZoom(zoomRef.current);
            break;
          case "zoomOut":
            zoomRef.current = Math.max(MIN_ZOOM, +(zoomRef.current - ZOOM_STEP).toFixed(2));
            rec.setZoom(zoomRef.current);
            break;
          case "toggleAuto":
            autoRef.current = !autoRef.current;
            rec.setAuto(autoRef.current);
            break;
        }
        rerender();
        broadcast();
      }),
    [],
  );

  const recording = phaseRef.current === "recording";

  return (
    <div style={popup}>
      <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: recording ? G.red : "rgba(255,255,255,0.4)",
          }}
        />
        <span style={popupLabel}>Screen record</span>
      </div>
      <div style={{ flex: 1, position: "relative", background: "#000" }}>
        {errRef.current ? (
          <div style={{ color: "#ffb4ab", fontSize: 11, padding: 10 }}>{errRef.current}</div>
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </div>
    </div>
  );
}
