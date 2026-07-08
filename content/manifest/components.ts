import type { KinetiqItem } from "./types";

/** KQ-001…KQ-021 — the instrument catalog. */
export const components: KinetiqItem[] = [
  {
    name: "pressure-button",
    type: "registry:ui",
    title: "Pressure Button",
    description:
      "A button that pushes back — press squash on flick, spring rebound on snap, and a hold-to-confirm gauge ring for destructive actions.",
    files: [{ path: "registry/ui/pressure-button.tsx", type: "registry:ui" }],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["buttons"],
    meta: { serial: "KQ-001" },
    tagline: "A button that pushes back.",
    keywords: ["button", "press", "hold to confirm", "destructive", "cta"],
    props: [
      {
        name: "variant",
        type: '"solid" | "outline" | "ghost" | "danger"',
        defaultValue: '"solid"',
        description: "Visual style. Danger pairs naturally with holdToConfirm.",
      },
      {
        name: "size",
        type: '"sm" | "md" | "lg"',
        defaultValue: '"md"',
        description: "Control height and typography scale.",
      },
      {
        name: "holdToConfirm",
        type: "number",
        description:
          "Milliseconds the button must be held before confirming. Adds a gauge ring; Escape or early release cancels.",
      },
      {
        name: "onConfirm",
        type: "() => void",
        description: "Fires when a hold completes. Hold buttons never fire onClick.",
      },
    ],
    usageNotes: [
      "Space and Enter drive the same physics as the pointer — hold either to confirm.",
      "Under reduced motion the squash is replaced by a shade change; the gauge ring still fills because progress is feedback, not flourish.",
    ],
  },
];
