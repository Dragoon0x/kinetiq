"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Inbox,
  Mail,
  Menu,
  Search,
  Send,
  SquarePen,
  Star,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import { BinLid } from "@/registry/ui/bin-lid";
import {
  defaultMailNow,
  defaultMailThreads,
  MailInbox,
  type MailDensity,
  type MailFolder,
  type MailInboxStatus,
  type MailMessage,
  type MailPerson,
  type MailThread,
} from "@/registry/ui/mail-inbox";

export type MailClientFolders = "pane" | "rail" | "drawer";

/** A message the visitor wrote: a reply carries the thread it answers. */
export type MailDraft = {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
};

export type MailClientProps = {
  /** Row height and type size in the list, and the reading pane's type. @default "cozy" */
  density?: MailDensity;
  /** Lines of message preview under each subject in the list, 0 to 2. @default 1 */
  preview?: number;
  /** How the mailboxes live beside the list on wide screens: a labelled pane, an icon rail, or a drawer behind the menu button. A phone always stacks them. @default "pane" */
  folders?: MailClientFolders;
  /** Controlled threads, every folder. */
  threads?: MailThread[];
  /** Initial threads when uncontrolled. @default defaultMailClientThreads */
  defaultThreads?: MailThread[];
  /** Fires from the swipe, key, button, reply or delete that changed the threads, with all of them. */
  onThreadsChange?: (threads: MailThread[]) => void;
  /** Controlled folder on screen. */
  folder?: MailFolder;
  /** Initial folder when uncontrolled. @default "inbox" */
  defaultFolder?: MailFolder;
  onFolderChange?: (folder: MailFolder) => void;
  /** Controlled thread in the reading pane, or null. */
  open?: string | null;
  /** Initial thread in the reading pane when uncontrolled. @default null */
  defaultOpen?: string | null;
  onOpenChange?: (id: string | null) => void;
  /** Whose mail it is: shown at the head of the mailboxes, and the sender of replies. @default defaultMailClientAccount */
  account?: MailPerson;
  /** The mailbox's storage, in bytes, for the meter under the mailboxes. @default 6.2 GB of 15 GB */
  storage?: { used: number; total: number };
  /** The moment times are read against (Date or ms). @default defaultMailClientNow */
  now?: Date | number;
  /** Minutes east of UTC that times are shown in, so server and browser agree. @default 0 */
  zoneOffset?: number;
  /** A reply or a new message was sent. */
  onSend?: (draft: MailDraft) => void;
  /** Threads sent to the archive, from the list or the reading pane. */
  onArchive?: (ids: string[]) => void;
  /** Threads snoozed, and until when. */
  onSnooze?: (ids: string[], until: number) => void;
  /** Threads deleted, once the bin's undo window ran out. */
  onDelete?: (ids: string[]) => void;
  onStarChange?: (id: string, starred: boolean) => void;
  /** Threads marked read (false) or unread (true). */
  onReadChange?: (ids: string[], unread: boolean) => void;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: MailInboxStatus;
  onRetry?: () => void;
  /** The screen's accessible name. @default "Mail" */
  label?: string;
  /** Play the slides, the stars and the sends. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be moved, sent or deleted. */
  disabled?: boolean;
  /** Classes for the root. It is 560px tall by default; pass a height class to change it. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Defaults                                                             */
/* ------------------------------------------------------------------ */

/** Friday 2 October 2026, 09:41 UTC: the moment the default mail is read at. */
export const defaultMailClientNow = defaultMailNow;

/** Noor Halvorsen, operations at Fieldline. */
export const defaultMailClientAccount: MailPerson = {
  name: "Noor Halvorsen",
  email: "noor@fieldline.example",
};

/** Fieldline's operations mail: freight, payouts, a statement, a review. */
export const defaultMailClientThreads: MailThread[] = defaultMailThreads;

const MIN = 60_000;
const DAY = 86_400_000;
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

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

/** A message's time: the clock today, then Yesterday, a weekday, a date. */
function whenOf(ms: number, now: number, offset: number): string {
  const days = dayOf(now, offset) - dayOf(ms, offset);
  if (days <= 0) return clockOf(ms, offset);
  if (days === 1) return "Yesterday";
  if (days < 7) return WEEKDAYS[local(ms, offset).getUTCDay()] ?? "";
  return dateOf(ms, offset);
}

const stampOf = (ms: number, offset: number) =>
  `${WEEKDAYS[local(ms, offset).getUTCDay()] ?? ""} ${dateOf(ms, offset)}, ${clockOf(ms, offset)}`;

const nextMorning = (now: number, offset: number) =>
  (dayOf(now, offset) + 1) * DAY - offset * MIN + 8 * 60 * MIN;

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

/** The same tints the list draws its avatars and labels in. */
const tintOf = (text: string) => TINTS[hash(text) % TINTS.length] ?? TINTS[0];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const latestOf = (t: MailThread) => t.messages[t.messages.length - 1];
const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const panOf = (el: Element | null | undefined) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};

const FOLDERS: { id: MailFolder; label: string; Icon: typeof Inbox }[] = [
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "snoozed", label: "Snoozed", Icon: Clock },
  { id: "archive", label: "Archive", Icon: Archive },
];

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";
const TOOL = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40",
  FOCUS,
);

type Mode = "phone" | "tablet" | "desktop";
type Said = { n: number; text: string };
type Toast = { key: number; text: string; undo?: () => void };

const PHONE_MAX = 640;
const DESKTOP_MIN = 1040;

/* ------------------------------------------------------------------ */
/* Small parts                                                          */
/* ------------------------------------------------------------------ */

function Avatar({
  person,
  className,
}: {
  person: MailPerson;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-foreground",
        className,
      )}
      style={{
        background: `color-mix(in oklab, ${tintOf(person.name)} 22%, var(--card))`,
      }}
    >
      {initials(person.name)}
    </span>
  );
}

