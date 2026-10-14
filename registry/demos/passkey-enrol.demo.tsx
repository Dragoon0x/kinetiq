"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPasskeys,
  PasskeyEnrol,
  type PasskeyChange,
  type PasskeyRecord,
  type PasskeyStatus,
} from "@/registry/ui/passkey-enrol";

export const tweaks = defineTweaks({
  device: {
    kind: "choice",
    label: "Device",
    default: "phone",
    options: ["phone", "laptop", "key"],
    names: { phone: "Phone", laptop: "Laptop", key: "Security key" },
  },
  ringStyle: {
    kind: "choice",
    label: "Ring",
    default: "ring",
    options: ["ring", "ridges", "ticks"],
    names: { ring: "Ring", ridges: "Ridges", ticks: "Ticks" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const CHANGE_WORD: Record<PasskeyChange["kind"], string> = {
  add: "created",
  rename: "renamed",
  remove: "removed",
  used: "signed in with",
};

/**
 * Mara adds a passkey to her Gaugeworks account: the browser's ceremony is
 * simulated, the second attempt is cancelled so Try again has work to do, and
 * Try it checks a sign-in with whichever passkey is selected.
 */
export function PasskeyEnrolDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [passkeys, setPasskeys] =
    React.useState<PasskeyRecord[]>(defaultPasskeys);
  const [status, setStatus] = React.useState<PasskeyStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState<PasskeyChange | null>(null);
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
        <PasskeyEnrol height={540} {...values} />
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
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setPasskeys(defaultPasskeys);
    setStatus("ready");
    setFailNext(false);
    setLast(null);
  };

  const button =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <PasskeyEnrol
        height={540}
        passkeys={passkeys}
        onChange={(next, change) => {
          setPasskeys(next);
          setLast(change);
        }}
        status={status}
        onRetry={reload}
        onUseCode={() => setLast(null)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {passkeys.length} {passkeys.length === 1 ? "passkey" : "passkeys"}
          </span>
          {last
            ? ` · last: ${CHANGE_WORD[last.kind]} ${last.passkey.name}`
            : " · nothing changed yet"}
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={reload} className={button}>
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className={button}
          >
            Fail next load
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
