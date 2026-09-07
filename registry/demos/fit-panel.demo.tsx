"use client";

import * as React from "react";

import { FitPanel } from "@/registry/ui/fit-panel";

const TABS = [
  {
    id: "spec",
    label: "Spec",
    body: (
      <p className="text-[13px] leading-relaxed text-ink-2">
        Gaugeworks R2 · 0–16 bar · 63 mm dial.
      </p>
    ),
  },
  {
    id: "fit",
    label: "Fit",
    body: (
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {[
          ["Thread", "G1/4 B"],
          ["Seal", "NBR"],
          ["Case", "Stainless"],
          ["Mount", "Rear stud"],
        ].map(([term, value]) => (
          <React.Fragment key={term}>
            <dt className="text-[11px] text-ink-3">{term}</dt>
            <dd className="text-right font-mono text-[11px] tabular-nums">
              {value}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    ),
  },
  {
    id: "notes",
    label: "Notes",
    body: (
      <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
        <p>
          Fit the gauge with the dial vertical. A stud mount takes the line
          load, so the thread never carries the weight of the manifold.
        </p>
        <p>
          Re-zero after the first pressure cycle, then annually. A drifting zero
          is the first sign the seal has taken a set.
        </p>
      </div>
    ),
  },
];

export function FitPanelDemo() {
  const [active, setActive] = React.useState(TABS[0]!.id);
  const [height, setHeight] = React.useState(0);
  const uid = React.useId();
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0]!;

  const step = (delta: number) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    if (!next) return;
    setActive(next.id);
    document.getElementById(`${uid}-${next.id}`)?.focus();
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="rounded-3 border border-hairline bg-surface-1 p-3">
        <div role="tablist" aria-label="Gaugeworks R2" className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`${uid}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={tab.id === active}
              aria-controls={`${uid}-${tab.id}-panel`}
              tabIndex={tab.id === active ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  step(1);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  step(-1);
                }
              }}
              className={`h-8 flex-1 rounded-2 border text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                tab.id === active
                  ? "border-cobalt-bright bg-surface-0 text-foreground"
                  : "border-hairline bg-surface-2 text-ink-3 hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <FitPanel
          contentKey={active}
          onHeightChange={setHeight}
          className="mt-3"
        >
          <div
            id={`${uid}-${current.id}-panel`}
            role="tabpanel"
            aria-labelledby={`${uid}-${current.id}`}
          >
            {current.body}
          </div>
        </FitPanel>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Measured{" "}
        <span className="text-[var(--signal,var(--primary))]">{height} px</span>
      </p>
    </div>
  );
}
