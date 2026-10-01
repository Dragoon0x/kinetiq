"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CommuteLine, type CommuteLineStop } from "@/registry/ui/commute-line";

export const tweaks = defineTweaks({
  line: {
    kind: "choice",
    label: "Line",
    default: "blue",
    options: ["red", "green", "blue"],
    names: { red: "Red", green: "Green", blue: "Blue" },
  },
  delay: {
    kind: "range",
    label: "Delay",
    default: 3,
    min: 0,
    max: 10,
    step: 1,
    unit: "min",
  },
  stops: {
    kind: "range",
    label: "Stops",
    default: 6,
    min: 4,
    max: 8,
    step: 1,
  },
});

const at = (h: number, m: number) => Date.UTC(2026, 9, 7, h, m);

/** Waylight Transit's morning run to Harbour. */
const RUN: CommuteLineStop[] = [
  { id: "northgate", name: "Northgate", time: at(8, 40) },
  { id: "mill-lane", name: "Mill Lane", time: at(8, 42) },
  { id: "fernhill", name: "Fernhill", time: at(8, 45) },
  { id: "basin-st", name: "Basin St", time: at(8, 47) },
  { id: "gauge-row", name: "Gauge Row", time: at(8, 50) },
  { id: "quayside", name: "Quayside", time: at(8, 52) },
  { id: "fieldline", name: "Fieldline", time: at(8, 54) },
  { id: "coldbrook", name: "Coldbrook", time: at(8, 57) },
  { id: "harbour", name: "Harbour", time: at(8, 59) },
];

/** 08:47:30 — fixed, so the server and the page agree. */
const START = Date.UTC(2026, 9, 7, 8, 47, 30);
/** One report a second, twelve seconds of the timetable each. */
const REPORT_MS = 1000;
const STEP_MS = 12_000;
const LAST = at(8, 59);

/**
 * The Blue line in the Waylight Transit app, on a rider's way to Fieldline.
 * After it mounts, the demo sends a report a second at twelve times the
 * timetable's pace — only while it is on screen and the page is visible —
 * and the next train starts once this one reaches Harbour.
 */
export function CommuteLineDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [now, setNow] = React.useState(START);
  const [stop, setStop] = React.useState("fieldline");
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const delay = values.delay ?? tweaks.delay.default;

  React.useEffect(() => {
    if (!node) return;
    let seen = false;
    let timer = 0;
    const tick = () => {
      setNow((t) => (t - delay * 60_000 > LAST + 60_000 ? START : t + STEP_MS));
    };
    const sync = () => {
      window.clearInterval(timer);
      timer = 0;
      if (seen && !document.hidden) {
        timer = window.setInterval(tick, REPORT_MS);
      }
    };
    const watcher = new IntersectionObserver((entries) => {
      seen = Boolean(entries[entries.length - 1]?.isIntersecting);
      sync();
    });
    watcher.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      watcher.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [node, delay]);

  const late = delay * 60_000;
  const chosen = RUN.find((s) => s.id === stop);
  let last = -1;
  RUN.forEach((s, i) => {
    if ((s.time as number) + late <= now) last = i;
  });
  const here = RUN[last];
  const where = !here
    ? "at northgate"
    : now - ((here.time as number) + late) < 30_000
      ? `at ${here.name.toLowerCase()}`
      : `after ${here.name.toLowerCase()}`;
  const minutes = chosen
    ? Math.ceil(((chosen.time as number) + late - now) / 60_000)
    : 0;

  return (
    <div
      ref={setNode}
      className="flex w-full max-w-[40rem] flex-col items-center gap-4"
    >
      <CommuteLine
        {...values}
        delay={delay}
        timetable={RUN}
        now={now}
        direction="to Harbour"
        value={stop}
        onValueChange={setStop}
        sound={sound}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{values.line ?? "blue"} line</span> ·{" "}
          {where}
          {chosen
            ? ` · ${chosen.name.toLowerCase()} ${minutes > 0 ? `in ${minutes} min` : "now"}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
