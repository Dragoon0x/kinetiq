"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  CircleAlert,
  Frown,
  Laugh,
  Meh,
  RotateCcw,
  SendHorizontal,
  Smile,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TrackerStage = {
  id: string;
  label: string;
  /** One line on what happens at this stage; shown by the ladder. */
  detail?: string;
};

export type TrackerUpdate = {
  id: string;
  /** Who it is from: support, the customer, or the system. */
  role: "support" | "customer" | "system";
  author: string;
  /** When it was posted, ms. */
  at: number;
  /** The update's heading. */
  title: string;
  body: string;
};

export type TrackerRating = "poor" | "okay" | "good" | "great";
export type TrackerTurn = "support" | "customer";

export type TrackedRequest = {
  number: number;
  subject: string;
  /** In order, from received to solved; the last one is solved. */
  stages: TrackerStage[];
  /** The id of the current stage. */
  stage: string;
  /** Whose turn it is. */
  waitingOn: TrackerTurn;
  /** Oldest first; shown newest first. */
  updates: TrackerUpdate[];
  /** When the request was opened, ms. */
  openedAt: number;
  /** Minutes support aims to reply within. */
  responseTarget: number;
  /** When the clock for support's next reply started: your last message, ms. */
  lastReplyAt: number;
  /** Where replies also go. */
  email?: string;
  rating?: TrackerRating | null;
};

export type RequestTrackerStageStyle = "rail" | "segments" | "ladder";
export type RequestTrackerDensity = "compact" | "cozy" | "roomy";
export type RequestTrackerAccent = "cobalt" | "jade" | "amber" | "mono";

export type RequestTrackerProps = {
  /** How the stages are drawn: a rail with a riding bead, a segmented bar, or a vertical ladder. @default "rail" */
  stageStyle?: RequestTrackerStageStyle;
  /** Type size, paddings and gaps. @default "cozy" */
  density?: RequestTrackerDensity;
  /** The bead, the rail's fill, the turn and Send: cobalt, jade, amber or mono. @default "cobalt" */
  accent?: RequestTrackerAccent;
  /** The request: stages, whose turn it is, updates and the response target. @default defaultTrackedRequest */
  request?: TrackedRequest;
  /** The moment times count from, ms. Never read from the clock. @default defaultTrackerNow */
  now?: number;
  /** Whether the request's updates have arrived. Loading and error keep the layout. @default "ready" */
  status?: "ready" | "loading" | "error";
  /** A reply was sent. Return a promise to hold Send; a rejection keeps the text. */
  onReply?: (text: string) => void | Promise<unknown>;
  /** "My issue is solved" was pressed; the bead goes to the last stage. */
  onClose?: () => void;
  /** Reopen request was pressed on a solved request. */
  onReopen?: () => void;
  /** A solved request was rated. */
  onRate?: (rating: TrackerRating) => void;
  /** Retry was pressed after the updates failed to load. */
  onRetry?: () => void;
  /** Who is answering. @default "Basinworks" */
  company?: string;
  /** The customer's first name, used in the turn line. @default "Jun" */
  customer?: string;
  /** Days a request waiting on you stays open. @default 7 */
  autoCloseDays?: number;
  /** Let the bead breathe while the request waits on you. @default true */
  pulse?: boolean;
  /** Height of the page, px; the updates scroll inside. @default 540 */
  height?: number;
  /** Nothing can be sent, closed, reopened or rated. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Thursday 15 October 2026, 12:20 UTC. */
export const defaultTrackerNow = Date.UTC(2026, 9, 15, 12, 20);
const N = defaultTrackerNow;
const OPENED = N - 2 * DAY - 3 * HOUR - 8 * MIN;

export const defaultTrackerStages: TrackerStage[] = [
  { id: "received", label: "Received", detail: "We have your request." },
  {
    id: "investigating",
    label: "Investigating",
    detail: "Finding the cause.",
  },
  { id: "fixing", label: "Fixing", detail: "A fix is on its way." },
  { id: "solved", label: "Solved", detail: "Confirmed working." },
];

export const defaultTrackedRequest: TrackedRequest = {
  number: 4812,
  subject: "Export to CSV stops at 10,000 rows",
  stages: defaultTrackerStages,
  stage: "investigating",
  waitingOn: "customer",
  openedAt: OPENED,
  responseTarget: 240,
  lastReplyAt: OPENED,
  email: "jun@coldbrook.studio",
  updates: [
    {
      id: "u1",
      role: "system",
      author: "Basinworks",
      at: OPENED,
      title: "Request received",
      body: "We have your request and sent a copy to jun@coldbrook.studio. Replies come here and by email.",
    },
    {
      id: "u2",
      role: "support",
      author: "Noor",
      at: OPENED + 3 * HOUR,
      title: "Looking into the export limit",
      body: "Thanks Jun. I can reproduce the cut-off on workspaces with more than 10,000 rows, so it isn't your file. I've moved this to Investigating.",
    },
    {
      id: "u3",
      role: "support",
      author: "Noor",
      at: N - 25 * MIN,
      title: "Could you send the export log ID?",
      body: "In Settings, open Exports, then the last export, and copy its log ID (it starts with EX-). It tells us which server handled it.",
    },
  ],
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ACCENT: Record<RequestTrackerAccent, Record<string, string>> = {
  cobalt: {
    "--rt-ink": "var(--accent-bright)",
    "--rt-fill": "var(--primary)",
    "--rt-on": "var(--primary-foreground)",
  },
  jade: {
    "--rt-ink": "var(--success)",
    "--rt-fill": "oklch(from var(--success) 0.52 0.12 h)",
    "--rt-on": "var(--primary-foreground)",
  },
  amber: {
    "--rt-ink": "var(--warn)",
    "--rt-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--rt-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  mono: {
    "--rt-ink": "var(--foreground)",
    "--rt-fill": "var(--foreground)",
    "--rt-on": "var(--background)",
  },
};

type Geometry = {
  pad: string;
  gap: string;
  body: string;
  title: string;
  rung: number;
  rows: number;
};

const DENSITY: Record<RequestTrackerDensity, Geometry> = {
  compact: {
    pad: "p-3",
    gap: "gap-2.5",
    body: "text-[12px] leading-[1.45]",
    title: "text-[12.5px] leading-4",
    rung: 34,
    rows: 2,
  },
  cozy: {
    pad: "p-4",
    gap: "gap-3",
    body: "text-[12.5px] leading-[1.5]",
    title: "text-[13px] leading-[1.35]",
    rung: 40,
    rows: 2,
  },
  roomy: {
    pad: "p-5",
    gap: "gap-4",
    body: "text-[13.5px] leading-[1.55]",
    title: "text-[14px] leading-5",
    rung: 46,
    rows: 3,
  },
};

const RATINGS: {
  id: TrackerRating;
  label: string;
  icon: typeof Smile;
}[] = [
  { id: "poor", label: "Poor", icon: Frown },
  { id: "okay", label: "Okay", icon: Meh },
  { id: "good", label: "Good", icon: Smile },
  { id: "great", label: "Great", icon: Laugh },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};
/** A fixed 24-hour clock in UTC: a locale lookup would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const span = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
const ago = (now: number, at: number) => {
  const m = Math.round((now - at) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return day(at);
};
const r3 = (v: number) => Number(v.toFixed(3));

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]";
const GHOST = cn(BUTTON, "text-ink-2 hover:bg-surface-2 hover:text-foreground");
const PRIMARY = cn(
  BUTTON,
  "bg-[var(--rt-fill)] text-[var(--rt-on)] hover:bg-[color-mix(in_oklab,var(--rt-fill)_88%,var(--foreground))]",
);

/** A node's height, measured when it arrives and whenever it changes. */
function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

/* ----------------------------------------------------------------------- */
/*                                The track                                 */
/* ----------------------------------------------------------------------- */

/** The breathing ring around the bead while the request waits on you. */
function Pulse({ breathing }: { breathing: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--rt-ink)]"
      initial={false}
      animate={
        breathing
          ? { scale: [1, 2.1], opacity: [0.55, 0] }
          : { scale: 1.45, opacity: 0.3 }
      }
      transition={
        breathing
          ? { duration: 1.8, ease: easings.enter, repeat: Infinity }
          : { duration: durations.fast }
      }
    />
  );
}

