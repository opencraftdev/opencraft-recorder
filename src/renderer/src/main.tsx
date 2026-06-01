import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Onboarding } from "./windows/Onboarding";
import { ScreenWindow } from "./windows/ScreenWindow";
import { CameraWindow } from "./windows/CameraWindow";
import { BriefWindow } from "./windows/BriefWindow";
import { ControlWindow } from "./windows/ControlWindow";

// One renderer build serves every window; the route in the URL hash decides which
// one to mount. The session popups (brief/screen/camera/control) are spawned by
// the main process after onboarding.
function Root(): JSX.Element {
  const route = window.location.hash.replace(/^#/, "") || "/onboarding";
  if (route.startsWith("/screen")) return <ScreenWindow />;
  if (route.startsWith("/camera")) return <CameraWindow />;
  if (route.startsWith("/brief")) return <BriefWindow />;
  if (route.startsWith("/control")) return <ControlWindow />;
  return <Onboarding onDone={() => void window.api.startSession()} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
