"use client";

import * as React from "react";

import { ResultFold } from "@/registry/ui/result-fold";

/** Fernworks Model 3 at Coldbrook Bank, reading September's unreconciled rows. */
const LINES = [
  "ref       date        amount     counterparty         state",
  "LD-40211  2026-09-01  -1,240.00  Fieldline Ltd        matched",
  "LD-40212  2026-09-01    +318.50  Waylight Pay         matched",
  "LD-40219  2026-09-02    -62.40   Basinworks Exchange  matched",
  "LD-40223  2026-09-02  +2,905.00  Gaugeworks           unreconciled",
  "LD-40224  2026-09-03    -240.00  Fieldline Ltd        matched",
  "LD-40230  2026-09-03    -18.00   Coldbrook Bank fee   matched",
  "LD-40231  2026-09-04    +905.50  Gaugeworks           matched",
  "LD-40237  2026-09-04  -1,100.00  Fernworks            unreconciled",
  "LD-40240  2026-09-05    +412.00  Waylight Pay         matched",
  "LD-40244  2026-09-05    -75.25   Basinworks Exchange  matched",
  "LD-40251  2026-09-06    +318.50  Waylight Pay         matched",
  "LD-40255  2026-09-06    -240.00  Fieldline Ltd        matched",
  "LD-40258  2026-09-07  +1,760.00  Gaugeworks           matched",
  "LD-40262  2026-09-07    -18.00   Coldbrook Bank fee   matched",
  "LD-40266  2026-09-08    -640.00  Fernworks            unreconciled",
  "LD-40270  2026-09-08    +412.00  Waylight Pay         matched",
  "LD-40274  2026-09-08    -62.40   Basinworks Exchange  matched",
];

/** Tenths of a second at which each line lands, and when the gist arrives. */
const ARRIVALS = [
  2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17, 18, 19, 21, 22, 24,
];
const GIST_AT = 27;
const GIST = "18 rows · 3 unreconciled";

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ResultFoldDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  // A hidden tab pauses the script; the result should not land unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const arriving = playing && ticks < GIST_AT;

  React.useEffect(() => {
    if (!arriving || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [arriving, visible]);

  const lines = LINES.slice(0, ARRIVALS.filter((at) => at <= ticks).length);
  const summary = playing && ticks >= GIST_AT ? GIST : undefined;

  const status = !playing
    ? "Idle · press play"
    : arriving
      ? `Arriving · ${lines.length} ${lines.length === 1 ? "line" : "lines"}`
      : open
        ? `Unfolded · ${lines.length} lines`
        : `Folded · 3 of ${lines.length} lines`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ResultFold
        name="search_ledger"
        text={lines.join("\n")}
        previewLines={3}
        summary={summary}
        open={open}
        onOpenChange={setOpen}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setOpen(false);
            setPlaying(true);
          }}
          className={button}
        >
          {playing ? "Replay" : "Play"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
