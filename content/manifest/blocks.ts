import type { KinetiqItem } from "./types";

/** KB-101…KB-108 — composed instruments. */
export const blocks: KinetiqItem[] = [
  {
    name: "launch-checklist",
    type: "registry:block",
    title: "Launch Checklist",
    description:
      "Onboarding checklist where ticks draw themselves, finished steps strike through and settle to the bottom, and completing the set lands a CALIBRATED stamp.",
    files: [
      {
        path: "registry/blocks/launch-checklist/launch-checklist.tsx",
        type: "registry:block",
      },
    ],
    dependencies: ["motion"],
    registryDependencies: ["utils", "motion", "use-motion-safe"],
    categories: ["onboarding"],
    meta: { serial: "KB-108" },
    tagline: "Setup steps that stamp themselves done.",
    keywords: ["onboarding", "checklist", "progress", "steps", "stamp"],
    props: [
      {
        name: "steps",
        type: "ChecklistStep[]",
        description: "Step definitions: id, title, optional description.",
      },
      {
        name: "completed / defaultCompleted",
        type: "string[]",
        description: "Controlled or uncontrolled set of completed step ids.",
      },
      {
        name: "onCompletedChange",
        type: "(completed: string[]) => void",
        description: "Fires on every toggle with the new completed set.",
      },
      {
        name: "onComplete",
        type: "() => void",
        description: "Fires once when the final step completes.",
      },
    ],
    usageNotes: [
      "Rows are native checkboxes under the hood — the whole block is keyboard and screen-reader operable.",
      "Under reduced motion rows reorder instantly and the stamp fades in; the progress track still reports value via ARIA.",
    ],
  },
];
