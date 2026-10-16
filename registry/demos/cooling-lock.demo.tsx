"use client";

import * as React from "react";

import { CalendarClock, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { CoolingLock, defaultCoolingNow } from "@/registry/ui/cooling-lock";

export const tweaks = defineTweaks({
  frostStyle: {
    kind: "choice",
    label: "Frost",
    default: "crystal",
    options: ["crystal", "rime", "glaze"],
    names: { crystal: "Crystal", rime: "Rime", glaze: "Glaze" },
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.6,
    min: 0.2,
    max: 1,
    step: 0.1,
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "firm",
    options: ["calm", "firm", "stern"],
    names: { calm: "Calm", firm: "Firm", stern: "Stern" },
  },
});

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const DAY = 86_400_000;

type Lock = { at: number; cooldown: number; attempts: number };

/**
 * A Fieldline sign-in after five failed tries. The wait is short here so the
 * thaw is seen; the first retry is refused and the host locks again for
 * twice as long, the next one goes through.
 */
export function CoolingLockDemo({
  chrome = true,
  // The lock is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const first = chrome ? 30_000 : 20_000;
  const fresh = React.useCallback(
    (): Lock => ({ at: defaultCoolingNow, cooldown: first, attempts: 5 }),
    [first],
  );
  const [lock, setLock] = React.useState<Lock>(fresh);
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState(
    `locked · ${Math.round(first / 1000)} s cooldown`,
  );
  const retries = React.useRef(0);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reset = (next: Lock = fresh()) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    retries.current = 0;
    setLock(next);
    setNote(
      next.cooldown > DAY / 2
        ? "locked · 24 h · support offered"
        : `locked · ${Math.round(next.cooldown / 1000)} s cooldown`,
    );
    setRound((r) => r + 1);
  };

  const surface = (
    <CoolingLock
      key={round}
      attempts={lock.attempts}
      cooldown={lock.cooldown}
      lockedAt={lock.at}
      now={lock.at}
      email="rae@fieldline.dev"
      appName="Fieldline"
      onThaw={() => setNote("thawed · form back")}
      onRetry={async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        retries.current += 1;
        if (retries.current === 1) {
          const cooldown = lock.cooldown * 2;
          setLock({
            at: lock.at + lock.cooldown,
            cooldown,
            attempts: lock.attempts + 1,
          });
          setNote(`retry refused · relocked ${Math.round(cooldown / 1000)} s`);
          return false;
        }
        setNote("signed in");
        if (!chrome) {
          timer.current = window.setTimeout(() => reset(), 4000);
        }
        return true;
      }}
      onUnlockByEmail={async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        setNote("unlock link sent");
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-md">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => reset()} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={() =>
            reset({ at: defaultCoolingNow, cooldown: DAY, attempts: 12 })
          }
          className={button}
        >
          <CalendarClock aria-hidden className="size-3.5" />
          Long lockout
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note}</span> · Fieldline
      </p>
    </div>
  );
}
