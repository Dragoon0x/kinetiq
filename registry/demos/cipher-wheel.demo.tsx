"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CipherWheel } from "@/registry/ui/cipher-wheel";

export const tweaks = defineTweaks({
  order: {
    kind: "choice",
    label: "Order",
    default: "ltr",
    options: ["ltr", "random", "center"],
    names: { ltr: "Left", random: "Random", center: "Middle" },
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  charset: {
    kind: "choice",
    label: "Ring",
    default: "alpha",
    options: ["alpha", "digits", "hex", "symbols"],
    names: { alpha: "A–Z", digits: "0–9", hex: "Hex", symbols: "Symbols" },
  },
});

const HEADLINE = "Sealed until you say so";

/**
 * Fieldline Vault opening a shared folder: the headline decrypts on its
 * dials as the card comes into view, and turns again when pressed.
 */
export function CipherWheelDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [locked, setLocked] = React.useState({ count: 0, total: 0 });

  const card = (
    <div className="flex w-full flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Vault · key 4F-21
      </p>
      <CipherWheel
        key={run}
        as="h2"
        text={HEADLINE}
        onLock={(count, total) => setLocked({ count, total })}
        sound={sound}
        {...values}
        className="text-[clamp(1.5rem,6.4cqi,2.75rem)] leading-[1.15] font-semibold tracking-[-0.01em] text-foreground"
      />
      <p className="text-sm text-ink-2">
        Every file in this folder opens with your key, never ours.
      </p>
    </div>
  );

  if (!chrome) {
    return <div className="@container flex w-full max-w-2xl">{card}</div>;
  }

  const open = locked.total > 0 && locked.count === locked.total;
  return (
    <div className="@container flex w-full max-w-2xl flex-col gap-4">
      {card}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {open ? (
            <>
              <span className="text-signal">open</span> · press the headline to
              turn the dials
            </>
          ) : (
            <>
              <span className="text-signal">decrypting</span> · {locked.count}{" "}
              of {locked.total} {locked.total === 1 ? "dial" : "dials"} locked
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Scramble
        </button>
      </div>
    </div>
  );
}
