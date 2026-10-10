"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RelayTerminal } from "@/registry/ui/relay-terminal";

export const tweaks = defineTweaks({
  rate: {
    kind: "range",
    label: "Rate",
    default: 1.25,
    min: 0.25,
    max: 3,
    step: 0.25,
    unit: "/s",
  },
  glyphs: {
    kind: "choice",
    label: "Glyphs",
    default: "hex",
    options: ["hex", "binary", "ascii", "blocks"],
    names: { hex: "Hex", binary: "Binary", ascii: "ASCII", blocks: "Blocks" },
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "green",
    options: ["green", "amber", "ice", "mono"],
    names: { green: "Green", amber: "Amber", ice: "Ice", mono: "Mono" },
  },
});

/**
 * Gaugeworks runs a relay network; the console hero shows the network
 * talking to itself while the offer sits on top.
 */
export function RelayTerminalDemo({
  chrome = true,
  // The console is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lit, setLit] = React.useState(false);
  const [pinged, setPinged] = React.useState(false);
  const pingTimer = React.useRef<number | null>(null);
  const rate = values.rate ?? 1.25;
  const glyphs = values.glyphs ?? "hex";
  const color = values.color ?? "green";

  const onPing = React.useCallback(() => {
    setPinged(true);
    if (pingTimer.current !== null) window.clearTimeout(pingTimer.current);
    pingTimer.current = window.setTimeout(() => {
      pingTimer.current = null;
      setPinged(false);
    }, 1100);
  }, []);

  React.useEffect(
    () => () => {
      if (pingTimer.current !== null) window.clearTimeout(pingTimer.current);
    },
    [],
  );

  const screen = (
    <RelayTerminal
      onActiveChange={setLit}
      onPing={onPing}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/90 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Relay
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Every node, one console
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Live status from 214 relays
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Open console
              </button>
            </>
          ) : null}
        </div>
      </div>
    </RelayTerminal>
  );

  if (!chrome) return <div className="flex w-full">{screen}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {screen}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pinged ? (
          <>
            <span className="text-signal">ping</span> · every relay answered
          </>
        ) : lit ? (
          <>
            <span className="text-signal">lamp</span> · the console lights under
            your hand
          </>
        ) : (
          <>
            <span className="text-signal">{glyphs}</span> · {rate} bursts a
            second · {color} phosphor
          </>
        )}
      </p>
    </div>
  );
}
