"use client";

import * as React from "react";

import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  CircleHelp,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  Search,
  SendHorizontal,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type Variants,
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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type HelpCorner = "bottom-right" | "bottom-left" | "top-right";
export type HelpSuggest = "page" | "popular" | "off";
export type HelpHandoff = "chat" | "ticket" | "instant";
export type HelpStatus = "ready" | "loading" | "error";
export type HelpView = "home" | "article" | "contact" | "chat" | "ticket";

export type HelpArticle = {
  id: string;
  title: string;
  /** One line under the title in lists. */
  summary: string;
  /** The article, one paragraph per entry. */
  body: string[];
  /** The pages it helps with, matched against `context`. */
  tags?: string[];
  /** Reading time in minutes. */
  minutes?: number;
  /** How often it is read: orders the popular list. */
  views?: number;
  /** When it last changed, shown as written ("12 Sep"). */
  updated?: string;
};

export type HelpMessage = {
  id: string;
  from: "agent" | "you" | "system";
  text: string;
  /** A time label, shown as given ("09:41"). */
  time?: string;
  /** Your messages: delivered, or read by the agent. */
  status?: "sent" | "read";
};

export type HelpAgent = {
  name: string;
  /** Under the name in the chat header. */
  role?: string;
  /** The avatar's letters. @default the name's first letter */
  initials?: string;
  /** How long a reply usually takes, as a phrase ("about 2 min"). */
  replyTime?: string;
};

export type HelpUser = { name?: string; email?: string };

export type HelpContactForm = { topic: string; message: string; email: string };

