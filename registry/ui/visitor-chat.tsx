"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUp,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  Paperclip,
  RotateCcw,
  TriangleAlert,
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

export type ChatLauncherShape = "circle" | "squircle" | "pill";
export type ChatBubbleStyle = "tinted" | "solid" | "minimal";
export type ChatDelivery = "sending" | "sent" | "seen" | "failed";

export type ChatAgent = {
  id: string;
  name: string;
  role?: string;
  /** On now: shown in the header with a dot. */
  online: boolean;
  /** Avatar hue, 0–360. Derived from the id when absent. */
  hue?: number;
};

export type ChatHours = {
  /** Days the team works, 0 = Sunday. */
  days: number[];
  /** Opening time, minutes after midnight in the team's zone. */
  open: number;
  /** Closing time, minutes after midnight in the team's zone. */
  close: number;
  /** The team's offset from UTC, minutes. */
  utcOffset: number;
  /** The team's city, for "Back at 09:00 (Lisbon)". */
  zone: string;
};

export type ChatAttachment = { name: string; size: number };

export type ChatMessage = {
  id: string;
  /** "visitor", or an agent id. */
  from: string;
  text: string;
  /** Sent at, ms. */
  at: number;
  /** Delivery, for the visitor's messages. */
  status?: ChatDelivery;
  attachment?: ChatAttachment;
};

export type VisitorChatProps = {
  /** The launcher: a circle, a rounded square, or a pill with "Chat with us". The stretch starts from its shape. @default "circle" */
  launcherShape?: ChatLauncherShape;
  /** Message bubbles: a soft tint, a solid accent for the visitor, or agents as plain text. @default "tinted" */
  bubbleStyle?: ChatBubbleStyle;
  /** Any CSS colour: the launcher, the visitor's bubbles and focus edges. @default "var(--accent-bright)" */
  accent?: string;
  /** Who answers. @default defaultChatTeam */
  team?: ChatAgent[];
  /** When the team answers live. @default defaultChatHours */
  hours?: ChatHours;
  /** Controlled messages. */
  messages?: ChatMessage[];
  /** Initial messages when uncontrolled. @default [] */
  defaultMessages?: ChatMessage[];
  /** Fires from a send, a delivery change or a retry, with every message. */
  onMessagesChange?: (messages: ChatMessage[]) => void;
  /** The agent typing now, by id; their reply resolves out of the indicator. @default null */
  typing?: string | null;
  /** A message was sent (or retried). Return a promise: resolved marks it sent, rejected keeps a retry on its bubble. */
  onSend?: (
    message: ChatMessage,
    meta: { email: string | null },
  ) => void | Promise<void>;
  /** Files were picked with the attach button; the first rides on the next message. */
  onAttach?: (files: File[]) => void;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** The launcher, Escape or the minimise button changed the open state. */
  onOpenChange?: (open: boolean) => void;
  /** The window was closed by the visitor. */
  onClose?: () => void;
  /** The current time, ms; decides office hours. Never read from the clock. @default Fri 16 Oct 2026 14:20 UTC */
  now?: number;
  /** How soon the team usually replies, minutes. @default 4 */
  replyMinutes?: number;
  /** The window's title. @default "Waylight help" */
  title?: string;
  /** The team's first message, always shown at the top. */
  greeting?: string;
  /** Height of the box the widget lives in, px. @default 560 */
  height?: number;
  /** Nothing can be opened or sent. @default false */
  disabled?: boolean;
  /** Classes for the outer box. */
  className?: string;
  /** The page behind the widget. */
  children?: React.ReactNode;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultChatTeam: ChatAgent[] = [
  { id: "ines", name: "Ines Varga", role: "Support", online: true, hue: 28 },
  {
    id: "tomas",
    name: "Tomás Reyes",
    role: "Solutions engineer",
    online: true,
    hue: 250,
  },
  {
    id: "lotte",
    name: "Lotte Brink",
    role: "Support",
    online: false,
    hue: 150,
  },
];

/** Monday to Friday, 09:00–18:00 in Lisbon (UTC+1 in October). */
export const defaultChatHours: ChatHours = {
  days: [1, 2, 3, 4, 5],
  open: 9 * 60,
  close: 18 * 60,
  utcOffset: 60,
  zone: "Lisbon",
};

/** Friday 16 October 2026, 14:20 UTC: the team is in. */
export const defaultChatNow = Date.UTC(2026, 9, 16, 14, 20);

const NO_MESSAGES: ChatMessage[] = [];
const DEFAULT_GREETING =
  "Hi, we're the Waylight team. Ask us anything about your workspace, billing or the API.";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const pad = (n: number) => String(n).padStart(2, "0");
const hm = (minutes: number) =>
  `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;

const hueOf = (a: { id: string; hue?: number }) => {
  if (a.hue !== undefined) return Math.round(a.hue) % 360;
  let h = 0;
  for (const ch of a.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const sizeLabel = (bytes: number) =>
  bytes >= 1_000_000
    ? `${Math.round(bytes / 100_000) / 10} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;

/** Whether the team is in at `now`, and when it is next back if not. */
function officeState(hours: ChatHours, now: number) {
  const local = new Date(now + hours.utcOffset * 60_000);
  const day = local.getUTCDay();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const inToday =
    hours.days.includes(day) && minutes >= hours.open && minutes < hours.close;
  if (inToday) return { open: true, back: "" };
  for (let i = 0; i < 8; i++) {
    const d = (day + i) % 7;
    if (!hours.days.includes(d)) continue;
    if (i === 0 && minutes >= hours.open) continue;
    const when = i === 0 ? "today" : i === 1 ? "tomorrow" : DAYS[d];
    return { open: false, back: `${when} at ${hm(hours.open)}` };
  }
  return { open: false, back: "soon" };
}

/** The time a message was sent, on the team's clock. */
const clockOf = (at: number, offset: number) => {
  const d = new Date(at + offset * 60_000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

function Face({ agent, size = 24 }: { agent: ChatAgent; size?: number }) {
  const hue = hueOf(agent);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        backgroundColor: `oklch(0.84 0.07 ${hue})`,
        color: `oklch(0.32 0.08 ${hue})`,
      }}
    >
      {initials(agent.name)}
    </span>
  );
}

