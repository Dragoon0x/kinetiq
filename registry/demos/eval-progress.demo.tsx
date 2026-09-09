"use client";

import * as React from "react";

import { EvalProgress, type EvalStatus } from "@/registry/ui/eval-progress";

const NAMES =
  "Late trailer|Two-stop merge|Depot handover|Wrong postcode|Return leg|Fuel stop|Night window|Cold chain|Bridge closure|Split load|Signature miss|Weight check|Toll route|Rest break|Address change|Locker drop|Priority swap|Final mile".split(
    "|",
  );

/** Cases that fail, chosen so the rate dips early and again near the end. */
const FAILS = new Set([3, 8, 11, 15]);

/** Cumulative landing times in ms from a seeded step so every run replays alike. */
const ARRIVE = NAMES.map((_, index) => {
  let clock = 180;
  for (let step = 0; step <= index; step += 1) {
    clock += 150 + ((step * 104729) % 4) * 45;
  }
  return clock;
});
const END = ARRIVE[ARRIVE.length - 1] ?? 0;
const TICK = 40;

export function EvalProgressDemo() {
  const [clock, setClock] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = clock + TICK;
        setClock(next);
        if (next >= END) setPlaying(false);
      }, TICK);
    };
    // A hidden tab holds the run where it is and resumes on return.
    const onVisibility = () => {
      window.clearTimeout(timer);
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, clock]);

  const results = NAMES.map((name, index) => {
    const landed = (ARRIVE[index] ?? 0) <= clock;
    const status: EvalStatus = !landed
      ? "pending"
      : FAILS.has(index)
        ? "fail"
        : "pass";
    return { id: `case-${index}`, name, status };
  });
  const done = results.filter((item) => item.status !== "pending").length;
  const passed = results.filter((item) => item.status === "pass").length;
  const failed = done - passed;
  const complete = done === NAMES.length;
  const rate = done > 0 ? Math.round((passed / done) * 100) : 0;

  const start = () => {
    setClock(0);
    setPlaying(true);
  };

  const line = complete
    ? ["Done ·", `${passed} of ${NAMES.length} passed`, `· ${rate}%`]
    : playing
      ? ["Running ·", `${done} of ${NAMES.length}`, `· ${failed} failed`]
      : ["Press run ·", `${NAMES.length} cases`, ""];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          Basinworks Scout
        </span>
        <EvalProgress
          label="Dispatch suite"
          results={results}
          playing={playing}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={playing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {clock > 0 ? "Run again" : "Run"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>{" "}
        {line[2]}
      </p>
    </div>
  );
}