function Check({ done, motionSafe }: { done: boolean; motionSafe: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="size-2.5">
      <motion.path
        d="M2.2 5.3 4.2 7.2 7.9 3"
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-[var(--rt-on)]"
        initial={false}
        animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
        transition={
          motionSafe
            ? {
                pathLength: { ...springs.flick, delay: 0.18 },
                opacity: { duration: 0.05 },
              }
            : { duration: 0 }
        }
      />
    </svg>
  );
}

function Track({
  stages,
  index,
  pos,
  style,
  waiting,
  breathing,
  solved,
  muted,
  geo,
  motionSafe,
}: {
  stages: TrackerStage[];
  index: number;
  pos: MotionValue<number>;
  style: RequestTrackerStageStyle;
  waiting: boolean;
  breathing: boolean;
  solved: boolean;
  muted: boolean;
  geo: Geometry;
  motionSafe: boolean;
}) {
  const n = Math.max(1, stages.length);
  const last = Math.max(1, n - 1);
  const fraction = useTransform(pos, (p) =>
    r3(Math.min(1, Math.max(0, p / last))),
  );
  const railLeft = useTransform(
    pos,
    (p) => `${r3((Math.min(last, Math.max(0, p)) / last) * 100)}%`,
  );
  const segLeft = useTransform(
    pos,
    (p) => `calc(${r3(Math.min(n - 1, Math.max(0, p)))} * (100% + 4px) / ${n})`,
  );
  const ladderY = useTransform(pos, (p) =>
    r3(Math.min(n - 1, Math.max(0, p)) * geo.rung),
  );

  const bead = (
    <span className="relative block size-3.5">
      {waiting && !solved && !muted ? <Pulse breathing={breathing} /> : null}
      <span
        className={cn(
          "absolute inset-0 rounded-full border-2 border-card shadow-[0_0_0_1px_var(--rt-ink)]",
          muted ? "bg-ink-3" : solved ? "bg-success" : "bg-[var(--rt-ink)]",
        )}
      />
    </span>
  );

  const state = (i: number) =>
    i < index || (solved && i === index)
      ? "completed"
      : i === index
        ? "current"
        : "to do";

  // The stages are one list for assistive technology; the bead, line and
  // dots around it are drawing.
  const list = (
    className: string,
    item: (i: number) => { className: string; style?: React.CSSProperties },
    render: (stage: TrackerStage, i: number) => React.ReactNode,
  ) => (
    <ol aria-label="Progress" className={className}>
      {stages.map((stage, i) => {
        const { className: itemClass, style: itemStyle } = item(i);
        return (
          <li
            key={stage.id}
            aria-current={i === index ? "step" : undefined}
            className={itemClass}
            style={itemStyle}
          >
            {render(stage, i)}
          </li>
        );
      })}
    </ol>
  );

  if (style === "ladder") {
    return (
      <div className="relative" style={{ height: n * geo.rung }}>
        {/* The line runs between the first and last rung's centres. */}
        <span
          aria-hidden
          className="absolute left-[6px] w-0.5 rounded-full bg-hairline-strong"
          style={{ top: geo.rung / 2, height: (n - 1) * geo.rung }}
        />
        <motion.span
          aria-hidden
          className={cn(
            "absolute left-[6px] w-0.5 rounded-full",
            muted ? "bg-ink-3" : "bg-[var(--rt-ink)]",
          )}
          style={{
            top: geo.rung / 2,
            height: (n - 1) * geo.rung,
            scaleY: fraction,
            originY: 0,
          }}
        />
        {list(
          "absolute inset-0",
          (i) => ({
            className: "absolute inset-x-0 flex items-center gap-3 pl-7",
            style: { top: i * geo.rung, height: geo.rung },
          }),
          (stage, i) => (
            <>
              <span
                aria-hidden
                className={cn(
                  "absolute left-0 flex size-3.5 items-center justify-center rounded-full border",
                  i < index || (solved && i === index)
                    ? "border-transparent bg-[var(--rt-ink)]"
                    : "border-hairline-strong bg-card",
                  muted && "border-hairline bg-surface-2",
                )}
              >
                <Check
                  done={!muted && (i < index || (solved && i === index))}
                  motionSafe={motionSafe}
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "truncate text-[12.5px] leading-4",
                    i === index
                      ? "font-semibold text-foreground"
                      : i < index
                        ? "text-ink-2"
                        : "text-ink-3",
                  )}
                >
                  {stage.label}
                  <span className="sr-only">, {state(i)}</span>
                </span>
                {i === index && stage.detail ? (
                  <span className="truncate text-[11px] leading-4 text-ink-3">
                    {stage.detail}
                  </span>
                ) : null}
              </span>
            </>
          ),
        )}
        <motion.span
          aria-hidden
          className="absolute left-0 z-10"
          style={{ top: geo.rung / 2 - 7, y: ladderY }}
        >
          {bead}
        </motion.span>
      </div>
    );
  }

  if (style === "segments") {
    return (
      <div className="flex flex-col gap-2">
        <div className="relative flex h-2.5 gap-1">
          {stages.map((stage, i) => (
            <span
              key={stage.id}
              aria-hidden
              className={cn(
                "h-full flex-1 rounded-full transition-colors",
                muted
                  ? "bg-surface-2"
                  : i < index || (solved && i === index)
                    ? "bg-[color-mix(in_oklab,var(--rt-ink)_55%,transparent)]"
                    : "bg-hairline-strong",
              )}
              style={{
                transitionDuration: `${Math.round(durations.base * 1000)}ms`,
              }}
            />
          ))}
          <motion.span
            aria-hidden
            className="absolute inset-y-0 flex items-center"
            style={{
              left: segLeft,
              width: `calc((100% - ${(n - 1) * 4}px) / ${n})`,
            }}
          >
            <span className="relative h-2.5 w-full">
              {waiting && !solved && !muted ? (
                <span className="absolute inset-0">
                  <motion.span
                    className="absolute inset-0 rounded-full bg-[var(--rt-ink)]"
                    initial={false}
                    animate={
                      breathing
                        ? { opacity: [0.45, 0], scaleY: [1, 2.6] }
                        : { opacity: 0.25, scaleY: 1.8 }
                    }
                    transition={
                      breathing
                        ? {
                            duration: 1.8,
                            ease: easings.enter,
                            repeat: Infinity,
                          }
                        : { duration: durations.fast }
                    }
                  />
                </span>
              ) : null}
              <span
                className={cn(
                  "absolute inset-0 rounded-full",
                  muted
                    ? "bg-ink-3"
                    : solved
                      ? "bg-success"
                      : "bg-[var(--rt-ink)]",
                )}
              />
            </span>
          </motion.span>
        </div>
        {list(
          "flex gap-1",
          (i) => ({
            className: cn(
              "min-w-0 flex-1 truncate text-[11px] leading-4",
              i === index
                ? "font-semibold text-foreground"
                : i < index
                  ? "text-ink-2"
                  : "text-ink-3",
            ),
          }),
          (stage, i) => (
            <>
              {stage.label}
              <span className="sr-only">, {state(i)}</span>
            </>
          ),
        )}
      </div>
    );
  }

  // Rail: the dots sit inset by half a label, so the end labels never
  // overhang the box.
  return (
    <div className="relative px-8">
      <div className="relative h-3.5">
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-hairline-strong"
        />
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full",
            muted ? "bg-ink-3" : solved ? "bg-success" : "bg-[var(--rt-ink)]",
          )}
          style={{ scaleX: fraction, originX: 0 }}
        />
        {stages.map((stage, i) => (
          <span
            key={stage.id}
            aria-hidden
            className={cn(
              "absolute top-1/2 flex size-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border",
              muted
                ? "border-hairline bg-surface-2"
                : i < index || (solved && i === index)
                  ? "border-transparent bg-[var(--rt-ink)]"
                  : "border-hairline-strong bg-card",
            )}
            style={{ left: `${r3((i / last) * 100)}%` }}
          >
            <Check
              done={!muted && (i < index || (solved && i === index))}
              motionSafe={motionSafe}
            />
          </span>
        ))}
        <motion.span
          aria-hidden
          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: railLeft }}
        >
          {bead}
        </motion.span>
      </div>
      {list(
        "absolute inset-0",
        (i) => ({
          className: cn(
            "absolute top-5 w-16 -translate-x-1/2 text-center text-[11px] leading-[1.25] @max-[19rem]/request-tracker:sr-only",
            i === index
              ? "font-semibold text-foreground"
              : i < index
                ? "text-ink-2"
                : "text-ink-3",
          ),
          style: { left: `calc(2rem + (100% - 4rem) * ${r3(i / last)})` },
        }),
        (stage, i) => (
          <>
            {stage.label}
            <span className="sr-only">, {state(i)}</span>
          </>
        ),
      )}
      <div
        aria-hidden
        className="h-[34px] @max-[19rem]/request-tracker:hidden"
      />
      {/* Too narrow for four labels side by side: one caption names the
          current stage instead (the list above still reads every stage). */}
      <p
        aria-hidden
        className="-mx-8 hidden pt-2 text-[11.5px] leading-4 text-ink-3 @max-[19rem]/request-tracker:block"
      >
        <span className="font-semibold text-foreground">
          {stages[index]?.label}
        </span>{" "}
        · step {index + 1} of {n}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

