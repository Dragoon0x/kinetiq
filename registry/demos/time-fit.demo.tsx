"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  TimeFit,
  defaultTimeFitSteps,
  formatClock,
  formatMinutes,
  packTimeFit,
} from "@/registry/ui/time-fit";

export const tweaks = defineTweaks({
  lineStyle: {
    kind: "choice",
    label: "Line",
    default: "rule",
    options: ["rule", "dashed", "band"],
    names: { rule: "Rule", dashed: "Dashed", band: "Band" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const START = 785;
const FIRST = 150;

/**
 * The card's one walk of the line: out to three and a half hours, a held
 * beat, back to three. Out, the load test squeezes in and pushes two small
 * steps below; back, they rise again — the re-pack in both directions.
 */
const WALK: { budget: number; wait: number }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    budget: FIRST + (i + 1) * 5,
    wait: i === 0 ? 1100 : 90,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    budget: FIRST + 60 - (i + 1) * 5,
    wait: i === 0 ? 1400 : 110,
  })),
];

/**
 * Fernworks launch day: the agent's checklist packed into the time left
 * before the release window closes.
 */
export function TimeFitDemo({
  chrome = true,
  // The plan is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [budget, setBudget] = React.useState(FIRST);
  const [pinned, setPinned] = React.useState<string[]>([]);
  const [approved, setApproved] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.4 });

  // The card walks the line once after it is first seen; every tick sets an
  // absolute budget, so a re-run after StrictMode's rehearsal replays cleanly.
  const [walked, setWalked] = React.useState(false);
  React.useEffect(() => {
    if (chrome || !inView || walked) return;
    const timers: number[] = [];
    let at = 0;
    WALK.forEach((tick, i) => {
      at += tick.wait;
      timers.push(
        window.setTimeout(() => {
          setBudget(tick.budget);
          if (i === WALK.length - 1) setWalked(true);
        }, at),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [chrome, inView, walked]);

  const plan = packTimeFit(defaultTimeFitSteps, pinned, budget);

  const surface = (
    <TimeFit
      key={round}
      budget={budget}
      onBudgetChange={(m) => {
        setBudget(m);
        setApproved(null);
      }}
      pinned={pinned}
      onPinStep={(id, on) => {
        setPinned((list) =>
          on ? [...list, id] : list.filter((p) => p !== id),
        );
        setApproved(null);
      }}
      onApprove={(p) =>
        setApproved(
          `approved · ${p.stepIds.length} ${p.stepIds.length === 1 ? "step" : "steps"} · finish ${formatClock(p.finish)}`,
        )
      }
      now={START}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-lg flex-col gap-4">
      <div className="w-full max-w-md self-center">{surface}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setBudget(FIRST);
            setPinned([]);
            setApproved(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className={plan.over ? "text-danger" : "text-signal"}>
          {approved ??
            (plan.over
              ? `over budget by ${formatMinutes(plan.minutes - budget)}`
              : `${plan.stepIds.length} of ${defaultTimeFitSteps.length} fit · ${formatMinutes(plan.minutes)} of ${formatMinutes(budget)}`)}
        </span>
        {approved ? null : ` · finish ${formatClock(START + plan.minutes)}`}
      </p>
    </div>
  );
}
