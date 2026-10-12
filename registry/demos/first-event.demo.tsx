"use client";

import * as React from "react";

import { RotateCcw, Send } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultFirstEventSamples,
  FirstEvent,
  type FirstEventRecord,
  type FirstEventStatus,
} from "@/registry/ui/first-event";

export const tweaks = defineTweaks({
  defaultPlatform: {
    kind: "choice",
    label: "Platform",
    default: "web",
    options: ["web", "ios", "android"],
    names: { web: "Web", ios: "iOS", android: "Android" },
  },
  ringStyle: {
    kind: "choice",
    label: "Listening",
    default: "ring",
    options: ["ring", "dots", "bar"],
    names: { ring: "Ring", dots: "Dots", bar: "Bar" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Gaugeworks Analytics a minute after the project was created: the SDK is
 * in, the key is set, and nothing has arrived. Send a test event and watch
 * the dashboard wake up.
 */
export function FirstEventDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [events, setEvents] = React.useState<FirstEventRecord[]>([]);
  const [status, setStatus] = React.useState<FirstEventStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
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
        <FirstEvent height={540} {...values} />
      </div>
    );
  }

  const next = defaultFirstEventSamples[events.length];
  const left = defaultFirstEventSamples.length - events.length;

  const send = () => {
    if (!next || status !== "ready") return;
    setEvents((list) => [...list, next]);
  };

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

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <FirstEvent
        height={540}
        events={events}
        onReset={() => setEvents([])}
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
            {status !== "ready"
              ? status
              : events.length === 0
                ? "listening"
                : `${events.length} ${events.length === 1 ? "event" : "events"} in`}
          </span>{" "}
          · {left} queued{failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={send}
            aria-disabled={!next || status !== "ready" || undefined}
            className={BUTTON}
          >
            <Send aria-hidden className="size-3.5" />
            Send a test event
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className={BUTTON}
          >
            Fail next load
          </button>
          <button type="button" onClick={reload} className={BUTTON}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
