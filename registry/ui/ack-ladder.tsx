"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  Check,
  CircleCheck,
  FileText,
  RotateCcw,
  TriangleAlert,
  X,
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

export type AckSection = {
  id: string;
  /** The section's heading, e.g. "Device enrolment". */
  heading: string;
  /** Its paragraphs, in order. */
  body: string[];
};

export type AckPolicy = {
  id: string;
  title: string;
  /** Printed after a "v", e.g. "3.1". */
  version: string;
  /** When this version takes effect, in ms. */
  effectiveAt: number;
  /** Who owns the policy, e.g. "People Operations". */
  owner?: string;
  sections: AckSection[];
};

/** One earlier version the reader has already acknowledged. */
export type AckHistoryEntry = {
  id: string;
  version: string;
  /** When it was acknowledged, in ms. */
  acknowledgedAt: number;
  initials: string;
};

/** The person acknowledging; the typed initials must match theirs. */
export type AckSigner = { name: string; initials: string };

/** The ids of the sections read so far, in the order they were read. */
export type AckValue = string[];

/** The record of an acknowledgement, as stamped on the document. */
export type AckAcknowledgement = {
  policyId: string;
  version: string;
  initials: string;
  /** When it was stamped, in ms. */
  at: number;
};

export type AckSide = "right" | "left";
export type AckRungStyle = "fill" | "tick" | "bar";
export type AckDensity = "compact" | "cozy" | "roomy";
export type AckStatus = "ready" | "loading" | "error";

