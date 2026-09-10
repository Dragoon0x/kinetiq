"use client";

import * as React from "react";

import { TimeoutRing } from "@/registry/ui/timeout-ring";

const SPANS = [20, 8];

const clock = (value: number) => {
  const whole = Math.max(0, Math.ceil(value));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function TimeoutRingDemo() {
  const [span, setSpan] = React.useState(20);
  const [active, setActive] = React.useState(false);
  const [left, setLeft] = React.useState(20);
  const [extended, setExtended] = React.useState(false);
  const [cleared, setCleared] = React.useState<"clock" | "hand" | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TimeoutRing
        name="Marta Vieira"
        handle="marta"
        room="Coldbrook"
        reason="Room rule 3"
        seconds={span}
        extendSeconds={10}
        active={active}
        onActiveChange={(next) => {
          setActive(next);
          if (next) {
            setLeft(span);
            setExtended(false);
            setCleared(null);
          }
        }}
        onRemainingChange={setLeft}
        onExtend={() => setExtended(true)}
        onExpire={() => setCleared("clock")}
        onLift={() => setCleared("hand")}
      />

      <div className="flex flex-wrap items-center gap-2">
        {SPANS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setSpan(value);
              setLeft(value);
            }}
            disabled={active || span === value}
            className={chip}
          >
            {value} seconds
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActive(true)}
          disabled={active}
          className={chip}
        >
          Time out
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {active ? (
          <>
            Marta · timed out · {clock(left)} left ·{" "}
            <span className="text-signal">
              {extended ? "extended" : "room rule 3"}
            </span>
          </>
        ) : (
          <>
            Marta · can post ·{" "}
            <span className="text-signal">
              {cleared === "clock"
                ? "ran out"
                : cleared === "hand"
                  ? "lifted"
                  : "no timeout"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
