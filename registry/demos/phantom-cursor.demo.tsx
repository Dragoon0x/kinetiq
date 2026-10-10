"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  PhantomCursor,
  type PhantomCursorHandle,
} from "@/registry/ui/phantom-cursor";

export const tweaks = defineTweaks({
  lag: {
    kind: "range",
    label: "Lag",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  size: {
    kind: "range",
    label: "Size",
    default: 28,
    min: 16,
    max: 64,
    step: 4,
    unit: "px",
  },
  smoke: {
    kind: "range",
    label: "Smoke",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const button =
  "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Waylight's night edition — short stories for the walk home — and a
 * phantom that keeps a step behind whoever is reading.
 */
export function PhantomCursorDemo({
  chrome = true,
  // The phantom is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const phantom = React.useRef<PhantomCursorHandle | null>(null);
  const [held, setHeld] = React.useState(false);
  const [lit, setLit] = React.useState<string | null>(null);

  // A tweak shows itself at once: the phantom appears in the middle of the
  // card with its new lag, size and smoke, then dissolves.
  const settings = `${values.lag ?? ""}:${values.size ?? ""}:${values.smoke ?? ""}`;
  const shown = React.useRef(settings);
  React.useEffect(() => {
    if (shown.current === settings) return;
    shown.current = settings;
    phantom.current?.appear();
  }, [settings]);

  const scene = (
    <div
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHeld(true);
      }}
      onPointerLeave={() => setHeld(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) {
          setLit(event.target.textContent ?? null);
        }
      }}
      onBlur={() => setLit(null)}
      className="w-full"
    >
      <PhantomCursor
        ref={phantom}
        className="w-full rounded-3 border border-hairline bg-card"
        {...values}
      >
        <div className="@container p-5">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Waylight · night edition
            </p>
            <p className="text-xl leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground">
              Somebody is right behind you.
            </p>
            <p className="hidden text-sm text-ink-2 @[26rem]:block">
              Short stories for the walk home, read aloud after dark.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`${button} bg-primary text-primary-foreground`}
              >
                Start reading
              </button>
              <button
                type="button"
                className={`${button} border border-hairline-strong bg-surface-2 text-foreground hover:bg-surface-0`}
              >
                Preview
              </button>
            </div>
          </div>
        </div>
      </PhantomCursor>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{scene}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {scene}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {lit ? (
          <>
            <span className="text-signal">phantom at</span> · {lit}
          </>
        ) : held ? (
          <>
            <span className="text-signal">phantom following</span> · it hurries
            when you stop
          </>
        ) : (
          <>
            <span className="text-signal">phantom asleep</span> · move across
            the card, or tab to it
          </>
        )}
      </p>
    </div>
  );
}
