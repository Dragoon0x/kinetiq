"use client";

import * as React from "react";

import { ConveyorList } from "@/registry/ui/conveyor-list";
import { Readout } from "@/registry/ui/readout";
import { StatusPip } from "@/registry/ui/status-pip";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type FloorEvent = {
  id: string;
  /** What happened, in one clause. */
  line: string;
  /** Where, kept coarse — a floor feed is not a customer list. */
  place: string;
};

export type FloorCount = { id: string; label: string; value: number };

export type ProofLiveFloorProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  /** The pool the feed cycles through, oldest last. */
  events?: FloorEvent[];
  counts?: FloorCount[];
  /** Seconds between arrivals. @default 3.5 */
  interval?: number;
  /** Rows held before the rest fold into the overflow count. @default 5 */
  visible?: number;
  className?: string;
};

const DEFAULT_EVENTS: FloorEvent[] = [
  {
    id: "e1",
    line: "A yard cleared its morning before the gate opened",
    place: "Rotterdam",
  },
  {
    id: "e2",
    line: "Two crews took a reshuffle without a phone call",
    place: "Tacoma",
  },
  {
    id: "e3",
    line: "A crane hold propagated to four boards",
    place: "Algeciras",
  },
  { id: "e4", line: "A shift closed itself into the ledger", place: "Gdańsk" },
  {
    id: "e5",
    line: "A supervisor overrode the plan and said why",
    place: "Santos",
  },
  { id: "e6", line: "A new yard cut its first board", place: "Busan" },
  {
    id: "e7",
    line: "An audit was answered from exports alone",
    place: "Felixstowe",
  },
  {
    id: "e8",
    line: "A handover note was signed at the gate",
    place: "Halifax",
  },
];

const DEFAULT_COUNTS: FloorCount[] = [
  { id: "c1", label: "yards on the record", value: 214 },
  { id: "c2", label: "mornings cut this week", value: 1489 },
  { id: "c3", label: "boards live right now", value: 37 },
];

/** How recent a row reads, by its position rather than by the clock. */
const AGE_LABELS = ["just now", "1 min", "3 min", "6 min", "11 min", "18 min"];

/**
 * Proof as the floor itself, running: a live feed of what is happening across
 * every yard right now, arriving on the conveyor with the standing counts
 * above it. Where the evidence band assembles a case from logos, metrics, and
 * a quote, this one makes the simpler and harder argument — that the thing is
 * in use at this moment, and here is it happening. Places stay coarse,
 * because a floor feed is proof, not a customer list.
 */
export function ProofLiveFloor({
  eyebrow = "Waylight · the floor, now",
  headline = "Somewhere it is 06:40.",
  copy = "Every line below is a real shape of event from a live yard. Names never appear — the argument is the volume and the ordinariness of it.",
  events = DEFAULT_EVENTS,
  counts = DEFAULT_COUNTS,
  interval = 3.5,
  visible = 5,
  className,
}: ProofLiveFloorProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  // Deterministic rotation: the server renders tick 0, and the client walks
  // the same pool forward. No clock, no randomness, so no hydration drift.
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (events.length === 0) return;
    const ms = Math.max(1, interval) * 1000;
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [events.length, interval]);

  const feed = React.useMemo(() => {
    if (events.length === 0) return [];
    return Array.from(
      // Exactly the window, never one more: a permanent "+1 more" would
      // claim a backlog that does not exist.
      { length: Math.min(visible, events.length) },
      (_, i) => {
        const event = events[(tick - i + events.length * 64) % events.length];
        return {
          ...(event as FloorEvent),
          // The key must be unique per arrival, or the conveyor treats a
          // returning event as a reorder instead of a new row.
          rowId: `${event?.id ?? i}-${tick - i}`,
          age: AGE_LABELS[Math.min(i, AGE_LABELS.length - 1)] ?? "earlier",
        };
      },
    );
  }, [events, tick, visible]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <dl className="mt-10 grid gap-6 border-y border-hairline py-6 sm:grid-cols-3">
          {counts.map((count) => (
            <div key={count.id} className="min-w-0">
              <dd>
                <Readout value={count.value} size="lg" />
              </dd>
              <dt className="mt-1 text-label text-ink-3">{count.label}</dt>
            </div>
          ))}
        </dl>

        <div className="mt-8">
          <p className="mb-3 flex items-center gap-2">
            <StatusPip status="online" label="Live floor" pulse={motionSafe} />
          </p>
          <ConveyorList
            items={feed}
            keyFor={(item) => item.rowId}
            announceItem={(item) => `${item.line}, ${item.place}`}
            label="Live floor activity"
            side="top"
            maxVisible={visible}
            renderItem={(item) => (
              <div className="flex min-w-0 items-baseline gap-3 rounded-2 border border-hairline bg-surface-1 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {item.line}
                </span>
                <span className="shrink-0 font-mono text-[11px] tracking-[0.06em] text-ink-3">
                  {item.place}
                </span>
                <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 sm:inline">
                  {item.age}
                </span>
              </div>
            )}
          />
        </div>
      </div>
    </section>
  );
}
