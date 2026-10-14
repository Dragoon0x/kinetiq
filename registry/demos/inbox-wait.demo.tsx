"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultInboxCode,
  defaultInboxNow,
  defaultInboxSentAt,
  InboxWait,
  type InboxState,
  type InboxStatus,
} from "@/registry/ui/inbox-wait";

export const tweaks = defineTweaks({
  illustration: {
    kind: "choice",
    label: "Picture",
    default: "envelope",
    options: ["envelope", "paper-plane", "bell"],
    names: { envelope: "Envelope", "paper-plane": "Paper plane", bell: "Bell" },
  },
  codeEntry: {
    kind: "toggle",
    label: "Code entry",
    default: true,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

const SEND_MS = 900;

/**
 * Basinworks has just mailed Mara a sign-in link: the surface waits for it to
 * be opened, lets her resend after thirty seconds, or takes the code from the
 * mail instead.
 */
export function InboxWaitDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<InboxState>("sent");
  const [status, setStatus] = React.useState<InboxStatus>("ready");
  const [sentAt, setSentAt] = React.useState(defaultInboxSentAt);
  const [sends, setSends] = React.useState(0);
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
        <InboxWait height={280} {...values} />
      </div>
    );
  }

  /** A host-side send: a beat of progress, then a fresh link or a failure. */
  const send = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (failNext) {
        setFailNext(false);
        setStatus("error");
        return;
      }
      setStatus("ready");
      setState("sent");
      // A hair later each time, so the surface sees a fresh send and
      // restarts its countdown from the full thirty.
      setSentAt(defaultInboxNow + sends + 1);
      setSends((n) => n + 1);
    }, SEND_MS);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStatus("ready");
    setState("sent");
    setSentAt(defaultInboxSentAt);
    setSends(0);
    setFailNext(false);
  };

  const small =
    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <InboxWait
        height={320}
        state={state}
        onChange={setState}
        status={status}
        sentAt={sentAt}
        onResend={send}
        onRetry={send}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {status === "ready" ? state : status}
          </span>{" "}
          · code {defaultInboxCode} · {sends} resent
          {failNext ? " · next send fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setState("verified")}
            aria-disabled={status !== "ready" || undefined}
            className={small}
          >
            Link opened
          </button>
          <button
            type="button"
            onClick={() => setState("expired")}
            aria-disabled={status !== "ready" || undefined}
            className={small}
          >
            Expire
          </button>
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className={small}
          >
            Fail next send
          </button>
          <button type="button" onClick={reset} className={small}>
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
