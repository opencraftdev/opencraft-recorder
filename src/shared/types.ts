// Types shared by the main process, the preload bridge and the renderer.
// No Electron import here, so the renderer can use them without pulling Electron
// into the web bundle.

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureSource {
  id: string;
  name: string;
  kind: "screen" | "window";
  thumbnail: string;
  displayBounds: Bounds | null;
}

export interface CursorInfo {
  x: number;
  y: number;
  bounds: Bounds;
}

export type SaveResult = { saved: false } | { saved: true; filePath: string };

// macOS privacy permission status (matches Electron's getMediaAccessStatus).
export type PermissionStatus = "not-determined" | "granted" | "denied" | "restricted" | "unknown";

export interface Permissions {
  camera: PermissionStatus;
  microphone: PermissionStatus;
  screen: PermissionStatus;
}

export interface RecorderApi {
  getSources(): Promise<CaptureSource[]>;
  getCursor(): Promise<CursorInfo>;
  openCamera(): Promise<void>;
  closeCamera(): Promise<void>;
  saveRecording(data: ArrayBuffer, suggestedName: string): Promise<SaveResult>;
  onCameraClosed(cb: () => void): () => void;
  // The deep link the app was launched/focused with (web → app), e.g.
  // opencraft-recorder://record?title=…&presenter=…
  getInitialDeepLink(): Promise<string | null>;
  onDeepLink(cb: (url: string) => void): () => void;
  // Onboarding: macOS camera / mic / screen-recording permissions.
  getPermissions(): Promise<Permissions>;
  requestCameraMic(): Promise<boolean>;
  openScreenSettings(): Promise<void>;
  relaunchApp(): Promise<void>;
}
