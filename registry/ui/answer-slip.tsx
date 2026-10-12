"use client";

import * as React from "react";

import { animate, AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Clock,
  Inbox,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  TriangleAlert,
  Undo2,
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

export type AnswerTone = "friendly" | "formal";
export type AnswerTyping = "type" | "fade";
export type AnswerDensity = "compact" | "cozy" | "roomy";
export type AnswerStatus = "ready" | "loading" | "error";
export type AnswerAction = "snoozed" | "escalated";

export type AnswerMessage = {
  id: string;
  /** Who wrote it: the customer, or the agent on this slip. */
  from: "customer" | "agent";
  /** When it was sent, in ms. */
  at: number;
  text: string;
};

export type AnswerTicket = {
  id: string;
  /** Shown in the header, e.g. "FS-4821". */
  ref: string;
  subject: string;
  customer: { name: string; org?: string };
  /** The thread so far, oldest first. Replies sent from the slip are added after it. */
  messages: AnswerMessage[];
};

export type AnswerSuggestion = {
  id: string;
  /** The reply, written in the friendly tone; the formal one is rewritten from it. */
  text: string;
  /** 0–1. */
  confidence: number;
  /** A short reason, e.g. "Known issue". */
  tag: string;
};

export type AnswerSavedReply = {
  id: string;
  title: string;
  text: string;
};

export type AnswerDraftSource =
  "typed" | "suggestion" | "saved" | "tone" | "sent" | "cleared";

export type AnswerDraftChange = {
  source: AnswerDraftSource;
  /** The suggestion or saved reply that was placed, when one was. */
  id?: string;
  /** How many phrases a tone change rewrote. */
  rewritten?: number;
};

export type AnswerSlipProps = {
  /** How a placed reply arrives in the composer: word by word on a quick cascade, or as one cross-fade. @default "type" */
  typing?: AnswerTyping;
  /** Card padding, type size and the composer's height. @default "cozy" */
  density?: AnswerDensity;
  /** The ticket: customer, subject and thread. @default defaultAnswerTicket */
  ticket?: AnswerTicket;
  /** Controlled suggestions. */
  suggestions?: AnswerSuggestion[];
  /** Initial suggestions when uncontrolled. @default defaultAnswerSuggestions */
  defaultSuggestions?: AnswerSuggestion[];
  /** The fresh sets the slip reloads with after each send when uncontrolled, in turn. @default defaultAnswerRounds */
  suggestionRounds?: AnswerSuggestion[][];
  /** The drawer's saved replies. @default defaultAnswerSavedReplies */
  savedReplies?: AnswerSavedReply[];
  /** Controlled draft. */
  value?: string;
  /** Initial draft when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from every keystroke, placed reply, tone change, send or clear that changed the draft. */
  onChange?: (draft: string, change: AnswerDraftChange) => void;
  /** Controlled tone. */
  tone?: AnswerTone;
  /** Initial tone when uncontrolled. @default "friendly" */
  defaultTone?: AnswerTone;
  /** The tone switch was flipped. */
  onToneChange?: (tone: AnswerTone) => void;
  /** A reply was sent. It is already in the thread. */
  onSend?: (reply: AnswerMessage, ticket: AnswerTicket) => void;
  /** Snooze was pressed; the ticket has slid out. */
  onSnooze?: (ticket: AnswerTicket) => void;
  /** Escalate was pressed; the ticket has slid out. */
  onEscalate?: (ticket: AnswerTicket) => void;
  /** Undo brought a snoozed or escalated ticket back. */
  onReopen?: (ticket: AnswerTicket, from: AnswerAction) => void;
  /** The agent's first name, signed under suggestions and shown on sent replies. @default "Mila" */
  agent?: string;
  /** Whether the suggestions have arrived: skeleton cards while loading, a retry when they failed. The composer works either way. @default "ready" */
  status?: AnswerStatus;
  /** "Try again" was pressed after suggestions failed to load. */
  onRetry?: () => void;
  /** How long the slip shows its skeleton after a send before the fresh set lands, in ms. @default 700 */
  reloadDelay?: number;
  /** Prints a message's time. @default UTC "HH:MM" */
  formatTime?: (at: number) => string;
  /** The heading. @default "Fieldline Support" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the thread and the slip scroll inside it. @default 560 */
  height?: number;
  /** Read only: nothing can be typed, placed or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 09:14 UTC: the customer's second message. */
const ASKED = Date.UTC(2026, 9, 12, 9, 14);

/** Rosa at Hollin Street Bakery: her gateway stopped syncing on Tuesday. */
export const defaultAnswerTicket: AnswerTicket = {
  id: "t-4821",
  ref: "FS-4821",
  subject: "Meter readings stopped syncing on Tuesday",
  customer: { name: "Rosa Lindqvist", org: "Hollin Street Bakery" },
  messages: [
    {
      id: "m1",
      from: "customer",
      at: ASKED - 3 * 60 * MIN,
      text: "Hi, since Tuesday our Fieldline gateway shows the readings on the device but the dashboard has not updated. We have restarted it twice.",
    },
    {
      id: "m2",
      from: "customer",
      at: ASKED,
      text: "Is something down on your side? Our water invoice runs off these numbers on Friday.",
    },
  ],
};

/** The first set: a known issue, a question and a workaround. */
export const defaultAnswerSuggestions: AnswerSuggestion[] = [
  {
    id: "s1",
    text: "Hi Rosa, thanks for reaching out. Sorry about that: the dashboard sync for your region stalled on Tuesday after a gateway update, and we pushed a fix this morning. Your readings should catch up within the hour, well before Friday. Let me know if they haven't by then.\n\nCheers,\nMila",
    confidence: 0.92,
    tag: "Known issue",
  },
  {
    id: "s2",
    text: "Hi Rosa, thanks for reaching out. Could you send me the gateway's serial? It's on the underside and starts with FG. I'll check whether it picked up Tuesday's update and push it by hand if not.\n\nCheers,\nMila",
    confidence: 0.74,
    tag: "Needs info",
  },
  {
    id: "s3",
    text: "Hi Rosa, sorry about that. Restarting won't clear this one: the gateway needs to pair with the dashboard again. In the device menu choose Pair again and enter your site code. Let me know how it goes.\n\nCheers,\nMila",
    confidence: 0.58,
    tag: "Workaround",
  },
];

/** What the slip reloads with after each send, in turn, then round again. */
export const defaultAnswerRounds: AnswerSuggestion[][] = [
  [
    {
      id: "s4",
      text: "Hi Rosa, just checking in: are the readings back on your dashboard now? If the numbers still look stale, reply with a screenshot and I'll take another look.\n\nCheers,\nMila",
      confidence: 0.81,
      tag: "Follow-up",
    },
    {
      id: "s5",
      text: "Hi Rosa, I've asked our gateway team to confirm your site caught the fix. I'll let you know as soon as I hear back, today if I can.\n\nCheers,\nMila",
      confidence: 0.66,
      tag: "Progress note",
    },
    {
      id: "s6",
      text: "Hi Rosa, no worries. I'll close this one for now, and if the dashboard falls behind again just reply here and it reopens with me.\n\nCheers,\nMila",
      confidence: 0.49,
      tag: "Close out",
    },
  ],
  [
    {
      id: "s7",
      text: "Hi Rosa, the gateway team confirmed your site took the fix at 09:40 and the readings since Tuesday have backfilled. Friday's invoice will have the right numbers.\n\nCheers,\nMila",
      confidence: 0.88,
      tag: "Resolution",
    },
    {
      id: "s8",
      text: "Hi Rosa, if it helps for Friday, you can export the readings as a CSV from Reports, then Export, and attach that to the invoice directly.\n\nCheers,\nMila",
      confidence: 0.62,
      tag: "Extra help",
    },
    {
      id: "s9",
      text: "Hi Rosa, thanks for your patience this week. Let me know if there's anything else I can do.\n\nCheers,\nMila",
      confidence: 0.44,
      tag: "Close out",
    },
  ],
  defaultAnswerSuggestions,
];

export const defaultAnswerSavedReplies: AnswerSavedReply[] = [
  {
    id: "r1",
    title: "Gateway re-pair steps",
    text: "Hi there, here's how to pair the gateway again: hold the side button for five seconds until the light blinks blue, open the device menu, choose Pair again and enter your site code. Readings resume within ten minutes.\n\nCheers,\nMila",
  },
  {
    id: "r2",
    title: "Outage apology",
    text: "Hi there, sorry about that. We had an outage on the dashboard this morning and it's fully back now. Nothing was lost on the gateway, so your readings will catch up on their own.\n\nCheers,\nMila",
  },
  {
    id: "r3",
    title: "Export readings as CSV",
    text: "Hi there, you can export any range of readings as a CSV from Reports, then Export. Pick the sites and dates and the file lands in your downloads.\n\nCheers,\nMila",
  },
  {
    id: "r4",
    title: "Password reset",
    text: "Hi there, I've sent a password reset link to the address on the account. It's good for one hour. Let me know if it doesn't arrive.\n\nCheers,\nMila",
  },
  {
    id: "r5",
    title: "Billing contact",
    text: "Hi there, billing questions go to the Fieldline accounts desk, and I've copied them on this ticket so you don't have to repeat yourself.\n\nCheers,\nMila",
  },
  {
    id: "r6",
    title: "Hours and response times",
    text: "Hi there, support is staffed 07:00 to 19:00 on weekdays. We answer within four hours in those windows and first thing the next morning otherwise.\n\nCheers,\nMila",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const DENSITY: Record<
  AnswerDensity,
  { card: string; cardText: string; composer: string; gap: string }
> = {
  compact: {
    card: "px-2.5 py-1.5",
    cardText: "text-[11.5px] leading-4",
    composer: "min-h-[60px] text-[12px] leading-[1.45]",
    gap: "gap-1",
  },
  cozy: {
    card: "px-3 py-2",
    cardText: "text-[12px] leading-[1.35]",
    composer: "min-h-[72px] text-[13px] leading-[1.45]",
    gap: "gap-1.5",
  },
  roomy: {
    card: "px-3.5 py-2.5",
    cardText: "text-[13px] leading-[1.4]",
    composer: "min-h-[96px] text-[14px] leading-[1.5]",
    gap: "gap-2",
  },
};

/** Friendly on the left, formal on the right. Longer phrases are listed first so they win. */
const PHRASES: [string, string][] = [
  ["thanks for reaching out", "thank you for contacting Fieldline Support"],
  ["Thanks for reaching out", "Thank you for contacting Fieldline Support"],
  ["thanks for your patience", "we appreciate your patience"],
  ["Sorry about that", "We apologise for the disruption"],
  ["sorry about that", "we apologise for the disruption"],
  ["just checking in", "I am following up"],
  ["Could you send me", "Could you please provide"],
  ["Let me know", "Please let us know"],
  ["let me know", "please let us know"],
  ["No worries", "Certainly"],
  ["no worries", "certainly"],
  ["Hi there,", "Dear customer,"],
  ["Cheers,", "Kind regards,"],
  ["haven't", "have not"],
  ["doesn't", "does not"],
  ["there's", "there is"],
  ["won't", "will not"],
  ["I'll", "I will"],
  ["I've", "I have"],
  ["it's", "it is"],
  ["It's", "It is"],
  ["here's", "here is"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Rewrites the phrases the two tones differ on, and a "Hi Name," greeting
 * to "Dear Name,", counting how many it changed.
 */
export const rewriteTone = (
  text: string,
  to: AnswerTone,
): { text: string; changed: number } => {
  let out = text;
  let changed = 0;
  const greet =
    to === "formal" ? /^Hi ([A-Z][\w-]*),/m : /^Dear ([A-Z][\w-]*),/m;
  if (greet.test(out)) {
    out = out.replace(greet, (_, name: string) =>
      to === "formal" ? `Dear ${name},` : `Hi ${name},`,
    );
    changed += 1;
  }
  for (const [friendly, formal] of PHRASES) {
    const from = to === "formal" ? friendly : formal;
    const into = to === "formal" ? formal : friendly;
    const re = new RegExp(escapeRe(from), "g");
    const hits = out.match(re)?.length ?? 0;
    if (hits > 0) {
      out = out.replace(re, into);
      changed += hits;
    }
  }
  return { text: out, changed };
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const defaultFormatTime = (at: number) => {
  const d = new Date(at);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const noopSubscribe = () => () => {};

const preview = (text: string) => text.replace(/\s+/g, " ").trim();

const confidenceWord = (c: number) =>
  c >= 0.8 ? "high" : c >= 0.6 ? "fair" : "low";

/* ----------------------------------------------------------------------- */
/*                              Suggestion card                             */
/* ----------------------------------------------------------------------- */

type CardProps = {
  suggestion: AnswerSuggestion;
  index: number;
  count: number;
  density: AnswerDensity;
  motionSafe: boolean;
  tabIndex: number;
  disabled: boolean;
  nodeRef: (node: HTMLDivElement | null) => void;
  onUse: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function SuggestionCard({
  suggestion,
  index,
  count,
  density,
  motionSafe,
  tabIndex,
  disabled,
  nodeRef,
  onUse,
  onFocus,
  onNav,
}: CardProps) {
  const d = DENSITY[density];
  const pct = Math.round(suggestion.confidence * 100);
  const step = cascade(count);
  return (
    <motion.div
      ref={nodeRef}
      role="option"
      aria-selected={false}
      aria-label={`Suggestion ${index + 1} of ${count}, ${suggestion.tag}, ${confidenceWord(suggestion.confidence)} confidence ${pct} percent. ${preview(suggestion.text)}`}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onUse}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onUse();
          return;
        }
        onNav(event);
      }}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      variants={{
        exit: (usedId: string | null) =>
          usedId === suggestion.id
            ? {
                opacity: 0,
                y: motionSafe ? distances.shift : 0,
                transition: exitFor(durations.base),
              }
            : {
                opacity: 0,
                y: motionSafe ? -distances.nudge : 0,
                scaleY: motionSafe ? 0.92 : 1,
                transition: exitFor(durations.fast),
              },
      }}
      exit="exit"
      transition={{
        y: motionSafe
          ? { ...springs.glide, delay: r3(index * step) }
          : { duration: 0 },
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: motionSafe ? r3(index * step) : 0,
        },
      }}
      whileTap={motionSafe && !disabled ? { scale: 0.985 } : undefined}
      className={cn(
        "group relative flex flex-col gap-1 rounded-3 border border-hairline bg-surface-1 text-left transition-colors",
        d.card,
        disabled
          ? "cursor-not-allowed opacity-70"
          : "cursor-pointer hover:border-hairline-strong hover:bg-surface-2",
        FOCUS_RING,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-ink-2">
          {suggestion.tag}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <span
            aria-hidden
            className="relative h-1 w-9 overflow-hidden rounded-full bg-surface-2"
          >
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background:
                  suggestion.confidence >= 0.8
                    ? "var(--success)"
                    : suggestion.confidence >= 0.6
                      ? "var(--accent-bright)"
                      : "var(--warn)",
              }}
              initial={motionSafe ? { width: 0 } : false}
              animate={{ width: `${pct}%` }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: r3(index * step + 0.1) }
                  : { duration: 0 }
              }
            />
          </span>
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            {pct}%
          </span>
        </span>
      </div>
      <p className={cn("line-clamp-2 text-ink", d.cardText)}>
        {preview(suggestion.text)}
      </p>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Tone switch                               */
/* ----------------------------------------------------------------------- */

function ToneSwitch({
  tone,
  motionSafe,
  disabled,
  onChange,
}: {
  tone: AnswerTone;
  motionSafe: boolean;
  disabled: boolean;
  onChange: (tone: AnswerTone) => void;
}) {
  const formal = tone === "formal";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={formal}
      aria-label="Formal tone"
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onChange(formal ? "friendly" : "formal");
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "ArrowLeft" || event.key === "Home") {
          event.preventDefault();
          onChange("friendly");
        } else if (event.key === "ArrowRight" || event.key === "End") {
          event.preventDefault();
          onChange("formal");
        }
      }}
      className={cn(
        "relative grid h-6 shrink-0 grid-cols-2 items-center rounded-full border border-hairline bg-surface-1 p-0.5 font-mono text-[10px] tracking-[0.06em] uppercase",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_18%,transparent)] ring-1 ring-hairline-strong"
        initial={false}
        animate={{ left: formal ? "50%" : "2px" }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
      <span
        className={cn(
          "relative z-10 px-2 transition-colors duration-150",
          formal ? "text-ink-3" : "text-foreground",
        )}
      >
        Friendly
      </span>
      <span
        className={cn(
          "relative z-10 px-2 transition-colors duration-150",
          formal ? "text-foreground" : "text-ink-3",
        )}
      >
        Formal
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Typing = { tokens: string[]; shown: number; id: string };

/**
 * A quick-reply slip for a support inbox. The customer's thread sits at the
 * top; under it a slip of suggested replies, each a card with a reason and
 * its confidence, and a composer with a tone switch. Pressing a card folds
 * the others away on the exit ease and places the reply in the composer,
 * where it types in word by word on a quick cascade (or cross-fades in with
 * `typing="fade"`). Flipping the tone rewrites the phrases the two tones
 * differ on — greeting, apology, sign-off, contractions — and the text
 * cross-fades from one to the other. Send stamps the reply into the thread
 * on `springs.recoil`, a landing, and after a beat the slip reloads with a
 * fresh set. Snooze and Escalate slide the ticket out on the exit ease and
 * leave an Undo that glides it back. A Saved drawer glides in on
 * `springs.glide` with a search field over the saved replies.
 *
 * The cards are a listbox (Up/Down, Home/End, Enter or Space uses), the
 * composer is a textarea where Ctrl or Cmd+Enter sends, the tone is a switch
 * (Space flips, Left/Right set it) and Escape closes the drawer. Under
 * reduced motion the reply appears at once, nothing slides and the thread,
 * the slip and the drawer cross-fade; every change is still announced.
 */
export function AnswerSlip({
  typing = "type",
  density = "cozy",
  ticket = defaultAnswerTicket,
  suggestions,
  defaultSuggestions = defaultAnswerSuggestions,
  suggestionRounds = defaultAnswerRounds,
  savedReplies = defaultAnswerSavedReplies,
  value,
  defaultValue = "",
  onChange,
  tone,
  defaultTone = "friendly",
  onToneChange,
  onSend,
  onSnooze,
  onEscalate,
  onReopen,
  agent = "Mila",
  status = "ready",
  onRetry,
  reloadDelay = 700,
  formatTime = defaultFormatTime,
  title = "Fieldline Support",
  label,
  height = 560,
  disabled = false,
  className,
}: AnswerSlipProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-list`;
  const composerId = `${uid}-composer`;
  const drawerId = `${uid}-drawer`;
  const hintId = `${uid}-hint`;

  const [ownDraft, setOwnDraft] = React.useState(defaultValue);
  const draft = value ?? ownDraft;
  const [ownTone, setOwnTone] = React.useState<AnswerTone>(defaultTone);
  const currentTone = tone ?? ownTone;
  const [ownSuggestions, setOwnSuggestions] =
    React.useState<AnswerSuggestion[]>(defaultSuggestions);
  const currentSuggestions = suggestions ?? ownSuggestions;

  const [sent, setSent] = React.useState<AnswerMessage[]>([]);
  const [used, setUsed] = React.useState<string | null>(null);
  const [reloading, setReloading] = React.useState(false);
  const [gone, setGone] = React.useState<AnswerAction | null>(null);
  const [drawer, setDrawer] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [typingState, setTypingState] = React.useState<Typing | null>(null);
  const [ghost, setGhost] = React.useState<{
    key: number;
    text: string;
  } | null>(null);
  const [justSent, setJustSent] = React.useState(false);
  const [activeCard, setActiveCard] = React.useState<string | null>(null);
  const [activeSaved, setActiveSaved] = React.useState<string | null>(null);
  const [wide, setWide] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  // False for the server render and hydration, so the thread on the page
  // never stamps in; true for replies sent later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const savedButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const undoRef = React.useRef<HTMLButtonElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  const savedNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const typingTimer = React.useRef<number | null>(null);
  const reloadTimer = React.useRef<number | null>(null);
  const sentTimer = React.useRef<number | null>(null);
  const roundRef = React.useRef(0);
  const ghostSeq = React.useRef(0);
  const typingRun = React.useRef<{ id: string; shown: number } | null>(null);

  const inert = disabled || gone !== null;
  const customer = firstName(ticket.customer.name);
  const thread = [...ticket.messages, ...sent];
  const lastAt = thread[thread.length - 1]?.at ?? ASKED;

  /* ----------------------------- measuring ----------------------------- */

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWide(w >= 640);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  React.useEffect(
    () => () => {
      if (typingTimer.current !== null)
        window.clearInterval(typingTimer.current);
      if (reloadTimer.current !== null)
        window.clearTimeout(reloadTimer.current);
      if (sentTimer.current !== null) window.clearTimeout(sentTimer.current);
    },
    [],
  );

  // The thread keeps its newest message in view.
  const threadLength = thread.length;
  React.useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: motionSafe && live ? "smooth" : "auto",
    });
  }, [threadLength, motionSafe, live]);

  /* ------------------------------- draft ------------------------------- */

  const setDraft = (next: string, change: AnswerDraftChange) => {
    if (next === draft && change.source === "typed") return;
    if (value === undefined) setOwnDraft(next);
    onChange?.(next, change);
  };

  const stopTyping = () => {
    if (typingTimer.current !== null) window.clearInterval(typingTimer.current);
    typingTimer.current = null;
    typingRun.current = null;
    setTypingState(null);
  };

  const fadeComposer = () => {
    const node = textareaRef.current;
    if (!node || !motionSafe) return;
    animate(
      node,
      { opacity: [0, 1] },
      { duration: durations.base, ease: easings.enter },
    );
  };

  /** Places a reply in the composer: typed in word by word, or faded in. */
  const place = (text: string, change: AnswerDraftChange) => {
    stopTyping();
    const previous = draft;
    setDraft(text, change);
    textareaRef.current?.focus({ preventScroll: true });
    if (!motionSafe) return;
    if (typing === "fade") {
      if (previous.trim()) {
        ghostSeq.current += 1;
        setGhost({ key: ghostSeq.current, text: previous });
      }
      fadeComposer();
      return;
    }
    const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
    const words = tokens.filter((t) => !/^\s+$/.test(t)).length;
    const id = change.id ?? "draft";
    const run = { id, shown: 0 };
    typingRun.current = run;
    setTypingState({ tokens, shown: 0, id });
    const stepMs = Math.round(cascade(words) * 1000);
    typingTimer.current = window.setInterval(() => {
      if (typingRun.current !== run) return;
      // A hidden tab finishes at once: nothing animates where no one looks.
      const hidden = typeof document !== "undefined" && document.hidden;
      run.shown = hidden ? tokens.length : run.shown + 2;
      if (run.shown >= tokens.length) {
        stopTyping();
        return;
      }
      setTypingState({ tokens, shown: run.shown, id });
    }, stepMs);
  };

  const placeSuggestion = (s: AnswerSuggestion, index: number) => {
    if (inert) return;
    const text =
      currentTone === "formal" ? rewriteTone(s.text, "formal").text : s.text;
    setUsed(s.id);
    place(text, { source: "suggestion", id: s.id });
    setAnnouncement(
      `Suggestion ${index + 1}, ${s.tag}, placed in the composer. Edit it or send with Control or Command Enter.`,
    );
  };

  const placeSaved = (r: AnswerSavedReply) => {
    if (inert) return;
    const greeted = r.text.replace(/^Hi there,/, `Hi ${customer},`);
    const text =
      currentTone === "formal" ? rewriteTone(greeted, "formal").text : greeted;
    setDrawer(false);
    setUsed(null);
    place(text, { source: "saved", id: r.id });
    setAnnouncement(`Saved reply ${r.title} placed in the composer.`);
  };

  const changeTone = (next: AnswerTone) => {
    if (inert || next === currentTone) return;
    if (tone === undefined) setOwnTone(next);
    onToneChange?.(next);
    stopTyping();
    const { text, changed } = rewriteTone(draft, next);
    if (changed > 0 && text !== draft) {
      if (motionSafe) {
        ghostSeq.current += 1;
        setGhost({ key: ghostSeq.current, text: draft });
        fadeComposer();
      }
      setDraft(text, { source: "tone", rewritten: changed });
    }
    setAnnouncement(
      `${next === "formal" ? "Formal" : "Friendly"} tone. ${
        changed === 0
          ? "Nothing to rewrite."
          : `${changed} ${changed === 1 ? "phrase" : "phrases"} rewritten.`
      }`,
    );
  };

  /* -------------------------------- send ------------------------------- */

  const reloadSlip = () => {
    setUsed(null);
    setReloading(true);
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(
      () => {
        reloadTimer.current = null;
        setReloading(false);
        if (suggestions === undefined && suggestionRounds.length > 0) {
          const next =
            suggestionRounds[roundRef.current % suggestionRounds.length];
          roundRef.current += 1;
          if (next) setOwnSuggestions(next);
        }
      },
      Math.max(0, reloadDelay),
    );
  };

  const send = () => {
    if (inert) return;
    stopTyping();
    const text = draft.trim();
    if (!text) {
      setAnnouncement("Nothing to send: the composer is empty.");
      return;
    }
    const reply: AnswerMessage = {
      id: `${uid}-sent-${sent.length + 1}`,
      from: "agent",
      at: lastAt + 4 * MIN,
      text,
    };
    const nextTicket: AnswerTicket = {
      ...ticket,
      messages: [...thread, reply],
    };
    setSent((list) => [...list, reply]);
    setDraft("", { source: "sent" });
    setGhost(null);
    onSend?.(reply, nextTicket);
    setJustSent(true);
    if (sentTimer.current !== null) window.clearTimeout(sentTimer.current);
    sentTimer.current = window.setTimeout(() => {
      sentTimer.current = null;
      setJustSent(false);
    }, 1200);
    reloadSlip();
    setAnnouncement(
      `Reply sent to ${customer}. ${reloadDelay > 0 ? "Loading fresh suggestions." : ""}`.trim(),
    );
    textareaRef.current?.focus({ preventScroll: true });
  };

  const leave = (action: AnswerAction) => {
    if (inert) return;
    stopTyping();
    setDrawer(false);
    setGone(action);
    if (action === "snoozed") onSnooze?.(ticket);
    else onEscalate?.(ticket);
    setAnnouncement(
      action === "snoozed"
        ? `${ticket.ref} snoozed until tomorrow at 09:00. Undo is available.`
        : `${ticket.ref} escalated to the gateway team. Undo is available.`,
    );
  };

  const reopen = () => {
    const from = gone;
    if (!from) return;
    setGone(null);
    onReopen?.(ticket, from);
    setAnnouncement(`${ticket.ref} is back in your queue.`);
  };

  const retry = () => {
    onRetry?.();
    setAnnouncement("Loading suggestions again.");
  };

  /* ------------------------------- drawer ------------------------------ */

  const openDrawer = () => {
    if (disabled || gone) return;
    setQuery("");
    setDrawer(true);
  };

  const closeDrawer = (returnFocus: boolean) => {
    setDrawer(false);
    if (returnFocus) savedButtonRef.current?.focus({ preventScroll: true });
  };

  React.useEffect(() => {
    if (!drawer) return;
    const id = window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [drawer]);

  React.useEffect(() => {
    if (!gone) return;
    const id = window.requestAnimationFrame(() => {
      undoRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [gone]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? savedReplies.filter(
        (r) =>
          r.title.toLowerCase().includes(q) || r.text.toLowerCase().includes(q),
      )
    : savedReplies;
  const activeSavedId =
    activeSaved && matches.some((r) => r.id === activeSaved)
      ? activeSaved
      : (matches[0]?.id ?? null);

  const onSavedNav = (event: React.KeyboardEvent, id: string) => {
    const i = matches.findIndex((r) => r.id === id);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = matches.length - 1;
    else return;
    event.preventDefault();
    if (to < 0) {
      searchRef.current?.focus();
      return;
    }
    const target = matches[clamp(to, 0, matches.length - 1)];
    if (target) savedNodes.current.get(target.id)?.focus();
  };

  /* ------------------------------ keyboard ----------------------------- */

  const cards = currentSuggestions;
  const activeCardId =
    activeCard && cards.some((c) => c.id === activeCard)
      ? activeCard
      : (cards[0]?.id ?? null);

  const onCardNav = (event: React.KeyboardEvent, id: string) => {
    const i = cards.findIndex((c) => c.id === id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = cards.length - 1;
    else return;
    event.preventDefault();
    const target = cards[clamp(to, 0, cards.length - 1)];
    if (target) cardNodes.current.get(target.id)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const usedIndex = used ? cards.findIndex((c) => c.id === used) : -1;
  const slipLoading = status === "loading" || reloading;
  const shownDraft = typingState
    ? typingState.tokens.slice(0, typingState.shown).join("")
    : draft;
  const canSend = !inert && draft.trim().length > 0;

  const slip = (
    <section
      aria-labelledby={`${uid}-slip`}
      className="flex min-h-0 shrink-0 flex-col gap-1.5 border-t border-hairline px-3 pt-2.5 pb-2 @min-[40rem]:flex-1 @min-[40rem]:border-t-0"
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden className="size-3 text-cobalt-bright" />
        <span id={`${uid}-slip`} className={LABEL}>
          Suggested replies
        </span>
        <span className="ml-auto font-mono text-[10px] text-ink-3 tabular-nums">
          {slipLoading
            ? "loading"
            : status === "error"
              ? "failed"
              : `${cards.length} ready`}
        </span>
      </div>
      <div className="relative max-h-[248px] min-h-0 flex-1 overflow-y-auto overscroll-contain @min-[40rem]:max-h-none">
        <AnimatePresence mode="wait" initial={false}>
          {slipLoading ? (
            <motion.div
              key="skeleton"
              aria-hidden
              className={cn("flex flex-col", d.gap)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "flex flex-col gap-1.5 rounded-3 border border-hairline",
                    d.card,
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                      style={{ width: 64 + ((i * 17) % 30) }}
                    />
                    <span className="h-1 w-9 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                  </span>
                  <span
                    className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                    style={{ width: "92%", animationDelay: `${i * 90}ms` }}
                  />
                  <span
                    className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                    style={{ width: "68%", animationDelay: `${i * 90}ms` }}
                  />
                </span>
              ))}
            </motion.div>
          ) : status === "error" ? (
            <motion.div
              key="error"
              role="group"
              aria-label="Suggestions failed"
              className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-4 py-4 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <TriangleAlert aria-hidden className="size-4 text-danger" />
              <p className="text-[12px] text-foreground">
                The suggestions didn&apos;t load. You can still write a reply.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={retry}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              ) : null}
            </motion.div>
          ) : cards.length === 0 ? (
            <motion.div
              key="empty"
              className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline px-4 py-4 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <Inbox aria-hidden className="size-4 text-ink-3" />
              <p className="text-[12px] text-ink-2">
                No suggestions for this one. Write a reply, or start from a
                saved one.
              </p>
              <button
                type="button"
                onClick={openDrawer}
                aria-disabled={inert || undefined}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <Bookmark aria-hidden className="size-3.5" />
                Saved replies
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="relative"
              initial={false}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              <div
                id={listId}
                role="listbox"
                aria-label="Suggested replies"
                aria-describedby={hintId}
                className={cn("flex flex-col", d.gap)}
              >
                {/* The picked card slides down toward the composer; the
                    others fold away. Both read `used` through `custom`,
                    which reaches a card after it has been removed. */}
                <AnimatePresence initial={live} custom={used}>
                  {used
                    ? null
                    : cards.map((s, i) => (
                        <SuggestionCard
                          key={s.id}
                          suggestion={s}
                          index={i}
                          count={cards.length}
                          density={density}
                          motionSafe={motionSafe}
                          tabIndex={activeCardId === s.id ? 0 : -1}
                          disabled={inert}
                          nodeRef={(node) => {
                            if (node) cardNodes.current.set(s.id, node);
                            else cardNodes.current.delete(s.id);
                          }}
                          onUse={() => placeSuggestion(s, i)}
                          onFocus={() => setActiveCard(s.id)}
                          onNav={(event) => onCardNav(event, s.id)}
                        />
                      ))}
                </AnimatePresence>
              </div>
              <AnimatePresence>
                {used ? (
                  <motion.div
                    key="used"
                    className="flex items-center gap-2 rounded-3 border border-hairline bg-surface-1 px-3 py-2"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            delay: durations.fast,
                            opacity: {
                              duration: durations.base,
                              delay: durations.fast,
                            },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <Check
                      aria-hidden
                      className="size-3.5 shrink-0 text-success"
                    />
                    <span className="min-w-0 truncate text-[12px] text-ink-2">
                      Using suggestion {usedIndex + 1} of {cards.length}
                      {cards[usedIndex]?.tag
                        ? ` · ${cards[usedIndex]?.tag}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUsed(null);
                        setAnnouncement(
                          `${cards.length} suggestions shown again.`,
                        );
                      }}
                      className={cn(
                        "ml-auto shrink-0 rounded-2 px-1.5 py-0.5 text-[11px] text-cobalt-bright transition-colors hover:bg-cobalt-wash",
                        FOCUS_RING,
                      )}
                    >
                      Show all
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );

  const composer = (
    <section
      aria-labelledby={`${uid}-compose`}
      className="flex shrink-0 flex-col gap-1.5 border-t border-hairline px-3 pt-2 pb-2.5"
    >
      <div className="flex items-center gap-2">
        <label
          id={`${uid}-compose`}
          htmlFor={composerId}
          className={cn(LABEL, "min-w-0 truncate")}
        >
          Reply to {customer}
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ToneSwitch
            tone={currentTone}
            motionSafe={motionSafe}
            disabled={inert}
            onChange={changeTone}
          />
        </div>
      </div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          id={composerId}
          value={shownDraft}
          onChange={(event) => {
            if (inert) return;
            if (typingState) stopTyping();
            setDraft(event.target.value, { source: "typed" });
          }}
          onKeyDown={(event) => {
            if (typingState && event.key !== "Tab") stopTyping();
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          readOnly={inert}
          aria-disabled={inert || undefined}
          aria-describedby={hintId}
          placeholder={`Write to ${customer}, or pick a suggestion above`}
          spellCheck={false}
          className={cn(
            "block w-full resize-none rounded-3 border border-hairline bg-surface-0 px-3 py-2 text-foreground placeholder:text-ink-3",
            d.composer,
            inert && "cursor-not-allowed opacity-70",
            FOCUS_RING,
          )}
        />
        <AnimatePresence>
          {ghost ? (
            <motion.div
              key={ghost.key}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden rounded-3 border border-transparent px-3 py-2 break-words whitespace-pre-wrap text-foreground",
                d.composer,
              )}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={exitFor(durations.base)}
              onAnimationComplete={() =>
                setGhost((g) => (g && g.key === ghost.key ? null : g))
              }
            >
              {ghost.text}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => leave("snoozed")}
          aria-disabled={inert || undefined}
          aria-label="Snooze until tomorrow"
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors",
            inert
              ? "cursor-not-allowed"
              : "hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <Clock aria-hidden className="size-3.5" />
          <span className="hidden @min-[22rem]:inline">Snooze</span>
        </button>
        <button
          type="button"
          onClick={() => leave("escalated")}
          aria-disabled={inert || undefined}
          aria-label="Escalate to the gateway team"
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors",
            inert
              ? "cursor-not-allowed"
              : "hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <ArrowUpRight aria-hidden className="size-3.5" />
          <span className="hidden @min-[22rem]:inline">Escalate</span>
        </button>
        <button
          ref={savedButtonRef}
          type="button"
          onClick={() => (drawer ? closeDrawer(false) : openDrawer())}
          aria-expanded={drawer}
          aria-controls={drawer ? drawerId : undefined}
          aria-disabled={inert || undefined}
          aria-label="Saved replies"
          className={cn(
            "ml-auto inline-flex h-7 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors",
            inert
              ? "cursor-not-allowed"
              : "hover:bg-surface-2 hover:text-foreground",
            drawer && "bg-surface-2 text-foreground",
            FOCUS_RING,
          )}
        >
          <Bookmark aria-hidden className="size-3.5" />
          <span className="hidden @min-[22rem]:inline">Saved</span>
        </button>
        <motion.button
          type="button"
          onClick={send}
          aria-disabled={!canSend || undefined}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          whileTap={motionSafe && canSend ? { scale: 0.96 } : undefined}
          transition={springs.flick}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-2 px-2.5 text-[12px] font-medium transition-colors",
            canSend
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "cursor-default bg-surface-2 text-ink-3",
            FOCUS_RING,
          )}
        >
          <span className="relative flex size-3.5 items-center justify-center">
            <AnimatePresence initial={false} mode="wait">
              {justSent ? (
                <motion.span
                  key="tick"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={
                    motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
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
              ) : (
                <motion.span
                  key="send"
                  className="absolute inset-0 flex items-center justify-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                >
                  <Send aria-hidden className="size-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          {justSent ? "Sent" : "Send"}
        </motion.button>
      </div>
    </section>
  );

  const threadView = (
    <div
      ref={threadRef}
      role="log"
      aria-label={`Thread with ${ticket.customer.name}`}
      className="flex min-h-[88px] flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-2.5 @min-[40rem]:min-h-0"
    >
      <p className={cn(LABEL, "truncate @min-[40rem]:hidden")}>
        {ticket.subject}
      </p>
      <AnimatePresence initial={false}>
        {thread.map((m) => {
          const mine = m.from === "agent";
          return (
            <motion.div
              key={m.id}
              layout={motionSafe ? "position" : false}
              initial={
                live
                  ? {
                      opacity: 0,
                      scale: motionSafe ? 0.9 : 1,
                      y: motionSafe ? distances.step : 0,
                    }
                  : false
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                layout: springs.glide,
                scale: motionSafe ? springs.recoil : { duration: 0 },
                y: motionSafe ? springs.recoil : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              style={{ originX: mine ? 1 : 0, originY: 1 }}
              className={cn(
                "flex max-w-[88%] flex-col gap-0.5",
                mine ? "items-end self-end" : "items-start self-start",
              )}
            >
              <span className={cn(LABEL, "px-1")}>
                {mine ? agent : customer} · {formatTime(m.at)}
              </span>
              <p
                className={cn(
                  "rounded-3 px-3 py-2 text-[12.5px] leading-[1.4] break-words whitespace-pre-wrap",
                  mine
                    ? "rounded-br-1 bg-cobalt-wash text-foreground"
                    : "rounded-bl-1 bg-surface-2 text-ink",
                )}
              >
                {m.text}
              </p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  const goneView = (
    <motion.div
      key={`gone-${gone ?? ""}`}
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: motionSafe ? -distances.nudge : 0,
        transition: exitFor(durations.fast),
      }}
      transition={
        motionSafe
          ? { ...springs.snap, opacity: { duration: durations.base } }
          : { duration: durations.base }
      }
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-2">
        {gone === "snoozed" ? (
          <Clock aria-hidden className="size-4 text-ink-2" />
        ) : (
          <ArrowUpRight aria-hidden className="size-4 text-ink-2" />
        )}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          {gone === "snoozed"
            ? "Snoozed until tomorrow, 09:00"
            : "Escalated to the gateway team"}
        </p>
        <p className="text-[12px] text-ink-2">
          {ticket.ref} · {ticket.subject}
        </p>
      </div>
      <button
        ref={undoRef}
        type="button"
        onClick={reopen}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        <Undo2 aria-hidden className="size-3.5" />
        Undo
      </button>
    </motion.div>
  );

  return (
    <div
      ref={rootRef}
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
        Up and Down move between suggestions, Enter places one in the composer.
        Control or Command Enter sends.
      </p>

      <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <p id={titleId} className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold">{title}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
              {ticket.ref}
            </span>
          </p>
          <p className="min-w-0 truncate text-[11px] text-ink-2">
            {ticket.customer.name}
            {ticket.customer.org ? (
              <span className="hidden @min-[24rem]:inline">
                {" "}
                · {ticket.customer.org}
              </span>
            ) : null}
            <span className="hidden @min-[40rem]:inline">
              {" "}
              · {ticket.subject}
            </span>
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] uppercase",
            gone
              ? "border-hairline text-ink-3"
              : "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-warn",
          )}
        >
          {gone === "snoozed"
            ? "Snoozed"
            : gone === "escalated"
              ? "Escalated"
              : "Open"}
        </span>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {gone ? (
          goneView
        ) : (
          <motion.div
            key="body"
            className="flex min-h-0 flex-1 flex-col @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
            initial={{ opacity: 0, x: motionSafe ? -distances.step : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{
              opacity: 0,
              x: motionSafe ? -distances.shift : 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.base }
            }
          >
            <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:border-r @min-[40rem]:border-hairline">
              {threadView}
            </div>
            <div className="flex min-h-0 flex-col @min-[40rem]:min-h-0">
              {slip}
              {composer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {drawer ? (
          <motion.div
            key="scrim"
            aria-hidden
            className="absolute inset-0 z-10 bg-[color-mix(in_oklab,var(--bg-0)_55%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base }}
            onPointerDown={() => closeDrawer(true)}
          />
        ) : null}
        {drawer ? (
          <motion.div
            key="drawer"
            id={drawerId}
            role="dialog"
            aria-modal={false}
            aria-label="Saved replies"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeDrawer(true);
              }
            }}
            initial={
              motionSafe
                ? wide
                  ? { x: distances.shift, opacity: 0 }
                  : { y: distances.shift, opacity: 0 }
                : { opacity: 0 }
            }
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{
              opacity: 0,
              ...(motionSafe
                ? wide
                  ? { x: distances.step }
                  : { y: distances.step }
                : {}),
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.base }
            }
            className="absolute inset-x-0 bottom-0 z-20 flex max-h-[78%] flex-col rounded-t-4 border-t border-hairline-strong bg-popover shadow-[0_-14px_34px_-18px_color-mix(in_oklab,black_45%,transparent)] @min-[40rem]:inset-y-0 @min-[40rem]:right-0 @min-[40rem]:left-auto @min-[40rem]:max-h-none @min-[40rem]:w-[320px] @min-[40rem]:rounded-t-none @min-[40rem]:rounded-l-4 @min-[40rem]:border-t-0 @min-[40rem]:border-l"
          >
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <Bookmark aria-hidden className="size-3.5 text-ink-2" />
              <span className="text-[13px] font-semibold">Saved replies</span>
              <button
                type="button"
                onClick={() => closeDrawer(true)}
                aria-label="Close saved replies"
                className={cn(
                  "ml-auto inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
            <div className="relative px-3 pb-2">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-5 size-3.5 -translate-y-1/2 text-ink-3"
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && activeSavedId) {
                    event.preventDefault();
                    savedNodes.current.get(activeSavedId)?.focus();
                  } else if (event.key === "Enter") {
                    const first = matches[0];
                    if (first) {
                      event.preventDefault();
                      placeSaved(first);
                    }
                  }
                }}
                placeholder="Search saved replies"
                aria-label="Search saved replies"
                aria-controls={`${uid}-saved`}
                className={cn(
                  "h-8 w-full rounded-2 border border-hairline bg-surface-0 pr-2 pl-7 text-[12px] text-foreground placeholder:text-ink-3",
                  FOCUS_RING,
                )}
              />
            </div>
            <p className={cn(LABEL, "px-3 pb-1")} aria-live="polite">
              {matches.length} {matches.length === 1 ? "reply" : "replies"}
              {q ? ` match "${query.trim()}"` : ""}
            </p>
            <div
              id={`${uid}-saved`}
              role="listbox"
              aria-label="Saved replies"
              className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-2"
            >
              {matches.length === 0 ? (
                <p className="px-2 py-4 text-center text-[12px] text-ink-3">
                  Nothing saved matches that.
                </p>
              ) : (
                matches.map((r, i) => (
                  <motion.button
                    key={r.id}
                    ref={(node) => {
                      if (node) savedNodes.current.set(r.id, node);
                      else savedNodes.current.delete(r.id);
                    }}
                    type="button"
                    role="option"
                    aria-selected={false}
                    tabIndex={activeSavedId === r.id ? 0 : -1}
                    onFocus={() => setActiveSaved(r.id)}
                    onClick={() => placeSaved(r)}
                    onKeyDown={(event) => onSavedNav(event, r.id)}
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      y: motionSafe
                        ? {
                            ...springs.glide,
                            delay: r3(Math.min(i, 8) * cascade(matches.length)),
                          }
                        : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: motionSafe
                          ? r3(Math.min(i, 8) * cascade(matches.length))
                          : 0,
                      },
                    }}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {r.title}
                    </span>
                    <span className="line-clamp-1 text-[11px] text-ink-3">
                      {preview(r.text)}
                    </span>
                  </motion.button>
                ))
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
