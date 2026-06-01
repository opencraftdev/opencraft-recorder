import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  screen,
  dialog,
  systemPreferences,
  shell,
} from "electron";
import { join } from "path";
import { writeFile } from "fs/promises";

// The native superpower this whole app exists for: setContentProtection(true)
// flags a window with the OS "exclude from capture" bit (NSWindowSharingNone on
// macOS, WDA_EXCLUDEFROMCAPTURE on Windows 11). The window stays fully visible on
// screen but is INVISIBLE to any screen recording. Every floating popup below is
// content-protected, so none of them appear in the take.

const PRELOAD = join(__dirname, "../preload/index.js");

// The light onboarding window (permissions) shown before a session.
let onboardingWin: BrowserWindow | null = null;

// The four floating "spotlight" popups that make up a recording session.
type SessionKey = "brief" | "screen" | "camera" | "control";
const session: Partial<Record<SessionKey, BrowserWindow>> = {};
const sessionWindows = (): BrowserWindow[] =>
  (Object.values(session).filter((w): w is BrowserWindow => !!w && !w.isDestroyed()));

function loadRoute(win: BrowserWindow, hash: string): void {
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) void win.loadURL(`${devUrl}#${hash}`);
  else void win.loadFile(join(__dirname, "../renderer/index.html"), { hash });
}

function createOnboardingWindow(): void {
  if (onboardingWin && !onboardingWin.isDestroyed()) {
    onboardingWin.show();
    onboardingWin.focus();
    return;
  }
  onboardingWin = new BrowserWindow({
    width: 460,
    height: 600,
    show: false,
    title: "OpenCraft Recorder",
    backgroundColor: "#F0F4F9",
    webPreferences: { preload: PRELOAD, sandbox: false },
  });
  onboardingWin.setContentProtection(true);
  onboardingWin.on("ready-to-show", () => onboardingWin?.show());
  onboardingWin.on("closed", () => (onboardingWin = null));
  loadRoute(onboardingWin, "/onboarding");
}

// A frameless, dark-frosted ("spotlight") popup: translucent vibrancy, rounded,
// always-on-top, content-protected (never recorded), draggable + resizable.
function createPopup(route: string, b: { x: number; y: number; width: number; height: number }): BrowserWindow {
  const win = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    show: false,
    frame: false,
    resizable: true,
    movable: true,
    minWidth: 90,
    minHeight: 90,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    roundedCorners: true,
    vibrancy: "hud", // macOS dark frosted material — the Spotlight look
    visualEffectState: "active",
    backgroundColor: "#00000000",
    webPreferences: { preload: PRELOAD, sandbox: false },
  });
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on("ready-to-show", () => win.show());
  loadRoute(win, route);
  return win;
}

// ── session lifecycle ────────────────────────────────────────────────────────

// Spawn the four popups laid out like the design (brief left; screen + camera
// stacked top-right; small control lower-right), then hide onboarding.
ipcMain.handle("start-session", () => {
  if (sessionWindows().length) return;
  const wa = screen.getPrimaryDisplay().workArea;
  const W = wa.width;
  const H = wa.height;
  const rightX = wa.x + W - 250;

  session.brief = createPopup("/brief", {
    x: wa.x + 40,
    y: wa.y + Math.round(H * 0.14),
    width: 210,
    height: 300,
  });
  session.screen = createPopup("/screen", {
    x: rightX,
    y: wa.y + Math.round(H * 0.1),
    width: 220,
    height: 150,
  });
  session.camera = createPopup("/camera", {
    x: rightX,
    y: wa.y + Math.round(H * 0.1) + 165,
    width: 220,
    height: 150,
  });
  session.control = createPopup("/control", {
    x: wa.x + W - 150,
    y: wa.y + Math.round(H * 0.52),
    width: 120,
    height: 230,
  });

  (Object.keys(session) as SessionKey[]).forEach((k) => {
    session[k]?.on("closed", () => {
      session[k] = undefined;
    });
  });

  onboardingWin?.hide();
});

