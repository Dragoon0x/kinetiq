"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTokens,
  TokenLocker,
  type TokenRecord,
  type TokenStatus,
} from "@/registry/ui/token-locker";

export const tweaks = defineTweaks({
  revealStyle: {
    kind: "choice",
    label: "Reveal",
    default: "unspool",
    options: ["unspool", "fade", "instant"],
    names: { unspool: "Unspool", fade: "Fade", instant: "Instant" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

/**
 * Fieldline API's token page: six tokens, one of them minutes from expiry.
 * Mint a new one, copy the secret before the cover closes, rotate the CI
 * token and watch the old one retire.
 */
export function TokenLockerDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [tokens, setTokens] = React.useState<TokenRecord[]>(defaultTokens);
  const [status, setStatus] = React.useState<TokenStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [loads, setLoads] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <TokenLocker height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      if (!fail) setLoads((n) => n + 1);
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setTokens(defaultTokens);
    setStatus("ready");
    setFailNext(false);
  };

  const retiring = tokens.filter((t) => t.retiresAt !== undefined).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <TokenLocker
        height={540}
        tokens={tokens}
        onChange={setTokens}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {tokens.length} tokens
            {retiring > 0 ? ` · ${retiring} retiring` : ""}
          </span>{" "}
          · {status}
          {failNext ? " · next load fails" : ""}
          {loads > 0 ? ` · ${loads} reload${loads === 1 ? "" : "s"}` : ""}
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
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
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
