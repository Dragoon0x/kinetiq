"use client";

import * as React from "react";

import { RotateCcw, ShieldX } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CoolingLock,
  type CoolingLockChange,
  type CoolingLockStatus,
  type CoolingLockValue,
  defaultCoolingLockNow,
  defaultCoolingLockUntil,
  phraseCoolingLock,
} from "@/registry/ui/cooling-lock";

export const tweaks = defineTweaks({
  glyph: {
    kind: "choice",
    label: "Glyph",
    default: "padlock",
    options: ["padlock", "shield", "ring"],
    names: { padlock: "Padlock", shield: "Shield", ring: "Ring" },
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
    label: "Warmth",
    default: "warn",
    options: ["warn", "danger", "ink"],
    names: { warn: "Amber", danger: "Red", ink: "Ink" },
  },
});

const SEC = 1000;
const HINT = "Eight characters or more signs in here.";
const MAX = 5;

/**
 * Ines has mistyped her Fieldline password three times and is locked out
 * for the next forty-two seconds. Fail adds another attempt from elsewhere
 * and warms the lock back up; once it opens, any eight-character password
 * gets her in.
 */
export function CoolingLockDemo({
  chrome = true,
  // The lock is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lock, setLock] = React.useState<CoolingLockValue>({
    until: defaultCoolingLockUntil,
    attempts: 3,
  });
  const [now, setNow] = React.useState(defaultCoolingLockNow);
  const [status, setStatus] = React.useState<CoolingLockStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState<string>("locked out for 42 seconds");
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);
  // The card counts its own seconds; the host keeps pace from when it
  // mounted so an extension lands on the card's clock, not a stale one.
  const startedAt = React.useRef<number | null>(null);

  React.useEffect(() => {
    startedAt.current = Date.now();
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [epoch]);

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  // Another failed attempt from somewhere else: the host moves the clock on
  // and the lift time out, and the card re-warms.
  const fail = () => {
    const started = startedAt.current;
    const at =
      started === null ? now : defaultCoolingLockNow + (Date.now() - started);
    const base = lock.until === null ? at : Math.max(lock.until, at);
    const until = base + 30 * SEC;
    setNow(at);
    setLock((l) => ({ until, attempts: Math.min(MAX, l.attempts + 1) }));
    setLast(`extended by 30 seconds, ${phraseCoolingLock(until - at)} to go`);
  };

  const onChange = (value: CoolingLockValue, change: CoolingLockChange) => {
    setLock(value);
    if (change.kind === "unlock") setLast("open: try again");
    else if (change.kind === "signin") setLast("signed in");
    else
      setLast(
        `${change.message ?? "failed"}, locked again for ${phraseCoolingLock(60 * SEC)}`,
      );
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setLock({ until: defaultCoolingLockUntil, attempts: 3 });
    setNow(defaultCoolingLockNow);
    setStatus("ready");
    setFailNext(false);
    setLast("locked out for 42 seconds");
    setEpoch((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <CoolingLock height={280} hint={HINT} {...values} />
      </div>
    );
  }

  const buttonClass =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <CoolingLock
        key={epoch}
        until={lock.until}
        attempts={lock.attempts}
        maxAttempts={MAX}
        now={now}
        onChange={onChange}
        onReset={() => setLast("reset password pressed")}
        onSupport={() => setLast("contact support pressed")}
        status={status}
        onReload={reload}
        hint={HINT}
        height={320}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {Math.min(MAX, lock.attempts)} of {MAX} attempts
          </span>{" "}
          · {last}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fail}
            aria-disabled={status !== "ready" || undefined}
            className={buttonClass}
          >
            <ShieldX aria-hidden className="size-3.5" />
            Fail an attempt
          </button>
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input
              type="checkbox"
              checked={failNext}
              onChange={(event) => setFailNext(event.target.checked)}
              className="size-3.5 accent-(--accent)"
            />
            Fail next load
          </label>
          <button type="button" onClick={reload} className={buttonClass}>
            Reload
          </button>
          <button type="button" onClick={reset} className={buttonClass}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
