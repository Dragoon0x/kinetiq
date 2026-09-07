"use client";

import * as React from "react";

import { SectionDots } from "@/registry/ui/section-dots";

const SECTIONS = [
  {
    id: "fieldline-intake",
    label: "Intake",
    body: "Rails arrive on the north dock and are logged against the run before anything is unpacked.",
  },
  {
    id: "fieldline-calibrate",
    label: "Calibrate",
    body: "Each rail is swept twice: once cold, once at working temperature, and the drift between them is kept.",
  },
  {
    id: "fieldline-assemble",
    label: "Assemble",
    body: "Clamps go on in pairs so the plate never carries load on one side while the second is torqued.",
  },
  {
    id: "fieldline-ship",
    label: "Ship",
    body: "The run leaves as one crate with its sweep sheet, and the depot signs for the drift figures.",
  },
] as const;

export function SectionDotsDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState<string>(SECTIONS[0].id);

  const label =
    SECTIONS.find((section) => section.id === active)?.label ?? "Intake";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative overflow-hidden rounded-3 border border-border bg-card">
        <div ref={frame} className="h-[280px] overflow-y-auto">
          {SECTIONS.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-label={section.label}
              className="flex h-full flex-col justify-center gap-2 border-b border-hairline p-5 pr-10 last:border-0"
            >
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Step {index + 1} of {SECTIONS.length}
              </span>
              <h3 className="text-base font-semibold">{section.label}</h3>
              <p className="text-sm text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <SectionDots
          sections={SECTIONS.map(({ id, label: name }) => ({
            id,
            label: name,
          }))}
          container={frame}
          side="right"
          onActiveChange={setActive}
          label="Fieldline run sections"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Section{" "}
        <span className="text-[var(--signal,var(--primary))]">{label}</span>
      </p>
    </div>
  );
}
