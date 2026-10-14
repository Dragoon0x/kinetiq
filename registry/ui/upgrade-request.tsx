"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Clock,
  ExternalLink,
  Inbox,
  LifeBuoy,
  Lock,
  LockOpen,
  RotateCcw,
  Send,
  TriangleAlert,
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

export type UpgradeUrgency = "low" | "normal" | "high";
export type UpgradeStage = "sent" | "seen" | "approved" | "declined";
export type UpgradeRailStyle = "rail" | "steps";
export type UpgradeDensity = "compact" | "cozy" | "roomy";
export type UpgradeAccent = "cobalt" | "signal" | "ink";
export type UpgradeStatus = "ready" | "loading" | "error";

export type UpgradeFeature = {
  id: string;
  /** What the member tried to use, e.g. "Shared exports". */
  name: string;
  /** The plan that includes it, e.g. "Team". */
  plan: string;
  /** One line on what it does. */
  summary: string;
  /** What approval unlocks, as short phrases. */
  unlocks: string[];
};

export type UpgradeAdmin = {
  id: string;
  name: string;
  /** Shown with the name, e.g. "Workspace owner". */
  role?: string;
  /** The avatar's hue in degrees, drawn from the accent. @default by position */
  hue?: number;
};

export type UpgradeRequestRecord = {
  id: string;
  featureId: string;
  featureName: string;
  adminId: string;
  urgency: UpgradeUrgency;
  note: string;
  /** When it was sent, in ms. */
  sentAt: number;
  stage: UpgradeStage;
  /** When the admin opened it, in ms. */
  seenAt?: number;
  /** When the admin decided, in ms. */
  decidedAt?: number;
  /** The admin's note with the decision. */
  reply?: string;
};

/** What the form holds before it is sent. */
export type UpgradeDraft = {
  adminId: string | null;
  urgency: UpgradeUrgency;
  note: string;
};

