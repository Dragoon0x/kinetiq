"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { InboxWait, type InboxWaitStatus } from "@/registry/ui/inbox-wait";

export const tweaks = defineTweaks({
  envelopeStyle: {
    kind: "choice",
    label: "Envelope",
    default: "flap",
    options: ["flap", "mailer", "line"],
    names: { flap: "Flap", mailer: "Mailer", line: "Line" },
  },
  glowAmount: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "calm",
    options: ["calm", "warm", "mono"],
    names: { calm: "Calm", warm: "Warm", mono: "Mono" },
  },
});

/** Posts what another tab would post when the link opens there. */
const post = (channel: string, message: { type: string; name?: string }) => {
  if (typeof BroadcastChannel === "undefined") return;
  const bc = new BroadcastChannel(channel);
  bc.postMessage(message);
  bc.close();
};

/**
 * Waylight's sign-in, waiting on a link sent to ana@waylight.studio six
 * seconds ago. "Open link in another tab" posts on the same channel a real
 * second tab would; the gallery card does it itself a few seconds after it
 * comes into view, then starts over.
 */
export function InboxWaitDemo({
  chrome = true,
  // The page is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const uid = React.useId();
  const channel = `inbox-wait-demo${uid}`;
  const [status, setStatus] = React.useState<InboxWaitStatus>("waiting");
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const timers = React.useRef<number[]>([]);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.5 });

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setStatus("waiting");
    setNote(null);
    setRound((r) => r + 1);
  };

  // The gallery card opens its own link a moment after it is seen.
  React.useEffect(() => {
    if (chrome || !inView || status !== "waiting") return;
    const t = window.setTimeout(
      () => post(channel, { type: "verified", name: "Ana" }),
      3500,
    );
    return () => window.clearTimeout(t);
  }, [channel, chrome, inView, status, round]);

  const surface = (
    <InboxWait
      key={round}
      channel={channel}
      status={status}
      onStatusChange={(next) => {
        setStatus(next);
        if (next === "expired") setNote("link expired");
        if (next === "other-device") setNote("opened on another device");
      }}
      onVerified={({ via }) => {
        setNote(via === "channel" ? "verified · from another tab" : "verified");
        if (!chrome) timers.current.push(window.setTimeout(reset, 5000));
      }}
      onResend={() => setNote("new link sent")}
      onChangeEmail={(email) => setNote(`link sent to ${email}`)}
      onContinue={() => setNote("continued to waylight")}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="flex w-full justify-center">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const waiting = status === "waiting";

  return (
    <div ref={frame} className="flex w-full max-w-sm flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={!waiting}
          onClick={() => {
            if (waiting) post(channel, { type: "verified", name: "Ana" });
          }}
          className={button}
        >
          Open link in another tab
        </button>
        <button
          type="button"
          aria-disabled={!waiting}
          onClick={() => {
            if (waiting) post(channel, { type: "expired" });
          }}
          className={button}
        >
          Expire
        </button>
        <button
          type="button"
          aria-disabled={!waiting}
          onClick={() => {
            if (waiting) post(channel, { type: "other-device" });
          }}
          className={button}
        >
          Open on phone
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note ?? status.replace("-", " ")}</span>{" "}
        · ana@waylight.studio
      </p>
    </div>
  );
}
