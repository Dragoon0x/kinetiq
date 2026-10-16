"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ChevronDown,
  CircleAlert,
  Hash,
  Lock,
  RotateCcw,
  SendHorizontal,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
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

export type MacroTicketStatus =
  "new" | "open" | "pending" | "on-hold" | "solved" | "closed";
export type MacroPriority = "low" | "normal" | "high" | "urgent";

export type MacroMessage = {
  id: string;
  /** Who wrote it: the customer, or someone on the support team. */
  role: "customer" | "agent";
  author: string;
  /** When it was sent, in ms since the epoch. */
  at: number;
  /** Plain text; blank lines make paragraphs. */
  text: string;
};

export type MacroTicket = {
  id: string;
  number: number;
  subject: string;
  /** Where it came in: "Email", "Chat", "Web form". */
  channel: string;
  status: MacroTicketStatus;
  priority: MacroPriority;
  tags: string[];
  messages: MacroMessage[];
};

export type MacroHistoryItem = {
  id: string;
  number: number;
  subject: string;
  status: MacroTicketStatus;
  at: number;
};

export type MacroCustomer = {
  name: string;
  email: string;
  company?: string;
  /** The plan they pay for, e.g. "Team". */
  plan: string;
  seats?: number;
  /** When they became a customer, ms. */
  since: number;
  /** Their earlier tickets, newest first. */
  history: MacroHistoryItem[];
};

export type MacroDef = {
  id: string;
  name: string;
  /** The reply it writes. `{first}`, `{agent}` and `{number}` are filled in. */
  text: string;
  /** The ticket fields it sets as it writes. */
  set?: {
    status?: MacroTicketStatus;
    priority?: MacroPriority;
    addTags?: string[];
    removeTags?: string[];
  };
};

export type MacroFields = {
  status: MacroTicketStatus;
  priority: MacroPriority;
  tags: string[];
};

export type MacroOutgoing = {
  text: string;
  fields: MacroFields;
  /** The last macro applied to this reply, if any. */
  macroId: string | null;
};

export type MacroStatusSource = "macro" | "field" | "reopen";
export type MacroSidebarSide = "left" | "right";
export type MacroDensity = "compact" | "cozy" | "roomy";
export type MacroAccent = "cobalt" | "jade" | "amber" | "mono";

export type MacroReplyHandle = {
  /** Applies a macro by id, as if it had been picked from the list. */
  applyMacro: (id: string) => void;
  /** Moves focus to the reply box. */
  focusReply: () => void;
};

