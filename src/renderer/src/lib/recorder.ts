import { VerticalCompositor, OUTPUT_WIDTH, OUTPUT_HEIGHT, clamp, type Focus } from "../compositor";
import type { Bounds } from "../../../shared/types";

// Renderer-side capture + compositing + recording for the desktop app.
//  • screen: Electron desktop capture (the chosen source id)
//  • camera: getUserMedia (optional)
//  • compositor: COVER fit, so zoom + cursor-follow pan give the Screen-Studio
//    look. Zoom can be driven manually or auto-follow the global cursor (polled
//    from the main process — the capability the browser never had).

const FPS = 30;
const VIDEO_BITS_PER_SECOND = 4_500_000;
const CURSOR_POLL_MS = 50;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

export class DesktopRecorder {
  readonly canvas = document.createElement("canvas");
  private screenStream: MediaStream | null = null;
  private camStream: MediaStream | null = null;
  private screenVideo: HTMLVideoElement | null = null;
  private camVideo: HTMLVideoElement | null = null;
  private readonly compositor = new VerticalCompositor({ screenFit: "cover" });

  private targetZoom = 1;
  private auto = false;
  private targetFocus: Focus = { x: 0.5, y: 0.5 };

  private raf = 0;
  private cursorTimer: number | null = null;
  private polling = false;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;

  constructor(
    private readonly sourceId: string,
    private readonly displayBounds: Bounds | null,
  ) {}

  get cameraStream(): MediaStream | null {
    return this.camStream;
  }
  // The raw screen capture, for the live "screen record" preview popup.
  get screenPreview(): MediaStream | null {
    return this.screenStream;
  }
  get hasCam(): boolean {
    return Boolean(this.camVideo && this.camVideo.videoWidth > 0);
  }

  async init(): Promise<void> {
    const screen = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: this.sourceId,
          maxWidth: 3840,
          maxHeight: 2160,
          maxFrameRate: FPS,
        },
      } as unknown as MediaTrackConstraints,
    });
    this.screenStream = screen;

    try {
      this.camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: true,
      });
    } catch {
      this.camStream = null; // screen-only is fine
    }

    const sv = document.createElement("video");
    sv.srcObject = screen;
    sv.muted = true;
    sv.playsInline = true;
    await sv.play();
    this.screenVideo = sv;

    if (this.camStream && this.camStream.getVideoTracks().length) {
      const cv = document.createElement("video");
      cv.srcObject = this.camStream;
      cv.muted = true;
      cv.playsInline = true;
      await cv.play();
      this.camVideo = cv;
    }

    this.canvas.width = OUTPUT_WIDTH;
    this.canvas.height = OUTPUT_HEIGHT;
  }

  setZoom(z: number): void {
    this.targetZoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (!on) {
      this.targetFocus = { x: 0.5, y: 0.5 };
      if (this.cursorTimer != null) {
        window.clearInterval(this.cursorTimer);
        this.cursorTimer = null;
      }
    } else if (this.cursorTimer == null) {
      this.cursorTimer = window.setInterval(() => void this.pollCursor(), CURSOR_POLL_MS);
    }
  }

  // Map the global cursor into 0..1 over the captured display, for the focus.
  private async pollCursor(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const c = await window.api.getCursor();
      const b = this.displayBounds ?? c.bounds;
      this.targetFocus = {
        x: clamp((c.x - b.x) / b.width, 0, 1),
        y: clamp((c.y - b.y) / b.height, 0, 1),
      };
    } catch {
      /* ignore a dropped poll */
    } finally {
      this.polling = false;
    }
  }

  startPreview(): void {
    if (this.raf) return;
    const loop = (): void => {
      this.drawOnce();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private drawOnce(): void {
    const sv = this.screenVideo;
    if (!sv || sv.videoWidth === 0) return;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const cam = this.hasCam ? this.camVideo : null;
    this.compositor.drawFrame(ctx, {
      screen: sv,
      screenWidth: sv.videoWidth,
      screenHeight: sv.videoHeight,
      cam,
      camWidth: cam?.videoWidth,
      camHeight: cam?.videoHeight,
      focus: this.targetFocus,
      zoom: this.targetZoom,
    });
  }

  startRecording(): void {
    const canvasStream = this.canvas.captureStream(FPS);
    const audioCtx = new AudioContext();
    this.audioCtx = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();
    let mixedAny = false;

    const camAudio = this.camStream?.getAudioTracks() ?? [];
    if (camAudio.length) {
      audioCtx.createMediaStreamSource(new MediaStream([camAudio[0]])).connect(dest);
      mixedAny = true;
    }

    const tracks = [
      ...canvasStream.getVideoTracks(),
      ...(mixedAny ? dest.stream.getAudioTracks() : []),
    ];
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: pickMimeType(),
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    });
    this.chunks = [];
    recorder.ondataavailable = (e): void => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.start(1000);
    this.recorder = recorder;
  }

  pause(): void {
    if (this.recorder?.state === "recording") this.recorder.pause();
  }
  resume(): void {
    if (this.recorder?.state === "paused") this.recorder.resume();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const r = this.recorder;
      if (!r || r.state === "inactive") {
        reject(new Error("Not recording"));
        return;
      }
      r.onstop = (): void => resolve(new Blob(this.chunks, { type: "video/webm" }));
      r.stop();
    });
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.cursorTimer != null) window.clearInterval(this.cursorTimer);
    this.cursorTimer = null;
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.camStream?.getTracks().forEach((t) => t.stop());
    if (this.audioCtx && this.audioCtx.state !== "closed") this.audioCtx.close().catch(() => {});
    this.audioCtx = null;
    this.recorder = null;
    this.screenVideo = null;
    this.camVideo = null;
  }
}
