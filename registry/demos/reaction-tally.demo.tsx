"use client";

import * as React from "react";

import {
  ReactionTally,
  type TallyRank,
  type TallyReaction,
} from "@/registry/ui/reaction-tally";

const BASE: TallyReaction[] = [
  { id: "agree", name: "Agree", mark: "check", count: 4 },
  { id: "spark", name: "Spark", mark: "star", count: 3 },
  { id: "lift", name: "Lift", mark: "lift", count: 3 },
  { id: "watch", name: "Watching", mark: "eye", count: 1 },
  { id: "hold", name: "Hold", mark: "hold", count: 0 },
];

/** A seeded script of other people's votes — the component never invents one. */
const SCRIPT =
  "spark hold spark lift watch spark hold agree spark hold watch".split(" ");
const STEP_MS = 700;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

export function ReactionTallyDemo() {
  const [step, setStep] = React.useState(0);
  const [requested, setRequested] = React.useState(false);
  const [mine, setMine] = React.useState<string[]>(["agree"]);
  const [rank, setRank] = React.useState<TallyRank | null>(null);
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const playing = requested && step < SCRIPT.length;

  React.useEffect(() => {
    if (!playing || !visible) return;
    const timer = window.setTimeout(
      () => setStep((prev) => Math.min(SCRIPT.length, prev + 1)),
      STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, visible, step]);

  const votes = SCRIPT.slice(0, step);
  const reactions = BASE.map((reaction) => ({
    ...reaction,
    count: reaction.count + votes.filter((id) => id === reaction.id).length,
  }));

  const leader = reactions.find((entry) => entry.id === rank?.leaderId);
  const standing =
    !rank || !leader || rank.leaderTotal === 0
      ? "no votes yet"
      : rank.margin === 0
        ? `tied at ${rank.leaderTotal}`
        : `${leader.name} ${rank.leaderTotal} · leads by ${rank.margin}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReactionTally
        label="Coldbrook depot"
        author="Marta Ferreira"
        time="15:02"
        text="Dock three is clear from nine — the Basinworks pallets can go on the morning run."
        reactions={reactions}
        value={mine}
        onValueChange={setMine}
        onRankChange={setRank}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={playing}
          onClick={() => {
            if (step >= SCRIPT.length) setStep(0);
            setRequested(true);
          }}
          className={chip}
        >
          {step >= SCRIPT.length ? "Replay the votes" : "Let the room vote"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRequested(false);
            setStep(0);
            setMine(["agree"]);
          }}
          className={chip}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{standing}</span> · yours {mine.length}
      </p>
    </div>
  );
}
