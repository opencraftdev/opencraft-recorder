// Shared vertical compositor — copied from the web app (opencraft-centralized
// src/lib/video/compositor.ts) so both surfaces bake an identical 1080×1920
// (9:16) frame. Framework-agnostic Canvas-2D + pure math.
//
// Per frame the caller hands us { screen, cam?, focus, zoom }. We draw:
//   • the screen, cover-cropped into the TOP region (~62%), centered on `focus`
//     and magnified by `zoom` (cursor-follow auto-zoom — the Screen Studio look)
//   • the webcam, cover-cropped into the BOTTOM region (~38%) with a divider
//   • no cam → the screen fills the whole 1080×1920 frame

export const OUTPUT_WIDTH = 1080;
export const OUTPUT_HEIGHT = 1920;
export const DEFAULT_SCREEN_RATIO = 0.62;
export const DEFAULT_SMOOTHING = 0.18;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Focus {
  x: number;
  y: number;
}

export type FrameSource = CanvasImageSource;

export interface CompositorFrameInput {
  screen: FrameSource;
  screenWidth: number;
  screenHeight: number;
  cam?: FrameSource | null;
  camWidth?: number;
  camHeight?: number;
  focus: Focus;
  zoom: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function lerpRect(from: Rect, to: Rect, t: number): Rect {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    w: lerp(from.w, to.w, t),
    h: lerp(from.h, to.h, t),
  };
}

export function computeCoverCrop(srcW: number, srcH: number, destW: number, destH: number): Rect {
  const destAspect = destW / destH;
  let w = srcW;
  let h = srcW / destAspect;
  if (h > srcH) {
    h = srcH;
    w = srcH * destAspect;
  }
  return { x: (srcW - w) / 2, y: (srcH - h) / 2, w, h };
}

export function computeScreenCrop(
  srcW: number,
  srcH: number,
  destW: number,
  destH: number,
  focus: Focus,
  zoom: number,
): Rect {
  const base = computeCoverCrop(srcW, srcH, destW, destH);
  const z = Math.max(1, zoom);
  const cropW = base.w / z;
  const cropH = base.h / z;
  const cx = clamp(focus.x, 0, 1) * srcW;
  const cy = clamp(focus.y, 0, 1) * srcH;
  const x = clamp(cx - cropW / 2, 0, srcW - cropW);
  const y = clamp(cy - cropH / 2, 0, srcH - cropH);
  return { x, y, w: cropW, h: cropH };
}

export function regionsFor(
  hasCam: boolean,
  width: number,
  height: number,
  screenRatio: number,
): { screen: Rect; cam: Rect | null } {
  if (!hasCam) {
    return { screen: { x: 0, y: 0, w: width, h: height }, cam: null };
  }
  const screenH = Math.round(height * screenRatio);
  return {
    screen: { x: 0, y: 0, w: width, h: screenH },
    cam: { x: 0, y: screenH, w: width, h: height - screenH },
  };
}

function sourceSize(
  source: FrameSource,
  width: number | undefined,
  height: number | undefined,
): { w: number; h: number } {
  if (width && height) return { w: width, h: height };
  const anySrc = source as unknown as {
    videoWidth?: number;
    videoHeight?: number;
    width?: number;
    height?: number;
  };
  return {
    w: anySrc.videoWidth || anySrc.width || OUTPUT_WIDTH,
    h: anySrc.videoHeight || anySrc.height || OUTPUT_HEIGHT,
  };
}

export type ScreenFit = "cover" | "contain";

export interface VerticalCompositorOptions {
  width?: number;
  height?: number;
  screenRatio?: number;
  smoothing?: number;
  divider?: boolean;
  screenFit?: ScreenFit;
}

export function computeContainRect(srcW: number, srcH: number, destW: number, destH: number): Rect {
  const scale = Math.min(destW / srcW, destH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (destW - w) / 2, y: (destH - h) / 2, w, h };
}

export class VerticalCompositor {
  readonly width: number;
  readonly height: number;
  readonly screenRatio: number;
  readonly smoothing: number;
  readonly screenFit: ScreenFit;
  private readonly drawDivider: boolean;

  private currentCrop: Rect | null = null;

  constructor(options: VerticalCompositorOptions = {}) {
    this.width = options.width ?? OUTPUT_WIDTH;
    this.height = options.height ?? OUTPUT_HEIGHT;
    this.screenRatio = options.screenRatio ?? DEFAULT_SCREEN_RATIO;
    this.smoothing = options.smoothing ?? DEFAULT_SMOOTHING;
    this.screenFit = options.screenFit ?? "cover";
    this.drawDivider = options.divider ?? true;
  }

  reset(): void {
    this.currentCrop = null;
  }

  drawFrame(ctx: CanvasRenderingContext2D, input: CompositorFrameInput): void {
    const hasCam = Boolean(input.cam);
    const { screen, cam } = regionsFor(hasCam, this.width, this.height, this.screenRatio);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.screenFit === "contain") {
      const dest = computeContainRect(input.screenWidth, input.screenHeight, screen.w, screen.h);
      ctx.drawImage(input.screen, screen.x + dest.x, screen.y + dest.y, dest.w, dest.h);
    } else {
      const target = computeScreenCrop(
        input.screenWidth,
        input.screenHeight,
        screen.w,
        screen.h,
        input.focus,
        input.zoom,
      );
      this.currentCrop = this.currentCrop
        ? lerpRect(this.currentCrop, target, this.smoothing)
        : target;
      const crop = this.currentCrop;
      ctx.drawImage(
        input.screen,
        crop.x,
        crop.y,
        crop.w,
        crop.h,
        screen.x,
        screen.y,
        screen.w,
        screen.h,
      );
    }

    if (hasCam && cam && input.cam) {
      const { w: cw, h: ch } = sourceSize(input.cam, input.camWidth, input.camHeight);
      const camCrop = computeCoverCrop(cw, ch, cam.w, cam.h);
      ctx.drawImage(
        input.cam,
        camCrop.x,
        camCrop.y,
        camCrop.w,
        camCrop.h,
        cam.x,
        cam.y,
        cam.w,
        cam.h,
      );
      if (this.drawDivider) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillRect(cam.x, cam.y - 2, cam.w, 4);
      }
    }
  }
}
