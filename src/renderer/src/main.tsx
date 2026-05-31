import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MainWindow } from "./windows/MainWindow";
import { CameraWindow } from "./windows/CameraWindow";

// One renderer build serves every window; the route in the URL hash decides
// which one to mount. #/camera → the floating camera bubble, everything else →
// the main control/setup window.
function Root(): JSX.Element {
  const route = window.location.hash.replace(/^#/, "") || "/main";
  return route.startsWith("/camera") ? <CameraWindow /> : <MainWindow />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