export type AckLadderProps = {
  /** Which side of the document the ladder stands on. @default "right" */
  ladderSide?: AckSide;
  /** What a rung does when its section is read: a dot fills, a check draws in a ring, or a bar fills from the foot. @default "fill" */
  rungStyle?: AckRungStyle;
  /** Type size, paragraph spacing and rung row height. @default "cozy" */
  density?: AckDensity;
  /** The policy to read; null reads as no policy assigned. @default defaultAckPolicy */
  policy?: AckPolicy | null;
  /** Controlled list of read section ids. */
  value?: AckValue;
  /** Initial read sections when uncontrolled. @default defaultAckValue */
  defaultValue?: AckValue;
  /** Fires when scrolling marks sections read, with the whole list and the ids just added. */
  onChange?: (value: AckValue, read: string[]) => void;
  /** Controlled acknowledgement; null means not yet. Leave undefined and the ladder keeps its own. */
  acknowledgement?: AckAcknowledgement | null;
  /** Fires once the initials matched and the stamp landed. */
  onAcknowledge?: (acknowledgement: AckAcknowledgement) => void;
  /** Earlier versions already acknowledged, newest first. @default defaultAckHistory */
  history?: AckHistoryEntry[];
  /** Who is acknowledging; the initials they must type. @default defaultAckSigner */
  signer?: AckSigner;
  /** The moment the stamp is dated, in ms. @default the clock at the press */
  now?: number;
  /** Whether the policy and history have arrived. @default "ready" */
  status?: AckStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Policy acknowledgement" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the document scrolls inside it. @default 540 */
  height?: number;
  /** Read only: the document scrolls but nothing is marked or acknowledged. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultAckNow = Date.UTC(2026, 9, 12, 9, 30);

export const defaultAckSigner: AckSigner = {
  name: "Rhea Vance",
  initials: "RV",
};

/** Gaugeworks People's device policy, version 3.1, in six sections. */
export const defaultAckPolicy: AckPolicy = {
  id: "pol-devices",
  title: "Acceptable use of company devices",
  version: "3.1",
  effectiveAt: Date.UTC(2026, 10, 1),
  owner: "People Operations",
  sections: [
    {
      id: "purpose",
      heading: "Purpose and scope",
      body: [
        "This policy sets out how Gaugeworks People expects company-issued laptops, phones and tablets to be used, secured and returned. It applies to every employee, contractor and temporary worker who is issued a device, from the day it is collected to the day it is handed back.",
        "Where a local law or a client contract asks for more than this policy does, the stricter requirement applies. Your people partner can tell you which agreements cover your team.",
      ],
    },
    {
      id: "enrolment",
      heading: "Device enrolment",
      body: [
        "Every device is enrolled in device management before it is handed over. Enrolment installs the company certificate, turns on disk encryption and lets IT push security updates. Do not remove the management profile; a device that leaves management loses access to company systems within the hour.",
        "If you receive a device that is not enrolled, or an update asks you to re-enrol, contact the service desk before you continue. Never accept a management profile from any source other than the service desk.",
      ],
    },
    {
      id: "locks",
      heading: "Passwords and screen locks",
      body: [
        "Set a passcode of at least six digits on phones and tablets, and a password of at least twelve characters on laptops. Biometric unlock may be used on top of a passcode but never instead of one.",
        "Screens must lock after five minutes or less of inactivity, and you should lock the screen yourself whenever you step away. Do not share your credentials with anyone, including colleagues and family members, and do not store them in plain text on the device.",
      ],
    },
    {
      id: "away",
      heading: "Working away from the office",
      body: [
        "When working from home, a client site or while travelling, keep the device with you or locked away. Do not leave a device unattended in a vehicle, even briefly. On public networks, connect through the company VPN before opening company systems.",
        "Shoulder surfing is a real risk on trains and in cafes. Use the privacy screen supplied with your laptop when you work in a public place, and avoid taking calls about confidential matters where others can hear.",
        "Taking a device outside your home country needs prior approval from your manager and IT. Some countries inspect devices at the border; IT can issue a clean travel device for those trips.",
      ],
    },
    {
      id: "personal",
      heading: "Personal use",
      body: [
        "Reasonable personal use is allowed, provided it does not interfere with your work, does not cost the company money and does not break any other policy. Keep personal files in a clearly named folder so they can be returned to you if the device is replaced.",
        "Do not install software from outside the company app catalogue, and do not let other people use the device, including family members. Company monitoring applies to all activity on the device, personal use included.",
      ],
    },
    {
      id: "loss",
      heading: "Reporting loss or theft",
      body: [
        "Report a lost or stolen device to the service desk immediately, at any hour, before you do anything else. IT will lock and wipe the device remotely; the sooner the report, the smaller the risk. There is no penalty for reporting a loss.",
        "If a device is stolen, also report it to the local police and keep the crime reference. A replacement is issued once the report has been logged, usually within one working day.",
      ],
    },
  ],
};

/** Two earlier versions, both acknowledged by the same reader. */
export const defaultAckHistory: AckHistoryEntry[] = [
  {
    id: "ack-30",
    version: "3.0",
    acknowledgedAt: Date.UTC(2026, 2, 14, 10, 12),
    initials: "RV",
  },
  {
    id: "ack-22",
    version: "2.2",
    acknowledgedAt: Date.UTC(2025, 8, 2, 15, 40),
    initials: "RV",
  },
];

/** The first three sections, read on an earlier visit. */
export const defaultAckValue: AckValue = ["purpose", "enrolment", "locks"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

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

/** "12 Oct 2026", in UTC so the server and the client print the same day. */
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

const DENSITY: Record<
  AckDensity,
  { text: string; para: string; section: string; row: string; pane: string }
> = {
  compact: {
    text: "text-[12px] leading-[18px]",
    para: "gap-2",
    section: "py-2.5",
    row: "h-7",
    pane: "px-4 py-3",
  },
  cozy: {
    text: "text-[13px] leading-5",
    para: "gap-2.5",
    section: "py-3",
    row: "h-8",
    pane: "px-5 py-4",
  },
  roomy: {
    text: "text-[14px] leading-[22px]",
    para: "gap-3",
    section: "py-4",
    row: "h-9",
    pane: "px-6 py-5",
  },
};

/** How far past a section's end the pane must show before it counts as read. */
const SEEN_SLACK = 4;
/** A section still counts as the one being read until this much of it is left above. */
const CURRENT_SLACK = 24;

/** How long the rungs take to fade out in turn before the done badge lands, in ms. */
const COLLAPSE_MS = 380;

const noopSubscribe = () => () => {};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/* ----------------------------------------------------------------------- */
/*                                   Rung                                   */
/* ----------------------------------------------------------------------- */

type RungMarkProps = {
  style: AckRungStyle;
  read: boolean;
  current: boolean;
  motionSafe: boolean;
};

function RungMark({ style, read, current, motionSafe }: RungMarkProps) {
  const fillTransition = motionSafe
    ? { ...springs.snap, opacity: { duration: durations.fast } }
    : { duration: durations.fast };
  if (style === "bar") {
    return (
      <span
        aria-hidden
        className={cn(
          "relative block h-5 w-1.5 overflow-hidden rounded-full bg-surface-2 transition-colors duration-200",
          current &&
            !read &&
            "bg-[color-mix(in_oklab,var(--accent)_30%,var(--bg-2))]",
        )}
      >
        <motion.span
          className="absolute inset-0 block origin-bottom rounded-full bg-cobalt-bright"
          initial={false}
          animate={{
            scaleY: motionSafe ? (read ? 1 : 0) : 1,
            opacity: read ? 1 : 0,
          }}
          transition={fillTransition}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-4 items-center justify-center rounded-full border bg-card transition-colors duration-200",
        read
          ? "border-cobalt-bright"
          : current
            ? "border-[color-mix(in_oklab,var(--accent-bright)_60%,var(--hairline-strong))]"
            : "border-hairline-strong",
      )}
    >
      <motion.span
        className={cn(
          "absolute rounded-full bg-cobalt-bright",
          style === "tick" ? "inset-0" : "inset-[3px]",
        )}
        initial={false}
        animate={{
          scale: motionSafe ? (read ? 1 : 0) : 1,
          opacity: read ? 1 : 0,
        }}
        transition={fillTransition}
      />
      {style === "tick" ? (
        <svg
          viewBox="0 0 14 14"
          className="relative size-2.5 text-primary-foreground"
        >
          <motion.path
            d="M3 7.4 5.8 10 11 4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{
              pathLength: motionSafe ? (read ? 1 : 0) : 1,
              opacity: read ? 1 : 0,
            }}
            transition={
              motionSafe
                ? {
                    pathLength: { ...springs.flick, delay: durations.blink },
                    opacity: { duration: durations.blink },
                  }
                : { duration: durations.fast }
            }
          />
        </svg>
      ) : null}
    </span>
  );
}

