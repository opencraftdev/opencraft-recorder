// Types shared by the main process, the preload bridge and the renderer.
// No Electron import here, so the renderer can use them without pulling Electron
// into the web bundle.

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CursorInfo {
  x: number;
  y: number;
  bounds: Bounds;
}

// The primary display as a capture source.
export interface PrimarySource {
  id: string;
  displayBounds: Bounds | null;
}

export type SaveResult = { saved: false } | { saved: true; filePath: string };

export type PermissionStatus = "not-determined" | "granted" | "denied" | "restricted" | "unknown";

export interface Permissions {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  screen: PermissionStatus;
}

export type SessionPhase = "armed" | "recording" | "paused" | "done";

// Messages on the cross-window bus. Control popup → engine (commands); engine →
// everyone (state).
export type BusMessage =
  | { type: "cmd"; action: "record" | "pause" | "resume" | "stop" | "zoomIn" | "zoomOut" | "toggleAuto" }
  | { type: "state"; phase: SessionPhase; elapsed: number; zoom: number; auto: boolean }
  | { type: "saved"; ok: boolean };

export interface RecorderApi {
  // Capture
  getCursor(): Promise<CursorInfo>;
  getPrimarySource(): Promise<PrimarySource | null>;
  saveRecording(data: ArrayBuffer, suggestedName: string): Promise<SaveResult>;
  // Session (multi-popup) lifecycle
  startSession(): Promise<void>;
  endSession(): Promise<void>;
  // Cross-window bus
  busSend(msg: BusMessage): void;
  busOn(cb: (msg: BusMessage) => void): () => void;
  // Deep link (web → app)
  getInitialDeepLink(): Promise<string | null>;
  onDeepLink(cb: (url: string) => void): () => void;
  // Onboarding permissions
  getPermissions(): Promise<Permissions>;
  requestCameraMic(): Promise<boolean>;
  openScreenSettings(): Promise<void>;
  relaunchApp(): Promise<void>;
}
