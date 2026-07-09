"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { ZAccordion, type ZAccordionItem } from "@/registry/ui/z-accordion";

/** Fixed field-manual copy — sections and steps indexed, never random. */
const SECTIONS = [
  {
    id: "calibration",
    title: "CALIBRATION",
    tag: "CAL",
    steps: [
      "Zero the vane against the reference post before first light.",
      "Sweep the dial through both stops; log any drift past two units.",
      "Stamp the offset on the bay card and initial it.",
    ],
  },
  {
    id: "mounting",
    title: "MOUNTING",
    tag: "MNT",
    steps: [
      "Seat the chassis on the rail until both latches click.",
      "Torque the thumb screws finger-tight, then a quarter turn.",
    ],
  },
  {
    id: "signal-path",
    title: "SIGNAL PATH",
    tag: "SIG",
    steps: [
      "Route the feed line clear of the drive coil.",
      "Terminate spare taps with blind caps.",
      "Green at the relay means the loop is closed.",
    ],
  },
  {
    id: "maintenance",
    title: "MAINTENANCE",
    tag: "SVC",
    steps: [
      "Wipe the stage with a dry lint-free cloth only.",
      "Re-grease the pivot every forty service hours.",
      "Retire any sheet that returns with a creased edge.",
    ],
  },
] as const;

type Section = (typeof SECTIONS)[number];

/** One manual page — numbered mono steps under the section head. */
function ManualPage({ section }: { section: Section }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {section.steps.map((step, i) => (
        <li key={step} className="flex items-baseline gap-3">
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
            {section.tag}-{String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-sm text-ink-2">{step}</span>
        </li>
      ))}
    </ul>
  );
}

const ITEMS: ZAccordionItem[] = SECTIONS.map((section) => ({
  id: section.id,
  title: section.title,
  content: <ManualPage section={section} />,
}));

/**
 * ZAccordion as a bench instrument: a four-section field manual on the
 * z-rack, framed by a bezel plate with corner ticks and the KQ-112 spec
 * header. The status line reads whichever section holds the front.
 */
export function ZAccordionDemo() {
  const [front, setFront] = React.useState<string>(SECTIONS[0].id);
  const section = SECTIONS.find((entry) => entry.id === front) ?? SECTIONS[0];

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Field Manual &middot; 4 Sections
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-112</span>
        </div>

        <ZAccordion
          items={ITEMS}
          defaultOpen={SECTIONS[0].id}
          onOpenChange={setFront}
        />

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Front Sheet &middot; <span className="text-signal">{section.title}</span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Open a section - the rest step back into the rack.
      </p>
    </div>
  );
}
