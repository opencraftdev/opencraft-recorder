import type { CSSProperties } from "react";

// Google / Material design tokens mirrored from the web UI
// (opencraft-centralized: src/theme/theme.ts + the Record Video page). The
// desktop app reuses these so it looks like the same product — light surface,
// Google blue, pill buttons, Roboto.
export const G = {
  pageBg: "#F0F4F9",
  card: "#FFFFFF",
  cardBorder: "#E8EAED",
  inputBorder: "#DADCE0",
  text: "#1F1F1F",
  textSub: "#5F6368",
  textFaint: "#80868B",
  disabled: "#9AA0A6",
  blue: "#0B57D0",
  blueHover: "#0A4BB8",
  blueSoft: "#E8F0FE",
  blueSoftBg: "#F0F6FF",
  blueSoftBorder: "#C7D7F5",
  blueDisabled: "#C7D3E8",
  red: "#EA4335",
  redHover: "#C5221F",
  green: "#1E8E3E",
  amber: "#B26A00",
  font: 'Roboto, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
} as const;

export const page: CSSProperties = {
  height: "100vh",
  overflowY: "auto",
  background: G.pageBg,
  color: G.text,
  fontFamily: G.font,
};

export const card: CSSProperties = {
  background: G.card,
  border: `1px solid ${G.cardBorder}`,
  borderRadius: 12,
};

export const label: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: G.textSub,
  letterSpacing: "0.06em",
};

// Pill buttons, matching the Record Video page.
export function primaryBtn(disabled = false): CSSProperties {
  return {
    appearance: "none",
    border: "none",
    cursor: disabled ? "default" : "pointer",
    borderRadius: 9999,
    padding: "10px 22px",
    fontWeight: 600,
    fontSize: 14,
    fontFamily: G.font,
    background: disabled ? G.blueDisabled : G.blue,
    color: "#fff",
  };
}

export const dangerBtn: CSSProperties = { ...primaryBtn(), background: G.red };

export const textBtn: CSSProperties = {
  appearance: "none",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  borderRadius: 9999,
  padding: "10px 16px",
  fontWeight: 600,
  fontSize: 14,
  color: G.textSub,
  fontFamily: G.font,
};

export const outlineBtn: CSSProperties = {
  appearance: "none",
  background: "#fff",
  cursor: "pointer",
  borderRadius: 9999,
  padding: "9px 18px",
  fontWeight: 600,
  fontSize: 14,
  color: G.blue,
  border: `1px solid ${G.blue}`,
  fontFamily: G.font,
};

export const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
  color: G.text,
  border: `1px solid ${G.inputBorder}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: G.font,
};
