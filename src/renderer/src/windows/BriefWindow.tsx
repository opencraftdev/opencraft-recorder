import { useEffect, useState } from "react";
import { popup, popupLabel, type DraggableCSS } from "../theme";

// The brief / teleprompter popup. Reads the title + script the web app sent in
// the launch deep link.
function parse(url: string): { title: string; script: string } {
  try {
    const p = new URL(url).searchParams;
    return { title: p.get("title") ?? "", script: p.get("script") ?? "" };
  } catch {
    return { title: "", script: "" };
  }
}

const scrollArea: DraggableCSS = {
  flex: 1,
  overflowY: "auto",
  padding: "0 12px 12px",
  WebkitAppRegion: "no-drag",
};

export function BriefWindow(): JSX.Element {
  const [meta, setMeta] = useState({ title: "", script: "" });

  useEffect(() => {
    void window.api.getInitialDeepLink().then((url) => {
      if (url) setMeta(parse(url));
    });
    return window.api.onDeepLink((url) => setMeta(parse(url)));
  }, []);

  return (
    <div style={popup}>
      <div style={{ padding: "8px 12px 6px" }}>
        <span style={popupLabel}>Brief</span>
        {meta.title && (
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>
            {meta.title}
          </div>
        )}
      </div>
      <div style={scrollArea}>
        {meta.script ? (
          <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "rgba(255,255,255,0.92)" }}>
            {meta.script}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
            No script yet. Open from a brief in the web app to show it here.
          </div>
        )}
      </div>
    </div>
  );
}
