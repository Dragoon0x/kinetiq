"use client";

import * as React from "react";

import { SideScroll } from "@/registry/ui/side-scroll";

const PANELS = [
  {
    title: "Bench survey",
    body: "Every rail is measured cold before it goes on the bench, and the sheet travels with it.",
  },
  {
    title: "Twin sweep",
    body: "Two passes, one cold and one at working temperature. The drift between them is the record.",
  },
  {
    title: "Paired clamps",
    body: "Clamps torque in pairs so the plate never carries load on one side alone.",
  },
  {
    title: "Depot handover",
    body: "The run leaves as one crate. The depot signs for the drift figures, not the count.",
  },
];

export function SideScrollDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const [percent, setPercent] = React.useState(0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div
        ref={frame}
        className="h-[300px] overflow-y-auto rounded-3 border border-border bg-card"
      >
        <div className="flex flex-col gap-1 p-4">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks
          </span>
          <h4 className="text-sm font-semibold text-foreground">Season kit</h4>
          <p className="text-xs leading-5 text-muted-foreground">
            Keep scrolling. The track below moves across instead of down.
          </p>
        </div>

        <SideScroll
          panels={PANELS.map((panel) => (
            <React.Fragment key={panel.title}>
              <h5 className="text-sm font-semibold text-foreground">
                {panel.title}
              </h5>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {panel.body}
              </p>
            </React.Fragment>
          ))}
          container={frame}
          panelWidth={220}
          onProgressChange={setPercent}
          label="Fernworks season kit"
        />

        <p className="p-4 text-xs leading-5 text-muted-foreground">
          Past the track the page carries on as usual.
        </p>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Progress <span className="text-signal tabular-nums">{percent}%</span>
      </p>
    </div>
  );
}
