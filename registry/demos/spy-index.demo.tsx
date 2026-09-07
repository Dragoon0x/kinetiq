"use client";

import * as React from "react";

import { SpyIndex } from "@/registry/ui/spy-index";

const SECTIONS = [
  { id: "waylight-scope", label: "Scope" },
  { id: "waylight-tolerances", label: "Tolerances" },
  { id: "waylight-bench", label: "Bench setup" },
  { id: "waylight-results", label: "Results" },
  { id: "waylight-signoff", label: "Sign-off" },
];

const BODY: Record<string, string[]> = {
  "waylight-scope": [
    "Waylight ships a single rail assembly per crate. This note covers the March batch and the two carriers it went out with.",
    "Anything outside the March batch keeps the previous tolerances.",
  ],
  "waylight-tolerances": [
    "Rail straightness holds to 0.4mm over a metre. Anything past that is re-cut rather than shimmed.",
    "The end caps are checked wet, not dry, because the seal swells.",
  ],
  "waylight-bench": [
    "Two benches, one operator each, both fed from the same spool. Readings are taken after the spool has run for ten minutes.",
  ],
  "waylight-results": [
    "412 of 416 rails passed on the first reading. The four that did not were all from the tail of the spool.",
    "No carrier damage was recorded on either route.",
  ],
  "waylight-signoff": [
    "Signed off for the March batch only. The April spool is measured again from scratch.",
  ],
};

export function SpyIndexDemo() {
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [active, setActive] = React.useState(SECTIONS[0]?.id ?? "");
  const activeLabel =
    SECTIONS.find((section) => section.id === active)?.label ?? "—";

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        <SpyIndex
          sections={SECTIONS}
          container={frameRef}
          label="Batch note"
          onActiveChange={setActive}
          className="sm:w-32 sm:shrink-0"
        />

        <div
          ref={frameRef}
          className="h-[260px] min-w-0 flex-1 overflow-y-auto rounded-3 border border-hairline bg-surface-1 p-4"
        >
          {SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              tabIndex={-1}
              className="scroll-mt-4 pb-6 outline-none last:pb-2"
            >
              <h4 className="text-sm font-semibold text-foreground">
                {section.label}
              </h4>
              {(BODY[section.id] ?? []).map((line) => (
                <p key={line} className="mt-2 text-xs leading-5 text-ink-2">
                  {line}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Reading <span className="text-signal">{activeLabel}</span>
      </p>
    </div>
  );
}
