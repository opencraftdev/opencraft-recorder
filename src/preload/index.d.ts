import type { RecorderApi } from "../shared/types";

declare global {
  interface Window {
    api: RecorderApi;
  }
}

export {};