export type MacroReplyProps = {
  /** Imperative handle: `applyMacro(id)` and `focusReply()`. */
  ref?: React.Ref<MacroReplyHandle>;
  /** Which side the customer sidebar sits on; at narrow widths, which side its tab sits on. @default "right" */
  sidebarSide?: MacroSidebarSide;
  /** Type size, paddings and gaps: compact, cozy or roomy. @default "cozy" */
  density?: MacroDensity;
  /** The macro wash, typing hairline, change chips and Send: cobalt, jade, amber or mono. @default "cobalt" */
  accent?: MacroAccent;
  /** The ticket: subject, fields and conversation. @default defaultMacroTicket */
  ticket?: MacroTicket;
  /** The customer shown in the sidebar, with their earlier tickets. @default defaultMacroCustomer */
  customer?: MacroCustomer;
  /** The macros `#` opens. @default defaultMacros */
  macros?: MacroDef[];
  /** The agent replying; fills `{agent}` and signs sent messages. @default "Theo" */
  agent?: string;
  /** The moment relative times count from, ms. Never read from the clock. @default defaultMacroNow */
  now?: number;
  /** Whether the ticket has arrived; loading draws skeletons in the same boxes. @default "ready" */
  status?: "ready" | "loading";
  /** A macro was applied (picked, or through the handle), before it starts typing. */
  onApplyMacro?: (macro: MacroDef) => void;
  /** The reply was sent with its fields. Return a promise to hold Send; a rejection keeps the draft and offers Retry. */
  onSend?: (reply: MacroOutgoing) => void | Promise<unknown>;
  /** The ticket's status changed, and what changed it. */
  onStatusChange?: (
    status: MacroTicketStatus,
    source: MacroStatusSource,
  ) => void;
  /** Any field changed (status, priority or tags), with all three. */
  onFieldsChange?: (fields: MacroFields) => void;
  /** How fast a macro types, in characters a second. @default 90 */
  typeSpeed?: number;
  /** How long a changed field flashes, ms. @default 640 */
  flash?: number;
  /** Height of the surface, px; the conversation scrolls inside it. @default 540 */
  height?: number;
  /** The reply box's placeholder. @default "Reply to {first}… Type # for macros" */
  placeholder?: string;
  /** Read only: nothing can be typed, applied or sent. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** Thursday 15 October 2026, 10:24 UTC. */
export const defaultMacroNow = Date.UTC(2026, 9, 15, 10, 24);
const N = defaultMacroNow;

export const defaultMacroTicket: MacroTicket = {
  id: "t-3195",
  number: 3195,
  subject: "Charged twice after upgrading to Team",
  channel: "Email",
  status: "open",
  priority: "normal",
  tags: ["billing"],
  messages: [
    {
      id: "m1",
      role: "customer",
      author: "Mara Lindqvist",
      at: N - 52 * MIN,
      text: "Hi, we upgraded Fernworks from Starter to Team on Monday and the card was charged twice: €240 on the 12th and €240 again on the 13th. Only one invoice shows on the billing page.\n\nCan you refund the second charge?",
    },
    {
      id: "m2",
      role: "agent",
      author: "Ines",
      at: N - 40 * MIN,
      text: "Thanks Mara. I'm checking this with billing now and will come back to you here.",
    },
    {
      id: "m3",
      role: "customer",
      author: "Mara Lindqvist",
      at: N - 12 * MIN,
      text: "Thanks. For reference, the second charge shows as BSN*BASINWORKS 4471 on our statement.",
    },
  ],
};

export const defaultMacroCustomer: MacroCustomer = {
  name: "Mara Lindqvist",
  email: "mara@fernworks.studio",
  company: "Fernworks",
  plan: "Team",
  seats: 12,
  since: Date.UTC(2023, 2, 8),
  history: [
    {
      id: "h1",
      number: 2871,
      subject: "Invite links expire too quickly",
      status: "solved",
      at: N - 57 * DAY,
    },
    {
      id: "h2",
      number: 2604,
      subject: "Single sign-on for Fernworks",
      status: "solved",
      at: N - 166 * DAY,
    },
    {
      id: "h3",
      number: 2210,
      subject: "Move the workspace to the EU region",
      status: "closed",
      at: N - 330 * DAY,
    },
  ],
};

export const defaultMacros: MacroDef[] = [
  {
    id: "refund-duplicate",
    name: "Refund duplicate charge",
    text: "Hi {first},\n\nThanks for flagging this. The second €240 charge on the 13th was a duplicate taken during the upgrade, and I've refunded it in full. It should be back on your card in 3 to 5 working days.\n\nSorry for the bother,\n{agent}",
    set: { status: "pending", priority: "low", addTags: ["refund"] },
  },
  {
    id: "ask-invoice",
    name: "Ask for the invoice number",
    text: "Hi {first},\n\nCould you send the invoice number from the second charge? It starts with BW- and is in the email receipt, and it lets billing match the payment straight away.\n\nThanks,\n{agent}",
    set: { status: "pending", addTags: ["needs-info"] },
  },
  {
    id: "escalate-billing",
    name: "Escalate to billing",
    text: "Hi {first},\n\nI've passed this to our billing team with everything you've sent. They work through these within one working day, and I'll update you here as soon as I hear back.\n\n{agent}",
    set: { status: "on-hold", priority: "high", addTags: ["escalated"] },
  },
  {
    id: "plan-change",
    name: "Explain a mid-cycle upgrade",
    text: "Hi {first},\n\nWhen you upgrade mid-cycle, we charge the difference for the rest of the month, then the full Team price from your next renewal. Both appear on one invoice.\n\n{agent}",
  },
  {
    id: "solve-thanks",
    name: "Solve with thanks",
    text: "Hi {first},\n\nGlad that's sorted. I'll mark this as solved; just reply here if anything else comes up with ticket #{number}.\n\nAll the best,\n{agent}",
    set: { status: "solved", removeTags: ["needs-info"] },
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const STATUS: Record<MacroTicketStatus, { label: string; dot: string }> = {
  new: { label: "New", dot: "bg-cobalt-bright" },
  open: { label: "Open", dot: "bg-warn" },
  pending: { label: "Pending", dot: "bg-signal" },
  "on-hold": { label: "On hold", dot: "bg-ink-2" },
  solved: { label: "Solved", dot: "bg-success" },
  closed: { label: "Closed", dot: "border border-ink-3" },
};
const STATUS_ORDER: MacroTicketStatus[] = [
  "new",
  "open",
  "pending",
  "on-hold",
  "solved",
  "closed",
];

const PRIORITY: Record<MacroPriority, { label: string; bars: number }> = {
  low: { label: "Low", bars: 1 },
  normal: { label: "Normal", bars: 2 },
  high: { label: "High", bars: 3 },
  urgent: { label: "Urgent", bars: 3 },
};
const PRIORITY_ORDER: MacroPriority[] = ["low", "normal", "high", "urgent"];

const ACCENT: Record<MacroAccent, Record<string, string>> = {
  cobalt: {
    "--mr-ink": "var(--accent-bright)",
    "--mr-fill": "var(--primary)",
    "--mr-on": "var(--primary-foreground)",
  },
  jade: {
    "--mr-ink": "var(--success)",
    "--mr-fill": "oklch(from var(--success) 0.52 0.12 h)",
    "--mr-on": "var(--primary-foreground)",
  },
  amber: {
    "--mr-ink": "var(--warn)",
    "--mr-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--mr-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  mono: {
    "--mr-ink": "var(--foreground)",
    "--mr-fill": "var(--foreground)",
    "--mr-on": "var(--background)",
  },
};

type Geometry = {
  body: string;
  meta: string;
  pad: string;
  gap: string;
  bubble: string;
  field: string;
  rows: number;
};

const DENSITY: Record<MacroDensity, Geometry> = {
  compact: {
    body: "text-[12.5px] leading-[1.45]",
    meta: "text-[11px] leading-4",
    pad: "px-3",
    gap: "gap-2",
    bubble: "px-2.5 py-2",
    field: "h-7",
    rows: 3,
  },
  cozy: {
    body: "text-[13px] leading-[1.5]",
    meta: "text-[11.5px] leading-4",
    pad: "px-4",
    gap: "gap-3",
    bubble: "px-3 py-2.5",
    field: "h-8",
    rows: 3,
  },
  roomy: {
    body: "text-[14px] leading-[1.55]",
    meta: "text-[12px] leading-4",
    pad: "px-5",
    gap: "gap-4",
    bubble: "px-3.5 py-3",
    field: "h-9",
    rows: 4,
  },
};

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

/** Day and month in UTC, so the server and the browser print the same. */
const day = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};
const monthYear = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};
const ago = (now: number, at: number) => {
  const m = Math.round((now - at) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return day(at);
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const fill = (
  text: string,
  values: { first: string; agent: string; number: number },
) =>
  text
    .replaceAll("{first}", values.first)
    .replaceAll("{agent}", values.agent)
    .replaceAll("{number}", String(values.number));

type Change =
  | { key: "status"; kind: "status"; to: MacroTicketStatus }
  | { key: "priority"; kind: "priority"; to: MacroPriority }
  | { key: string; kind: "add" | "remove"; tag: string };

/** The fields a macro would actually change from where they stand now. */
function changesFor(fields: MacroFields, macro: MacroDef): Change[] {
  const set = macro.set;
  if (!set) return [];
  const out: Change[] = [];
  if (set.status && set.status !== fields.status)
    out.push({ key: "status", kind: "status", to: set.status });
  if (set.priority && set.priority !== fields.priority)
    out.push({ key: "priority", kind: "priority", to: set.priority });
  for (const tag of set.addTags ?? [])
    if (!fields.tags.includes(tag))
      out.push({ key: `tag:${tag}`, kind: "add", tag });
  for (const tag of set.removeTags ?? [])
    if (fields.tags.includes(tag))
      out.push({ key: `tag:${tag}`, kind: "remove", tag });
  return out;
}

const chipLabel = (change: Change) =>
  change.kind === "status"
    ? `Status ${STATUS[change.to].label}`
    : change.kind === "priority"
      ? `Priority ${PRIORITY[change.to].label}`
      : `${change.kind === "add" ? "+" : "−"} ${change.tag}`;

const spoken = (change: Change) =>
  change.kind === "status"
    ? `status ${STATUS[change.to].label}`
    : change.kind === "priority"
      ? `priority ${PRIORITY[change.to].label}`
      : `tag ${change.tag} ${change.kind === "add" ? "added" : "removed"}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]";
const GHOST = cn(BUTTON, "text-ink-2 hover:bg-surface-2 hover:text-foreground");
const SECONDARY = cn(
  BUTTON,
  "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
);

/**
 * A node's height, measured when it arrives and whenever it changes, for a
 * wrapper that animates its own height to it — never a reserved min-height.
 */
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
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/**
 * The flash a changed field gets: a wash that rises and fades behind it and,
 * with motion, a brighter band sweeping across it once. Remounted by key for
 * every change, so two changes in a row flash twice.
 */
function Flash({ ms, motionSafe }: { ms: number; motionSafe: boolean }) {
  const seconds = Math.max(0.2, ms / 1000);
  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--mr-ink)_16%,transparent)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: seconds, times: [0, 0.25, 1], ease: "easeOut" }}
      />
      {motionSafe ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--mr-ink)_30%,transparent),transparent)]"
          initial={{ x: "-100%" }}
          animate={{ x: "100%" }}
          transition={{ duration: seconds * 0.8, ease: easings.move }}
        />
      ) : null}
    </>
  );
}

/** A value that rolls: the old one rises out, the new one rises in on snap. */
function Roll({
  value,
  motionSafe,
  children,
}: {
  value: string;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="relative grid min-w-0 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5"
          initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -distances.step : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function StatusDot({ status }: { status: MacroTicketStatus }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", STATUS[status].dot)}
    />
  );
}

function PriorityBars({ priority }: { priority: MacroPriority }) {
  const { bars } = PRIORITY[priority];
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 4}
          y={8 - i * 3}
          width={2.5}
          height={3 + i * 3}
          rx={0.75}
          className={cn(
            i < bars
              ? priority === "urgent"
                ? "fill-danger"
                : "fill-foreground"
              : "fill-hairline-strong",
          )}
        />
      ))}
    </svg>
  );
}

function Avatar({
  name,
  role,
  size = "md",
}: {
  name: string;
  role: "customer" | "agent";
  size?: "md" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "lg" ? "size-9 text-[12px]" : "size-7 text-[10.5px]",
        role === "agent"
          ? "bg-[color-mix(in_oklab,var(--mr-ink)_16%,transparent)] text-foreground"
          : "bg-surface-2 text-ink-2",
      )}
    >
      {initials(name)}
    </span>
  );
}

/** A native select under a drawn face, so the face can roll and flash. */
function FieldSelect<T extends string>({
  label,
  value,
  options,
  render,
  onChange,
  flashKey,
  marked,
  geo,
  motionSafe,
  flashMs,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly T[];
  render: (value: T) => { text: string; icon: React.ReactNode };
  onChange: (value: T) => void;
  flashKey: number;
  marked: boolean;
  geo: Geometry;
  motionSafe: boolean;
  flashMs: number;
  disabled: boolean;
}) {
  const face = render(value);
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[11px] leading-4 text-ink-3">
        {label}
        <AnimatePresence initial={false}>
          {marked ? (
            <motion.span
              aria-hidden
              title="Set by macro"
              className="size-1.5 rounded-full bg-[var(--mr-ink)]"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
            />
          ) : null}
        </AnimatePresence>
      </span>
      <div
        className={cn(
          "relative flex items-center overflow-hidden rounded-2 border border-input bg-surface-0 pr-7 pl-2.5 text-[12.5px] text-foreground",
          "has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-ring has-[select:focus-visible]:outline-solid",
          geo.field,
          disabled && "opacity-60",
        )}
      >
        {flashKey > 0 ? (
          <Flash key={flashKey} ms={flashMs} motionSafe={motionSafe} />
        ) : null}
        <Roll value={value} motionSafe={motionSafe}>
          {face.icon}
          <span className="truncate">{face.text}</span>
        </Roll>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-2 size-3.5 text-ink-3"
        />
        <select
          aria-label={label}
          value={value}
          aria-disabled={disabled || undefined}
          onChange={(event) => {
            const next = event.currentTarget.value as T;
            if (!disabled) onChange(next);
          }}
          className={cn(
            "absolute inset-0 size-full cursor-pointer appearance-none opacity-0",
            FOCUS,
          )}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {render(option).text}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Conversation                               */
/* ----------------------------------------------------------------------- */

const Conversation = React.memo(function Conversation({
  messages,
  now,
  geo,
  motionSafe,
  agent,
  loading,
  seeded,
}: {
  messages: MacroMessage[];
  now: number;
  geo: Geometry;
  motionSafe: boolean;
  agent: string;
  loading: boolean;
  seeded: number;
}) {
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const shown = React.useRef(0);
  const atBottom = React.useRef(true);

  // The reply box grows as a macro adds chips; a reader at the latest
  // message stays there instead of watching it slide under the box.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // New messages scroll into view; the first paint lands at the bottom
  // without a glide, because a conversation opens on its latest message.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || loading) {
      shown.current = 0;
      return;
    }
    const first = shown.current === 0;
    shown.current = messages.length;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: first || !motionSafe ? "auto" : "smooth",
    });
  }, [messages.length, motionSafe, loading]);

  if (loading)
    return (
      <div className={cn("flex flex-1 flex-col py-4", geo.pad, geo.gap)}>
        {[72, 48, 60].map((w, i) => (
          <div key={i} className="flex gap-2.5">
            <span className="size-7 shrink-0 rounded-full bg-surface-2" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <span className="h-2.5 w-28 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span
                className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${w}%` }}
              />
              <span className="h-2.5 w-2/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const el = event.currentTarget;
        atBottom.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      // Focusable, so the conversation scrolls from the keyboard too.
      tabIndex={0}
      role="group"
      aria-label="Conversation"
      className="flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
    >
      <ol
        aria-label="Messages"
        className={cn("flex flex-col py-4", geo.pad, geo.gap)}
      >
        {messages.map((message, index) => {
          const mine = message.role === "agent";
          const fresh = index >= seeded;
          return (
            <motion.li
              key={message.id}
              className="flex gap-2.5"
              initial={
                fresh
                  ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                  : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? { y: springs.glide, opacity: { duration: durations.base } }
                  : { duration: durations.fast }
              }
            >
              <Avatar name={message.author} role={message.role} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p
                  className={cn(
                    "flex flex-wrap items-baseline gap-x-2 text-ink-3",
                    geo.meta,
                  )}
                >
                  <span className="font-medium text-foreground">
                    {message.author === agent
                      ? `${agent} (you)`
                      : message.author}
                  </span>
                  <span>{ago(now, message.at)}</span>
                </p>
                <div
                  className={cn(
                    "rounded-3 border whitespace-pre-line text-foreground",
                    geo.body,
                    geo.bubble,
                    mine
                      ? "border-[color-mix(in_oklab,var(--mr-ink)_22%,transparent)] bg-[color-mix(in_oklab,var(--mr-ink)_7%,transparent)]"
                      : "border-hairline bg-surface-0",
                  )}
                >
                  {message.text}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
});

/* ----------------------------------------------------------------------- */
/*                                  Sidebar                                 */
/* ----------------------------------------------------------------------- */

const Sidebar = React.memo(function Sidebar({
  customer,
  fields,
  marked,
  flashes,
  geo,
  motionSafe,
  flashMs,
  loading,
  disabled,
  onStatus,
  onPriority,
  onRemoveTag,
}: {
  customer: MacroCustomer;
  fields: MacroFields;
  marked: string[];
  flashes: Record<string, number>;
  geo: Geometry;
  motionSafe: boolean;
  flashMs: number;
  loading: boolean;
  disabled: boolean;
  onStatus: (status: MacroTicketStatus) => void;
  onPriority: (priority: MacroPriority) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const heading =
    "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";
  if (loading)
    return (
      <div className={cn("flex flex-col gap-5 py-4", geo.pad)}>
        <div className="flex items-center gap-3">
          <span className="size-9 rounded-full bg-surface-2" />
          <div className="flex flex-1 flex-col gap-2">
            <span className="h-2.5 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            <span className="h-2.5 w-32 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="h-2 w-12 rounded-full bg-surface-2" />
            <span
              className={cn(
                "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                geo.field,
              )}
            />
          </div>
        ))}
      </div>
    );

  return (
    <div className={cn("flex flex-col gap-5 py-4", geo.pad)}>
      <div className="flex items-center gap-3">
        <Avatar name={customer.name} role="customer" size="lg" />
        <div className="flex min-w-0 flex-col">
          <span
            title={customer.name}
            className="truncate text-[13px] leading-5 font-semibold"
          >
            {customer.name}
          </span>
          <span
            title={customer.email}
            className="truncate text-[11.5px] leading-4 text-ink-3"
          >
            {customer.email}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] leading-4">
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--mr-ink)_14%,transparent)] px-2 font-medium text-foreground">
          {customer.plan}
          {customer.seats ? (
            <span className="text-ink-2">· {customer.seats} seats</span>
          ) : null}
        </span>
        <span className="inline-flex h-6 items-center rounded-full border border-hairline px-2 text-ink-2">
          Since {monthYear(customer.since)}
        </span>
      </div>

      <section className="flex flex-col gap-3" aria-label="Ticket fields">
        <h3 className={heading}>Ticket</h3>
        <FieldSelect
          label="Status"
          value={fields.status}
          options={STATUS_ORDER}
          render={(s) => ({
            text: STATUS[s].label,
            icon: <StatusDot status={s} />,
          })}
          onChange={onStatus}
          flashKey={flashes.status ?? 0}
          marked={marked.includes("status")}
          geo={geo}
          motionSafe={motionSafe}
          flashMs={flashMs}
          disabled={disabled}
        />
        <FieldSelect
          label="Priority"
          value={fields.priority}
          options={PRIORITY_ORDER}
          render={(p) => ({
            text: PRIORITY[p].label,
            icon: <PriorityBars priority={p} />,
          })}
          onChange={onPriority}
          flashKey={flashes.priority ?? 0}
          marked={marked.includes("priority")}
          geo={geo}
          motionSafe={motionSafe}
          flashMs={flashMs}
          disabled={disabled}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] leading-4 text-ink-3">Tags</span>
          <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {fields.tags.map((tag) => {
                const key = `tag:${tag}`;
                const flashKey = flashes[key] ?? 0;
                return (
                  <motion.li
                    key={tag}
                    layout={motionSafe ? "position" : false}
                    className={cn(
                      "relative inline-flex h-6 items-center gap-1 overflow-hidden rounded-full border pr-0.5 pl-2 text-[11.5px] leading-4",
                      marked.includes(key)
                        ? "border-[color-mix(in_oklab,var(--mr-ink)_45%,transparent)] text-foreground"
                        : "border-hairline text-ink-2",
                    )}
                    initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            scale: springs.snap,
                            layout: springs.glide,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    {flashKey > 0 ? (
                      <Flash
                        key={flashKey}
                        ms={flashMs}
                        motionSafe={motionSafe}
                      />
                    ) : null}
                    <span className="relative">{tag}</span>
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      aria-disabled={disabled || undefined}
                      onClick={() => {
                        if (!disabled) onRemoveTag(tag);
                      }}
                      className={cn(
                        "relative inline-flex size-5 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {fields.tags.length === 0 ? (
              <li className="text-[11.5px] leading-6 text-ink-3">No tags</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="Earlier tickets">
        <h3 className={heading}>Earlier tickets</h3>
        <ul className="flex flex-col">
          {customer.history.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 border-t border-hairline py-2 first:border-t-0 first:pt-0"
            >
              <StatusDot status={item.status} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  title={item.subject}
                  className="truncate text-[12px] leading-4 text-foreground"
                >
                  {item.subject}
                </span>
                <span className="font-mono text-[10.5px] leading-4 text-ink-3 tabular-nums">
                  #{item.number} · {STATUS[item.status].label} · {day(item.at)}
                </span>
              </span>
            </li>
          ))}
          {customer.history.length === 0 ? (
            <li className="text-[12px] leading-4 text-ink-3">
              First ticket from {firstName(customer.name)}.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
});

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

type Menu = { query: string; start: number; end: number; active: number };

type Run = {
  controls: AnimationPlaybackControls | null;
  timers: number[];
  final: string;
  caret: number;
  pending: Change[];
  sentence: string;
};

const fieldsOf = (ticket: MacroTicket): MacroFields => ({
  status: ticket.status,
  priority: ticket.priority,
  tags: [...ticket.tags],
});

/** The `#query` the caret is sitting at the end of, if any. */
const macroQuery = (value: string, caret: number) => {
  const before = value.slice(0, caret);
  const match = /(^|\s)#([\p{L}\p{N}-]*)$/u.exec(before);
  if (!match) return null;
  const query = match[2] ?? "";
  return { query, start: caret - query.length - 1, end: caret };
};

const matchesMacro = (macro: MacroDef, query: string) => {
  if (!query) return true;
  const q = query.toLowerCase().replaceAll("-", " ");
  const name = macro.name.toLowerCase();
  return (
    name.includes(q) ||
    name.split(/\s+/).some((word) => word.startsWith(q)) ||
    macro.id.includes(query.toLowerCase())
  );
};

/**
 * An agent's ticket view for a support desk: the conversation, a customer
 * sidebar with plan, fields and earlier tickets, and a reply box. Typing `#`
 * in the reply opens the macros; picking one types its text into the reply
 * at a steady pace (`typeSpeed` characters a second) while each field it
 * changes switches in the sidebar at its own moment — a wash sweeps across
 * the field, the old value rolls out and the new one rises in on
 * `springs.snap`, a dot marks it as set by the macro — and a chip for the
 * change pops into the reply's footer, so nothing changes unseen even when
 * the sidebar is a tab. A hairline along the reply box fills with the typing;
 * any key finishes it at once.
 *
 * Ctrl+Enter (or Cmd+Enter) sends; the sent message rises into the
 * conversation on `springs.glide`. A send whose promise rejects keeps the
 * draft and offers Retry; a closed ticket swaps the reply box for Reopen;
 * loading draws skeletons in the same boxes. Under reduced motion the text
 * arrives in one step and the fields swap under a fading wash; every change
 * is still shown and announced.
 */
export function MacroReply({
  ref,
  sidebarSide = "right",
  density = "cozy",
  accent = "cobalt",
  ticket = defaultMacroTicket,
  customer = defaultMacroCustomer,
  macros = defaultMacros,
  agent = "Theo",
  now = defaultMacroNow,
  status = "ready",
  onApplyMacro,
  onSend,
  onStatusChange,
  onFieldsChange,
  typeSpeed = 90,
  flash = 640,
  height = 540,
  placeholder,
  disabled = false,
  className,
}: MacroReplyProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-macros`;
  const geo = DENSITY[density] ?? DENSITY.cozy;
  const loading = status === "loading";
  const first = firstName(customer.name);

  /* ------------------------------- state -------------------------------- */

  const [fields, setFields] = React.useState<MacroFields>(() =>
    fieldsOf(ticket),
  );
  const [messages, setMessages] = React.useState<MacroMessage[]>(
    ticket.messages,
  );
  const [seenTicket, setSeenTicket] = React.useState(ticket);
  const [draft, setDraft] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const [menu, setMenu] = React.useState<Menu | null>(null);
  const [flashes, setFlashes] = React.useState<Record<string, number>>({});
  const [marked, setMarked] = React.useState<string[]>([]);
  const [chips, setChips] = React.useState<Change[]>([]);
  const [lastMacro, setLastMacro] = React.useState<string | null>(null);
  const [sendState, setSendState] = React.useState<
    "idle" | "sending" | "failed"
  >("idle");
  const [tab, setTab] = React.useState<"conversation" | "customer">(
    "conversation",
  );
  const [narrow, setNarrow] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  // A different ticket starts the view over. The same ticket with fields the
  // host changed takes them, and they flash like a macro's would, because a
  // field that changes unseen is the thing this view exists to prevent.
  if (seenTicket !== ticket) {
    setSeenTicket(ticket);
    if (ticket.id !== seenTicket.id) {
      setFields(fieldsOf(ticket));
      setMessages(ticket.messages);
      setDraft("");
      setTyping(false);
      setMenu(null);
      setMarked([]);
      setChips([]);
      setFlashes({});
      setLastMacro(null);
      setSendState("idle");
    } else {
      const moved: string[] = [];
      if (
        ticket.status !== seenTicket.status &&
        ticket.status !== fields.status
      )
        moved.push("status");
      if (
        ticket.priority !== seenTicket.priority &&
        ticket.priority !== fields.priority
      )
        moved.push("priority");
      const tagsMoved =
        ticket.tags.join("|") !== seenTicket.tags.join("|") &&
        ticket.tags.join("|") !== fields.tags.join("|");
      if (tagsMoved)
        for (const tag of ticket.tags)
          if (!fields.tags.includes(tag)) moved.push(`tag:${tag}`);
      if (moved.length || tagsMoved) {
        setFields({
          status: moved.includes("status") ? ticket.status : fields.status,
          priority: moved.includes("priority")
            ? ticket.priority
            : fields.priority,
          tags: tagsMoved ? [...ticket.tags] : fields.tags,
        });
        setFlashes((f) => {
          const next = { ...f };
          for (const key of moved) next[key] = (next[key] ?? 0) + 1;
          return next;
        });
      }
      if (ticket.messages !== seenTicket.messages) setMessages(ticket.messages);
    }
  }

  const fieldsRef = React.useRef(fields);
  const draftRef = React.useRef(draft);
  const run = React.useRef<Run | null>(null);
  const caretRef = React.useRef<number | null>(null);
  const live = React.useRef({ onStatusChange, onFieldsChange, onApplyMacro });
  React.useEffect(() => {
    live.current = { onStatusChange, onFieldsChange, onApplyMacro };
  });
  React.useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // A running macro is stopped where it stands when the ticket changes or the
  // surface goes away; its timers must not write into a different ticket.
  React.useEffect(() => {
    return () => {
      const r = run.current;
      run.current = null;
      r?.controls?.stop();
      for (const t of r?.timers ?? []) window.clearTimeout(t);
    };
  }, [ticket.id]);

  const typed = useMotionValue(0);
  const [textarea, setTextarea] = React.useState<HTMLTextAreaElement | null>(
    null,
  );
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const bindTextarea = React.useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    setTextarea(node);
  }, []);

  /* ------------------------------ fields -------------------------------- */

  const commitFields = (next: MacroFields) => {
    fieldsRef.current = next;
    setFields(next);
    live.current.onFieldsChange?.(next);
  };

  const flashField = (key: string) =>
    setFlashes((f) => ({ ...f, [key]: (f[key] ?? 0) + 1 }));

  const applyChange = (change: Change) => {
    const f = fieldsRef.current;
    const next: MacroFields =
      change.kind === "status"
        ? { ...f, status: change.to }
        : change.kind === "priority"
          ? { ...f, priority: change.to }
          : change.kind === "add"
            ? f.tags.includes(change.tag)
              ? f
              : { ...f, tags: [...f.tags, change.tag] }
            : { ...f, tags: f.tags.filter((t) => t !== change.tag) };
    commitFields(next);
    flashField(change.key);
    if (change.kind !== "remove")
      setMarked((m) => (m.includes(change.key) ? m : [...m, change.key]));
    else setMarked((m) => m.filter((k) => k !== change.key));
    setChips((list) => [...list.filter((c) => c.key !== change.key), change]);
    if (change.kind === "status")
      live.current.onStatusChange?.(change.to, "macro");
  };

  const setStatusField = (
    next: MacroTicketStatus,
    source: MacroStatusSource,
  ) => {
    if (next === fieldsRef.current.status) return;
    commitFields({ ...fieldsRef.current, status: next });
    flashField("status");
    setMarked((m) => m.filter((k) => k !== "status"));
    setChips((list) => list.filter((c) => c.key !== "status"));
    live.current.onStatusChange?.(next, source);
    setAnnouncement(`Status set to ${STATUS[next].label}.`);
  };

  /* ------------------------------ typing -------------------------------- */

  const finishTyping = () => {
    const r = run.current;
    if (!r) return;
    run.current = null;
    r.controls?.stop();
    for (const t of r.timers) window.clearTimeout(t);
    for (const change of r.pending) applyChange(change);
    draftRef.current = r.final;
    caretRef.current = r.caret;
    setDraft(r.final);
    setTyping(false);
    typed.jump(1);
    setAnnouncement(r.sentence);
  };

  const applyMacro = (
    macro: MacroDef,
    range?: { start: number; end: number },
  ) => {
    if (disabled || loading || fieldsRef.current.status === "closed") return;
    finishTyping();
    const current = draftRef.current;
    const start = range?.start ?? current.length;
    const end = range?.end ?? current.length;
    let prefix = current.slice(0, start);
    const suffix = current.slice(end);
    if (prefix && !/\s$/.test(prefix)) prefix += "\n\n";
    const text = fill(macro.text, { first, agent, number: ticket.number });
    const changes = changesFor(fieldsRef.current, macro);
    const sentence = `${macro.name} applied${
      changes.length ? `: ${changes.map(spoken).join(", ")}.` : "."
    }`;
    setMenu(null);
    setLastMacro(macro.id);
    setSendState((s) => (s === "failed" ? "idle" : s));
    live.current.onApplyMacro?.(macro);
    const r: Run = {
      controls: null,
      timers: [],
      final: prefix + text + suffix,
      caret: (prefix + text).length,
      pending: [...changes],
      sentence,
    };
    run.current = r;
    if (!motionSafe) {
      finishTyping();
      return;
    }
    // A steady pace: one linear tween over the characters, written to the
    // draft only when the count changes, so the reply types rather than
    // fades. The fields switch at their own moments through it.
    setTyping(true);
    typed.jump(0);
    const duration = Math.min(
      9,
      Math.max(0.3, text.length / Math.max(10, typeSpeed)),
    );
    let last = -1;
    r.controls = animate(0, text.length, {
      duration,
      ease: "linear",
      onUpdate: (v) => {
        if (run.current !== r) return;
        const n = Math.round(v);
        if (n === last) return;
        last = n;
        const next = prefix + text.slice(0, n) + suffix;
        draftRef.current = next;
        setDraft(next);
        typed.set(Number((n / Math.max(1, text.length)).toFixed(4)));
        const el = textareaRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      },
      onComplete: () => {
        if (run.current === r) finishTyping();
      },
    });
    changes.forEach((change, i) => {
      const at =
        changes.length === 1 ? 0.3 : 0.15 + (0.7 * i) / (changes.length - 1);
      r.timers.push(
        window.setTimeout(
          () => {
            if (run.current !== r) return;
            r.pending = r.pending.filter((c) => c !== change);
            applyChange(change);
          },
          Math.round(duration * at * 1000),
        ),
      );
    });
  };

  // The caret goes to the end of what the macro wrote, once React has
  // written it — only when the reply box has focus, so a macro applied from
  // elsewhere never pulls focus.
  React.useEffect(() => {
    const at = caretRef.current;
    if (at === null || !textarea) return;
    caretRef.current = null;
    if (document.activeElement === textarea) textarea.setSelectionRange(at, at);
  }, [draft, textarea]);

  const applyRef = React.useRef(applyMacro);
  React.useEffect(() => {
    applyRef.current = applyMacro;
  });
  React.useImperativeHandle(
    ref,
    () => ({
      applyMacro: (id: string) => {
        const macro = macros.find((m) => m.id === id);
        if (macro) applyRef.current(macro);
      },
      focusReply: () => textareaRef.current?.focus(),
    }),
    [macros],
  );

  /* ------------------------------- send --------------------------------- */

  const closed = fields.status === "closed";
  const sending = sendState === "sending";
  const canSend =
    !disabled && !loading && !closed && !sending && draft.trim().length > 0;

  const send = () => {
    finishTyping();
    const text = draftRef.current.trim();
    if (!text || disabled || loading || closed || sendState === "sending")
      return;
    const reply: MacroOutgoing = {
      text,
      fields: fieldsRef.current,
      macroId: lastMacro,
    };
    const statusLabel = STATUS[fieldsRef.current.status].label;
    const land = () => {
      setMessages((list) => [
        ...list,
        {
          id: `${uid}-sent-${list.length}`,
          role: "agent",
          author: agent,
          at: now,
          text,
        },
      ]);
      draftRef.current = "";
      setDraft("");
      setMarked([]);
      setChips([]);
      setLastMacro(null);
      setSendState("idle");
      setAnnouncement(`Reply sent to ${first}. Status ${statusLabel}.`);
    };
    const result = onSend?.(reply);
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

  /* ------------------------------- menu --------------------------------- */

  const filtered = menu
    ? macros.filter((m) => matchesMacro(m, menu.query)).slice(0, 6)
    : [];
  const active = menu ? Math.min(menu.active, filtered.length - 1) : -1;
  const menuOpen = menu !== null && filtered.length > 0;
  const activeMacro = active >= 0 ? filtered[active] : undefined;

  const syncMenu = (value: string, caret: number) => {
    const found = macroQuery(value, caret);
    setMenu((prev) => {
      if (!found) return null;
      if (prev && prev.start === found.start && prev.query === found.query)
        return prev;
      return { ...found, active: 0 };
    });
  };

  const openMacros = () => {
    const el = textareaRef.current;
    if (!el || disabled || loading || closed) return;
    finishTyping();
    const value = draftRef.current;
    const caret =
      el === document.activeElement ? el.selectionStart : value.length;
    const before = value.slice(0, caret);
    const insert = before && !/\s$/.test(before) ? " #" : "#";
    const next = before + insert + value.slice(caret);
    const at = caret + insert.length;
    draftRef.current = next;
    caretRef.current = at;
    setDraft(next);
    setMenu({ query: "", start: at - 1, end: at, active: 0 });
    el.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (run.current) {
      // Any key finishes the macro where it stands; Tab still leaves.
      if (["Tab", "Shift", "Control", "Alt", "Meta"].includes(event.key))
        return;
      event.preventDefault();
      finishTyping();
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
      return;
    }
    if (!menu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(null);
      return;
    }
    if (!menuOpen) return;
    const count = filtered.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setMenu({ ...menu, active: (active + step + count) % count });
    } else if (
      (event.key === "Enter" && !event.shiftKey) ||
      (event.key === "Tab" && !event.shiftKey)
    ) {
      if (!activeMacro) return;
      event.preventDefault();
      applyMacro(activeMacro, { start: menu.start, end: menu.end });
    }
  };

  /* ------------------------------ reopen -------------------------------- */

  const wantFocus = React.useRef(false);
  React.useEffect(() => {
    if (!textarea || !wantFocus.current || !textarea.isConnected) return;
    wantFocus.current = false;
    textarea.focus();
  }, [textarea]);

  const reopen = () => {
    if (disabled || loading) return;
    wantFocus.current = true;
    setStatusField("open", "reopen");
    setAnnouncement(`Ticket reopened. Status Open.`);
  };

  /* ------------------------------ layout -------------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < 576);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [bindFail, failHeight] = useMeasured();
  const [bindChips, chipsHeight] = useMeasured();

  const tabs: { id: "conversation" | "customer"; label: string }[] =
    sidebarSide === "left"
      ? [
          { id: "customer", label: "Customer" },
          { id: "conversation", label: "Conversation" },
        ]
      : [
          { id: "conversation", label: "Conversation" },
          { id: "customer", label: "Customer" },
        ];
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((t) => t.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    setTab(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  const accentVars = (ACCENT[accent] ?? ACCENT.cobalt) as React.CSSProperties;
  const statusFace = STATUS[fields.status];
  const convPanelId = `${uid}-conv`;
  const custPanelId = `${uid}-cust`;
  const seeded = ticket.messages.length;
  const unsent = marked.length;

  const setStatusFieldRef = React.useRef(setStatusField);
  React.useEffect(() => {
    setStatusFieldRef.current = setStatusField;
  });
  const onSidebarStatus = React.useCallback(
    (next: MacroTicketStatus) => setStatusFieldRef.current(next, "field"),
    [],
  );
  const fieldActions = React.useRef({
    priority: (next: MacroPriority) => {
      void next;
    },
    removeTag: (tag: string) => {
      void tag;
    },
  });
  React.useEffect(() => {
    fieldActions.current = {
      priority: (next) => {
        if (next === fieldsRef.current.priority) return;
        commitFields({ ...fieldsRef.current, priority: next });
        flashField("priority");
        setMarked((m) => m.filter((k) => k !== "priority"));
        setChips((list) => list.filter((c) => c.key !== "priority"));
        setAnnouncement(`Priority set to ${PRIORITY[next].label}.`);
      },
      removeTag: (tag) => {
        commitFields({
          ...fieldsRef.current,
          tags: fieldsRef.current.tags.filter((t) => t !== tag),
        });
        setMarked((m) => m.filter((k) => k !== `tag:${tag}`));
        setChips((list) => list.filter((c) => c.key !== `tag:${tag}`));
        setAnnouncement(`Tag ${tag} removed.`);
      },
    };
  });
  const onSidebarPriority = React.useCallback(
    (next: MacroPriority) => fieldActions.current.priority(next),
    [],
  );
  const onSidebarRemoveTag = React.useCallback(
    (tag: string) => fieldActions.current.removeTag(tag),
    [],
  );

  const conversationPanel = (
    <div
      id={convPanelId}
      role={narrow ? "tabpanel" : "region"}
      aria-labelledby={narrow ? `${uid}-tab-conversation` : undefined}
      aria-label={narrow ? undefined : "Conversation and reply"}
      className={cn(
        "relative min-w-0 flex-1 flex-col overflow-hidden",
        tab === "customer" ? "hidden @min-[36rem]/macro-reply:flex" : "flex",
      )}
    >
      <Conversation
        messages={messages}
        now={now}
        geo={geo}
        motionSafe={motionSafe}
        agent={agent}
        loading={loading}
        seeded={seeded}
      />

      {/* The reply. */}
      <div
        className={cn(
          "relative shrink-0 border-t border-hairline py-3",
          geo.pad,
        )}
      >
        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              key="menu"
              className="absolute inset-x-3 bottom-full z-20 mb-1.5 overflow-hidden rounded-3 border border-hairline-strong bg-popover shadow-lg"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <p className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span>Macros{menu?.query ? ` · #${menu.query}` : ""}</span>
                <span aria-hidden>↑↓ · enter</span>
              </p>
              <LayoutGroup id={`${uid}-menu`}>
                <ul
                  role="listbox"
                  id={listId}
                  aria-label="Macros"
                  className="max-h-52 overflow-y-auto p-1"
                >
                  {filtered.map((macro, i) => {
                    const selected = i === active;
                    const preview = fill(
                      (macro.text.split("\n\n")[1] ?? macro.text).split(
                        "\n",
                      )[0] ?? "",
                      { first, agent, number: ticket.number },
                    );
                    const sets = changesFor(fields, macro);
                    return (
                      <li
                        key={macro.id}
                        id={`${uid}-opt-${macro.id}`}
                        role="option"
                        aria-selected={selected}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => {
                          if (menu && !selected)
                            setMenu({ ...menu, active: i });
                        }}
                        onClick={() =>
                          menu &&
                          applyMacro(macro, {
                            start: menu.start,
                            end: menu.end,
                          })
                        }
                        className="relative flex cursor-pointer flex-col gap-0.5 rounded-2 px-2.5 py-2"
                      >
                        {selected ? (
                          <motion.span
                            layoutId={`${uid}-active`}
                            aria-hidden
                            className="absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--mr-ink)_13%,transparent)]"
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          />
                        ) : null}
                        <span className="relative flex items-center gap-1.5 text-[12.5px] leading-5 font-medium text-foreground">
                          <Hash
                            aria-hidden
                            className="size-3.5 shrink-0 text-[var(--mr-ink)]"
                          />
                          <span className="truncate">{macro.name}</span>
                        </span>
                        <span className="relative truncate pl-5 text-[11.5px] leading-4 text-ink-3">
                          {preview}
                        </span>
                        {sets.length ? (
                          <span className="relative flex flex-wrap gap-1 pt-0.5 pl-5">
                            {sets.map((c) => (
                              <span
                                key={c.key}
                                className="inline-flex h-5 items-center rounded-full border border-hairline px-1.5 font-mono text-[10px] text-ink-2"
                              >
                                {chipLabel(c)}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </LayoutGroup>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          aria-hidden={sendState !== "failed"}
          className="overflow-hidden"
          initial={false}
          animate={{
            height: sendState === "failed" ? failHeight : 0,
            opacity: sendState === "failed" ? 1 : 0,
          }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <div ref={bindFail} className="pb-2">
            <div className="flex flex-wrap items-center gap-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-2.5 py-1.5">
              <CircleAlert
                aria-hidden
                className="size-4 shrink-0 text-danger"
              />
              <span className="min-w-0 flex-1 text-[12px] leading-4 text-foreground">
                Couldn&apos;t send. Your reply is still here.
              </span>
              <button
                type="button"
                tabIndex={sendState === "failed" ? 0 : -1}
                onClick={send}
                className={cn(GHOST, FOCUS, "h-7 px-2")}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            </div>
          </div>
        </motion.div>

        {closed && !loading ? (
          <div className="flex flex-wrap items-center gap-3 rounded-3 border border-dashed border-hairline-strong bg-surface-1 px-3 py-3">
            <Lock aria-hidden className="size-4 shrink-0 text-ink-3" />
            <p className={cn("min-w-0 flex-1 basis-40 text-ink-2", geo.body)}>
              This ticket is closed. Reopen it to reply to {first}.
            </p>
            <button
              type="button"
              onClick={reopen}
              aria-disabled={disabled || undefined}
              className={cn(SECONDARY, FOCUS)}
            >
              Reopen ticket
            </button>
          </div>
        ) : (
          <div
            className={cn(
              "relative overflow-hidden rounded-3 border bg-surface-0 transition-colors has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:-outline-offset-1 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
              sendState === "failed"
                ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
                : "border-input focus-within:border-[color-mix(in_oklab,var(--mr-ink)_55%,transparent)]",
            )}
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[var(--mr-ink)]"
              style={{ scaleX: typed, originX: 0 }}
              initial={false}
              animate={{ opacity: typing ? 1 : 0 }}
              transition={{
                duration: typing ? durations.fast : durations.slow,
                ease: easings.enter,
              }}
            />
            <label htmlFor={`${uid}-reply`} className="sr-only">
              Reply to {customer.name}
            </label>
            <textarea
              ref={bindTextarea}
              id={`${uid}-reply`}
              rows={geo.rows}
              value={draft}
              readOnly={typing || disabled || loading}
              aria-busy={typing || undefined}
              aria-disabled={disabled || loading || undefined}
              role="combobox"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? listId : undefined}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-activedescendant={
                menuOpen && activeMacro
                  ? `${uid}-opt-${activeMacro.id}`
                  : undefined
              }
              aria-describedby={`${uid}-hint`}
              placeholder={
                loading
                  ? "Loading the ticket…"
                  : (placeholder ?? `Reply to ${first}…  Type # for macros`)
              }
              onChange={(event) => {
                const value = event.currentTarget.value;
                const caret = event.currentTarget.selectionStart;
                draftRef.current = value;
                setDraft(value);
                syncMenu(value, caret);
              }}
              onSelect={(event) => {
                if (run.current) return;
                const el = event.currentTarget;
                syncMenu(el.value, el.selectionStart);
              }}
              onBlur={() => setMenu(null)}
              onKeyDown={onKeyDown}
              className={cn(
                "block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-foreground outline-none placeholder:text-ink-3",
                geo.body,
                typing && "caret-transparent",
              )}
            />
            <motion.div
              className="overflow-hidden"
              initial={false}
              animate={{ height: chips.length ? chipsHeight : 0 }}
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            >
              <div
                ref={bindChips}
                className="flex items-start gap-2 px-3 pt-0.5 pb-1.5"
              >
                <span className="shrink-0 font-mono text-[10px] leading-6 tracking-[0.08em] text-ink-3 uppercase">
                  Sets
                </span>
                <ul
                  aria-label="Changes this reply makes"
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
                >
                  <AnimatePresence initial={false}>
                    {chips.map((chip) => (
                      <motion.li
                        key={chip.key}
                        className="inline-flex h-6 items-center rounded-full bg-[color-mix(in_oklab,var(--mr-ink)_14%,transparent)] px-2 font-mono text-[10.5px] whitespace-nowrap text-foreground"
                        initial={{ opacity: 0, scale: motionSafe ? 0.85 : 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                scale: springs.snap,
                                opacity: { duration: durations.fast },
                              }
                            : { duration: durations.fast }
                        }
                      >
                        {chipLabel(chip)}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            </motion.div>
            <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
              <button
                type="button"
                aria-label="Insert a macro"
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                aria-disabled={disabled || loading || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={openMacros}
                className={cn(GHOST, FOCUS, "h-7 gap-1 px-2")}
              >
                <Hash aria-hidden className="size-3.5" />
                <span className="hidden @min-[24rem]/macro-reply:inline">
                  Macros
                </span>
              </button>
              <span
                id={`${uid}-hint`}
                className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-ink-3"
              >
                <span className="hidden @min-[22rem]/macro-reply:inline">
                  {typing ? "any key finishes" : "ctrl ↵ sends"}
                </span>
              </span>
              <button
                type="button"
                onClick={send}
                aria-disabled={!canSend || undefined}
                aria-busy={sending || undefined}
                aria-label={`Send as ${statusFace.label}`}
                className={cn(
                  BUTTON,
                  FOCUS,
                  "h-7 bg-[var(--mr-fill)] px-2.5 text-[var(--mr-on)] hover:bg-[color-mix(in_oklab,var(--mr-fill)_88%,var(--foreground))]",
                  !canSend && !sending && "opacity-50",
                )}
              >
                <SendHorizontal aria-hidden className="size-3.5" />
                <span
                  aria-hidden
                  className="inline-flex items-center whitespace-pre"
                >
                  {sending ? "Sending…" : "Send"}
                  {sending ? null : (
                    <span className="hidden items-center whitespace-pre @min-[36rem]/macro-reply:inline-flex">
                      {" as "}
                      <Roll value={fields.status} motionSafe={motionSafe}>
                        {statusFace.label}
                      </Roll>
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const sidebarPanel = (
    <motion.aside
      layoutScroll
      id={custPanelId}
      role={narrow ? "tabpanel" : "complementary"}
      aria-labelledby={narrow ? `${uid}-tab-customer` : undefined}
      aria-label={narrow ? undefined : "Customer"}
      className={cn(
        "flex-col overflow-y-auto overscroll-contain border-hairline bg-surface-1 @min-[36rem]/macro-reply:w-60 @min-[36rem]/macro-reply:shrink-0 @min-[75rem]/macro-reply:w-68",
        sidebarSide === "left"
          ? "@min-[36rem]/macro-reply:border-r"
          : "@min-[36rem]/macro-reply:border-l",
        tab === "customer"
          ? "flex flex-1 @min-[36rem]/macro-reply:flex-none"
          : "hidden @min-[36rem]/macro-reply:flex",
      )}
    >
      <Sidebar
        customer={customer}
        fields={fields}
        marked={marked}
        flashes={flashes}
        geo={geo}
        motionSafe={motionSafe}
        flashMs={flash}
        loading={loading}
        disabled={disabled}
        onStatus={onSidebarStatus}
        onPriority={onSidebarPriority}
        onRemoveTag={onSidebarRemoveTag}
      />
    </motion.aside>
  );

  return (
    <section
      ref={rootRef}
      aria-label={`Ticket #${ticket.number}: ${ticket.subject}`}
      aria-busy={loading || undefined}
      className={cn(
        "@container/macro-reply relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...accentVars, height }}
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-hairline py-3",
          geo.pad,
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {loading ? (
            <>
              <span className="my-1 h-3 w-3/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span className="my-1 h-2.5 w-2/5 rounded-full bg-surface-2" />
            </>
          ) : (
            <>
              <h2
                title={ticket.subject}
                className="truncate text-[14.5px] leading-5 font-semibold"
              >
                {ticket.subject}
              </h2>
              <p className="truncate font-mono text-[11px] leading-4 text-ink-3 tabular-nums">
                #{ticket.number} · {ticket.channel} · {customer.name}
              </p>
            </>
          )}
        </div>
        {loading ? (
          <span className="h-7 w-20 shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        ) : (
          <span
            className="relative inline-flex h-7 shrink-0 items-center overflow-hidden rounded-full border border-hairline bg-surface-1 px-2.5 text-[12px] font-medium"
            aria-label={`Status ${statusFace.label}`}
            role="img"
          >
            {(flashes.status ?? 0) > 0 ? (
              <Flash key={flashes.status} ms={flash} motionSafe={motionSafe} />
            ) : null}
            <Roll value={fields.status} motionSafe={motionSafe}>
              <StatusDot status={fields.status} />
              {statusFace.label}
            </Roll>
          </span>
        )}
      </header>

      <LayoutGroup id={`${uid}-tabs`}>
        <div
          role="tablist"
          aria-label="Ticket view"
          className={cn(
            "flex shrink-0 gap-1 border-b border-hairline py-1.5 @min-[36rem]/macro-reply:hidden",
            geo.pad,
          )}
        >
          {tabs.map((t) => {
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(node) => {
                  tabRefs.current.set(t.id, node);
                }}
                type="button"
                role="tab"
                id={`${uid}-tab-${t.id}`}
                aria-selected={selected}
                aria-controls={t.id === "customer" ? custPanelId : convPanelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={onTabKey}
                className={cn(
                  "relative inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-2 px-2 text-[12px] font-medium",
                  selected ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                  FOCUS,
                )}
              >
                {selected ? (
                  <motion.span
                    layoutId={`${uid}-tab-pill`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 bg-surface-2"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">{t.label}</span>
                {t.id === "customer" && unsent > 0 ? (
                  <motion.span
                    key={unsent}
                    className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--mr-fill)] px-1 font-mono text-[9.5px] text-[var(--mr-on)] tabular-nums"
                    aria-label={`${unsent} ${unsent === 1 ? "field" : "fields"} set by macro`}
                    initial={{ scale: motionSafe ? 0.6 : 1 }}
                    animate={{ scale: 1 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    {unsent}
                  </motion.span>
                ) : null}
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div
        className={cn(
          "flex flex-1 overflow-hidden",
          sidebarSide === "left" && "flex-row-reverse",
        )}
      >
        {conversationPanel}
        {sidebarPanel}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
