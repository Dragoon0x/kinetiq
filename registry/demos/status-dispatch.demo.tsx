"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultDispatchChannels,
  StatusDispatch,
  type DispatchDeliveryState,
  type DispatchLoadStatus,
  type DispatchUpdate,
} from "@/registry/ui/status-dispatch";

export const tweaks = defineTweaks({
  previewChannel: {
    kind: "choice",
    label: "Preview",
    default: "page",
    options: ["page", "email", "sms", "chat"],
    names: { page: "Status page", email: "Email", sms: "SMS", chat: "Chat" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  timeline: {
    kind: "choice",
    label: "Timeline",
    default: "side",
    options: ["side", "below"],
    names: { side: "Beside", below: "Below" },
  },
});

/**
 * Coldbrook status, eleven minutes after the cause was found: the rollback
 * is done, and the Monitoring update is drafted for the page, email, SMS
 * and chat — one of which will not take it the first time.
 */
export function StatusDispatchDemo({
  chrome = true,
  // The composer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [status, setStatus] = React.useState<DispatchLoadStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [posted, setPosted] = React.useState(0);
  const [last, setLast] = React.useState<Record<
    string,
    DispatchDeliveryState
  > | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(failNext ? "error" : "ready");
      setFailNext(false);
    }, 900);
  };

  const surface = (
    <StatusDispatch
      key={round}
      height={540}
      status={status}
      onRetry={reload}
      onUpdatesChange={(updates: DispatchUpdate[]) => {
        setPosted(Math.max(0, updates.length - 2));
        setLast(null);
      }}
      onDelivery={(_update, channelId, state) =>
        setLast((prev) => ({ ...(prev ?? {}), [channelId]: state }))
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  const total = defaultDispatchChannels.length;
  const states = last ? Object.values(last) : [];
  const delivered = states.filter((s) => s === "delivered").length;
  const failed = states.filter((s) => s === "failed").length;
  const sending = states.some((s) => s === "sending");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={reload}
          aria-disabled={status === "loading" || undefined}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next load
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setStatus("ready");
            setFailNext(false);
            setPosted(0);
            setLast(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {status === "loading"
            ? "loading"
            : status === "error"
              ? "load failed"
              : sending
                ? `sending · ${delivered} of ${total} delivered`
                : last
                  ? `${delivered} of ${total} delivered${failed ? ` · ${failed} failed` : ""}`
                  : "draft ready"}
        </span>{" "}
        · {posted} posted this session
        {failNext ? " · next load fails" : ""}
      </p>
    </div>
  );
}
