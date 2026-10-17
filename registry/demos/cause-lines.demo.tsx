"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CauseLines,
  defaultCauseAgents,
  defaultCauseEvents,
} from "@/registry/ui/cause-lines";

export const tweaks = defineTweaks({
  curveStyle: {
    kind: "choice",
    label: "Curve",
    default: "arc",
    options: ["arc", "elbow", "chevron"],
    names: { arc: "Arc", elbow: "Elbow", chevron: "Chevron" },
  },
  dimLevel: {
    kind: "range",
    label: "Dim",
    default: 0.3,
    min: 0.1,
    max: 0.6,
    step: 0.05,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

/** The feed opens a quarter hour in; the last three events stream in live. */
const FIRST = 13;
const EVERY_MS = 1600;
const START = "ev-07";

/**
 * Fieldline's eu-west sync incident as its agents wrote it: the retry storm
 * is selected, so its chain is lit on the first frame, and the recovery
 * streams in once the feed is on screen.
 */
export function CauseLinesDemo({
  chrome = true,
  // The feed is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [count, setCount] = React.useState(FIRST);
  const [live, setLive] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(START);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<string | null>(null);
  const [inView, setInView] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.2 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // One arrival at a time, only while live and on screen.
  React.useEffect(() => {
    if (!inView || !live || count >= defaultCauseEvents.length) return;
    const t = window.setTimeout(() => setCount((n) => n + 1), EVERY_MS);
    return () => window.clearTimeout(t);
  }, [inView, live, count, round]);

  const events = defaultCauseEvents.slice(0, count);

  const surface = (
    <CauseLines
      key={round}
      events={events}
      value={selected}
      onSelectEvent={(id) => setSelected(id)}
      onPinChain={(id) => setPinned(id)}
      onFilterAgent={(id) => setFilter(id)}
      status={live ? "live" : "paused"}
      onLiveChange={setLive}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrapRef} className="w-full max-w-md">
        {surface}
      </div>
    );
  }

  const title =
    defaultCauseEvents.find((e) => e.id === (pinned ?? selected))?.title ??
    "nothing selected";
  const agent = filter
    ? (defaultCauseAgents.find((a) => a.id === filter)?.name ?? filter)
    : "all agents";

  return (
    <div ref={wrapRef} className="flex w-full max-w-md flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setCount(FIRST);
            setLive(true);
            setSelected(START);
            setPinned(null);
            setFilter(null);
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
          {pinned ? `pinned · ${title}` : title}
        </span>
        {` · ${agent} · ${live ? "live" : "paused"} · ${count} events`}
      </p>
    </div>
  );
}
