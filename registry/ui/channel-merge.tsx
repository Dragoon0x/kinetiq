"use client";

import * as React from "react";

import { animate, AnimatePresence, motion } from "motion/react";
import {
  AtSign,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Eye,
  Inbox,
  LoaderCircle,
  Mail,
  MessageCircle,
  RotateCcw,
  Send,
  Smartphone,
  TriangleAlert,
  type LucideIcon,
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

export type ChannelKind = "email" | "sms" | "chat" | "social";

export type ChannelMessage = {
  id: string;
  channel: ChannelKind;
  from: "customer" | "agent";
  author: string;
  /** When it was sent, in ms since the epoch. */
  at: number;
  body: string;
  /** Email only. */
  subject?: string;
  /** Email only: the earlier message it quotes, folded by default. */
  quoted?: string;
  /** Agent messages: how far delivery got. */
  status?: "sending" | "sent" | "delivered" | "read" | "failed";
};

export type ChannelCustomer = {
  name: string;
  company?: string;
  plan?: string;
  email?: string;
  phone?: string;
  /** Where the customer chats from, e.g. "basinworks.app/billing". */
  chat?: string;
  /** Their social handle, e.g. "@harborpine". */
  social?: string;
  /** Online in web chat right now. */
  online?: boolean;
  location?: string;
  /** Minutes from UTC, for the local time in the sidebar. */
  utcOffset?: number;
  /** Customer since, in ms since the epoch. */
  since?: number;
  tags?: string[];
  tickets?: { id: string; title: string; state: "open" | "solved" }[];
};

export type ChannelAgent = { id: string; name: string; team?: string };

export type ChannelReply = {
  channel: ChannelKind;
  /** The address the reply goes to. */
  to: string;
  body: string;
  /** Email only. */
  subject?: string;
};

export type ChannelStripeStyle = "edge" | "rail" | "band";
export type ChannelDensity = "compact" | "regular" | "roomy";
export type ChannelStatus = "ready" | "loading" | "error";

export type ChannelMergeProps = {
  /** The whole conversation across channels, oldest first. @default defaultChannelMessages */
  messages?: ChannelMessage[];
  /** Who the customer is and how to reach them. @default defaultChannelCustomer */
  customer?: ChannelCustomer;
  /** Who the ticket can be assigned to. @default defaultChannelAgents */
  agents?: ChannelAgent[];
  /** Controlled assignee id; null is unassigned. */
  assignee?: string | null;
  /** Initial assignee when uncontrolled. @default "a1" */
  defaultAssignee?: string | null;
  /** Fires from the menu choice that changed the assignee. */
  onAssign?: (agentId: string | null) => void;
  /** Controlled reply channel. */
  channel?: ChannelKind;
  /** Initial reply channel when uncontrolled. @default the customer's latest channel */
  defaultChannel?: ChannelKind;
  /** Fires from the radio that changed the reply channel. */
  onChannelChange?: (channel: ChannelKind) => void;
  /** A reply was sent (Ctrl+Enter or Send). Append it to `messages` to show it. */
  onSend?: (reply: ChannelReply) => void;
  /** The ticket's subject, in the header and the email reply's "Re:". @default "Invoice shows Team seats twice" */
  subject?: string;
  /** The ticket's reference. @default "BW-4821" */
  ticket?: string;
  /** The moment "now" is, in ms since the epoch (never read from the clock). @default defaultChannelNow */
  now?: number;
  /** Which reply channels to offer, in order. @default ["email", "sms", "chat", "social"] */
  channels?: ChannelKind[];
  /** Override a channel's stripe colour — any CSS colour. */
  channelColors?: Partial<Record<ChannelKind, string>>;
  /** How each message shows its channel: an inner edge, a continuous rail in the gutter, or a top band. @default "edge" */
  stripeStyle?: ChannelStripeStyle;
  /** Type size, message padding and gaps. @default "regular" */
  density?: ChannelDensity;
  /** Send, focus edges, the agent's messages and the assignee — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Characters in one text message before it splits into segments. @default 160 */
  smsLimit?: number;
  /** Whether the conversation has loaded. @default "ready" */
  status?: ChannelStatus;
  /** "Try again" was pressed after the conversation failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the thread scrolls inside it. @default 540 */
  height?: number;
  /** Read only: no composer and no assigning. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const MON = Date.UTC(2026, 9, 12);

/** Thursday afternoon, so every default renders the same everywhere. */
export const defaultChannelNow = MON + 3 * DAY + 16 * 60 * MIN + 20 * MIN;

export const defaultChannelCustomer: ChannelCustomer = {
  name: "Dana Whitlock",
  company: "Harbor & Pine",
  plan: "Team · 12 seats",
  email: "dana@harborpine.co",
  phone: "+1 555 014 2290",
  chat: "basinworks.app/billing",
  social: "@harborpine",
  online: true,
  location: "Westhaven",
  utcOffset: -7 * 60,
  since: Date.UTC(2024, 2, 4),
  tags: ["Billing", "Team plan", "Renewal in Nov"],
  tickets: [
    { id: "BW-4821", title: "Invoice shows Team seats twice", state: "open" },
    { id: "BW-4610", title: "Export to CSV skips archived", state: "solved" },
    { id: "BW-4377", title: "Add a second admin", state: "solved" },
  ],
};

export const defaultChannelAgents: ChannelAgent[] = [
  { id: "a1", name: "Mara Quinn", team: "Billing" },
  { id: "a2", name: "Leo Brandt", team: "Billing" },
  { id: "a3", name: "Priya Raman", team: "Accounts" },
  { id: "a4", name: "Kenji Ito", team: "Tier 2" },
];

export const defaultChannelMessages: ChannelMessage[] = [
  {
    id: "c1",
    channel: "email",
    from: "customer",
    author: "Dana Whitlock",
    at: MON + 9 * 60 * MIN + 14 * MIN,
    subject: "Invoice shows Team seats twice",
    body: "Hi, our October invoice lists the Team plan twice: 12 seats on the 1st and 12 again on the 3rd. We only have one workspace. Can you take a look before it charges on Friday?\n\nDana",
  },
  {
    id: "c2",
    channel: "email",
    from: "agent",
    author: "Mara Quinn",
    at: MON + 10 * 60 * MIN + 2 * MIN,
    subject: "Re: Invoice shows Team seats twice",
    body: "Thanks Dana. I can see both lines: the second came from a trial workspace that converted on the 3rd. I've asked billing to void it, and a corrected invoice follows within a day.",
    quoted:
      "Hi, our October invoice lists the Team plan twice: 12 seats on the 1st and 12 again on the 3rd.",
    status: "read",
  },
  {
    id: "c3",
    channel: "sms",
    from: "customer",
    author: "Dana Whitlock",
    at: MON + DAY + 8 * 60 * MIN + 40 * MIN,
    body: "Corrected invoice still shows 24 seats. Charge is Friday. Can someone look today?",
  },
  {
    id: "c4",
    channel: "sms",
    from: "agent",
    author: "Mara Quinn",
    at: MON + DAY + 8 * 60 * MIN + 52 * MIN,
    body: "Hi Dana, Mara from Basinworks. On it now, I'll come back within the hour.",
    status: "delivered",
  },
  {
    id: "c5",
    channel: "chat",
    from: "customer",
    author: "Dana Whitlock",
    at: MON + 3 * DAY + 16 * 60 * MIN + 2 * MIN,
    body: "I'm in billing settings and it lists two workspaces: Harbor & Pine and “H&P trial”. Is the trial the one being charged?",
  },
  {
    id: "c6",
    channel: "chat",
    from: "agent",
    author: "Mara Quinn",
    at: MON + 3 * DAY + 16 * 60 * MIN + 5 * MIN,
    body: "Yes, that's the one. You can delete it from Settings, or I can close it for you.",
    status: "read",
  },
  {
    id: "c7",
    channel: "chat",
    from: "customer",
    author: "Dana Whitlock",
    at: MON + 3 * DAY + 16 * 60 * MIN + 7 * MIN,
    body: "Please close it for me, I don't want to delete the wrong one.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const CHANNEL: Record<
  ChannelKind,
  { label: string; short: string; Icon: LucideIcon; hue: number }
> = {
  email: { label: "Email", short: "Email", Icon: Mail, hue: 258 },
  sms: { label: "Text", short: "Text", Icon: Smartphone, hue: 158 },
  chat: { label: "Web chat", short: "Chat", Icon: MessageCircle, hue: 318 },
  social: { label: "Social DM", short: "Social", Icon: AtSign, hue: 62 },
};

const DENSITY: Record<
  ChannelDensity,
  { text: string; pad: string; gap: string; meta: string }
> = {
  compact: {
    text: "text-[12px] leading-[18px]",
    pad: "px-2.5 py-2",
    gap: "gap-2",
    meta: "text-[11px]",
  },
  regular: {
    text: "text-[13px] leading-5",
    pad: "px-3 py-2.5",
    gap: "gap-3",
    meta: "text-[11px]",
  },
  roomy: {
    text: "text-[13px] leading-[22px]",
    pad: "px-3.5 py-3",
    gap: "gap-4",
    meta: "text-[12px]",
  },
};

const DEFAULT_CHANNELS: ChannelKind[] = ["email", "sms", "chat", "social"];
const SOCIAL_LIMIT = 1000;
const WIDE_PX = 704;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
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

const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
};
const monthYear = (ms: number) => {
  const d = new Date(ms);
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const dayKey = (ms: number) => Math.floor(ms / DAY);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const listWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** GSM concatenation: one part holds `limit`, a split one 7 fewer each. */
const segments = (length: number, limit: number) =>
  length <= limit ? 1 : Math.ceil(length / Math.max(1, limit - 7));

const STATUS_WORD: Record<NonNullable<ChannelMessage["status"]>, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not delivered",
};

/** Digits that roll into place, each place its own column. */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const digits = String(Math.max(0, value)).split("");
  return (
    <span
      aria-hidden
      className="inline-flex tabular-nums"
      style={{ height: 16, lineHeight: "16px" }}
    >
      {digits.map((digit, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden text-center"
          style={{ width: "1ch", height: 16 }}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={digit}
              className="absolute inset-0"
              initial={motionSafe ? { y: "100%", opacity: 0 } : { opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={
                motionSafe
                  ? {
                      y: "-100%",
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }
                  : { opacity: 0, transition: { duration: durations.blink } }
              }
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {digit}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

function Avatar({
  name,
  size = 22,
  tone,
}: {
  name: string;
  size?: number;
  tone: "customer" | "agent";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-mono font-semibold",
        tone === "agent"
          ? "bg-[color-mix(in_oklab,var(--cm-accent)_18%,var(--card))] text-[var(--cm-ink)]"
          : "bg-surface-2 text-ink-2",
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * One customer, every channel, one thread. Each message carries a thin
 * stripe in its channel's hue (a pigment at a fixed lightness, so it reads on
 * a light card and a dark one) — an inner edge, a rail through the gutter that
 * changes colour where the conversation changed channel, or a top band.
 *
 * The reply channel is a radio group. Choosing one slides its badge across on
 * `springs.snap` (a shared layout id) while the composer reshapes: its
 * measured height glides on `springs.glide` as the email subject unfolds, the
 * text counter appears with segments that roll, the address cross-fades with a
 * nudge, and the top stripe wipes into the new hue from the side the badge
 * came from. Ctrl+Enter sends; the reply lands rising on glide while its stripe
 * draws on `springs.flick`. Channels the customer has never used are greyed
 * and skipped. Under a 44rem container the customer sidebar moves behind a tab.
 */
export function ChannelMerge({
  messages = defaultChannelMessages,
  customer = defaultChannelCustomer,
  agents = defaultChannelAgents,
  assignee,
  defaultAssignee = "a1",
  onAssign,
  channel,
  defaultChannel,
  onChannelChange,
  onSend,
  subject = "Invoice shows Team seats twice",
  ticket = "BW-4821",
  now = defaultChannelNow,
  channels = DEFAULT_CHANNELS,
  channelColors,
  stripeStyle = "edge",
  density = "regular",
  accent = "var(--accent-bright)",
  smsLimit = 160,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: ChannelMergeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density];

  const colorOf = (kind: ChannelKind) =>
    channelColors?.[kind] ?? `oklch(0.63 0.13 ${CHANNEL[kind].hue})`;

  const used = React.useMemo(() => {
    const set = new Set<ChannelKind>();
    for (const m of messages) if (m.from === "customer") set.add(m.channel);
    return set;
  }, [messages]);

  const addressOf = (kind: ChannelKind): string | undefined =>
    kind === "email"
      ? customer.email
      : kind === "sms"
        ? customer.phone
        : kind === "chat"
          ? customer.chat
          : customer.social;

  const available = (kind: ChannelKind) =>
    used.has(kind) && Boolean(addressOf(kind));

  const latestCustomerChannel = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m && m.from === "customer") return m.channel;
    }
    return undefined;
  }, [messages]);

  const [ownChannel, setOwnChannel] = React.useState<ChannelKind>(
    () =>
      defaultChannel ??
      latestCustomerChannel ??
      channels.find((k) => available(k)) ??
      "email",
  );
  const current = channel ?? ownChannel;
  const [prevChannel, setPrevChannel] = React.useState<ChannelKind>(current);
  const [wipe, setWipe] = React.useState<{ n: number; dir: 1 | -1 }>({
    n: 0,
    dir: 1,
  });

  const [ownAssignee, setOwnAssignee] = React.useState<string | null>(
    defaultAssignee,
  );
  const assigned = assignee === undefined ? ownAssignee : assignee;
  const assignedAgent = agents.find((a) => a.id === assigned) ?? null;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ---------------------------- channel switch --------------------------- */

  const radioRefs = React.useRef(new Map<ChannelKind, HTMLButtonElement>());

  const choose = (kind: ChannelKind, focus = false) => {
    if (!available(kind) || disabled) return;
    if (focus) radioRefs.current.get(kind)?.focus();
    if (kind === current) return;
    const from = channels.indexOf(current);
    const to = channels.indexOf(kind);
    setPrevChannel(current);
    setWipe((w) => ({ n: w.n + 1, dir: to >= from ? 1 : -1 }));
    if (channel === undefined) setOwnChannel(kind);
    onChannelChange?.(kind);
    say(
      `Replying by ${CHANNEL[kind].label}${addressOf(kind) ? ` to ${addressOf(kind)}` : ""}.`,
    );
  };

  const onRadioKey = (event: React.KeyboardEvent, kind: ChannelKind) => {
    const open = channels.filter((k) => available(k));
    const at = open.indexOf(kind);
    let next: ChannelKind | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = open[(at + 1) % open.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = open[(at - 1 + open.length) % open.length];
    else if (event.key === "Home") next = open[0];
    else if (event.key === "End") next = open[open.length - 1];
    if (!next) return;
    event.preventDefault();
    choose(next, true);
  };

  /* -------------------------------- drafts ------------------------------- */

  // Whether the thread follows its newest message: true until the reader
  // scrolls up, and again after a send.
  const stickToEnd = React.useRef(true);

  const [body, setBody] = React.useState("");
  const [subjectLine, setSubjectLine] = React.useState(`Re: ${subject}`);
  const [tried, setTried] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  const isEmail = current === "email";
  const parts = current === "sms" ? segments(body.length, smsLimit) : 1;
  const tooLong = current === "social" && body.length > SOCIAL_LIMIT;
  const missingBody = body.trim().length === 0;
  const missingSubject = isEmail && subjectLine.trim().length === 0;
  const canSend =
    !disabled &&
    !missingBody &&
    !missingSubject &&
    !tooLong &&
    available(current);
  const to = addressOf(current) ?? "";

  const send = () => {
    if (!canSend) {
      setTried(true);
      say(
        missingBody
          ? "Write a reply first."
          : missingSubject
            ? "Add a subject for email."
            : `Social messages hold ${SOCIAL_LIMIT} characters.`,
      );
      return;
    }
    onSend?.({
      channel: current,
      to,
      body: body.trim(),
      subject: isEmail ? subjectLine.trim() : undefined,
    });
    setBody("");
    setTried(false);
    if (bodyRef.current) bodyRef.current.style.height = "";
    stickToEnd.current = true;
    say(`Sent by ${CHANNEL[current].label} to ${to}.`);
  };

  /* -------------------------- composer measuring ------------------------- */

  const [shapeNode, setShapeNode] = React.useState<HTMLDivElement | null>(null);
  const [shapeH, setShapeH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!shapeNode) return;
    const ro = new ResizeObserver(() =>
      setShapeH(Math.round(shapeNode.getBoundingClientRect().height)),
    );
    ro.observe(shapeNode);
    return () => ro.disconnect();
  }, [shapeNode]);

  /* ------------------------------ wide / tabs ---------------------------- */

  const [rootNode, setRootNode] = React.useState<HTMLElement | null>(null);
  const [wide, setWide] = React.useState(true);
  const [tab, setTab] = React.useState<"thread" | "customer">("thread");
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWide(entry.contentRect.width >= WIDE_PX);
    });
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);
  const showCustomer = !wide && tab === "customer";
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  /* ------------------------------- thread -------------------------------- */

  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const [initialIds] = React.useState(() => new Set(messages.map((m) => m.id)));
  const [openQuotes, setOpenQuotes] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const placedThread = React.useRef(false);
  const scrollRun = React.useRef<ReturnType<typeof animate> | null>(null);
  const lastId = messages[messages.length - 1]?.id ?? "";

  // The thread opens at its newest message; a new one glides into view if the
  // reader was already at the end (or just sent it).
  React.useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) {
      placedThread.current = false;
      return;
    }
    const target = el.scrollHeight - el.clientHeight;
    if (!placedThread.current) {
      placedThread.current = true;
      el.scrollTop = target;
      return;
    }
    if (!stickToEnd.current) return;
    scrollRun.current?.stop();
    if (!motionSafe) {
      el.scrollTop = target;
      return;
    }
    scrollRun.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = v;
      },
    });
  }, [lastId, messages.length, motionSafe, status]);

  React.useEffect(() => () => scrollRun.current?.stop(), []);

  /* ------------------------------ assign menu ---------------------------- */

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuIndex, setMenuIndex] = React.useState(0);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const menuItems: (ChannelAgent | null)[] = [...agents, null];

  const openMenu = (at?: number) => {
    const index =
      at ??
      Math.max(
        0,
        menuItems.findIndex((a) => (a?.id ?? null) === assigned),
      );
    setMenuIndex(index);
    setMenuOpen(true);
  };
  const closeMenu = (refocus: boolean) => {
    setMenuOpen(false);
    if (refocus && triggerRef.current?.isConnected) triggerRef.current.focus();
  };
  const pickAgent = (agent: ChannelAgent | null) => {
    const id = agent?.id ?? null;
    if (assignee === undefined) setOwnAssignee(id);
    onAssign?.(id);
    closeMenu(true);
    say(agent ? `Assigned to ${agent.name}.` : "Unassigned.");
  };

  // Focus follows the highlighted item once the menu is there.
  React.useEffect(() => {
    if (!menuOpen) return;
    itemRefs.current[menuIndex]?.focus();
  }, [menuOpen, menuIndex]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menuOpen]);

  /* -------------------------------- render ------------------------------- */

  const usedLabels = channels
    .filter((k) => used.has(k))
    .map((k) => CHANNEL[k].label);

  const localTime =
    customer.utcOffset === undefined
      ? null
      : clock(now + customer.utcOffset * MIN);

  const offsetLabel =
    customer.utcOffset === undefined
      ? ""
      : `UTC${customer.utcOffset < 0 ? "−" : "+"}${Math.abs(customer.utcOffset / 60)}`;

  const header = (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2"
      >
        <Inbox className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p
          id={titleId}
          title={subject}
          className="truncate text-sm font-semibold"
        >
          {subject}
        </p>
        <p className="truncate text-[11px] text-ink-3">
          <span className="font-mono tabular-nums">{ticket}</span> ·{" "}
          {customer.name}
          {usedLabels.length ? ` · ${listWords(usedLabels)}` : ""}
        </p>
      </div>
      {disabled ? null : (
        <div className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`Assignee: ${assignedAgent?.name ?? "unassigned"}. Change`}
            onClick={() => (menuOpen ? closeMenu(false) : openMenu())}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                openMenu(
                  event.key === "ArrowUp" ? menuItems.length - 1 : undefined,
                );
              }
            }}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-2 border border-hairline pr-2 pl-1.5 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={assigned ?? "none"}
                className="flex items-center gap-2"
                initial={
                  motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
              >
                {assignedAgent ? (
                  <Avatar name={assignedAgent.name} size={20} tone="agent" />
                ) : (
                  <span
                    aria-hidden
                    className="size-5 rounded-full border border-dashed border-hairline-strong"
                  />
                )}
                <span className="hidden max-w-28 truncate @min-[30rem]/channel-merge:inline">
                  {assignedAgent?.name ?? "Unassigned"}
                </span>
              </motion.span>
            </AnimatePresence>
            <ChevronDown aria-hidden className="size-3.5 text-ink-3" />
          </button>
          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                ref={menuRef}
                role="menu"
                aria-label="Assign to"
                initial={
                  motionSafe
                    ? { opacity: 0, y: -distances.nudge, scale: 0.98 }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
                style={{ originX: 1, originY: 0 }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeMenu(true);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMenuIndex((i) => (i + 1) % menuItems.length);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMenuIndex(
                      (i) => (i - 1 + menuItems.length) % menuItems.length,
                    );
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    setMenuIndex(0);
                  } else if (event.key === "End") {
                    event.preventDefault();
                    setMenuIndex(menuItems.length - 1);
                  } else if (event.key === "Tab") {
                    closeMenu(false);
                  }
                }}
                className="absolute top-full right-0 z-30 mt-1.5 w-52 rounded-3 border border-hairline-strong bg-popover p-1 shadow-lg"
              >
                {menuItems.map((agent, i) => {
                  const checked = (agent?.id ?? null) === assigned;
                  return (
                    <button
                      key={agent?.id ?? "none"}
                      ref={(node) => {
                        itemRefs.current[i] = node;
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={checked}
                      tabIndex={i === menuIndex ? 0 : -1}
                      onClick={() => pickAgent(agent)}
                      onPointerMove={() => setMenuIndex(i)}
                      className={cn(
                        "flex h-9 w-full items-center gap-2 rounded-2 px-2 text-left text-[12px] text-foreground",
                        i === menuIndex && "bg-surface-2",
                        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      )}
                    >
                      {agent ? (
                        <Avatar name={agent.name} size={20} tone="agent" />
                      ) : (
                        <span
                          aria-hidden
                          className="size-5 shrink-0 rounded-full border border-dashed border-hairline-strong"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {agent?.name ?? "Unassigned"}
                        {agent?.team ? (
                          <span className="text-ink-3"> · {agent.team}</span>
                        ) : null}
                      </span>
                      {checked ? (
                        <Check
                          aria-hidden
                          className="size-3.5 shrink-0 text-[var(--cm-ink)]"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      )}
    </header>
  );

  /* ------------------------------- messages ------------------------------ */

  const items: React.ReactNode[] = [];
  let prev: ChannelMessage | undefined;
  for (const m of messages) {
    const meta = CHANNEL[m.channel];
    const color = colorOf(m.channel);
    if (!prev || dayKey(prev.at) !== dayKey(m.at)) {
      items.push(
        <li
          key={`day-${m.id}`}
          aria-hidden
          className="flex items-center gap-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          <span className="h-px flex-1 bg-hairline" />
          {dayLabel(m.at)}
          <span className="h-px flex-1 bg-hairline" />
        </li>,
      );
    } else if (prev.channel !== m.channel && stripeStyle !== "rail") {
      items.push(
        <li
          key={`move-${m.id}`}
          aria-hidden
          className="flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
        >
          <meta.Icon className="size-3" style={{ color }} />
          Moved to {meta.label}
        </li>,
      );
    }
    const fresh = !initialIds.has(m.id);
    const agent = m.from === "agent";
    const quoteOpen = openQuotes.has(m.id);
    const quoteId = `${uid}-q-${m.id}`;
    const isLast = m === messages[messages.length - 1];
    items.push(
      <motion.li
        key={m.id}
        initial={
          fresh
            ? motionSafe
              ? { opacity: 0, y: distances.step }
              : { opacity: 0 }
            : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
        className={cn("relative flex", stripeStyle === "rail" && "pl-7")}
      >
        {stripeStyle === "rail" ? (
          <>
            <motion.span
              aria-hidden
              className={cn(
                "absolute top-0 left-[9px] w-[2px] rounded-full",
                isLast ? "bottom-2" : "-bottom-4",
              )}
              style={{ backgroundColor: color, originY: 0 }}
              initial={fresh && motionSafe ? { scaleY: 0 } : false}
              animate={{ scaleY: 1 }}
              transition={springs.flick}
            />
            <motion.span
              aria-hidden
              className="absolute top-2 left-0 flex size-5 items-center justify-center rounded-full border-2 bg-card"
              style={{ borderColor: color, color }}
              initial={fresh && motionSafe ? { scale: 0.5 } : false}
              animate={{ scale: 1 }}
              transition={springs.snap}
            >
              <meta.Icon className="size-2.5" strokeWidth={2.4} />
            </motion.span>
          </>
        ) : null}
        <article
          className={cn(
            "relative min-w-0 flex-1 overflow-hidden rounded-3 border",
            d.pad,
            agent
              ? "ml-8 border-[color-mix(in_oklab,var(--cm-accent)_22%,var(--hairline))] bg-[color-mix(in_oklab,var(--cm-accent)_6%,var(--card))]"
              : "mr-8 border-hairline bg-surface-2",
            stripeStyle === "edge" && "pl-4",
            stripeStyle === "band" && "pt-3",
          )}
        >
          {stripeStyle === "edge" ? (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ backgroundColor: color, originY: 0 }}
              initial={fresh && motionSafe ? { scaleY: 0 } : false}
              animate={{ scaleY: 1 }}
              transition={springs.flick}
            />
          ) : stripeStyle === "band" ? (
            <motion.span
              aria-hidden
              className="absolute inset-x-0 top-0 h-[2px]"
              style={{ backgroundColor: color, originX: 0 }}
              initial={fresh && motionSafe ? { scaleX: 0 } : false}
              animate={{ scaleX: 1 }}
              transition={springs.flick}
            />
          ) : null}
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-2 gap-y-0.5",
              d.meta,
            )}
          >
            <Avatar name={m.author} tone={agent ? "agent" : "customer"} />
            <span className="font-medium text-foreground">{m.author}</span>
            <span className="sr-only"> by </span>
            <span
              className="inline-flex items-center gap-1 font-mono text-[10px] tracking-[0.04em] uppercase"
              style={{
                color: `color-mix(in oklab, ${color} 75%, var(--foreground))`,
              }}
            >
              <meta.Icon aria-hidden className="size-3" />
              {meta.short}
            </span>
            <span className="ml-auto font-mono text-[10px] text-ink-3 tabular-nums">
              <span className="sr-only">, {dayLabel(m.at)} </span>
              {clock(m.at)}
            </span>
          </div>
          {m.subject ? (
            <p className={cn("mt-1.5 font-semibold text-foreground", d.text)}>
              {m.subject}
            </p>
          ) : null}
          <p
            className={cn(
              "mt-1 [overflow-wrap:anywhere] whitespace-pre-line text-foreground",
              d.text,
            )}
          >
            {m.body}
          </p>
          {m.quoted ? (
            <div className="mt-1.5">
              <button
                type="button"
                aria-expanded={quoteOpen}
                aria-controls={quoteId}
                onClick={() =>
                  setOpenQuotes((set) => {
                    const next = new Set(set);
                    if (next.has(m.id)) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  })
                }
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-1 text-[11px] text-ink-3 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-3 transition-transform",
                    quoteOpen && "rotate-180",
                  )}
                />
                {quoteOpen ? "Hide quoted text" : "Show quoted text"}
              </button>
              <AnimatePresence initial={false}>
                {quoteOpen ? (
                  <motion.div
                    id={quoteId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe
                        ? {
                            height: springs.glide,
                            opacity: { duration: durations.base },
                          }
                        : { duration: 0 }
                    }
                    className="overflow-hidden"
                  >
                    <p
                      className={cn(
                        "mt-1 border-l-2 border-hairline-strong pl-2.5 text-ink-2",
                        d.text,
                      )}
                    >
                      {m.quoted}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
          {agent && m.status ? (
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1 text-[11px]",
                m.status === "failed" ? "text-danger" : "text-ink-3",
              )}
            >
              {m.status === "sending" ? (
                <LoaderCircle
                  aria-hidden
                  className={cn("size-3", motionSafe && "animate-spin")}
                />
              ) : m.status === "sent" ? (
                <Check aria-hidden className="size-3" />
              ) : m.status === "delivered" ? (
                <CheckCheck aria-hidden className="size-3" />
              ) : m.status === "read" ? (
                <Eye aria-hidden className="size-3" />
              ) : (
                <CircleAlert aria-hidden className="size-3" />
              )}
              {STATUS_WORD[m.status]}
            </p>
          ) : null}
        </article>
      </motion.li>,
    );
    prev = m;
  }

  const thread = (
    <div
      ref={threadRef}
      onScroll={() => {
        const el = threadRef.current;
        if (!el) return;
        // Following the end is the reader's choice: scrolling up stops it.
        stickToEnd.current =
          el.scrollHeight - el.clientHeight - el.scrollTop < 24;
      }}
      className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 pt-3 pb-4"
    >
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center-safe justify-center-safe gap-1 text-center">
          <p className="text-sm text-foreground">No messages yet.</p>
          <p className="text-[12px] text-ink-3">
            Start the conversation from the composer below.
          </p>
        </div>
      ) : (
        <ol
          role="list"
          aria-labelledby={titleId}
          className={cn("flex flex-col", d.gap)}
        >
          {items}
        </ol>
      )}
    </div>
  );

  /* ------------------------------- composer ------------------------------ */

  const currentColor = colorOf(current);
  const prevColor = colorOf(prevChannel);
  const greyReason = (kind: ChannelKind) =>
    !addressOf(kind)
      ? `No ${CHANNEL[kind].label.toLowerCase()} address for ${customer.name.split(" ")[0]}`
      : `${customer.name.split(" ")[0]} hasn't used ${CHANNEL[kind].label}`;

  const counter =
    current === "sms" ? (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono text-[11px] tabular-nums",
          body.length > smsLimit ? "text-warn" : "text-ink-3",
        )}
      >
        <span className="sr-only">
          {body.length} characters, {plural(parts, "segment", "segments")}
        </span>
        <span aria-hidden>
          {body.length} / {smsLimit} ·
        </span>
        <RollingCount value={parts} motionSafe={motionSafe} />
        <span aria-hidden>{parts === 1 ? "segment" : "segments"}</span>
      </span>
    ) : current === "social" ? (
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          tooLong ? "text-danger" : "text-ink-3",
        )}
      >
        {body.length} / {SOCIAL_LIMIT}
      </span>
    ) : current === "chat" ? (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3">
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            customer.online
              ? "bg-[oklch(from_var(--success)_0.66_c_h)]"
              : "bg-ink-3",
          )}
        />
        {customer.online
          ? `${customer.name.split(" ")[0]} sees this live`
          : `${customer.name.split(" ")[0]} is away, it waits in chat`}
      </span>
    ) : (
      <span className="truncate text-[11px] text-ink-3">
        Signed {assignedAgent?.name ?? "Basinworks Support"}
      </span>
    );

  const composer = disabled ? null : (
    <div
      className="relative shrink-0 border-t border-hairline"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          send();
        }
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-0 -top-px h-[2px] overflow-hidden"
      >
        <span
          className="absolute inset-0"
          style={{ backgroundColor: prevColor }}
        />
        <motion.span
          key={wipe.n}
          className="absolute inset-0"
          style={{ backgroundColor: currentColor }}
          initial={
            wipe.n === 0
              ? false
              : motionSafe
                ? {
                    clipPath:
                      wipe.dir > 0 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)",
                  }
                : { opacity: 0 }
          }
          animate={{ clipPath: "inset(0 0% 0 0%)", opacity: 1 }}
          transition={{
            duration: motionSafe ? durations.slow : durations.fast,
            ease: easings.move,
          }}
        />
      </div>
      <div className="flex flex-col gap-2 px-3 pt-2.5 pb-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div
            role="radiogroup"
            aria-label="Reply by"
            className="flex flex-wrap items-center gap-1 rounded-3 border border-hairline bg-surface-2 p-0.5"
          >
            {channels.map((kind) => {
              const meta = CHANNEL[kind];
              const on = kind === current;
              const open = available(kind);
              return (
                <button
                  key={kind}
                  ref={(node) => {
                    if (node) radioRefs.current.set(kind, node);
                    else radioRefs.current.delete(kind);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-disabled={!open || undefined}
                  aria-label={
                    open ? meta.label : `${meta.label}, ${greyReason(kind)}`
                  }
                  title={open ? undefined : greyReason(kind)}
                  tabIndex={on ? 0 : -1}
                  onClick={() => choose(kind)}
                  onKeyDown={(event) => onRadioKey(event, kind)}
                  className={cn(
                    "relative inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[12px] transition-colors",
                    on
                      ? "text-foreground"
                      : open
                        ? "text-ink-2 hover:text-foreground"
                        : "cursor-not-allowed text-ink-3 opacity-60",
                    FOCUS_RING,
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId={`${uid}-badge`}
                      aria-hidden
                      className="absolute inset-0 rounded-2 border bg-card shadow-sm"
                      style={{
                        borderColor: `color-mix(in oklab, ${colorOf(kind)} 55%, transparent)`,
                      }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <meta.Icon
                    aria-hidden
                    className="relative size-3.5 shrink-0"
                    style={{ color: open ? colorOf(kind) : undefined }}
                  />
                  <span className="relative hidden @min-[26rem]/channel-merge:inline">
                    {meta.short}
                  </span>
                  {!open ? (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2 border border-dashed border-hairline-strong"
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="grid min-w-0 flex-1 basis-32 text-[12px]">
            <AnimatePresence initial={false}>
              <motion.p
                key={current}
                className="col-start-1 row-start-1 truncate text-ink-3"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.nudge : 0,
                  transition: exitFor(durations.fast),
                }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                To <span className="text-foreground">{to || "no address"}</span>
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <motion.div
          initial={false}
          animate={{ height: shapeH === null ? "auto" : shapeH + 8 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
          className="-m-1 overflow-hidden p-1"
        >
          <div ref={setShapeNode} className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {isEmail ? (
                <motion.div
                  key="subject"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <label className="sr-only" htmlFor={`${uid}-subject`}>
                    Subject
                  </label>
                  <input
                    id={`${uid}-subject`}
                    value={subjectLine}
                    aria-invalid={tried && missingSubject ? true : undefined}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSubjectLine(value);
                    }}
                    placeholder="Subject"
                    className={cn(
                      "h-8 w-full rounded-2 border border-hairline bg-surface-2 px-2.5 text-[13px] font-medium text-foreground placeholder:text-ink-3",
                      "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      tried && missingSubject && "border-danger",
                    )}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
            <label className="sr-only" htmlFor={`${uid}-body`}>
              Reply by {CHANNEL[current].label}
            </label>
            <textarea
              ref={bodyRef}
              id={`${uid}-body`}
              rows={2}
              value={body}
              aria-invalid={
                tried && (missingBody || tooLong) ? true : undefined
              }
              aria-describedby={`${uid}-foot`}
              onChange={(event) => {
                const node = event.currentTarget;
                const value = node.value;
                setBody(value);
                node.style.height = "auto";
                node.style.height = `${Math.min(node.scrollHeight, 112)}px`;
              }}
              placeholder={
                current === "email"
                  ? "Write an email reply"
                  : current === "sms"
                    ? "Write a text"
                    : current === "chat"
                      ? "Reply in chat"
                      : "Write a direct message"
              }
              className={cn(
                "max-h-28 w-full resize-none rounded-2 border border-hairline bg-surface-2 px-2.5 py-2 text-[13px] leading-5 text-foreground placeholder:text-ink-3",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            />
            <div
              id={`${uid}-foot`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
            >
              <span className="min-w-0">
                {tried && (missingBody || missingSubject) ? (
                  <span className="text-[11px] text-danger">
                    {missingBody
                      ? "Write a reply first."
                      : "Add a subject for email."}
                  </span>
                ) : (
                  counter
                )}
              </span>
              <span className="ml-auto flex items-center gap-2">
                <kbd className="hidden font-mono text-[10px] text-ink-3 @min-[30rem]/channel-merge:inline">
                  Ctrl+Enter
                </kbd>
                <button
                  type="button"
                  onClick={send}
                  aria-disabled={!canSend}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors",
                    canSend
                      ? "bg-[var(--cm-button)] text-white"
                      : "bg-surface-2 text-ink-3",
                    FOCUS_RING,
                  )}
                >
                  <Send aria-hidden className="size-3.5" />
                  Send
                </button>
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );

  /* ------------------------------- sidebar ------------------------------- */

  const sidebar = (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={customer.name} size={40} tone="customer" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{customer.name}</p>
          <p className="truncate text-[12px] text-ink-3">
            {[customer.company, customer.location].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {customer.plan ? (
        <p className="inline-flex w-fit items-center rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
          {customer.plan}
        </p>
      ) : null}
      <div>
        <p className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Channels
        </p>
        <ul role="list" className="flex flex-col gap-1">
          {channels.map((kind) => {
            const meta = CHANNEL[kind];
            const address = addressOf(kind);
            const wasUsed = used.has(kind);
            return (
              <li
                key={kind}
                className={cn(
                  "flex items-center gap-2 text-[12px]",
                  !wasUsed && "text-ink-3",
                )}
              >
                <meta.Icon
                  aria-hidden
                  className="size-3.5 shrink-0"
                  style={{ color: wasUsed ? colorOf(kind) : undefined }}
                />
                <span className="min-w-0 flex-1 truncate" title={address}>
                  {address ?? `No ${meta.label.toLowerCase()}`}
                </span>
                <span className="shrink-0 font-mono text-[10px] tracking-[0.04em] uppercase">
                  {wasUsed ? "Used" : "Not used"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      {localTime ? (
        <p className="text-[12px] text-ink-2">
          <span className="font-mono tabular-nums">{localTime}</span> local ·{" "}
          {offsetLabel}
        </p>
      ) : null}
      {customer.tags?.length ? (
        <div className="flex flex-wrap gap-1">
          {customer.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-1 bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      {customer.tickets?.length ? (
        <div>
          <p className="mb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Tickets
          </p>
          <ul role="list" className="flex flex-col gap-1.5">
            {customer.tickets.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[12px]">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    t.state === "open"
                      ? "bg-[var(--cm-accent)]"
                      : "bg-hairline-strong",
                  )}
                />
                <span className="min-w-0">
                  <span
                    className="block truncate text-foreground"
                    title={t.title}
                  >
                    {t.title}
                  </span>
                  <span className="font-mono text-[10px] text-ink-3">
                    {t.id} · {t.state === "open" ? "Open" : "Solved"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {customer.since ? (
        <p className="text-[11px] text-ink-3">
          Customer since {monthYear(customer.since)}
        </p>
      ) : null}
    </div>
  );

  /* -------------------------------- layout ------------------------------- */

  const tabs = (
    <div
      role="tablist"
      aria-label="Ticket views"
      className="flex shrink-0 gap-1 border-b border-hairline px-3 py-1.5 @min-[44rem]/channel-merge:hidden"
    >
      {(
        [
          ["thread", "Conversation"],
          ["customer", customer.name.split(" ")[0] ?? "Customer"],
        ] as const
      ).map(([key, label], i) => {
        const on = tab === key;
        return (
          <button
            key={key}
            ref={(node) => {
              tabRefs.current[i] = node;
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${key}`}
            aria-selected={on}
            aria-controls={`${uid}-panel-${key}`}
            tabIndex={on ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = key === "thread" ? "customer" : "thread";
                setTab(next);
                tabRefs.current[next === "thread" ? 0 : 1]?.focus();
              }
            }}
            className={cn(
              "relative inline-flex h-8 items-center rounded-2 px-3 text-[12px] transition-colors",
              on ? "text-foreground" : "text-ink-3 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-tab`}
                aria-hidden
                className="absolute inset-x-2 -bottom-1.5 h-[2px] rounded-full bg-[var(--cm-accent)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <section
      ref={setRootNode}
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/channel-merge flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{
        height,
        ["--cm-accent" as string]: `oklch(from ${accent} 0.62 c h)`,
        ["--cm-button" as string]: `oklch(from ${accent} 0.54 c h)`,
        ["--cm-ink" as string]:
          "color-mix(in oklab, var(--cm-accent) 72%, var(--foreground))",
      }}
    >
      {header}
      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            This conversation didn&apos;t load.
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
      ) : status === "loading" ? (
        <div aria-hidden className="flex flex-1 flex-col gap-3 p-4">
          {[70, 52, 80, 44].map((w, i) => (
            <div
              key={i}
              className={cn(
                "h-16 rounded-3 bg-surface-2",
                i % 2 ? "ml-8" : "mr-8",
                motionSafe && "animate-pulse",
              )}
              style={{ width: `${w}%` }}
            />
          ))}
        </div>
      ) : (
        <>
          {tabs}
          <div className="relative flex flex-1 overflow-hidden">
            <motion.div
              initial={false}
              animate={{ x: showCustomer ? "-50%" : "0%" }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              className="flex w-[200%] shrink-0 @min-[44rem]/channel-merge:w-full"
            >
              <div
                id={`${uid}-panel-thread`}
                role={wide ? undefined : "tabpanel"}
                aria-labelledby={wide ? undefined : `${uid}-tab-thread`}
                inert={showCustomer || undefined}
                className="flex w-1/2 flex-col overflow-hidden @min-[44rem]/channel-merge:w-auto @min-[44rem]/channel-merge:flex-1"
              >
                {thread}
                {composer}
              </div>
              <aside
                id={`${uid}-panel-customer`}
                role={wide ? "complementary" : "tabpanel"}
                aria-label={wide ? `About ${customer.name}` : undefined}
                aria-labelledby={wide ? undefined : `${uid}-tab-customer`}
                inert={(!wide && !showCustomer) || undefined}
                className="w-1/2 [scrollbar-width:thin] overflow-y-auto overscroll-contain @min-[44rem]/channel-merge:w-60 @min-[44rem]/channel-merge:shrink-0 @min-[44rem]/channel-merge:border-l @min-[44rem]/channel-merge:border-hairline @min-[70rem]/channel-merge:w-72"
              >
                {sidebar}
              </aside>
            </motion.div>
          </div>
        </>
      )}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
