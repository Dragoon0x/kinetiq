"use client";

import * as React from "react";

import {
  AlarmClock,
  Archive,
  Check,
  Clock,
  Inbox,
  Mail,
  MailOpen,
  Minus,
  Paperclip,
  PenSquare,
  Reply,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MailFolder = "inbox" | "snoozed" | "archive";
/** What a swipe can do: send the thread to the archive, or snooze it. */
export type MailAction = "archive" | "snooze";
/** How a swipe commits: past a line, resting open on its action, or not at all. */
export type MailSwipe = "full" | "reveal" | "off";
export type MailDensity = "compact" | "cozy" | "roomy";
export type MailInboxStatus = "ready" | "loading" | "error";

export type MailPerson = { name: string; email?: string };

export type MailMessage = {
  id: string;
  from: MailPerson;
  /** When it arrived, epoch ms. */
  at: number;
  /** Plain text; a blank line starts a new paragraph. */
  body: string;
};

export type MailThread = {
  id: string;
  subject: string;
  /** Oldest first. The row shows the latest. */
  messages: MailMessage[];
  folder: MailFolder;
  unread?: boolean;
  starred?: boolean;
  labels?: string[];
  /** How many files the thread carries. */
  attachments?: number;
  /** When a snoozed thread comes back, epoch ms. */
  snoozedUntil?: number;
};

export type MailInboxProps = {
  /** How a swipe commits: "full" past 42% of the row, "reveal" rests open on its action (a long swipe still commits), "off" leaves the hover tools and keys. @default "full" */
  swipe?: MailSwipe;
  /** Row height and type size: single-line compact rows, cozy, or roomy with larger avatars. @default "cozy" */
  density?: MailDensity;
  /** Lines of message preview under the subject, 0 to 2. @default 1 */
  preview?: number;
  /** Controlled threads, every folder. */
  threads?: MailThread[];
  /** Initial threads when uncontrolled. @default defaultMailThreads */
  defaultThreads?: MailThread[];
  /** Fires from the swipe, key or button that changed the threads, with all of them. */
  onThreadsChange?: (threads: MailThread[]) => void;
  /** Controlled folder on screen. */
  folder?: MailFolder;
  /** Initial folder when uncontrolled. @default "inbox" */
  defaultFolder?: MailFolder;
  onFolderChange?: (folder: MailFolder) => void;
  /** Controlled selection, thread ids. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultSelected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Controlled open thread: expanded under its row, or in the reading pane when the inbox is wide. */
  open?: string | null;
  /** Initial open thread when uncontrolled. @default null */
  defaultOpen?: string | null;
  onOpenChange?: (id: string | null) => void;
  /** Which action each swipe direction runs. @default { right: "archive", left: "snooze" } */
  swipeActions?: { right: MailAction | null; left: MailAction | null };
  /** The moment the inbox reads times against. @default defaultMailNow */
  now?: Date | number;
  /** Minutes east of UTC that times are shown in, so server and browser agree. @default 0 */
  zoneOffset?: number;
  /** When a snooze ends, from now (epoch ms in, epoch ms out). @default the next day at 08:00 */
  snoozeUntil?: (now: number) => number;
  /** Whose inbox it is: their messages read as "me". */
  account?: MailPerson;
  /** The inbox's accessible name. @default "Mail" */
  label?: string;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: MailInboxStatus;
  onRetry?: () => void;
  /** Threads sent to the archive. */
  onArchive?: (ids: string[]) => void;
  /** Threads snoozed, and until when. */
  onSnooze?: (ids: string[], until: number) => void;
  /** Threads moved back to the inbox from the archive or a snooze. */
  onRestore?: (ids: string[]) => void;
  /** Threads marked read (false) or unread (true), by opening them or by `u`. */
  onReadChange?: (ids: string[], unread: boolean) => void;
  onStarChange?: (id: string, starred: boolean) => void;
  /** Reply was pressed on an open thread. */
  onReply?: (threadId: string) => void;
  /** Compose was pressed on the rail. */
  onCompose?: () => void;
  /** The last archive or snooze was undone. */
  onUndo?: (ids: string[]) => void;
  /** Play the swipes, picks and stars. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Time, without the machine's clock or locale                          */
/* ------------------------------------------------------------------ */

const MIN = 60_000;
const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

const pad2 = (n: number) => String(n).padStart(2, "0");
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const local = (ms: number, offset: number) => new Date(ms + offset * MIN);
const dayOf = (ms: number, offset: number) =>
  Math.floor((ms + offset * MIN) / DAY);
const clockOf = (ms: number, offset: number) => {
  const d = local(ms, offset);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
const dateOf = (ms: number, offset: number) => {
  const d = local(ms, offset);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

/** A row's time: the clock today, then Yesterday, a weekday, a date. */
function whenOf(ms: number, now: number, offset: number): string {
  const days = dayOf(now, offset) - dayOf(ms, offset);
  if (days <= 0) return clockOf(ms, offset);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[local(ms, offset).getUTCDay()] ?? "";
  return dateOf(ms, offset);
}

/** A snooze's end: "Tomorrow 08:00", "Mon 08:00", "12 Oct 08:00". */
function untilOf(ms: number, now: number, offset: number): string {
  const days = dayOf(ms, offset) - dayOf(now, offset);
  const clock = clockOf(ms, offset);
  if (days <= 0) return clock;
  if (days === 1) return `Tomorrow ${clock}`;
  if (days < 7)
    return `${WEEKDAYS[local(ms, offset).getUTCDay()] ?? ""} ${clock}`;
  return `${dateOf(ms, offset)} ${clock}`;
}

const nextMorning = (now: number, offset: number) =>
  (dayOf(now, offset) + 1) * DAY - offset * MIN + 8 * 60 * MIN;

/* ------------------------------------------------------------------ */
/* Defaults: Fieldline operations, Friday 2 October 2026                */
/* ------------------------------------------------------------------ */

/** Friday 2 October 2026, 09:41 UTC — the moment the default inbox is read at. */
export const defaultMailNow = Date.UTC(2026, 9, 2, 9, 41);

const at = (day: number, h: number, m: number) => Date.UTC(2026, 8, day, h, m);

const ME: MailPerson = {
  name: "Noor Halvorsen",
  email: "noor@fieldline.example",
};
const LINA = { name: "Lina Moreau", email: "lina@basinworks.example" };
const TOBIAS = { name: "Tobias Lindgren", email: "tobias@fernworks.example" };
const PRIYA = { name: "Priya Raman", email: "priya@fieldline.example" };
const JONAH = { name: "Jonah Abernathy", email: "jonah@basinworks.example" };
const DISPATCH = {
  name: "Fieldline Dispatch",
  email: "dispatch@fieldline.example",
};

export const defaultMailThreads: MailThread[] = [
  {
    id: "manifest",
    subject: "Q4 freight manifest: two pallets short",
    folder: "inbox",
    unread: true,
    labels: ["Freight"],
    attachments: 1,
    messages: [
      {
        id: "manifest-1",
        from: LINA,
        at: at(31, 16, 20),
        body: "Noor, the Q4 manifest for the Rotterdam run lists 42 pallets, but the dock count this morning was 40. Can you check whether PO 8817 was split across two trucks?",
      },
      {
        id: "manifest-2",
        from: ME,
        at: at(31, 17, 5),
        body: "Checking with the yard now. If it was split, the second truck left on Tuesday.",
      },
      {
        id: "manifest-3",
        from: LINA,
        at: at(32, 9, 12),
        body: "Found it: two pallets went out on truck 14 with the Coldbrook order.\n\nThe corrected manifest is attached. Sign it off before 15:00 and we release the invoice today.",
      },
    ],
  },
  {
    id: "payout",
    subject: "Payout sent: WAY-20417",
    folder: "inbox",
    unread: true,
    labels: ["Finance"],
    messages: [
      {
        id: "payout-1",
        from: { name: "Waylight Pay", email: "payouts@waylight.example" },
        at: at(32, 8, 30),
        body: "Your payout of 12,480.00 to Coldbrook Bank ending 4471 is on its way. It should arrive by Monday 5 October.\n\nReference WAY-20417 covers 38 settled orders.",
      },
    ],
  },
  {
    id: "route",
    subject: "Route 14 is running 40 minutes late",
    folder: "inbox",
    labels: ["Freight"],
    messages: [
      {
        id: "route-1",
        from: DISPATCH,
        at: at(32, 7, 2),
        body: "Truck 14 is held at the Basinworks gate for a seal check. New arrival at the Coldbrook dock: 11:20.",
      },
      {
        id: "route-2",
        from: ME,
        at: at(32, 7, 15),
        body: "Thanks. I have moved the unloading crew to 11:15 and told the dock.",
      },
    ],
  },
  {
    id: "export",
    subject: "Your September fleet export is ready",
    folder: "inbox",
    unread: true,
    attachments: 1,
    messages: [
      {
        id: "export-1",
        from: { name: "Gaugeworks", email: "exports@gaugeworks.example" },
        at: at(32, 6, 2),
        body: "The September fleet report (CSV, 2.1 MB) finished at 06:02. The download link works for seven days.",
      },
    ],
  },
  {
    id: "review",
    subject: "Design review moved to Thursday",
    folder: "inbox",
    labels: ["Design"],
    messages: [
      {
        id: "review-1",
        from: ME,
        at: at(31, 15, 30),
        body: "Can we look at the route planner on Wednesday? The empty states are still rough.",
      },
      {
        id: "review-2",
        from: TOBIAS,
        at: at(31, 18, 40),
        body: "Let's give it one more pass and meet Thursday at 14:00 instead. I will bring the Fernworks prototype with the new empty states.",
      },
    ],
  },
  {
    id: "statement",
    subject: "Your September statement is ready",
    folder: "inbox",
    labels: ["Finance"],
    attachments: 1,
    messages: [
      {
        id: "statement-1",
        from: { name: "Coldbrook Bank", email: "statements@coldbrook.example" },
        at: at(30, 7, 0),
        body: "The September statement for the operating account is ready. Closing balance 84,210.55.",
      },
    ],
  },
  {
    id: "onboard",
    subject: "Amara joins the ops team on Monday",
    folder: "inbox",
    unread: true,
    messages: [
      {
        id: "onboard-1",
        from: PRIYA,
        at: at(29, 11, 24),
        body: "Amara starts on Monday. Could you pair with her on the dock schedule on Tuesday morning? She has run night shifts at Basinworks before.",
      },
    ],
  },
  {
    id: "renewal",
    subject: "Re: Basinworks renewal terms",
    folder: "inbox",
    starred: true,
    labels: ["Finance"],
    messages: [
      {
        id: "renewal-1",
        from: JONAH,
        at: at(24, 10, 5),
        body: "Attached are the renewal terms for next year. The rate holds if we commit to 30 runs a quarter.",
      },
      {
        id: "renewal-2",
        from: ME,
        at: at(24, 13, 50),
        body: "30 is fine for Q1 and Q2. Can we review the summer quarters in May?",
      },
      {
        id: "renewal-3",
        from: JONAH,
        at: at(25, 9, 30),
        body: "Agreed. I will send the signed copy once legal has looked at it.",
      },
    ],
  },
  {
    id: "safety",
    subject: "Quarterly safety walk: pick a slot",
    folder: "snoozed",
    snoozedUntil: Date.UTC(2026, 9, 5, 8, 0),
    messages: [
      {
        id: "safety-1",
        from: { name: "Ines Okafor", email: "ines@fieldline.example" },
        at: at(28, 9, 0),
        body: "The safety walk is the week of 12 October. Pick a slot on the sheet by Monday.",
      },
    ],
  },
  {
    id: "lunch",
    subject: "Team lunch on Friday",
    folder: "archive",
    messages: [
      {
        id: "lunch-1",
        from: { name: "Mateo Silva", email: "mateo@fieldline.example" },
        at: at(27, 12, 10),
        body: "Booked the long table for 12:30. Vegetarian options confirmed.",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Look                                                                 */
/* ------------------------------------------------------------------ */

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TOOL = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  RING,
);
const TEXT_BUTTON = cn(
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-[13px] text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  RING,
);

type Verb = MailAction | "inbox";

/**
 * Filled shapes take a token's hue and chroma at a fixed lightness, so the
 * swipe's colour reads the same on a light page as on a dark one; the ink on
 * it is the same hue, dark.
 */
const PIGMENT: Record<Verb, { fill: string; ink: string }> = {
  archive: {
    fill: "oklch(from var(--success) 0.8 c h)",
    ink: "oklch(from var(--success) 0.3 c h)",
  },
  snooze: {
    fill: "oklch(from var(--warn) 0.85 c h)",
    ink: "oklch(from var(--warn) 0.32 c h)",
  },
  inbox: {
    fill: "oklch(from var(--accent-bright) 0.8 c h)",
    ink: "oklch(from var(--accent-bright) 0.3 c h)",
  },
};
const restFill = (v: Verb) =>
  `color-mix(in oklab, ${PIGMENT[v].fill} 42%, var(--bg-2))`;

const VERB_LABEL: Record<Verb, string> = {
  archive: "Archive",
  snooze: "Snooze",
  inbox: "Move to Inbox",
};

function VerbIcon({ verb, className }: { verb: Verb; className?: string }) {
  const cls = cn("size-4 shrink-0", className);
  if (verb === "archive") return <Archive aria-hidden className={cls} />;
  if (verb === "snooze") return <Clock aria-hidden className={cls} />;
  return <Inbox aria-hidden className={cls} />;
}

const TINTS = [
  "var(--accent-bright)",
  "var(--success)",
  "var(--warn)",
  "var(--signal)",
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const tintOf = (text: string) => TINTS[hash(text) % TINTS.length] ?? TINTS[0];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

function Avatar({
  person,
  className,
}: {
  person: MailPerson;
  className?: string;
}) {
  const tint = tintOf(person.name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-foreground",
        className,
      )}
      style={{ background: `color-mix(in oklab, ${tint} 22%, var(--card))` }}
    >
      {initials(person.name)}
    </span>
  );
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const latestOf = (t: MailThread) => t.messages[t.messages.length - 1];
const snippetOf = (t: MailThread) =>
  (latestOf(t)?.body ?? "").replace(/\s+/g, " ").trim();

/* ------------------------------------------------------------------ */
/* A rolling number                                                     */
/* ------------------------------------------------------------------ */

function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [last, setLast] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (value !== last) {
    setDir(value > last ? 1 : -1);
    setLast(value);
  }
  return (
    <span className="relative inline-flex overflow-clip tabular-nums">
      <AnimatePresence initial={false} mode="popLayout" custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          variants={{
            enter: (d: number) => ({
              y: motionSafe ? d * 10 : 0,
              opacity: 0,
            }),
            center: { y: 0, opacity: 1 },
            exit: (d: number) => ({
              y: motionSafe ? -d * 10 : 0,
              opacity: 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            y: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast },
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* An inline region whose measured height glides                         */
/* ------------------------------------------------------------------ */

function Collapse({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const [shown, setShown] = React.useState(open);
  if (open && !shown) setShown(true);
  const height = useMotionValue<number | "auto">(open ? "auto" : 0);
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    if (!inner) return;
    const go = () => {
      const target = open ? inner.offsetHeight : 0;
      const from = height.get();
      anim.current?.stop();
      if (from === "auto") {
        height.set(target);
        return;
      }
      if (Math.abs(from - target) < 0.5) {
        if (!open) setShown(false);
        return;
      }
      anim.current = animate(height, target, {
        ...(motionSafe ? springs.glide : { duration: 0 }),
        onComplete: () => {
          if (!open) setShown(false);
        },
      });
    };
    go();
    const ro = new ResizeObserver(go);
    ro.observe(inner);
    return () => {
      ro.disconnect();
      anim.current?.stop();
    };
  }, [inner, open, motionSafe, height]);

  if (!shown) return null;
  return (
    <motion.div style={{ height }} className="overflow-clip">
      <div ref={setInner}>{children}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* A thread, read                                                       */
/* ------------------------------------------------------------------ */

type ThreadBodyProps = {
  thread: MailThread;
  account: MailPerson;
  now: number;
  zoneOffset: number;
  /** In the reading pane: a heading and a toolbar of its own. */
  pane: boolean;
  disabled: boolean;
  headingId?: string;
  onReply: () => void;
  onVerb: (verb: Verb) => void;
  onUnread: () => void;
  onStar: () => void;
  onClose: () => void;
  verbs: Verb[];
};

function ThreadBody({
  thread,
  account,
  now,
  zoneOffset,
  pane,
  disabled,
  headingId,
  onReply,
  onVerb,
  onUnread,
  onStar,
  onClose,
  verbs,
}: ThreadBodyProps) {
  const last = latestOf(thread);
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(last ? [last.id] : []),
  );
  const isMe = (p: MailPerson) =>
    p.email !== undefined && p.email === account.email;

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className={cn(
        "flex flex-col",
        pane ? "gap-4 p-5" : "gap-3 px-3 pt-1 pb-3",
      )}
    >
      {pane ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-base leading-6 font-semibold text-foreground"
            >
              {thread.subject}
            </h2>
            <p className="mt-0.5 text-xs text-ink-3">
              {plural(thread.messages.length, "message")}
              {thread.labels?.length ? ` · ${thread.labels.join(", ")}` : ""}
            </p>
          </div>
          <div
            role="toolbar"
            aria-label="Thread"
            className="flex shrink-0 items-center gap-0.5"
          >
            {verbs.map((verb) => (
              <button
                key={verb}
                type="button"
                disabled={disabled}
                aria-label={VERB_LABEL[verb]}
                title={VERB_LABEL[verb]}
                onClick={() => onVerb(verb)}
                className={TOOL}
              >
                <VerbIcon verb={verb} />
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              aria-label="Mark unread"
              title="Mark unread"
              onClick={onUnread}
              className={TOOL}
            >
              <Mail aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-label="Star"
              aria-pressed={!!thread.starred}
              title="Star"
              onClick={onStar}
              className={TOOL}
            >
              <Star
                aria-hidden
                className={cn(
                  "size-4",
                  thread.starred && "fill-current text-warn",
                )}
              />
            </button>
            <button
              type="button"
              aria-label="Close thread"
              title="Close"
              onClick={onClose}
              className={TOOL}
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <ol role="list" className="flex flex-col gap-1.5">
        {thread.messages.map((m) => {
          const open = expanded.has(m.id);
          const who = isMe(m.from) ? "me" : m.from.name;
          const meta = `${who}, ${whenOf(m.at, now, zoneOffset)}`;
          return (
            <li
              key={m.id}
              className={cn(
                "rounded-3 border border-hairline",
                open ? "bg-surface-1" : "bg-transparent",
              )}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-label={
                  open
                    ? `Collapse message from ${meta}`
                    : `Message from ${meta}`
                }
                onClick={() => toggle(m.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-3 px-3 text-left",
                  open ? "h-11" : "h-10",
                  "hover:bg-surface-2/60",
                  RING_IN,
                )}
              >
                <Avatar person={m.from} className="size-6 text-[10px]" />
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  <span className="font-medium text-foreground">{who}</span>
                  {open ? (
                    m.from.email ? (
                      <span className="ml-1.5 text-xs text-ink-3">
                        {m.from.email}
                      </span>
                    ) : null
                  ) : (
                    <span className="ml-2 text-ink-3">
                      {m.body.replace(/\s+/g, " ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                  {whenOf(m.at, now, zoneOffset)}
                </span>
              </button>
              {open ? (
                <div className="flex flex-col gap-2 px-3 pt-0.5 pb-3 pl-11.5 text-[13px] leading-5 text-ink-2">
                  {m.body.split(/\n{2,}/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onReply}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
            RING,
          )}
        >
          <Reply aria-hidden className="size-4 shrink-0" />
          Reply
        </button>
        {pane
          ? null
          : verbs.map((verb) => (
              <button
                key={verb}
                type="button"
                disabled={disabled}
                onClick={() => onVerb(verb)}
                className={TEXT_BUTTON}
              >
                <VerbIcon verb={verb} />
                {VERB_LABEL[verb]}
              </button>
            ))}
        {pane ? null : (
          <button
            type="button"
            disabled={disabled}
            onClick={onUnread}
            className={TEXT_BUTTON}
          >
            <Mail aria-hidden className="size-4 shrink-0" />
            Mark unread
          </button>
        )}
        {pane ? null : (
          <button
            type="button"
            disabled={disabled}
            aria-pressed={!!thread.starred}
            onClick={onStar}
            className={TEXT_BUTTON}
          >
            <Star
              aria-hidden
              className={cn(
                "size-4 shrink-0",
                thread.starred && "fill-current text-warn",
              )}
            />
            Star
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* A row you can throw                                                  */
/* ------------------------------------------------------------------ */

type RowHandle = {
  /** Runs the face out toward `dir` (or fades it), resolving when it is gone. */
  leave: (dir: 1 | -1, delay: number) => Promise<void>;
  /** Brings the face home: the host kept the thread where it was. */
  reset: () => void;
};

/** Where a reveal rests, px. */
const ACTION_W = 80;

type MailRowProps = {
  thread: MailThread;
  account: MailPerson;
  now: number;
  zoneOffset: number;
  folder: MailFolder;
  density: MailDensity;
  preview: number;
  swipe: MailSwipe;
  /** The verbs under the face: revealed by a swipe right (`right`) or left (`left`). */
  right: Verb | null;
  left: Verb | null;
  selected: boolean;
  selecting: boolean;
  tabbable: boolean;
  /** Its thread is open under it (inline) or in the pane (marked). */
  open: boolean;
  inline: boolean;
  revealDir: -1 | 0 | 1;
  enterFrom?: 1 | -1;
  motionSafe: boolean;
  audio: TactileSound;
  disabled: boolean;
  hintId: string;
  register: (id: string, handle: RowHandle | null) => void;
  bindButton: (id: string) => (node: HTMLButtonElement | null) => void;
  onPress: (id: string) => void;
  onSelect: (id: string) => void;
  onStar: (id: string) => void;
  onUnread: (id: string) => void;
  onVerb: (id: string, verb: Verb) => void;
  onSwiped: (id: string, verb: Verb) => void;
  onReveal: (id: string, dir: -1 | 0 | 1) => void;
  onFocusRow: (id: string) => void;
  body: React.ReactNode;
};

const DENSITY: Record<
  MailDensity,
  { face: string; avatar: string; subject: string; gap: string }
> = {
  compact: {
    face: "px-3 py-2",
    avatar: "",
    subject: "text-[13px]",
    gap: "gap-2.5",
  },
  cozy: {
    face: "px-3 py-2.5",
    avatar: "size-8 text-[11px]",
    subject: "text-[13px]",
    gap: "gap-3",
  },
  roomy: {
    face: "px-4 py-3.5",
    avatar: "size-10 text-[13px]",
    subject: "text-sm",
    gap: "gap-3.5",
  },
};

function MailRow({
  thread,
  account,
  now,
  zoneOffset,
  folder,
  density,
  preview,
  swipe,
  right,
  left,
  selected,
  selecting,
  tabbable,
  open,
  inline,
  revealDir,
  enterFrom,
  motionSafe,
  audio,
  disabled,
  hintId,
  register,
  bindButton,
  onPress,
  onSelect,
  onStar,
  onUnread,
  onVerb,
  onSwiped,
  onReveal,
  onFocusRow,
  body,
}: MailRowProps) {
  const id = thread.id;
  const x = useMotionValue(0);
  const fade = useMotionValue(1);
  const faceRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const start = React.useRef(0);
  const width = React.useRef(320);
  const dragging = React.useRef(false);
  const heading = React.useRef(0);
  const suppressClick = React.useRef(false);
  const shownReveal = React.useRef(revealDir);
  const armedRef = React.useRef<-1 | 0 | 1>(0);
  const [armed, setArmed] = React.useState<-1 | 0 | 1>(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
  };

  const verbFor = (dir: number): Verb | null =>
    dir > 0 ? right : dir < 0 ? left : null;
  const commitAt = () => width.current * (swipe === "reveal" ? 0.6 : 0.42);
  const pan = () => {
    const r = faceRef.current?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  const arm = (next: -1 | 0 | 1, quiet = false) => {
    if (armedRef.current === next) return;
    const was = armedRef.current;
    armedRef.current = next;
    setArmed(next);
    if (quiet) return;
    if (next !== 0) audio.play("pop", { pitch: 1.25, gain: 0.42, pan: pan() });
    else if (was !== 0)
      audio.play("pop", { pitch: 0.8, gain: 0.22, pan: pan() });
  };

  /** Back to a rest position, carrying whatever speed the face has. */
  const settle = (target: number, velocity = 0) => {
    heading.current = target;
    run(
      "x",
      animate(
        x,
        target,
        motionSafe
          ? { ...springs.snap, velocity }
          : { duration: durations.fast, ease: easings.enter },
      ),
    );
  };

  const runOut = (dir: 1 | -1, velocity: number, delay: number) =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      const w = faceRef.current?.offsetWidth ?? width.current;
      heading.current = dir * (w + 24);
      if (!motionSafe) {
        run(
          "fade",
          animate(fade, 0, {
            duration: durations.fast,
            delay,
            ease: easings.exit,
            onComplete: finish,
          }),
        );
      } else {
        // The throw's own speed carries it off; glide never overshoots, so
        // the face reads as thrown rather than sprung.
        run(
          "x",
          animate(x, heading.current, {
            ...springs.glide,
            velocity,
            delay,
            onComplete: finish,
          }),
        );
      }
      // A stopped animation never completes; the row still has to go.
      window.setTimeout(finish, Math.round(delay * 1000) + 900);
    });

  const handle: RowHandle = {
    leave: (dir, delay) => {
      arm(dir, true);
      return runOut(dir, 0, delay);
    },
    reset: () => {
      arm(0, true);
      run(
        "fade",
        animate(fade, 1, { duration: durations.fast, ease: easings.enter }),
      );
      settle(0);
    },
  };

  React.useEffect(() => {
    register(id, handle);
    return () => register(id, null);
  });

  // A restored row slides back in from the side it left by. Set on the
  // motion value, not through `initial`, so a StrictMode re-run carries it
  // on to rest instead of freezing it part-way.
  React.useEffect(() => {
    if (!enterFrom || !motionSafe) return;
    const w = faceRef.current?.offsetWidth ?? 320;
    x.set(enterFrom * w);
    const c = animate(x, 0, springs.glide);
    return () => c.stop();
    // Mount only: the slide-in belongs to the row's arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The host (another row's drag, Escape, a mode change) closes a reveal.
  React.useEffect(() => {
    if (shownReveal.current === revealDir) return;
    shownReveal.current = revealDir;
    if (dragging.current) return;
    const target = revealDir * ACTION_W;
    if (heading.current === target) return;
    heading.current = target;
    const c = animate(
      x,
      target,
      motionSafe ? springs.snap : { duration: durations.fast },
    );
    anims.current.get("x")?.stop();
    anims.current.set("x", c);
  }, [revealDir, motionSafe, x]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: disabled || swipe === "off",
    onStart: () => {
      halt();
      dragging.current = true;
      suppressClick.current = true;
      start.current = x.get();
      width.current = faceRef.current?.offsetWidth ?? 320;
      onReveal(id, 0);
      shownReveal.current = 0;
    },
    onMove: ({ offset }) => {
      const raw = start.current + offset.x;
      const dir = raw > 0 ? 1 : raw < 0 ? -1 : 0;
      const w = width.current;
      let v: number;
      if (dir === 0 || !verbFor(dir)) {
        v = rubberband(raw, 120);
      } else {
        const reach = Math.abs(raw);
        v = reach > w ? dir * (w + rubberband(reach - w, w)) : raw;
      }
      x.set(r2(v));
      const lit = dir !== 0 && verbFor(dir) && Math.abs(v) >= commitAt();
      arm(lit ? (dir as -1 | 1) : 0);
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const v = x.get();
      const landing = project(v, velocity.x, 0.99);
      const dir: 1 | -1 = landing >= 0 ? 1 : -1;
      const verb = verbFor(dir);
      if (verb && Math.sign(v) === dir && Math.abs(landing) >= commitAt()) {
        arm(dir, true);
        audio.play("swish", {
          pitch: dir > 0 ? 1.1 : 0.9,
          gain: 0.5,
          pan: pan(),
        });
        void runOut(dir, velocity.x, 0).then(() => onSwiped(id, verb));
        return;
      }
      arm(0, true);
      if (
        swipe === "reveal" &&
        verb &&
        Math.sign(v) === dir &&
        Math.abs(landing) >= ACTION_W / 2
      ) {
        settle(dir * ACTION_W, velocity.x);
        shownReveal.current = dir;
        onReveal(id, dir);
        return;
      }
      settle(0, velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      arm(0, true);
      settle(revealDir * ACTION_W);
    },
  });

  const shownRight = useTransform(x, (v) => Math.max(0, r2(v)));
  const shownLeft = useTransform(x, (v) => Math.max(0, r2(-v)));
  // The icon rides the middle of the gap until the gap is wide enough, then
  // holds 24px in from the edge with its word beside it.
  const iconRight = useTransform(shownRight, (v) =>
    r2(Math.min(v / 2, 32) - 8),
  );
  const iconLeft = useTransform(shownLeft, (v) => -r2(Math.min(v / 2, 32) - 8));
  const wordRight = useTransform(shownRight, (v) =>
    r2(Math.min(1, Math.max(0, (v - 92) / 28))),
  );
  // The hover tools belong to a row at rest, not one being thrown.
  const toolsVisible = useTransform(x, (v) =>
    Math.abs(v) > 1 ? "hidden" : "visible",
  );
  const wordLeft = useTransform(shownLeft, (v) =>
    r2(Math.min(1, Math.max(0, (v - 92) / 28))),
  );

  const d = DENSITY[density] ?? DENSITY.cozy;
  const compact = density === "compact";
  const lines = Math.max(0, Math.min(2, Math.round(preview)));
  const latest = latestOf(thread);
  const isMe = (p: MailPerson) =>
    p.email !== undefined && p.email === account.email;
  const people: string[] = [];
  for (const m of thread.messages) {
    const name = isMe(m.from) ? "me" : m.from.name;
    if (!people.includes(name)) people.push(name);
  }
  const from = people.join(", ");
  const lead =
    thread.messages.find((m) => !isMe(m.from))?.from ?? latest?.from ?? account;
  const count = thread.messages.length;
  const snoozed = folder === "snoozed" && thread.snoozedUntil !== undefined;
  const when = snoozed
    ? untilOf(thread.snoozedUntil ?? now, now, zoneOffset)
    : whenOf(latest?.at ?? now, now, zoneOffset);
  const snippet = snippetOf(thread);
  const unread = !!thread.unread;
  const name = `${unread ? "Unread. " : ""}${from}, ${thread.subject}${
    count > 1 ? `, ${plural(count, "message")}` : ""
  }, ${snoozed ? `snoozed until ${when}` : when}.`;
  const showCheck = selecting || selected;

  // The time and its markers sit on the first line, so the subject and the
  // preview under it run the row's full width.
  const meta = (
    <span
      aria-hidden
      className="flex shrink-0 items-center gap-1.5 leading-5 transition-opacity duration-150 @min-[40rem]:group-hover/mail-inbox-row:opacity-0"
    >
      {thread.attachments ? (
        <Paperclip className="size-3.5 text-ink-3" />
      ) : null}
      {thread.starred ? (
        <Star className="size-3.5 fill-current text-warn" />
      ) : null}
      {snoozed ? <AlarmClock className="size-3.5 text-warn" /> : null}
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          unread ? "font-medium text-foreground" : "text-ink-3",
        )}
      >
        {when}
      </span>
    </span>
  );

  const panel = (side: "right" | "left") => {
    const verb = side === "right" ? right : left;
    if (!verb) return null;
    const dir = side === "right" ? 1 : -1;
    const lit = armed === dir;
    const resting = revealDir === dir;
    return (
      <motion.div
        className={cn(
          "absolute inset-y-0 flex items-center overflow-clip transition-colors duration-150",
          side === "right" ? "left-0" : "right-0",
        )}
        style={{
          width: side === "right" ? shownRight : shownLeft,
          backgroundColor: lit ? PIGMENT[verb].fill : restFill(verb),
          color: PIGMENT[verb].ink,
        }}
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute top-1/2 flex -translate-y-1/2 items-center gap-2 text-xs font-semibold",
            side === "right" ? "left-0 flex-row" : "right-0 flex-row-reverse",
          )}
          style={{ x: side === "right" ? iconRight : iconLeft }}
        >
          <motion.span
            className="flex size-4 items-center justify-center"
            animate={{ scale: lit && motionSafe ? 1.18 : 1 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <VerbIcon verb={verb} />
          </motion.span>
          <motion.span
            className="whitespace-nowrap"
            style={{ opacity: side === "right" ? wordRight : wordLeft }}
          >
            {VERB_LABEL[verb]}
          </motion.span>
        </motion.span>
        {swipe === "reveal" ? (
          <button
            type="button"
            inert={!resting}
            tabIndex={resting ? 0 : -1}
            aria-label={`${VERB_LABEL[verb]} ${thread.subject}`}
            onClick={() => onVerb(id, verb)}
            className={cn("absolute inset-0", RING_IN)}
          />
        ) : null}
      </motion.div>
    );
  };

  return (
    <motion.li
      data-mail-row={id}
      className="relative overflow-clip"
      initial={enterFrom ? { height: 0, opacity: 0 } : false}
      animate={{ height: "auto", opacity: 1 }}
      exit={{
        height: 0,
        opacity: 0,
        transition: motionSafe
          ? { duration: durations.base, ease: easings.move }
          : { duration: 0 },
      }}
      transition={{
        height: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: durations.fast },
      }}
    >
      <div className="relative">
        {panel("right")}
        {panel("left")}
        <motion.div
          ref={faceRef}
          {...drag}
          onPointerDown={(event) => {
            suppressClick.current = false;
            drag.onPointerDown(event);
          }}
          className={cn(
            "group/mail-inbox-row relative touch-pan-y border-b border-hairline bg-card select-none",
            swipe !== "off" &&
              !disabled &&
              "cursor-grab active:cursor-grabbing",
          )}
          style={{ x, opacity: fade }}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 transition-colors duration-150",
              selected
                ? "bg-cobalt-wash"
                : open && !inline
                  ? "bg-surface-2"
                  : "group-hover/mail-inbox-row:bg-surface-1",
            )}
          />
          {open && !inline ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-cobalt-bright"
            />
          ) : null}
          <button
            ref={bindButton(id)}
            type="button"
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            aria-label={name}
            aria-describedby={hintId}
            aria-expanded={inline ? open : undefined}
            onFocus={() => onFocusRow(id)}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              onPress(id);
            }}
            className={cn("absolute inset-0 cursor-pointer", RING_IN)}
          />
          <div
            className={cn(
              "pointer-events-none relative flex",
              compact ? "items-center" : "items-start",
              d.face,
              d.gap,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex w-1.5 shrink-0 justify-center",
                compact ? "" : "mt-[7px]",
              )}
            >
              <motion.span
                className="size-1.5 rounded-full bg-cobalt-bright"
                initial={false}
                animate={{
                  opacity: unread ? 1 : 0,
                  scale: unread || !motionSafe ? 1 : 0.4,
                }}
                transition={{
                  opacity: { duration: durations.base, ease: easings.enter },
                  scale: motionSafe
                    ? unread
                      ? springs.snap
                      : springs.flick
                    : { duration: 0 },
                }}
              />
            </span>

            <span
              className={cn(
                "pointer-events-auto relative grid shrink-0 place-items-center",
                compact ? "size-5" : d.avatar,
              )}
            >
              {compact ? null : (
                <Avatar
                  person={lead}
                  className={cn(
                    "size-full transition-opacity duration-150 [grid-area:1/1]",
                    showCheck
                      ? "opacity-0"
                      : "group-hover/mail-inbox-row:opacity-0",
                  )}
                />
              )}
              <button
                type="button"
                role="checkbox"
                tabIndex={-1}
                disabled={disabled}
                aria-checked={selected}
                aria-label={`Select ${thread.subject}`}
                onClick={() => onSelect(id)}
                className={cn(
                  "flex size-full items-center justify-center rounded-full transition-opacity duration-150 [grid-area:1/1]",
                  compact || showCheck
                    ? "opacity-100"
                    : "opacity-0 group-hover/mail-inbox-row:opacity-100",
                  RING,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-4 items-center justify-center rounded-1 border transition-colors",
                    selected
                      ? "border-cobalt-bright bg-cobalt-bright text-background"
                      : "border-hairline-strong bg-card",
                  )}
                >
                  {selected ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : null}
                </span>
              </button>
            </span>

            <span aria-hidden className="block min-w-0 flex-1">
              {compact ? (
                <span className="flex min-w-0 items-center gap-3 text-[13px] leading-5">
                  <span
                    className={cn(
                      "w-24 shrink-0 truncate @min-[40rem]:w-36",
                      unread ? "font-semibold text-foreground" : "text-ink-2",
                    )}
                  >
                    {from}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span
                      className={
                        unread
                          ? "font-medium text-foreground"
                          : "text-foreground"
                      }
                    >
                      {thread.subject}
                    </span>
                    {lines > 0 ? (
                      <span className="text-ink-3"> · {snippet}</span>
                    ) : null}
                  </span>
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-2 leading-5">
                    <span
                      className={cn(
                        "min-w-0 truncate text-[13px]",
                        unread ? "font-semibold text-foreground" : "text-ink-2",
                      )}
                    >
                      {from}
                    </span>
                    {count > 1 ? (
                      <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                        {count}
                      </span>
                    ) : null}
                    <span className="flex-1" />
                    {meta}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 flex items-center gap-2 leading-5",
                      d.subject,
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        unread
                          ? "font-medium text-foreground"
                          : "text-foreground",
                      )}
                    >
                      {thread.subject}
                    </span>
                    {thread.labels?.map((l) => (
                      <span
                        key={l}
                        className="hidden h-5 shrink-0 items-center gap-1 rounded-full border border-hairline px-1.5 text-[11px] text-ink-2 @min-[30rem]:inline-flex"
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: tintOf(l) }}
                        />
                        {l}
                      </span>
                    ))}
                  </span>
                  {lines > 0 ? (
                    <span
                      className={cn(
                        "mt-0.5 block text-xs leading-[18px] text-ink-3",
                        lines === 1 ? "line-clamp-1" : "line-clamp-2",
                      )}
                    >
                      {snippet}
                    </span>
                  ) : null}
                </>
              )}
            </span>

            {compact ? meta : null}
          </div>

          <motion.div
            style={{ visibility: toolsVisible }}
            className={cn(
              "pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 items-center gap-0.5 rounded-2 border border-hairline bg-card p-0.5 opacity-0 shadow-[0_2px_8px_color-mix(in_oklab,black_10%,transparent)] transition-opacity duration-150 @min-[40rem]:flex",
              "group-hover/mail-inbox-row:pointer-events-auto group-hover/mail-inbox-row:opacity-100",
              compact ? "" : "top-3 translate-y-0",
            )}
          >
            {[right, left]
              .filter((v, i, all): v is Verb => !!v && all.indexOf(v) === i)
              .map((verb) => (
                <button
                  key={verb}
                  type="button"
                  tabIndex={-1}
                  disabled={disabled}
                  aria-label={`${VERB_LABEL[verb]} ${thread.subject}`}
                  title={VERB_LABEL[verb]}
                  onClick={() => onVerb(id, verb)}
                  className={cn(TOOL, "size-7")}
                >
                  <VerbIcon verb={verb} />
                </button>
              ))}
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={
                unread
                  ? `Mark ${thread.subject} read`
                  : `Mark ${thread.subject} unread`
              }
              title={unread ? "Mark read" : "Mark unread"}
              onClick={() => onUnread(id)}
              className={cn(TOOL, "size-7")}
            >
              {unread ? (
                <MailOpen aria-hidden className="size-4" />
              ) : (
                <Mail aria-hidden className="size-4" />
              )}
            </button>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              aria-label={`Star ${thread.subject}`}
              aria-pressed={!!thread.starred}
              title="Star"
              onClick={() => onStar(id)}
              className={cn(TOOL, "size-7")}
            >
              <Star
                aria-hidden
                className={cn(
                  "size-4",
                  thread.starred && "fill-current text-warn",
                )}
              />
            </button>
          </motion.div>
        </motion.div>
      </div>
      {inline ? (
        <Collapse open={open} motionSafe={motionSafe}>
          <div className="border-b border-hairline bg-card">{body}</div>
        </Collapse>
      ) : null}
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* The inbox                                                            */
/* ------------------------------------------------------------------ */

type LastAction = {
  ids: string[];
  verb: Verb;
  dir: 1 | -1;
  prev: Record<string, { folder: MailFolder; snoozedUntil?: number }>;
};

type Latest = {
  apply: (ids: string[], verb: Verb, dir: 1 | -1, next: string | null) => void;
  visibleIds: string[];
};

const FOLDERS: { id: MailFolder; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "snoozed", label: "Snoozed" },
  { id: "archive", label: "Archive" },
];

function FolderIcon({ folder }: { folder: MailFolder }) {
  if (folder === "inbox")
    return <Inbox aria-hidden className="size-4 shrink-0" />;
  if (folder === "snoozed")
    return <Clock aria-hidden className="size-4 shrink-0" />;
  return <Archive aria-hidden className="size-4 shrink-0" />;
}

/** In a folder, the action that would send a thread where it already is sends it back to the inbox. */
const verbIn = (action: MailAction, folder: MailFolder): Verb =>
  (folder === "archive" && action === "archive") ||
  (folder === "snoozed" && action === "snooze")
    ? "inbox"
    : action;

/**
 * An inbox built for triage. Rows are thrown: a swipe follows the finger
 * 1:1 and reveals what it will do from the edge the row leaves — archive on
 * a green pigment, snooze on an amber one — saturating as it travels and
 * arming with a pop at the commit line. Let go past the line (or throw it
 * there, by projection) and the row runs out on the glide spring with its
 * release velocity before its height closes; short of it the row springs
 * home on snap. `swipe="reveal"` rests a short swipe open on its action.
 *
 * Choosing a thread (its avatar, `x`, or Select) slides a batch toolbar down
 * over the header on snap, with a rolling count; batch actions run every
 * selected row out in a cascade. Opening a thread marks it read — the
 * cobalt dot fades — and expands its messages under the row on a measured
 * glide, or in a reading pane once the inbox is wide enough. Every archive
 * and snooze leaves a toast with Undo that lands on recoil.
 *
 * The keyboard reaches everything: `j`/`k` move, `x` selects, Enter or `o`
 * opens, `e` archives, `b` snoozes, `s` stars, `u` toggles unread, `z`
 * undoes and Escape backs out. Under reduced motion the face still follows
 * the finger but rows fade instead of flying, and every settle is a short
 * tween; read state, counts and selections still change.
 */
export function MailInbox({
  swipe = "full",
  density = "cozy",
  preview = 1,
  threads,
  defaultThreads,
  onThreadsChange,
  folder,
  defaultFolder = "inbox",
  onFolderChange,
  selected,
  defaultSelected,
  onSelectedChange,
  open,
  defaultOpen = null,
  onOpenChange,
  swipeActions = { right: "archive", left: "snooze" },
  now = defaultMailNow,
  zoneOffset = 0,
  snoozeUntil,
  account = ME,
  label = "Mail",
  status = "ready",
  onRetry,
  onArchive,
  onSnooze,
  onRestore,
  onReadChange,
  onStarChange,
  onReply,
  onCompose,
  onUndo,
  sound = false,
  disabled = false,
  className,
}: MailInboxProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const paneTitleId = `${uid}-pane`;
  const nowMs = toMs(now);
  const snoozeAt = snoozeUntil
    ? snoozeUntil(nowMs)
    : nextMorning(nowMs, zoneOffset);

  const [ownThreads, setOwnThreads] = React.useState<MailThread[]>(
    () => defaultThreads ?? defaultMailThreads,
  );
  const list = threads ?? ownThreads;
  const [ownFolder, setOwnFolder] = React.useState<MailFolder>(defaultFolder);
  const current = folder ?? ownFolder;
  const [ownSelected, setOwnSelected] = React.useState<string[]>(
    () => defaultSelected ?? [],
  );
  const picked = selected ?? ownSelected;
  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const openId = open !== undefined ? open : ownOpen;

  const [selecting, setSelecting] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [labelFilter, setLabelFilter] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<{
    id: string;
    dir: -1 | 1;
  } | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [restored, setRestored] = React.useState<Record<string, 1 | -1>>({});
  const [toast, setToast] = React.useState<{
    key: number;
    text: string;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [check, setCheck] = React.useState(0);
  const [switched, setSwitched] = React.useState(false);
  const [wide, setWide] = React.useState(false);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);

  const rows = React.useRef(new Map<string, RowHandle>());
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const leaving = React.useRef(new Set<string>());
  const pendingLeave = React.useRef(new Set<string>());
  const focusNext = React.useRef<string | null>(null);
  const focusIntent = React.useRef<"toolbar" | "row" | null>(null);
  const focusUndo = React.useRef(false);
  const lastAction = React.useRef<LastAction | null>(null);
  const toastSeq = React.useRef(0);
  const latest = React.useRef<Latest | null>(null);
  const listRef = React.useRef(list);
  const selectAllRef = React.useRef<HTMLButtonElement | null>(null);
  const selectRef = React.useRef<HTMLButtonElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ derived ------------------------------ */

  const q = query.trim().toLowerCase();
  const inFolder = list.filter((t) => t.folder === current);
  const visible = inFolder
    .filter(
      (t) =>
        (!labelFilter || !!t.labels?.includes(labelFilter)) &&
        (!q ||
          t.subject.toLowerCase().includes(q) ||
          t.messages.some(
            (m) =>
              m.from.name.toLowerCase().includes(q) ||
              m.body.toLowerCase().includes(q),
          )),
    )
    .sort((a, b) =>
      current === "snoozed"
        ? (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0)
        : (latestOf(b)?.at ?? 0) - (latestOf(a)?.at ?? 0),
    );
  const visibleIds = visible.map((t) => t.id);
  const chosen = visible.filter((t) => picked.includes(t.id));
  const batch = selecting || chosen.length > 0;
  const tabbableId =
    focusId && visibleIds.includes(focusId) ? focusId : (visibleIds[0] ?? null);
  const openThread = openId ? list.find((t) => t.id === openId) : undefined;
  const unreadInbox = list.filter(
    (t) => t.folder === "inbox" && t.unread,
  ).length;
  const snoozedCount = list.filter((t) => t.folder === "snoozed").length;
  const labels: string[] = [];
  for (const t of list) {
    for (const l of t.labels ?? []) if (!labels.includes(l)) labels.push(l);
  }
  const folderLabel = FOLDERS.find((f) => f.id === current)?.label ?? "Inbox";
  const rightVerb = swipeActions.right
    ? verbIn(swipeActions.right, current)
    : null;
  const leftVerb = swipeActions.left
    ? verbIn(swipeActions.left, current)
    : null;
  const verbs: Verb[] = [verbIn("archive", current), verbIn("snooze", current)];
  const dirFor = (verb: Verb): 1 | -1 =>
    rightVerb === verb
      ? 1
      : leftVerb === verb
        ? -1
        : verb === "snooze"
          ? -1
          : 1;
  const allChosen = visible.length > 0 && chosen.length === visible.length;

  /* ------------------------------ commits ------------------------------ */

  const commitThreads = (next: MailThread[]) => {
    // Rows leave on their own schedule after their animation; each change
    // builds on the list the last one left, not the last render's.
    listRef.current = next;
    if (threads === undefined) setOwnThreads(next);
    onThreadsChange?.(next);
  };
  const commitSelected = (next: string[]) => {
    if (selected === undefined) setOwnSelected(next);
    onSelectedChange?.(next);
  };
  const commitOpen = (next: string | null) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const pan = (id: string | null) => {
    const r = id ? buttons.current.get(id)?.getBoundingClientRect() : undefined;
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  const focusRow = (id: string | null) => {
    if (!id) return;
    setFocusId(id);
    buttons.current.get(id)?.focus();
  };

  const setUnread = (ids: string[], unread: boolean) => {
    if (!ids.length) return;
    commitThreads(list.map((t) => (ids.includes(t.id) ? { ...t, unread } : t)));
    onReadChange?.(ids, unread);
    say(
      `${ids.length === 1 ? "Marked" : `${plural(ids.length, "thread")} marked`} ${unread ? "unread" : "read"}.`,
    );
  };

  const toggleStar = (id: string) => {
    const t = list.find((x) => x.id === id);
    if (!t) return;
    const starred = !t.starred;
    commitThreads(list.map((x) => (x.id === id ? { ...x, starred } : x)));
    onStarChange?.(id, starred);
    if (starred) audio.play("pop", { pitch: 1.35, gain: 0.4, pan: pan(id) });
    say(
      starred ? `Starred ${t.subject}.` : `Removed the star from ${t.subject}.`,
    );
  };

  const toggleSelect = (id: string) => {
    const has = picked.includes(id);
    const next = has ? picked.filter((x) => x !== id) : [...picked, id];
    commitSelected(next);
    audio.play("pop", { pitch: has ? 0.9 : 1.1, gain: 0.34, pan: pan(id) });
    const n = next.filter((x) => visibleIds.includes(x)).length;
    say(n ? `${n} selected.` : "Nothing selected.");
  };

  const selectAll = () => {
    const next = allChosen ? [] : visibleIds;
    commitSelected(next);
    audio.play("pop", { pitch: allChosen ? 0.9 : 1.2, gain: 0.34 });
    say(
      allChosen
        ? "Nothing selected."
        : `All ${plural(next.length, "thread")} selected.`,
    );
  };

  const endBatch = () => {
    if (picked.length) commitSelected([]);
    setSelecting(false);
    say("Selection cleared.");
  };

  const close = (focus: boolean) => {
    const id = openId;
    commitOpen(null);
    if (focus && id) focusRow(id);
  };

  const press = (id: string) => {
    if (revealed) {
      setRevealed(null);
      if (revealed.id === id) return;
    }
    if (batch) {
      toggleSelect(id);
      return;
    }
    setFocusId(id);
    if (openId === id) {
      commitOpen(null);
      say("Thread closed.");
      return;
    }
    commitOpen(id);
    const t = list.find((x) => x.id === id);
    if (!t) return;
    if (t.unread) {
      commitThreads(
        list.map((x) => (x.id === id ? { ...x, unread: false } : x)),
      );
      onReadChange?.([id], false);
    }
    say(`Opened ${t.subject}, ${plural(t.messages.length, "message")}.`);
  };

  /** Carries out an action once the rows have left. */
  const apply = (
    ids: string[],
    verb: Verb,
    dir: 1 | -1,
    next: string | null,
  ) => {
    const prev: LastAction["prev"] = {};
    const base = listRef.current;
    const moved = base.map((t) => {
      if (!ids.includes(t.id)) return t;
      prev[t.id] = { folder: t.folder, snoozedUntil: t.snoozedUntil };
      if (verb === "archive") {
        return { ...t, folder: "archive" as const, snoozedUntil: undefined };
      }
      if (verb === "snooze") {
        return { ...t, folder: "snoozed" as const, snoozedUntil: snoozeAt };
      }
      return { ...t, folder: "inbox" as const, snoozedUntil: undefined };
    });
    const done = ids.filter((id) => prev[id]);
    for (const id of ids) leaving.current.delete(id);
    if (!done.length) return;
    // Focus moves before the rows go, so it never drops to the page.
    const active = document.activeElement;
    if (rootNode && active && rootNode.contains(active)) {
      if (next) {
        setFocusId(next);
        buttons.current.get(next)?.focus({ preventScroll: true });
      } else {
        // Nothing left to land on: the toast's Undo takes focus as it arrives.
        focusUndo.current = true;
      }
    }
    commitThreads(moved);
    if (picked.some((id) => done.includes(id))) {
      const left = picked.filter((id) => !done.includes(id));
      commitSelected(left);
      if (!left.length) setSelecting(false);
    }
    if (openId && done.includes(openId)) commitOpen(null);
    setRevealed(null);
    setRestored({});
    lastAction.current = { ids: done, verb, dir, prev };
    const first = base.find((t) => t.id === done[0]);
    const what =
      done.length === 1 && first
        ? `“${first.subject}”`
        : plural(done.length, "thread");
    const text =
      verb === "archive"
        ? `Archived ${what}`
        : verb === "snooze"
          ? `Snoozed ${what} until ${untilOf(snoozeAt, nowMs, zoneOffset)}`
          : `Moved ${what} to the inbox`;
    toastSeq.current += 1;
    setToast({ key: toastSeq.current, text });
    say(`${text}.`);
    if (verb === "archive") onArchive?.(done);
    else if (verb === "snooze") onSnooze?.(done, snoozeAt);
    else onRestore?.(done);
    if (threads !== undefined) {
      for (const id of done) pendingLeave.current.add(id);
      // The host answers on its own schedule; once it has had its turn, a
      // row it kept comes home.
      React.startTransition(() => setCheck((c) => c + 1));
    }
  };

  const act = (ids: string[], verb: Verb, swiped?: string) => {
    if (disabled) return;
    const targets = ids.filter(
      (id) => visibleIds.includes(id) && !leaving.current.has(id),
    );
    if (!targets.length) return;
    for (const id of targets) leaving.current.add(id);
    const dir = dirFor(verb);
    const rest = visibleIds.filter((id) => !targets.includes(id));
    const lastIdx = Math.max(...targets.map((id) => visibleIds.indexOf(id)));
    const next =
      visibleIds.slice(lastIdx + 1).find((id) => rest.includes(id)) ??
      [...visibleIds.slice(0, lastIdx)]
        .reverse()
        .find((id) => rest.includes(id)) ??
      null;
    if (!swiped) {
      audio.play("swish", {
        pitch: dir > 0 ? 1.1 : 0.9,
        gain: 0.5,
        pan: pan(targets[0] ?? null),
      });
    }
    const step = cascade(targets.length);
    const runs = targets.map((id, i) =>
      id === swiped
        ? Promise.resolve()
        : (rows.current.get(id)?.leave(dir, i * step) ?? Promise.resolve()),
    );
    void Promise.all(runs).then(() =>
      latest.current?.apply(targets, verb, dir, next),
    );
  };

  const undo = () => {
    const last = lastAction.current;
    if (!last || disabled) return;
    lastAction.current = null;
    commitThreads(
      list.map((t) => {
        const p = last.prev[t.id];
        return p ? { ...t, folder: p.folder, snoozedUntil: p.snoozedUntil } : t;
      }),
    );
    setRestored(Object.fromEntries(last.ids.map((id) => [id, last.dir])));
    const active = document.activeElement;
    if (rootNode && active && rootNode.contains(active)) {
      focusNext.current = last.ids[0] ?? null;
    }
    setToast(null);
    audio.play("swish", { pitch: 0.72, gain: 0.4 });
    say("Undone.");
    onUndo?.(last.ids);
  };

  const switchFolder = (next: MailFolder) => {
    if (next === current) return;
    if (folder === undefined) setOwnFolder(next);
    onFolderChange?.(next);
    setSwitched(true);
    setRevealed(null);
    setRestored({});
    setLabelFilter(null);
    setFocusId(null);
    if (picked.length) commitSelected([]);
    setSelecting(false);
    if (openId) commitOpen(null);
    const n = list.filter((t) => t.folder === next).length;
    say(
      `${FOLDERS.find((f) => f.id === next)?.label ?? next}, ${plural(n, "thread")}.`,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || disabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    const rowId =
      target.closest("[data-mail-row]")?.getAttribute("data-mail-row") ??
      tabbableId;
    const idx = rowId ? visibleIds.indexOf(rowId) : -1;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
      return;
    }
    if (mod || event.altKey) return;
    const targetsFor = () =>
      chosen.length ? chosen.map((t) => t.id) : rowId ? [rowId] : [];
    const moveTo = (i: number) => {
      const id = visibleIds[Math.max(0, Math.min(visibleIds.length - 1, i))];
      if (id) focusRow(id);
    };
    switch (event.key) {
      case "j":
      case "ArrowDown":
        event.preventDefault();
        moveTo(idx + 1);
        return;
      case "k":
      case "ArrowUp":
        event.preventDefault();
        moveTo(idx - 1);
        return;
      case "Home":
        event.preventDefault();
        moveTo(0);
        return;
      case "End":
        event.preventDefault();
        moveTo(visibleIds.length - 1);
        return;
      case "x":
        if (!rowId) return;
        event.preventDefault();
        toggleSelect(rowId);
        return;
      case "o":
        if (!rowId) return;
        event.preventDefault();
        press(rowId);
        return;
      case "e":
        event.preventDefault();
        act(targetsFor(), verbIn("archive", current));
        return;
      case "b":
        event.preventDefault();
        act(targetsFor(), verbIn("snooze", current));
        return;
      case "s":
        if (!rowId) return;
        event.preventDefault();
        toggleStar(rowId);
        return;
      case "u": {
        const ids = targetsFor();
        const t = list.find((x) => x.id === ids[0]);
        if (!t) return;
        event.preventDefault();
        setUnread(ids, !t.unread);
        return;
      }
      case "z":
        if (!lastAction.current) return;
        event.preventDefault();
        undo();
        return;
      case "Escape":
        if (batch) {
          event.preventDefault();
          endBatch();
          return;
        }
        if (openId && !wide) {
          event.preventDefault();
          close(true);
          return;
        }
        if (revealed) {
          event.preventDefault();
          setRevealed(null);
        }
        return;
    }
  };

  /* ------------------------------- effects ----------------------------- */

  React.useEffect(() => {
    latest.current = { apply, visibleIds };
    listRef.current = list;
  });

  // A row the host kept (it never took the archive) comes back home.
  React.useEffect(() => {
    const pending = pendingLeave.current;
    if (!pending.size) return;
    const shown = latest.current?.visibleIds ?? [];
    for (const id of pending) {
      if (shown.includes(id)) rows.current.get(id)?.reset();
    }
    pending.clear();
  }, [check]);

  // Focus follows the batch toolbar in and out, before the side it leaves
  // goes inert.
  React.useLayoutEffect(() => {
    const intent = focusIntent.current;
    if (!intent) return;
    focusIntent.current = null;
    if (intent === "toolbar" && batch) selectAllRef.current?.focus();
    if (intent === "row" && !batch) {
      const node = tabbableId ? buttons.current.get(tabbableId) : undefined;
      if (node) node.focus();
      else selectRef.current?.focus();
    }
  }, [batch, tabbableId]);

  React.useEffect(() => {
    if (!rootNode) return;
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWide(w >= 68 * rem);
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);

  // The toast waits five seconds of a visible page, then goes.
  const toastKey = toast?.key;
  React.useEffect(() => {
    if (toastKey === undefined) return;
    let left = 5000;
    let since = 0;
    let timer = 0;
    const start = () => {
      since = performance.now();
      timer = window.setTimeout(
        () => setToast((t) => (t && t.key === toastKey ? null : t)),
        left,
      );
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        left = Math.max(0, left - (performance.now() - since));
      } else {
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [toastKey]);

  /* -------------------------------- parts ------------------------------ */

  const bindButton = (id: string) => (node: HTMLButtonElement | null) => {
    if (!node) {
      buttons.current.delete(id);
      return;
    }
    buttons.current.set(id, node);
    if (focusNext.current === id) {
      focusNext.current = null;
      node.focus();
    }
  };
  const register = (id: string, handle: RowHandle | null) => {
    if (handle) rows.current.set(id, handle);
    else rows.current.delete(id);
  };

  const bodyFor = (t: MailThread, pane: boolean) => (
    <ThreadBody
      key={t.id}
      thread={t}
      account={account}
      now={nowMs}
      zoneOffset={zoneOffset}
      pane={pane}
      disabled={disabled}
      headingId={pane ? paneTitleId : undefined}
      verbs={verbs}
      onReply={() => {
        onReply?.(t.id);
        const from = latestOf(t)?.from.name ?? "the thread";
        say(`Replying to ${from}.`);
      }}
      onVerb={(verb) => act([t.id], verb)}
      onUnread={() => {
        setUnread([t.id], true);
        close(true);
      }}
      onStar={() => toggleStar(t.id)}
      onClose={() => close(true)}
    />
  );

  const countFor = (f: MailFolder) =>
    f === "inbox" ? unreadInbox : f === "snoozed" ? snoozedCount : 0;
  const folderName = (f: { id: MailFolder; label: string }) => {
    const n = countFor(f.id);
    if (!n) return f.label;
    return f.id === "inbox" ? `${f.label}, ${n} unread` : `${f.label}, ${n}`;
  };

  const headerMotion = (on: boolean) => ({
    animate: {
      opacity: on ? 1 : 0,
      y: on || !motionSafe ? 0 : -distances.step,
    },
    transition: on
      ? {
          y: motionSafe ? springs.snap : { duration: 0 },
          opacity: { duration: durations.fast, ease: easings.enter },
        }
      : { duration: durations.fast, ease: easings.exit },
  });

  const listBody =
    status === "loading" ? (
      <div aria-busy="true" aria-label="Loading mail" className="flex flex-col">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-start gap-3 border-b border-hairline px-3 py-3"
          >
            <span className="size-8 shrink-0 rounded-full bg-surface-2" />
            <span className="flex flex-1 flex-col gap-2 pt-1">
              <span
                className="h-2.5 rounded-full bg-surface-2"
                style={{ width: `${44 + ((i * 17) % 30)}%` }}
              />
              <span
                className="h-2.5 rounded-full bg-surface-2/70"
                style={{ width: `${62 + ((i * 11) % 28)}%` }}
              />
            </span>
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-sm font-medium text-foreground">
          The mail did not load
        </p>
        <p className="text-xs text-ink-3">
          Check the connection and try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-[13px] text-foreground hover:bg-surface-2",
            RING,
          )}
        >
          Retry
        </button>
      </div>
    ) : (
      <>
        <motion.ul
          key={current}
          role="list"
          aria-labelledby={titleId}
          className="flex flex-col"
          initial={
            switched
              ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
              : false
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{
            opacity: { duration: durations.base, ease: easings.enter },
            y: motionSafe ? springs.glide : { duration: 0 },
          }}
        >
          <AnimatePresence initial={false}>
            {visible.map((t) => (
              <MailRow
                key={t.id}
                thread={t}
                account={account}
                now={nowMs}
                zoneOffset={zoneOffset}
                folder={current}
                density={density}
                preview={preview}
                swipe={swipe}
                right={rightVerb}
                left={leftVerb}
                selected={picked.includes(t.id)}
                selecting={batch}
                tabbable={t.id === tabbableId}
                open={openId === t.id}
                inline={!wide}
                revealDir={
                  swipe === "reveal" && revealed?.id === t.id ? revealed.dir : 0
                }
                enterFrom={restored[t.id]}
                motionSafe={motionSafe}
                audio={audio}
                disabled={disabled}
                hintId={hintId}
                register={register}
                bindButton={bindButton}
                onPress={press}
                onSelect={toggleSelect}
                onStar={toggleStar}
                onUnread={(id) => {
                  const x = list.find((y) => y.id === id);
                  if (x) setUnread([id], !x.unread);
                }}
                onVerb={(id, verb) => act([id], verb)}
                onSwiped={(id, verb) => act([id], verb, id)}
                onReveal={(id, dir) =>
                  // One row rests open at a time: a drag anywhere closes it.
                  setRevealed(dir === 0 ? null : { id, dir })
                }
                onFocusRow={(id) => {
                  if (id !== focusId) setFocusId(id);
                }}
                body={!wide && openId === t.id ? bodyFor(t, false) : null}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
        <AnimatePresence initial={false}>
          {visible.length === 0 ? (
            <motion.div
              key="empty"
              className="flex flex-col items-center gap-2 px-6 py-14 text-center"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { duration: durations.base, delay: 0.12 },
              }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
                <FolderIcon folder={current} />
              </span>
              <p className="text-sm font-medium text-foreground">
                {q || labelFilter
                  ? "No threads match"
                  : current === "inbox"
                    ? "Inbox zero"
                    : current === "snoozed"
                      ? "Nothing snoozed"
                      : "The archive is empty"}
              </p>
              <p className="max-w-60 text-xs text-ink-3">
                {q || labelFilter
                  ? "Try another word, or clear the filter."
                  : current === "inbox"
                    ? "Everything is triaged. New mail lands here."
                    : current === "snoozed"
                      ? "Snoozed threads wait here until their time."
                      : "Archived threads are kept here."}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </>
    );

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-label={label}
      className={cn(
        "@container relative h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        inert={disabled}
        className="grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)] @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[68rem]:grid-cols-[12rem_minmax(0,24rem)_minmax(0,1fr)]"
      >
        {/* The rail: who, compose, folders, labels. */}
        <div className="hidden flex-col gap-4 overflow-y-auto overscroll-contain border-r border-hairline bg-surface-1 p-3 @min-[40rem]:flex">
          <div className="flex items-center gap-2.5">
            <Avatar person={account} className="size-8 text-[11px]" />
            <span className="min-w-0">
              <span
                className="block truncate text-[13px] font-medium"
                title={account.name}
              >
                {account.name}
              </span>
              {account.email ? (
                <span
                  className="block truncate text-[11px] text-ink-3"
                  title={account.email}
                >
                  {account.email}
                </span>
              ) : null}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onCompose?.();
              say("New message.");
            }}
            className={cn(
              "inline-flex h-9 w-full items-center justify-center gap-2 rounded-2 bg-primary text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
              RING,
            )}
          >
            <PenSquare aria-hidden className="size-4 shrink-0" />
            Compose
          </button>
          <nav aria-label="Folders">
            <ul role="list" className="flex flex-col gap-0.5">
              {FOLDERS.map((f) => {
                const on = f.id === current;
                const n = countFor(f.id);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      aria-current={on ? "page" : undefined}
                      aria-label={folderName(f)}
                      onClick={() => switchFolder(f.id)}
                      className={cn(
                        "flex h-8 w-full items-center gap-2.5 rounded-2 px-2.5 text-[13px] transition-colors",
                        on
                          ? "bg-cobalt-wash font-medium text-foreground"
                          : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                        RING_IN,
                      )}
                    >
                      <FolderIcon folder={f.id} />
                      <span className="flex-1 truncate text-left">
                        {f.label}
                      </span>
                      {n ? (
                        <span className="font-mono text-[11px] text-ink-3">
                          <Roll value={n} motionSafe={motionSafe} />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          {labels.length ? (
            <div
              role="group"
              aria-label="Labels"
              className="flex flex-col gap-0.5"
            >
              <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Labels
              </p>
              {labels.map((l) => {
                const on = labelFilter === l;
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setLabelFilter(on ? null : l);
                      say(on ? "Label filter cleared." : `Showing ${l}.`);
                    }}
                    className={cn(
                      "flex h-8 w-full items-center gap-2.5 rounded-2 px-2.5 text-[13px] transition-colors",
                      on
                        ? "bg-surface-2 text-foreground"
                        : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      RING_IN,
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: tintOf(l) }}
                      />
                    </span>
                    <span className="truncate">{l}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <p className="mt-auto px-1 font-mono text-[10px] leading-4 tracking-[0.04em] text-ink-3">
            j k move · x select · e archive · b snooze · z undo
          </p>
        </div>

        {/* The list. */}
        <section
          aria-labelledby={titleId}
          className="relative grid grid-rows-[auto_minmax(0,1fr)]"
        >
          <div className="border-b border-hairline">
            <div className="grid [grid-template-areas:'bar'] *:[grid-area:bar]">
              <motion.div
                inert={batch}
                className="flex h-12 items-center gap-2 px-3"
                initial={false}
                {...headerMotion(!batch)}
              >
                <h2
                  id={titleId}
                  className="text-sm font-semibold text-foreground"
                >
                  {labelFilter ?? folderLabel}
                </h2>
                <span className="min-w-0 truncate text-xs text-ink-3">
                  {current === "inbox" && !labelFilter
                    ? `${unreadInbox} unread`
                    : plural(visible.length, "thread")}
                </span>
                <span className="flex-1" />
                <label className="relative hidden h-8 w-44 items-center @min-[40rem]:flex">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3"
                  />
                  <input
                    ref={searchRef}
                    type="search"
                    aria-label="Search mail"
                    placeholder="Search"
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && query) {
                        e.preventDefault();
                        setQuery("");
                      }
                    }}
                    className={cn(
                      "h-8 w-full rounded-2 border border-hairline bg-surface-1 pr-2 pl-8 text-[13px] text-foreground placeholder:text-ink-3",
                      RING_IN,
                    )}
                  />
                </label>
                <button
                  ref={selectRef}
                  type="button"
                  disabled={!visible.length || status !== "ready"}
                  onClick={() => {
                    focusIntent.current = "toolbar";
                    setSelecting(true);
                    say("Select mode. Press x on a row to choose it.");
                  }}
                  className={TEXT_BUTTON}
                >
                  Select
                </button>
              </motion.div>
              <motion.div
                role="toolbar"
                aria-label="Selected threads"
                inert={!batch}
                className="flex h-12 items-center gap-1 bg-card px-2"
                initial={false}
                {...headerMotion(batch)}
              >
                <button
                  ref={selectAllRef}
                  type="button"
                  role="checkbox"
                  aria-checked={
                    allChosen ? true : chosen.length ? "mixed" : false
                  }
                  aria-label="Select all"
                  onClick={selectAll}
                  className={cn(TOOL)}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 items-center justify-center rounded-1 border transition-colors",
                      chosen.length
                        ? "border-cobalt-bright bg-cobalt-bright text-background"
                        : "border-hairline-strong bg-card",
                    )}
                  >
                    {allChosen ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : chosen.length ? (
                      <Minus className="size-3" strokeWidth={3} />
                    ) : null}
                  </span>
                </button>
                <span className="flex items-center gap-1 text-[13px] font-medium text-foreground">
                  <Roll value={chosen.length} motionSafe={motionSafe} />
                  <span>selected</span>
                </span>
                <span className="flex-1" />
                {verbs.map((verb) => (
                  <button
                    key={verb}
                    type="button"
                    disabled={!chosen.length}
                    aria-label={VERB_LABEL[verb]}
                    title={VERB_LABEL[verb]}
                    onClick={() =>
                      act(
                        chosen.map((t) => t.id),
                        verb,
                      )
                    }
                    className={cn(TEXT_BUTTON, "px-2 @min-[30rem]:px-2.5")}
                  >
                    <VerbIcon verb={verb} />
                    <span aria-hidden className="hidden @min-[36rem]:inline">
                      {VERB_LABEL[verb]}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!chosen.length}
                  aria-label={
                    chosen.some((t) => t.unread) ? "Mark read" : "Mark unread"
                  }
                  title={
                    chosen.some((t) => t.unread) ? "Mark read" : "Mark unread"
                  }
                  onClick={() =>
                    setUnread(
                      chosen.map((t) => t.id),
                      !chosen.some((t) => t.unread),
                    )
                  }
                  className={TOOL}
                >
                  {chosen.some((t) => t.unread) ? (
                    <MailOpen aria-hidden className="size-4" />
                  ) : (
                    <Mail aria-hidden className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  aria-label="Done selecting"
                  title="Done"
                  onClick={() => {
                    focusIntent.current = "row";
                    endBatch();
                  }}
                  className={TOOL}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </motion.div>
            </div>
            <nav
              aria-label="Folders"
              className="flex gap-1.5 px-3 pb-2.5 @min-[40rem]:hidden"
            >
              {FOLDERS.map((f) => {
                const on = f.id === current;
                const n = countFor(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    aria-label={folderName(f)}
                    onClick={() => switchFolder(f.id)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
                      on
                        ? "border-transparent bg-cobalt-wash font-medium text-foreground"
                        : "border-hairline text-ink-2 hover:bg-surface-2",
                      RING,
                    )}
                  >
                    {f.label}
                    {n ? (
                      <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                        {n}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </div>

          <div
            className="relative [scrollbar-width:thin] overflow-y-auto overscroll-contain"
            onKeyDown={onListKeyDown}
          >
            {listBody}
          </div>

          <AnimatePresence>
            {toast ? (
              <motion.div
                key={toast.key}
                className="absolute inset-x-3 bottom-3 z-20 mx-auto flex max-w-sm items-center gap-2 rounded-3 border border-hairline-strong bg-popover py-1.5 pr-1.5 pl-3 text-popover-foreground shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? distances.step : 0,
                  transition: exitFor(durations.base),
                }}
                transition={{
                  y: motionSafe ? springs.recoil : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px]">
                  {toast.text}
                </span>
                <button
                  ref={(node) => {
                    if (node && focusUndo.current) {
                      focusUndo.current = false;
                      node.focus();
                    }
                  }}
                  type="button"
                  onClick={undo}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-2 px-2.5 text-[13px] font-medium text-cobalt-bright hover:bg-surface-2",
                    RING,
                  )}
                >
                  Undo
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setToast(null)}
                  className={cn(TOOL, "size-8")}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* The reading pane, once there is room for one. */}
        <section
          aria-label="Reading pane"
          aria-labelledby={wide && openThread ? paneTitleId : undefined}
          className="relative hidden [scrollbar-width:thin] overflow-y-auto overscroll-contain border-l border-hairline @min-[68rem]:block"
          onKeyDown={(event) => {
            if (event.key === "Escape" && openId) {
              event.preventDefault();
              close(true);
            }
          }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {wide && openThread ? (
              <motion.div
                key={openThread.id}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  opacity: { duration: durations.base, ease: easings.enter },
                  y: motionSafe ? springs.glide : { duration: 0 },
                }}
              >
                {bodyFor(openThread, true)}
              </motion.div>
            ) : (
              <motion.div
                key="none"
                className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base }}
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
                  <Mail aria-hidden className="size-4" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  No thread open
                </p>
                <p className="max-w-64 text-xs text-ink-3">
                  Pick a thread to read it here. j and k move, Enter opens.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <p id={hintId} className="sr-only">
        j and k move between threads, x selects, Enter opens, e archives, b
        snoozes, s stars, u marks unread, z undoes. Swipe a row right or left
        for its actions.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
