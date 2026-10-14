"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultResetBreached,
  defaultResetCheck,
  defaultResetCommon,
  defaultResetEmail,
  defaultResetRules,
  defaultResetValue,
  ResetMatch,
  scoreReset,
  type ResetStatus,
  type ResetValue,
} from "@/registry/ui/reset-match";

export const tweaks = defineTweaks({
  meterStyle: {
    kind: "choice",
    label: "Meter",
    default: "bar",
    options: ["bar", "ring", "dots"],
    names: { bar: "Bar", ring: "Ring", dots: "Dots" },
  },
  tieLine: {
    kind: "toggle",
    label: "Tie line",
    default: true,
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Mara resets her Coldbrook password: type one and watch the meter and the
 * checklist answer, confirm it to knit the tie, or let the generator fill
 * both, then try the one the breach check has seen.
 */
export function ResetMatchDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<ResetValue>(defaultResetValue);
  const [status, setStatus] = React.useState<ResetStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [changes, setChanges] = React.useState(0);
  const [epoch, setEpoch] = React.useState(0);
  const failRef = React.useRef(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(() => {
    failRef.current = failNext;
  }, [failNext]);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // The next check fails once when asked to; after that the simulator answers.
  const check = React.useCallback((password: string) => {
    if (failRef.current) {
      failRef.current = false;
      setFailNext(false);
      return Promise.reject(new Error("The breach check is offline."));
    }
    return defaultResetCheck(password);
  }, []);

  if (!chrome) {
    return (
      <div className="w-full">
        <ResetMatch height={540} {...values} />
      </div>
    );
  }

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setValue(defaultResetValue);
    setFailNext(false);
    setChanges(0);
    setEpoch((e) => e + 1);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus("ready");
    }, 900);
  };

  const breached = defaultResetBreached[0] ?? "";
  const score = scoreReset(value.password, defaultResetRules, {
    email: defaultResetEmail,
    common: defaultResetCommon,
  });
  const matched = value.confirm !== "" && value.confirm === value.password;

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <ResetMatch
        key={epoch}
        height={540}
        value={value}
        onChange={setValue}
        check={check}
        onSubmit={() => setChanges((n) => n + 1)}
        status={status}
        onRetry={() => setStatus("ready")}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {score.strength === "empty" ? "no password" : score.strength} ·{" "}
            {matched ? "matched" : "not matched"}
          </span>{" "}
          · {changes} changed{failNext ? " · next check fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setValue({ password: breached, confirm: breached })}
            className={button}
          >
            Try a breached one
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={button}
          >
            Fail next check
          </button>
          <button type="button" onClick={reset} className={button}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
