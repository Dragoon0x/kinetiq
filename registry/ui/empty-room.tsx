"use client";

import * as React from "react";

import { AnimatePresence, motion, useInView } from "motion/react";
import {
  FileText,
  Hand,
  Hash,
  Pin,
  RotateCcw,
  SendHorizontal,
  Trash2,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
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

export type RoomPerson = {
  id: string;
  name: string;
  /** What they do, under their name in the directory. */
  role?: string;
};

export type RoomInfo = {
  id: string;
  /** The room's name without the #. */
  name: string;
  /** One or two sentences on what the room is for. */
  purpose: string;
  /** A person's id. */
  createdBy?: string;
  /** When it was made, in ms. */
  createdAt: number;
};

export type RoomMessage = {
  id: string;
  /** A person's id. */
  author: string;
  /** When it was sent, in ms. */
  at: number;
  text: string;
};

export type RoomDoc = {
  id: string;
  title: string;
  /** "Doc", "Sheet", "Deck" — shown beside the title. */
  kind?: string;
};

export type RoomStatus = "ready" | "loading" | "error";
export type RoomBubbleStyle = "soft" | "flat" | "outline";
export type RoomAvatarShape = "round" | "square";
export type RoomDensity = "compact" | "cozy" | "roomy";

export type EmptyRoomProps = {
  /** How bubbles are finished: tinted fills, flat solid fills, or hairline outlines. @default "soft" */
  bubbleStyle?: RoomBubbleStyle;
  /** Avatars as circles or rounded squares. @default "round" */
  avatarShape?: RoomAvatarShape;
  /** Row padding, type size and avatar size. @default "cozy" */
  density?: RoomDensity;
  /** The room: its name, purpose and who made it. @default defaultRoom */
  room?: RoomInfo;
  /** Controlled members, in join order. */
  members?: RoomPerson[];
  /** Initial members when uncontrolled. @default defaultRoomMembers */
  defaultMembers?: RoomPerson[];
  /** Fires from the invite that changed the members, with all of them. */
  onMembersChange?: (members: RoomPerson[]) => void;
  /** Everyone who could be invited; those already in the room are left out of the picker. @default defaultRoomDirectory */
  directory?: RoomPerson[];
  /** Docs that can be pinned to the room. @default defaultRoomDocs */
  docs?: RoomDoc[];
  /** Controlled messages, oldest first. */
  messages?: RoomMessage[];
  /** Initial messages when uncontrolled. @default [] */
  defaultMessages?: RoomMessage[];
  /** Fires from the send, reply or clear that changed the list, with all of it. */
  onMessagesChange?: (messages: RoomMessage[]) => void;
  /** A message was sent from the composer. It is already in the list. */
  onSend?: (message: RoomMessage) => void;
  /** A person was picked from the invite row. They are already a member. */
  onInvite?: (person: RoomPerson) => void;
  /** A doc was pinned from the starter row. */
  onPinDoc?: (doc: RoomDoc) => void;
  /** Clear was pressed; the room is empty again. */
  onClear?: () => void;
  /** The viewer's person id: the author of what they send. @default "noor" */
  me?: string;
  /** Seeded members type and reply after the room's first message. @default true */
  autoReply?: boolean;
  /** The moment the first message is stamped with, in ms — never read from the clock. @default defaultRoomNow */
  now?: number;
  /** Prints a message's time. @default UTC "HH:MM" */
  formatTime?: (at: number) => string;
  /** Whether the room has arrived. @default "ready" */
  status?: RoomStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "#" + the room's name */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the room in px; the message pane scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be sent, invited or pinned. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 09:14 UTC — six minutes after the room was made. */
export const defaultRoomNow = Date.UTC(2026, 9, 12, 9, 14);

/** A Fieldline Rooms channel for the Ridgeline reservoir survey. */
export const defaultRoom: RoomInfo = {
  id: "ridgeline",
  name: "ridgeline-survey",
  purpose:
    "Planning the autumn survey of the Ridgeline reservoir: dates, crews and the kit list.",
  createdBy: "ines",
  createdAt: defaultRoomNow - 6 * MIN,
};

export const defaultRoomMembers: RoomPerson[] = [
  { id: "noor", name: "Noor Haddad", role: "Survey lead" },
  { id: "ines", name: "Ines Varga", role: "Operations" },
  { id: "tomas", name: "Tomas Reyes", role: "Field crew" },
  { id: "mara", name: "Mara Lind", role: "Hydrology" },
];

export const defaultRoomDirectory: RoomPerson[] = [
  { id: "kenji", name: "Kenji Aoki", role: "Logistics" },
  { id: "priya", name: "Priya Nair", role: "Safety" },
  { id: "sol", name: "Sol Marchetti", role: "Drone pilot" },
  { id: "ada", name: "Ada Okafor", role: "Data" },
  { id: "lukas", name: "Lukas Brandt", role: "Field crew" },
];

export const defaultRoomDocs: RoomDoc[] = [
  { id: "kit", title: "Survey kit list", kind: "Sheet" },
  { id: "plan", title: "Ridgeline survey plan", kind: "Doc" },
  { id: "safety", title: "Reservoir safety brief", kind: "Doc" },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

/** What the seeded members say back, in order; {first} is the sender's first name. */
const REPLIES = [
  "Hey {first}! Glad this room exists. I can take the Tuesday run.",
  "Morning. The kit list is nearly done, I will pin it once the drone batteries arrive.",
];

/** When a seeded reply starts typing and lands, in ms after the first message. */
const TYPE_AT = 700;
const LAND_AT = 2300;
const REPLY_GAP = 2600;

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

const utcTime = (at: number) => {
  const d = new Date(at);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

const utcDay = (at: number) => {
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const sameUtcDay = (a: number, b: number) =>
  Math.floor(a / 86_400_000) === Math.floor(b / 86_400_000);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** Avatars are washed from the status tokens so they read in both themes. */
const TONES = [
  "var(--accent)",
  "var(--signal)",
  "var(--success)",
  "var(--warn)",
];

const toneOf = (id: string) => {
  let h = 7;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return TONES[h % TONES.length] ?? "var(--accent)";
};

type Density = {
  /** Avatar size in px. */
  avatar: number;
  /** Avatar size in the header strip, px. */
  strip: number;
  /** Pane padding. */
  pad: string;
  /** Gap between messages. */
  gap: string;
  /** Bubble padding and text. */
  bubble: string;
  /** Card padding. */
  card: string;
  /** Composer textarea text. */
  text: string;
};

const DENSITY: Record<RoomDensity, Density> = {
  compact: {
    avatar: 24,
    strip: 22,
    pad: "px-3 py-2",
    gap: "gap-1.5",
    bubble: "px-2.5 py-1.5 text-[12px] leading-[1.4]",
    card: "px-4 py-4 @min-[40rem]:px-6 @min-[40rem]:py-5",
    text: "text-[13px]",
  },
  cozy: {
    avatar: 28,
    strip: 24,
    pad: "px-3 py-3 @min-[40rem]:px-4",
    gap: "gap-2.5",
    bubble: "px-3 py-2 text-[13px] leading-[1.45]",
    card: "px-5 py-5 @min-[40rem]:px-8 @min-[40rem]:py-7",
    text: "text-[14px]",
  },
  roomy: {
    avatar: 32,
    strip: 26,
    pad: "px-4 py-4 @min-[40rem]:px-6",
    gap: "gap-3.5",
    bubble: "px-3.5 py-2.5 text-[14px] leading-[1.5]",
    card: "px-6 py-6 @min-[40rem]:px-10 @min-[40rem]:py-9",
    text: "text-[15px]",
  },
};

const noopSubscribe = () => () => {};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** True while the tab is visible; true on the server and for hydration. */
const usePageVisible = () =>
  React.useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );

/* ----------------------------------------------------------------------- */
/*                                  Avatar                                  */
/* ----------------------------------------------------------------------- */

function Avatar({
  person,
  shape,
  size,
  ring,
  className,
}: {
  person: RoomPerson;
  shape: RoomAvatarShape;
  size: number;
  /** A card-coloured ring, for avatars that overlap in a strip. */
  ring?: boolean;
  className?: string;
}) {
  const tone = toneOf(person.id);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-semibold select-none",
        shape === "round" ? "rounded-full" : "rounded-2",
        ring && "ring-2 ring-card",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `color-mix(in oklab, ${tone} 24%, var(--bg-2))`,
        color: `color-mix(in oklab, ${tone} 70%, var(--ink))`,
      }}
    >
      {initialsOf(person.name)}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Inline picker                               */
/* ----------------------------------------------------------------------- */

type PickItem = {
  id: string;
  primary: string;
  secondary?: string;
  person?: RoomPerson;
};

type InlinePickerProps = {
  id: string;
  label: string;
  items: PickItem[];
  emptyText: string;
  avatarShape: RoomAvatarShape;
  motionSafe: boolean;
  onPick: (item: PickItem) => void;
  onClose: () => void;
};

/**
 * A listbox that opens under the starter buttons. It takes focus when it
 * opens, arrows move the active option, Enter or Space picks it, Escape
 * closes it and hands focus back.
 */
function InlinePicker({
  id,
  label,
  items,
  emptyText,
  avatarShape,
  motionSafe,
  onPick,
  onClose,
}: InlinePickerProps) {
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const current = items[clamp(active, 0, Math.max(0, items.length - 1))];

  React.useEffect(() => {
    boxRef.current?.focus({ preventScroll: true });
  }, []);

  // Keeps the active option in view when arrows run past the edge.
  React.useEffect(() => {
    const node = boxRef.current?.querySelector<HTMLElement>(
      `[data-pick="${current?.id ?? ""}"]`,
    );
    node?.scrollIntoView?.({ block: "nearest" });
  }, [current?.id]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (items.length === 0) return;
    let to: number | null = null;
    if (event.key === "ArrowDown") to = active + 1;
    else if (event.key === "ArrowUp") to = active - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = items.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (current) onPick(current);
      return;
    }
    if (to === null) return;
    event.preventDefault();
    setActive(clamp(to, 0, items.length - 1));
  };

  return (
    <motion.div
      key={id}
      className="overflow-hidden"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: exitFor(durations.base) }}
      transition={
        motionSafe
          ? {
              height: springs.snap,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
    >
      <div className="pt-3">
        <div
          ref={boxRef}
          id={id}
          role="listbox"
          aria-label={label}
          aria-activedescendant={current ? `${id}-${current.id}` : undefined}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className={cn(
            "flex max-h-44 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1.5 text-left",
            FOCUS_RING,
          )}
        >
          {items.length === 0 ? (
            <p className="px-2 py-2 text-[12px] text-ink-3">{emptyText}</p>
          ) : (
            items.map((item, i) => {
              const isActive = current?.id === item.id;
              return (
                <div
                  key={item.id}
                  id={`${id}-${item.id}`}
                  data-pick={item.id}
                  role="option"
                  aria-selected={isActive}
                  onPointerMove={() => {
                    if (!isActive) setActive(i);
                  }}
                  onClick={() => onPick(item)}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2.5 rounded-2 px-2 transition-colors",
                    isActive ? "bg-surface-2 text-foreground" : "text-ink-2",
                  )}
                >
                  {item.person ? (
                    <Avatar
                      person={item.person}
                      shape={avatarShape}
                      size={24}
                    />
                  ) : (
                    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2">
                      <FileText aria-hidden className="size-3.5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {item.primary}
                  </span>
                  {item.secondary ? (
                    <span className="shrink-0 font-mono text-[10px] text-ink-3">
                      {item.secondary}
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <p className={cn("mt-1.5 px-1", LABEL)}>
          Arrows move · Enter picks · Esc closes
        </p>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Typing dots                                 */
/* ----------------------------------------------------------------------- */

function TypingDots({ live }: { live: boolean }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-0.5">
      {[0, 1, 2].map((k) => (
        <motion.span
          key={k}
          className="size-1 rounded-full bg-ink-3"
          animate={live ? { opacity: [0.25, 1, 0.25] } : { opacity: 0.7 }}
          transition={
            live
              ? {
                  duration: 1.1,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: k * 0.16,
                }
              : { duration: 0 }
          }
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Skeleton                                 */
/* ----------------------------------------------------------------------- */

function Skeleton({ d }: { d: Density }) {
  const block = "rounded-2 bg-surface-2 motion-safe:animate-pulse";
  return (
    <div aria-hidden className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex flex-1 flex-col items-center", d.pad)}>
        <div
          className={cn(
            "my-auto flex w-full max-w-md flex-col items-center gap-3 rounded-4 border border-hairline",
            d.card,
          )}
        >
          <span className={cn("size-10 rounded-full", block)} />
          <span className={cn("h-4 w-40", block)} />
          <span className={cn("h-3 w-64 max-w-full", block)} />
          <span
            className={cn("h-3 w-48 max-w-full", block)}
            style={{ animationDelay: "90ms" }}
          />
          <div className="mt-2 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn("h-7 w-20", block)}
                style={{ animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-hairline px-3 py-2.5">
        <span className={cn("block h-10 w-full", block)} />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Picker = "invite" | "docs" | null;
type CardPhase = "open" | "closing" | "closed";
type StarterKey = "hello" | "invite" | "pin";

/** The three starter actions, in toolbar order. */
const STARTERS: {
  key: StarterKey;
  label: string;
  icon: LucideIcon;
  expands?: Exclude<Picker, null>;
}[] = [
  { key: "hello", label: "Say hello", icon: Hand },
  { key: "invite", label: "Invite someone", icon: UserPlus, expands: "invite" },
  { key: "pin", label: "Pin a doc", icon: Pin, expands: "docs" },
];

/**
 * A chat channel before anyone has spoken. The header carries the room's name
 * and a strip of member avatars; under it the message pane, then a composer.
 * Empty, the pane shows the room's purpose card: who is here, as avatars that
 * drift in on `springs.glide` in a cascade, and three starter actions. Say
 * hello drops a seeded greeting into the composer. Invite someone opens an
 * inline listbox of the directory, and the picked person's avatar lands in
 * the header strip on `springs.recoil` while their chip joins the strip on
 * `springs.glide`. Pin a doc does the same with a doc, landing a pinned chip
 * under the header.
 *
 * Sending the first message collapses the card: its height runs to zero on
 * `springs.glide` while the message lands as the first bubble on
 * `springs.recoil` under the room's first timestamp divider. After a beat a
 * seeded member starts typing — three dots that pulse only while they are
 * typing, the tab is visible and the room is on screen — and their reply
 * slides in on `springs.glide` as the dots stop. Clear returns the room to
 * its empty state and the card fades back in with its cascade.
 *
 * The composer is a textarea: Enter sends, Shift+Enter breaks a line. The
 * starter actions are a toolbar (Left/Right), the pickers are listboxes
 * (arrows, Enter, Escape) and the messages are a list with one tab stop
 * (Up/Down, Home/End). Under reduced motion nothing travels: the card
 * cross-fades out, bubbles and avatars appear in place, the dots hold still,
 * and every change is still announced.
 */
export function EmptyRoom({
  bubbleStyle = "soft",
  avatarShape = "round",
  density = "cozy",
  room = defaultRoom,
  members,
  defaultMembers = defaultRoomMembers,
  onMembersChange,
  directory = defaultRoomDirectory,
  docs = defaultRoomDocs,
  messages,
  defaultMessages,
  onMessagesChange,
  onSend,
  onInvite,
  onPinDoc,
  onClear,
  me = "noor",
  autoReply = true,
  now = defaultRoomNow,
  formatTime = utcTime,
  status = "ready",
  onRetry,
  title,
  label,
  height = 540,
  disabled = false,
  className,
}: EmptyRoomProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const composerId = `${uid}-composer`;
  const pickerId = `${uid}-picker`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const heading = title ?? `#${room.name}`;

  const [ownMembers, setOwnMembers] =
    React.useState<RoomPerson[]>(defaultMembers);
  const people = members ?? ownMembers;
  const [ownMessages, setOwnMessages] = React.useState<RoomMessage[]>(
    () => defaultMessages ?? [],
  );
  const msgs = messages ?? ownMessages;
  // The latest lists, for timers that land a reply a render or two later.
  const latest = React.useRef(msgs);
  const membersRef = React.useRef(people);
  React.useEffect(() => {
    latest.current = msgs;
    membersRef.current = people;
  });

  const ready = status === "ready";
  const inert = disabled || !ready;
  const hasMessages = msgs.length > 0;

  const [draft, setDraft] = React.useState("");
  const [picker, setPicker] = React.useState<Picker>(null);
  const [pinned, setPinned] = React.useState<RoomDoc[]>([]);
  const [typing, setTyping] = React.useState<string[]>([]);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [pinLanded, setPinLanded] = React.useState<string | null>(null);
  const [activeAction, setActiveAction] = React.useState(0);
  const [activeMsg, setActiveMsg] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // False for the server render and hydration, so messages already on the
  // page never land again; true for anything that mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const visible = usePageVisible();

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const paneRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const actionNodes = React.useRef(new Map<number, HTMLButtonElement>());
  const msgNodes = React.useRef(new Map<string, HTMLLIElement>());
  const timers = React.useRef<number[]>([]);
  const seq = React.useRef(0);
  const inView = useInView(rootRef, { amount: 0 });

  /* ------------------------------ the card ----------------------------- */

  // The card is "open" while the room is empty. The first message starts it
  // closing (a height animation), and it leaves the tree once that settles.
  // Clearing the room opens it again.
  const [card, setCard] = React.useState<CardPhase>(
    hasMessages ? "closed" : "open",
  );
  if (!hasMessages && card !== "open") setCard("open");
  if (hasMessages && card === "open")
    setCard(motionSafe ? "closing" : "closed");

  /* ------------------------------- timers ------------------------------ */

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };

  const cancelTimers = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  };

  React.useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  /* ------------------------------ messages ----------------------------- */

  const commitMessages = (next: RoomMessage[]) => {
    latest.current = next;
    if (messages === undefined) setOwnMessages(next);
    onMessagesChange?.(next);
  };

  const nameOf = (id: string) =>
    id === me
      ? "You"
      : (people.find((p) => p.id === id)?.name ??
        directory.find((p) => p.id === id)?.name ??
        id);

  const meName = people.find((p) => p.id === me)?.name ?? "";

  const send = () => {
    const text = draft.trim();
    if (inert || !text) return;
    seq.current += 1;
    const first = latest.current.length === 0;
    const stamp = now + (latest.current.length === 0 ? 0 : seq.current * MIN);
    const message: RoomMessage = {
      id: `m-${uid}-${seq.current}`,
      author: me,
      at: stamp,
      text,
    };
    commitMessages([...latest.current, message]);
    onSend?.(message);
    setDraft("");
    setActiveMsg(message.id);
    if (textareaRef.current) textareaRef.current.style.height = "";
    say(first ? "First message sent." : "Message sent.");
    if (first && autoReply) queueReplies(message);
  };

  const queueReplies = (sent: RoomMessage) => {
    const repliers = membersRef.current.filter((p) => p.id !== me).slice(0, 2);
    const first = firstName(meName) || "there";
    repliers.forEach((person, k) => {
      const text = (REPLIES[k] ?? REPLIES[0] ?? "").replace("{first}", first);
      schedule(
        () => {
          setTyping((t) => (t.includes(person.id) ? t : [...t, person.id]));
          say(`${person.name} is typing.`);
        },
        TYPE_AT + k * REPLY_GAP,
      );
      schedule(
        () => {
          setTyping((t) => t.filter((id) => id !== person.id));
          // The room may have been cleared while they typed.
          if (!latest.current.some((m) => m.id === sent.id)) return;
          seq.current += 1;
          const reply: RoomMessage = {
            id: `m-${uid}-${seq.current}`,
            author: person.id,
            at: sent.at + (k + 1) * MIN,
            text,
          };
          commitMessages([...latest.current, reply]);
          say(`${person.name} replied: ${text}`);
        },
        LAND_AT + k * REPLY_GAP,
      );
    });
  };

  const clearRoom = () => {
    if (inert || (!hasMessages && typing.length === 0)) return;
    cancelTimers();
    setTyping([]);
    commitMessages([]);
    setActiveMsg(null);
    onClear?.();
    say("Room cleared. It is empty again.");
  };

  // The pane keeps the newest message in view.
  const count = msgs.length;
  const typingCount = typing.length;
  React.useEffect(() => {
    const pane = paneRef.current;
    if (!pane || count === 0) return;
    pane.scrollTo({
      top: pane.scrollHeight,
      behavior: motionSafe ? "smooth" : "auto",
    });
  }, [count, typingCount, motionSafe]);

  /* ------------------------------ starters ----------------------------- */

  const greeting = `Hello everyone! First message in #${room.name}. What should we tackle first?`;

  const sayHello = () => {
    if (inert) return;
    setDraft(greeting);
    setPicker(null);
    say("Greeting dropped into the composer. Enter sends it.");
    const node = textareaRef.current;
    if (node) {
      node.focus({ preventScroll: true });
      // Caret after the greeting, once the value has landed.
      window.requestAnimationFrame(() => {
        node.setSelectionRange(node.value.length, node.value.length);
        node.style.height = "";
        node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
      });
    }
  };

  const invitable = directory.filter((p) => !people.some((m) => m.id === p.id));
  const pinnable = docs.filter((doc) => !pinned.some((p) => p.id === doc.id));

  const togglePicker = (which: Exclude<Picker, null>) => {
    if (inert) return;
    setPicker((p) => {
      const next = p === which ? null : which;
      if (next === "invite") {
        say(
          invitable.length === 0
            ? "Invite row open. Everyone in the directory is already here."
            : `Invite row open: ${invitable.length} ${invitable.length === 1 ? "person" : "people"} to pick from.`,
        );
      } else if (next === "docs") {
        say(
          pinnable.length === 0
            ? "Pin row open. Every doc is pinned."
            : `Pin row open: ${pinnable.length} ${pinnable.length === 1 ? "doc" : "docs"} to pick from.`,
        );
      }
      return next;
    });
  };

  const closePicker = () => {
    const was = picker;
    setPicker(null);
    const back = was === "invite" ? 1 : was === "docs" ? 2 : null;
    if (back !== null)
      actionNodes.current.get(back)?.focus({ preventScroll: true });
  };

  const invite = (person: RoomPerson) => {
    if (inert) return;
    const next = [...people, person];
    if (members === undefined) setOwnMembers(next);
    onMembersChange?.(next);
    onInvite?.(person);
    setLanded(person.id);
    say(`${person.name} joined the room. ${next.length} here.`);
    closePicker();
  };

  const pinDoc = (doc: RoomDoc) => {
    if (inert) return;
    setPinned((p) => [...p, doc]);
    setPinLanded(doc.id);
    onPinDoc?.(doc);
    say(`Pinned ${doc.title}.`);
    closePicker();
  };

  const onActionNav = (event: React.KeyboardEvent, i: number) => {
    let to: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = 2;
    else if (event.key === "Escape" && picker) {
      event.preventDefault();
      setPicker(null);
      return;
    }
    if (to === null) return;
    event.preventDefault();
    const target = clamp(to, 0, 2);
    setActiveAction(target);
    actionNodes.current.get(target)?.focus({ preventScroll: true });
  };

  /* ------------------------------ composer ----------------------------- */

  const onComposerKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  };

  const grow = (node: HTMLTextAreaElement) => {
    node.style.height = "";
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  };

  /* ------------------------------ messages ----------------------------- */

  const activeMessage =
    activeMsg && msgs.some((m) => m.id === activeMsg)
      ? activeMsg
      : (msgs[msgs.length - 1]?.id ?? null);

  const onMessageNav = (event: React.KeyboardEvent, i: number) => {
    let to: number | null = null;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = msgs.length - 1;
    if (to === null) return;
    event.preventDefault();
    const target = msgs[clamp(to, 0, msgs.length - 1)];
    if (target) {
      setActiveMsg(target.id);
      msgNodes.current.get(target.id)?.focus({ preventScroll: true });
    }
  };

  const bubbleClass = (own: boolean) => {
    if (bubbleStyle === "flat") {
      return own
        ? "bg-primary text-primary-foreground"
        : "bg-surface-2 text-foreground";
    }
    if (bubbleStyle === "outline") {
      return own
        ? "border border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] bg-transparent text-foreground"
        : "border border-hairline-strong bg-transparent text-foreground";
    }
    return own
      ? "bg-cobalt-wash text-foreground"
      : "bg-surface-1 text-foreground";
  };

  /* ------------------------------- render ------------------------------ */

  const creator = room.createdBy ? nameOf(room.createdBy) : null;
  const createdLabel = sameUtcDay(room.createdAt, now)
    ? `today at ${formatTime(room.createdAt)}`
    : `on ${utcDay(room.createdAt)}`;
  const stripPeople = people.slice(0, 5);
  const stripMore = people.length - stripPeople.length;
  const whoStep = cascade(Math.max(people.length, 1));
  const firstAt = msgs[0]?.at ?? now;
  const typingPeople = typing
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is RoomPerson => !!p);
  const typingText =
    typingPeople.length === 0
      ? ""
      : typingPeople.length === 1
        ? `${firstName(typingPeople[0]?.name ?? "")} is typing`
        : `${typingPeople.map((p) => firstName(p.name)).join(" and ")} are typing`;
  const dotsLive = motionSafe && visible && inView && typingPeople.length > 0;
  const canClear = !inert && (hasMessages || typing.length > 0);

  const pressStarter = (key: StarterKey) => {
    if (key === "hello") sayHello();
    else if (key === "invite") togglePicker("invite");
    else togglePicker("docs");
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Enter sends. Shift and Enter starts a new line.
      </p>

      {/* ------------------------------ header ---------------------------- */}
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-3 py-2.5 @min-[40rem]:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2">
            <Hash aria-hidden className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold">
              {heading}
            </p>
            {ready ? (
              <p className="hidden truncate text-[11px] text-ink-3 @min-[40rem]:block">
                {room.purpose}
              </p>
            ) : null}
          </div>
        </div>
        {ready ? (
          <div className="flex shrink-0 items-center gap-2.5">
            <div
              className="flex items-center"
              aria-label={`${people.length} ${people.length === 1 ? "member" : "members"}: ${people.map((p) => p.name).join(", ")}`}
              role="img"
            >
              <div className="flex items-center" style={{ paddingLeft: 6 }}>
                <AnimatePresence initial={false}>
                  {stripPeople.map((person, i) => (
                    <motion.span
                      key={person.id}
                      layout={motionSafe ? "position" : false}
                      className="relative inline-flex"
                      style={{ marginLeft: -6, zIndex: i + 1 }}
                      initial={
                        live
                          ? {
                              opacity: 0,
                              scale: motionSafe ? 0.4 : 1,
                              y: motionSafe ? -distances.step : 0,
                            }
                          : false
                      }
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              layout: springs.glide,
                              scale:
                                person.id === landed
                                  ? springs.recoil
                                  : springs.snap,
                              y:
                                person.id === landed
                                  ? springs.recoil
                                  : springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <Avatar
                        person={person}
                        shape={avatarShape}
                        size={d.strip}
                        ring
                      />
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
              {stripMore > 0 ? (
                <span className="ml-1 font-mono text-[11px] text-ink-3">
                  +{stripMore}
                </span>
              ) : null}
            </div>
            <span className="hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[30rem]:inline">
              {people.length} here
            </span>
            <button
              type="button"
              onClick={clearRoom}
              aria-disabled={!canClear || undefined}
              aria-label="Clear the room"
              title="Clear the room"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
                canClear
                  ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                  : "cursor-default text-ink-3",
                FOCUS_RING,
              )}
            >
              <Trash2 aria-hidden className="size-3.5" />
              <span className="hidden @min-[30rem]:inline">Clear</span>
            </button>
          </div>
        ) : null}
      </header>

      {/* --------------------------- pinned docs -------------------------- */}
      <AnimatePresence initial={false}>
        {ready && pinned.length > 0 ? (
          <motion.div
            key="pinned"
            className="shrink-0 overflow-hidden border-b border-hairline"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            <ul
              role="list"
              aria-label="Pinned docs"
              className="flex flex-wrap items-center gap-1.5 px-3 py-2 @min-[40rem]:px-4"
            >
              <li className={cn("mr-1", LABEL)}>Pinned</li>
              {pinned.map((doc) => (
                <motion.li
                  key={doc.id}
                  layout={motionSafe ? "position" : false}
                  initial={
                    live ? { opacity: 0, scale: motionSafe ? 0.6 : 1 } : false
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    motionSafe
                      ? {
                          layout: springs.glide,
                          scale:
                            doc.id === pinLanded
                              ? springs.recoil
                              : springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 pr-2.5 pl-1.5 text-[11px] text-ink-2"
                >
                  <Pin aria-hidden className="size-3 text-cobalt-bright" />
                  <span className="max-w-[12rem] truncate">{doc.title}</span>
                  {doc.kind ? (
                    <span className="font-mono text-[10px] text-ink-3">
                      {doc.kind}
                    </span>
                  ) : null}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ------------------------------- pane ----------------------------- */}
      {status === "loading" ? (
        <Skeleton d={d} />
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The room didn&apos;t load.</p>
          <p className="max-w-xs text-[12px] text-ink-3">
            Its members and messages could not be fetched.
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
      ) : (
        <>
          <div
            ref={paneRef}
            className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <div className={cn("flex min-h-full flex-col", d.pad)}>
              {/* ---------------------------- card ------------------------ */}
              <AnimatePresence initial={false}>
                {card !== "closed" ? (
                  <motion.div
                    key="card"
                    className={cn(
                      "shrink-0 overflow-hidden",
                      !hasMessages && "my-auto",
                    )}
                    initial={live ? { opacity: 0 } : false}
                    animate={
                      card === "closing"
                        ? { height: 0, opacity: 0 }
                        : { height: "auto", opacity: 1 }
                    }
                    exit={{ opacity: 0, transition: exitFor(durations.base) }}
                    transition={{
                      height: springs.glide,
                      opacity:
                        card === "closing"
                          ? { duration: durations.base, ease: easings.exit }
                          : { duration: durations.base, ease: easings.enter },
                    }}
                    onAnimationComplete={() => {
                      if (card === "closing") setCard("closed");
                    }}
                  >
                    <div
                      className={cn(
                        "mx-auto flex w-full max-w-lg flex-col rounded-4 border border-hairline bg-surface-0",
                        d.card,
                      )}
                      aria-hidden={card === "closing" || undefined}
                    >
                      <div className="flex flex-col items-center text-center">
                        <motion.span
                          aria-hidden
                          className="inline-flex size-11 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright"
                          initial={live && motionSafe ? { scale: 0.6 } : false}
                          animate={{ scale: 1 }}
                          transition={springs.recoil}
                        >
                          <Hash className="size-5" />
                        </motion.span>
                        <h3 className="mt-3 text-base font-semibold">
                          Welcome to #{room.name}
                        </h3>
                        <p className="mt-1.5 max-w-sm text-[13px] text-ink-2">
                          {room.purpose}
                        </p>
                        <p className={cn("mt-2", LABEL)}>
                          {creator ? `Made by ${creator} ` : "Made "}
                          {createdLabel} · nothing said yet
                        </p>
                      </div>

                      {/* -------------------- who's here -------------------- */}
                      <div className="mt-5">
                        <p className={LABEL}>Who&apos;s here</p>
                        {people.length === 0 ? (
                          <p className="mt-2 text-[12px] text-ink-3">
                            Just you so far. Invite someone to get started.
                          </p>
                        ) : (
                          <ul
                            role="list"
                            aria-label="Members"
                            className="mt-2 flex flex-wrap gap-1.5"
                          >
                            <AnimatePresence>
                              {people.map((person, i) => {
                                const isLanding = person.id === landed;
                                return (
                                  <motion.li
                                    key={person.id}
                                    layout={motionSafe ? "position" : false}
                                    initial={{
                                      opacity: 0,
                                      x:
                                        motionSafe && !isLanding
                                          ? -distances.shift
                                          : 0,
                                      scale: motionSafe && isLanding ? 0.6 : 1,
                                    }}
                                    animate={{ opacity: 1, x: 0, scale: 1 }}
                                    exit={{
                                      opacity: 0,
                                      transition: exitFor(durations.fast),
                                    }}
                                    transition={
                                      motionSafe
                                        ? {
                                            layout: springs.glide,
                                            x: {
                                              ...springs.glide,
                                              delay: isLanding
                                                ? 0
                                                : r3(Math.min(i, 10) * whoStep),
                                            },
                                            scale: springs.recoil,
                                            opacity: {
                                              duration: durations.base,
                                              ease: easings.enter,
                                              delay: isLanding
                                                ? 0
                                                : r3(Math.min(i, 10) * whoStep),
                                            },
                                          }
                                        : { duration: durations.fast }
                                    }
                                    className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-card pr-2.5 pl-0.5 text-[12px] text-ink-2"
                                  >
                                    <Avatar
                                      person={person}
                                      shape={avatarShape}
                                      size={22}
                                    />
                                    <span className="whitespace-nowrap">
                                      {person.id === me
                                        ? "You"
                                        : firstName(person.name)}
                                    </span>
                                  </motion.li>
                                );
                              })}
                            </AnimatePresence>
                          </ul>
                        )}
                      </div>

                      {/* ------------------- starter actions ---------------- */}
                      <div className="mt-5">
                        <p className={LABEL}>Get started</p>
                        <div
                          role="toolbar"
                          aria-label="Get started"
                          className="mt-2 flex flex-wrap gap-1.5"
                        >
                          {STARTERS.map((action, i) => {
                            const open =
                              action.expands !== undefined &&
                              picker === action.expands;
                            return (
                              <button
                                key={action.key}
                                ref={(node) => {
                                  if (node) actionNodes.current.set(i, node);
                                  else actionNodes.current.delete(i);
                                }}
                                type="button"
                                tabIndex={activeAction === i ? 0 : -1}
                                aria-disabled={inert || undefined}
                                aria-expanded={
                                  action.expands ? open : undefined
                                }
                                aria-controls={open ? pickerId : undefined}
                                onFocus={() => setActiveAction(i)}
                                onClick={() => pressStarter(action.key)}
                                onKeyDown={(event) => onActionNav(event, i)}
                                className={cn(
                                  "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-xs font-medium transition-colors",
                                  open
                                    ? "border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] bg-cobalt-wash text-cobalt-bright"
                                    : "border-hairline bg-card text-ink-2 hover:bg-surface-2 hover:text-foreground",
                                  inert
                                    ? "cursor-not-allowed"
                                    : "cursor-pointer",
                                  FOCUS_RING,
                                )}
                              >
                                <action.icon aria-hidden className="size-3.5" />
                                {action.label}
                              </button>
                            );
                          })}
                        </div>
                        <AnimatePresence initial={false} mode="wait">
                          {picker === "invite" ? (
                            <InlinePicker
                              key="invite"
                              id={pickerId}
                              label="Invite someone"
                              items={invitable.map((p) => ({
                                id: p.id,
                                primary: p.name,
                                secondary: p.role,
                                person: p,
                              }))}
                              emptyText="Everyone in the directory is already here."
                              avatarShape={avatarShape}
                              motionSafe={motionSafe}
                              onPick={(item) => {
                                if (item.person) invite(item.person);
                              }}
                              onClose={closePicker}
                            />
                          ) : picker === "docs" ? (
                            <InlinePicker
                              key="docs"
                              id={pickerId}
                              label="Pin a doc"
                              items={pinnable.map((doc) => ({
                                id: doc.id,
                                primary: doc.title,
                                secondary: doc.kind,
                              }))}
                              emptyText="Every doc is already pinned."
                              avatarShape={avatarShape}
                              motionSafe={motionSafe}
                              onPick={(item) => {
                                const doc = docs.find((x) => x.id === item.id);
                                if (doc) pinDoc(doc);
                              }}
                              onClose={closePicker}
                            />
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* -------------------------- messages ---------------------- */}
              {hasMessages ? (
                <div className="mt-auto flex flex-col pt-2">
                  <motion.div
                    role="separator"
                    aria-label={`${sameUtcDay(firstAt, now) ? "Today" : utcDay(firstAt)}, ${formatTime(firstAt)}`}
                    className="flex items-center gap-3 py-2"
                    initial={live ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                      delay: motionSafe ? durations.fast : 0,
                    }}
                  >
                    <span aria-hidden className="h-px flex-1 bg-hairline" />
                    <span aria-hidden className={LABEL}>
                      {sameUtcDay(firstAt, now) ? "Today" : utcDay(firstAt)} ·{" "}
                      {formatTime(firstAt)}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-hairline" />
                  </motion.div>
                  <ol
                    role="list"
                    aria-label="Messages"
                    className={cn("flex flex-col", d.gap)}
                  >
                    <AnimatePresence initial={false}>
                      {msgs.map((m, i) => {
                        const own = m.author === me;
                        const author = own
                          ? people.find((p) => p.id === me)
                          : (people.find((p) => p.id === m.author) ??
                            directory.find((p) => p.id === m.author));
                        const prev = msgs[i - 1];
                        const run = prev?.author === m.author;
                        return (
                          <motion.li
                            key={m.id}
                            ref={(node) => {
                              if (node) msgNodes.current.set(m.id, node);
                              else msgNodes.current.delete(m.id);
                            }}
                            layout={motionSafe ? "position" : false}
                            tabIndex={m.id === activeMessage ? 0 : -1}
                            aria-label={`${nameOf(m.author)}, ${formatTime(m.at)}: ${m.text}`}
                            onFocus={() => setActiveMsg(m.id)}
                            onKeyDown={(event) => onMessageNav(event, i)}
                            initial={
                              live
                                ? {
                                    opacity: 0,
                                    y: motionSafe ? distances.step : 0,
                                    x: motionSafe && !own ? -distances.step : 0,
                                    scale: motionSafe && own ? 0.94 : 1,
                                  }
                                : false
                            }
                            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={
                              motionSafe
                                ? {
                                    layout: springs.glide,
                                    y: own ? springs.recoil : springs.glide,
                                    x: springs.glide,
                                    scale: springs.recoil,
                                    opacity: { duration: durations.fast },
                                  }
                                : { duration: durations.fast }
                            }
                            className={cn(
                              "flex max-w-full items-end gap-2 rounded-3",
                              own ? "flex-row-reverse" : "flex-row",
                              FOCUS_RING,
                            )}
                            style={{ originX: own ? 1 : 0, originY: 1 }}
                          >
                            <span
                              className="shrink-0"
                              style={{ width: d.avatar, height: d.avatar }}
                            >
                              {!run && author ? (
                                <Avatar
                                  person={author}
                                  shape={avatarShape}
                                  size={d.avatar}
                                />
                              ) : null}
                            </span>
                            <div
                              className={cn(
                                "flex max-w-[78%] min-w-0 flex-col @min-[40rem]:max-w-[64%]",
                                own ? "items-end" : "items-start",
                              )}
                            >
                              {!run ? (
                                <p
                                  aria-hidden
                                  className="mb-1 flex items-baseline gap-1.5 px-1 text-[11px] text-ink-3"
                                >
                                  <span className="font-medium text-ink-2">
                                    {nameOf(m.author)}
                                  </span>
                                  <span className="font-mono text-[10px] tabular-nums">
                                    {formatTime(m.at)}
                                  </span>
                                </p>
                              ) : null}
                              <div
                                className={cn(
                                  "rounded-3 [overflow-wrap:anywhere] whitespace-pre-wrap",
                                  own ? "rounded-br-1" : "rounded-bl-1",
                                  d.bubble,
                                  bubbleClass(own),
                                )}
                              >
                                {m.text}
                              </div>
                            </div>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ol>
                </div>
              ) : null}
            </div>
          </div>

          {/* ----------------------------- composer ------------------------ */}
          <div className="relative shrink-0 border-t border-hairline px-3 pt-2.5 pb-2.5 @min-[40rem]:px-4">
            <AnimatePresence>
              {typingText ? (
                <motion.p
                  key="typing"
                  role="status"
                  className="pointer-events-none absolute bottom-full left-3 mb-1.5 inline-flex h-6 max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 text-[11px] text-ink-3 shadow-[0_2px_8px_color-mix(in_oklab,black_8%,transparent)] @min-[40rem]:left-4"
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <TypingDots live={dotsLive} />
                  <span className="truncate">{typingText}</span>
                </motion.p>
              ) : null}
            </AnimatePresence>
            <div
              className={cn(
                "flex items-end gap-2 rounded-3 border border-hairline bg-surface-0 py-1.5 pr-1.5 pl-3 transition-colors focus-within:border-hairline-strong",
                inert && "opacity-70",
              )}
            >
              <label htmlFor={composerId} className="sr-only">
                Message #{room.name}
              </label>
              <textarea
                ref={textareaRef}
                id={composerId}
                rows={1}
                value={draft}
                disabled={inert}
                aria-describedby={hintId}
                placeholder={
                  hasMessages
                    ? `Message #${room.name}`
                    : `Say something in #${room.name}`
                }
                onChange={(event) => {
                  setDraft(event.target.value);
                  grow(event.currentTarget);
                }}
                onKeyDown={onComposerKey}
                className={cn(
                  "max-h-[120px] min-h-[1.5rem] w-full min-w-0 flex-1 resize-none bg-transparent py-1 leading-6 text-foreground outline-none placeholder:text-ink-3",
                  d.text,
                )}
              />
              <motion.button
                type="button"
                onClick={send}
                aria-disabled={inert || !draft.trim() || undefined}
                aria-label="Send"
                whileTap={!inert && draft.trim() ? { scale: 0.92 } : undefined}
                transition={springs.flick}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors",
                  !inert && draft.trim()
                    ? "bg-primary text-primary-foreground"
                    : "cursor-default bg-surface-2 text-ink-3",
                  FOCUS_RING,
                )}
              >
                <SendHorizontal aria-hidden className="size-4" />
              </motion.button>
            </div>
            <p
              aria-hidden
              className={cn("mt-1.5 hidden px-1 @min-[30rem]:block", LABEL)}
            >
              Enter sends · Shift+Enter for a new line
            </p>
          </div>
        </>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