type RungProps = {
  index: number;
  section: AckSection;
  href: string;
  read: boolean;
  current: boolean;
  style: AckRungStyle;
  side: AckSide;
  row: string;
  motionSafe: boolean;
  tabIndex: number;
  /** Fades in when it mounts after the first paint: a rung for a section added later. */
  enter: boolean;
  exitDelay: number;
  nodeRef: (node: HTMLAnchorElement | null) => void;
  onJump: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function Rung({
  index,
  section,
  href,
  read,
  current,
  style,
  side,
  row,
  motionSafe,
  tabIndex,
  enter,
  exitDelay,
  nodeRef,
  onJump,
  onFocus,
  onNav,
}: RungProps) {
  return (
    <motion.li
      className="relative flex shrink-0"
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: { ...exitFor(durations.fast), delay: exitDelay },
      }}
      transition={{
        opacity: { duration: durations.base, ease: easings.enter },
      }}
    >
      {/* The tie line: from the rung toward the document's edge, drawn when
          the section is read. Only in the side-by-side layout. */}
      <motion.span
        aria-hidden
        className={cn(
          "absolute top-1/2 hidden h-px w-3 bg-cobalt-bright @min-[36rem]:block",
          side === "right" ? "-left-3 origin-left" : "-right-3 origin-right",
        )}
        initial={false}
        animate={{
          scaleX: motionSafe ? (read ? 1 : 0) : 1,
          opacity: read ? 1 : 0,
        }}
        transition={
          motionSafe
            ? {
                scaleX: { ...springs.snap, delay: durations.blink },
                opacity: { duration: durations.fast },
              }
            : { duration: durations.fast }
        }
      />
      <a
        ref={nodeRef}
        href={href}
        tabIndex={tabIndex}
        aria-label={`Section ${index + 1}, ${section.heading}, ${read ? "read" : "unread"}`}
        aria-current={current ? "location" : undefined}
        title={section.heading}
        onFocus={onFocus}
        onKeyDown={onNav}
        onClick={(event) => {
          event.preventDefault();
          onJump();
        }}
        className={cn(
          "flex items-center gap-2.5 rounded-2 px-1.5 text-left transition-colors hover:bg-surface-2 @min-[36rem]:w-full",
          row,
          side === "left" &&
            "@min-[36rem]:flex-row-reverse @min-[36rem]:text-right",
          FOCUS_RING,
        )}
      >
        <RungMark
          style={style}
          read={read}
          current={current}
          motionSafe={motionSafe}
        />
        <span
          className={cn(
            "hidden min-w-0 items-baseline gap-1.5 @min-[36rem]:flex",
            side === "left" && "flex-row-reverse",
          )}
        >
          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            {index + 1}
          </span>
          <span
            className={cn(
              "truncate text-[12px] transition-colors duration-200",
              read ? "text-foreground" : current ? "text-ink" : "text-ink-2",
            )}
          >
            {section.heading}
          </span>
        </span>
      </a>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Count label                                */
/* ----------------------------------------------------------------------- */

function LeftCount({
  left,
  motionSafe,
  id,
}: {
  left: number;
  motionSafe: boolean;
  id: string;
}) {
  return (
    <p
      id={id}
      className="flex h-5 items-center gap-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
    >
      <span className="sr-only">
        {left === 0
          ? "All sections read"
          : `${plural(left, "section", "sections")} left`}
      </span>
      <span aria-hidden className="flex items-center gap-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={left}
            className="inline-block tabular-nums"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {left === 0 ? "All" : left}
          </motion.span>
        </AnimatePresence>
        <span>
          {left === 0
            ? "sections read"
            : `${left === 1 ? "section" : "sections"} left`}
        </span>
      </span>
    </p>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Skeleton                                 */
/* ----------------------------------------------------------------------- */

function Skeleton({
  side,
  d,
}: {
  side: AckSide;
  d: (typeof DENSITY)[AckDensity];
}) {
  const widths = [92, 100, 96, 72, 0, 60, 100, 94, 88, 0, 64, 100, 90];
  return (
    <div
      aria-hidden
      className={cn(
        "flex min-h-0 flex-1 flex-col @min-[36rem]:flex-row",
        side === "left" && "@min-[36rem]:flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden",
          d.pane,
        )}
      >
        <span className="mb-2 h-5 w-2/3 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
        {widths.map((w, i) =>
          w === 0 ? (
            <span key={i} className="h-2" />
          ) : (
            <span
              key={i}
              className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
              style={{ width: `${w}%`, animationDelay: `${i * 60}ms` }}
            />
          ),
        )}
      </div>
      <div
        className={cn(
          "flex shrink-0 gap-3 border-t border-hairline p-3 @min-[36rem]:w-[13.5rem] @min-[36rem]:flex-col @min-[36rem]:border-t-0",
          side === "right"
            ? "@min-[36rem]:border-l @min-[36rem]:border-hairline"
            : "@min-[36rem]:border-r @min-[36rem]:border-hairline",
        )}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="flex items-center gap-2.5">
            <span
              className="size-4 shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 90}ms` }}
            />
            <span
              className="hidden h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse @min-[36rem]:block"
              style={{
                width: 56 + ((i * 29) % 50),
                animationDelay: `${i * 90}ms`,
              }}
            />
          </span>
        ))}
        <span className="mt-auto hidden h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[36rem]:block" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A policy to read and acknowledge. The document scrolls in a pane; beside it
 * a ladder stands with one rung per section. As the reader scrolls the end of
 * a section into view its rung lights on `springs.snap` — a dot fills, a
 * check draws on `springs.flick`, or a bar fills from the foot — a tie line
 * draws from the rung toward the document and the section's own rail fills
 * in the margin. The count at the foot rolls down, "Next unread" scrolls the
 * pane to the first section still dark, and Acknowledge stays inert until
 * every rung is lit.
 *
 * Acknowledging asks for the reader's initials in a small dialog. When they
 * match, a stamp lands on the document on `springs.recoil` with the initials
 * and the date, the rungs fade out in turn and the ladder closes into one
 * done badge on the same spring, while the new version takes the top of the
 * history list on `springs.glide`.
 *
 * The pane is a focusable document region, so arrow keys scroll it. The
 * rungs are links with one tab stop: Up/Down move, Home/End jump, Enter goes
 * to the section and focuses its heading. The initials box takes Enter to
 * confirm and Escape to cancel. Every section read, the ready state and the
 * stamp are announced. Under reduced motion rungs, ties and the stamp
 * cross-fade in place and the pane jumps instead of smooth-scrolling.
 */
export function AckLadder({
  ladderSide = "right",
  rungStyle = "fill",
  density = "cozy",
  policy = defaultAckPolicy,
  value,
  defaultValue = defaultAckValue,
  onChange,
  acknowledgement,
  onAcknowledge,
  history = defaultAckHistory,
  signer = defaultAckSigner,
  now,
  status = "ready",
  onRetry,
  title = "Policy acknowledgement",
  label,
  height = 540,
  disabled = false,
  className,
}: AckLadderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const leftId = `${uid}-left`;
  const dialogId = `${uid}-dialog`;
  const dialogTitleId = `${uid}-dialog-title`;
  const initialsId = `${uid}-initials`;
  const errorId = `${uid}-error`;
  const domId = (sectionId: string) => `${uid}-s-${sectionId}`;

  const d = DENSITY[density] ?? DENSITY.cozy;
  const sections = React.useMemo(() => policy?.sections ?? [], [policy]);
  const ready = status === "ready";
  const hasPolicy = policy !== null && sections.length > 0;
  const inert = disabled || !ready;

  /* -------------------------------- state ------------------------------ */

  const [own, setOwn] = React.useState<AckValue>(defaultValue);
  const current = value ?? own;
  const [ownStamp, setOwnStamp] = React.useState<AckAcknowledgement | null>(
    null,
  );
  const stamp = acknowledgement === undefined ? ownStamp : acknowledgement;

  const [reading, setReading] = React.useState<string | null>(null);
  const [activeRung, setActiveRung] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so rungs already on the page
  // never fade in; true for rungs that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [paneEl, setPaneEl] = React.useState<HTMLDivElement | null>(null);
  const [articleEl, setArticleEl] = React.useState<HTMLElement | null>(null);
  const sectionNodes = React.useRef(new Map<string, HTMLElement>());
  const headingNodes = React.useRef(new Map<string, HTMLElement>());
  const rungNodes = React.useRef(new Map<string, HTMLAnchorElement>());
  const ackRef = React.useRef<HTMLButtonElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const focusDone = React.useRef(false);
  const focusTimer = React.useRef<number | null>(null);
  const collapseTimer = React.useRef<number | null>(null);

  /* -------------------------------- data ------------------------------- */

  const ids = sections.map((s) => s.id);
  const readSet = new Set(current.filter((id) => ids.includes(id)));
  const readCount = readSet.size;
  const left = sections.length - readCount;
  const allRead = hasPolicy && left === 0;
  const nextUnread = sections.find((s) => !readSet.has(s.id)) ?? null;
  const stamped = stamp !== null && stamp !== undefined;
  const canAck = allRead && !stamped && !inert;

  // The ladder closes in two steps: the rungs fade out in turn while the
  // column is still standing, then the done badge lands in its place.
  const [phase, setPhase] = React.useState<"ladder" | "done">(
    stamped ? "done" : "ladder",
  );
  // The stamp arriving (or being taken back by the host) resets the phase
  // during the same render, so no frame shows the wrong column.
  const [seenStamped, setSeenStamped] = React.useState(stamped);
  if (seenStamped !== stamped) {
    setSeenStamped(stamped);
    setPhase(stamped && !motionSafe ? "done" : "ladder");
  }
  const collapsing = stamped && phase === "ladder";
  React.useEffect(() => {
    if (!collapsing) return;
    collapseTimer.current = window.setTimeout(() => {
      collapseTimer.current = null;
      setPhase("done");
    }, COLLAPSE_MS);
    return () => {
      if (collapseTimer.current !== null) {
        window.clearTimeout(collapseTimer.current);
        collapseTimer.current = null;
      }
    };
  }, [collapsing]);

  /* ----------------------------- read marking -------------------------- */

  // What the scroll and resize callbacks read: always this render's values,
  // written after commit so nothing is touched during render.
  const latest = React.useRef({
    current,
    sections,
    value,
    onChange,
    inert,
  });
  React.useEffect(() => {
    latest.current = { current, sections, value, onChange, inert };
  });

  const mark = React.useCallback((added: string[]) => {
    const l = latest.current;
    if (l.inert || added.length === 0) return;
    const next = [
      ...l.current,
      ...added.filter((id) => !l.current.includes(id)),
    ];
    if (next.length === l.current.length) return;
    if (l.value === undefined) setOwn(next);
    l.onChange?.(next, added);
    const total = l.sections.length;
    const remaining =
      total - next.filter((id) => l.sections.some((s) => s.id === id)).length;
    const lastId = added[added.length - 1];
    const index = l.sections.findIndex((s) => s.id === lastId);
    const section = l.sections[index];
    const what =
      added.length === 1 && section
        ? `Section ${index + 1}, ${section.heading}, read.`
        : `${plural(added.length, "section", "sections")} read.`;
    setAnnouncement(
      remaining === 0
        ? `${what} All sections read. Acknowledge is ready.`
        : `${what} ${plural(remaining, "section", "sections")} left.`,
    );
  }, []);

  /** Reads the pane once: which section is under the reader, and which ends have been seen. */
  const check = React.useCallback(() => {
    const pane = paneEl;
    if (!pane) return;
    const l = latest.current;
    const pr = pane.getBoundingClientRect();
    const atEnd = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2;
    let cur: string | null = null;
    const added: string[] = [];
    for (const s of l.sections) {
      const el = sectionNodes.current.get(s.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const bottom = r.bottom - pr.top;
      if (cur === null && bottom > CURRENT_SLACK) cur = s.id;
      const seen = atEnd || bottom <= pane.clientHeight + SEEN_SLACK;
      if (seen && !l.current.includes(s.id)) added.push(s.id);
    }
    setReading(cur);
    if (added.length > 0) mark(added);
  }, [paneEl, mark]);

  React.useEffect(() => {
    if (!paneEl) return;
    const onScroll = () => check();
    paneEl.addEventListener("scroll", onScroll, { passive: true });
    // Observing fires once on its own, which is the first measurement; with
    // no ResizeObserver the pane is read on scroll alone.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => check());
      ro.observe(paneEl);
      if (articleEl) ro.observe(articleEl);
    }
    return () => {
      paneEl.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [paneEl, articleEl, check]);

  React.useEffect(
    () => () => {
      if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    },
    [],
  );

  /* ------------------------------- jumping ----------------------------- */

  const scrollToSection = (id: string, focusHeading: boolean) => {
    const pane = paneEl;
    const el = sectionNodes.current.get(id);
    if (!pane || !el) return;
    const top =
      pane.scrollTop +
      (el.getBoundingClientRect().top - pane.getBoundingClientRect().top) -
      8;
    pane.scrollTo({
      top: Math.max(0, top),
      behavior: motionSafe ? "smooth" : "auto",
    });
    if (focusHeading) {
      headingNodes.current.get(id)?.focus({ preventScroll: true });
    }
  };

  const jumpNext = () => {
    if (!nextUnread || !ready) return;
    const index = sections.findIndex((s) => s.id === nextUnread.id);
    scrollToSection(nextUnread.id, false);
    setActiveRung(nextUnread.id);
    setAnnouncement(`Scrolled to section ${index + 1}, ${nextUnread.heading}.`);
  };

  /* ---------------------------- acknowledging -------------------------- */

  const openAsk = () => {
    if (inert) return;
    if (!allRead) {
      setAnnouncement(
        `${plural(left, "section", "sections")} left to read before acknowledging.`,
      );
      return;
    }
    if (stamped) return;
    setTyped("");
    setError(null);
    setAsking(true);
    if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      inputRef.current?.focus();
    }, 0);
  };

  const cancelAsk = () => {
    setAsking(false);
    setError(null);
    if (focusTimer.current !== null) window.clearTimeout(focusTimer.current);
    focusTimer.current = window.setTimeout(() => {
      focusTimer.current = null;
      ackRef.current?.focus();
    }, 0);
  };

  const confirmAsk = () => {
    if (!policy || inert) return;
    const want = signer.initials.trim().toUpperCase();
    const got = typed.trim().toUpperCase();
    if (got.length === 0) {
      setError("Type your initials to acknowledge.");
      setAnnouncement("Type your initials to acknowledge.");
      inputRef.current?.focus();
      return;
    }
    if (got !== want) {
      setError(`Those are not ${signer.name}'s initials (${signer.initials}).`);
      setAnnouncement(`Initials do not match. Expected ${signer.initials}.`);
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    const ack: AckAcknowledgement = {
      policyId: policy.id,
      version: policy.version,
      initials: want,
      at: now ?? Date.now(),
    };
    if (acknowledgement === undefined) setOwnStamp(ack);
    onAcknowledge?.(ack);
    setAsking(false);
    setError(null);
    setAnnouncement(
      `Acknowledged version ${policy.version} as ${want} on ${fmtDate(ack.at)}.`,
    );
    // Focus lands on the done badge when it mounts, after the rungs have gone.
    focusDone.current = true;
  };

  /* ------------------------------ keyboard ----------------------------- */

  const activeId =
    activeRung && ids.includes(activeRung)
      ? activeRung
      : (nextUnread?.id ?? ids[0] ?? null);

  const onRungNav = (event: React.KeyboardEvent, id: string) => {
    const i = ids.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else return;
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) rungNodes.current.get(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const sideClass =
    ladderSide === "left" ? "@min-[36rem]:flex-row-reverse" : undefined;
  const ladderBorder =
    ladderSide === "left"
      ? "@min-[36rem]:border-r @min-[36rem]:border-hairline"
      : "@min-[36rem]:border-l @min-[36rem]:border-hairline";
  const exitStep = cascade(Math.max(sections.length, 2));
  const historyRows: {
    key: string;
    version: string;
    at: number;
    initials: string;
    fresh: boolean;
  }[] = [
    ...(stamped && stamp
      ? [
          {
            key: `now-${stamp.version}-${stamp.at}`,
            version: stamp.version,
            at: stamp.at,
            initials: stamp.initials,
            fresh: true,
          },
        ]
      : []),
    ...history.map((h) => ({
      key: h.id,
      version: h.version,
      at: h.acknowledgedAt,
      initials: h.initials,
      fresh: false,
    })),
  ];

  const showRungs = !stamped;
  const ladderFoot =
    stamped && stamp && phase === "done" ? (
      <motion.div
        key="done"
        ref={(node: HTMLDivElement | null) => {
          if (node && focusDone.current) {
            focusDone.current = false;
            node.focus({ preventScroll: true });
          }
        }}
        tabIndex={-1}
        aria-label={`Acknowledged version ${stamp.version} on ${fmtDate(stamp.at)} as ${stamp.initials}`}
        initial={
          motionSafe
            ? { opacity: 0, scale: 0.6, y: distances.step }
            : { opacity: 0 }
        }
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={
          motionSafe
            ? { ...springs.recoil, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
        className={cn(
          "flex items-center gap-2.5 rounded-3 border border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-3 py-2.5 text-success",
          FOCUS_RING,
        )}
      >
        <CircleCheck aria-hidden className="size-5 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="text-[12px] font-semibold text-foreground">
            Acknowledged
          </span>
          <span className="truncate font-mono text-[10px] tracking-[0.04em] text-ink-2 uppercase">
            v{stamp.version} · {fmtDate(stamp.at)} · {stamp.initials}
          </span>
        </span>
      </motion.div>
    ) : (
      <motion.div
        key="ladder"
        className="flex min-h-0 flex-col gap-3 @min-[36rem]:flex-1"
        exit={{ opacity: 0, transition: exitFor(durations.base) }}
      >
        <div className="flex min-h-0 items-center gap-3 @min-[36rem]:flex-1 @min-[36rem]:flex-col @min-[36rem]:items-stretch">
          <nav
            aria-label="Sections"
            className="relative min-h-0 min-w-0 flex-1 @min-[36rem]:overflow-y-auto"
          >
            {/* The rail behind the rungs; side-by-side only, and not for bars,
              which make their own. Rung centre = gutter 12 + pad 6 + half 8. */}
            {rungStyle !== "bar" && showRungs ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-2 bottom-2 hidden w-px bg-hairline @min-[36rem]:block",
                  ladderSide === "right" ? "left-[25.5px]" : "right-[25.5px]",
                )}
              />
            ) : null}
            <ul
              role="list"
              className={cn(
                "relative flex flex-wrap items-center gap-x-1 gap-y-1 @min-[36rem]:flex-col @min-[36rem]:flex-nowrap @min-[36rem]:items-stretch @min-[36rem]:gap-0",
                ladderSide === "right"
                  ? "@min-[36rem]:pl-3"
                  : "@min-[36rem]:pr-3",
              )}
            >
              <AnimatePresence initial={false}>
                {(showRungs ? sections : []).map((section, i) => (
                  <Rung
                    key={section.id}
                    index={i}
                    section={section}
                    href={`#${domId(section.id)}`}
                    read={readSet.has(section.id)}
                    current={reading === section.id && !readSet.has(section.id)}
                    style={rungStyle}
                    side={ladderSide}
                    row={d.row}
                    motionSafe={motionSafe}
                    tabIndex={activeId === section.id ? 0 : -1}
                    enter={live}
                    exitDelay={i * exitStep}
                    nodeRef={(node) => {
                      if (node) rungNodes.current.set(section.id, node);
                      else rungNodes.current.delete(section.id);
                    }}
                    onJump={() => {
                      scrollToSection(section.id, true);
                      setActiveRung(section.id);
                    }}
                    onFocus={() => setActiveRung(section.id)}
                    onNav={(event) => onRungNav(event, section.id)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </nav>
          {showRungs ? (
            <LeftCount left={left} motionSafe={motionSafe} id={leftId} />
          ) : null}
        </div>

        <AnimatePresence initial={false} mode="wait">
          {!showRungs ? null : asking ? (
            <motion.div
              key="ask"
              id={dialogId}
              role="dialog"
              aria-labelledby={dialogTitleId}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelAsk();
                }
              }}
              className="flex flex-col gap-2 rounded-3 border border-hairline-strong bg-popover p-3"
            >
              <p
                id={dialogTitleId}
                className="text-[12px] leading-4 text-foreground"
              >
                Type your initials{" "}
                <span className="font-mono font-semibold">
                  {signer.initials}
                </span>{" "}
                to acknowledge v{policy?.version}.
              </p>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  id={initialsId}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={4}
                  value={typed}
                  aria-label="Your initials"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => {
                    setTyped(event.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      confirmAsk();
                    }
                  }}
                  className={cn(
                    "h-8 w-16 rounded-2 border bg-card px-2 text-center font-mono text-[13px] tracking-[0.18em] text-foreground uppercase",
                    error ? "border-danger" : "border-hairline-strong",
                    FOCUS_RING,
                  )}
                />
                <button
                  type="button"
                  onClick={confirmAsk}
                  className={cn(
                    "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                    FOCUS_RING,
                  )}
                >
                  <Check aria-hidden className="size-3.5" />
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={cancelAsk}
                  aria-label="Cancel"
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
              <AnimatePresence initial={false}>
                {error ? (
                  <motion.p
                    key="err"
                    id={errorId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ duration: durations.fast }}
                    className="text-[11px] leading-4 text-danger"
                  >
                    {error}
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="actions"
              className="flex shrink-0 gap-2 @min-[36rem]:flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              <button
                type="button"
                onClick={jumpNext}
                aria-disabled={!nextUnread || undefined}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs transition-colors @min-[36rem]:flex-none",
                  nextUnread
                    ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                    : "cursor-default text-ink-3",
                  FOCUS_RING,
                )}
              >
                <ArrowDown aria-hidden className="size-3.5" />
                Next unread
              </button>
              <button
                ref={ackRef}
                type="button"
                onClick={openAsk}
                aria-disabled={!canAck || undefined}
                aria-describedby={leftId}
                aria-haspopup="dialog"
                aria-expanded={asking}
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors duration-200 @min-[36rem]:flex-none",
                  canAck
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "cursor-default border border-hairline bg-surface-1 text-ink-3",
                  FOCUS_RING,
                )}
              >
                <AnimatePresence initial={false}>
                  {canAck ? (
                    <motion.span
                      key="tick"
                      className="flex"
                      initial={
                        motionSafe ? { scale: 0, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.flick,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <Check aria-hidden className="size-3.5" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                Acknowledge
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );

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
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Scroll the end of each section into view to mark it read. Every section
        must be read before the policy can be acknowledged.
      </p>

      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          {ready && hasPolicy && policy ? (
            <p className="truncate text-[11px] text-ink-3">
              {policy.title} · v{policy.version} · effective{" "}
              {fmtDate(policy.effectiveAt)}
            </p>
          ) : null}
        </div>
        {ready && hasPolicy ? (
          <span
            className={cn(
              "hidden h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors duration-200 @min-[24rem]:inline-flex",
              stamped
                ? "border-[color-mix(in_oklab,var(--success)_40%,transparent)] text-success"
                : allRead
                  ? "border-[color-mix(in_oklab,var(--accent-bright)_40%,transparent)] text-cobalt-bright"
                  : "border-hairline-strong text-ink-3",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                stamped
                  ? "bg-success"
                  : allRead
                    ? "bg-cobalt-bright"
                    : "bg-warn",
              )}
            />
            {stamped ? "Acknowledged" : allRead ? "Ready" : "Unacknowledged"}
          </span>
        ) : null}
      </header>

      {status === "loading" ? (
        <Skeleton side={ladderSide} d={d} />
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The policy didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : !hasPolicy || !policy ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <FileText aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">No policy assigned</p>
          <p className="text-[12px] text-ink-3">
            Nothing to read or acknowledge right now.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col @min-[36rem]:flex-row",
            sideClass,
          )}
        >
          {/* ---------------------------- document ------------------------ */}
          <div className="relative min-h-0 min-w-0 flex-1">
            <div
              ref={setPaneEl}
              role="region"
              aria-label={`${policy.title}, policy text`}
              aria-describedby={hintId}
              tabIndex={0}
              className={cn(
                "h-full overflow-y-auto overscroll-contain",
                "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              <article
                ref={setArticleEl}
                className={cn("flex flex-col", d.pane)}
              >
                <h3 className="text-base leading-6 font-semibold text-foreground">
                  {policy.title}
                </h3>
                <p className="mt-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  v{policy.version}
                  {policy.owner ? ` · ${policy.owner}` : ""} · effective{" "}
                  {fmtDate(policy.effectiveAt)}
                </p>
                <div className="mt-3 flex flex-col">
                  {sections.map((section, i) => {
                    const read = readSet.has(section.id);
                    const isReading = reading === section.id && !read;
                    return (
                      <section
                        key={section.id}
                        id={domId(section.id)}
                        ref={(node) => {
                          if (node) sectionNodes.current.set(section.id, node);
                          else sectionNodes.current.delete(section.id);
                        }}
                        aria-labelledby={`${domId(section.id)}-h`}
                        className={cn("relative pl-4", d.section)}
                      >
                        <span
                          aria-hidden
                          className="absolute top-3 bottom-3 left-0 w-0.5 rounded-full bg-hairline"
                        />
                        <motion.span
                          aria-hidden
                          className="absolute top-3 bottom-3 left-0 w-0.5 origin-top rounded-full bg-cobalt-bright"
                          initial={false}
                          animate={{
                            scaleY: motionSafe ? (read ? 1 : 0) : 1,
                            opacity: read ? 1 : 0,
                          }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.snap,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: durations.fast }
                          }
                        />
                        <h4
                          id={`${domId(section.id)}-h`}
                          ref={(node) => {
                            if (node)
                              headingNodes.current.set(section.id, node);
                            else headingNodes.current.delete(section.id);
                          }}
                          tabIndex={-1}
                          className={cn(
                            "flex items-baseline gap-2 rounded-1 text-[13px] leading-5 font-semibold transition-colors duration-200",
                            read
                              ? "text-foreground"
                              : isReading
                                ? "text-ink"
                                : "text-ink-2",
                            FOCUS_RING,
                          )}
                        >
                          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                            {i + 1}
                          </span>
                          {section.heading}
                          <span className="sr-only">
                            , {read ? "read" : "unread"}
                          </span>
                        </h4>
                        <div
                          className={cn(
                            "mt-1.5 flex flex-col text-ink-2",
                            d.text,
                            d.para,
                          )}
                        >
                          {section.body.map((paragraph, j) => (
                            <p key={j}>{paragraph}</p>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <p className="mt-4 border-t border-hairline pt-3 text-[11px] text-ink-3">
                  End of policy.{" "}
                  {stamped && stamp
                    ? `Acknowledged by ${stamp.initials} on ${fmtDate(stamp.at)}.`
                    : "Acknowledge it from the ladder once every section is read."}
                </p>
              </article>
            </div>

            {/* ------------------------------ stamp ----------------------- */}
            <AnimatePresence initial={false}>
              {stamped && stamp ? (
                <motion.div
                  key="stamp"
                  aria-hidden
                  initial={
                    motionSafe
                      ? { opacity: 0, scale: 1.7, rotate: -18 }
                      : { opacity: 0, rotate: -8 }
                  }
                  animate={{ opacity: 1, scale: 1, rotate: -8 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "pointer-events-none absolute top-4 flex flex-col items-center rounded-2 border-2 border-success px-2.5 py-1.5 text-success",
                    ladderSide === "right" ? "right-4" : "left-4",
                  )}
                  style={{
                    backgroundColor:
                      "color-mix(in oklab, var(--success) 8%, var(--bg-0))",
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in oklab, var(--success) 35%, transparent)",
                  }}
                >
                  <span className="font-mono text-[10px] leading-3 font-semibold tracking-[0.18em] uppercase">
                    Acknowledged
                  </span>
                  <span className="mt-0.5 font-mono text-[11px] leading-4 tracking-[0.08em] uppercase">
                    {stamp.initials} · {fmtDate(stamp.at)}
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* ----------------------------- ladder ------------------------- */}
          <aside
            aria-label="Reading progress"
            className={cn(
              "flex shrink-0 flex-col gap-3 border-t border-hairline p-3 @min-[36rem]:w-[13.5rem] @min-[36rem]:border-t-0",
              ladderBorder,
            )}
          >
            <AnimatePresence initial={false} mode="wait">
              {ladderFoot}
            </AnimatePresence>

            {historyRows.length > 0 ? (
              <section
                aria-label="Acknowledgement history"
                className="hidden flex-col gap-1 border-t border-hairline pt-2.5 @min-[36rem]:flex"
              >
                <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  History
                </p>
                <ul role="list" className="flex flex-col">
                  <AnimatePresence initial={false}>
                    {historyRows.map((row) => (
                      <motion.li
                        key={row.key}
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
                          y: motionSafe ? springs.glide : { duration: 0 },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                        }}
                        className={cn(
                          "grid h-6 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2 text-[11px]",
                          row.fresh ? "text-foreground" : "text-ink-2",
                        )}
                      >
                        <span className="font-mono text-ink-3 tabular-nums">
                          v{row.version}
                        </span>
                        <span className="truncate">{fmtDate(row.at)}</span>
                        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          {row.initials}
                        </span>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
