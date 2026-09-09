"use client";

import * as React from "react";

import {
  TimeDivider,
  type TimeDividerMessage,
} from "@/registry/ui/time-divider";

const TODAY = "2026-03-05";

/** Coldbrook dispatch across three days, as author|at|text; the first two are history at load. */
const LINES = [
  "Marta|2026-03-02T16:40|Two vans out of Coldbrook tomorrow, both before eight.",
  "Ines|2026-03-02T16:52|Noted. Basinworks pallets go on the first one.",
  "Marta|2026-03-04T07:15|First van loaded. Second is waiting on the cold chain seal.",
  "Ines|2026-03-04T07:21|Seal's in the office drawer, left side.",
  "Marta|2026-03-05T09:12|Both back. One pallet short at Basinworks, they signed anyway.",
  "Ines|2026-03-05T09:14|I'll ring them before the invoice goes.",
];

const SCRIPT: TimeDividerMessage[] = LINES.map((line, index) => {
  const [author = "", at = "", text = ""] = line.split("|");
  return { id: `m${index + 1}`, author, at, text, mine: author === "Ines" };
});

const HISTORY = 2;
const GAP_MS = 1300;

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TimeDividerDemo() {
  const [count, setCount] = React.useState(HISTORY);
  const [playing, setPlaying] = React.useState(false);
  const [crossed, setCrossed] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!playing) return;
    let timer = 0;
    const arm = () => {
      if (document.hidden) return;
      timer = window.setTimeout(() => {
        const next = count + 1;
        setCount(next);
        if (next >= SCRIPT.length) setPlaying(false);
      }, GAP_MS);
    };
    // A hidden tab holds the script where it is and resumes on return.
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
  }, [playing, count]);

  const shown = SCRIPT.slice(0, count);
  const days = new Set(shown.map((message) => message.at.slice(0, 10))).size;
  const settled = count >= SCRIPT.length;

  /** Rewinds to the history and either replays it or leaves it idle. */
  const rewind = (play: boolean) => {
    setCount(HISTORY);
    setCrossed(null);
    setPlaying(play);
  };

  const dayWord = `${days} ${days === 1 ? "day" : "days"}`;
  const line = playing
    ? [
        "Arriving ·",
        `${count} of ${SCRIPT.length}`,
        crossed ? `· crossed into ${crossed}` : `· ${dayWord}`,
      ]
    : [settled ? "Settled ·" : "Idle ·", `${count} messages`, `· ${dayWord}`];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TimeDivider
        label="Coldbrook dispatch"
        messages={shown}
        today={TODAY}
        onDayCross={setCrossed}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => rewind(true)}
          disabled={playing}
          className={button}
        >
          {settled ? "Play again" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => rewind(false)}
          disabled={count === HISTORY && !playing}
          className={button}
        >
          Reset
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
