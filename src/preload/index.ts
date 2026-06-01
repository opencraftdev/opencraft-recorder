import { contextBridge, ipcRenderer } from "electron";
import type {
  BusMessage,
  CursorInfo,
  Permissions,
  PrimarySource,
  RecorderApi,
  SaveResult,
} from "../shared/types";

const api: RecorderApi = {
  getCursor: (): Promise<CursorInfo> => ipcRenderer.invoke("get-cursor"),
  getPrimarySource: (): Promise<PrimarySource | null> => ipcRenderer.invoke("get-primary-source"),
  saveRecording: (data: ArrayBuffer, suggestedName: string): Promise<SaveResult> =>
    ipcRenderer.invoke("save-recording", data, suggestedName),

  startSession: (): Promise<void> => ipcRenderer.invoke("start-session"),
  endSession: (): Promise<void> => ipcRenderer.invoke("end-session"),

  busSend: (msg: BusMessage): void => ipcRenderer.send("bus", msg),
  busOn: (cb: (msg: BusMessage) => void): (() => void) => {
    const handler = (_e: unknown, msg: BusMessage): void => cb(msg);
    ipcRenderer.on("bus", handler);
    return () => ipcRenderer.off("bus", handler);
  },

  getInitialDeepLink: (): Promise<string | null> => ipcRenderer.invoke("get-initial-deep-link"),
  onDeepLink: (cb: (url: string) => void): (() => void) => {
    const handler = (_e: unknown, url: string): void => cb(url);
    ipcRenderer.on("deep-link", handler);
    return () => ipcRenderer.off("deep-link", handler);
  },

  getPermissions: (): Promise<Permissions> => ipcRenderer.invoke("get-permissions"),
  requestCameraMic: (): Promise<boolean> => ipcRenderer.invoke("request-camera-mic"),
  openScreenSettings: (): Promise<void> => ipcRenderer.invoke("open-screen-settings"),
  relaunchApp: (): Promise<void> => ipcRenderer.invoke("relaunch-app"),
};

contextBridge.exposeInMainWorld("api", api);
