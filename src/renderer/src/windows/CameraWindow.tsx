import { useEffect, useRef } from "react";
import { popup, popupLabel } from "../theme";

// The camera preview popup — its own content-protected, draggable spotlight
// window. Opens its own webcam stream for display (the engine captures the
// camera separately for the actual recording).
export function CameraWindow(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false })
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
      .catch(() => {});
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={popup}>
      <div style={{ padding: "6px 10px" }}>
        <span style={popupLabel}>Camera</span>
      </div>
      <div style={{ flex: 1, background: "#000" }}>
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    </div>
  );
}
