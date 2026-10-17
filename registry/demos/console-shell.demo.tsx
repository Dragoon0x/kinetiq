"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  ConsoleShell,
  defaultConsoleHistory,
  defaultConsoleOutput,
  defaultConsoleProblems,
  type ConsoleBuild,
  type ConsoleLine,
  type ConsolePanelTab,
  type ConsoleProblem,
} from "@/registry/ui/console-shell";

export const tweaks = defineTweaks({
  snapPoints: {
    kind: "choice",
    label: "Snaps",
    default: "quarter",
    options: ["quarter", "half", "free"],
    names: { quarter: "Quarter", half: "Half", free: "Free" },
  },
  statusStyle: {
    kind: "choice",
    label: "Status",
    default: "counts",
    options: ["counts", "pills", "minimal"],
    names: { counts: "Counts", pills: "Pills", minimal: "Minimal" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

type Step = { line: ConsoleLine; problem?: ConsoleProblem };

/** The build the demo replays: compile lines, and the problems as the compiler finds them. */
const SCRIPT: Step[] = [
  { line: { id: "b2", text: "Compiling src/main.c", tone: "muted" } },
  {
    line: {
      id: "b3",
      text: "src/main.c:12:9: warning: result of ‘watchdog_kick’ is ignored",
      tone: "warn",
    },
    problem: defaultConsoleProblems[3],
  },
  { line: { id: "b4", text: "Compiling src/sensor.c", tone: "muted" } },
  {
    line: {
      id: "b5",
      text: "src/sensor.c:18:20: error: expected ‘;’ after expression",
      tone: "error",
    },
    problem: defaultConsoleProblems[0],
  },
  {
    line: {
      id: "b6",
      text: "src/sensor.c:24:12: error: implicit declaration of function ‘calibrate’",
      tone: "error",
    },
    problem: defaultConsoleProblems[1],
  },
  { line: { id: "b7", text: "Compiling src/display.c", tone: "muted" } },
  {
    line: {
      id: "b8",
      text: "src/display.c:5:9: warning: unused variable ‘frame_ms’",
      tone: "warn",
    },
    problem: defaultConsoleProblems[2],
  },
  {
    line: {
      id: "b9",
      text: "board.toml:8: warning: pin PA4 is already the gauge ADC input",
      tone: "warn",
    },
    problem: defaultConsoleProblems[4],
  },
];
const STEP_MS = 320;

const NAMES: Record<string, string> = {
  "0": "closed",
  "0.25": "quarter",
  "0.5": "half",
  "1": "full",
};

/**
 * The Gaugeworks gauge firmware: sensor.c open, a failing build. The
 * gallery card pulls the panel up to a quarter once it is seen. On the stage,
 * Build (or `gauge build` in the console) runs the build again: the log
 * streams and each problem lands in the status bar's counts as the compiler
 * finds it. The build runs only while the frame is on screen and the page is
 * visible.
 */
export function ConsoleShellDemo({
  chrome = true,
  // The shell is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [panel, setPanel] = React.useState(chrome ? 0.25 : 0);
  const [tab, setTab] = React.useState<ConsolePanelTab>("problems");
  const [build, setBuild] = React.useState<ConsoleBuild>("failed");
  const [step, setStep] = React.useState(-1);
  const [history, setHistory] = React.useState<ConsoleLine[]>(
    defaultConsoleHistory,
  );
  const [inView, setInView] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);
  const serial = React.useRef(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        const seen = !!entry?.isIntersecting;
        setInView(seen);
        window.clearTimeout(timer);
        if (seen && !chrome && !once.current) {
          timer = window.setTimeout(() => {
            once.current = true;
            setPanel(0.25);
          }, 1000);
        }
      },
      { threshold: 0.2 },
    );
    io.observe(node);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [chrome]);

  // One compiler step a beat, only while building, seen and visible.
  const building = build === "building";
  React.useEffect(() => {
    if (!building || !inView) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setStep((s) => s + 1);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [building, inView]);
  // The last step settles the build; a state, not a timer, so it never races.
  const finished = building && step >= SCRIPT.length;
  if (finished) setBuild("failed");

  const startBuild = () => {
    if (building) return;
    setStep(0);
    setBuild("building");
    setTab("output");
    if (panel === 0) setPanel(0.5);
  };

  const run = (cmd: string) => {
    serial.current += 1;
    const n = serial.current;
    const say = (text: string, tone: ConsoleLine["tone"]): ConsoleLine => ({
      id: `r${n}-${tone ?? "x"}`,
      text,
      tone,
    });
    const echo = say(`$ ${cmd}`, "command");
    if (/^(gauge\s+)?build\b/.test(cmd)) {
      setHistory((h) => [...h, echo, say("Build started.", "muted")]);
      startBuild();
    } else if (/^(gauge\s+)?flash\b/.test(cmd)) {
      setHistory((h) => [
        ...h,
        echo,
        say(
          building
            ? "Wait for the build to finish."
            : "Nothing to flash: the last build failed.",
          "warn",
        ),
      ]);
    } else if (cmd === "clear") {
      setHistory([]);
    } else {
      setHistory((h) => [
        ...h,
        echo,
        say(`gauge: no command ‘${cmd}’. Try build or flash.`, "error"),
      ]);
    }
  };

  const shown = Math.min(Math.max(step, 0), SCRIPT.length);
  const live = build === "building" || step >= 0;
  const output: ConsoleLine[] = live
    ? [
        {
          id: "b1",
          text: "> gauge build --board gauge-r3",
          tone: "command",
        },
        ...SCRIPT.slice(0, shown).map((s) => s.line),
        ...(build === "failed" && step >= SCRIPT.length
          ? [
              {
                id: "b10",
                text: "Build failed · 2 errors, 3 warnings · 2.6 s",
                tone: "error" as const,
              },
            ]
          : []),
      ]
    : defaultConsoleOutput;
  const problems: ConsoleProblem[] = live
    ? SCRIPT.slice(0, shown)
        .map((s) => s.problem)
        .filter((p): p is ConsoleProblem => !!p)
    : defaultConsoleProblems;

  const shell = (
    <ConsoleShell
      panel={panel}
      onPanelResize={setPanel}
      tab={tab}
      onTabChange={setTab}
      problems={problems}
      output={output}
      history={history}
      build={build}
      buildProgress={shown / SCRIPT.length}
      onRunCommand={run}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-3xl">
        {shell}
      </div>
    );
  }

  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;
  const height = NAMES[String(panel)] ?? `${Math.round(panel * 100)}%`;

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {shell}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setStep(-1);
            setBuild("failed");
            setHistory(defaultConsoleHistory);
            setTab("problems");
            setPanel(0.25);
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
        <span className="text-signal">{`panel ${height} · ${tab}`}</span>
        {` · ${errors} ${errors === 1 ? "error" : "errors"} ${warnings} ${warnings === 1 ? "warning" : "warnings"} · ${build === "building" ? "building" : "build failed"}`}
      </p>
    </div>
  );
}
