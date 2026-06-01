import { app, BrowserWindow, ipcMain, desktopCapturer, screen, dialog } from "electron";
import { join } from "path";
import { writeFile } from "fs/promises";

// The native superpower this whole app exists for: setContentProtection(true)
// flags a window with the OS "exclude from capture" bit (NSWindowSharingNone on
// macOS, WDA_EXCLUDEFROMCAPTURE on Windows 11). The window stays fully visible on
// screen but is INVISIBLE to any screen recording — including a full-screen
// capture of any other app. That's what lets the floating popups never appear in
// the take, the thing the browser could never guarantee.

let mainWin: BrowserWindow | null = null;
let cameraWin: BrowserWindow | null = null;

const PRELOAD = join(__dirname, "../preload/index.js");

// In dev, electron-vite serves the renderer; in prod we load the built file.
// Each window renders a different route, chosen via the URL hash.
function loadRoute(win: BrowserWindow, hash: string): void {
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    void win.loadURL(`${devUrl}#${hash}`);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"), { hash });
  }
}

function createMainWindow(): void {
  mainWin = new BrowserWindow({
    width: 440,
    height: 760,
    show: false,
    title: "OpenCraft Recorder",
    backgroundColor: "#16181c",
    webPreferences: { preload: PRELOAD, sandbox: false },
  });
  // The control/script/setup window is itself content-protected so it can stay
  // open and readable during a full-screen take without being recorded.
  mainWin.setContentProtection(true);
  mainWin.on("ready-to-show", () => mainWin?.show());
  mainWin.on("closed", () => {
    mainWin = null;
    cameraWin?.close();
  });
  loadRoute(mainWin, "/main");
}

function createCameraWindow(): void {
  if (cameraWin && !cameraWin.isDestroyed()) {
    cameraWin.focus();
    return;
  }
  cameraWin = new BrowserWindow({
    width: 220,
    height: 220,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: { preload: PRELOAD, sandbox: false },
  });
  cameraWin.setContentProtection(true);
  // Float above full-screen apps too.
  cameraWin.setAlwaysOnTop(true, "screen-saver");
  cameraWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  cameraWin.on("ready-to-show", () => cameraWin?.show());
  cameraWin.on("closed", () => {
    cameraWin = null;
    mainWin?.webContents.send("camera-window-closed");
  });
  loadRoute(cameraWin, "/camera");
}

// ── IPC ──────────────────────────────────────────────────────────────────────

// Available screens + windows to capture (desktopCapturer is main-process only).
// For screens we also return the display bounds so the renderer can map the
// global cursor position into 0..1 for cursor-follow auto-zoom.
ipcMain.handle("get-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
  });
  const displays = screen.getAllDisplays();
  return sources.map((s) => {
    const display =
      s.display_id !== ""
        ? displays.find((d) => String(d.id) === String(s.display_id))
        : undefined;
    return {
      id: s.id,
      name: s.name,
      kind: s.id.startsWith("screen") ? "screen" : "window",
      thumbnail: s.thumbnail.toDataURL(),
      displayBounds: display ? display.bounds : null,
    };
  });
});

// Current global cursor position + the bounds of the display it's on.
ipcMain.handle("get-cursor", () => {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  return { x: point.x, y: point.y, bounds: display.bounds };
});

ipcMain.handle("open-camera", () => {
  createCameraWindow();
});

ipcMain.handle("close-camera", () => {
  if (cameraWin && !cameraWin.isDestroyed()) cameraWin.close();
});

// Persist a finished recording to disk via a native Save dialog.
ipcMain.handle("save-recording", async (_e, data: ArrayBuffer, suggestedName: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWin ?? undefined!, {
    title: "Save recording",
    defaultPath: suggestedName,
    filters: [{ name: "WebM video", extensions: ["webm"] }],
  });
  if (canceled || !filePath) return { saved: false as const };
  await writeFile(filePath, Buffer.from(data));
  return { saved: true as const, filePath };
});

// ── deep linking (web → app) ─────────────────────────────────────────────────
// The web app's "Set up recording" button opens opencraft-recorder://record.
// Registering the scheme lets the OS launch (or focus) this app from that link.

const DEEP_LINK_SCHEME = "opencraft-recorder";
let pendingDeepLink: string | null = null;
let lastDeepLink: string | null = null;

// The renderer reads the launch deep link on mount (covers the case where the
// 'deep-link' push races the renderer subscribing).
ipcMain.handle("get-initial-deep-link", () => lastDeepLink);

// Bring the main window forward — creating it only once the app is ready
// (creating a BrowserWindow before `ready` throws).
function focusMain(): void {
  if (mainWin && !mainWin.isDestroyed()) {
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.show();
    mainWin.focus();
  } else if (app.isReady()) {
    createMainWindow();
  }
}

// Route a deep link to the renderer. Safe to call at any time: if the app isn't
// ready yet (macOS can deliver open-url during launch), it just stashes the URL
// for whenReady to replay — never touches a window early.
function handleDeepLink(url: string): void {
  lastDeepLink = url;
  if (!app.isReady()) {
    pendingDeepLink = url;
    return;
  }
  focusMain();
  const wc = mainWin?.webContents;
  if (!wc) {
    pendingDeepLink = url;
    return;
  }
  if (wc.isLoading()) wc.once("did-finish-load", () => wc.send("deep-link", url));
  else wc.send("deep-link", url);
}

// ── lifecycle ────────────────────────────────────────────────────────────────

// A single instance: a second launch (e.g. from a deep link while already
// running) focuses the existing window instead of spawning another app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    // Windows/Linux deliver the deep link as a command-line argument.
    const url = argv.find((a) => a.startsWith(`${DEEP_LINK_SCHEME}://`));
    if (url) handleDeepLink(url);
    else focusMain();
  });

  // macOS delivers the deep link through this event.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);

  app.whenReady().then(() => {
    createMainWindow();
    if (pendingDeepLink) {
      const url = pendingDeepLink;
      pendingDeepLink = null;
      mainWin?.webContents.once("did-finish-load", () => handleDeepLink(url));
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