function Dots({ motionSafe }: { motionSafe: boolean }) {
  return (
    <span aria-hidden className="flex h-4 items-center gap-1">
      {[0, 1, 2].map((i) =>
        motionSafe ? (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-ink-3"
            animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
            transition={{
              duration: 0.9,
              ease: easings.move,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ) : (
          <span
            key={i}
            className="size-1.5 rounded-full bg-ink-3"
            style={{ opacity: 0.4 + i * 0.25 }}
          />
        ),
      )}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The widget                                */
/* ----------------------------------------------------------------------- */

type Track = {
  typing: string | null;
  count: number;
  session: number;
  resolving: { id: string; session: number } | null;
};

const LAUNCHER = { size: 52, pillH: 48, inset: 16, gap: 12 };

/**
 * A website chat widget that lives in the corner of its own box. Pressing the
 * launcher stretches it into the window: on a goo layer (blur, then an alpha
 * threshold, over two plain shapes, used only while the shape moves) the
 * window grows out of the launcher, rising on springs.snap and widening on
 * springs.glide, its fill turning from the accent to the card, the neck
 * between them thinning until it lets go; the crisp window then takes over
 * and its content arrives. Closing runs the same way back on the exit ease.
 *
 * Inside, the header shows who is on and how soon they usually reply. The
 * messages are a log; while an agent types, a bubble of three dots waits at
 * the end, and their reply resolves out of it, growing on springs.glide to
 * the message's size. The composer is a real textarea (Enter sends, Shift
 * and Enter breaks a line) with attach and send; a failed send keeps a retry
 * on its bubble. Outside office hours the window asks for an email first.
 * Escape closes the window and returns focus to the launcher.
 */
export function VisitorChat({
  launcherShape = "circle",
  bubbleStyle = "tinted",
  accent = "var(--accent-bright)",
  team = defaultChatTeam,
  hours = defaultChatHours,
  messages,
  defaultMessages = NO_MESSAGES,
  onMessagesChange,
  typing = null,
  onSend,
  onAttach,
  open,
  defaultOpen = false,
  onOpenChange,
  onClose,
  now = defaultChatNow,
  replyMinutes = 4,
  title = "Waylight help",
  greeting = DEFAULT_GREETING,
  height = 560,
  disabled = false,
  className,
  children,
}: VisitorChatProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const windowId = `${uid}-window`;
  const gooId = `${idBase}-goo`;
  const emailId = `${uid}-email`;

  /* ------------------------------ values -------------------------------- */

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [ownList, setOwnList] = React.useState<ChatMessage[]>(defaultMessages);
  const list = messages ?? ownList;
  const write = (next: ChatMessage[]) => {
    if (messages === undefined) setOwnList(next);
    onMessagesChange?.(next);
  };
  // A send settles after the host may have added replies: it edits the
  // thread as it is then, not as it was when the message left.
  const latest = React.useRef({ list, write, onSend });
  React.useEffect(() => {
    latest.current = { list, write, onSend };
  });

  const office = officeState(hours, now);
  const online = team.filter((a) => a.online);
  const agentOf = (id: string) => team.find((a) => a.id === id);

  /* ------------------------- typing → message --------------------------- */

  // Which reply grew out of the typing bubble is a fact about two renders
  // (the indicator was there, now the message is), kept as derived state.
  const [track, setTrack] = React.useState<Track>({
    typing,
    count: list.length,
    session: typing ? 1 : 0,
    resolving: null,
  });
  if (track.typing !== typing || track.count !== list.length) {
    const last = list[list.length - 1];
    const resolved =
      track.typing !== null &&
      typing !== track.typing &&
      list.length > track.count &&
      last?.from === track.typing
        ? { id: last.id, session: track.session }
        : track.resolving;
    setTrack({
      typing,
      count: list.length,
      session:
        typing && typing !== track.typing ? track.session + 1 : track.session,
      resolving: resolved,
    });
  }
  const typingAgent = typing ? agentOf(typing) : undefined;

  /* ------------------------------- unread ------------------------------- */

  const agentCount = list.filter((m) => m.from !== "visitor").length;
  const [seen, setSeen] = React.useState({ open: isOpen, count: agentCount });
  if (seen.open !== isOpen || (isOpen && seen.count !== agentCount)) {
    setSeen({ open: isOpen, count: agentCount });
  }
  const unread = isOpen ? 0 : Math.max(0, agentCount - seen.count);

  /* ---------------------------- goo stretch ----------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const winRef = React.useRef<HTMLDivElement | null>(null);
  const launcherRef = React.useRef<HTMLButtonElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const blurRef = React.useRef<SVGFEGaussianBlurElement | null>(null);
  const byVisitor = React.useRef(false);
  const shown = React.useRef(isOpen);

  const gooOn = useMotionValue(0);
  const sx = useMotionValue(0);
  const sy = useMotionValue(0);
  const sw = useMotionValue(0);
  const sh = useMotionValue(0);
  const srx = useMotionValue(0);
  const tint = useMotionValue(100);
  const blur = useMotionValue(9);
  const crisp = useMotionValue(isOpen ? 1 : 0);
  const rise = useMotionValue(0);
  const lx = useMotionValue(0);
  const ly = useMotionValue(0);
  const lw = useMotionValue(0);
  const lh = useMotionValue(0);
  const lrx = useMotionValue(0);

  const gooDisplay = useTransform(gooOn, (v) => (v > 0 ? "block" : "none"));
  // Every drawn number is rounded to a tenth: the shapes are rebuilt each
  // frame and long floats buy nothing on screen.
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const gx = useTransform(sx, r1);
  const gy = useTransform(sy, r1);
  const gw = useTransform(sw, (v) => r1(Math.max(0, v)));
  const gh = useTransform(sh, (v) => r1(Math.max(0, v)));
  const grx = useTransform(srx, r1);
  const shapeFill = useTransform(
    tint,
    (t) =>
      `color-mix(in oklab, var(--vc-solid) ${Math.round(t)}%, var(--card))`,
  );
  const winVisibility = useTransform(crisp, (v) =>
    v > 0.01 ? "visible" : "hidden",
  );
  const winPointer = useTransform(crisp, (v) => (v > 0.5 ? "auto" : "none"));

  React.useEffect(() => {
    const node = blurRef.current;
    if (!node) return;
    const set = (v: number) =>
      node.setAttribute("stdDeviation", String(Math.round(v * 10) / 10));
    set(blur.get());
    return blur.on("change", set);
  }, [blur]);

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);
  React.useEffect(() => halt, [halt]);

  // Motion writes the window's visibility on its next frame; focus cannot
  // wait for that, so the window is made visible first, then focused.
  const focusComposer = React.useCallback((win: HTMLElement) => {
    win.style.visibility = "visible";
    composerRef.current?.focus({ preventScroll: true });
  }, []);

  const shapeR =
    launcherShape === "squircle" ? 16 : launcherShape === "pill" ? 24 : 26;

  // The stretch. Positions are measured from the live layout at the moment
  // it starts, so a resized box still stretches from the launcher it has.
  React.useEffect(() => {
    if (shown.current === isOpen) return;
    shown.current = isOpen;
    const root = rootRef.current;
    const win = winRef.current;
    const launcher = launcherRef.current;
    if (!root || !win || !launcher) return;
    halt();
    const r = root.getBoundingClientRect();
    const a = launcher.getBoundingClientRect();
    const b = win.getBoundingClientRect();
    const A = {
      x: a.left - r.left,
      y: a.top - r.top,
      w: a.width,
      h: a.height,
      rx: shapeR,
    };
    const B = { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height };
    const visitor = byVisitor.current;
    byVisitor.current = false;

    if (!isOpen && win.contains(document.activeElement)) launcher.focus();

    if (!motionSafe) {
      running.current = [
        animate(crisp, isOpen ? 1 : 0, { duration: durations.fast }),
      ];
      if (isOpen && visitor) focusComposer(win);
      return;
    }

    lx.jump(A.x);
    ly.jump(A.y);
    lw.jump(A.w);
    lh.jump(A.h);
    lrx.jump(A.rx);

    if (isOpen) {
      sx.jump(A.x);
      sy.jump(A.y);
      sw.jump(A.w);
      sh.jump(A.h);
      srx.jump(A.rx);
      tint.jump(100);
      blur.jump(9);
      crisp.jump(0);
      gooOn.set(1);
      // It rises first (snap, one overshoot) and widens after (glide): the
      // drop leaves the launcher upward before it spreads into a window.
      running.current = [
        animate(sy, B.y, springs.snap),
        animate(sh, B.h, springs.snap),
        animate(srx, 16, springs.snap),
        animate(sx, B.x, springs.glide),
        animate(sw, B.w, springs.glide),
        animate(tint, 0, { duration: 0.42, ease: easings.move }),
        animate(blur, 3, springs.glide),
      ];
      timers.current.push(
        window.setTimeout(() => {
          rise.jump(distances.nudge);
          running.current.push(
            animate(crisp, 1, {
              duration: durations.fast,
              ease: easings.enter,
            }),
            animate(rise, 0, springs.snap),
          );
          if (visitor) focusComposer(win);
        }, 300),
        window.setTimeout(() => gooOn.set(0), 560),
      );
    } else {
      sx.jump(B.x);
      sy.jump(B.y);
      sw.jump(B.w);
      sh.jump(B.h);
      srx.jump(16);
      tint.jump(0);
      blur.jump(3);
      gooOn.set(1);
      const exit = { duration: 0.34, ease: easings.exit };
      running.current = [
        animate(crisp, 0, { duration: 0.1, ease: easings.exit }),
        animate(sx, A.x, exit),
        animate(sw, A.w, exit),
        animate(sy, A.y, { ...exit, duration: 0.38 }),
        animate(sh, A.h, { ...exit, duration: 0.38 }),
        animate(srx, A.rx, exit),
        animate(tint, 100, exit),
        animate(blur, 9, exit),
      ];
      timers.current.push(window.setTimeout(() => gooOn.set(0), 420));
    }
  }, [
    isOpen,
    motionSafe,
    halt,
    focusComposer,
    shapeR,
    crisp,
    rise,
    gooOn,
    sx,
    sy,
    sw,
    sh,
    srx,
    tint,
    blur,
    lx,
    ly,
    lw,
    lh,
    lrx,
  ]);

  const setOpenState = (next: boolean, visitor: boolean) => {
    if (disabled && next) return;
    byVisitor.current = visitor;
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    if (!next) onClose?.();
  };

  /* ------------------------------ composer ------------------------------ */

  const [draft, setDraft] = React.useState("");
  const [pending, setPending] = React.useState<ChatAttachment | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = React.useState<string | null>(null);
  const [emailDraft, setEmailDraft] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const emailRef = React.useRef<HTMLInputElement | null>(null);
  const needEmail = !office.open && !email;
  const counter = React.useRef(0);

  const deliver = (msg: ChatMessage) => {
    let out: unknown;
    try {
      out = latest.current.onSend?.(msg, { email });
    } catch {
      out = Promise.reject(new Error("send failed"));
    }
    // The answer can arrive before the thread holding the message has
    // rendered; it waits a frame or two for the message rather than lose it.
    const settle = (status: ChatDelivery, tries = 0) => {
      const { list: cur, write: put } = latest.current;
      if (!cur.some((m) => m.id === msg.id)) {
        if (tries < 8) window.setTimeout(() => settle(status, tries + 1), 32);
        return;
      }
      put(cur.map((m) => (m.id === msg.id ? { ...m, status } : m)));
    };
    if (out && typeof (out as PromiseLike<void>).then === "function") {
      Promise.resolve(out as PromiseLike<void>).then(
        () => settle("sent"),
        () => settle("failed"),
      );
    } else {
      // Nothing to wait for: it is sent once it is written.
      settle("sent");
    }
  };

  const send = () => {
    if (disabled) return;
    const text = draft.trim();
    if (!text && !pending) return;
    if (needEmail) {
      setEmailError("Add your email first, so we can reply there.");
      emailRef.current?.focus();
      return;
    }
    counter.current += 1;
    const msg: ChatMessage = {
      id: `${idBase}-m${counter.current}`,
      from: "visitor",
      text,
      at: now,
      status: "sending",
      ...(pending ? { attachment: pending } : {}),
    };
    write([...list, msg]);
    setDraft("");
    setPending(null);
    deliver(msg);
  };

  const retry = (m: ChatMessage) => {
    if (disabled) return;
    write(list.map((x) => (x.id === m.id ? { ...x, status: "sending" } : x)));
    deliver({ ...m, status: "sending" });
  };

  const saveEmail = () => {
    const v = emailDraft.trim();
    if (!EMAIL.test(v)) {
      setEmailError("That doesn't look like an email address.");
      return;
    }
    setEmail(v);
    setEmailError(null);
    composerRef.current?.focus();
  };

  /* ---------------------------- scroll to end --------------------------- */

  const logRef = React.useRef<HTMLDivElement | null>(null);
  // The first view opens at the latest message; later arrivals glide to it.
  const lastId = list[list.length - 1]?.id ?? "";
  const settled = React.useRef(false);
  React.useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: motionSafe && settled.current ? "smooth" : "auto",
    });
    settled.current = true;
  }, [lastId, typing, motionSafe, needEmail]);

  /* -------------------------------- render ------------------------------ */

  const visitorBubble =
    bubbleStyle === "solid"
      ? "bg-(--vc-solid) text-[oklch(0.99_0_0)]"
      : bubbleStyle === "minimal"
        ? "border border-hairline-strong bg-card text-foreground"
        : "bg-[color-mix(in_oklab,var(--vc-accent)_16%,var(--card))] text-foreground";
  const agentBubble =
    bubbleStyle === "minimal"
      ? "bg-transparent px-0! text-foreground"
      : "bg-surface-2 text-foreground";

  const launcherIcon = (
    <span className="relative grid size-5 place-items-center">
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.span
            key="close"
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, rotate: motionSafe ? -90 : 0 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{
              opacity: 0,
              rotate: motionSafe ? 90 : 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    rotate: springs.snap,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
          >
            <ChevronDown className="size-5" />
          </motion.span>
        ) : (
          <motion.span
            key="chat"
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, rotate: motionSafe ? 90 : 0 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{
              opacity: 0,
              rotate: motionSafe ? -90 : 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    rotate: springs.snap,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
          >
            <MessageCircle className="size-5" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );

  const header = (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
      <span className="flex shrink-0 items-center">
        {(online.length ? online : team).slice(0, 3).map((a, i) => (
          <span
            key={a.id}
            className="relative rounded-full ring-2 ring-card"
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          >
            <Face agent={a} size={28} />
            {a.online && office.open ? (
              <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-card" />
            ) : null}
          </span>
        ))}
      </span>
      <div className="min-w-0 flex-1">
        <p id={titleId} className="truncate text-[14px] font-semibold">
          {title}
        </p>
        <p className="truncate text-[11px] text-ink-3">
          {office.open
            ? `Usually replies in ${replyMinutes} min`
            : `Away · back ${office.back} (${hours.zone})`}
          {office.open && online.length ? (
            <span className="sr-only">
              {` · ${online.map((a) => firstName(a.name)).join(" and ")} ${online.length === 1 ? "is" : "are"} online`}
            </span>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        aria-label="Minimise chat"
        onClick={() => setOpenState(false, true)}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <ChevronDown aria-hidden className="size-4" />
      </button>
    </div>
  );

  const deliveryWord = (s?: ChatDelivery) =>
    s === "seen"
      ? "Seen"
      : s === "sent"
        ? "Sent"
        : s === "failed"
          ? "Not sent"
          : "Sending";

  const renderMessage = (m: ChatMessage, i: number) => {
    const mine = m.from === "visitor";
    const agent = mine ? undefined : agentOf(m.from);
    const prev = list[i - 1];
    const next = list[i + 1];
    const firstOfRun = !prev || prev.from !== m.from;
    const lastOfRun = !next || next.from !== m.from;
    const resolving =
      !mine && track.resolving?.id === m.id ? track.resolving.session : null;
    return (
      <motion.li
        key={m.id}
        className={cn(
          "flex gap-2",
          mine ? "justify-end" : "justify-start",
          firstOfRun ? "mt-3" : "mt-1",
        )}
        initial={
          resolving !== null
            ? false
            : { opacity: 0, y: motionSafe ? distances.step : 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.snap, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        {!mine ? (
          <span className="w-6 shrink-0 self-end">
            {lastOfRun && agent ? <Face agent={agent} /> : null}
          </span>
        ) : null}
        <div
          className={cn(
            "flex max-w-[82%] min-w-0 flex-col gap-1",
            mine ? "items-end" : "items-start",
          )}
        >
          {firstOfRun && !mine && agent ? (
            <span className="text-[11px] text-ink-3">
              {firstName(agent.name)}
              {agent.role ? ` · ${agent.role}` : ""}
            </span>
          ) : null}
          <motion.div
            layoutId={
              resolving !== null && motionSafe
                ? `${uid}-typing-${resolving}`
                : undefined
            }
            className={cn(
              "rounded-[14px] px-3 py-2 text-[13px] leading-5 break-words whitespace-pre-wrap",
              mine ? visitorBubble : agentBubble,
              mine && lastOfRun && "rounded-br-[5px]",
              !mine &&
                lastOfRun &&
                bubbleStyle !== "minimal" &&
                "rounded-bl-[5px]",
              m.status === "failed" && "ring-1 ring-danger",
            )}
            transition={motionSafe ? { layout: springs.glide } : undefined}
          >
            <span className="sr-only">
              {mine ? "You" : (agent?.name ?? "Team")},{" "}
              {clockOf(m.at, hours.utcOffset)}:{" "}
            </span>
            {m.attachment ? (
              <span className="mb-1 flex items-center gap-1.5 rounded-2 bg-[color-mix(in_oklab,currentColor_10%,transparent)] px-2 py-1 text-[12px]">
                <FileText aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{m.attachment.name}</span>
                <span className="shrink-0 opacity-70">
                  {sizeLabel(m.attachment.size)}
                </span>
              </span>
            ) : null}
            {resolving !== null && motionSafe ? (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base, delay: 0.12 }}
              >
                {m.text}
              </motion.span>
            ) : (
              m.text
            )}
            {mine ? (
              <span className="sr-only">. {deliveryWord(m.status)}.</span>
            ) : null}
          </motion.div>
          {mine && (lastOfRun || m.status === "failed") ? (
            m.status === "failed" ? (
              <span className="flex items-center gap-1.5 text-[11px] text-danger">
                <TriangleAlert aria-hidden className="size-3" />
                Not sent
                <button
                  type="button"
                  onClick={() => retry(m)}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] px-2 text-[11px] text-foreground hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3" />
                  Retry
                </button>
              </span>
            ) : (
              <span
                aria-hidden
                className="flex items-center gap-1 text-[10px] text-ink-3 tabular-nums"
              >
                {clockOf(m.at, hours.utcOffset)}
                {m.status === "seen" ? (
                  <CheckCheck className="size-3 text-(--vc-accent)" />
                ) : m.status === "sent" ? (
                  <Check className="size-3" />
                ) : (
                  <Clock3 className="size-3" />
                )}
                {m.status === "seen" ? "Seen" : null}
              </span>
            )
          ) : null}
        </div>
      </motion.li>
    );
  };

  const greetingAgent = online[0] ?? team[0];

  const windowBody = (
    <motion.div className="flex h-full flex-col" style={{ y: rise }}>
      {header}
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        tabIndex={0}
        className={cn(
          "flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 pb-3",
          "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ minHeight: 0 }}
      >
        <p className="mt-3 text-center text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Today
        </p>
        <ol role="list" className="flex flex-col">
          {greetingAgent ? (
            <li className="mt-3 flex gap-2">
              <span className="w-6 shrink-0 self-end">
                <Face agent={greetingAgent} />
              </span>
              <div className="flex max-w-[82%] min-w-0 flex-col items-start gap-1">
                <span className="text-[11px] text-ink-3">{title}</span>
                <div
                  className={cn(
                    "rounded-[14px] rounded-bl-[5px] px-3 py-2 text-[13px] leading-5",
                    agentBubble,
                  )}
                >
                  {greeting}
                </div>
              </div>
            </li>
          ) : null}
          {list.map(renderMessage)}
          <AnimatePresence initial={false}>
            {typingAgent ? (
              <motion.li
                key={`typing-${track.session}`}
                className="mt-3 flex gap-2"
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { y: springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
              >
                <span className="w-6 shrink-0 self-end">
                  <Face agent={typingAgent} />
                </span>
                <div className="flex flex-col items-start gap-1">
                  <motion.div
                    layoutId={
                      motionSafe ? `${uid}-typing-${track.session}` : undefined
                    }
                    className={cn(
                      "rounded-[14px] rounded-bl-[5px] px-3 py-2",
                      bubbleStyle === "minimal" ? "bg-surface-2" : agentBubble,
                    )}
                    transition={
                      motionSafe ? { layout: springs.glide } : undefined
                    }
                  >
                    <Dots motionSafe={motionSafe} />
                  </motion.div>
                  <span className="text-[11px] text-ink-3">
                    {firstName(typingAgent.name)} is typing
                  </span>
                </div>
              </motion.li>
            ) : null}
          </AnimatePresence>
        </ol>
      </div>

      {!office.open ? (
        <div className="border-t border-hairline bg-surface-1 px-3 py-2.5">
          {email ? (
            <p className="flex items-center gap-2 text-[12px] text-ink-2">
              <Mail aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Replies go to <span className="text-foreground">{email}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setEmail(null);
                  setEmailDraft(email);
                }}
                className={cn(
                  "rounded-1 text-[11px] text-ink-2 underline underline-offset-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                Change
              </button>
            </p>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                saveEmail();
              }}
              className="flex flex-col gap-1.5"
            >
              <label htmlFor={emailId} className="text-[12px] text-ink-2">
                We&apos;re away until {office.back}. Leave your email and
                we&apos;ll reply there.
              </label>
              <div className="flex gap-2">
                <input
                  ref={emailRef}
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  value={emailDraft}
                  placeholder="you@company.com"
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? `${emailId}-error` : undefined}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setEmailDraft(value);
                    if (emailError) setEmailError(null);
                  }}
                  className={cn(
                    "h-8 min-w-0 flex-1 rounded-2 border bg-card px-2.5 text-[13px] placeholder:text-ink-3",
                    emailError ? "border-danger" : "border-input",
                    FOCUS_RING,
                  )}
                />
                <button
                  type="submit"
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-[12px] text-foreground hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  Save
                </button>
              </div>
              {emailError ? (
                <p id={`${emailId}-error`} className="text-[11px] text-danger">
                  {emailError}
                </p>
              ) : null}
            </form>
          )}
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex flex-col gap-2 border-t border-hairline p-3"
      >
        {pending ? (
          <span className="flex items-center gap-1.5 self-start rounded-full border border-hairline bg-surface-1 py-0.5 pr-0.5 pl-2 text-[11px] text-ink-2">
            <FileText aria-hidden className="size-3.5" />
            <span className="max-w-40 truncate">{pending.name}</span>
            <span className="text-ink-3">{sizeLabel(pending.size)}</span>
            <button
              type="button"
              aria-label={`Remove ${pending.name}`}
              onClick={() => setPending(null)}
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ) : null}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            tabIndex={-1}
            aria-hidden
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files ?? []);
              const first = files[0];
              if (first) setPending({ name: first.name, size: first.size });
              if (files.length) onAttach?.(files);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Attach a file"
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) fileRef.current?.click();
            }}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <Paperclip aria-hidden className="size-4" />
          </button>
          <div className="grid min-w-0 flex-1 rounded-3 border border-input bg-card focus-within:border-(--vc-accent)">
            <textarea
              ref={composerRef}
              aria-label={`Message ${title}`}
              rows={1}
              value={draft}
              disabled={disabled}
              placeholder={
                office.open ? "Write a message" : "Write your question"
              }
              onChange={(e) => {
                const value = e.currentTarget.value;
                setDraft(value);
              }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              className={cn(
                "max-h-24 resize-none overflow-y-auto rounded-3 bg-transparent px-3 py-[7px] text-[13px] leading-5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
                FOCUS_RING,
              )}
            />
            <span
              aria-hidden
              className="invisible max-h-24 overflow-hidden px-3 py-[7px] text-[13px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
            >
              {`${draft} `}
            </span>
          </div>
          <button
            type="submit"
            aria-label="Send"
            aria-disabled={disabled || (!draft.trim() && !pending) || undefined}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-3 bg-(--vc-solid) text-[oklch(0.99_0_0)] transition-opacity",
              !draft.trim() && !pending && "opacity-45",
              FOCUS_RING,
            )}
          >
            <ArrowUp aria-hidden className="size-4" />
          </button>
        </div>
      </form>
    </motion.div>
  );

  const launcherSize =
    launcherShape === "pill"
      ? { height: LAUNCHER.pillH }
      : { width: LAUNCHER.size, height: LAUNCHER.size };
  const launcherH = launcherShape === "pill" ? LAUNCHER.pillH : LAUNCHER.size;

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-background",
        className,
      )}
      style={{
        height,
        ["--vc-accent" as string]: accent,
        ["--vc-solid" as string]: `oklch(from ${accent} 0.52 0.16 h)`,
      }}
    >
      {children ? <div className="absolute inset-0">{children}</div> : null}

      {/* The goo: two plain shapes under a blur-and-threshold filter, drawn
          only while the window is stretching out of the launcher or back. */}
      <motion.svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        style={{ display: gooDisplay }}
      >
        <defs>
          <filter
            id={gooId}
            x="0"
            y="0"
            width="100%"
            height="100%"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              ref={blurRef}
              in="SourceGraphic"
              stdDeviation="9"
              result="blur"
            />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
        <g filter={`url(#${gooId})`}>
          <motion.rect
            x={gx}
            y={gy}
            width={gw}
            height={gh}
            rx={grx}
            style={{ fill: shapeFill }}
          />
          <motion.rect
            x={lx}
            y={ly}
            width={lw}
            height={lh}
            rx={lrx}
            className="fill-(--vc-solid)"
          />
        </g>
      </motion.svg>

      {/* The window: always laid out (so the stretch can measure it), shown
          only once the goo hands over. */}
      <motion.div
        ref={winRef}
        id={windowId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpenState(false, true);
          }
        }}
        className="absolute right-3 z-20 overflow-hidden rounded-[16px] border border-hairline-strong bg-card text-foreground shadow-[0_18px_48px_-16px_color-mix(in_oklab,black_40%,transparent)]"
        style={{
          top: 12,
          bottom: launcherH + LAUNCHER.inset + LAUNCHER.gap,
          width: "min(calc(100% - 24px), 380px)",
          opacity: crisp,
          visibility: winVisibility,
          pointerEvents: winPointer,
        }}
      >
        {windowBody}
      </motion.div>

      <button
        ref={launcherRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={windowId}
        aria-label={
          isOpen
            ? "Close chat"
            : `Chat with ${title}${unread ? `, ${unread} new ${unread === 1 ? "reply" : "replies"}` : ""}`
        }
        aria-disabled={disabled || undefined}
        onClick={() => setOpenState(!isOpen, true)}
        className={cn(
          "group/visitor-chat absolute right-4 bottom-4 z-30 inline-flex items-center justify-center gap-2 bg-(--vc-solid) text-[oklch(0.99_0_0)] shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--vc-accent)_70%,transparent)] transition-transform active:scale-95",
          launcherShape === "circle" && "rounded-full",
          launcherShape === "squircle" && "rounded-[16px]",
          launcherShape === "pill" && "rounded-full px-4",
          disabled && "cursor-not-allowed opacity-60",
          FOCUS_RING,
        )}
        style={launcherSize}
      >
        {launcherIcon}
        {launcherShape === "pill" ? (
          <span className="grid text-[13px] font-medium">
            <span className={cn("[grid-area:1/1]", isOpen && "invisible")}>
              Chat with us
            </span>
            <span className={cn("[grid-area:1/1]", !isOpen && "invisible")}>
              Close chat
            </span>
          </span>
        ) : null}
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-danger font-mono text-[10px] text-[oklch(0.99_0_0)] ring-2 ring-background"
          >
            {unread}
          </span>
        ) : null}
      </button>
    </div>
  );
}
