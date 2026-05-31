// Local data for the desktop app (no Supabase yet). Presenters mirror the web
// app; the sample script gives the teleprompter something to show out of the box.

export interface Presenter {
  id: string;
  name: string;
  handle: string;
}

export const PRESENTERS: Presenter[] = [
  { id: "rayandika", name: "Muhammad Rayandika", handle: "@rayandikacode" },
  { id: "depras", name: "Depras Nuryadi", handle: "@Deprasny" },
  { id: "rafi", name: "Muhammad Rafi Reyhan", handle: "@mrafireyhan" },
];

export interface ScriptSegment {
  title: string;
  narration: string;
}

export interface Script {
  hook: string;
  segments: ScriptSegment[];
  outro: string;
}

export const SAMPLE_SCRIPT: Script = {
  hook: "Coding udah murah — yang mahal itu otak lo. Here's the 60-second version.",
  segments: [
    {
      title: "The shift",
      narration:
        "Writing code used to be the bottleneck. Now models write it for you in seconds, so the scarce thing isn't typing — it's knowing what's worth building and why.",
    },
    {
      title: "Where value moves",
      narration:
        "Judgment, taste and system thinking become the moat: framing the problem, choosing the architecture, and catching the subtle bug a model confidently ships.",
    },
    {
      title: "What to practice",
      narration:
        "Spend less time memorizing syntax and more time reading systems, reviewing AI output critically, and shipping real things end to end.",
    },
  ],
  outro: "Cheap hands, expensive minds. Follow for more two-minute takes.",
};