export type HelpPanelProps = {
  /** The help centre. @default defaultHelpArticles */
  articles?: HelpArticle[];
  /** The page the visitor is on, matched against articles' tags. @default "routes" */
  context?: string;
  /** How that page is named in "Suggested for …". @default "Routes" */
  contextLabel?: string;
  /** Controlled: the panel is open. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the launcher, the close button, Escape. */
  onOpenChange?: (open: boolean) => void;
  /** The corner the launcher sits in; the panel grows out of it. @default "bottom-right" */
  corner?: HelpCorner;
  /** What waits under the search before anything is typed: articles for this page, the most read, or nothing. @default "page" */
  suggest?: HelpSuggest;
  /** Where contacting support leads: a live chat after the form, a ticket after the form, or straight to the chat. @default "chat" */
  handoff?: HelpHandoff;
  /** The line under the visitor's name on the home view. @default "How can we help?" */
  greeting?: string;
  /** Who is asking: names the greeting and fills the form's email. @default defaultHelpUser */
  user?: HelpUser;
  /** Who answers the chat. @default defaultHelpAgent */
  agent?: HelpAgent;
  /** Uncontrolled chat: what the agent says to each of your messages, in order. `{name}` is your first name, `{topic}` the form's topic. @default defaultHelpReplies */
  replies?: string[];
  /** Controlled chat: the conversation. When given, the panel shows it and does not script replies. */
  messages?: HelpMessage[];
  /** Controlled chat: the agent is typing. */
  agentTyping?: boolean;
  /** You sent a chat message. */
  onSend?: (text: string) => void;
  /** An article was opened from a list. */
  onArticleOpen?: (article: HelpArticle) => void;
  /** Yes or No on "Was this helpful?". */
  onHelpful?: (articleId: string, helpful: boolean) => void;
  /** Sends the contact form. Return a promise to hold Send pending; a rejection's message is shown. */
  onContactSubmit?: (form: HelpContactForm) => void | Promise<void>;
  /** Support took over: a chat started or a ticket was opened. */
  onHandoff?: (kind: "chat" | "ticket") => void;
  /** The view on screen changed: home, an article, the form, the chat or a ticket. */
  onViewChange?: (view: HelpView) => void;
  /** The form's topics. @default ["Routes", "Billing", "Account", "Something else"] */
  topics?: string[];
  /** The clock chat messages are stamped with. Without it, the time the message arrives. */
  now?: Date | number;
  /** Loading draws placeholder articles; error offers Retry. @default "ready" */
  status?: HelpStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** Sit in a corner of the viewport instead of the page given as children. @default false */
  fixed?: boolean;
  /** The page the launcher sits on. */
  children?: React.ReactNode;
  /** The panel's accessible name. @default "Help" */
  label?: string;
  /** Play the panel's swish and the pops of sending and voting. Off unless asked for. @default false */
  sound?: boolean;
  /** Shows the launcher but takes no input. */
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults ------------------------------- */

export const defaultHelpArticles: HelpArticle[] = [
  {
    id: "windows",
    title: "Set a delivery window for a stop",
    summary: "Give a stop an earliest and latest arrival time.",
    body: [
      "Open the route, select the stop and choose Delivery window. Set the earliest and latest time the stop can be served.",
      "The planner keeps every stop inside its window when it orders the route. A stop it cannot reach in time is marked late, with the minutes it would miss by.",
      "Windows follow the depot's time zone, not yours, so a planner in another city sees the same times the driver does.",
    ],
    tags: ["routes", "stops"],
    minutes: 2,
    views: 1840,
    updated: "12 Sep",
  },
  {
    id: "reorder",
    title: "Reorder stops by dragging",
    summary: "Move a stop up or down and the times follow.",
    body: [
      "Drag a stop by its handle to a new place in the list. Arrival times and the distance update as soon as you let go.",
      "With the keyboard, focus a stop and press Alt with Up or Down to move it one place.",
      "A stop with a delivery window can't be moved outside it; the planner tells you which stop is in the way.",
    ],
    tags: ["routes", "stops"],
    minutes: 1,
    views: 2210,
    updated: "3 Sep",
  },
  {
    id: "late",
    title: "Why a route shows as late",
    summary: "What the red badge means and how to clear it.",
    body: [
      "A route turns late when at least one stop can't be reached inside its delivery window at the current speed.",
      "Open the route and look for the stop with the red time. Widening its window, moving it earlier or splitting the route usually clears it.",
      "Live traffic can make a route late after it leaves the depot. The badge clears by itself once the driver catches up.",
    ],
    tags: ["routes", "live"],
    minutes: 3,
    views: 1630,
    updated: "28 Aug",
  },
  {
    id: "share",
    title: "Share a live route with a customer",
    summary: "Send a link that shows where the van is.",
    body: [
      "Choose Share on a route and pick the stops whose customers should get a link.",
      "Each link shows the van's position and the expected arrival for that stop only, and stops working once the stop is served.",
    ],
    tags: ["routes", "sharing"],
    minutes: 2,
    views: 980,
    updated: "19 Aug",
  },
  {
    id: "depots",
    title: "Add a depot and its opening hours",
    summary: "Where routes start and end, and when.",
    body: [
      "Go to Settings, then Depots, and choose Add depot. Enter the address and the hours vans can load.",
      "Routes from a depot never start before it opens, and the planner warns you when a route would end after it closes.",
    ],
    tags: ["depots"],
    minutes: 2,
    views: 760,
    updated: "2 Aug",
  },
  {
    id: "seats",
    title: "Change your plan or seats",
    summary: "Upgrade, downgrade, or add people mid-cycle.",
    body: [
      "Owners can change the plan from Settings, then Billing. A change applies straight away, and the difference is prorated on the next invoice.",
      "Adding a seat mid-cycle charges only for the days left in it.",
    ],
    tags: ["billing"],
    minutes: 2,
    views: 1320,
    updated: "15 Sep",
  },
  {
    id: "invoices",
    title: "Download invoices",
    summary: "Every invoice, as a PDF, for your records.",
    body: [
      "Settings, then Billing, lists every invoice with its date and amount. Choose one to download it as a PDF.",
      "Invoices go to the billing email too. Change that address on the same page.",
    ],
    tags: ["billing"],
    minutes: 1,
    views: 1010,
    updated: "1 Sep",
  },
  {
    id: "drivers",
    title: "Invite a driver to the app",
    summary: "Drivers get their routes on their phone.",
    body: [
      "Choose Team, then Invite, and enter the driver's phone number or email. They get a link to the driver app.",
      "Drivers only see the routes assigned to them, and can't change a route's order.",
    ],
    tags: ["team", "routes"],
    minutes: 2,
    views: 1450,
    updated: "9 Sep",
  },
];

export const defaultHelpAgent: HelpAgent = {
  name: "Mara",
  role: "Fieldline support",
  replyTime: "about 2 min",
};

export const defaultHelpUser: HelpUser = {
  name: "Dana Kim",
  email: "dana@fernworks.io",
};

export const defaultHelpReplies = [
  "Thanks, {name}. I can see the route now. Stop 3's delivery window closes at 10:30, before the van can get there, so the planner marks the whole route late.",
  "If you widen that window to 11:00 the route goes green. I can change it for you, or you can do it from the stop's menu.",
  "Done. The route is green again. Anything else I can help with?",
];

const DEFAULT_TOPICS = ["Routes", "Billing", "Account", "Something else"];

/* -------------------------------- helpers ------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";
const RING_WITHIN =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring";

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const firstName = (user: HelpUser | undefined) =>
  (user?.name ?? "").trim().split(/\s+/)[0] ?? "";

const clockOf = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** A message as one sentence: it keeps its own full stop and never gains a second. */
const sentence = (text: string) => {
  const t = text.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : fallback;

/** Every word must match somewhere; the title counts most. */
function scoreOf(a: HelpArticle, words: string[]): number {
  let total = 0;
  const title = a.title.toLowerCase();
  const summary = a.summary.toLowerCase();
  const body = a.body.join(" ").toLowerCase();
  const tags = (a.tags ?? []).join(" ").toLowerCase();
  for (const w of words) {
    const s =
      (title.includes(w) ? 4 : 0) +
      (summary.includes(w) ? 2 : 0) +
      (tags.includes(w) ? 2 : 0) +
      (body.includes(w) ? 1 : 0);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const re = new RegExp(`(${words.map(escapeRe).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-1 bg-cobalt-wash text-foreground">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

/** A timeout keyed by `key`, which waits while the page is hidden. */
function useHeldTimer(key: string | null, ms: number, onDone: () => void) {
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });
  React.useEffect(() => {
    if (key === null) return;
    let left = Math.max(0, ms);
    let started = 0;
    let id = 0;
    const arm = () => {
      started = performance.now();
      id = window.setTimeout(() => done.current(), left);
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(id);
        left = Math.max(0, left - (performance.now() - started));
      } else {
        arm();
      }
    };
    if (!document.hidden) arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, ms]);
}

function Avatar({
  agent,
  className,
}: {
  agent: HelpAgent;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright",
        className,
      )}
    >
      {(agent.initials ?? agent.name.charAt(0)).toUpperCase()}
    </span>
  );
}

function Dots({ motionSafe }: { motionSafe: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-ink-3"
          animate={
            motionSafe ? { y: [0, -3, 0] } : { opacity: [0.35, 1, 0.35] }
          }
          transition={{
            duration: motionSafe ? 0.9 : 1.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * (motionSafe ? 0.13 : 0.3),
          }}
        />
      ))}
    </span>
  );
}

/* --------------------------------- views -------------------------------- */

type View =
  | { kind: "home" }
  | { kind: "article"; id: string }
  | { kind: "contact"; prefill?: string }
  | { kind: "chat" }
  | { kind: "ticket" };

const keyOf = (v: View) => (v.kind === "article" ? `article:${v.id}` : v.kind);

type Ticket = { number: string; email: string; topic: string; message: string };

type Pending = { id: number; kind: "join" | "read" | "reply"; ms: number };

/**
 * A support panel in a corner of the page. The launcher grows into it: one
 * surface carried from the launcher's circle to the panel's box on glide,
 * its contents fading in behind, and it shrinks back into the launcher on
 * the exit ease. Inside is a stack of views that move by direction — a push
 * arrives from the right on snap while the view below leaves left; Back
 * reverses both.
 *
 * Home is a search over the help centre with articles waiting before you
 * type (`suggest`): ones tagged for the page you are on, or the most read.
 * Typing filters live with the matched words marked. An article has its
 * reading time, "Was this helpful?" and related articles. Contacting support
 * is a short form that hands off (`handoff`) to a live chat — you join the
 * queue, the agent joins, a typing indicator, the reply — or to a ticket.
 *
 * The launcher is a button for a dialog that keeps Tab inside; Escape steps
 * back a view, clears the search, then closes and returns focus to the
 * launcher. The search is a combobox over a listbox; the chat is a list
 * whose new messages are announced once each, and its composer a real
 * textarea. Under reduced motion the panel fades where it sits, views
 * cross-fade, and the typing dots dim in turn instead of bouncing.
 */
export function HelpPanel({
  articles = defaultHelpArticles,
  context = "routes",
  contextLabel = "Routes",
  open,
  defaultOpen = false,
  onOpenChange,
  corner = "bottom-right",
  suggest = "page",
  handoff = "chat",
  greeting = "How can we help?",
  user = defaultHelpUser,
  agent = defaultHelpAgent,
  replies = defaultHelpReplies,
  messages,
  agentTyping,
  onSend,
  onArticleOpen,
  onHelpful,
  onContactSubmit,
  onHandoff,
  onViewChange,
  topics = DEFAULT_TOPICS,
  now,
  status = "ready",
  onRetry,
  fixed = false,
  children,
  label = "Help",
  sound = false,
  disabled = false,
  className,
}: HelpPanelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const panelId = `${uid}-panel`;
  const listId = `${uid}-list`;
  const optionId = (id: string) => `${uid}-opt-${id}`;
  const name = firstName(user);

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [present, setPresent] = React.useState(isOpen);
  if (isOpen && !present) setPresent(true);

  const [stack, setStack] = React.useState<View[]>([{ kind: "home" }]);
  const [dir, setDir] = React.useState(1);
  const view = stack[stack.length - 1] ?? { kind: "home" };

  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(-1);
  const [votes, setVotes] = React.useState<Record<string, boolean>>({});

  const [form, setForm] = React.useState<HelpContactForm>(() => ({
    topic: topics.find((t) => t.toLowerCase() === context) ?? topics[0] ?? "",
    message: "",
    email: user?.email ?? "",
  }));
  const [tried, setTried] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [ticket, setTicket] = React.useState<Ticket | null>(null);

  const [ownMessages, setOwnMessages] = React.useState<HelpMessage[]>([]);
  const [ownTyping, setOwnTyping] = React.useState(false);
  const [joined, setJoined] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [draft, setDraft] = React.useState("");
  const chatControlled = messages !== undefined;
  const thread = messages ?? ownMessages;
  const typing = agentTyping ?? ownTyping;
  const chatStarted = chatControlled
    ? thread.length > 0
    : ownMessages.length > 0;

  const [arrived, setArrived] = React.useState<{
    key: string;
    node: HTMLElement;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const launcherRef = React.useRef<HTMLButtonElement | null>(null);
  const logRef = React.useRef<HTMLDivElement | null>(null);
  const focusNext = React.useRef<string | null>(null);
  const queue = React.useRef<string[]>([]);
  const scriptAt = React.useRef(0);
  const seq = React.useRef(0);
  const alive = React.useRef(true);

  // 0 is the launcher's circle, 1 the panel's box.
  const grow = useMotionValue(isOpen ? 1 : 0);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const stamp = () => clockOf(now !== undefined ? new Date(now) : new Date());
  const nextId = () => {
    seq.current += 1;
    return `m${seq.current}`;
  };
  const fill = (text: string) =>
    text
      .split("{name}")
      .join(name || "there")
      .split("{topic}")
      .join(form.topic.toLowerCase());

  /* ------------------------------ open & close ----------------------------- */

  const requestOpen = (next: boolean) => {
    if (disabled || next === isOpen) return;
    audio.play("swish", {
      pitch: next ? 1.1 : 0.88,
      gain: 0.3,
      pan: panOf(launcherRef.current),
    });
    if (next) {
      focusNext.current = keyOf(view);
    } else if (rootRef.current?.contains(document.activeElement)) {
      launcherRef.current?.focus({ preventScroll: true });
    }
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  /* --------------------------------- stack -------------------------------- */

  const push = (v: View, replace = false) => {
    onViewChange?.(v.kind);
    setDir(1);
    setStack((s) => (replace ? [...s.slice(0, -1), v] : [...s, v]));
    focusNext.current = keyOf(v);
    audio.play("swish", {
      pitch: 1.18,
      gain: 0.22,
      pan: panOf(rootRef.current),
    });
  };

  const back = () => {
    if (stack.length < 2) return;
    const below = stack[stack.length - 2];
    if (below) onViewChange?.(below.kind);
    setDir(-1);
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    if (below) focusNext.current = keyOf(below);
    audio.play("swish", {
      pitch: 0.86,
      gain: 0.22,
      pan: panOf(rootRef.current),
    });
  };

  const home = () => {
    onViewChange?.("home");
    setDir(-1);
    setStack([{ kind: "home" }]);
    focusNext.current = "home";
    audio.play("swish", {
      pitch: 0.86,
      gain: 0.22,
      pan: panOf(rootRef.current),
    });
  };

  const openArticle = (a: HelpArticle) => {
    onArticleOpen?.(a);
    push({ kind: "article", id: a.id });
    say(`${a.title}.`);
  };

  /* --------------------------------- chat --------------------------------- */

  const append = (m: Omit<HelpMessage, "id">) =>
    setOwnMessages((list) => [...list, { id: nextId(), ...m }]);

  const markRead = () =>
    setOwnMessages((list) =>
      list.map((m) =>
        m.from === "you" && m.status !== "read" ? { ...m, status: "read" } : m,
      ),
    );

  const typingMs = (text: string) => Math.min(2600, 900 + text.length * 14);

  const nextFromQueue = () => {
    const text = queue.current[0];
    if (!text) {
      setOwnTyping(false);
      setPending(null);
      return;
    }
    setOwnTyping(true);
    seq.current += 1;
    setPending({ id: seq.current, kind: "reply", ms: typingMs(text) });
  };

  const startChat = (fromForm: HelpContactForm | null) => {
    onHandoff?.("chat");
    if (chatControlled) return;
    const greet = fromForm
      ? `Hi ${name || "there"}, I'm ${agent.name}. I've read your note about ${fromForm.topic.toLowerCase()}.`
      : `Hi ${name || "there"}, I'm ${agent.name}. What can I help with?`;
    queue.current = [greet];
    scriptAt.current = 0;
    if (fromForm && replies[0]) {
      queue.current.push(fill(replies[0]));
      scriptAt.current = 1;
    }
    const time = stamp();
    setOwnMessages([
      {
        id: nextId(),
        from: "system",
        text: `You're in the queue. ${agent.name} usually replies in ${agent.replyTime ?? "a few minutes"}.`,
        time,
      },
      ...(fromForm
        ? [
            {
              id: nextId(),
              from: "you" as const,
              text: fromForm.message.trim(),
              time,
              status: "sent" as const,
            },
          ]
        : []),
    ]);
    setJoined(false);
    seq.current += 1;
    setPending({ id: seq.current, kind: "join", ms: 1200 });
  };

  const step = () => {
    const p = pending;
    if (!p) return;
    if (p.kind === "join") {
      append({
        from: "system",
        text: `${agent.name} joined the chat.`,
        time: stamp(),
      });
      setJoined(true);
      say(`${agent.name} joined the chat.`);
      markRead();
      nextFromQueue();
      return;
    }
    if (p.kind === "read") {
      markRead();
      nextFromQueue();
      return;
    }
    const text = queue.current.shift();
    if (text) {
      append({ from: "agent", text, time: stamp() });
      say(`${agent.name}: ${text}`);
    }
    markRead();
    nextFromQueue();
  };

  useHeldTimer(pending ? String(pending.id) : null, pending?.ms ?? 0, step);

  const sendChat = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSend?.(text);
    audio.play("pop", { pitch: 1.2, gain: 0.45, pan: panOf(logRef.current) });
    if (chatControlled) return;
    append({ from: "you", text, time: stamp(), status: "sent" });
    if (scriptAt.current < replies.length) {
      const reply = replies[scriptAt.current];
      scriptAt.current += 1;
      if (reply) queue.current.push(fill(reply));
    }
    if (pending === null && joined) {
      seq.current += 1;
      setPending({ id: seq.current, kind: "read", ms: 700 });
    }
  };

  /* -------------------------------- contact ------------------------------- */

  const problems = {
    message:
      form.message.trim().length < 10
        ? "Add a few more words so we can help."
        : null,
    email: EMAIL.test(form.email.trim()) ? null : "Check the email address.",
  };

  const submitContact = async () => {
    if (disabled || sending) return;
    setTried(true);
    if (problems.message || problems.email) {
      const first = problems.message ? "message" : "email";
      say(
        `${problems.message && problems.email ? "2 fields need" : "1 field needs"} attention.`,
      );
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-contact="${first}"]`)
        ?.focus();
      return;
    }
    setSending(true);
    setFailure(null);
    try {
      await onContactSubmit?.(form);
      if (!alive.current) return;
      setSending(false);
      audio.play("pop", {
        pitch: 1.05,
        gain: 0.45,
        pan: panOf(rootRef.current),
      });
      if (handoff === "ticket") {
        const h = hash(`${form.email}|${form.message}`);
        setTicket({
          number: `FL-${10000 + (h % 90000)}`,
          email: form.email.trim(),
          topic: form.topic,
          message: form.message.trim(),
        });
        onHandoff?.("ticket");
        push({ kind: "ticket" }, true);
        say("Request sent.");
      } else {
        startChat(form);
        push({ kind: "chat" }, true);
        say(`You're in the queue for ${agent.name}.`);
      }
      setForm((f) => ({ ...f, message: "" }));
      setTried(false);
    } catch (error) {
      if (!alive.current) return;
      setSending(false);
      setFailure(messageOf(error, "That didn't send. Try again."));
    }
  };

  const contact = (prefill?: string) => {
    if (handoff === "instant") {
      if (!chatStarted) startChat(null);
      // A search that found nothing becomes the first message, ready to send.
      if (prefill) setDraft(prefill);
      push({ kind: "chat" });
      return;
    }
    if (chatStarted && handoff === "chat") {
      push({ kind: "chat" });
      return;
    }
    if (prefill) setForm((f) => ({ ...f, message: prefill }));
    push({ kind: "contact", prefill });
  };

  /* -------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The panel grows out of the launcher on glide and shrinks back into it
  // on the exit ease; a closed panel leaves once it is back in the circle.
  React.useEffect(() => {
    if (isOpen) {
      const c = animate(
        grow,
        1,
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.enter },
      );
      return () => c.stop();
    }
    if (!present) return;
    const c = animate(grow, 0, {
      duration: motionSafe ? 0.26 : durations.fast,
      ease: easings.exit,
      onComplete: () => setPresent(false),
    });
    return () => c.stop();
  }, [isOpen, present, motionSafe, grow]);

  // Focus goes to the view the visitor moved to, once it has arrived (and,
  // for a panel opened again before it had gone, once it is open).
  React.useEffect(() => {
    // A node from an earlier opening may still be held here: only the
    // one in the document counts.
    if (!arrived || !arrived.node.isConnected || !isOpen) return;
    if (focusNext.current !== arrived.key) return;
    focusNext.current = null;
    const target =
      arrived.node.querySelector<HTMLElement>("[data-autofocus]") ??
      arrived.node;
    target.focus({ preventScroll: true });
  }, [arrived, isOpen]);

  // The chat keeps its newest message in view.
  const last = thread[thread.length - 1]?.id;
  React.useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({
      top: log.scrollHeight,
      behavior: motionSafe ? "smooth" : "auto",
    });
  }, [last, typing, motionSafe, view.kind]);

  const bindView = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const key = node.dataset.view ?? "";
    setArrived((a) => (a && a.node === node ? a : { key, node }));
  }, []);

  /* --------------------------------- view --------------------------------- */

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = words.length
    ? articles
        .map((a) => ({ a, s: scoreOf(a, words) }))
        .filter((r) => r.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, 6)
        .map((r) => r.a)
    : [];
  const suggested =
    suggest === "page"
      ? articles.filter((a) => (a.tags ?? []).includes(context)).slice(0, 3)
      : suggest === "popular"
        ? [...articles]
            .sort((x, y) => (y.views ?? 0) - (x.views ?? 0))
            .slice(0, 4)
        : [];
  const listed = words.length ? results : suggested;
  const activeArticle = listed[active];

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (listed.length === 0) return;
      event.preventDefault();
      const d = event.key === "ArrowDown" ? 1 : -1;
      setActive(
        (i) =>
          (i + d + listed.length + (i < 0 && d < 0 ? 1 : 0)) % listed.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const a = activeArticle ?? (words.length ? results[0] : undefined);
      if (a) openArticle(a);
      else if (words.length) contact(query.trim());
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (active < 0) return;
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : listed.length - 1);
    }
  };

  const onPanelKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Handled here, where focus is; the page must not also see it.
      event.preventDefault();
      event.stopPropagation();
      if (view.kind === "home" && query) {
        setQuery("");
        setActive(-1);
        return;
      }
      if (stack.length > 1) {
        back();
        return;
      }
      requestOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]):not([tabindex='-1']), input:not([disabled]):not([tabindex='-1']), textarea:not([disabled]), [tabindex='0']",
      ),
    ).filter((el) => el.getClientRects().length > 0 && !el.closest("[inert]"));
    const first = items[0];
    const lastItem = items[items.length - 1];
    if (!first || !lastItem) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      first.focus();
    }
  };

  const iconButton = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
    FOCUS,
  );

  const header = (opts: {
    title: React.ReactNode;
    back?: boolean;
    sub?: React.ReactNode;
  }) => (
    <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-hairline px-2.5">
      {opts.back ? (
        <button
          type="button"
          aria-label="Back"
          onClick={back}
          className={iconButton}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
      ) : (
        <span aria-hidden className="w-1" />
      )}
      <div className="min-w-0 flex-1">{opts.title}</div>
      <button
        type="button"
        aria-label="Close help"
        onClick={() => requestOpen(false)}
        className={iconButton}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );

  const step0 = cascade(Math.max(2, listed.length));

  const articleRow = (a: HelpArticle, i: number, inList: boolean) => (
    <motion.li
      key={a.id}
      id={inList ? optionId(a.id) : undefined}
      role={inList ? "option" : undefined}
      aria-selected={inList ? active === i : undefined}
      initial={motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: motionSafe ? { ...springs.snap, delay: i * step0 } : { duration: 0 },
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: i * step0,
        },
      }}
      onPointerMove={inList ? () => setActive(i) : undefined}
      onClick={inList ? () => openArticle(a) : undefined}
      className={cn(
        "rounded-2",
        inList && "cursor-pointer",
        inList && active === i
          ? "bg-surface-2"
          : inList && "hover:bg-surface-2",
      )}
    >
      {inList ? (
        <div className="flex items-start gap-2.5 px-2.5 py-2">
          <ArticleGlyph />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-5 font-medium text-foreground">
              <Highlight text={a.title} words={words} />
            </p>
            <p className="truncate text-[12px] leading-4 text-ink-3">
              {a.summary}
            </p>
          </div>
          {a.minutes ? (
            <span className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-3 tabular-nums">
              {a.minutes} min
            </span>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => openArticle(a)}
          className={cn(
            "flex w-full items-start gap-2.5 rounded-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-2",
            FOCUS_IN,
          )}
        >
          <ArticleGlyph />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] leading-5 font-medium text-foreground">
              {a.title}
            </span>
            <span className="block truncate text-[12px] leading-4 text-ink-3">
              {a.summary}
            </span>
          </span>
        </button>
      )}
    </motion.li>
  );

  /* ---- home ---- */
  const listLabel = words.length
    ? results.length
      ? plural(results.length, "article")
      : ""
    : suggest === "page"
      ? `Suggested for ${contextLabel}`
      : suggest === "popular"
        ? "Popular articles"
        : "";

  const homeView = (
    <>
      <div className="flex shrink-0 items-start gap-2 px-4 pt-3.5 pb-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {label}
          </p>
          <h2 className="mt-1.5 text-[16px] leading-6 font-semibold text-foreground">
            {name ? `Hi ${name},` : "Hi,"}
          </h2>
          <p className="text-[13px] text-ink-2">{greeting}</p>
        </div>
        <button
          type="button"
          aria-label="Close help"
          onClick={() => requestOpen(false)}
          className={cn(iconButton, "-mt-1 -mr-1.5")}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="shrink-0 px-4 pb-3">
        <div
          className={cn(
            "flex h-10 items-center gap-2 rounded-2 border border-input bg-background px-3 transition-colors hover:border-hairline-strong",
            RING_WITHIN,
          )}
        >
          <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
          <input
            data-autofocus
            type="text"
            role="combobox"
            aria-label="Search help"
            aria-expanded={listed.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeArticle ? optionId(activeArticle.id) : undefined
            }
            placeholder="Search articles"
            value={query}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActive(-1);
            }}
            onKeyDown={onSearchKey}
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-3"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setActive(-1);
              }}
              className={cn(
                "-mr-1.5 inline-flex size-6 items-center justify-center rounded-1 text-ink-3 hover:text-foreground",
                FOCUS,
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 pb-3">
        {status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-2 px-2.5 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5 py-1.5">
                <span
                  className={cn(
                    "h-3.5 w-3/4 rounded-1 bg-ink-3/15",
                    motionSafe && "animate-pulse",
                  )}
                />
                <span
                  className={cn(
                    "h-3 w-1/2 rounded-1 bg-ink-3/10",
                    motionSafe && "animate-pulse",
                  )}
                />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-2.5 px-4 py-6 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-[13px] text-foreground">
              Help articles didn&apos;t load.
            </p>
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <>
            {listLabel ? (
              <p className="px-2.5 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {listLabel}
              </p>
            ) : null}
            <ul
              id={listId}
              role="listbox"
              aria-label={listLabel || "Articles"}
              className="flex flex-col gap-0.5"
            >
              {listed.map((a, i) => articleRow(a, i, true))}
            </ul>
            {words.length > 0 && results.length === 0 ? (
              <div className="flex flex-col items-start gap-2 px-2.5 py-3">
                <p className="text-[13px] text-ink-2">
                  No articles match “{query.trim()}”.
                </p>
                <button
                  type="button"
                  onClick={() => contact(query.trim())}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 bg-cobalt-wash px-3 text-[12px] font-medium text-cobalt-bright transition-colors hover:bg-cobalt-wash/70",
                    FOCUS,
                  )}
                >
                  <MessageCircle aria-hidden className="size-3.5" />
                  Ask support instead
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="shrink-0 border-t border-hairline p-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => contact()}
          className={cn(
            "flex w-full items-center gap-3 rounded-3 border border-hairline bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-hairline-strong",
            FOCUS,
          )}
        >
          <span className="relative">
            <Avatar agent={agent} />
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface-2 bg-success"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-foreground">
              {chatStarted && handoff !== "ticket"
                ? `Back to your chat with ${agent.name}`
                : handoff === "instant"
                  ? "Chat with us"
                  : "Contact support"}
            </span>
            <span className="block truncate text-[12px] text-ink-3">
              {agent.replyTime
                ? `Usually replies in ${agent.replyTime}`
                : "We're here to help"}
            </span>
          </span>
          <ArrowUpRight aria-hidden className="size-4 shrink-0 text-ink-3" />
        </button>
      </div>
    </>
  );

  /* ---- article ---- */
  const article =
    view.kind === "article"
      ? articles.find((a) => a.id === view.id)
      : undefined;
  const related = article
    ? articles
        .filter(
          (a) =>
            a.id !== article.id &&
            (a.tags ?? []).some((t) => (article.tags ?? []).includes(t)),
        )
        .slice(0, 2)
    : [];
  const vote = article ? votes[article.id] : undefined;

  const articleView = article ? (
    <>
      {header({
        back: true,
        title: (
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Article
          </p>
        ),
      })}
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-4 py-4">
        <h3
          data-autofocus
          tabIndex={-1}
          className="text-[15px] leading-6 font-semibold text-foreground outline-none"
        >
          {article.title}
        </h3>
        <p className="mt-1 font-mono text-[11px] text-ink-3 tabular-nums">
          {[
            article.minutes ? `${article.minutes} min read` : null,
            article.updated ? `Updated ${article.updated}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-3 flex flex-col gap-2.5 text-[13px] leading-6 text-ink-2">
          {article.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="mt-4 rounded-3 border border-hairline bg-surface-2 p-3">
          <p className="text-[12px] font-medium text-foreground">
            Was this helpful?
          </p>
          <div className="mt-2 flex items-center gap-2">
            {([true, false] as const).map((yes) => {
              const on = vote === yes;
              return (
                <motion.button
                  key={String(yes)}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setVotes((v) => ({ ...v, [article.id]: yes }));
                    onHelpful?.(article.id, yes);
                    audio.play("pop", {
                      pitch: yes ? 1.25 : 0.85,
                      gain: 0.4,
                      pan: panOf(rootRef.current),
                    });
                    say(yes ? "Thanks for telling us." : "Sorry about that.");
                  }}
                  animate={{ scale: on && motionSafe ? 1.04 : 1 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-[12px] transition-colors",
                    FOCUS,
                    on
                      ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline bg-background text-ink-2 hover:text-foreground",
                  )}
                >
                  {yes ? (
                    <ThumbsUp aria-hidden className="size-3.5" />
                  ) : (
                    <ThumbsDown aria-hidden className="size-3.5" />
                  )}
                  {yes ? "Yes" : "No"}
                </motion.button>
              );
            })}
          </div>
          <AnimatePresence initial={false}>
            {vote !== undefined ? (
              <motion.div
                key={String(vote)}
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3"
              >
                {vote ? "Thanks for telling us." : "Sorry about that."}
                {vote ? null : (
                  <button
                    type="button"
                    onClick={() => contact()}
                    className={cn(
                      "rounded-1 font-medium text-cobalt-bright hover:underline",
                      FOCUS,
                    )}
                  >
                    {handoff === "instant" ? "Chat with us" : "Contact support"}
                  </button>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        {related.length ? (
          <div className="mt-4">
            <p className="px-0.5 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Related
            </p>
            <ul className="-mx-2.5 grid gap-0.5 @min-[40rem]:grid-cols-2">
              {related.map((a, i) => articleRow(a, i, false))}
            </ul>
          </div>
        ) : null}
      </div>
    </>
  ) : null;

  /* ---- contact ---- */
  const showProblem = (k: "message" | "email") => (tried ? problems[k] : null);
  const contactView = (
    <>
      {header({
        back: true,
        title: (
          <h3
            data-autofocus
            tabIndex={-1}
            className="truncate text-[14px] font-semibold text-foreground outline-none"
          >
            Contact support
          </h3>
        ),
      })}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submitContact();
        }}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 py-4">
          <p className="text-[13px] text-ink-2">
            {agent.name} and the team usually reply in{" "}
            {agent.replyTime ?? "a few minutes"}.
          </p>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-[12px] font-medium text-ink-2">
              Topic
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => {
                const on = form.topic === t;
                return (
                  <label
                    key={t}
                    className={cn(
                      "inline-flex h-7 cursor-pointer items-center rounded-full border px-3 text-[12px] transition-colors",
                      RING_WITHIN,
                      on
                        ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                        : "border-hairline text-ink-2 hover:text-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${uid}-topic`}
                      value={t}
                      checked={on}
                      onChange={() => setForm((f) => ({ ...f, topic: t }))}
                      className="sr-only"
                    />
                    {t}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${uid}-message`}
              className="text-[12px] font-medium text-ink-2"
            >
              What&apos;s happening?
            </label>
            <textarea
              id={`${uid}-message`}
              data-contact="message"
              rows={4}
              value={form.message}
              readOnly={sending}
              placeholder="Which route, what you expected, what you saw."
              aria-invalid={showProblem("message") ? true : undefined}
              aria-describedby={
                showProblem("message") ? `${uid}-message-error` : undefined
              }
              onChange={(event) => {
                const next = event.currentTarget.value;
                setForm((f) => ({ ...f, message: next }));
              }}
              className={cn(
                "block w-full resize-none rounded-2 border bg-background px-3 py-2 text-[13px] leading-5 text-foreground placeholder:text-ink-3",
                FOCUS,
                showProblem("message") ? "border-danger/70" : "border-input",
              )}
            />
            {showProblem("message") ? (
              <p
                id={`${uid}-message-error`}
                className="text-[12px] text-danger"
              >
                {problems.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={`${uid}-email`}
              className="text-[12px] font-medium text-ink-2"
            >
              Reply to
            </label>
            <input
              id={`${uid}-email`}
              data-contact="email"
              type="email"
              autoComplete="email"
              value={form.email}
              readOnly={sending}
              aria-invalid={showProblem("email") ? true : undefined}
              aria-describedby={
                showProblem("email") ? `${uid}-email-error` : undefined
              }
              onChange={(event) => {
                const next = event.currentTarget.value;
                setForm((f) => ({ ...f, email: next }));
              }}
              className={cn(
                "h-9 w-full rounded-2 border bg-background px-3 text-[13px] text-foreground",
                FOCUS,
                showProblem("email") ? "border-danger/70" : "border-input",
              )}
            />
            {showProblem("email") ? (
              <p id={`${uid}-email-error`} className="text-[12px] text-danger">
                {problems.email}
              </p>
            ) : null}
          </div>
          {failure ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-[12px] text-danger"
            >
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {failure}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 border-t border-hairline p-3">
          <button
            type="submit"
            aria-disabled={sending || undefined}
            disabled={disabled}
            className={cn(
              "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90",
              FOCUS,
              sending && "cursor-progress",
            )}
          >
            {sending ? (
              <LoaderCircle
                aria-hidden
                className={cn("size-4", motionSafe && "animate-spin")}
              />
            ) : null}
            {sending
              ? "Sending…"
              : handoff === "ticket"
                ? "Send request"
                : "Send and chat"}
          </button>
        </div>
      </form>
    </>
  );

  /* ---- chat ---- */
  const lastYou = [...thread].reverse().find((m) => m.from === "you")?.id;
  const chatView = (
    <>
      {header({
        back: true,
        title: (
          <div className="flex items-center gap-2.5">
            <span className="relative">
              <Avatar agent={agent} />
              {joined || chatControlled ? (
                <motion.span
                  aria-hidden
                  className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-success"
                  initial={motionSafe ? { scale: 0 } : false}
                  animate={{ scale: 1 }}
                  transition={springs.snap}
                />
              ) : null}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] leading-4 font-semibold text-foreground">
                {agent.name}
              </span>
              <span className="block truncate text-[11px] leading-4 text-ink-3">
                {typing
                  ? "Typing…"
                  : joined || chatControlled
                    ? (agent.role ?? "Online")
                    : "Joining…"}
              </span>
            </span>
          </div>
        ),
      })}
      <div
        ref={logRef}
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 py-3"
      >
        <ol
          role="list"
          aria-label={`Chat with ${agent.name}`}
          className="flex flex-col gap-2"
        >
          {thread.map((m) =>
            m.from === "system" ? (
              <motion.li
                key={m.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base }}
                className="px-4 py-1 text-center text-[11px] leading-4 text-ink-3"
              >
                {m.text}
              </motion.li>
            ) : (
              <motion.li
                key={m.id}
                aria-label={`${m.from === "you" ? "You" : agent.name} said: ${sentence(m.text)}${m.from === "you" && m.id === lastYou ? (m.status === "read" ? " Read." : " Sent.") : ""}`}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step, scale: 0.98 }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  opacity: { duration: durations.base, ease: easings.enter },
                  y: motionSafe ? springs.snap : { duration: 0 },
                  scale: motionSafe ? springs.snap : { duration: 0 },
                }}
                style={{ originX: m.from === "you" ? 1 : 0, originY: 1 }}
                className={cn(
                  "flex items-end gap-2",
                  m.from === "you" ? "flex-row-reverse pl-8" : "pr-8",
                )}
              >
                {m.from === "agent" ? (
                  <Avatar agent={agent} className="size-6 text-[10px]" />
                ) : null}
                <div
                  className={cn(
                    "flex min-w-0 flex-col",
                    m.from === "you" ? "items-end" : "items-start",
                  )}
                >
                  <p
                    aria-hidden
                    className={cn(
                      "rounded-3 px-3 py-2 text-[13px] leading-5 break-words whitespace-pre-wrap",
                      m.from === "you"
                        ? "rounded-br-1 bg-primary text-primary-foreground"
                        : "rounded-bl-1 bg-surface-2 text-foreground",
                    )}
                  >
                    {m.text}
                  </p>
                  {m.from === "you" && m.id === lastYou ? (
                    <span
                      aria-hidden
                      className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-ink-3"
                    >
                      {m.status === "read" ? (
                        <Check className="size-3 text-cobalt-bright" />
                      ) : null}
                      {m.status === "read" ? "Read" : "Sent"}
                      {m.time ? ` · ${m.time}` : ""}
                    </span>
                  ) : m.time && m.from === "agent" ? (
                    <span
                      aria-hidden
                      className="mt-0.5 font-mono text-[10px] text-ink-3"
                    >
                      {m.time}
                    </span>
                  ) : null}
                </div>
              </motion.li>
            ),
          )}
          <AnimatePresence initial={false}>
            {typing ? (
              <motion.li
                key="typing"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="flex items-end gap-2"
              >
                <Avatar agent={agent} className="size-6 text-[10px]" />
                <span className="flex h-9 items-center rounded-3 rounded-bl-1 bg-surface-2 px-3">
                  <Dots motionSafe={motionSafe} />
                </span>
                <span className="sr-only">{agent.name} is typing</span>
              </motion.li>
            ) : null}
          </AnimatePresence>
        </ol>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendChat();
        }}
        className="flex shrink-0 items-end gap-2 border-t border-hairline p-2.5"
      >
        <label htmlFor={`${uid}-composer`} className="sr-only">
          Message {agent.name}
        </label>
        <textarea
          id={`${uid}-composer`}
          data-autofocus
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder={`Message ${agent.name}`}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              sendChat();
            }
          }}
          className={cn(
            "block [field-sizing:content] max-h-24 min-w-0 flex-1 resize-none rounded-2 border border-input bg-background px-3 py-[7px] text-[13px] leading-5 text-foreground placeholder:text-ink-3",
            FOCUS,
          )}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={disabled}
          aria-disabled={!draft.trim() || undefined}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-2 bg-primary text-primary-foreground transition-opacity",
            FOCUS,
            !draft.trim() && "opacity-50",
          )}
        >
          <SendHorizontal aria-hidden className="size-4" />
        </button>
      </form>
    </>
  );

  /* ---- ticket ---- */
  const ticketView = ticket ? (
    <>
      {header({
        back: false,
        title: (
          <h3
            data-autofocus
            tabIndex={-1}
            className="truncate text-[14px] font-semibold text-foreground outline-none"
          >
            Request sent
          </h3>
        ),
      })}
      <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="flex items-start gap-3">
          <motion.span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[oklch(from_var(--success)_0.82_c_h)]"
            initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe
                ? {
                    scale: springs.recoil,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
          >
            <Check className="size-4 text-[oklch(from_var(--success)_0.32_c_h)]" />
          </motion.span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-foreground">
              Ticket{" "}
              <span className="font-mono tabular-nums">{ticket.number}</span> is
              open
            </p>
            <p className="mt-0.5 text-[13px] text-ink-2">
              We&apos;ll answer by email at {ticket.email}.
            </p>
          </div>
        </div>
        <div className="rounded-3 border border-hairline bg-surface-2 p-3">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {ticket.topic}
          </p>
          <p className="mt-1 line-clamp-4 text-[13px] leading-5 text-foreground">
            {ticket.message}
          </p>
        </div>
        <button
          type="button"
          onClick={home}
          className={cn(
            "inline-flex h-9 items-center justify-center rounded-2 border border-hairline text-[13px] text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          Back to help
        </button>
      </div>
    </>
  ) : null;

  const content =
    view.kind === "article"
      ? articleView
      : view.kind === "contact"
        ? contactView
        : view.kind === "chat"
          ? chatView
          : view.kind === "ticket"
            ? ticketView
            : homeView;

  const off = motionSafe ? distances.shift : 0;
  const viewVariants: Variants = {
    enter: (d: number) => ({ opacity: 0, x: d * off }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({
      opacity: 0,
      x: -d * off,
      transition: exitFor(durations.base),
    }),
  };

  // The panel's clip runs from a launcher-sized circle at the corner nearest
  // the launcher to the whole box, while the box slides over from the
  // launcher by the gap between them.
  const top = corner === "top-right";
  const leftSide = corner === "bottom-left";
  const clip = useTransform(grow, (g) => {
    const k = r4(1 - clamp01(g));
    const far = `calc((100% - 44px) * ${k})`;
    const radius = r4(16 + 6 * k);
    const t = top ? "0px" : far;
    const b = top ? far : "0px";
    const l = leftSide ? "0px" : far;
    const r = leftSide ? far : "0px";
    return `inset(${t} ${r} ${b} ${l} round ${radius}px)`;
  });
  const lift = useTransform(grow, (g) =>
    r4((top ? -56 : 56) * (1 - clamp01(g))),
  );
  const inside = useTransform(grow, (g) => r4(clamp01((g - 0.45) / 0.4)));
  const fadeOnly = useTransform(grow, (g) => r4(clamp01(g)));

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container isolate",
        fixed
          ? "pointer-events-none fixed inset-0 z-50"
          : "relative w-full overflow-clip",
        className,
      )}
    >
      {fixed ? null : children}
      <div className="pointer-events-none absolute inset-0">
        {present ? (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onPanelKey}
            style={
              motionSafe ? { clipPath: clip, y: lift } : { opacity: fadeOnly }
            }
            className={cn(
              "pointer-events-auto absolute z-20 flex h-[min(32.5rem,calc(100%-5.5rem))] w-[min(22.5rem,calc(100%-1.5rem))] flex-col overflow-clip rounded-4 border border-hairline-strong bg-card text-foreground shadow-[0_16px_40px_color-mix(in_oklab,black_20%,transparent)] outline-none @min-[64rem]:w-[23.75rem]",
              corner === "bottom-right" && "right-3 bottom-17",
              corner === "bottom-left" && "bottom-17 left-3",
              corner === "top-right" && "top-17 right-3",
              !isOpen && "pointer-events-none",
            )}
            inert={!isOpen || undefined}
          >
            <motion.div
              className="relative flex flex-1 flex-col overflow-hidden"
              style={motionSafe ? { opacity: inside } : undefined}
            >
              <AnimatePresence initial={false} mode="popLayout" custom={dir}>
                <motion.div
                  key={keyOf(view)}
                  ref={bindView}
                  data-view={keyOf(view)}
                  custom={dir}
                  variants={viewVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: motionSafe ? springs.snap : { duration: 0 },
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                  className="flex h-full w-full flex-col bg-card"
                >
                  {content}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : null}

        <button
          ref={launcherRef}
          type="button"
          aria-label={isOpen ? "Close help" : "Open help"}
          aria-expanded={isOpen}
          aria-controls={present ? panelId : undefined}
          disabled={disabled}
          onClick={() => requestOpen(!isOpen)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && isOpen) {
              event.preventDefault();
              requestOpen(false);
            }
          }}
          className={cn(
            "pointer-events-auto absolute z-30 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_color-mix(in_oklab,black_22%,transparent)] transition-[scale] duration-150 disabled:opacity-60",
            motionSafe && "enabled:hover:scale-105 enabled:active:scale-95",
            FOCUS,
            corner === "bottom-right" && "right-3 bottom-3",
            corner === "bottom-left" && "bottom-3 left-3",
            corner === "top-right" && "top-3 right-3",
          )}
        >
          {[false, true].map((cross) => (
            <motion.span
              key={String(cross)}
              aria-hidden
              className="col-start-1 row-start-1 grid place-items-center"
              initial={false}
              animate={{
                opacity: cross === isOpen ? 1 : 0,
                rotate: motionSafe
                  ? cross === isOpen
                    ? 0
                    : cross
                      ? -90
                      : 90
                  : 0,
                scale: cross === isOpen ? 1 : 0.6,
              }}
              transition={
                motionSafe
                  ? {
                      rotate: springs.snap,
                      scale: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              {cross ? (
                <X className="size-5" />
              ) : (
                <CircleHelp className="size-5" />
              )}
            </motion.span>
          ))}
        </button>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

function ArticleGlyph() {
  return (
    <span
      aria-hidden
      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-1 bg-surface-2 text-ink-3"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5 fill-none stroke-current"
        strokeWidth={1.4}
        strokeLinecap="round"
      >
        <path d="M4 3.5h8M4 6.5h8M4 9.5h5" />
      </svg>
    </span>
  );
}
