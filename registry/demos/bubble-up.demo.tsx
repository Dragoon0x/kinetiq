"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BubbleUp,
  defaultBubbleEvents,
  defaultBubbleNow,
  defaultBubbleProjects,
  defaultBubbleReadAt,
  type BubbleEvent,
} from "@/registry/ui/bubble-up";

export const tweaks = defineTweaks({
  liftDelay: {
    kind: "range",
    label: "Lift",
    default: 500,
    min: 0,
    max: 1200,
    step: 100,
    unit: "ms",
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const MIN = 60_000;
/** The morning's next four events, landing one at a time. */
const SCRIPT: BubbleEvent[] = [
  {
    id: "s1",
    projectId: "moss",
    at: defaultBubbleNow + 1 * MIN,
    by: "Jonas",
    kind: "upload",
  },
  {
    id: "s2",
    projectId: "halden",
    at: defaultBubbleNow + 2 * MIN,
    by: "Aiko",
    kind: "approval",
  },
  {
    id: "s3",
    projectId: "kestrel",
    at: defaultBubbleNow + 3 * MIN,
    by: "Priya",
    kind: "mention",
  },
  {
    id: "s4",
    projectId: "ostra",
    at: defaultBubbleNow + 4 * MIN,
    by: "Mara",
    kind: "comment",
  },
];
const EVERY_MS = 3200;

/**
 * Fernworks' client projects on a Thursday morning, with the ferry app
 * already up top. Once the list is on screen the next four events land
 * 3.2 s apart, and each project rises into Updated; open one to send it
 * home. Changing the lift delay plays the morning again.
 */
export function BubbleUpDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The list is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [round, setRound] = React.useState(0);
  const [landed, setLanded] = React.useState(0);
  const [read, setRead] = React.useState(defaultBubbleReadAt);
  const [inView, setInView] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const replay = () => {
    setRound((r) => r + 1);
    setLanded(0);
    setRead(defaultBubbleReadAt);
  };

  const lift = values.liftDelay ?? 500;
  const [seenLift, setSeenLift] = React.useState(lift);
  if (seenLift !== lift) {
    setSeenLift(lift);
    replay();
  }

  // One event at a time, only while on screen and visible; then it rests.
  React.useEffect(() => {
    if (!inView || landed >= SCRIPT.length) return;
    const t = window.setTimeout(() => {
      if (!document.hidden) setLanded((n) => n + 1);
    }, EVERY_MS);
    return () => window.clearTimeout(t);
  }, [inView, landed, round]);

  const events = React.useMemo(
    () => [...defaultBubbleEvents, ...SCRIPT.slice(0, landed)],
    [landed],
  );
  const now = defaultBubbleNow + landed * MIN + 30_000;

  const surface = (
    <BubbleUp
      key={round}
      events={events}
      now={now}
      readAt={read}
      onMarkRead={(_ids, next) => setRead(next)}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrapRef} className="w-full max-w-80">
        {surface}
      </div>
    );
  }

  const updated = defaultBubbleProjects.filter((p) =>
    events.some((e) => e.projectId === p.id && e.at > (read[p.id] ?? 0)),
  );
  const last = landed > 0 ? SCRIPT[landed - 1] : undefined;
  const lastName = defaultBubbleProjects.find(
    (p) => p.id === last?.projectId,
  )?.name;

  return (
    <div ref={wrapRef} className="flex w-full max-w-80 flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={replay}
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
        <span className="text-signal">{`${updated.length} updated`}</span>
        {lastName ? ` · ${lastName} rose` : " · waiting for activity"}
      </p>
    </div>
  );
}
