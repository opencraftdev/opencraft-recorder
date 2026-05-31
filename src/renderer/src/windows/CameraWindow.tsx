import { useEffect, useRef, type CSSProperties } from "react";

// Electron-only CSS to make a frameless window draggable; not in React's types.
type DraggableCSS = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" };

// The floating camera bubble — its own content-protected, transparent, always-
// on-top window (created by the main process). Circular, draggable by the OS via
// the -webkit-app-region drag style. It opens its own camera stream for preview.
export function CameraWindow(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 720, height: 720, facingMode: "user" }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch(() => {
        /* no camera — window just shows empty */
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const bubbleStyle: DraggableCSS = {
    width: "100vw",
    height: "100vh",
    borderRadius: "50%",
    overflow: "hidden",
    background: "#000",
    border: "3px solid rgba(255,255,255,0.85)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    // Lets you drag the frameless window by grabbing the bubble.
    WebkitAppRegion: "drag",
  };

  return (
    <div style={bubbleStyle as CSSProperties}>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </div>
  );
}
