"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AuthenticatorPair,
  defaultAuthenticatorNow,
  defaultAuthenticatorSecret,
  type AuthenticatorPairing,
  type AuthenticatorStatus,
} from "@/registry/ui/authenticator-pair";

export const tweaks = defineTweaks({
  codeStyle: {
    kind: "choice",
    label: "Code",
    default: "grid",
    options: ["grid", "dots", "bars"],
    names: { grid: "Grid", dots: "Dots", bars: "Bars" },
  },
  ringStyle: {
    kind: "choice",
    label: "Timer",
    default: "ring",
    options: ["ring", "arc", "bar"],
    names: { ring: "Ring", arc: "Arc", bar: "Bar" },
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
 * Mara pairs her phone with her Fieldline account: scan the code, copy the
 * code the pretend app shows, and watch the Paired card land.
 */
export function AuthenticatorPairDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<AuthenticatorStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [paired, setPaired] = React.useState<AuthenticatorPairing | null>(null);
  const [rejected, setRejected] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setPaired(null);
    setRejected(0);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      if (!fail) setRound((r) => r + 1);
    }, 900);
  };

  const reload = () => {
    const fail = failNext;
    setFailNext(false);
    load(fail);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStatus("ready");
    setFailNext(false);
    setPaired(null);
    setRejected(0);
    setRound((r) => r + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <AuthenticatorPair height={540} {...values} />
      </div>
    );
  }

  const surface = (
    <AuthenticatorPair
      key={round}
      height={520}
      status={status}
      secret={defaultAuthenticatorSecret}
      now={defaultAuthenticatorNow}
      onRetry={() => load(false)}
      onPaired={setPaired}
      onReject={(attempt) => setRejected(attempt)}
      onStartOver={() => setRejected(0)}
      {...values}
    />
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "loading"
              ? "generating"
              : status === "error"
                ? "failed"
                : paired
                  ? `paired · ${paired.device}`
                  : rejected > 0
                    ? `${rejected} wrong`
                    : "waiting for a code"}
          </span>{" "}
          · {defaultAuthenticatorSecret.account}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
