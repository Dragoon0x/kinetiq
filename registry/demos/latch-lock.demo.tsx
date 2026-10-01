"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LatchLock } from "@/registry/ui/latch-lock";

export const tweaks = defineTweaks({
  weight: {
    kind: "range",
    label: "Weight",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  rattle: {
    kind: "range",
    label: "Rattle",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  glint: {
    kind: "range",
    label: "Glint",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/**
 * Coldbrook Bank's card controls: freeze a debit card from the app, unless
 * the bank itself has put a hold on it.
 */
export function LatchLockDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [locked, setLocked] = React.useState(true);
  const [hold, setHold] = React.useState(false);

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-xs items-center gap-3 self-center rounded-3 border border-hairline bg-card p-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-foreground"
            title="Debit card ···· 4821"
          >
            Debit card
          </p>
          <p className="truncate text-xs text-ink-3">···· 4821</p>
        </div>
        <LatchLock
          size="lg"
          pressed={locked}
          onPressedChange={setLocked}
          disabled={hold}
          disabledNote="Coldbrook has a hold on this card. Call us to change it."
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <>
          <button
            type="button"
            aria-pressed={hold}
            onClick={() => setHold((h) => !h)}
            className={cn(
              "inline-flex h-8 items-center self-end rounded-2 border px-3 text-xs transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              hold
                ? "border-warn/40 bg-warn/10 text-foreground"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            Bank hold
          </button>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {hold ? (
              <>
                <span className="text-warn">bank hold</span> · call coldbrook to
                change
              </>
            ) : locked ? (
              <>
                <span className="text-signal">card locked</span> · new payments
                declined
              </>
            ) : (
              <>
                <span className="text-signal">card unlocked</span> · payments
                allowed
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
