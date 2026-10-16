"use client";

import * as React from "react";

import { AnimatePresence, motion, useInView } from "motion/react";
import {
  EyeOff,
  Hourglass,
  Lock,
  MonitorUp,
  MousePointer2,
  Square,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type CobrowseAgent = {
  name: string;
  /** Where they work, e.g. "Basinworks support". */
  team: string;
  initials: string;
};

export type CobrowseField = {
  id: string;
  label: string;
  value: string;
  /** Spans both columns on wide layouts. */
  wide?: boolean;
};

export type CobrowseState =
  "request" | "sharing" | "declined" | "expired" | "ended";
export type CobrowseFrameColor = "cobalt" | "jade" | "amber" | "rose";
export type CobrowseMaskStyle = "stripes" | "frost" | "redact";
export type CobrowseDensity = "compact" | "cozy" | "roomy";

export type CobrowseConsentProps = {
  /** The colour of the frame, the live dot and the sweep's edge: cobalt, jade, amber or rose. @default "cobalt" */
  frameColor?: CobrowseFrameColor;
  /** How a private field is covered: a diagonal hatch, a frosted pane, or a solid redaction bar. @default "stripes" */
  maskStyle?: CobrowseMaskStyle;
  /** Field rows, type and gaps. @default "cozy" */
  density?: CobrowseDensity;
  /** Who is asking. @default { name: "Ines Varga", team: "Basinworks support", initials: "IV" } */
  agent?: CobrowseAgent;
  /** The page's fields, as the customer sees them. @default defaultCobrowseFields */
  fields?: CobrowseField[];
  /** Ids of the fields hidden from the agent while sharing. @default ["card", "bank", "tax"] */
  maskedFields?: string[];
  /** The page's title. @default "Billing" */
  pageTitle?: string;
  /** The product the page belongs to. @default "Basinworks" */
  product?: string;
  /** Controlled state. */
  state?: CobrowseState;
  /** Initial state when uncontrolled. @default "request" */
  defaultState?: CobrowseState;
  /** Fires from the choice, the stop or the expiry that changed the state. */
  onStateChange?: (state: CobrowseState) => void;
  /** Allow viewing was pressed. */
  onAccept?: () => void;
  /** Not now was pressed. */
  onDecline?: () => void;
  /** Sharing stopped (button or Escape), with how long it ran. */
  onStop?: (info: { seconds: number }) => void;
  /** The request lapsed without an answer. */
  onExpire?: () => void;
  /** The moment the page first renders, ms; its timers count on from it. @default defaultCobrowseNow */
  now?: number;
  /** When the agent asked, ms. @default 18 s before now */
  requestedAt?: number;
  /** Seconds a request stays open. @default 120 */
  expiresIn?: number;
  /** Where the agent's pointer is while sharing, as 0–1 fractions of the page; null hides it. @default null */
  pointer?: { x: number; y: number } | null;
  /** How long the stripe takes to sweep one field, ms. @default 420 */
  sweep?: number;
  /** Height of the surface, px; the page scrolls inside its frame. @default 540 */
  height?: number;
  /** The choices can't be made. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Thursday 15 October 2026, 15:12:30 UTC. */
export const defaultCobrowseNow = Date.UTC(2026, 9, 15, 15, 12, 30);

const DEFAULT_AGENT: CobrowseAgent = {
  name: "Ines Varga",
  team: "Basinworks support",
  initials: "IV",
};
const DEFAULT_MASKED = ["card", "bank", "tax"];

export const defaultCobrowseFields: CobrowseField[] = [
  { id: "company", label: "Company", value: "Coldbrook Studio" },
  { id: "plan", label: "Plan", value: "Team, 14 seats, yearly" },
  { id: "email", label: "Billing email", value: "accounts@coldbrook.studio" },
  { id: "card", label: "Card", value: "Ending 4417, expires 08/28" },
  {
    id: "bank",
    label: "Bank account",
    value: "Coldbrook Bank 60-11-22 33445566",
  },
  { id: "tax", label: "Tax ID", value: "GB 284 1193 07" },
  {
    id: "address",
    label: "Billing address",
    value: "14 Mill Lane, Fernhurst FH2 7QA",
    wide: true,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FRAME: Record<CobrowseFrameColor, string> = {
  cobalt: "var(--accent-bright)",
  jade: "var(--success)",
  amber: "var(--warn)",
  rose: "var(--danger)",
};

type Geometry = { pad: string; gap: string; field: string; text: string };
const DENSITY: Record<CobrowseDensity, Geometry> = {
  compact: { pad: "p-4", gap: "gap-2.5", field: "h-8", text: "text-[12.5px]" },
  cozy: { pad: "p-5", gap: "gap-3", field: "h-9", text: "text-[13px]" },
  roomy: { pad: "p-6", gap: "gap-4", field: "h-10", text: "text-[14px]" },
};

const mmss = (s: number) => {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};
const length = (s: number) => {
  const v = Math.max(0, Math.round(s));
  if (v < 60) return `${v} s`;
  const m = Math.floor(v / 60);
  const r = v % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
};
const first = (name: string) => name.split(/\s+/)[0] ?? name;
const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,color,opacity]";

/* ----------------------------------------------------------------------- */
/*                                  Parts                                   */
/* ----------------------------------------------------------------------- */

/**
 * The frame, drawn edge by edge clockwise from the top-left corner: each edge
 * is a scale tween on the move ease, a beat after the last, so the colour
 * travels round the page once. Its thickness is a variable that thins at
 * narrow widths.
 */
function Frame({ on, motionSafe }: { on: boolean; motionSafe: boolean }) {
  const edge = (i: number) =>
    motionSafe
      ? { duration: 0.14, ease: easings.move, delay: on ? i * 0.11 : 0 }
      : { duration: durations.fast };
  const leave = { duration: durations.base * 0.6, ease: easings.exit };
  const edges = [
    { cls: "inset-x-0 top-0 h-[var(--cb-w)]", axis: "x", origin: [0, 0.5] },
    { cls: "inset-y-0 right-0 w-[var(--cb-w)]", axis: "y", origin: [0.5, 0] },
    { cls: "inset-x-0 bottom-0 h-[var(--cb-w)]", axis: "x", origin: [1, 0.5] },
    { cls: "inset-y-0 left-0 w-[var(--cb-w)]", axis: "y", origin: [0.5, 1] },
  ] as const;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 [--cb-w:2px] @min-[36rem]/cobrowse-consent:[--cb-w:4px]"
    >
      <motion.span
        className="absolute inset-0 shadow-[inset_0_0_24px_color-mix(in_oklab,var(--cb-ink)_22%,transparent)]"
        initial={false}
        animate={{ opacity: on ? 1 : 0 }}
        transition={
          on ? { duration: durations.slow, delay: motionSafe ? 0.3 : 0 } : leave
        }
      />
      {edges.map((e, i) => (
        <motion.span
          key={i}
          className={cn("absolute bg-[var(--cb-ink)]", e.cls)}
          style={{ originX: e.origin[0], originY: e.origin[1] }}
          initial={false}
          animate={
            motionSafe
              ? e.axis === "x"
                ? { scaleX: on ? 1 : 0, opacity: on ? 1 : 0 }
                : { scaleY: on ? 1 : 0, opacity: on ? 1 : 0 }
              : { opacity: on ? 1 : 0 }
          }
          transition={on ? edge(i) : leave}
        />
      ))}
    </div>
  );
}

/** The cover on a private field, swept on left to right behind a bright edge. */
function Mask({
  on,
  style,
  delay,
  sweep,
  motionSafe,
  agent,
}: {
  on: boolean;
  style: CobrowseMaskStyle;
  delay: number;
  sweep: number;
  motionSafe: boolean;
  agent: string;
}) {
  const seconds = Math.max(0.12, sweep / 1000);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <motion.span
        className={cn(
          "absolute inset-0 flex items-center justify-end gap-1.5 px-2.5 font-mono text-[10px] tracking-[0.06em] uppercase",
          style === "stripes" &&
            "bg-surface-2 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--ink-3)_30%,transparent)_0_5px,transparent_5px_10px)] text-ink-2",
          style === "frost" &&
            "bg-[color-mix(in_oklab,var(--card)_60%,transparent)] text-ink-2 backdrop-blur-[7px]",
          style === "redact" && "bg-foreground text-background",
        )}
        initial={false}
        // On, the cover opens from the left edge; off, it is wiped away to
        // the right, so it always travels the way the stripe does.
        animate={
          motionSafe
            ? on
              ? {
                  clipPath: ["inset(0% 100% 0% 0%)", "inset(0% 0% 0% 0%)"],
                  opacity: 1,
                }
              : {
                  clipPath: ["inset(0% 0% 0% 0%)", "inset(0% 0% 0% 100%)"],
                  opacity: 0,
                }
            : { clipPath: "inset(0% 0% 0% 0%)", opacity: on ? 1 : 0 }
        }
        transition={
          on
            ? motionSafe
              ? {
                  clipPath: { duration: seconds, ease: easings.move, delay },
                  opacity: { duration: 0.01, delay },
                }
              : { duration: durations.fast }
            : motionSafe
              ? {
                  clipPath: { duration: durations.base, ease: easings.exit },
                  opacity: { duration: 0.01, delay: durations.base },
                }
              : { duration: durations.fast }
        }
      >
        <motion.span
          className="flex items-center gap-1.5"
          initial={false}
          animate={{ opacity: on ? 1 : 0 }}
          transition={
            on
              ? {
                  duration: durations.base,
                  delay: motionSafe ? delay + seconds * 0.7 : 0,
                }
              : { duration: 0.05 }
          }
        >
          <Lock className="size-3" />
          <span className="hidden @min-[20rem]/cobrowse-consent:inline">
            Hidden from {agent}
          </span>
        </motion.span>
      </motion.span>
      {motionSafe ? (
        <motion.span
          className="absolute inset-y-0 left-0 w-0.5 bg-[var(--cb-ink)] shadow-[0_0_10px_var(--cb-ink)]"
          initial={false}
          animate={
            on ? { left: ["0%", "100%"], opacity: [1, 1, 0] } : { opacity: 0 }
          }
          transition={
            on
              ? {
                  left: { duration: seconds, ease: easings.move, delay },
                  opacity: { duration: seconds, delay, times: [0, 0.85, 1] },
                }
              : { duration: 0.05 }
          }
        />
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

/**
 * A screen-sharing request on the customer's own page. A card asks whether a
 * named agent may view the page, says what they will and won't see, lists the
 * fields that stay hidden and counts down to expiry. Allowing it plays three
 * beats: the card becomes a slim bar at the top of the page (one shared
 * layout on `springs.glide`), a coloured frame draws round the page edge by
 * edge, and a stripe sweeps across every private field in `cascade()` order,
 * leaving its mask behind. The bar keeps a live dot (breathing only while
 * sharing, in view and in a visible tab), the time shared and Stop sharing;
 * the agent's pointer, when the host passes one, glides on `springs.drift`.
 *
 * Stop sharing, or Escape anywhere inside, lifts the masks, fades the frame on
 * the exit ease and leaves a receipt. Every choice is a labelled button; a
 * request left unanswered expires and explains why. At narrow widths the
 * frame thins from 4px to 2px. Under reduced motion the frame and the masks
 * fade in place; the masks still cover every private field.
 */
export function CobrowseConsent({
  frameColor = "cobalt",
  maskStyle = "stripes",
  density = "cozy",
  agent = DEFAULT_AGENT,
  fields = defaultCobrowseFields,
  maskedFields = DEFAULT_MASKED,
  pageTitle = "Billing",
  product = "Basinworks",
  state: stateProp,
  defaultState = "request",
  onStateChange,
  onAccept,
  onDecline,
  onStop,
  onExpire,
  now = defaultCobrowseNow,
  requestedAt = now - 18_000,
  expiresIn = 120,
  pointer = null,
  sweep = 420,
  height = 540,
  disabled = false,
  className,
}: CobrowseConsentProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const geo = DENSITY[density] ?? DENSITY.cozy;
  const name = first(agent.name);

  const [own, setOwn] = React.useState<CobrowseState>(defaultState);
  const state = stateProp ?? own;
  const [dismissed, setDismissed] = React.useState(false);
  const [receipt, setReceipt] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  /* ------------------------------- timing ------------------------------- */

  // A virtual clock: `now` plus the time the page has been open, advanced
  // only by the ticks below, so the server and the first client render agree.
  const opened = React.useRef<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    if (opened.current === null) opened.current = performance.now();
    const sync = () => setVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  const virtual = now + elapsed;
  const readNow = () =>
    now +
    (opened.current === null
      ? 0
      : Math.round(performance.now() - opened.current));

  const expiresAt = requestedAt + expiresIn * 1000;
  const left = Math.max(0, Math.ceil((expiresAt - virtual) / 1000));
  const [sharedAt, setSharedAt] = React.useState(virtual);

  const setState = React.useCallback(
    (next: CobrowseState) => {
      if (stateProp === undefined) setOwn(next);
      onStateChange?.(next);
    },
    [onStateChange, stateProp],
  );

  const live = React.useRef({ state, expiresAt, setState, onExpire });
  React.useEffect(() => {
    live.current = { state, expiresAt, setState, onExpire };
  });

  const readNowRef = React.useRef(readNow);
  React.useEffect(() => {
    readNowRef.current = readNow;
  });

  // One tick a second, only while a request waits or sharing runs, and only
  // while the tab is shown. The tick that passes the expiry turns the request.
  React.useEffect(() => {
    if (!(state === "request" || state === "sharing") || !visible) return;
    const t = window.setInterval(() => {
      const at = readNowRef.current();
      setElapsed(at - now);
      const l = live.current;
      if (l.state === "request" && at >= l.expiresAt) {
        l.state = "expired";
        l.setState("expired");
        l.onExpire?.();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [state, visible, now]);

  // Whatever turned the state — a press here or the host — the page follows
  // and says so once.
  const [seen, setSeen] = React.useState(state);
  if (seen !== state) {
    setSeen(state);
    setDismissed(false);
    if (state === "sharing") {
      setSharedAt(virtual);
      setReceipt(null);
      setAnnouncement(
        `${name} can now see this page. ${maskedFields.length} private ${maskedFields.length === 1 ? "field is" : "fields are"} hidden. Press Escape to stop sharing.`,
      );
    } else if (state === "ended") {
      setAnnouncement(`Sharing stopped. ${name} can no longer see this page.`);
    } else if (state === "declined") {
      setAnnouncement(`You said no. ${name} can't see your screen.`);
    } else if (state === "expired") {
      setAnnouncement(`${name}'s request expired.`);
    } else if (state === "request") {
      setAnnouncement(
        `${agent.name} from ${agent.team} wants to view this page.`,
      );
    }
  }

  /* ------------------------------ choices ------------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const focusInside = () => {
    const a = document.activeElement;
    return !a || a === document.body || (rootRef.current?.contains(a) ?? false);
  };
  const wantStop = React.useRef(false);
  const [stopNode, setStopNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  React.useEffect(() => {
    if (!stopNode || !wantStop.current || !stopNode.isConnected) return;
    wantStop.current = false;
    stopNode.focus({ preventScroll: true });
  }, [stopNode]);
  const wantNote = React.useRef(false);
  const [noteNode, setNoteNode] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!noteNode || !wantNote.current || !noteNode.isConnected) return;
    wantNote.current = false;
    noteNode.focus({ preventScroll: true });
  }, [noteNode]);

  const accept = () => {
    if (disabled || state !== "request") return;
    wantStop.current = focusInside();
    // Bring the clock up to the press, so the shared time starts at zero.
    setElapsed(readNow() - now);
    setState("sharing");
    onAccept?.();
  };
  const decline = () => {
    if (disabled || state !== "request") return;
    wantNote.current = focusInside();
    setState("declined");
    onDecline?.();
  };
  const stop = () => {
    if (state !== "sharing") return;
    const seconds = Math.max(0, Math.round((readNow() - sharedAt) / 1000));
    setReceipt(seconds);
    wantNote.current = focusInside();
    setState("ended");
    onStop?.({ seconds });
  };

  /* ------------------------------- layout ------------------------------- */

  const sharing = state === "sharing";
  const breathing = sharing && motionSafe && visible;
  const inViewRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(inViewRef, { amount: 0.2 });
  const masked = new Set(maskedFields);
  const maskedLabels = fields
    .filter((f) => masked.has(f.id))
    .map((f) => f.label);
  let maskIndex = 0;
  const maskCount = maskedLabels.length;
  const frameLead = motionSafe ? 0.5 : 0;
  const sharedFor = Math.max(0, Math.round((virtual - sharedAt) / 1000));
  const style = {
    "--cb-ink": FRAME[frameColor] ?? FRAME.cobalt,
  } as React.CSSProperties;
  const layoutId = motionSafe ? `${uid}-ask` : undefined;

  const avatar = (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--cb-ink)_16%,var(--card))] text-[12px] font-semibold text-foreground @max-[24rem]/cobrowse-consent:hidden"
    >
      {agent.initials}
    </span>
  );

  const requestCard = (
    <motion.div
      key="ask"
      layoutId={layoutId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${uid}-ask-title`}
      aria-describedby={`${uid}-ask-desc`}
      className="relative mb-4 flex flex-col gap-3 overflow-hidden rounded-3 border border-[color-mix(in_oklab,var(--cb-ink)_40%,transparent)] bg-card p-3.5 shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--foreground)_30%,transparent)]"
      initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              layout: springs.glide,
              y: springs.glide,
              opacity: { duration: durations.base },
            }
          : { duration: durations.fast }
      }
    >
      <div className="flex items-start gap-3">
        {avatar}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <h3
              id={`${uid}-ask-title`}
              className="min-w-0 flex-1 basis-48 text-[13.5px] leading-5 font-semibold text-foreground"
            >
              {agent.name} from {agent.team} wants to view this page
            </h3>
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 font-mono text-[10.5px] text-ink-2 tabular-nums">
              <Hourglass aria-hidden className="size-3" />
              <span className="sr-only">Expires in </span>
              {mmss(left)}
            </span>
          </div>
          <p
            id={`${uid}-ask-desc`}
            className={cn("leading-[1.45] text-ink-2", geo.text)}
          >
            {`${name} sees this page as you do, and can’t click, type or see other tabs.`}
            {maskCount ? ` ${list(maskedLabels)} stay hidden.` : ""}
          </p>
          {maskCount ? (
            <ul
              aria-label="Hidden while sharing"
              className="flex flex-wrap gap-1 pt-0.5"
            >
              {maskedLabels.map((label) => (
                <li
                  key={label}
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-hairline px-2 text-[11px] text-ink-2"
                >
                  <EyeOff aria-hidden className="size-3" />
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12 @max-[24rem]/cobrowse-consent:pl-0">
        <button
          type="button"
          onClick={accept}
          aria-disabled={disabled || undefined}
          className={cn(
            BUTTON,
            FOCUS,
            "h-9 bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_88%,var(--foreground))] @max-[24rem]/cobrowse-consent:flex-1",
          )}
        >
          <MonitorUp aria-hidden className="size-3.5" />
          Allow viewing
        </button>
        <button
          type="button"
          onClick={decline}
          aria-disabled={disabled || undefined}
          className={cn(
            BUTTON,
            FOCUS,
            "h-9 border border-input bg-surface-1 text-foreground hover:bg-surface-2 @max-[24rem]/cobrowse-consent:flex-1",
          )}
        >
          Not now
        </button>
      </div>
    </motion.div>
  );

  const note = (() => {
    if (dismissed) return null;
    if (state === "declined" || state === "expired" || state === "ended") {
      const text =
        state === "declined"
          ? {
              title: `You said no to ${name}`,
              body: `${name} can't see your screen. If you change your mind, ask for a new request.`,
            }
          : state === "expired"
            ? {
                title: "This request expired",
                body: `Requests last ${length(expiresIn)}, so nobody views your screen later than you meant. Ask ${name} to send a new one.`,
              }
            : {
                title: `Sharing ended${receipt !== null ? `, ${length(receipt)} with ${name}` : ""}`,
                body: `${name} can no longer see this page. Nothing was saved from your private fields.`,
              };
      return (
        <motion.div
          key={`note-${state}`}
          className="mb-4 flex items-start gap-3 rounded-3 border border-hairline bg-surface-1 px-3.5 py-3"
          initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { y: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          <span
            aria-hidden
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"
          >
            {state === "expired" ? (
              <Hourglass className="size-3.5" />
            ) : state === "ended" ? (
              <Square className="size-3" />
            ) : (
              <EyeOff className="size-3.5" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3
              ref={setNoteNode}
              tabIndex={-1}
              className="text-[13px] leading-5 font-semibold text-foreground outline-none"
            >
              {text.title}
            </h3>
            <p className={cn("leading-[1.45] text-ink-2", geo.text)}>
              {text.body}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </motion.div>
      );
    }
    return null;
  })();

  return (
    <section
      ref={rootRef}
      aria-label={`${product} ${pageTitle}`}
      onKeyDown={(event) => {
        // Escape stops sharing wherever focus is inside; it is spent here,
        // so nothing around the page reads it too.
        if (event.key === "Escape" && sharing) {
          event.preventDefault();
          stop();
        }
      }}
      className={cn(
        "@container/cobrowse-consent relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={{ ...style, height }}
    >
      {/* The product's own top bar: a drawn mark, the product and where you are. */}
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-hairline bg-card px-4">
        <svg aria-hidden viewBox="0 0 20 20" className="size-5 shrink-0">
          <rect
            x={1}
            y={1}
            width={18}
            height={18}
            rx={5}
            className="fill-foreground"
          />
          <path
            d="M5.5 12.5 C 8 7.5, 12 7.5, 14.5 12.5"
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            className="stroke-background"
          />
        </svg>
        <span className="text-[13px] font-semibold">{product}</span>
        <span aria-hidden className="text-ink-3">
          /
        </span>
        <span className="hidden truncate text-[12.5px] text-ink-2 @min-[20rem]/cobrowse-consent:inline">
          Settings
        </span>
        <span
          aria-hidden
          className="hidden text-ink-3 @min-[20rem]/cobrowse-consent:inline"
        >
          /
        </span>
        <span className="truncate text-[12.5px] text-foreground">
          {pageTitle}
        </span>
      </div>

      <div ref={inViewRef} className="relative flex-1 overflow-hidden">
        <Frame on={sharing} motionSafe={motionSafe} />

        {/* The bar: what the request card becomes. */}
        <AnimatePresence>
          {sharing ? (
            <motion.div
              key="bar"
              layoutId={layoutId}
              role="region"
              aria-label="Screen sharing"
              className="absolute inset-x-2 top-2 z-20 flex items-center gap-2 overflow-hidden rounded-full border border-[color-mix(in_oklab,var(--cb-ink)_45%,transparent)] bg-popover py-1 pr-1 pl-3 shadow-[0_6px_20px_-10px_color-mix(in_oklab,var(--foreground)_45%,transparent)] @min-[36rem]/cobrowse-consent:inset-x-auto @min-[36rem]/cobrowse-consent:top-0 @min-[36rem]/cobrowse-consent:left-1/2 @min-[36rem]/cobrowse-consent:-translate-x-1/2"
              initial={{ opacity: motionSafe ? 1 : 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? { layout: springs.glide }
                  : { duration: durations.fast }
              }
            >
              <motion.span
                className="flex min-w-0 flex-1 items-center gap-2 @min-[36rem]/cobrowse-consent:flex-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: durations.base,
                  delay: motionSafe ? 0.2 : 0,
                }}
              >
                <span aria-hidden className="relative flex size-2.5 shrink-0">
                  <motion.span
                    className="absolute inset-0 rounded-full bg-[var(--cb-ink)]"
                    initial={false}
                    animate={
                      breathing && inView
                        ? { scale: [1, 2.2], opacity: [0.5, 0] }
                        : { scale: 1, opacity: 0 }
                    }
                    transition={
                      breathing && inView
                        ? {
                            duration: 1.6,
                            repeat: Infinity,
                            ease: easings.enter,
                          }
                        : { duration: durations.fast }
                    }
                  />
                  <span className="absolute inset-0 rounded-full bg-[var(--cb-ink)]" />
                </span>
                <span className="min-w-0 truncate text-[12px] font-medium whitespace-nowrap text-foreground">
                  {name}{" "}
                  <span className="hidden @min-[22rem]/cobrowse-consent:inline">
                    is{" "}
                  </span>
                  viewing
                </span>
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  <span className="sr-only">for </span>
                  {mmss(sharedFor)}
                </span>
              </motion.span>
              <button
                ref={setStopNode}
                type="button"
                onClick={stop}
                aria-label="Stop sharing"
                aria-keyshortcuts="Escape"
                className={cn(
                  BUTTON,
                  FOCUS,
                  "h-7 rounded-full bg-foreground px-3 text-[12px] text-background hover:bg-[color-mix(in_oklab,var(--foreground)_85%,var(--background))]",
                )}
              >
                <Square aria-hidden className="size-2.5 fill-current" />
                Stop
                <span className="hidden @min-[22rem]/cobrowse-consent:inline">
                  sharing
                </span>
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* The agent's pointer, when the host reports one. */}
        <AnimatePresence>
          {sharing && pointer ? (
            <motion.div
              key="pointer"
              aria-hidden
              className="pointer-events-none absolute z-20 flex items-start"
              initial={{
                opacity: 0,
                left: `${Number((pointer.x * 100).toFixed(3))}%`,
                top: `${Number((pointer.y * 100).toFixed(3))}%`,
              }}
              animate={{
                opacity: 1,
                left: `${Number((Math.min(0.92, Math.max(0, pointer.x)) * 100).toFixed(3))}%`,
                top: `${Number((Math.min(0.94, Math.max(0, pointer.y)) * 100).toFixed(3))}%`,
              }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      left: springs.drift,
                      top: springs.drift,
                      opacity: { duration: durations.base, delay: 0.6 },
                    }
                  : { duration: 0 }
              }
            >
              <MousePointer2 className="size-4 fill-[var(--cb-ink)] text-card" />
              <span className="mt-3 -ml-1 rounded-full bg-[var(--cb-ink)] px-1.5 py-px text-[9.5px] font-semibold text-card">
                {agent.initials}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          layoutScroll
          className={cn(
            "relative h-full overflow-y-auto overscroll-contain",
            geo.pad,
            sharing && "pt-14 @min-[36rem]/cobrowse-consent:pt-11",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {state === "request" ? requestCard : note}
          </AnimatePresence>

          <motion.div
            layout={motionSafe ? "position" : false}
            transition={springs.glide}
            className="mb-4 flex flex-col gap-0.5"
          >
            <h2 className="text-[17px] leading-6 font-semibold text-foreground">
              {pageTitle}
            </h2>
            <p className="text-[12px] leading-4 text-ink-3">
              Your plan, how you pay and where invoices go.
            </p>
          </motion.div>

          <motion.dl
            layout={motionSafe ? "position" : false}
            transition={springs.glide}
            className={cn(
              "grid grid-cols-1 @min-[36rem]/cobrowse-consent:grid-cols-2",
              geo.gap,
              "gap-x-4",
            )}
          >
            {fields.map((field) => {
              const isMasked = masked.has(field.id);
              const delay = isMasked
                ? frameLead + maskIndex++ * cascade(Math.max(2, maskCount)) * 2
                : 0;
              return (
                <div
                  key={field.id}
                  className={cn(
                    "flex min-w-0 flex-col gap-1",
                    field.wide && "@min-[36rem]/cobrowse-consent:col-span-2",
                  )}
                >
                  <dt className="flex items-center gap-1.5 text-[11.5px] leading-4 text-ink-3">
                    {field.label}
                    {isMasked ? (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] text-ink-3">
                        <Lock aria-hidden className="size-2.5" />
                        private
                      </span>
                    ) : null}
                  </dt>
                  <dd
                    className={cn(
                      "relative flex items-center rounded-2 border border-input bg-card px-2.5 text-foreground",
                      geo.field,
                      geo.text,
                    )}
                  >
                    <span className="truncate" title={field.value}>
                      {field.value}
                    </span>
                    {isMasked ? (
                      <>
                        <span className="sr-only">
                          {sharing ? `, hidden from ${name} while sharing` : ""}
                        </span>
                        <Mask
                          on={sharing}
                          style={maskStyle}
                          delay={delay}
                          sweep={sweep}
                          motionSafe={motionSafe}
                          agent={name}
                        />
                      </>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </motion.dl>
        </motion.div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
