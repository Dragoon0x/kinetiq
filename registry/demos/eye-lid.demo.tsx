"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { EyeLid } from "@/registry/ui/eye-lid";

export const tweaks = defineTweaks({
  follow: {
    kind: "range",
    label: "Follow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  blink: {
    kind: "range",
    label: "Waking blinks",
    default: 2,
    min: 0,
    max: 3,
    step: 1,
  },
  lashes: {
    kind: "range",
    label: "Lashes",
    default: 5,
    min: 0,
    max: 8,
    step: 1,
  },
});

/**
 * Coldbrook Bank's balance tile: the figure masks itself while the eye is
 * shut, for checking an account on a train.
 */
export function EyeLidDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [hidden, setHidden] = React.useState(false);

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-xs items-center gap-3 self-center rounded-3 border border-hairline bg-card p-4">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-xs text-ink-3"
            title="Everyday account, available balance"
          >
            Available
          </p>
          <p className="mt-0.5 grid font-mono text-base text-foreground tabular-nums">
            <span
              aria-hidden={hidden || undefined}
              className={cn(
                "col-start-1 row-start-1 truncate transition-opacity duration-150",
                hidden && "opacity-0",
              )}
            >
              £2,481.20
            </span>
            <span
              aria-hidden={hidden ? undefined : true}
              className={cn(
                "col-start-1 row-start-1 truncate transition-opacity duration-150",
                !hidden && "opacity-0",
              )}
            >
              £•,•••.••
            </span>
          </p>
        </div>
        <EyeLid
          size="lg"
          pressed={hidden}
          onPressedChange={setHidden}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {hidden ? (
            <>
              <span className="text-signal">balance hidden</span> · amounts
              masked
            </>
          ) : (
            <>
              <span className="text-signal">balance shown</span> · eye on your
              pointer
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
