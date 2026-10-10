"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SweepScope, type SweepScopeContact } from "@/registry/ui/sweep-scope";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  rings: {
    kind: "range",
    label: "Rings",
    default: 4,
    min: 2,
    max: 7,
    step: 1,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "signal",
    options: ["signal", "cobalt", "amber", "ice"],
    names: { signal: "Signal", cobalt: "Cobalt", amber: "Amber", ice: "Ice" },
  },
});

const where = (c: SweepScopeContact) =>
  `${String(c.bearing).padStart(3, "0")}° · ${c.range.toFixed(1)}`;

/**
 * Basinworks Harbour, vessel tracking for small ports: the welcome sits on
 * the harbour's own scope, and a press marks a contact for the sweep to find.
 */
export function SweepScopeDemo({
  chrome = true,
  // The scope is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [said, setSaid] = React.useState<{
    found: boolean;
    contact: SweepScopeContact;
  } | null>(null);
  const rings = values.rings ?? 4;
  const color = values.color ?? "signal";

  const scope = (
    <SweepScope
      onPlace={(contact) => setSaid({ found: false, contact })}
      onFind={(contact) =>
        setSaid((s) =>
          s && s.contact.id !== contact.id ? s : { found: true, contact },
        )
      }
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-start p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Basinworks Harbour
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Every vessel on one screen
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Live traffic for small ports
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Open the chart
              </button>
            </>
          ) : null}
        </div>
      </div>
    </SweepScope>
  );

  if (!chrome) return <div className="flex w-full">{scope}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {scope}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {said ? (
          <>
            <span className="text-signal">
              {said.found ? "contact found" : "contact placed"}
            </span>{" "}
            · {where(said.contact)}
          </>
        ) : (
          <>
            <span className="text-signal">sweeping</span> · {rings} rings ·{" "}
            {color}
          </>
        )}
      </p>
    </div>
  );
}
