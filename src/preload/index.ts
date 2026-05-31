import { contextBridge, ipcRenderer } from "electron";
import type { CaptureSource, CursorInfo, RecorderApi, SaveResult } from "../shared/types";

// The only surface the renderer can touch in the main process — a thin, typed
// wrapper around IPC channels.
const api: RecorderApi = {
  getSources: (): Promise<CaptureSource[]> => ipcRenderer.invoke("get-sources"),
  getCursor: (): Promise<CursorInfo> => ipcRenderer.invoke("get-cursor"),
  openCamera: (): Promise<void> => ipcRenderer.invoke("open-camera"),
  closeCamera: (): Promise<void> => ipcRenderer.invoke("close-camera"),
  saveRecording: (data: ArrayBuffer, suggestedName: string): Promise<SaveResult> =>
    ipcRenderer.invoke("save-recording", data, suggestedName),
  onCameraClosed: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on("camera-window-closed", handler);
    return () => ipcRenderer.off("camera-window-closed", handler);
  },
};

contextBridge.exposeInMainWorld("api", api);
