import { useEffect, useMemo, useState } from "react";
import { popup, popupLabel, type DraggableCSS } from "../theme";
import type { RecorderBrief } from "../../../shared/types";

// The brief / teleprompter popup. The web app's "Record this brief" button
// launches us with a deep link that carries a briefId + a short-lived token (and
// the API origin to call back to), e.g.
//   opencraft-recorder://record?briefId=<uuid>&t=<token>&api=https://app…&presenter=…&handle=…
// We fetch the full brief from {api}/api/tutorial-video/brief/{briefId}?t={token}
// and render its script as a teleprompter.
//
// Back-compat: an older web build embedded the script directly in the URL
// (?title=&script=). If those are present we just show them, no fetch.
interface DeepLinkParams {
  briefId: string;
  token: string;
  api: string;
  presenter: string;
  handle: string;
  // legacy
  title: string;
  script: string;
}

function parse(url: string): DeepLinkParams {
  try {
    const p = new URL(url).searchParams;
    return {
      briefId: p.get("briefId") ?? "",
      token: p.get("t") ?? "",
      api: (p.get("api") ?? "").replace(/\/+$/, ""),
      presenter: p.get("presenter") ?? "",
      handle: p.get("handle") ?? "",
      title: p.get("title") ?? "",
      script: p.get("script") ?? "",
    };
  } catch {
    return { briefId: "", token: "", api: "", presenter: "", handle: "", title: "", script: "" };
  }
}

// Flatten a brief script into the spoken order: hook → each segment → outro.
function scriptToText(b: RecorderBrief): string {
  const s = b.script;
  if (!s) return "";
  return [s.hook, ...(s.segments ?? []).map((seg) => seg.narration), s.outro]
    .filter(Boolean)
    .join("\n\n");
}

type Status = "empty" | "loading" | "ready" | "error";

const scrollArea: DraggableCSS = {
  flex: 1,
  overflowY: "auto",
  padding: "0 12px 12px",
  WebkitAppRegion: "no-drag",
};

const seg = { color: "rgba(255,255,255,0.92)", fontSize: 13, lineHeight: 1.6 } as const;
const segTitle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase" as const,
  color: "rgba(255,255,255,0.5)",
  margin: "10px 0 2px",
};

export function BriefWindow(): JSX.Element {
  const [params, setParams] = useState<DeepLinkParams | null>(null);
  const [brief, setBrief] = useState<RecorderBrief | null>(null);
  const [status, setStatus] = useState<Status>("empty");
  const [errorMsg, setErrorMsg] = useState("");

  // Pick up the launch deep link (initial + any later ones).
  useEffect(() => {
    void window.api.getInitialDeepLink().then((url) => {
      if (url) setParams(parse(url));
    });
    return window.api.onDeepLink((url) => setParams(parse(url)));
  }, []);

  // Whenever the params change, resolve the brief.
  useEffect(() => {
    if (!params) return;

    // Legacy URL — script inlined, nothing to fetch.
    if (params.script || (params.title && !params.briefId)) {
      setBrief({
        id: params.briefId || "legacy",
        title: params.title || null,
        presenter_name: params.presenter || null,
        script: { hook: "", segments: [], outro: "", est_seconds: 0 },
        thumbnail: null,
      });
      setStatus(params.script ? "ready" : "ready");
      return;
    }

    // New flow — fetch by briefId + token from the API origin.
    if (!params.briefId || !params.token || !params.api) {
      setStatus("empty");
      return;
    }

    const ctrl = new AbortController();
    setStatus("loading");
    setErrorMsg("");
    const url = `${params.api}/api/tutorial-video/brief/${encodeURIComponent(
      params.briefId,
    )}?t=${encodeURIComponent(params.token)}`;

    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 401) {
          throw new Error("This brief link expired — relaunch it from the web app.");
        }
        if (res.status === 404) {
          throw new Error("Brief not found.");
        }
        if (!res.ok) {
          throw new Error(`Couldn't load the brief (${res.status}).`);
        }
        return (await res.json()) as RecorderBrief;
      })
      .then((data) => {
        setBrief(data);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setErrorMsg(err instanceof Error ? err.message : "Couldn't load the brief.");
        setStatus("error");
      });

    return () => ctrl.abort();
  }, [params]);

  // Presenter shown on the brief: the web app lets the user pick one at launch,
  // so the deep-link value wins over whatever is baked into the brief row.
  const presenterName = params?.presenter || brief?.presenter_name || "";
  const presenterHandle = params?.handle || "";

  const title = brief?.title || brief?.thumbnail?.headline || params?.title || "";

  // For new-flow briefs we render the script structured; legacy inlined script
  // (no segments) falls back to the raw text the URL carried.
  const legacyScript = params?.script ?? "";
  const flat = useMemo(() => (brief ? scriptToText(brief) : ""), [brief]);
  const hasStructuredScript = !!brief?.script?.segments?.length || !!brief?.script?.hook;

  return (
    <div style={popup}>
      <div style={{ padding: "8px 12px 6px" }}>
        <span style={popupLabel}>Brief</span>
        {title && (
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>
            {title}
          </div>
        )}
        {presenterName && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            {presenterName}
            {presenterHandle ? ` · ${presenterHandle}` : ""}
          </div>
        )}
      </div>

      <div style={scrollArea}>
        {status === "loading" && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
            Loading brief…
          </div>
        )}

        {status === "error" && (
          <div style={{ fontSize: 12, color: "#FBBC04", lineHeight: 1.6 }}>{errorMsg}</div>
        )}

        {status === "ready" && hasStructuredScript && brief && (
          <div>
            {brief.script.hook && (
              <div style={{ ...seg, fontStyle: "italic", marginBottom: 8 }}>{brief.script.hook}</div>
            )}
            {(brief.script.segments ?? []).map((s, i) => (
              <div key={i}>
                {s.title && <div style={segTitle}>{s.title}</div>}
                <div style={seg}>{s.narration}</div>
              </div>
            ))}
            {brief.script.outro && (
              <div style={{ ...seg, fontStyle: "italic", marginTop: 10 }}>{brief.script.outro}</div>
            )}
          </div>
        )}

        {status === "ready" && !hasStructuredScript && (legacyScript || flat) && (
          <div style={{ ...seg, whiteSpace: "pre-wrap" }}>{legacyScript || flat}</div>
        )}

        {status === "empty" && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
            No script yet. Open from a brief in the web app to show it here.
          </div>
        )}
      </div>
    </div>
  );
}
