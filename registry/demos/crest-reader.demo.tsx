"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CrestReader, type CrestLine } from "@/registry/ui/crest-reader";

export const tweaks = defineTweaks({
  swell: {
    kind: "range",
    label: "Swell",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  blur: {
    kind: "range",
    label: "Blur",
    default: 1.5,
    min: 0,
    max: 4,
    step: 0.25,
    unit: "px",
  },
  lineGap: {
    kind: "range",
    label: "Gap",
    default: 0.9,
    min: 0.2,
    max: 2,
    step: 0.1,
    unit: "em",
  },
});

const NOTES: CrestLine[] = [
  { meta: "4.2", text: "Exports finish in the background" },
  { meta: "Sync", text: "Drafts sync the moment you reconnect" },
  { meta: "Search", text: "Search reads inside attachments" },
  { meta: "Teams", text: "Guests can comment without an account" },
  { meta: "Maps", text: "Basin maps load twice as fast" },
  { meta: "Fix", text: "Dates no longer drift across time zones" },
  { meta: "Fix", text: "Long names wrap instead of clipping" },
  { meta: "Admin", text: "The audit log keeps a full year" },
  { meta: "API", text: "Webhooks retry with backoff" },
  { meta: "Mobile", text: "Offline mode on every screen" },
  { meta: "Fix", text: "Pasted tables keep their columns" },
  { meta: "Next", text: "Shared templates arrive in 4.3" },
];

/**
 * The Basinworks 4.2 release notes, read off the sea: the line on the crest
 * is the one in focus; scroll, drag or use the arrow keys to read on.
 */
export function CrestReaderDemo({
  chrome = true,
  // The sea is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [line, setLine] = React.useState(1);

  const reader = (
    <div className="flex w-full flex-col gap-2">
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks 4.2 · release notes
      </p>
      <CrestReader
        lines={NOTES}
        value={line}
        onValueChange={setLine}
        label="Basinworks 4.2 release notes"
        height={chrome ? 400 : 500}
        {...values}
        className="text-[clamp(0.95rem,4.4cqi,1.25rem)] font-medium"
      />
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-md">{reader}</div>;
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <div className="@container flex w-full max-w-md self-center">
        {reader}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          line {line + 1} of {NOTES.length}
        </span>{" "}
        · scroll or use the arrow keys
      </p>
    </div>
  );
}
