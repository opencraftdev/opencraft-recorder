# OpenCraft Recorder (desktop)

A Screen-Studio-style screen + webcam recorder built with **Electron + React + TypeScript**.

The point of the desktop app (vs. the in-browser version): two floating popups —
the **controls/script window** and the **camera bubble** — are marked with the OS
"exclude from capture" flag via `BrowserWindow.setContentProtection(true)`
(`NSWindowSharingNone` on macOS, `WDA_EXCLUDEFROMCAPTURE` on Windows 11). They
stay **visible to you but invisible to any screen recording**, even a full-screen
capture of another app — the thing a browser tab can never guarantee.

## Features

- Capture any **screen or window** (Electron desktop capture).
- **Cursor-follow auto-zoom** (reads the global cursor) + manual zoom, baked by the
  shared `compositor.ts` into a 1080×1920 (9:16) frame.
- Floating **camera bubble** (its own content-protected, draggable, always-on-top window).
- **Teleprompter** with your script, and record / pause / resume / stop.
- Saves a local **WebM** via a native Save dialog.

## Run it (on a Mac — no signing needed)

```bash
npm install
npm run dev
```

First launch will ask macOS for **Screen Recording** and **Camera/Microphone**
permission (System Settings → Privacy & Security). Grant them, then relaunch.

> Note: the app must run **natively on the Mac** — it can't be used through the
> VS Code tunnel / a browser like the web projects.

## Get a packaged `.dmg`

Two ways:

- **Locally on a Mac:** `npm run build:mac` → `dist/*.dmg` (unsigned; first open
  needs right-click → Open).
- **Via CI (no local build):** push this folder as a GitHub repo and run the
  **Build macOS** workflow (Actions tab). Download the `.dmg` from the run's
  Artifacts. See [.github/workflows/build-mac.yml](.github/workflows/build-mac.yml).

## Project layout

```
src/
  main/      Electron main process — windows, content protection, capture/cursor/save IPC
  preload/   contextBridge API exposed to the renderer
  shared/    types shared across processes
  renderer/  React UI
    src/
      windows/MainWindow.tsx    setup + controls + teleprompter + preview (content-protected)
      windows/CameraWindow.tsx  the floating camera bubble (content-protected)
      lib/recorder.ts           desktop capture + compositor + MediaRecorder
      compositor.ts             copied from the web app — identical 9:16 baking
      data.ts                   presenters + sample script
```

## Known limitations (v1)

- Content protection works on **macOS** and **Windows 11**; not on Linux.
- System/desktop audio isn't captured — only the mic. (Screen audio capture on
  macOS needs extra plumbing.)
- The camera is opened twice (recording + bubble preview); fine on most setups.
- Output is a local WebM; wiring to the existing Cloudinary/Supabase pipeline is a
  follow-up.
