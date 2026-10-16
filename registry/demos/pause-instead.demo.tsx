"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultPauseInsteadPlan,
  PauseInstead,
  type PauseInsteadStep,
} from "@/registry/ui/pause-instead";

export const tweaks = defineTweaks({
  listStyle: {
    kind: "choice",
    label: "List",
    default: "switch",
    options: ["switch", "strike", "tiles"],
    names: { switch: "Switch", strike: "Strike", tiles: "Tiles" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "calm",
    options: ["calm", "warm", "mono"],
    names: { calm: "Calm", warm: "Warm", mono: "Mono" },
  },
});

const ANSWER_MS = 600;
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const short = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

/**
 * A Fieldline workspace owner cancelling Team: eight seats, paid through 12
 * November. Every decision answers after 600ms; the first cancel fails once,
 * so the message has somewhere to show.
 */
export function PauseInsteadDemo({
  chrome = true,
  // The flow is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const first: PauseInsteadStep = chrome ? "reason" : "losses";
  const [step, setStep] = React.useState<PauseInsteadStep>(first);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const cancels = React.useRef(0);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const later = <T,>(value: T, fail = false) =>
    new Promise<T>((resolve, reject) => {
      timers.current.push(
        window.setTimeout(
          () =>
            fail
              ? reject(
                  new Error(
                    "Fieldline couldn't reach billing. Nothing has changed.",
                  ),
                )
              : resolve(value),
          ANSWER_MS,
        ),
      );
    });

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    cancels.current = 0;
    setStep(first);
    setNote(null);
    setRound((r) => r + 1);
  };
  // The gallery card replays itself a while after it reaches an outcome.
  const resetSoon = () => {
    if (!chrome) timers.current.push(window.setTimeout(reset, 4000));
  };

  const surface = (
    <PauseInstead
      key={round}
      defaultStep={first}
      onStepChange={(next) => {
        setStep(next);
        if (next !== "done") setNote(null);
      }}
      onPause={async ({ resumesAt }) => {
        await later(true);
        setNote(`paused until ${short(resumesAt)}`);
        resetSoon();
      }}
      onDowngrade={async ({ plan }) => {
        await later(true);
        setNote(`on ${plan.toLowerCase()} from 12 nov 2026`);
        resetSoon();
      }}
      onCancel={async () => {
        cancels.current += 1;
        if (cancels.current === 1) {
          setNote("cancel failed · still on team");
          await later(false, true);
        }
        await later(true);
        setNote("team cancelled · ends 12 nov 2026");
        resetSoon();
      }}
      onExit={(outcome) => {
        setNote(outcome === "kept" ? "kept team" : `${outcome} · done`);
        if (!chrome) timers.current.push(window.setTimeout(reset, 1600));
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const where =
    step === "reason"
      ? "step 1 of 3 · reason"
      : step === "losses"
        ? `step 2 of 3 · ${defaultPauseInsteadPlan.name.toLowerCase()} ends 12 nov`
        : step === "decide"
          ? "step 3 of 3 · decide"
          : "done";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {note ? (
          <>
            <span className="text-signal">{note}</span> · {where}
          </>
        ) : (
          <>
            <span className="text-signal">{where}</span> · 3 things switch off
          </>
        )}
      </p>
    </div>
  );
}
