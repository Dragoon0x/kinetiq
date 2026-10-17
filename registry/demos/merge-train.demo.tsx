"use client";

import * as React from "react";

import { OctagonPause, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTrainChanges,
  MergeTrain,
  type TrainChange,
} from "@/registry/ui/merge-train";

export const tweaks = defineTweaks({
  carStyle: {
    kind: "choice",
    label: "Cars",
    default: "card",
    options: ["card", "pill", "boxcar"],
    names: { card: "Card", pill: "Pill", boxcar: "Boxcar" },
  },
  trackStyle: {
    kind: "choice",
    label: "Track",
    default: "rails",
    options: ["rails", "transit", "ruled"],
    names: { rails: "Rails", transit: "Transit", ruled: "Ruled" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const FIRST_ORDER = ["pr-2486", "pr-2488", "pr-2490"];

const set = (
  list: TrainChange[],
  id: string,
  patch: Partial<TrainChange>,
): TrainChange[] => list.map((c) => (c.id === id ? { ...c, ...patch } : c));

const TESTS = (
  unit: "pending" | "running" | "passed",
): TrainChange["checks"] => [
  { label: "Unit", state: unit },
  { label: "Lint", state: "pending" },
  { label: "Integration", state: "pending" },
];
const REVIEW: TrainChange["checks"] = [
  { label: "Ines Varga", state: "running" },
  { label: "Code owners", state: "pending" },
];
const MERGE: TrainChange["checks"] = [
  { label: "Rebase on main", state: "passed", note: "clean" },
  { label: "Merge", state: "running" },
];

type Step = {
  wait: number;
  note: string;
  merged?: number;
  run: (list: TrainChange[]) => TrainChange[];
};

/**
 * The run, in three beats: PR 2484’s integration tests fail and it drops onto
 * the siding while PR 2486 closes the gap; then the head merges and the whole
 * train advances, twice.
 */
const STEPS: Step[] = [
  {
    wait: 1900,
    note: "PR 2484 failed at tests · train closes up",
    run: (l) =>
      set(
        set(l, "pr-2484", {
          result: "failed",
          failedReason: "3 tests failed in sync/retry_spec.",
          checks: [
            { label: "Unit", state: "passed", note: "1m 12s" },
            { label: "Lint", state: "passed", note: "8s" },
            { label: "Integration", state: "failed", note: "3 failed" },
          ],
        }),
        "pr-2486",
        {
          stop: 0,
          result: "running",
          progress: 0.25,
          checks: TESTS("running"),
        },
      ),
  },
  {
    wait: 2300,
    note: "PR 2479 merged · train advances",
    merged: 1,
    run: (l) =>
      set(
        set(
          set(set(l, "pr-2479", { result: "merged" }), "pr-2481", {
            stop: 2,
            result: "running",
            progress: 0.3,
            checks: MERGE,
          }),
          "pr-2486",
          { stop: 1, result: "running", progress: 0.2, checks: REVIEW },
        ),
        "pr-2488",
        {
          stop: 0,
          result: "running",
          progress: 0.15,
          checks: TESTS("running"),
        },
      ),
  },
  {
    wait: 2300,
    note: "PR 2481 merged · train advances",
    merged: 2,
    run: (l) =>
      set(
        set(
          set(set(l, "pr-2481", { result: "merged" }), "pr-2486", {
            stop: 2,
            result: "running",
            progress: 0.35,
            checks: MERGE,
          }),
          "pr-2488",
          { stop: 1, result: "running", progress: 0.4, checks: REVIEW },
        ),
        "pr-2490",
        { stop: 0, result: "running", progress: 0.2, checks: TESTS("running") },
      ),
  },
];

/**
 * Waylight's agent fleet working through the merge train for waylight/app:
 * once it is on screen, a seeded script runs three beats of the queue.
 */
export function MergeTrainDemo({
  chrome = true,
  // The train is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [changes, setChanges] = React.useState(defaultTrainChanges);
  const [order, setOrder] = React.useState(FIRST_ORDER);
  const [step, setStep] = React.useState(0);
  const [merged, setMerged] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const [note, setNote] = React.useState("tests, review, merge · 6 changes");
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

  React.useEffect(() => {
    const next = STEPS[step];
    if (!inView || held || !next) return;
    const t = window.setTimeout(() => {
      const after = next.run(changes);
      setChanges(after);
      // Cars that left the depot leave the queue order too.
      setOrder((o) =>
        o.filter((id) => (after.find((c) => c.id === id)?.stop ?? 0) < 0),
      );
      if (next.merged !== undefined) setMerged(next.merged);
      setNote(next.note);
      setStep((s) => s + 1);
    }, next.wait);
    return () => window.clearTimeout(t);
  }, [inView, held, step, changes]);

  const surface = (
    <MergeTrain
      key={round}
      changes={changes}
      order={order}
      onReorder={(ids) => {
        setOrder(ids);
        setNote("queue reordered");
      }}
      onRetry={(change) => {
        setChanges((l) =>
          set(l, change.id, {
            stop: -1,
            result: "queued",
            checks: undefined,
            progress: undefined,
            failedReason: undefined,
          }),
        );
        setOrder((o) => [...o.filter((id) => id !== change.id), change.id]);
        setNote(`PR ${change.number} back in the depot`);
      }}
      onRemoveCar={(change) => {
        setChanges((l) => l.filter((c) => c.id !== change.id));
        setOrder((o) => o.filter((id) => id !== change.id));
        setNote(`PR ${change.number} pulled from the train`);
      }}
      onOpenChange={(id) => {
        const c = changes.find((x) => x.id === id);
        if (c) setNote(`opened PR ${c.number}`);
      }}
      held={held}
      merged={merged}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={wrapRef} className="w-full">
        {surface}
      </div>
    );
  }

  const inTrain = changes.filter(
    (c) => c.result !== "merged" && c.result !== "failed",
  ).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={wrapRef} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={held}
          onClick={() => {
            setHeld((h) => !h);
            setNote(held ? "train released" : "train held");
          }}
          className={cn(
            button,
            held && "border-warn/50 text-warn hover:text-warn",
          )}
        >
          <OctagonPause aria-hidden className="size-3.5" />
          {held ? "Release train" : "Hold train"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setChanges(defaultTrainChanges);
            setOrder(FIRST_ORDER);
            setStep(0);
            setMerged(0);
            setHeld(false);
            setNote("tests, review, merge · 6 changes");
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span>
        {` · ${inTrain} in train · ${merged} merged`}
      </p>
    </div>
  );
}
