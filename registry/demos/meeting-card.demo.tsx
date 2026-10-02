"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { defaultAttendees, MeetingCard } from "@/registry/ui/meeting-card";

export const tweaks = defineTweaks({
  ring: {
    kind: "range",
    label: "Ring",
    default: 5,
    min: 1,
    max: 15,
    step: 1,
    unit: "min",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  agenda: {
    kind: "choice",
    label: "Agenda",
    default: "sheet",
    options: ["sheet", "rows"],
    names: { sheet: "Sheet", rows: "By row" },
  },
});

const START = Date.UTC(2026, 9, 2, 10, 30);
/** The demo opens three and a half minutes before the start. */
const BEGIN = START - 210_000;
const TICK = 200;
/** Twenty times real time until the start, so the wait plays in seconds. */
const FAST = 20;

/**
 * Basinworks' design review, a few minutes out. The demo keeps its own
 * clock — fast until the start, real time after — and stops it while the
 * card is off screen or the page is hidden.
 */
export function MeetingCardDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [now, setNow] = React.useState(BEGIN);
  const [joined, setJoined] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setOnScreen(e.isIntersecting);
    });
    io.observe(root);
    return () => io.disconnect();
  }, []);
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  React.useEffect(() => {
    if (!onScreen || hidden) return;
    const id = window.setInterval(() => {
      setNow((n) => (n < START ? Math.min(START, n + TICK * FAST) : n + TICK));
    }, TICK);
    return () => window.clearInterval(id);
  }, [onScreen, hidden]);

  const here =
    defaultAttendees.filter(
      (a) => typeof a.joinedAt === "number" && a.joinedAt <= now,
    ).length + (joined ? 1 : 0);
  const invited = defaultAttendees.length + 1;
  const left = Math.max(0, START - now);
  const countdown = `starts in ${left >= 60000 ? `${Math.ceil(left / 60000)}m` : `${Math.ceil(left / 1000)}s`}`;
  const lead = joined ? "joined" : now < START ? countdown : "live";
  const early = joined && now < START ? ` · ${countdown}` : "";

  return (
    <div ref={rootRef} className="flex w-full max-w-xl flex-col gap-4">
      <MeetingCard
        now={now}
        joined={joined}
        onJoinedChange={setJoined}
        open={open}
        onOpenChange={setOpen}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{lead}</span>
            {early} · {here} of {invited} here
            {open
              ? " · agenda out"
              : now >= START && !joined
                ? " · join now"
                : ""}
          </p>
          <button
            type="button"
            onClick={() => {
              setNow(BEGIN);
              setJoined(false);
              setOpen(false);
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5 shrink-0" />
            Replay
          </button>
        </div>
      ) : null}
    </div>
  );
}
