"use client";

import * as React from "react";

import { StreamBranch } from "@/registry/ui/stream-branch";

const TEXT_A =
  "Hold the north plots until the soil reads ten degrees at dawn for three days running. That usually falls in the second week, and planting into cold ground costs more in slow starts than a week of waiting costs in season.";

const TEXT_B =
  "Go in the second week. The north plots warm late, so wait for three dawns at ten degrees, then plant the whole block in one pass while the forecast holds dry.";

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
const WORDS_A = wordsOf(TEXT_A);
const WORDS_B = wordsOf(TEXT_B);

/** Cumulative arrival times in ms: the slower branch starts later and steps longer. */
const schedule = (count: number, start: number, base: number, seed: number) => {
  const times: number[] = [];
  let clock = start;
  for (let index = 0; index < count; index += 1) {
    clock += base + ((index * seed) % 7) * 12;
    times.push(clock);
  }
  return times;
};
const ARRIVE_A = schedule(WORDS_A.length, 260, 92, 7919);
const ARRIVE_B = schedule(WORDS_B.length, 140, 64, 104729);
const LAST_A = ARRIVE_A[ARRIVE_A.length - 1] ?? 0;
const LAST_B = ARRIVE_B[ARRIVE_B.length - 1] ?? 0;
const END = Math.max(LAST_A, LAST_B);
const TICK = 40;
const BRANCH_A = { id: "a", model: "Fernworks Model 3", text: TEXT_A };
const BRANCH_B = { id: "b", model: "Gaugeworks Reasoner", text: TEXT_B };

export function StreamBranchDemo() {
  const [clock, setClock] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);

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
    // A hidden tab holds both streams where they are and resumes on return.
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

  const landedA = ARRIVE_A.filter((time) => time <= clock).length;
  const landedB = ARRIVE_B.filter((time) => time <= clock).length;
  const finished = clock >= END;
  const firstIs = LAST_B < LAST_A ? "B" : "A";

  const start = () => {
    setPicked(null);
    setClock(0);
    setPlaying(true);
  };

  const line = picked
    ? ["Kept", picked, `· ${picked === "a" ? "b" : "a"} folded`]
    : playing
      ? ["Racing ·", `A ${landedA} · B ${landedB}`, "words"]
      : finished
        ? [
            "",
            `${firstIs} first`,
            `· A ${WORDS_A.length} · B ${WORDS_B.length} words`,
          ]
        : ["Waiting · press race", "", ""];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <StreamBranch
        label="Two answers on the north plots"
        playing={playing}
        picked={picked}
        onPickedChange={setPicked}
        branches={[
          { ...BRANCH_A, landed: landedA },
          { ...BRANCH_B, landed: landedB },
        ]}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={playing}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {clock > 0 ? "Race again" : "Race"}
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