/** A region whose measured height glides open and shut. */
function Collapse({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const height = useMotionValue<number | "auto">(open ? "auto" : 0);
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    if (!inner) return;
    const go = () => {
      const target = open ? inner.offsetHeight : 0;
      const from = height.get();
      anim.current?.stop();
      if (from === "auto" || !motionSafe) {
        height.set(target);
        return;
      }
      if (Math.abs(from - target) < 0.5) return;
      anim.current = animate(height, target, springs.glide);
    };
    go();
    const ro = new ResizeObserver(go);
    ro.observe(inner);
    return () => {
      ro.disconnect();
      anim.current?.stop();
    };
  }, [inner, open, motionSafe, height]);

  return (
    <motion.div
      style={{ height }}
      className="overflow-hidden"
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <div ref={setInner}>{children}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* The mailboxes                                                        */
/* ------------------------------------------------------------------ */

type MailboxesProps = {
  variant: "pane" | "rail" | "screen";
  idBase: string;
  account: MailPerson;
  current: MailFolder;
  counts: Record<MailFolder, number>;
  labels: string[];
  labelFilter: string | null;
  storage: { used: number; total: number };
  motionSafe: boolean;
  disabled: boolean;
  onFolder: (folder: MailFolder, by: Element) => void;
  onLabel: (label: string, by: Element) => void;
  onCompose?: (by: HTMLElement) => void;
};

function Mailboxes({
  variant,
  idBase,
  account,
  current,
  counts,
  labels,
  labelFilter,
  storage,
  motionSafe,
  disabled,
  onFolder,
  onLabel,
  onCompose,
}: MailboxesProps) {
  const rail = variant === "rail";
  const screen = variant === "screen";
  const used = Math.min(1, storage.used / Math.max(1, storage.total));
  const nameOf = (f: (typeof FOLDERS)[number]) => {
    const n = counts[f.id];
    if (!n) return f.label;
    return f.id === "inbox" ? `${f.label}, ${n} unread` : `${f.label}, ${n}`;
  };
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-4 overflow-y-auto overscroll-contain bg-surface-1",
        rail ? "items-center px-2 py-3" : "p-3",
      )}
    >
      <div
        className={cn("flex items-center gap-2.5", rail && "justify-center")}
      >
        <Avatar
          person={account}
          className={rail ? "size-8 text-[11px]" : "size-9 text-xs"}
        />
        {rail ? (
          <span className="sr-only">{account.name}</span>
        ) : (
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
        )}
      </div>
      {onCompose ? (
        <button
          type="button"
          aria-label={rail ? "Compose" : undefined}
          title={rail ? "Compose" : undefined}
          disabled={disabled}
          onClick={(event) => onCompose(event.currentTarget)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 rounded-2 bg-primary text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
            rail ? "size-9" : "h-9 w-full",
            FOCUS,
          )}
        >
          <SquarePen aria-hidden className="size-4 shrink-0" />
          {rail ? null : "Compose"}
        </button>
      ) : null}
      <nav aria-label="Mailboxes" className={cn(rail && "w-full")}>
        <ul role="list" className="flex flex-col gap-0.5">
          {FOLDERS.map((f) => {
            const on = f.id === current && !labelFilter;
            const n = counts[f.id];
            return (
              <li key={f.id}>
                <button
                  type="button"
                  aria-current={f.id === current ? "page" : undefined}
                  aria-label={nameOf(f)}
                  title={rail ? f.label : undefined}
                  onClick={(event) => onFolder(f.id, event.currentTarget)}
                  className={cn(
                    "relative flex w-full items-center rounded-2 text-[13px] transition-colors",
                    rail
                      ? "h-10 justify-center"
                      : screen
                        ? "h-11 gap-3 px-3"
                        : "h-8 gap-2.5 px-2.5",
                    f.id === current
                      ? "font-medium text-foreground"
                      : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_IN,
                  )}
                >
                  {f.id === current ? (
                    <motion.span
                      aria-hidden
                      layoutId={
                        motionSafe ? `${idBase}-${variant}-pill` : undefined
                      }
                      transition={springs.snap}
                      className={cn(
                        "absolute inset-0 rounded-2",
                        on ? "bg-cobalt-wash" : "bg-surface-2",
                      )}
                    />
                  ) : null}
                  <f.Icon aria-hidden className="relative size-4 shrink-0" />
                  {rail ? (
                    n ? (
                      <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-cobalt-bright px-1 font-mono text-[9px] leading-none text-primary-foreground tabular-nums">
                        {n}
                      </span>
                    ) : null
                  ) : (
                    <>
                      <span className="relative min-w-0 flex-1 truncate text-left">
                        {f.label}
                      </span>
                      {n ? (
                        <span className="relative font-mono text-[11px] text-ink-3 tabular-nums">
                          {n}
                        </span>
                      ) : null}
                      {screen ? (
                        <ChevronRight
                          aria-hidden
                          className="relative size-4 shrink-0 text-ink-3"
                        />
                      ) : null}
                    </>
                  )}
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
          className={cn("flex flex-col gap-0.5", rail && "w-full")}
        >
          {rail ? null : (
            <p className="px-2.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Labels
            </p>
          )}
          {labels.map((l) => {
            const on = labelFilter === l;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={on}
                aria-label={rail ? `Label ${l}` : undefined}
                title={rail ? l : undefined}
                onClick={(event) => onLabel(l, event.currentTarget)}
                className={cn(
                  "flex w-full items-center rounded-2 text-[13px] transition-colors",
                  rail
                    ? "h-9 justify-center"
                    : screen
                      ? "h-11 gap-3 px-3"
                      : "h-8 gap-2.5 px-2.5",
                  on
                    ? "bg-cobalt-wash text-foreground"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: tintOf(l) }}
                  />
                </span>
                {rail ? null : <span className="truncate">{l}</span>}
              </button>
            );
          })}
        </div>
      ) : null}
      {rail ? null : (
        <div className="mt-auto flex flex-col gap-1.5 px-1">
          <span
            aria-hidden
            className="block h-1 overflow-hidden rounded-full bg-surface-2"
          >
            <span
              className="block h-full origin-left rounded-full bg-cobalt-bright"
              style={{ transform: `scaleX(${r2(used)})` }}
            />
          </span>
          <p className="font-mono text-[10px] text-ink-3 tabular-nums">
            {gb(storage.used)} of {gb(storage.total)} used
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The reading pane                                                     */
/* ------------------------------------------------------------------ */

type ReadingProps = {
  thread: MailThread;
  account: MailPerson;
  now: number;
  zoneOffset: number;
  density: MailDensity;
  phone: boolean;
  backLabel: string;
  motionSafe: boolean;
  sound: boolean;
  disabled: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  headingId: string;
  onBack: () => void;
  onArchive: (by: Element) => void;
  onSnooze: (by: Element) => void;
  onStar: (by: Element) => void;
  onUnread: () => void;
  onDelete: () => void;
  onKeep: () => void;
  onStep: (dir: 1 | -1) => void;
  onReply: (body: string, id: string) => void;
};

function ReadingPane({
  thread,
  account,
  now,
  zoneOffset,
  density,
  phone,
  backLabel,
  motionSafe,
  sound,
  disabled,
  hasPrev,
  hasNext,
  headingId,
  onBack,
  onArchive,
  onSnooze,
  onStar,
  onUnread,
  onDelete,
  onKeep,
  onStep,
  onReply,
}: ReadingProps) {
  const uid = React.useId();
  const last = latestOf(thread);
  const [open, setOpen] = React.useState<Set<string>>(
    () => new Set(last ? [last.id] : []),
  );
  const [draft, setDraft] = React.useState("");
  const [writing, setWriting] = React.useState(false);
  const [landed, setLanded] = React.useState<string | null>(null);
  const counter = React.useRef(0);
  const isMe = (p: MailPerson) =>
    p.email !== undefined && p.email === account.email;
  const body =
    density === "compact"
      ? "text-[13px] leading-5"
      : density === "roomy"
        ? "text-[15px] leading-7"
        : "text-sm leading-6";
  const grown = writing || draft.length > 0;
  const replyTo = [...thread.messages].reverse().find((m) => !isMe(m.from));

  const toggle = (m: MailMessage) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });

  const send = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    counter.current += 1;
    const id = `${uid.replace(/[^a-zA-Z0-9]/g, "")}-r${counter.current}`;
    setOpen((s) => new Set([...s, id]));
    setLanded(id);
    setDraft("");
    setWriting(false);
    onReply(text, id);
  };

  const tool = (
    labelText: string,
    icon: React.ReactNode,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => void,
    extra?: { pressed?: boolean; off?: boolean; hideOnPhone?: boolean },
  ) => (
    <button
      type="button"
      aria-label={labelText}
      title={labelText}
      aria-pressed={extra?.pressed}
      aria-disabled={extra?.off || disabled || undefined}
      onClick={(event) => {
        if (extra?.off || disabled) return;
        onClick(event);
      }}
      className={cn(TOOL, extra?.hideOnPhone && phone && "hidden")}
    >
      {icon}
    </button>
  );

  return (
    <section
      aria-labelledby={headingId}
      className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] bg-card"
    >
      <div className="flex h-12 items-center gap-1 border-b border-hairline px-2">
        {phone ? (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              "mr-auto inline-flex h-8 shrink-0 items-center gap-0.5 rounded-2 pr-2 pl-1 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-4" />
            {backLabel}
          </button>
        ) : (
          <span className="mr-auto" />
        )}
        <div
          role="toolbar"
          aria-label="Thread"
          className="flex shrink-0 items-center gap-0.5"
        >
          {tool(
            thread.folder === "archive" ? "Move to Inbox" : "Archive",
            thread.folder === "archive" ? (
              <Inbox aria-hidden className="size-4" />
            ) : (
              <Archive aria-hidden className="size-4" />
            ),
            (event) => onArchive(event.currentTarget),
          )}
          {tool(
            thread.folder === "snoozed" ? "Unsnooze" : "Snooze",
            <Clock aria-hidden className="size-4" />,
            (event) => onSnooze(event.currentTarget),
          )}
          {tool(
            thread.starred ? "Starred" : "Star",
            <motion.span
              key={thread.starred ? "on" : "off"}
              initial={motionSafe && thread.starred ? { scale: 0.4 } : false}
              animate={{ scale: 1 }}
              transition={springs.snap}
              className="flex"
            >
              <Star
                aria-hidden
                className={cn(
                  "size-4",
                  thread.starred && "fill-warn text-warn",
                )}
              />
            </motion.span>,
            (event) => onStar(event.currentTarget),
            { pressed: !!thread.starred },
          )}
          {tool("Mark unread", <Mail aria-hidden className="size-4" />, () =>
            onUnread(),
          )}
          <BinLid
            key={thread.id}
            iconOnly
            size="sm"
            itemName={thread.subject}
            onDelete={onDelete}
            onUndo={onKeep}
            sound={sound}
            disabled={disabled}
          />
          {tool(
            "Previous thread",
            <ChevronUp aria-hidden className="size-4" />,
            () => onStep(-1),
            { off: !hasPrev, hideOnPhone: true },
          )}
          {tool(
            "Next thread",
            <ChevronDown aria-hidden className="size-4" />,
            () => onStep(1),
            { off: !hasNext, hideOnPhone: true },
          )}
        </div>
      </div>

      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <motion.div
          className="flex flex-col gap-3 px-4 pt-4 pb-6"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            opacity: { duration: durations.base, ease: easings.enter },
            y: motionSafe ? springs.glide : { duration: 0 },
          }}
        >
          <div>
            <h2
              id={headingId}
              tabIndex={-1}
              className="rounded-1 text-base leading-6 font-semibold text-foreground outline-none"
            >
              {thread.subject}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
              <span>{plural(thread.messages.length, "message")}</span>
              {thread.labels?.map((l) => (
                <span
                  key={l}
                  className="inline-flex h-5 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] text-ink-2"
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: tintOf(l) }}
                  />
                  {l}
                </span>
              ))}
            </p>
          </div>
          <ol role="list" className="flex flex-col gap-2">
            {thread.messages.map((m) => {
              const expanded = open.has(m.id);
              const me = isMe(m.from);
              const snippet = m.body.replace(/\s+/g, " ").trim();
              return (
                <motion.li
                  key={m.id}
                  initial={
                    m.id === landed
                      ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                      : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    y: motionSafe ? springs.snap : { duration: 0 },
                    opacity: { duration: durations.base },
                  }}
                  className="rounded-3 border border-hairline bg-surface-1"
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggle(m)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-3 px-3 text-left",
                      expanded ? "h-14" : "h-11",
                      FOCUS_IN,
                    )}
                  >
                    <Avatar
                      person={m.from}
                      className={
                        expanded ? "size-8 text-[11px]" : "size-6 text-[10px]"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {me ? "Me" : m.from.name}
                        </span>
                        {expanded && m.from.email ? (
                          <span className="hidden truncate text-[11px] text-ink-3 @min-[34rem]:inline">
                            {m.from.email}
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-ink-3">
                        {expanded ? (me ? "to the thread" : "to me") : snippet}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                      {expanded
                        ? stampOf(m.at, zoneOffset)
                        : whenOf(m.at, now, zoneOffset)}
                    </span>
                  </button>
                  <Collapse open={expanded} motionSafe={motionSafe}>
                    <div
                      className={cn(
                        "flex flex-col gap-3 px-3 pb-4 text-ink-2 @min-[34rem]:pl-14",
                        body,
                      )}
                    >
                      {m.body.split(/\n{2,}/).map((p, i) => (
                        <p key={i} className="whitespace-pre-line">
                          {p}
                        </p>
                      ))}
                    </div>
                  </Collapse>
                </motion.li>
              );
            })}
          </ol>
        </motion.div>
      </div>

      <form
        className="border-t border-hairline p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <motion.textarea
          aria-label={`Reply to ${replyTo?.from.name ?? "the thread"}`}
          placeholder={`Reply to ${replyTo?.from.name ?? "the thread"}`}
          value={draft}
          disabled={disabled}
          onFocus={() => setWriting(true)}
          onBlur={() => setWriting(false)}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setDraft(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
            if (event.key === "Escape" && draft) {
              event.preventDefault();
              setDraft("");
            }
          }}
          initial={false}
          animate={{ height: grown ? 88 : 36 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
          className={cn(
            "block w-full resize-none rounded-2 border border-hairline-strong bg-surface-1 px-3 py-2 text-[13px] leading-5 text-foreground placeholder:text-ink-3",
            FOCUS_IN,
          )}
        />
        <AnimatePresence initial={false}>
          {grown ? (
            <motion.div
              key="send"
              className="flex items-center justify-end gap-2 overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 40, opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
            >
              <span className="mr-auto hidden font-mono text-[10px] text-ink-3 @min-[30rem]:inline">
                Ctrl or ⌘ + Enter sends
              </span>
              <button
                type="submit"
                onMouseDown={(event) => event.preventDefault()}
                aria-disabled={!draft.trim() || disabled || undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity aria-disabled:opacity-40",
                  FOCUS,
                )}
              >
                <Send aria-hidden className="size-3.5" />
                Send
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The phone stack                                                      */
/* ------------------------------------------------------------------ */

function StackScreen({
  index,
  depth,
  level,
  motionSafe,
  children,
}: {
  index: number;
  depth: MotionValue<number>;
  level: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  // A pushed screen comes in from the right edge; the one beneath slides a
  // little over a quarter of the way left and dims, so the push reads as
  // depth rather than a page turn.
  const x = useTransform(depth, (d) =>
    motionSafe ? `${r2((index - d) * (index > d ? 100 : 28))}%` : "0%",
  );
  const dim = useTransform(depth, (d) =>
    r2(Math.min(1, Math.max(0, d - index)) * 0.3),
  );
  const on = index === level;
  return (
    <motion.div
      aria-hidden={!on || undefined}
      inert={!on}
      className="absolute inset-0 overflow-hidden bg-card"
      style={{ x, zIndex: index }}
      animate={motionSafe ? undefined : { opacity: on ? 1 : 0 }}
      transition={{ duration: durations.fast }}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,black_100%,transparent)]"
        style={{ opacity: dim }}
      />
    </motion.div>
  );
}

/** The strip along a pushed screen's left edge that takes a back-swipe. */
function EdgeBack({
  width,
  level,
  depth,
  onGrab,
  onBack,
}: {
  width: number;
  level: number;
  depth: MotionValue<number>;
  onGrab: () => void;
  onBack: () => void;
}) {
  const dx = React.useRef(0);
  const drag = useDrag({
    axis: "x",
    threshold: 6,
    onStart: () => {
      dx.current = 0;
      onGrab();
    },
    onMove: ({ offset }) => {
      dx.current = offset.x;
      const w = Math.max(1, width);
      // Follows the finger 1:1 back toward the screen beneath; pulled the
      // other way it resists, never leaving its edge for good.
      const d =
        offset.x >= 0
          ? level - Math.min(offset.x, w) / w
          : level + rubberband(-offset.x, w * 0.4) / w;
      depth.set(r2(d * 1000) / 1000);
    },
    onEnd: ({ velocity }) => {
      const rest = project(dx.current, velocity.x, 0.99);
      if (rest > width / 2) onBack();
      else
        animate(depth, level, {
          ...springs.glide,
          velocity: -velocity.x / Math.max(1, width),
        });
    },
    onCancel: () => {
      animate(depth, level, springs.glide);
    },
  });
  return (
    <div
      aria-hidden
      {...drag}
      className="absolute inset-y-0 left-0 z-30 w-4 cursor-grab touch-pan-y"
    />
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

/**
 * A complete mail screen in three panes: the mailboxes, the message list
 * and the reading pane. The list is mail-inbox — swipe a row to archive or
 * snooze it, select a batch, undo from its toast, j and k through it —
 * held to its list so the screen's mailboxes replace its folders and an
 * opened row goes to the reading pane, where earlier messages open in place
 * on a measured glide, a quick reply grows as you write and lands on snap,
 * and deleting is bin-lid: the thread goes in the bin and is only gone when
 * its undo ring has drained.
 *
 * `folders` keeps the mailboxes as a labelled pane, an icon rail, or a
 * drawer that slides over the list on glide. Below 640px the panes become a
 * stack — Mailboxes, Inbox, Message — and each push slides the new screen in
 * from the right on glide while the one beneath shifts and dims; a swipe
 * from a pushed screen's left edge follows the finger 1:1 and goes back if
 * the throw would carry it past halfway. Back, Alt+← and Escape do the same
 * from the keyboard, and focus follows every move. Under reduced motion the
 * screens, the drawer and compose cross-fade and nothing slides, while
 * counts, stars, read state and toasts still change.
 */
export function MailClient({
  density = "cozy",
  preview = 1,
  folders = "pane",
  threads,
  defaultThreads,
  onThreadsChange,
  folder,
  defaultFolder = "inbox",
  onFolderChange,
  open,
  defaultOpen = null,
  onOpenChange,
  account = defaultMailClientAccount,
  storage = { used: 6.2e9, total: 15e9 },
  now = defaultMailClientNow,
  zoneOffset = 0,
  onSend,
  onArchive,
  onSnooze,
  onDelete,
  onStarChange,
  onReadChange,
  status = "ready",
  onRetry,
  label = "Mail",
  sound = false,
  disabled = false,
  className,
}: MailClientProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const nowMs = toMs(now);
  const headingId = `${uid}-subject`;
  const composeTitleId = `${uid}-compose`;

  /* ------------------------------ the data ------------------------------ */

  const [ownThreads, setOwnThreads] = React.useState<MailThread[]>(
    () => defaultThreads ?? defaultMailClientThreads,
  );
  const list = threads ?? ownThreads;
  const listRef = React.useRef(list);
  React.useEffect(() => {
    listRef.current = list;
  }, [list]);

  const [ownFolder, setOwnFolder] = React.useState<MailFolder>(defaultFolder);
  const current = folder ?? ownFolder;
  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const openId = open !== undefined ? open : ownOpen;
  const reading = openId ? list.find((t) => t.id === openId) : undefined;

  const [query, setQuery] = React.useState("");
  const [labelFilter, setLabelFilter] = React.useState<string | null>(null);
  const [phoneList, setPhoneList] = React.useState(true);
  const [drawer, setDrawer] = React.useState(false);
  const [compose, setCompose] = React.useState<MailDraft | null>(null);
  const [kept, setKept] = React.useState<MailDraft | null>(null);
  const [toError, setToError] = React.useState(false);
  const [toast, setToast] = React.useState<Toast | null>(null);
  const [hidden, setHidden] = React.useState(false);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const toastSeq = React.useRef(0);
  const focusNext = React.useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  );
  const opener = React.useRef<HTMLElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const commit = (next: MailThread[]) => {
    listRef.current = next;
    if (threads === undefined) setOwnThreads(next);
    onThreadsChange?.(next);
  };
  const patch = (id: string, fn: (t: MailThread) => MailThread) =>
    commit(listRef.current.map((t) => (t.id === id ? fn(t) : t)));

  /* ------------------------------ the frame ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!root) return;
    const read = () => setWidth(Math.round(root.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);

  const W = width ?? 760;
  const mode: Mode =
    W < PHONE_MAX ? "phone" : W >= DESKTOP_MIN ? "desktop" : "tablet";
  const phone = mode === "phone";
  const foldersW =
    folders === "drawer"
      ? 0
      : folders === "rail"
        ? mode === "desktop"
          ? 64
          : 60
        : mode === "desktop"
          ? 216
          : 176;
  const listW =
    mode === "desktop"
      ? 360
      : Math.round(Math.min(340, Math.max(260, (W - foldersW) * 0.42)));

  const level = reading ? 2 : phoneList ? 1 : 0;
  const depth = useMotionValue(level);
  const depthAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const wasMode = React.useRef<Mode | null>(null);
  React.useLayoutEffect(() => {
    const arrived = wasMode.current !== mode;
    wasMode.current = mode;
    if (mode !== "phone") return;
    depthAnim.current?.stop();
    if (arrived || !motionSafe) depth.jump(level);
    else if (Math.abs(depth.get() - level) > 0.001) {
      depthAnim.current = animate(depth, level, springs.glide);
    }
  }, [level, mode, motionSafe, depth]);

  React.useEffect(
    () => () => {
      depthAnim.current?.stop();
    },
    [],
  );

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A toast waits five seconds of a visible page, then goes.
  React.useEffect(() => {
    if (!toast || hidden) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast, hidden]);

  // Focus that follows a move is placed once the render that made the move
  // has landed and the screen it goes to is no longer inert.
  React.useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    const node = next();
    if (node?.isConnected && !node.closest("[inert]")) {
      node.focus({ preventScroll: true });
    }
  });

  /* ----------------------------- derived data --------------------------- */

  const q = query.trim().toLowerCase();
  const matches = (t: MailThread) =>
    (!labelFilter || !!t.labels?.includes(labelFilter)) &&
    (!q ||
      t.subject.toLowerCase().includes(q) ||
      !!t.labels?.some((l) => l.toLowerCase().includes(q)) ||
      t.messages.some(
        (m) =>
          m.from.name.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q),
      ));
  const shown = list.filter(matches);
  // The list's own order, so previous and next walk what the eye sees.
  const inFolder = shown
    .filter((t) => t.folder === current)
    .sort((a, b) =>
      current === "snoozed"
        ? (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0)
        : (latestOf(b)?.at ?? 0) - (latestOf(a)?.at ?? 0),
    );
  const counts: Record<MailFolder, number> = {
    inbox: list.filter((t) => t.folder === "inbox" && t.unread).length,
    snoozed: list.filter((t) => t.folder === "snoozed").length,
    archive: 0,
  };
  const labels = [...new Set(list.flatMap((t) => t.labels ?? []))].sort();
  const folderLabel = FOLDERS.find((f) => f.id === current)?.label ?? "Inbox";
  const at = reading ? inFolder.findIndex((t) => t.id === reading.id) : -1;

  /* ------------------------------- actions ------------------------------ */

  const swish = (up: boolean, by?: Element | null) =>
    audio.play("swish", { pitch: up ? 1.1 : 0.85, gain: 0.4, pan: panOf(by) });

  const setOpen = (id: string | null) => {
    if (open === undefined) setOwnOpen(id);
    onOpenChange?.(id);
  };

  const openThread = (id: string) => {
    const t = listRef.current.find((x) => x.id === id);
    if (!t) return;
    if (t.unread) {
      patch(id, (x) => ({ ...x, unread: false }));
      onReadChange?.([id], false);
    }
    if (phone) {
      swish(true);
      const back = document.activeElement;
      opener.current = back instanceof HTMLElement ? back : null;
    }
    focusNext.current = () => document.getElementById(headingId);
    setOpen(id);
    say(`Opened ${t.subject}.`);
  };

  const closeThread = (by?: Element | null) => {
    if (!openId) return;
    if (phone) swish(false, by);
    const back = opener.current;
    opener.current = null;
    focusNext.current = () =>
      back?.isConnected
        ? back
        : (root?.querySelector<HTMLElement>(
            "[data-mail-list] button[tabindex='0']",
          ) ?? searchRef.current);
    setOpen(null);
  };

  /**
   * A thread that left the folder from the reading pane hands the pane to
   * its neighbour on a wide screen, the way triage moves on; a phone goes
   * back to the list.
   */
  const leave = (t: MailThread, by?: Element | null) => {
    const i = inFolder.findIndex((x) => x.id === t.id);
    const next = inFolder[i + 1] ?? inFolder[i - 1];
    if (!phone && next && next.id !== t.id) openThread(next.id);
    else closeThread(by);
  };

  const chooseFolder = (f: MailFolder, by?: Element | null) => {
    audio.play("pop", { pitch: 1.1, gain: 0.35, pan: panOf(by) });
    if (f !== current) {
      if (folder === undefined) setOwnFolder(f);
      onFolderChange?.(f);
      if (openId) setOpen(null);
    }
    setLabelFilter(null);
    setDrawer(false);
    if (phone) {
      setPhoneList(true);
      swish(true, by);
      focusNext.current = () =>
        root?.querySelector<HTMLElement>("[data-mail-back]");
    }
    say(`${FOLDERS.find((x) => x.id === f)?.label ?? f}.`);
  };

  const chooseLabel = (l: string, by?: Element | null) => {
    audio.play("pop", { pitch: 1.2, gain: 0.35, pan: panOf(by) });
    const next = labelFilter === l ? null : l;
    setLabelFilter(next);
    setDrawer(false);
    if (phone && next) {
      setPhoneList(true);
      swish(true, by);
    }
    say(next ? `Showing ${next}.` : "Label filter cleared.");
  };

  const back = (by?: Element | null) => {
    if (level === 2) closeThread(by);
    else if (level === 1) {
      swish(false, by);
      setPhoneList(false);
      focusNext.current = () =>
        root?.querySelector<HTMLElement>("[aria-current='page']");
    }
  };

  const showToast = (text: string, undo?: () => void) => {
    toastSeq.current += 1;
    setToast({ key: toastSeq.current, text, undo });
    say(undo ? `${text} Undo is available.` : text);
  };

  const move = (t: MailThread, to: MailFolder, by: Element | null) => {
    const prev = { folder: t.folder, snoozedUntil: t.snoozedUntil };
    const until = to === "snoozed" ? nextMorning(nowMs, zoneOffset) : undefined;
    patch(t.id, (x) => ({ ...x, folder: to, snoozedUntil: until }));
    if (!phone) swish(to !== "inbox", by);
    leave(t, by);
    if (to === "archive") onArchive?.([t.id]);
    if (to === "snoozed" && until !== undefined) onSnooze?.([t.id], until);
    const short =
      t.subject.length > 28 ? `${t.subject.slice(0, 27)}…` : t.subject;
    showToast(
      to === "archive"
        ? `Archived “${short}”.`
        : to === "snoozed"
          ? `Snoozed until ${clockOf(until ?? 0, zoneOffset)} tomorrow.`
          : `Moved “${short}” to the inbox.`,
      () => {
        patch(t.id, (x) => ({ ...x, ...prev }));
        say("Undone.");
      },
    );
  };

  const reply = (t: MailThread, text: string, id: string) => {
    const when = Math.max(nowMs, latestOf(t)?.at ?? 0) + MIN;
    patch(t.id, (x) => ({
      ...x,
      messages: [...x.messages, { id, from: account, at: when, body: text }],
    }));
    const to = [...t.messages]
      .reverse()
      .find((m) => m.from.email !== account.email);
    audio.play("pop", { pitch: 1.25, gain: 0.5 });
    onSend?.({
      to: to?.from.email ?? "",
      subject: t.subject.startsWith("Re:") ? t.subject : `Re: ${t.subject}`,
      body: text,
      threadId: t.id,
    });
    say(`Reply sent to ${to?.from.name ?? "the thread"}.`);
  };

  const openCompose = (by: HTMLElement) => {
    if (disabled) return;
    opener.current = by;
    setCompose(kept ?? { to: "", subject: "", body: "" });
    setToError(false);
    swish(true, by);
    focusNext.current = () =>
      root?.querySelector<HTMLElement>("[data-mail-to]");
  };

  const closeCompose = (keep: boolean) => {
    setKept(keep ? compose : null);
    setCompose(null);
    swish(false);
    const backTo = opener.current;
    opener.current = null;
    focusNext.current = () => (backTo?.isConnected ? backTo : null);
    if (keep && compose && (compose.to || compose.body)) say("Draft kept.");
  };

  const sendCompose = () => {
    if (!compose) return;
    if (!/\S+@\S+/.test(compose.to)) {
      setToError(true);
      say("Add who it is to: an email address.");
      root?.querySelector<HTMLElement>("[data-mail-to]")?.focus();
      return;
    }
    onSend?.(compose);
    setKept(null);
    setCompose(null);
    swish(true);
    const backTo = opener.current;
    opener.current = null;
    focusNext.current = () => (backTo?.isConnected ? backTo : null);
    showToast(`Message sent to ${compose.to}.`);
  };

  /* ------------------------------ the parts ----------------------------- */

  const mailboxes = (variant: "pane" | "rail" | "screen") => (
    <Mailboxes
      variant={variant}
      idBase={idBase}
      account={account}
      current={current}
      counts={counts}
      labels={labels}
      labelFilter={labelFilter}
      storage={storage}
      motionSafe={motionSafe}
      disabled={disabled}
      onFolder={(f, by) => chooseFolder(f, by)}
      onLabel={(l, by) => chooseLabel(l, by)}
      onCompose={variant === "screen" ? undefined : openCompose}
    />
  );

  const searchField = (compact: boolean) => (
    <label
      className={cn(
        "relative flex h-8 min-w-0 items-center",
        compact ? "flex-1" : "w-full max-w-md",
      )}
    >
      <span className="sr-only">Search mail</span>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3"
      />
      <input
        ref={searchRef}
        type="search"
        placeholder="Search mail"
        autoComplete="off"
        value={query}
        disabled={status !== "ready"}
        onChange={(event) => {
          const text = event.currentTarget.value;
          setQuery(text);
          const t = text.trim().toLowerCase();
          if (t) {
            const n = listRef.current.filter(
              (x) =>
                x.folder === current &&
                (x.subject.toLowerCase().includes(t) ||
                  x.messages.some(
                    (m) =>
                      m.from.name.toLowerCase().includes(t) ||
                      m.body.toLowerCase().includes(t),
                  )),
            ).length;
            say(`${plural(n, "thread")} in ${folderLabel}.`);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && query) {
            event.preventDefault();
            setQuery("");
          }
        }}
        className={cn(
          "h-8 w-full rounded-2 border border-hairline bg-surface-1 pr-2 pl-8 text-[13px] text-foreground placeholder:text-ink-3 disabled:opacity-50",
          FOCUS_IN,
        )}
      />
    </label>
  );

  const filterChip = labelFilter ? (
    <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
      <button
        type="button"
        aria-label={`Clear the ${labelFilter} filter`}
        onClick={(event) => chooseLabel(labelFilter, event.currentTarget)}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 pr-1.5 pl-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
          FOCUS,
        )}
      >
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: tintOf(labelFilter) }}
        />
        {labelFilter}
        <X aria-hidden className="size-3.5 text-ink-3" />
      </button>
    </div>
  ) : null;

  const inbox = (
    <div
      data-mail-list=""
      className="grid h-full grid-rows-[auto_minmax(0,1fr)]"
    >
      {filterChip ?? <span />}
      <MailInbox
        threads={shown}
        onThreadsChange={(next) => {
          const byId = new Map(next.map((t) => [t.id, t]));
          const merged = listRef.current.map((t) => byId.get(t.id) ?? t);
          commit(merged);
          // A thread the list sent away while it was being read closes.
          const was = reading;
          const after = was ? byId.get(was.id) : undefined;
          if (was && after && after.folder !== was.folder) setOpen(null);
        }}
        folder={current}
        onFolderChange={(f) => chooseFolder(f)}
        open={null}
        onOpenChange={(id) => {
          if (id) openThread(id);
        }}
        density={density}
        preview={preview}
        now={nowMs}
        zoneOffset={zoneOffset}
        account={account}
        label={`${labelFilter ?? folderLabel} messages`}
        status={status}
        onRetry={onRetry}
        onArchive={onArchive}
        onSnooze={onSnooze}
        onReadChange={onReadChange}
        onStarChange={onStarChange}
        sound={sound}
        disabled={disabled}
        className="h-full rounded-none border-0 [&_nav]:hidden"
      />
    </div>
  );

  const readingPane = reading ? (
    <ReadingPane
      key={reading.id}
      thread={reading}
      account={account}
      now={nowMs}
      zoneOffset={zoneOffset}
      density={density}
      phone={phone}
      backLabel={labelFilter ?? folderLabel}
      motionSafe={motionSafe}
      sound={sound}
      disabled={disabled}
      hasPrev={at > 0}
      hasNext={at !== -1 && at < inFolder.length - 1}
      headingId={headingId}
      onBack={() => back()}
      onArchive={(by) =>
        move(reading, reading.folder === "archive" ? "inbox" : "archive", by)
      }
      onSnooze={(by) =>
        move(reading, reading.folder === "snoozed" ? "inbox" : "snoozed", by)
      }
      onStar={(by) => {
        const starred = !reading.starred;
        patch(reading.id, (x) => ({ ...x, starred }));
        audio.play("pop", {
          pitch: starred ? 1.3 : 0.9,
          gain: 0.45,
          pan: panOf(by),
        });
        onStarChange?.(reading.id, starred);
        say(starred ? "Starred." : "Star removed.");
      }}
      onUnread={() => {
        patch(reading.id, (x) => ({ ...x, unread: true }));
        onReadChange?.([reading.id], true);
        closeThread();
        say("Marked unread.");
      }}
      onDelete={() => {
        const gone = reading;
        commit(listRef.current.filter((t) => t.id !== gone.id));
        onDelete?.([gone.id]);
        leave(gone);
        say("Thread deleted.");
      }}
      onKeep={() => say("Kept.")}
      onStep={(dir) => {
        const next = inFolder[at + dir];
        if (!next) return;
        audio.play("swish", { pitch: dir > 0 ? 1.05 : 0.95, gain: 0.3 });
        openThread(next.id);
      }}
      onReply={(text, id) => reply(reading, text, id)}
    />
  ) : (
    <div className="flex h-full flex-col items-center-safe justify-center-safe gap-2 overflow-y-auto bg-card px-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
        <Mail aria-hidden className="size-4" />
      </span>
      <p className="text-sm font-medium text-foreground">No message open</p>
      <p className="max-w-64 text-xs text-ink-3">
        Pick a thread to read it here. j and k move, Enter opens.
      </p>
    </div>
  );

  const composeSheet = compose ? (
    <motion.div
      key="compose"
      role="dialog"
      aria-modal="true"
      aria-labelledby={composeTitleId}
      className={cn(
        "absolute z-40 flex flex-col overflow-hidden border-hairline-strong bg-popover shadow-[0_16px_40px_color-mix(in_oklab,black_24%,transparent)]",
        phone
          ? "inset-0"
          : "right-3 bottom-3 w-[min(380px,calc(100%-24px))] rounded-3 border",
      )}
      initial={
        motionSafe
          ? phone
            ? { y: "100%" }
            : { opacity: 0, y: distances.shift }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, y: 0 }}
      exit={
        motionSafe && phone
          ? { y: "100%", transition: exitFor(durations.slow) }
          : { opacity: 0, transition: exitFor() }
      }
      transition={
        motionSafe
          ? {
              y: phone ? springs.glide : springs.snap,
              opacity: { duration: durations.fast },
            }
          : { duration: durations.fast }
      }
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeCompose(true);
          return;
        }
        if (event.key !== "Tab") return;
        const nodes = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "input, textarea, button",
          ),
        ].filter((n) => !n.hasAttribute("disabled"));
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="flex h-11 items-center gap-2 border-b border-hairline pr-1.5 pl-3">
        <h2 id={composeTitleId} className="flex-1 text-[13px] font-semibold">
          New message
        </h2>
        <button
          type="button"
          aria-label="Close, keeping the draft"
          onClick={() => closeCompose(true)}
          className={TOOL}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <form
        className="flex flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          sendCompose();
        }}
      >
        <label className="flex items-center gap-2 border-b border-hairline px-3">
          <span className="w-14 shrink-0 text-xs text-ink-3">To</span>
          <input
            data-mail-to=""
            type="email"
            autoComplete="off"
            value={compose.to}
            aria-invalid={toError || undefined}
            aria-describedby={toError ? `${uid}-to-error` : undefined}
            onChange={(event) => {
              const to = event.currentTarget.value;
              setToError(false);
              setCompose((c) => (c ? { ...c, to } : c));
            }}
            className={cn(
              "h-10 min-w-0 flex-1 bg-transparent text-[13px] text-foreground",
              FOCUS_IN,
            )}
          />
        </label>
        {toError ? (
          <p
            id={`${uid}-to-error`}
            className="border-b border-hairline px-3 py-1.5 text-xs text-danger"
          >
            Add who it is to: an email address.
          </p>
        ) : null}
        <label className="flex items-center gap-2 border-b border-hairline px-3">
          <span className="w-14 shrink-0 text-xs text-ink-3">Subject</span>
          <input
            type="text"
            autoComplete="off"
            value={compose.subject}
            onChange={(event) => {
              const subject = event.currentTarget.value;
              setCompose((c) => (c ? { ...c, subject } : c));
            }}
            className={cn(
              "h-10 min-w-0 flex-1 bg-transparent text-[13px] text-foreground",
              FOCUS_IN,
            )}
          />
        </label>
        <textarea
          aria-label="Message"
          value={compose.body}
          rows={phone ? 10 : 6}
          onChange={(event) => {
            const body = event.currentTarget.value;
            setCompose((c) => (c ? { ...c, body } : c));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              sendCompose();
            }
          }}
          className={cn(
            "flex-1 resize-none bg-transparent px-3 py-2.5 text-[13px] leading-5 text-foreground",
            FOCUS_IN,
          )}
        />
        <div className="flex items-center justify-end gap-2 border-t border-hairline p-2.5">
          <button
            type="button"
            onClick={() => closeCompose(false)}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            Discard
          </button>
          <button
            type="submit"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
              FOCUS,
            )}
          >
            <Send aria-hidden className="size-3.5" />
            Send
          </button>
        </div>
      </form>
    </motion.div>
  ) : null;

  const composeButton = (
    <button
      type="button"
      aria-label="Compose"
      title="Compose"
      disabled={disabled}
      onClick={(event) => openCompose(event.currentTarget)}
      className={cn(TOOL, "disabled:opacity-40")}
    >
      <SquarePen aria-hidden className="size-4" />
    </button>
  );

  /* ------------------------------- layouts ------------------------------ */

  const blocked = !!compose || drawer;

  const phoneStack = (
    <div className="relative h-full w-full" inert={blocked}>
      {[
        <div key="boxes" className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex h-12 items-center gap-2 border-b border-hairline pr-2 pl-4">
            <h2 className="flex-1 text-sm font-semibold">Mailboxes</h2>
            {composeButton}
          </div>
          {mailboxes("screen")}
        </div>,
        <div key="list" className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex h-12 items-center gap-1.5 border-b border-hairline px-2">
            <button
              type="button"
              data-mail-back=""
              aria-label="Mailboxes"
              onClick={(event) => back(event.currentTarget)}
              className={TOOL}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            {searchField(true)}
            {composeButton}
          </div>
          {inbox}
        </div>,
        <div key="read" className="h-full">
          {reading ? readingPane : null}
        </div>,
      ].map((child, i) => (
        <StackScreen
          key={i}
          index={i}
          depth={depth}
          level={level}
          motionSafe={motionSafe}
        >
          {child}
          {i > 0 && i === level && motionSafe && !disabled ? (
            <EdgeBack
              width={W}
              level={level}
              depth={depth}
              onGrab={() => depthAnim.current?.stop()}
              onBack={() => back()}
            />
          ) : null}
        </StackScreen>
      ))}
    </div>
  );

  const wide = (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]" inert={blocked}>
      <div className="flex h-12 items-center gap-2 border-b border-hairline bg-surface-1 px-3">
        {folders === "drawer" ? (
          <button
            type="button"
            aria-label="Mailboxes"
            aria-expanded={drawer}
            onClick={(event) => {
              opener.current = event.currentTarget;
              setDrawer(true);
              swish(true, event.currentTarget);
              focusNext.current = () =>
                root?.querySelector<HTMLElement>(
                  "[data-mail-drawer] [aria-current='page']",
                );
            }}
            className={TOOL}
          >
            <Menu aria-hidden className="size-4" />
          </button>
        ) : null}
        <span
          className="flex shrink-0 items-center gap-2"
          style={{ width: folders === "pane" ? foldersW - 12 : undefined }}
        >
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-2 bg-cobalt-wash text-cobalt-bright"
          >
            <Mail className="size-3.5" />
          </span>
          {folders === "rail" ? null : (
            <span className="text-sm font-semibold">Mail</span>
          )}
        </span>
        {searchField(false)}
        <span className="flex-1" />
        {folders === "drawer" ? composeButton : null}
        <Avatar person={account} className="size-7 text-[10px]" />
      </div>
      <div
        className="grid h-full overflow-hidden"
        style={{
          gridTemplateColumns: `${foldersW ? `${foldersW}px ` : ""}${listW}px minmax(0,1fr)`,
        }}
      >
        {foldersW ? (
          <div className="overflow-hidden border-r border-hairline">
            {mailboxes(folders === "rail" ? "rail" : "pane")}
          </div>
        ) : null}
        <div className="overflow-hidden border-r border-hairline">{inbox}</div>
        <div className="@container relative overflow-hidden">{readingPane}</div>
      </div>
    </div>
  );

  return (
    <div
      ref={setRoot}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.defaultPrevented || blocked) return;
        const typing =
          event.target instanceof HTMLElement &&
          !!event.target.closest("input, textarea");
        if (event.key === "Escape" && phone && level > 0) {
          event.preventDefault();
          back();
          return;
        }
        if (event.key === "Escape" && !phone && reading) {
          event.preventDefault();
          closeThread();
          return;
        }
        if (event.altKey && event.key === "ArrowLeft" && phone && level > 0) {
          event.preventDefault();
          back();
          return;
        }
        if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === "/") {
          event.preventDefault();
          if (phone && level !== 1) {
            setOpen(null);
            setPhoneList(true);
            focusNext.current = () => searchRef.current;
          } else searchRef.current?.focus();
        } else if (event.key === "c") {
          event.preventDefault();
          const at = document.activeElement;
          if (at instanceof HTMLElement) openCompose(at);
        }
      }}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {phone ? phoneStack : wide}

      <AnimatePresence>
        {drawer && !phone ? (
          <motion.div
            key="scrim"
            aria-hidden
            className="absolute inset-0 z-30 bg-[color-mix(in_oklab,black_32%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor() }}
            transition={{ duration: durations.base }}
            onPointerDown={() => {
              setDrawer(false);
              swish(false);
              const backTo = opener.current;
              focusNext.current = () => backTo;
            }}
          />
        ) : null}
        {drawer && !phone ? (
          <motion.div
            key="drawer"
            data-mail-drawer=""
            role="dialog"
            aria-modal="true"
            aria-label="Mailboxes"
            className="absolute inset-y-0 left-0 z-40 w-60 border-r border-hairline-strong shadow-[0_12px_32px_color-mix(in_oklab,black_22%,transparent)]"
            initial={motionSafe ? { x: "-100%" } : { opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={
              motionSafe
                ? { x: "-100%", transition: exitFor(durations.slow) }
                : { opacity: 0, transition: exitFor() }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setDrawer(false);
                swish(false);
                const backTo = opener.current;
                focusNext.current = () => backTo;
                return;
              }
              if (event.key !== "Tab") return;
              const nodes = [
                ...event.currentTarget.querySelectorAll<HTMLElement>("button"),
              ];
              const first = nodes[0];
              const last = nodes[nodes.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }}
          >
            {mailboxes("pane")}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>{composeSheet}</AnimatePresence>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
        style={phone ? undefined : { left: foldersW + listW }}
      >
        <AnimatePresence>
          {toast ? (
            <motion.div
              key={toast.key}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-3 border border-hairline-strong bg-popover py-1.5 pr-1.5 pl-3 text-popover-foreground shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)]"
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
              {toast.undo ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.undo?.();
                    setToast(null);
                  }}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-2 px-2.5 text-[13px] font-medium text-cobalt-bright hover:bg-surface-2",
                    FOCUS,
                  )}
                >
                  Undo
                </button>
              ) : null}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setToast(null)}
                className={TOOL}
              >
                <X aria-hidden className="size-4" />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
