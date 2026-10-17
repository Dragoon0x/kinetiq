"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSpikeAttributions,
  defaultSpikeFlags,
  SpikeTrace,
  type SpikeDimension,
} from "@/registry/ui/spike-trace";

export const tweaks = defineTweaks({
  strandStyle: {
    kind: "choice",
    label: "Strands",
    default: "ribbon",
    options: ["ribbon", "thread", "step"],
    names: { ribbon: "Ribbon", thread: "Thread", step: "Step" },
  },
  flagStyle: {
    kind: "choice",
    label: "Flags",
    default: "pin",
    options: ["pin", "ring", "band"],
    names: { pin: "Pin", ring: "Ring", band: "Band" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const BUSY = "2026-10-15";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const label = (date: string) => {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ""} ${d ?? ""}`;
};

/**
 * A Basinworks workspace's last thirty days, with a busy Thursday. In the
 * gallery the Thursday unpacks once, a moment after the card is seen.
 */
export function SpikeTraceDemo({
  chrome = true,
  // The chart is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [selected, setSelected] = React.useState<string | null>(
    chrome ? BUSY : null,
  );
  const [dim, setDim] = React.useState<SpikeDimension>("keys");
  const [opened, setOpened] = React.useState<string | null>(null);
  const [expected, setExpected] = React.useState<Record<string, boolean>>({});
  const [round, setRound] = React.useState(0);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const replayTimer = React.useRef(0);

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry?.isIntersecting && !once.current) {
        timer = window.setTimeout(() => {
          once.current = true;
          setSelected(BUSY);
        }, 1000);
      }
    });
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  React.useEffect(() => () => window.clearTimeout(replayTimer.current), []);

  const trace = (
    <SpikeTrace
      key={round}
      value={selected}
      onSelectSpike={(date) => setSelected(date)}
      dimension={dim}
      onDimensionChange={setDim}
      onOpenCause={(cause) => setOpened(cause.label)}
      onFlagExpected={(date, next) =>
        setExpected((m) => ({ ...m, [date]: next }))
      }
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {trace}
      </div>
    );
  }

  const causes = selected
    ? [...(defaultSpikeAttributions[selected]?.[dim] ?? [])].sort(
        (a, b) => b.amount - a.amount,
      )
    : [];
  const sum = causes.reduce((s, c) => s + c.amount, 0);
  const top = causes[0];
  const open = defaultSpikeFlags.filter(
    (f) => !(expected[f.date] ?? f.expected),
  ).length;

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {trace}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            setDim("keys");
            setOpened(null);
            setExpected({});
            setRound((r) => r + 1);
            window.clearTimeout(replayTimer.current);
            replayTimer.current = window.setTimeout(
              () => setSelected(BUSY),
              600,
            );
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {selected ? label(selected) : "folded"}
        </span>
        {` · ${dim}`}
        {top && sum > 0
          ? ` · ${top.label} ${Math.round((top.amount / sum) * 100)}%`
          : ""}
        {` · ${open} flagged${opened ? ` · opened ${opened}` : ""}`}
      </p>
    </div>
  );
}
