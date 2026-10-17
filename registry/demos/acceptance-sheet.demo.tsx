"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw, Wrench } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AcceptanceSheet,
  defaultAcceptanceSteps,
  type AcceptanceState,
  type AcceptanceStep,
  type AcceptanceVerdict,
} from "@/registry/ui/acceptance-sheet";

export const tweaks = defineTweaks({
  stampStyle: {
    kind: "choice",
    label: "Stamp",
    default: "seal",
    options: ["seal", "tag", "tick"],
    names: { seal: "Seal", tag: "Tag", tick: "Tick" },
  },
  paper: {
    kind: "choice",
    label: "Paper",
    default: "plain",
    options: ["plain", "ruled", "grid"],
    names: { plain: "Plain", ruled: "Ruled", grid: "Grid" },
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

type Verdicts = Record<string, AcceptanceVerdict>;

const titleOf = (id: string) =>
  defaultAcceptanceSteps
    .flatMap((s) => s.criteria)
    .find((c) => c.id === id)
    ?.text.toLowerCase() ?? id;

/** Where the run is when the sheet is first seen: the agent on its first check. */
const START: Verdicts = {
  days: "checking",
  cutoff: "pending",
  totals: "pending",
  regions: "pending",
  ontime: "pending",
  csv: "pending",
};

/** The agent working down the sheet: one verdict at a time, one failure. */
const SCRIPT: [number, string, AcceptanceVerdict][] = [
  [900, "days", "pass"],
  [1300, "cutoff", "checking"],
  [1900, "cutoff", "pass"],
  [2300, "totals", "checking"],
  [3100, "totals", "fail"],
  [3700, "regions", "pass"],
  [4300, "ontime", "checking"],
];

const FIXED: Verdicts = {
  days: "pass",
  cutoff: "pass",
  totals: "pass",
  regions: "pass",
  ontime: "pass",
  csv: "pass",
};

const withVerdicts = (v: Verdicts): AcceptanceStep[] =>
  defaultAcceptanceSteps.map((step) => ({
    ...step,
    criteria: step.criteria.map((c) => ({
      ...c,
      verdict: v[c.id] ?? c.verdict,
      evidence:
        c.id === "ontime" && v.ontime === "pass"
          ? { label: "Send log", source: "Mail", excerpt: "Mon 13 Oct, 08:52" }
          : c.id === "csv" && v.csv === "pass"
            ? {
                label: "basin-week-41.csv",
                source: "Attachment",
                excerpt: "6 rows · 2.1 KB",
              }
            : c.id === "totals" && v.totals === "pass"
              ? {
                  label: "Reconciliation",
                  source: "Diff",
                  excerpt: "All regions match · Δ 0.00",
                }
              : c.evidence,
    })),
  }));

/**
 * Basinworks, the weekly report: the agent verifies its own plan line by
 * line, and the totals check fails and sends step two back.
 */
export function AcceptanceSheetDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [verdicts, setVerdicts] = React.useState<Verdicts>(START);
  const [state, setState] = React.useState<AcceptanceState>("in-progress");
  const [said, setSaid] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const [played, setPlayed] = React.useState(false);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });

  // The agent works down the sheet once it is seen; every beat sets an
  // absolute verdict, so a rehearsal re-run replays cleanly.
  React.useEffect(() => {
    if (!inView || played) return;
    const timers = SCRIPT.map(([at, id, verdict], i) =>
      window.setTimeout(() => {
        setVerdicts((v) => ({ ...v, [id]: verdict }));
        if (i === SCRIPT.length - 1) setPlayed(true);
      }, at),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [inView, played]);

  const steps = React.useMemo(() => withVerdicts(verdicts), [verdicts]);
  const all = Object.values(verdicts);
  const passed = all.filter((v) => v === "pass").length;
  const failed = all.filter((v) => v === "fail").length;

  const surface = (
    <AcceptanceSheet
      key={round}
      steps={steps}
      state={state}
      onOverride={(id, verdict) =>
        setSaid(
          `overridden · ${titleOf(id)} · ${verdict === "pass" ? "verified" : "failed"}`,
        )
      }
      onOpenEvidence={(_, evidence) =>
        setSaid(`evidence · ${evidence.label.toLowerCase()}`)
      }
      onSignOff={() => {
        setState("signed-off");
        setSaid("signed off · rae okafor");
      }}
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
    "hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-xl flex-col gap-4">
      <div className="w-full self-center">{surface}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!played || state === "signed-off" || passed === all.length}
          onClick={() => {
            setVerdicts(FIXED);
            setSaid("agent fixed the refund · every check re-run");
          }}
          className={button}
        >
          <Wrench aria-hidden className="size-3.5" />
          Fix and re-check
        </button>
        <button
          type="button"
          onClick={() => {
            setVerdicts(START);
            setState("in-progress");
            setSaid(null);
            setPlayed(false);
            setRound((r) => r + 1);
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
        <span className={failed && !said ? "text-danger" : "text-signal"}>
          {said ??
            `${state === "signed-off" ? "signed off" : "in progress"} · ${passed} of ${all.length} verified${failed ? ` · ${failed} failed` : ""}`}
        </span>{" "}
        · basinworks weekly report
      </p>
    </div>
  );
}