/**
 * A customer's own page for a support request: where it is, and whose turn
 * it is. A bead rides the stages from received to solved — a stage change
 * glides it there on `springs.glide`, the rail's fill riding the same motion
 * value, and the stage it reaches fills with a check drawn on `springs.flick`.
 * When the request waits on you the bead breathes (a ring on a repeating
 * tween, only while in view, in a visible tab and motion is safe) and the
 * reply box rises into view: its measured height opens on glide and its
 * contents rise 8px. Replying lands your update at the top of the list on
 * glide and passes the turn to support, with an honest next-reply time from
 * the response target.
 *
 * Updates are a list of articles with headings, the reply box sends with
 * Ctrl+Enter, the turn line's Reply moves focus to it, and a solved request
 * asks for a rating (a radiogroup) and offers Reopen. Loading and error keep
 * the layout. Under reduced motion the bead moves in one step, the ring holds
 * still and the reply box opens without travel; every state still shows.
 */
export function RequestTracker({
  stageStyle = "rail",
  density = "cozy",
  accent = "cobalt",
  request = defaultTrackedRequest,
  now = defaultTrackerNow,
  status = "ready",
  onReply,
  onClose,
  onReopen,
  onRate,
  onRetry,
  company = "Basinworks",
  customer = "Jun",
  autoCloseDays = 7,
  pulse = true,
  height = 540,
  disabled = false,
  className,
}: RequestTrackerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const geo = DENSITY[density] ?? DENSITY.cozy;
  const loading = status === "loading";
  const failed = status === "error";

  /* ------------------------------- state -------------------------------- */

  const [stage, setStage] = React.useState(request.stage);
  const [turn, setTurn] = React.useState<TrackerTurn>(request.waitingOn);
  const [updates, setUpdates] = React.useState(request.updates);
  const [lastReplyAt, setLastReplyAt] = React.useState(request.lastReplyAt);
  const [rating, setRating] = React.useState<TrackerRating | null>(
    request.rating ?? null,
  );
  const [seen, setSeen] = React.useState(request);
  const [draft, setDraft] = React.useState("");
  const [composing, setComposing] = React.useState(false);
  const [sendState, setSendState] = React.useState<
    "idle" | "sending" | "failed"
  >("idle");
  const [announcement, setAnnouncement] = React.useState("");

  // The host's request is the truth; whatever it changes is taken, and what
  // it leaves alone keeps what the visitor did here.
  if (seen !== request) {
    setSeen(request);
    if (request.number !== seen.number) {
      setStage(request.stage);
      setTurn(request.waitingOn);
      setUpdates(request.updates);
      setLastReplyAt(request.lastReplyAt);
      setRating(request.rating ?? null);
      setDraft("");
      setComposing(false);
      setSendState("idle");
    } else {
      if (request.stage !== seen.stage) setStage(request.stage);
      if (request.waitingOn !== seen.waitingOn) setTurn(request.waitingOn);
      // The host's updates, plus what was posted here that it hasn't echoed.
      if (request.updates !== seen.updates)
        setUpdates((list) => [
          ...request.updates,
          ...list.filter(
            (u) =>
              u.id.startsWith(`${uid}-`) &&
              !request.updates.some((h) => h.id === u.id),
          ),
        ]);
      if (request.lastReplyAt !== seen.lastReplyAt)
        setLastReplyAt(request.lastReplyAt);
      if (request.rating !== seen.rating) setRating(request.rating ?? null);
    }
  }

  const stages = request.stages;
  const index = Math.max(
    0,
    stages.findIndex((s) => s.id === stage),
  );
  const solved = index === stages.length - 1;
  const current = stages[index];
  const waiting = turn === "customer" && !solved;
  const latestSupport = [...updates]
    .reverse()
    .find((u) => u.role === "support");
  const due = lastReplyAt + request.responseTarget * MIN;
  const late = now > due;

  /* ------------------------------- bead --------------------------------- */

  const pos = useMotionValue(index);
  React.useEffect(() => {
    if (!motionSafe) {
      pos.jump(index);
      return;
    }
    const controls = animate(pos, index, springs.glide);
    return () => controls.stop();
  }, [index, motionSafe, pos]);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const inView = useInView(rootRef, { amount: 0.2 });
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const breathing =
    waiting && pulse && motionSafe && inView && visible && !loading && !failed;

  /* ------------------------------- reply -------------------------------- */

  const replyOpen = !solved && !loading && !failed && (waiting || composing);
  const [bindReply, replyHeight] = useMeasured();
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [textarea, setTextarea] = React.useState<HTMLTextAreaElement | null>(
    null,
  );
  const bindTextarea = React.useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    setTextarea(node);
  }, []);
  const wantFocus = React.useRef(false);
  const focusMore = React.useRef(false);
  const [moreNode, setMoreNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  React.useEffect(() => {
    if (!moreNode || !focusMore.current || !moreNode.isConnected) return;
    focusMore.current = false;
    moreNode.focus({ preventScroll: true });
  }, [moreNode]);
  React.useEffect(() => {
    if (!textarea || !wantFocus.current || !textarea.isConnected) return;
    wantFocus.current = false;
    textarea.focus({ preventScroll: true });
  }, [textarea, replyOpen]);

  const send = () => {
    const text = draft.trim();
    if (!text || disabled || sendState === "sending") return;
    const land = () => {
      // The reply box folds away; if focus was in it, it moves to Add more
      // detail once that arrives, never left inside a hidden box.
      if (document.activeElement?.closest("[data-rt-reply]"))
        focusMore.current = true;
      const next: TrackerUpdate = {
        id: `${uid}-reply-${updates.length}`,
        role: "customer",
        author: "You",
        at: now,
        title: "You replied",
        body: text,
      };
      setUpdates((list) => [...list, next]);
      setTurn("support");
      setLastReplyAt(now);
      setDraft("");
      setComposing(false);
      setSendState("idle");
      setAnnouncement(
        `Reply sent. It's with ${company} now; next reply by ${clock(now + request.responseTarget * MIN)}.`,
      );
    };
    const result = onReply?.(text);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setSendState("sending");
      (result as Promise<unknown>).then(land, () => {
        setSendState("failed");
        setAnnouncement("Couldn't send. Your reply is still here.");
      });
    } else {
      land();
    }
  };

  const close = () => {
    if (disabled || solved) return;
    const last = stages[stages.length - 1];
    if (!last) return;
    setStage(last.id);
    setComposing(false);
    setUpdates((list) => [
      ...list,
      {
        id: `${uid}-closed-${list.length}`,
        role: "customer",
        author: "You",
        at: now,
        title: "You marked this solved",
        body: "Thanks for confirming. We've closed the request.",
      },
    ]);
    onClose?.();
    setAnnouncement("Request marked solved. How did we do?");
  };

  const reopen = () => {
    if (disabled || !solved) return;
    const back = stages[Math.max(0, stages.length - 3)] ?? stages[0];
    if (!back) return;
    setStage(back.id);
    setTurn("support");
    setLastReplyAt(now);
    setRating(null);
    setUpdates((list) => [
      ...list,
      {
        id: `${uid}-reopened-${list.length}`,
        role: "customer",
        author: "You",
        at: now,
        title: "You reopened this request",
        body: `It's back with ${company}.`,
      },
    ]);
    onReopen?.();
    setAnnouncement(`Request reopened. It's back with ${company}.`);
  };

  const rate = (next: TrackerRating) => {
    if (disabled) return;
    setRating(next);
    onRate?.(next);
    const label = RATINGS.find((r) => r.id === next)?.label ?? next;
    setAnnouncement(`Thanks. You rated this ${label}.`);
  };

  // A turn that changes is announced once, in words, from the new turn.
  const [seenTurn, setSeenTurn] = React.useState(`${turn}|${stage}`);
  if (seenTurn !== `${turn}|${stage}`) {
    setSeenTurn(`${turn}|${stage}`);
    if (solved)
      setAnnouncement(`${current?.label ?? "Solved"}. How did we do?`);
    else if (turn === "customer")
      setAnnouncement(
        `Your turn. ${latestSupport?.author ?? company} is waiting for your reply.`,
      );
    else setAnnouncement(`${current?.label ?? ""}. It's with ${company}.`);
  }

  /* ------------------------------ rating -------------------------------- */

  const ratingRefs = React.useRef(
    new Map<TrackerRating, HTMLButtonElement | null>(),
  );
  const onRatingKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    let next = i;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (i + 1) % RATINGS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (i - 1 + RATINGS.length) % RATINGS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = RATINGS.length - 1;
    else return;
    event.preventDefault();
    const target = RATINGS[next];
    if (!target) return;
    rate(target.id);
    ratingRefs.current.get(target.id)?.focus();
  };

  /* ------------------------------- parts -------------------------------- */

  const accentVars = (ACCENT[accent] ?? ACCENT.cobalt) as React.CSSProperties;
  const sorted = [...updates].sort((a, b) => b.at - a.at);
  const fresh = new Set(updates.slice(request.updates.length).map((u) => u.id));

  const turnTone = solved ? "solved" : waiting ? "you" : late ? "late" : "us";
  const turnPill = (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11.5px] font-semibold",
        turnTone === "you" && "bg-[var(--rt-fill)] text-[var(--rt-on)]",
        turnTone === "us" && "bg-surface-2 text-foreground",
        turnTone === "late" &&
          "bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-foreground",
        turnTone === "solved" &&
          "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          turnTone === "you" && "bg-[var(--rt-on)]",
          turnTone === "us" && "bg-[var(--rt-ink)]",
          turnTone === "late" && "bg-warn",
          turnTone === "solved" && "bg-success",
        )}
      />
      {turnTone === "you"
        ? "Your turn"
        : turnTone === "solved"
          ? "Solved"
          : `With ${company}`}
    </span>
  );

  const turnText = solved
    ? `Closed ${day(now)}. Reopen any time in the next ${autoCloseDays} days.`
    : waiting
      ? `${latestSupport?.author ?? company} is waiting for your reply, ${customer}. We'll keep this open ${autoCloseDays} days.`
      : late
        ? `Running late. We aimed to reply by ${clock(due)} and we're on it.`
        : `Next reply by ${clock(due)}, in ${span((due - now) / MIN)}.`;

  const turnCard = (
    <div
      className={cn(
        "relative flex flex-col gap-2 rounded-3 border px-3 py-2.5",
        waiting
          ? "border-[color-mix(in_oklab,var(--rt-ink)_40%,transparent)] bg-[color-mix(in_oklab,var(--rt-ink)_6%,transparent)]"
          : "border-hairline bg-surface-1",
      )}
    >
      {loading ? (
        <>
          <span className="h-6 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          <span className="h-2.5 w-4/5 rounded-full bg-surface-2" />
        </>
      ) : (
        <>
          <div className="flex items-center">{turnPill}</div>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={turnText}
              className={cn("text-ink-2", geo.body)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {turnText}
            </motion.p>
          </AnimatePresence>
          {!solved && !failed ? (
            <div className="-mx-1.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
              {!waiting && !composing ? (
                <button
                  ref={setMoreNode}
                  type="button"
                  onClick={() => {
                    if (disabled) return;
                    wantFocus.current = true;
                    setComposing(true);
                  }}
                  aria-disabled={disabled || undefined}
                  className={cn(
                    GHOST,
                    FOCUS,
                    "h-7 px-1.5 text-[var(--rt-ink)] hover:text-[var(--rt-ink)]",
                  )}
                >
                  Add more detail
                </button>
              ) : null}
              <button
                type="button"
                onClick={close}
                aria-disabled={disabled || undefined}
                className={cn(GHOST, FOCUS, "h-7 px-1.5")}
              >
                My issue is solved
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const replyBox = (
    <motion.div
      className="overflow-hidden [grid-area:reply]"
      initial={false}
      animate={{
        height: replyOpen ? replyHeight : 0,
        opacity: replyOpen ? 1 : 0,
      }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
      aria-hidden={!replyOpen || undefined}
      data-rt-reply=""
    >
      <motion.div
        ref={bindReply}
        className={cn(
          geo.pad,
          "flex flex-col gap-2 border-t border-hairline @min-[40rem]/request-tracker:border-t-0 @min-[40rem]/request-tracker:p-0",
        )}
        initial={false}
        animate={{ y: replyOpen || !motionSafe ? 0 : distances.step }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        {/* The question the reply answers is its label: one line here, in
            full for assistive technology. */}
        <label
          htmlFor={`${uid}-reply`}
          title={waiting && latestSupport ? latestSupport.title : undefined}
          className={cn("flex min-w-0 items-baseline gap-1.5", geo.title)}
        >
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {waiting
              ? `Reply to ${latestSupport?.author ?? company}`
              : "Add more detail"}
          </span>
          {waiting && latestSupport ? (
            <span className="min-w-0 truncate font-medium text-foreground">
              {latestSupport.title}
            </span>
          ) : null}
        </label>
        <div
          className={cn(
            "rounded-3 border bg-surface-0 transition-colors has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:-outline-offset-1 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
            sendState === "failed"
              ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
              : "border-input focus-within:border-[color-mix(in_oklab,var(--rt-ink)_55%,transparent)]",
          )}
        >
          <textarea
            ref={bindTextarea}
            id={`${uid}-reply`}
            rows={geo.rows}
            value={draft}
            tabIndex={replyOpen ? 0 : -1}
            readOnly={disabled}
            aria-disabled={disabled || undefined}
            aria-describedby={`${uid}-reply-hint`}
            placeholder={
              waiting
                ? "Paste the log ID or write a reply…"
                : "Anything else we should know…"
            }
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft(value);
              if (sendState === "failed") setSendState("idle");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                send();
              } else if (event.key === "Escape" && composing && !waiting) {
                event.preventDefault();
                focusMore.current = true;
                setComposing(false);
              }
            }}
            className={cn(
              "block w-full resize-none bg-transparent px-3 pt-2 pb-1 text-foreground outline-none placeholder:text-ink-3",
              geo.body,
            )}
          />
          <div className="flex items-center gap-2 px-1.5 pb-1.5">
            <span
              id={`${uid}-reply-hint`}
              className={cn(
                "min-w-0 flex-1 truncate pl-1.5 text-[11px]",
                sendState === "failed"
                  ? "text-danger"
                  : "font-mono text-[10px] text-ink-3",
              )}
            >
              {sendState === "failed" ? (
                <span className="inline-flex items-center gap-1">
                  <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                  Couldn&apos;t send. Try again.
                </span>
              ) : (
                <span className="hidden @min-[17rem]/request-tracker:inline">
                  ctrl ↵ sends
                </span>
              )}
            </span>
            {composing && !waiting ? (
              <button
                type="button"
                tabIndex={replyOpen ? 0 : -1}
                onClick={() => {
                  focusMore.current = true;
                  setComposing(false);
                }}
                className={cn(GHOST, FOCUS, "h-7 px-2")}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              tabIndex={replyOpen ? 0 : -1}
              onClick={send}
              aria-disabled={
                disabled ||
                !draft.trim() ||
                sendState === "sending" ||
                undefined
              }
              aria-busy={sendState === "sending" || undefined}
              className={cn(
                PRIMARY,
                FOCUS,
                "h-7 px-2.5",
                (!draft.trim() || disabled) &&
                  sendState !== "sending" &&
                  "opacity-50",
              )}
            >
              <SendHorizontal aria-hidden className="size-3.5" />
              {sendState === "sending"
                ? "Sending…"
                : sendState === "failed"
                  ? "Retry"
                  : "Send"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  const ratingBlock =
    solved && !loading && !failed ? (
      <motion.div
        className={cn(
          geo.pad,
          "flex flex-col gap-2 border-t border-hairline [grid-area:reply] @min-[40rem]/request-tracker:border-t-0 @min-[40rem]/request-tracker:p-0",
        )}
        initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <span
          id={`${uid}-rate`}
          className={cn("font-medium text-foreground", geo.title)}
        >
          {rating ? "Thanks for rating us." : "How did we do?"}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${uid}-rate`}
          className="grid grid-cols-4 gap-1.5"
        >
          {RATINGS.map((option, i) => {
            const chosen = rating === option.id;
            const Icon = option.icon;
            const tabbable = rating ? chosen : i === 0;
            return (
              <button
                key={option.id}
                ref={(node) => {
                  ratingRefs.current.set(option.id, node);
                }}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-disabled={disabled || undefined}
                tabIndex={tabbable ? 0 : -1}
                onClick={() => rate(option.id)}
                onKeyDown={(event) => onRatingKey(event, i)}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 rounded-2 border text-[11px] font-medium transition-colors",
                  chosen
                    ? "border-[color-mix(in_oklab,var(--rt-ink)_55%,transparent)] bg-[color-mix(in_oklab,var(--rt-ink)_10%,transparent)] text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <motion.span
                  className="flex"
                  initial={false}
                  animate={{ scale: chosen && motionSafe ? [0.7, 1] : 1, y: 0 }}
                  transition={
                    chosen && motionSafe
                      ? springs.recoil
                      : { duration: durations.fast }
                  }
                  style={{ originX: 0.5, originY: 0.5 }}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-4.5",
                      chosen ? "text-[var(--rt-ink)]" : "",
                    )}
                  />
                </motion.span>
                {option.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={reopen}
          aria-disabled={disabled || undefined}
          className={cn(GHOST, FOCUS, "-ml-1.5 h-7 self-start px-1.5")}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reopen request
        </button>
      </motion.div>
    ) : null;

  const feed = loading ? (
    <div className={cn("flex flex-col", geo.pad, geo.gap)}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-2 border-b border-hairline pb-3 last:border-b-0"
        >
          <span className="h-3 w-1/2 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          <span className="h-2.5 w-1/4 rounded-full bg-surface-2" />
          <span className="h-2.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
          <span className="h-2.5 w-3/4 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  ) : failed ? (
    <div className={cn("flex flex-col items-start gap-2", geo.pad)}>
      <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <CircleAlert aria-hidden className="size-4 text-danger" />
        Couldn&apos;t load the latest updates.
      </span>
      <p className={cn("text-ink-2", geo.body)}>
        Your request is safe. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          BUTTON,
          FOCUS,
          "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
        )}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Retry
      </button>
    </div>
  ) : (
    <ol aria-label="Updates" className={cn("flex flex-col", geo.pad, geo.gap)}>
      {sorted.map((update, i) => {
        const isNew = fresh.has(update.id);
        return (
          <motion.li
            key={update.id}
            layout={motionSafe ? "position" : false}
            className="border-b border-hairline pb-3 last:border-b-0 last:pb-0"
            initial={
              isNew
                ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                : { opacity: 0, y: motionSafe ? distances.nudge : 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? {
                    layout: springs.glide,
                    y: {
                      ...springs.glide,
                      delay: isNew ? 0 : i * cascade(sorted.length),
                    },
                    opacity: {
                      duration: durations.base,
                      delay: isNew ? 0 : i * cascade(sorted.length),
                    },
                  }
                : { duration: durations.fast }
            }
          >
            <article
              aria-labelledby={`${uid}-u-${update.id}`}
              className="flex flex-col gap-1"
            >
              <h3
                id={`${uid}-u-${update.id}`}
                className={cn("font-semibold text-foreground", geo.title)}
              >
                {update.title}
              </h3>
              <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] leading-4 text-ink-3">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    update.role === "support"
                      ? "bg-[var(--rt-ink)]"
                      : update.role === "customer"
                        ? "bg-ink-2"
                        : "bg-ink-3",
                  )}
                />
                <span className="font-medium text-ink-2">
                  {update.role === "customer"
                    ? "You"
                    : update.role === "support"
                      ? `${update.author}, ${company}`
                      : update.author}
                </span>
                <span>· {ago(now, update.at)}</span>
              </p>
              <p className={cn("text-ink-2", geo.body)}>{update.body}</p>
            </article>
          </motion.li>
        );
      })}
    </ol>
  );

  return (
    <section
      ref={rootRef}
      aria-label={`Request ${request.number}: ${request.subject}`}
      aria-busy={loading || undefined}
      className={cn(
        "@container/request-tracker relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...accentVars, height }}
    >
      <div
        className={cn(
          "grid size-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] [grid-template-areas:'head'_'turn'_'track'_'feed'_'reply']",
          "@min-[40rem]/request-tracker:grid-cols-[minmax(0,1fr)_17rem] @min-[40rem]/request-tracker:grid-rows-[auto_auto_minmax(0,1fr)] @min-[40rem]/request-tracker:[grid-template-areas:'head_side'_'track_side'_'feed_side']",
        )}
      >
        <header
          className={cn(geo.pad, "flex flex-col gap-1 pb-2 [grid-area:head]")}
        >
          <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[10.5px] leading-4 tracking-[0.04em] text-ink-3 tabular-nums">
            <span className="text-ink-2">Request {request.number}</span>
            <span aria-hidden>·</span>
            <span>Opened {day(request.openedAt)}</span>
          </p>
          {loading ? (
            <span className="my-1 h-3.5 w-4/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          ) : (
            <h2
              className="line-clamp-2 text-[15px] leading-5 font-semibold text-foreground"
              title={request.subject}
            >
              {request.subject}
            </h2>
          )}
        </header>

        {/* At narrow widths these are grid items of their own; at wide
            widths they stack in a side column. */}
        <div
          className={cn(
            "contents @min-[40rem]/request-tracker:flex @min-[40rem]/request-tracker:flex-col @min-[40rem]/request-tracker:overflow-y-auto @min-[40rem]/request-tracker:overscroll-contain @min-[40rem]/request-tracker:border-l @min-[40rem]/request-tracker:border-hairline @min-[40rem]/request-tracker:bg-surface-1 @min-[40rem]/request-tracker:[grid-area:side]",
            density === "compact"
              ? "@min-[40rem]/request-tracker:gap-2.5 @min-[40rem]/request-tracker:p-3"
              : density === "roomy"
                ? "@min-[40rem]/request-tracker:gap-4 @min-[40rem]/request-tracker:p-5"
                : "@min-[40rem]/request-tracker:gap-3 @min-[40rem]/request-tracker:p-4",
          )}
        >
          <div
            className={cn(
              geo.pad,
              "pt-0 pb-2 [grid-area:turn] @min-[40rem]/request-tracker:p-0",
            )}
          >
            {turnCard}
          </div>
          {replyBox}
          {ratingBlock}
          <dl className="hidden grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11.5px] leading-4 @min-[40rem]/request-tracker:grid">
            <dt className="text-ink-3">Request</dt>
            <dd className="font-mono text-foreground tabular-nums">
              {request.number}
            </dd>
            <dt className="text-ink-3">Opened</dt>
            <dd className="text-foreground">
              {day(request.openedAt)}, {clock(request.openedAt)}
            </dd>
            <dt className="text-ink-3">We reply</dt>
            <dd className="text-foreground">
              within {span(request.responseTarget)}
            </dd>
            {request.email ? (
              <>
                <dt className="text-ink-3">Copies to</dt>
                <dd className="truncate text-foreground" title={request.email}>
                  {request.email}
                </dd>
              </>
            ) : null}
          </dl>
        </div>

        <div
          className={cn(
            geo.pad,
            "py-2 [grid-area:track]",
            (loading || failed) && "opacity-60",
          )}
        >
          <Track
            stages={stages}
            index={index}
            pos={pos}
            style={stageStyle}
            waiting={waiting}
            breathing={breathing}
            solved={solved}
            muted={loading || failed}
            geo={geo}
            motionSafe={motionSafe}
          />
        </div>

        <motion.div
          layoutScroll
          // Focusable, so a keyboard can scroll the updates.
          tabIndex={0}
          role="group"
          aria-label="Request updates"
          className="overflow-y-auto overscroll-contain border-t border-hairline outline-none [grid-area:feed] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          {feed}
        </motion.div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
