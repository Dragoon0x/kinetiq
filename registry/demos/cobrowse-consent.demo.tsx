"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CobrowseConsent,
  type CobrowseState,
} from "@/registry/ui/cobrowse-consent";

export const tweaks = defineTweaks({
  frameColor: {
    kind: "choice",
    label: "Frame",
    default: "cobalt",
    options: ["cobalt", "jade", "amber", "rose"],
    names: { cobalt: "Cobalt", jade: "Jade", amber: "Amber", rose: "Rose" },
  },
  maskStyle: {
    kind: "choice",
    label: "Mask",
    default: "stripes",
    options: ["stripes", "frost", "redact"],
    names: { stripes: "Stripes", frost: "Frost", redact: "Redact" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/** Where Ines looks while she helps: the plan, the billing email, the address. */
const STOPS = [
  { x: 0.62, y: 0.42 },
  { x: 0.24, y: 0.58 },
  { x: 0.7, y: 0.86 },
  { x: 0.3, y: 0.4 },
];

/**
 * Coldbrook Studio's billing page at Basinworks. Ines from support asks to see
 * it while she sorts out an invoice: allow it and the page is framed, the
 * card, bank account and tax ID are masked, and her pointer moves around the
 * page. The gallery card allows her in a moment after it is seen and stops a
 * few seconds later.
 */
export function CobrowseConsentDemo({
  chrome = true,
  // Sharing is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<CobrowseState>("request");
  const [round, setRound] = React.useState(0);
  const [stop, setStop] = React.useState(0);
  const [note, setNote] = React.useState<string | null>(null);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.4 });

  // Her pointer moves only while she is looking and the page is on screen.
  React.useEffect(() => {
    if (state !== "sharing" || !inView) return;
    const t = window.setInterval(
      () => setStop((s) => (s + 1) % STOPS.length),
      1700,
    );
    return () => window.clearInterval(t);
  }, [state, inView]);

  // The gallery card plays the whole visit: allow, look around, stop, again.
  React.useEffect(() => {
    if (chrome || !inView) return;
    const steps: Record<CobrowseState, [CobrowseState | "again", number]> = {
      request: ["sharing", 1800],
      sharing: ["ended", 6200],
      ended: ["again", 3200],
      declined: ["again", 3200],
      expired: ["again", 3200],
    };
    const [next, wait] = steps[state];
    const t = window.setTimeout(() => {
      if (next === "again") {
        setState("request");
        setRound((r) => r + 1);
      } else setState(next);
    }, wait);
    return () => window.clearTimeout(t);
  }, [chrome, inView, state]);

  const surface = (
    <CobrowseConsent
      key={round}
      state={state}
      onStateChange={setState}
      onAccept={() => setNote("sharing · 3 fields hidden")}
      onDecline={() => setNote("declined")}
      onStop={({ seconds }) => setNote(`ended · shared ${seconds} s`)}
      onExpire={() => setNote("request expired")}
      pointer={state === "sharing" ? (STOPS[stop] ?? null) : null}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const waiting = state === "request";

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-disabled={waiting || state === "sharing" || undefined}
          onClick={() => {
            if (waiting || state === "sharing") return;
            setState("request");
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            button,
            (waiting || state === "sharing") && "cursor-not-allowed opacity-60",
          )}
        >
          Send a new request
        </button>
        <button
          type="button"
          aria-disabled={!waiting || undefined}
          onClick={() => {
            if (!waiting) return;
            setState("expired");
            setNote("request expired");
          }}
          className={cn(button, !waiting && "cursor-not-allowed opacity-60")}
        >
          Expire
        </button>
        <button
          type="button"
          onClick={() => {
            setState("request");
            setNote(null);
            setStop(0);
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
          {note ??
            (waiting ? "request · ines is asking" : state.replace("-", " "))}
        </span>{" "}
        · basinworks billing · esc stops sharing
      </p>
    </div>
  );
}