export type UpgradeRequestProps = {
  /** How the stages are drawn: nodes along one horizontal rail, or stacked steps with their times and what happened. @default "rail" */
  railStyle?: UpgradeRailStyle;
  /** Padding, type size, chip and row heights. @default "cozy" */
  density?: UpgradeDensity;
  /** The colour reached stages, the chosen admin and the unlocked card take: cobalt, signal or ink. @default "cobalt" */
  accent?: UpgradeAccent;
  /** The feature the member tried to use, and what approval unlocks. @default defaultUpgradeFeature */
  feature?: UpgradeFeature;
  /** Who can approve, in picker order. Empty reads as no one to ask. @default defaultUpgradeAdmins */
  admins?: UpgradeAdmin[];
  /** Controlled requests. The newest one for this feature fills the rail; the host advances it by changing its `stage` (see `advanceUpgradeRequest`). */
  requests?: UpgradeRequestRecord[];
  /** Initial requests when uncontrolled. @default defaultUpgradeRequests */
  defaultRequests?: UpgradeRequestRecord[];
  /** Fires with every request, newest first, after one is sent. */
  onRequestsChange?: (requests: UpgradeRequestRecord[]) => void;
  /** Send was pressed; the request is already on the rail. */
  onSend?: (request: UpgradeRequestRecord) => void;
  /** Controlled draft: the admin, urgency and note in the form. */
  value?: UpgradeDraft;
  /** Initial draft when uncontrolled. @default defaultUpgradeDraft */
  defaultValue?: UpgradeDraft;
  /** Fires from every change to the draft. */
  onChange?: (value: UpgradeDraft) => void;
  /** Retry later was pressed on a declined request; the form is back with its note. */
  onRetryLater?: (request: UpgradeRequestRecord) => void;
  /** Open was pressed on the unlocked feature. */
  onOpenFeature?: (feature: UpgradeFeature) => void;
  /** Contact support was pressed, when there is no admin to ask. */
  onContactSupport?: () => void;
  /** Whether the admins have arrived: skeleton chips while loading, a retry when they failed. @default "ready" */
  status?: UpgradeStatus;
  /** Try again was pressed after a failed load. */
  onRetry?: () => void;
  /** The moment ages count from and a sent request is stamped with, in ms; never read from the clock. @default defaultUpgradeNow */
  now?: number;
  /** The heading. @default "Request an upgrade" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the columns scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be chosen or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultUpgradeNow = Date.UTC(2026, 9, 12, 9, 30);

/** Shared exports on Fieldline, part of the Team plan. */
export const defaultUpgradeFeature: UpgradeFeature = {
  id: "shared-exports",
  name: "Shared exports",
  plan: "Team",
  summary: "Scheduled CSV and PDF exports that land in a shared folder.",
  unlocks: ["Scheduled exports", "Shared folders", "Export history"],
};

export const defaultUpgradeAdmins: UpgradeAdmin[] = [
  { id: "mara", name: "Mara Lind", role: "Workspace owner", hue: 250 },
  { id: "tomas", name: "Tomas Reyes", role: "Billing admin", hue: 160 },
  { id: "ines", name: "Ines Varga", role: "Billing admin", hue: 40 },
  { id: "kenji", name: "Kenji Aoki", role: "Admin", hue: 320 },
];

/** Two earlier asks: guest seats approved, the audit log declined. */
export const defaultUpgradeRequests: UpgradeRequestRecord[] = [
  {
    id: "ur-2203",
    featureId: "audit-log",
    featureName: "Audit log",
    adminId: "tomas",
    urgency: "normal",
    note: "Needed for the Coldbrook security review.",
    sentAt: defaultUpgradeNow - 9 * DAY,
    stage: "declined",
    seenAt: defaultUpgradeNow - 9 * DAY + 3 * HOUR,
    decidedAt: defaultUpgradeNow - 8 * DAY,
    reply: "Not this quarter; the review can use the activity export.",
  },
  {
    id: "ur-2187",
    featureId: "guest-seats",
    featureName: "Guest seats",
    adminId: "mara",
    urgency: "high",
    note: "Two Basinworks contractors start on Monday.",
    sentAt: defaultUpgradeNow - 23 * DAY,
    stage: "approved",
    seenAt: defaultUpgradeNow - 23 * DAY + 40 * MIN,
    decidedAt: defaultUpgradeNow - 23 * DAY + 2 * HOUR,
    reply: "Added two seats.",
  },
];

export const defaultUpgradeDraft: UpgradeDraft = {
  adminId: "mara",
  urgency: "normal",
  note: "",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const NOTE_LIMIT = 280;
/** A node ticks this long after the line before it starts to draw. */
const NODE_DELAY = 0.28;

const STAGE_INDEX: Record<UpgradeStage, number> = {
  sent: 0,
  seen: 1,
  approved: 2,
  declined: 2,
};

const URGENCY: Record<UpgradeUrgency, { label: string; hint: string }> = {
  low: { label: "Low", hint: "whenever" },
  normal: { label: "Normal", hint: "this week" },
  high: { label: "High", hint: "blocking" },
};

const URGENCIES: UpgradeUrgency[] = ["low", "normal", "high"];

const ACCENTS: Record<UpgradeAccent, { base: string; bright: string }> = {
  cobalt: { base: "var(--accent)", bright: "var(--accent-bright)" },
  signal: { base: "var(--signal)", bright: "var(--signal)" },
  ink: { base: "var(--ink-2)", bright: "var(--ink)" },
};

type Density = {
  pad: string;
  gap: string;
  chip: string;
  text: string;
  sub: string;
  avatar: number;
  node: number;
  row: string;
};

const DENSITY: Record<UpgradeDensity, Density> = {
  compact: {
    pad: "px-3 py-2.5",
    gap: "gap-2.5",
    chip: "h-6 pr-2 pl-0.5 text-[11px]",
    text: "text-[12px]",
    sub: "text-[10px]",
    avatar: 20,
    node: 18,
    row: "py-1",
  },
  cozy: {
    pad: "px-4 py-3",
    gap: "gap-3",
    chip: "h-7 pr-2.5 pl-1 text-xs",
    text: "text-[13px]",
    sub: "text-[11px]",
    avatar: 24,
    node: 22,
    row: "py-1.5",
  },
  roomy: {
    pad: "px-5 py-4",
    gap: "gap-4",
    chip: "h-8 pr-3 pl-1 text-[13px]",
    text: "text-sm",
    sub: "text-[12px]",
    avatar: 28,
    node: 26,
    row: "py-2",
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** "just now", "12 min ago", "3 h ago", "9 d ago", "3 wk ago". */
const ago = (at: number, now: number) => {
  const diff = Math.max(0, now - at);
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`;
  if (diff < 14 * DAY) return `${Math.round(diff / DAY)} d ago`;
  return `${Math.round(diff / (7 * DAY))} wk ago`;
};

/** "09:34", in UTC, so the server and the client print the same digits. */
const clock = (at: number) => {
  const d = new Date(at);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

const isPending = (stage: UpgradeStage) => stage === "sent" || stage === "seen";

/**
 * Moves one request to a later stage, stamping the time. Hosts call it from
 * their own data and pass the result back as `requests`.
 */
export const advanceUpgradeRequest = (
  requests: UpgradeRequestRecord[],
  id: string,
  stage: UpgradeStage,
  at: number,
  reply?: string,
): UpgradeRequestRecord[] =>
  requests.map((r) => {
    if (r.id !== id) return r;
    const next: UpgradeRequestRecord = { ...r, stage };
    if (stage === "seen") next.seenAt = at;
    if (stage === "approved" || stage === "declined") {
      next.decidedAt = at;
      if (next.seenAt === undefined) next.seenAt = at;
      if (reply !== undefined) next.reply = reply;
    }
    return next;
  });

const STAGE_WORD: Record<UpgradeStage, string> = {
  sent: "Sent",
  seen: "Seen",
  approved: "Approved",
  declined: "Declined",
};

const announcementFor = (
  request: UpgradeRequestRecord,
  adminName: string,
  featureName: string,
) => {
  switch (request.stage) {
    case "sent":
      return `Request sent to ${adminName}. Waiting to be seen.`;
    case "seen":
      return `${adminName} has seen your request.`;
    case "approved":
      return `Approved. ${featureName} is unlocked.`;
    case "declined":
      return `Declined${request.reply ? `: ${request.reply}` : "."} You can retry later.`;
  }
};

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Avatar({
  name,
  hue,
  size,
  className,
}: {
  name: string;
  hue: number;
  size: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `oklch(from var(--ur-accent-bright) 0.84 0.07 ${hue})`,
        color: `oklch(from var(--ur-accent-bright) 0.34 0.1 ${hue})`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

function StageBadge({
  stage,
  className,
}: {
  stage: UpgradeStage;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors duration-200",
        stage === "approved"
          ? "border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-success"
          : stage === "declined"
            ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_11%,transparent)] text-danger"
            : stage === "seen"
              ? "border-[color-mix(in_oklab,var(--ur-accent-bright)_40%,transparent)] bg-(--ur-wash) text-(--ur-accent-bright)"
              : "border-hairline-strong bg-surface-2 text-ink-2",
        className,
      )}
    >
      {STAGE_WORD[stage]}
    </span>
  );
}

type NodeKind = "todo" | "current" | "done" | "declined";

function StageNode({
  kind,
  size,
  stamp,
  delay,
  animateIn,
  motionSafe,
}: {
  kind: NodeKind;
  size: number;
  /** The Sent node lands like a stamp, on recoil, rather than ticking. */
  stamp: boolean;
  delay: number;
  animateIn: boolean;
  motionSafe: boolean;
}) {
  const filled = kind === "done" || kind === "declined";
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const draw = (extra: number) => ({
    initial: animateIn && motionSafe ? { pathLength: 0 } : false,
    animate: { pathLength: 1 },
    transition: motionSafe
      ? { ...springs.flick, delay: delay + durations.fast + extra }
      : { duration: 0 },
  });
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full border-2 transition-colors duration-200",
          kind === "todo"
            ? "border-hairline-strong"
            : kind === "current"
              ? "border-(--ur-accent-bright)"
              : "border-transparent",
        )}
      />
      <AnimatePresence>
        {filled ? (
          <motion.span
            key={kind}
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-full",
              kind === "declined" ? "bg-danger" : "bg-(--ur-accent)",
            )}
            initial={
              animateIn
                ? motionSafe
                  ? { scale: stamp ? 1.7 : 0.5, opacity: stamp ? 0 : 1 }
                  : { opacity: 0 }
                : false
            }
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? stamp
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { ...springs.snap, delay }
                : { duration: durations.fast }
            }
          />
        ) : kind === "current" ? (
          <motion.span
            key="dot"
            aria-hidden
            className="absolute rounded-full bg-(--ur-accent-bright)"
            style={{ width: size * 0.32, height: size * 0.32 }}
            initial={
              animateIn ? (motionSafe ? { scale: 0 } : { opacity: 0 }) : false
            }
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, delay }
                : { duration: durations.fast }
            }
          />
        ) : null}
      </AnimatePresence>
      {filled ? (
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="relative text-(--bg-0)"
          style={{ width: size * 0.62, height: size * 0.62 }}
        >
          {kind === "declined" ? (
            <>
              <motion.path d="M4.6 4.6 11.4 11.4" {...stroke} {...draw(0)} />
              <motion.path
                d="M11.4 4.6 4.6 11.4"
                {...stroke}
                {...draw(durations.blink)}
              />
            </>
          ) : (
            <motion.path
              d="M3.5 8.4 6.8 11.4 12.5 5"
              {...stroke}
              {...draw(0)}
            />
          )}
        </svg>
      ) : null}
    </span>
  );
}

function RailLine({
  reached,
  declined,
  axis,
  animateIn,
  motionSafe,
  style,
}: {
  reached: boolean;
  declined: boolean;
  axis: "x" | "y";
  animateIn: boolean;
  motionSafe: boolean;
  style: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute overflow-hidden rounded-full bg-hairline-strong",
        axis === "x" ? "h-0.5" : "w-0.5",
      )}
      style={style}
    >
      <motion.span
        className={cn(
          "absolute inset-0 rounded-full",
          declined ? "bg-danger" : "bg-(--ur-accent)",
        )}
        style={axis === "x" ? { originX: 0 } : { originY: 0 }}
        initial={
          animateIn ? (axis === "x" ? { scaleX: 0 } : { scaleY: 0 }) : false
        }
        animate={
          axis === "x"
            ? { scaleX: reached ? 1 : 0 }
            : { scaleY: reached ? 1 : 0 }
        }
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Rail                                   */
/* ----------------------------------------------------------------------- */

type Stage = {
  key: "sent" | "seen" | "decision";
  label: string;
  time: number | undefined;
  detail: string;
  kind: NodeKind;
};

function Rail({
  request,
  adminName,
  railStyle,
  d,
  animateIn,
  motionSafe,
}: {
  request: UpgradeRequestRecord;
  adminName: string;
  railStyle: UpgradeRailStyle;
  d: Density;
  animateIn: boolean;
  motionSafe: boolean;
}) {
  const first = firstName(adminName);
  const index = STAGE_INDEX[request.stage];
  const declined = request.stage === "declined";
  const decided = !isPending(request.stage);
  const kindAt = (i: number): NodeKind =>
    i <= index
      ? i === 2 && declined
        ? "declined"
        : "done"
      : i === index + 1
        ? "current"
        : "todo";
  const stages: Stage[] = [
    {
      key: "sent",
      label: "Sent",
      time: request.sentAt,
      detail: `Delivered to ${adminName}`,
      kind: kindAt(0),
    },
    {
      key: "seen",
      label: "Seen",
      time: request.seenAt,
      detail: index >= 1 ? `${first} opened it` : `Waiting for ${first}`,
      kind: kindAt(1),
    },
    {
      key: "decision",
      label: decided ? STAGE_WORD[request.stage] : "Decision",
      time: request.decidedAt,
      detail:
        request.stage === "approved"
          ? `${first} approved it`
          : declined
            ? `${first} declined it`
            : `Up to ${first}`,
      kind: kindAt(2),
    },
  ];
  const size = d.node;
  const lineInset = size / 2 + 6;

  if (railStyle === "steps") {
    return (
      <ol role="list" aria-label="Request progress" className="flex flex-col">
        {stages.map((stage, i) => (
          <li
            key={stage.key}
            aria-current={stage.kind === "current" ? "step" : undefined}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            <span
              className="relative flex shrink-0 flex-col items-center"
              style={{ width: size }}
            >
              <StageNode
                kind={stage.kind}
                size={size}
                stamp={i === 0}
                delay={i === 0 ? 0 : NODE_DELAY}
                animateIn={animateIn}
                motionSafe={motionSafe}
              />
              {i < stages.length - 1 ? (
                <RailLine
                  axis="y"
                  reached={index >= i + 1}
                  declined={declined && i === 1}
                  animateIn={animateIn}
                  motionSafe={motionSafe}
                  style={{ left: size / 2 - 1, top: size + 4, bottom: 4 }}
                />
              ) : null}
            </span>
            <div
              className="min-w-0 flex-1"
              style={{ paddingTop: size / 2 - 9 }}
            >
              <p className={cn("flex items-baseline gap-2", d.text)}>
                <span
                  className={cn(
                    "font-medium transition-colors duration-200",
                    stage.kind === "todo" ? "text-ink-3" : "text-foreground",
                  )}
                >
                  {stage.label}
                </span>
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {stage.time !== undefined ? clock(stage.time) : "--:--"}
                </span>
              </p>
              <p className={cn("text-ink-3", d.sub)}>{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol
      role="list"
      aria-label="Request progress"
      className="flex items-start pt-1"
    >
      {stages.map((stage, i) => (
        <li
          key={stage.key}
          aria-current={stage.kind === "current" ? "step" : undefined}
          className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
        >
          {i > 0 ? (
            <RailLine
              axis="x"
              reached={index >= i}
              declined={declined && i === 2}
              animateIn={animateIn}
              motionSafe={motionSafe}
              style={{
                top: size / 2 - 1,
                left: `calc(-50% + ${lineInset}px)`,
                right: `calc(50% + ${lineInset}px)`,
              }}
            />
          ) : null}
          <StageNode
            kind={stage.kind}
            size={size}
            stamp={i === 0}
            delay={i === 0 ? 0 : NODE_DELAY}
            animateIn={animateIn}
            motionSafe={motionSafe}
          />
          <span
            className={cn(
              "max-w-full truncate font-medium transition-colors duration-200",
              d.sub,
              stage.kind === "todo" ? "text-ink-3" : "text-foreground",
            )}
          >
            {stage.label}
          </span>
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            {stage.time !== undefined ? clock(stage.time) : "--:--"}
          </span>
          <span className="sr-only">{stage.detail}</span>
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Feature card                               */
/* ----------------------------------------------------------------------- */

function FeatureCard({
  feature,
  unlocked,
  d,
  animateIn,
  motionSafe,
}: {
  feature: UpgradeFeature;
  unlocked: boolean;
  d: Density;
  animateIn: boolean;
  motionSafe: boolean;
}) {
  const step = cascade(feature.unlocks.length);
  return (
    <div
      className={cn(
        "relative flex items-start gap-3 rounded-3 border p-3 transition-colors duration-300",
        unlocked
          ? "border-[color-mix(in_oklab,var(--ur-accent-bright)_40%,transparent)] bg-(--ur-wash)"
          : "border-hairline bg-surface-1",
      )}
    >
      <span className="size-9 shrink-0 [perspective:320px]">
        <motion.span
          className="relative block size-9 [transform-style:preserve-3d]"
          initial={false}
          animate={{ rotateY: unlocked && motionSafe ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-2 bg-surface-2 text-ink-2 transition-opacity duration-200 [backface-visibility:hidden]",
              !motionSafe && unlocked && "opacity-0",
            )}
          >
            <Lock className="size-4" />
          </span>
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center justify-center rounded-2 bg-(--ur-accent) text-(--bg-0) transition-opacity duration-200 [backface-visibility:hidden]",
              !motionSafe && !unlocked && "opacity-0",
            )}
            style={{ transform: motionSafe ? "rotateY(180deg)" : undefined }}
          >
            <LockOpen className="size-4" />
          </span>
        </motion.span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("font-semibold", d.text)}>{feature.name}</p>
          <AnimatePresence initial={false} mode="wait">
            {unlocked ? (
              <motion.span
                key="unlocked"
                className="inline-flex h-5 items-center gap-1 rounded-full bg-(--ur-accent) px-1.5 font-mono text-[10px] tracking-[0.06em] text-(--bg-0) uppercase"
                initial={
                  animateIn
                    ? motionSafe
                      ? { scale: 0.6, opacity: 0 }
                      : { opacity: 0 }
                    : false
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        delay: durations.fast,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <Check aria-hidden className="size-3" />
                Unlocked
              </motion.span>
            ) : (
              <motion.span
                key="locked"
                className="inline-flex h-5 items-center rounded-full border border-hairline-strong px-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
                initial={animateIn ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
              >
                {feature.plan} plan
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <p className={cn("mt-0.5 text-ink-2", d.sub)}>{feature.summary}</p>
        {feature.unlocks.length > 0 ? (
          <ul
            aria-label={unlocked ? "Now available" : "Unlocks"}
            className="mt-2 flex flex-wrap gap-1"
          >
            {feature.unlocks.map((item, i) => (
              <li
                key={item}
                className={cn(
                  "inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] transition-colors duration-300",
                  unlocked
                    ? "border-[color-mix(in_oklab,var(--ur-accent-bright)_30%,transparent)] bg-card text-foreground"
                    : "border-hairline bg-card text-ink-2",
                )}
              >
                <span className="flex size-3 items-center justify-center">
                  {unlocked ? (
                    <svg aria-hidden viewBox="0 0 14 14" className="size-3">
                      <motion.path
                        d="M3 7.4 5.8 10 11 4.2"
                        fill="none"
                        stroke="var(--ur-accent-bright)"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={
                          animateIn && motionSafe ? { pathLength: 0 } : false
                        }
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.flick,
                                delay: durations.base + i * step,
                              }
                            : { duration: 0 }
                        }
                      />
                    </svg>
                  ) : (
                    <Lock aria-hidden className="size-2.5 text-ink-3" />
                  )}
                </span>
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Mode = "form" | "rail" | "unlocked" | "empty";

/**
 * A request-an-upgrade flow for a member without billing rights. The feature
 * they tried to use heads the surface with what it unlocks; below it a short
 * form — which admin, how urgent, a note — and beside it the earlier asks.
 *
 * Sending stamps the request onto a status rail: the Sent node lands on
 * `springs.recoil` while the form fades out. Each later stage the host
 * advances (`requests` with a new `stage`, see `advanceUpgradeRequest`) draws
 * the line to the next node on `springs.glide`, then the node fills on
 * `springs.snap` and its check draws on `springs.flick`. Approval turns the
 * feature card's lock over on `springs.snap` and pops an Unlocked badge on
 * `springs.recoil` while each unlock ticks in a cascade; a decline paints
 * the last node red, shows the admin's note and offers Retry later, which
 * brings the form back with the old note and files the request with the
 * rest, which glide down to make room.
 *
 * The admin picker is a horizontal listbox with one tab stop (arrows move
 * and choose, Home/End), the urgency chips a radio group, the note a native
 * textarea where Ctrl or Cmd with Enter sends, and the rail a list whose
 * pending step is `aria-current`. Every stage change is announced in words.
 * Under reduced motion nothing lands, draws or turns: fills, lines and the
 * lock cross-fade in place and every state is still reached.
 */
export function UpgradeRequest({
  railStyle = "rail",
  density = "cozy",
  accent = "cobalt",
  feature = defaultUpgradeFeature,
  admins = defaultUpgradeAdmins,
  requests: requestsProp,
  defaultRequests = defaultUpgradeRequests,
  onRequestsChange,
  onSend,
  value,
  defaultValue = defaultUpgradeDraft,
  onChange,
  onRetryLater,
  onOpenFeature,
  onContactSupport,
  status = "ready",
  onRetry,
  now = defaultUpgradeNow,
  title = "Request an upgrade",
  label,
  height = 540,
  disabled = false,
  className,
}: UpgradeRequestProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const pickerId = `${uid}-picker`;
  const urgencyId = `${uid}-urgency`;
  const noteId = `${uid}-note`;
  const railTitleId = `${uid}-rail`;
  const pastId = `${uid}-past`;

  const [ownRequests, setOwnRequests] =
    React.useState<UpgradeRequestRecord[]>(defaultRequests);
  const requests = requestsProp ?? ownRequests;
  const [ownDraft, setOwnDraft] = React.useState<UpgradeDraft>(defaultValue);
  const draft = value ?? ownDraft;
  const [dismissed, setDismissed] = React.useState<string | null>(null);
  const [activeAdmin, setActiveAdmin] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState<{
    target: "rail" | "picker";
    seq: number;
  } | null>(null);
  // False for the server render and hydration, so nothing already on the
  // page lands or draws; true for anything that mounts after a change.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const railRef = React.useRef<HTMLDivElement | null>(null);
  const pickerRef = React.useRef<HTMLDivElement | null>(null);

  const ready = status === "ready";
  const inert = disabled || !ready;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const acc = ACCENTS[accent] ?? ACCENTS.cobalt;

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(admins.map((a) => [a.id, a]));
  const hueOf = (admin: UpgradeAdmin) =>
    admin.hue ?? (admins.indexOf(admin) * 67 + 250) % 360;
  const sorted = [...requests].sort((a, b) => b.sentAt - a.sentAt);
  const latest = sorted.find((r) => r.featureId === feature.id);
  const current = latest && latest.id !== dismissed ? latest : null;
  const past = sorted.filter((r) => r.id !== current?.id);
  const unlocked = requests.some(
    (r) => r.featureId === feature.id && r.stage === "approved",
  );
  const mode: Mode = current
    ? "rail"
    : unlocked
      ? "unlocked"
      : admins.length === 0
        ? "empty"
        : "form";
  const chosen = draft.adminId ? (byId.get(draft.adminId) ?? null) : null;
  const currentAdmin = current ? byId.get(current.adminId) : undefined;
  const currentAdminName = currentAdmin?.name ?? "the admin";

  // A stage the host advanced is announced here; the key changes with the
  // request's id or stage, and a new id is a send, announced where it happens.
  const stageKey = current ? `${current.id}:${current.stage}` : "";
  const [seenStageKey, setSeenStageKey] = React.useState(stageKey);
  if (stageKey !== seenStageKey) {
    setSeenStageKey(stageKey);
    if (
      current &&
      seenStageKey.slice(0, seenStageKey.indexOf(":")) === current.id
    ) {
      setAnnouncement(announcementFor(current, currentAdminName, feature.name));
    }
  }

  /* ------------------------------- changes ----------------------------- */

  const setDraft = (patch: Partial<UpgradeDraft>) => {
    const next = { ...draft, ...patch };
    if (value === undefined) setOwnDraft(next);
    onChange?.(next);
  };

  const send = () => {
    if (inert || !chosen) return;
    const request: UpgradeRequestRecord = {
      id: `ur-${now}-${requests.length + 1}`,
      featureId: feature.id,
      featureName: feature.name,
      adminId: chosen.id,
      urgency: draft.urgency,
      note: draft.note.trim(),
      sentAt: now,
      stage: "sent",
    };
    const next = [request, ...requests];
    if (requestsProp === undefined) setOwnRequests(next);
    onRequestsChange?.(next);
    onSend?.(request);
    setDismissed(null);
    setDraft({ note: "" });
    setAnnouncement(announcementFor(request, chosen.name, feature.name));
    setFocusReq((f) => ({ target: "rail", seq: (f?.seq ?? 0) + 1 }));
  };

  const retryLater = () => {
    if (inert || !current) return;
    setDismissed(current.id);
    setDraft({
      adminId: byId.has(current.adminId) ? current.adminId : draft.adminId,
      urgency: current.urgency,
      note: current.note,
    });
    onRetryLater?.(current);
    setAnnouncement("The form is back with your note. Edit it and send again.");
    setFocusReq((f) => ({ target: "picker", seq: (f?.seq ?? 0) + 1 }));
  };

  const pickAdmin = (id: string) => {
    if (inert) return;
    setActiveAdmin(id);
    if (id !== draft.adminId) {
      setDraft({ adminId: id });
      const admin = byId.get(id);
      if (admin) setAnnouncement(`Asking ${admin.name}.`);
    }
  };

  const pickUrgency = (urgency: UpgradeUrgency) => {
    if (inert || urgency === draft.urgency) return;
    setDraft({ urgency });
    setAnnouncement(`${URGENCY[urgency].label} urgency.`);
  };

  // Focus lands after the DOM has changed: on the rail once a request is
  // sent, on the chosen admin once the form is back.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    if (focusReq.target === "rail") {
      railRef.current?.focus({ preventScroll: true });
      return;
    }
    const picker = pickerRef.current;
    if (!picker) return;
    const node =
      picker.querySelector<HTMLElement>(
        '[role="option"][aria-selected="true"]',
      ) ?? picker.querySelector<HTMLElement>('[role="option"]');
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------ keyboard ----------------------------- */

  /** The sibling a key asks for, found from the pressed button's own row. */
  const siblingOf = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    role: "option" | "radio",
    wrap: boolean,
  ): { index: number; node: HTMLElement } | null => {
    const row = event.currentTarget.parentElement;
    if (!row) return null;
    const nodes = Array.from(
      row.querySelectorAll<HTMLElement>(`[role="${role}"]`),
    );
    const i = nodes.indexOf(event.currentTarget);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = nodes.length - 1;
    else return null;
    const index = wrap
      ? (to + nodes.length) % nodes.length
      : clamp(to, 0, nodes.length - 1);
    const node = nodes[index];
    return node ? { index, node } : null;
  };

  const onPickerKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      pickAdmin(id);
      return;
    }
    const next = siblingOf(event, "option", false);
    if (!next) return;
    event.preventDefault();
    next.node.focus();
    const target = admins[next.index];
    if (target) pickAdmin(target.id);
  };

  const onRadioKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    urgency: UpgradeUrgency,
  ) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      pickUrgency(urgency);
      return;
    }
    const next = siblingOf(event, "radio", true);
    if (!next) return;
    event.preventDefault();
    next.node.focus();
    const target = URGENCIES[next.index];
    if (target) pickUrgency(target);
  };

  /* ------------------------------- render ------------------------------ */

  const activeOption =
    activeAdmin && byId.has(activeAdmin)
      ? activeAdmin
      : (chosen?.id ?? admins[0]?.id ?? null);
  const noteLeft = NOTE_LIMIT - draft.note.length;
  const canSend = !inert && chosen !== null;

  const paneMotion = {
    initial: live
      ? { opacity: 0, y: motionSafe ? distances.step : 0 }
      : (false as const),
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: {
      y: motionSafe ? springs.glide : { duration: 0 },
      opacity: { duration: durations.base, ease: easings.enter },
    },
  };

  const primaryButton = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 bg-(--ur-accent) px-3 text-xs font-medium text-(--bg-0) transition-[opacity,filter] hover:brightness-110 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:brightness-100",
    FOCUS_RING,
  );
  const quietButton = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-45",
    FOCUS_RING,
  );

  const renderForm = () => (
    <motion.form
      key="form"
      {...paneMotion}
      aria-label="New request"
      className={cn("flex flex-col", d.pad, d.gap)}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <p
          id={pickerId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Ask
        </p>
        <div
          ref={pickerRef}
          role="listbox"
          aria-labelledby={pickerId}
          aria-orientation="horizontal"
          aria-disabled={inert || undefined}
          className="-m-[3px] flex flex-wrap gap-1.5 p-[3px]"
        >
          {admins.map((admin) => {
            const selected = chosen?.id === admin.id;
            return (
              <button
                key={admin.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={
                  admin.role ? `${admin.name}, ${admin.role}` : admin.name
                }
                tabIndex={activeOption === admin.id ? 0 : -1}
                onFocus={() => setActiveAdmin(admin.id)}
                onClick={() => pickAdmin(admin.id)}
                onKeyDown={(event) => onPickerKey(event, admin.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-colors duration-200",
                  d.chip,
                  selected
                    ? "border-[color-mix(in_oklab,var(--ur-accent-bright)_45%,transparent)] bg-(--ur-wash) text-foreground"
                    : "border-hairline-strong bg-card text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  inert ? "cursor-not-allowed" : "cursor-pointer",
                  FOCUS_RING,
                )}
              >
                <Avatar name={admin.name} hue={hueOf(admin)} size={d.avatar} />
                <span className="@min-[34rem]:hidden">
                  {firstName(admin.name)}
                </span>
                <span className="hidden @min-[34rem]:inline">{admin.name}</span>
                {selected ? (
                  <svg aria-hidden viewBox="0 0 14 14" className="size-3">
                    <motion.path
                      d="M3 7.4 5.8 10 11 4.2"
                      fill="none"
                      stroke="var(--ur-accent-bright)"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={live && motionSafe ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className={cn("text-ink-3", d.sub)}>
          {chosen
            ? `${firstName(chosen.name)}${chosen.role ? `, ${chosen.role.toLowerCase()},` : ""} gets a note in Fieldline and an email.`
            : "Choose who to ask."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p
          id={urgencyId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Urgency
        </p>
        <div
          role="radiogroup"
          aria-labelledby={urgencyId}
          aria-disabled={inert || undefined}
          className="-m-[3px] flex flex-wrap gap-1.5 p-[3px]"
        >
          {URGENCIES.map((urgency) => {
            const checked = draft.urgency === urgency;
            return (
              <button
                key={urgency}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={`${URGENCY[urgency].label}, ${URGENCY[urgency].hint}`}
                tabIndex={checked ? 0 : -1}
                onClick={() => pickUrgency(urgency)}
                onKeyDown={(event) => onRadioKey(event, urgency)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border pl-2.5 font-medium whitespace-nowrap transition-colors duration-200",
                  d.chip,
                  checked
                    ? "border-[color-mix(in_oklab,var(--ur-accent-bright)_45%,transparent)] bg-(--ur-wash) text-foreground"
                    : "border-hairline-strong bg-card text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  inert ? "cursor-not-allowed" : "cursor-pointer",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    urgency === "high"
                      ? "bg-warn"
                      : urgency === "normal"
                        ? "bg-(--ur-accent-bright)"
                        : "bg-ink-3",
                  )}
                />
                {URGENCY[urgency].label}
                <span className="hidden text-ink-3 @min-[30rem]:inline">
                  {URGENCY[urgency].hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={noteId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Note to {chosen ? firstName(chosen.name) : "the admin"}
        </label>
        <textarea
          id={noteId}
          value={draft.note}
          maxLength={NOTE_LIMIT}
          rows={3}
          disabled={inert}
          placeholder={`Why you need ${feature.name.toLowerCase()} (optional)`}
          onChange={(event) => setDraft({ note: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          className={cn(
            "w-full resize-none rounded-2 border border-hairline bg-surface-0 px-2.5 py-2 text-foreground placeholder:text-ink-3 disabled:cursor-not-allowed",
            d.text,
            FOCUS_RING,
          )}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            {noteLeft} left
          </span>
          <span className="hidden font-mono text-[10px] text-ink-3 @min-[30rem]:inline">
            Ctrl+Enter sends
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="submit"
          aria-disabled={!canSend || undefined}
          onClick={(event) => {
            if (!canSend) event.preventDefault();
          }}
          className={primaryButton}
        >
          <Send aria-hidden className="size-3.5" />
          Send request
        </button>
        <span className={cn("truncate text-ink-3", d.sub)}>
          {feature.plan} plan
        </span>
      </div>
    </motion.form>
  );

  const renderRail = (request: UpgradeRequestRecord) => {
    const admin = byId.get(request.adminId);
    const name = admin?.name ?? "the admin";
    const first = firstName(name);
    return (
      <motion.div
        key={`rail-${request.id}`}
        {...paneMotion}
        ref={railRef}
        tabIndex={-1}
        role="group"
        aria-labelledby={railTitleId}
        className={cn("flex flex-col rounded-2", d.pad, d.gap, FOCUS_RING)}
      >
        <div className="flex items-center gap-2.5">
          {admin ? (
            <Avatar name={admin.name} hue={hueOf(admin)} size={d.avatar + 8} />
          ) : null}
          <div className="min-w-0 flex-1">
            <p id={railTitleId} className={cn("truncate font-medium", d.text)}>
              Request to {name}
            </p>
            <p className={cn("truncate text-ink-3", d.sub)}>
              {URGENCY[request.urgency].label} urgency · sent{" "}
              {ago(request.sentAt, now)}
            </p>
          </div>
          <StageBadge stage={request.stage} />
        </div>

        <Rail
          request={request}
          adminName={name}
          railStyle={railStyle}
          d={d}
          animateIn={live}
          motionSafe={motionSafe}
        />

        {request.note ? (
          <blockquote
            className={cn(
              "border-l-2 border-hairline-strong pl-2.5 text-ink-2",
              d.sub,
            )}
          >
            {request.note}
          </blockquote>
        ) : null}

        <AnimatePresence initial={false} mode="wait">
          {request.stage === "approved" ? (
            <motion.div
              key="approved"
              {...paneMotion}
              className="flex flex-col gap-2"
            >
              {request.reply ? (
                <p className={cn("text-ink-2", d.sub)}>
                  <span className="font-medium text-foreground">{first}:</span>{" "}
                  {request.reply}
                </p>
              ) : null}
              <div>
                <button
                  type="button"
                  aria-disabled={disabled || undefined}
                  onClick={() => {
                    if (!disabled) onOpenFeature?.(feature);
                  }}
                  className={primaryButton}
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                  Open {feature.name.toLowerCase()}
                </button>
              </div>
            </motion.div>
          ) : request.stage === "declined" ? (
            <motion.div
              key="declined"
              {...paneMotion}
              className="flex flex-col gap-2.5 rounded-2 border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-2.5"
            >
              <p className={cn("text-ink-2", d.sub)}>
                <span className="font-medium text-foreground">
                  {first} declined.
                </span>{" "}
                {request.reply ?? "No note was left."}
              </p>
              <div>
                <button
                  type="button"
                  aria-disabled={inert || undefined}
                  onClick={retryLater}
                  className={quietButton}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Retry later
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.p
              key="waiting"
              {...paneMotion}
              className={cn("flex items-center gap-1.5 text-ink-3", d.sub)}
            >
              <Clock aria-hidden className="size-3.5 shrink-0" />
              {request.stage === "seen"
                ? `${first} has seen it. The decision shows here.`
                : `Waiting for ${first} to open it.`}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const renderUnlocked = () => (
    <motion.div
      key="unlocked"
      {...paneMotion}
      className={cn("flex flex-col items-start", d.pad, d.gap)}
    >
      <p className={cn("text-ink-2", d.text)}>
        You already have {feature.name.toLowerCase()} on the {feature.plan}{" "}
        plan.
      </p>
      <button
        type="button"
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onOpenFeature?.(feature);
        }}
        className={primaryButton}
      >
        <ExternalLink aria-hidden className="size-3.5" />
        Open {feature.name.toLowerCase()}
      </button>
    </motion.div>
  );

  const renderEmpty = () => (
    <motion.div
      key="empty"
      {...paneMotion}
      className="flex flex-col items-center gap-3 px-6 py-8 text-center"
    >
      <LifeBuoy aria-hidden className="size-5 text-ink-3" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">No admin to ask</p>
        <p className="text-[12px] text-ink-2">
          This workspace has no billing admin, so support turns{" "}
          {feature.name.toLowerCase()} on.
        </p>
      </div>
      <button
        type="button"
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onContactSupport?.();
        }}
        className={quietButton}
      >
        Contact support
      </button>
    </motion.div>
  );

  const renderSkeleton = () => (
    <div aria-hidden className={cn("flex flex-col", d.pad, d.gap)}>
      <div className="flex flex-col gap-1.5">
        <span className="h-2.5 w-10 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{
                width: 84 + ((i * 19) % 30),
                animationDelay: `${i * 70}ms`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="h-2.5 w-14 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
        <div className="flex gap-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <span
              key={i}
              className="h-7 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${(i + 4) * 70}ms` }}
            />
          ))}
        </div>
      </div>
      <span className="h-[76px] w-full rounded-2 bg-surface-2 motion-safe:animate-pulse" />
      <span className="h-8 w-28 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <TriangleAlert aria-hidden className="size-5 text-danger" />
      <p className="text-sm text-foreground">The admins didn&apos;t load.</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className={quietButton}>
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      ) : null}
    </div>
  );

  const pastStep = cascade(Math.min(past.length, 8));

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--ur-accent" as string]: acc.base,
        ["--ur-accent-bright" as string]: acc.bright,
        ["--ur-wash" as string]: `color-mix(in oklab, ${acc.bright} 12%, transparent)`,
      }}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 pb-0",
          d.pad,
        )}
      >
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {unlocked ? "Unlocked" : `${feature.plan} plan`}
        </p>
      </header>

      <div className={cn("shrink-0", d.pad)}>
        <FeatureCard
          feature={feature}
          unlocked={unlocked}
          d={d}
          animateIn={live}
          motionSafe={motionSafe}
        />
      </div>

      <div className="flex min-h-0 flex-1 [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain border-t border-hairline @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:grid-rows-[minmax(0,1fr)] @min-[40rem]:overflow-hidden">
        <section
          aria-label={mode === "rail" ? "Your request" : "Ask for the upgrade"}
          className="relative flex flex-col @min-[40rem]:[scrollbar-width:thin] @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain"
        >
          {status === "loading" ? (
            renderSkeleton()
          ) : status === "error" ? (
            renderError()
          ) : (
            <AnimatePresence initial={false} mode="wait">
              {mode === "rail" && current
                ? renderRail(current)
                : mode === "unlocked"
                  ? renderUnlocked()
                  : mode === "empty"
                    ? renderEmpty()
                    : renderForm()}
            </AnimatePresence>
          )}
        </section>

        <aside
          aria-labelledby={pastId}
          className="flex flex-col border-t border-hairline @min-[40rem]:[scrollbar-width:thin] @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain @min-[40rem]:border-t-0 @min-[40rem]:border-l"
        >
          <p
            id={pastId}
            className={cn(
              "flex items-baseline justify-between gap-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
              d.pad,
            )}
          >
            Past requests
            {ready ? <span className="tabular-nums">{past.length}</span> : null}
          </p>
          {status === "loading" ? (
            <div aria-hidden className={cn("flex flex-col gap-2 pt-0", d.pad)}>
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className="h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 110}ms` }}
                />
              ))}
            </div>
          ) : past.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-6 text-center">
              <Inbox aria-hidden className="size-5 text-ink-3" />
              <p className={cn("text-ink-2", d.sub)}>
                Nothing asked for before.
              </p>
            </div>
          ) : (
            <ul
              role="list"
              aria-label="Past requests"
              className={cn("flex flex-col pt-0", d.pad)}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {past.map((request, i) => {
                  const admin = byId.get(request.adminId);
                  return (
                    <motion.li
                      key={request.id}
                      layout={motionSafe ? "position" : false}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? -distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={{
                        layout: springs.glide,
                        y: motionSafe
                          ? {
                              ...springs.glide,
                              delay: Math.min(i, 8) * pastStep,
                            }
                          : { duration: 0 },
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }}
                      className={cn(
                        "flex items-start gap-2 border-b border-hairline last:border-b-0",
                        d.row,
                      )}
                    >
                      {admin ? (
                        <Avatar
                          name={admin.name}
                          hue={hueOf(admin)}
                          size={d.avatar}
                          className="mt-0.5"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="mt-0.5 shrink-0 rounded-full bg-surface-2"
                          style={{ width: d.avatar, height: d.avatar }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate font-medium", d.sub)}>
                          {request.featureName}
                        </p>
                        <p className="truncate text-[10px] text-ink-3">
                          {admin ? firstName(admin.name) : "Admin"} ·{" "}
                          {ago(request.decidedAt ?? request.sentAt, now)}
                        </p>
                        {request.reply ? (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-2">
                            {request.reply}
                          </p>
                        ) : null}
                      </div>
                      <StageBadge stage={request.stage} className="mt-0.5" />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </aside>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