// Close the popups and return to onboarding.
ipcMain.handle("end-session", () => {
  for (const w of sessionWindows()) w.close();
  (Object.keys(session) as SessionKey[]).forEach((k) => (session[k] = undefined));
  createOnboardingWindow();
});

// The primary display as a capture source (+ its bounds for cursor-follow zoom).
ipcMain.handle("get-primary-source", async () => {
  const primary = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 },
  });
  const match = sources.find((s) => String(s.display_id) === String(primary.id)) ?? sources[0];
  if (!match) return null;
  return { id: match.id, displayBounds: primary.bounds };
});

// Broadcast bus: any window posts a message, every other window receives it.
// Carries control commands (record/pause/stop) and engine state (phase/elapsed).
ipcMain.on("bus", (e, msg) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w.webContents.id !== e.sender.id) w.webContents.send("bus", msg);
  }
});

// ── IPC: capture helpers ─────────────────────────────────────────────────────

ipcMain.handle("get-cursor", () => {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  return { x: point.x, y: point.y, bounds: display.bounds };
});

ipcMain.handle("save-recording", async (e, data: ArrayBuffer, suggestedName: string) => {
  const parent = BrowserWindow.fromWebContents(e.sender) ?? undefined;
  const opts = {
    title: "Save recording",
    defaultPath: suggestedName,
    filters: [{ name: "WebM video", extensions: ["webm"] }],
  };
  const { canceled, filePath } = parent
    ? await dialog.showSaveDialog(parent, opts)
    : await dialog.showSaveDialog(opts);
  if (canceled || !filePath) return { saved: false as const };
  await writeFile(filePath, Buffer.from(data));
  return { saved: true as const, filePath };
});

// ── onboarding: macOS privacy permissions ───────────────────────────────────

ipcMain.handle("get-permissions", () => {
  if (process.platform !== "darwin") {
    return { camera: "granted", microphone: "granted", screen: "granted" };
  }
  return {
    camera: systemPreferences.getMediaAccessStatus("camera"),
    microphone: systemPreferences.getMediaAccessStatus("microphone"),
    screen: systemPreferences.getMediaAccessStatus("screen"),
  };
});

ipcMain.handle("request-camera-mic", async () => {
  if (process.platform !== "darwin") return true;
  const cam = await systemPreferences.askForMediaAccess("camera");
  const mic = await systemPreferences.askForMediaAccess("microphone");
  return cam && mic;
});

ipcMain.handle("open-screen-settings", () => {
  if (process.platform !== "darwin") return;
  desktopCapturer
    .getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } })
    .catch(() => {});
  void shell.openExternal(
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  );
});

ipcMain.handle("relaunch-app", () => {
  app.relaunch();
  app.exit(0);
});

// ── deep linking (web → app) ─────────────────────────────────────────────────

const DEEP_LINK_SCHEME = "opencraft-recorder";
let pendingDeepLink: string | null = null;
let lastDeepLink: string | null = null;

ipcMain.handle("get-initial-deep-link", () => lastDeepLink);

function focusAny(): void {
  const w = onboardingWin ?? sessionWindows()[0] ?? null;
  if (w && !w.isDestroyed()) {
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  } else if (app.isReady()) {
    createOnboardingWindow();
  }
}

// Route a deep link to every window. Safe before ready (macOS open-url during
// launch): stash it for whenReady to replay.
function handleDeepLink(url: string): void {
  lastDeepLink = url;
  if (!app.isReady()) {
    pendingDeepLink = url;
    return;
  }
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("deep-link", url);
  }
  focusAny();
}

// ── lifecycle ────────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${DEEP_LINK_SCHEME}://`));
    if (url) handleDeepLink(url);
    else focusAny();
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);

  app.whenReady().then(() => {
    createOnboardingWindow();
    if (pendingDeepLink) {
      pendingDeepLink = null;
      // lastDeepLink already set; onboarding/brief read it via getInitialDeepLink.
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createOnboardingWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
