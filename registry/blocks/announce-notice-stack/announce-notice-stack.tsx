"use client";

import * as React from "react";

import { ToastProvider, useToast } from "@/registry/ui/telemetry-toast";
import { cn } from "@/registry/lib/utils";

export type LaunchNotice = {
  id: string;
  title: string;
  description: string;
  variant?: "info" | "success" | "warn";
  actionLabel?: string;
};

export type AnnounceNoticeStackProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  notices?: LaunchNotice[];
  onAction?: (id: string) => void;
  className?: string;
};

/** Post offsets in ms, fixed rather than staggered live — the demo's schedule. */
const SCHEDULE = [0, 900, 1800, 2700] as const;
/** How long each notice holds before it advances the stack. */
const NOTICE_DURATION = 4200;
/** Mirrors the `max` passed to <ToastProvider> below — kept as one constant. */
const STACK_MAX = 3;

const DEFAULT_NOTICES: LaunchNotice[] = [
  {
    id: "fl-1",
    title: "Fieldline is live",
    description: "Survey crews can log a plot from the truck, signal or not.",
    variant: "success",
    actionLabel: "Read the note",
  },
  {
    id: "fl-2",
    title: "Offline sync",
    description: "Plots captured without signal now queue and merge on reconnect.",
    variant: "info",
    actionLabel: "Read the note",
  },
  {
    id: "fl-3",
    title: "Boundary check",
    description: "A plot crossing a recorded boundary now flags before it submits.",
    variant: "warn",
    actionLabel: "Read the note",
  },
  {
    id: "fl-4",
    title: "Crew handoff",
    description: "A second surveyor can claim a plot mid-walk without restarting it.",
    variant: "success",
    actionLabel: "Read the note",
  },
];

/**
 * A launch announced as a stack, not a list: telemetry-toast doing
 * announcement duty, its own `recoil` entrance and `glide` recede pressed
 * into service for a rollout story instead of a pipeline reading. Four
 * notices post from a fixed offset table rather than a live cadence, which
 * is why the stage plays out identically on every mount and every replay —
 * the front notice holds for a beat, then leaves so the next comes forward,
 * with `max` capped so at most three ever share the stage at once. "Replay
 * the launch" dismisses whatever the schedule has posted so far and restarts
 * the table from zero.
 *
 * Reduced motion: the provider swaps its own entrance and recede springs for
 * a plain stacked list under `prefers-reduced-motion` (see
 * telemetry-toast.tsx) — the fixed schedule underneath is untouched, so the
 * stack still advances on the same beats, just without the spring.
 */
export function AnnounceNoticeStack({
  eyebrow = "Launch notices",
  headline = "The rollout, as the crew saw it",
  deck = "Fieldline shipped in four small moves. This is the stack the way a survey crew watched it arrive, one story at a time, nothing skipped.",
  notices = DEFAULT_NOTICES,
  onAction,
  className,
}: AnnounceNoticeStackProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative border-y border-hairline bg-surface-0", className)}
    >
      <div className="mx-auto grid w-full max-w-4xl gap-8 px-6 py-10 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col gap-3">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="text-lg font-semibold tracking-tight text-ink"
          >
            {headline}
          </h2>
          {deck && (
            <p className="max-w-md text-sm leading-relaxed text-ink-2">
              {deck}
            </p>
          )}
        </div>

        {/*
          `portal={false}` makes the provider position its notifications
          region with `position: absolute` rather than `fixed` (see
          POSITION_CLASSES in telemetry-toast.tsx), so it needs a
          `position: relative` ancestor to be contained by — this box is
          that ancestor, sized to the ~16rem stage the spec asks for, with
          `overflow-hidden` so an exiting card's slide never spills past the
          frame (telemetry-toast.demo.tsx composes the provider the same
          way). `position="bottom-right"` anchors the stack to this box's
          corner instead of the viewport's.

          <NoticeScript> — the only piece that needs useToast() — has to be
          a descendant of <ToastProvider>. Rather than lifting the replay
          control out to the standfirst above, it is rendered here, inside
          the same contained stage as the stack it drives: the provider
          only renders its region wherever it is mounted, so scoping the
          provider tightly to this box is what keeps the stack from ever
          escaping it.
        */}
        <div className="relative h-64 w-full overflow-hidden rounded-3 border border-hairline bg-surface-1">
          <ToastProvider position="bottom-right" max={STACK_MAX} portal={false}>
            <NoticeScript notices={notices} onAction={onAction} />
          </ToastProvider>
        </div>
      </div>
    </section>
  );
}

type NoticeScriptProps = {
  notices: LaunchNotice[];
  onAction?: (id: string) => void;
};

/**
 * Owns the fixed post schedule, its timers, and the replay control — the
 * only parts of this section that call useToast(), and so the only parts
 * that live inside <ToastProvider>.
 */
function NoticeScript({ notices, onAction }: NoticeScriptProps) {
  const { toast, dismiss } = useToast();
  const [running, setRunning] = React.useState(true);
  const timerIds = React.useRef<number[]>([]);
  const postedIds = React.useRef<string[]>([]);
  const onActionRef = React.useRef(onAction);

  React.useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  const clearTimers = React.useCallback(() => {
    for (const id of timerIds.current) window.clearTimeout(id);
    timerIds.current.length = 0;
  }, []);

  const runSchedule = React.useCallback(() => {
    const script = notices.slice(0, SCHEDULE.length);
    script.forEach((notice, index) => {
      const offset = SCHEDULE[index];
      if (offset === undefined) return;
      const timerId = window.setTimeout(() => {
        const postedId = toast({
          title: notice.title,
          description: notice.description,
          variant: notice.variant ?? "info",
          duration: NOTICE_DURATION,
          action: notice.actionLabel
            ? {
                label: notice.actionLabel,
                onClick: () => onActionRef.current?.(notice.id),
              }
            : undefined,
        });
        postedIds.current.push(postedId);
      }, offset);
      timerIds.current.push(timerId);
    });

    // Generous pad: with STACK_MAX 3 and 4 notices, at most one notice can
    // sit queued for a free slot, costing up to one extra duration beyond
    // its own offset before the stage is actually clear.
    const lastOffset = SCHEDULE[SCHEDULE.length - 1] ?? 0;
    const finishTimer = window.setTimeout(() => {
      setRunning(false);
    }, lastOffset + NOTICE_DURATION * 2);
    timerIds.current.push(finishTimer);
  }, [notices, toast]);

  React.useEffect(() => {
    const timers = timerIds.current;
    runSchedule();
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [runSchedule]);

  const replay = () => {
    clearTimers();
    for (const id of postedIds.current) dismiss(id);
    postedIds.current.length = 0;
    setRunning(true);
    runSchedule();
  };

  return (
    <div className="relative z-10 p-3">
      <button
        type="button"
        onClick={replay}
        disabled={running}
        className="text-ink-2 hover:text-ink inline-flex items-center text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
      >
        Replay the launch
      </button>
    </div>
  );
}
