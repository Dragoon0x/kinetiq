"use client";

import * as React from "react";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultRunCode,
  defaultRunFigures,
  defaultRunOutputs,
  RunCell,
  type RunCellStatus,
  type RunError,
  type RunFigure,
  type RunOutput,
} from "@/registry/ui/run-cell";

export const tweaks = defineTweaks({
  codeTheme: {
    kind: "choice",
    label: "Code",
    default: "paper",
    options: ["paper", "ink", "tint"],
    names: { paper: "Paper", ink: "Ink", tint: "Tint" },
  },
  gutterStyle: {
    kind: "choice",
    label: "Gutter",
    default: "ticks",
    options: ["ticks", "bar", "dots"],
    names: { ticks: "Ticks", bar: "Bar", dots: "Dots" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const LINES = defaultRunCode.split("\n");
/** How long each line takes to run, ms: the load and the plot are the slow ones. */
const COST = [
  220, 0, 520, 60, 0, 60, 120, 160, 80, 180, 0, 100, 120, 100, 140, 0, 420, 160,
];
const FAIL_LINE = 9;
const ERROR: RunError = {
  line: FAIL_LINE,
  name: "IndexError",
  message: "list index out of range",
  trace: [
    "Traceback (most recent call last):",
    `  File "<cell 7>", line ${FAIL_LINE}, in <module>`,
    "    base = series[0]",
    "IndexError: list index out of range",
    "  (sensor P-104 returned no readings for line-4)",
  ],
};

type Run = {
  lines: number;
  executed: number;
  outputs: RunOutput[];
  figures: RunFigure[];
  status: RunCellStatus;
  elapsed: number;
  error?: RunError;
};

const FIRST: Run = {
  lines: 3,
  executed: 0,
  outputs: [],
  figures: [],
  status: "queued",
  elapsed: 0,
};

type Step = { wait: number; next: (r: Run) => Run };

/** The call as it streams: the code is written, then run line by line. */
function script(fail: boolean): Step[] {
  const steps: Step[] = [];
  for (let i = 3; i < LINES.length; i += 1) {
    steps.push({ wait: 55, next: (r) => ({ ...r, lines: i + 1 }) });
  }
  steps.push({ wait: 260, next: (r) => ({ ...r, status: "running" }) });
  for (let i = 0; i < LINES.length; i += 1) {
    const cost = COST[i] ?? 80;
    if (fail && i === FAIL_LINE - 1) {
      steps.push({
        wait: 180,
        next: (r) => ({
          ...r,
          status: "error",
          error: ERROR,
          elapsed: r.elapsed + 180,
        }),
      });
      return steps;
    }
    steps.push({
      wait: cost,
      next: (r) => ({
        ...r,
        executed: i + 1,
        elapsed: r.elapsed + cost,
        outputs:
          i === 2 && defaultRunOutputs[0]
            ? [...r.outputs, defaultRunOutputs[0]]
            : r.outputs,
      }),
    });
    if (i === 14) {
      for (const o of defaultRunOutputs.slice(1)) {
        steps.push({
          wait: 110,
          next: (r) => ({
            ...r,
            outputs: [...r.outputs, o],
            elapsed: r.elapsed + 110,
          }),
        });
      }
    }
  }
  steps.push({
    wait: 300,
    next: (r) => ({
      ...r,
      figures: defaultRunFigures,
      status: "done",
      elapsed: r.elapsed + 300,
    }),
  });
  return steps;
}

/** Where a re-run starts: the code is already written. */
const RUN_FROM = LINES.length - 3;

/**
 * Gaugeworks' sensor drift check for line 4: the agent writes the code,
 * the runtime runs it, prints the worst drift per sensor and returns the
 * plot, which develops in the Figure tab.
 */
export function RunCellDemo({
  chrome = true,
  // The cell is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [fail, setFail] = React.useState(false);
  const [run, setRun] = React.useState<Run>(FIRST);
  const [step, setStep] = React.useState(0);
  const [round, setRound] = React.useState(0);
  const [inView, setInView] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const steps = React.useMemo(() => script(fail), [fail]);

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

  const halted = run.status === "stopped" || run.status === "error";
  React.useEffect(() => {
    const next = steps[step];
    if (!inView || halted || !next) return;
    const t = window.setTimeout(() => {
      setRun((r) => next.next(r));
      setStep((s) => s + 1);
    }, next.wait);
    return () => window.clearTimeout(t);
  }, [inView, halted, step, steps, round]);

  const restart = (written: boolean) => {
    setRun(written ? { ...FIRST, lines: LINES.length } : FIRST);
    setStep(written ? RUN_FROM : 0);
    setRound((r) => r + 1);
  };

  const surface = (
    <RunCell
      code={LINES.slice(0, run.lines).join("\n")}
      executedLine={run.executed}
      outputs={run.outputs}
      figures={run.figures}
      status={run.status}
      error={run.error}
      elapsed={run.elapsed}
      onRerun={() => restart(true)}
      onStop={() => setRun((r) => ({ ...r, status: "stopped" }))}
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

  const where =
    run.status === "queued"
      ? `writing the code · ${run.lines} of ${LINES.length} lines`
      : run.status === "running"
        ? `running · line ${Math.min(run.executed + 1, LINES.length)} of ${LINES.length}`
        : run.status === "done"
          ? `done · ${(run.elapsed / 1000).toFixed(1)} s · 1 figure`
          : run.status === "error"
            ? `error · line ${FAIL_LINE} · indexerror`
            : `stopped · line ${run.executed + 1}`;

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
          aria-pressed={fail}
          onClick={() => {
            setFail((f) => !f);
            restart(true);
          }}
          className={cn(
            button,
            fail && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          <TriangleAlert aria-hidden className="size-3.5" />
          {`Fail at line ${FAIL_LINE}`}
        </button>
        <button type="button" onClick={() => restart(false)} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{where}</span>
        {" · gaugeworks · line-4 drift"}
      </p>
    </div>
  );
}
