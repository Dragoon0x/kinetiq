"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PlugIn, type PlugInState } from "@/registry/ui/plug-in";

export const tweaks = defineTweaks({
  slack: {
    kind: "range",
    label: "Slack",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  spark: {
    kind: "range",
    label: "Spark",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  jiggle: {
    kind: "range",
    label: "Jiggle",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const toggle = (on: boolean) =>
  cn(
    "inline-flex h-7 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    on
      ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
      : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

/**
 * Fernworks settings, Integrations: plug Fieldline Calendar in to sync
 * events both ways — press Connect, or push the plug into the socket.
 */
export function PlugInDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [connected, setConnected] = React.useState(false);
  const [phase, setPhase] = React.useState<PlugInState>("idle");
  const [failNext, setFailNext] = React.useState(false);
  const failArmed = React.useRef(false);

  /** Fieldline answers after a handshake, or refuses when asked to. */
  const answer = (ms: number, mayFail: boolean, signal: AbortSignal) => {
    const fail = mayFail && failArmed.current;
    if (fail) {
      failArmed.current = false;
      setFailNext(false);
    }
    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => (fail ? reject(new Error("Handshake refused")) : resolve()),
        ms,
      );
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new Error("Cancelled"));
        },
        { once: true },
      );
    });
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3 border border-hairline bg-card py-3 pr-3 pl-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Fieldline Calendar
          </p>
          <p className="truncate text-xs text-ink-3">
            {connected
              ? "Syncing 3 calendars both ways"
              : "Sync events both ways"}
          </p>
        </div>
        <PlugIn
          name="Fieldline Calendar"
          icon={<CalendarDays size={16} strokeWidth={1.75} />}
          connected={connected}
          onConnectedChange={setConnected}
          onStateChange={setPhase}
          onConnect={(signal) => answer(1300, true, signal)}
          onDisconnect={(signal) => answer(500, false, signal)}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <span className="text-signal">
                {connected
                  ? "disconnecting"
                  : "connecting to fieldline calendar"}
              </span>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">couldn&apos;t connect</span> ·
                press retry
              </>
            ) : connected ? (
              <>
                <span className="text-signal">connected</span> · 3 calendars
                syncing
              </>
            ) : (
              <>
                <span className="text-signal">not connected</span> · press
                connect or push the plug in
              </>
            )}
          </p>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => {
              failArmed.current = !failNext;
              setFailNext(!failNext);
            }}
            className={toggle(failNext)}
          >
            Fail next
          </button>
        </div>
      ) : null}
    </div>
  );
}
