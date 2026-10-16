"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  CalendarClock,
  Check,
  Clock,
  Globe,
  LoaderCircle,
  Mail,
  MessageSquare,
  RotateCcw,
  Save,
  Send,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type StatusState = "operational" | "degraded" | "partial" | "major";
export type StatusPhase =
  "investigating" | "identified" | "monitoring" | "resolved";
export type StatusPreviewMode = "page" | "email" | "sms";
export type StatusStampStyle = "seal" | "chip" | "tick";
export type StatusLoad = "ready" | "loading" | "error";

export type StatusComponent = {
  id: string;
  name: string;
  /** What customers see right now. */
  state: StatusState;
};

export type StatusUpdate = {
  id: string;
  phase: StatusPhase;
  /** When it was posted (or will be, when scheduled), ms since the epoch. */
  at: number;
  text: string;
  /** Queued for later rather than posted. */
  scheduled?: boolean;
};

export type StatusIncident = {
  title: string;
  /** Posted updates, newest first. */
  updates: StatusUpdate[];
};

export type StatusTemplate = {
  id: string;
  label: string;
  /** Inserting the template moves the draft to this phase. */
  phase: StatusPhase;
  text: string;
};

export type StatusAudience = {
  id: string;
  label: string;
  count: number;
  channel: "email" | "sms" | "webhook";
};

export type StatusDraft = {
  phase: StatusPhase;
  text: string;
  /** Components this update changes, by id, with their new state. */
  affected: Record<string, StatusState>;
  /** Audience ids to notify. */
  notify: string[];
};

export type StatusDispatchProps = {
  /** Which view the preview opens on: the public page, the email or the text message. Changing it moves the preview there; at narrow widths email and text also open on the Preview tab. @default "page" */
  previewMode?: StatusPreviewMode;
  /** Fires when the preview switches view. */
  onPreviewModeChange?: (mode: StatusPreviewMode) => void;
  /** The mark pressed onto a posted update: a round seal, a label chip, or a tick. @default "seal" */
  stampStyle?: StatusStampStyle;
  /** Publish, the pills, the stamp and the template highlight, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The page's components with their live state. Seeds the preview; it owns the live states after that. @default defaultStatusComponents */
  components?: StatusComponent[];
  /** The incident being updated and its posted updates. @default defaultStatusIncident */
  incident?: StatusIncident;
  /** Templates offered when a line starts with a slash. @default defaultStatusTemplates */
  templates?: StatusTemplate[];
  /** Who can be notified. @default defaultStatusAudiences */
  audiences?: StatusAudience[];
  /** Controlled draft. Changes are reported through `onDraftChange`. */
  draft?: StatusDraft;
  /** Initial draft when uncontrolled. @default defaultStatusDraft */
  defaultDraft?: StatusDraft;
  /** Fires from the edit that changed the draft, with the whole draft. */
  onDraftChange?: (draft: StatusDraft) => void;
  /** Publish was pressed (or Ctrl+Enter). Return a promise to show publishing; a rejection keeps the draft. */
  onPublish?: (draft: StatusDraft) => void | Promise<unknown>;
  /** A time was chosen from Schedule. A rejection keeps the draft. */
  onSchedule?: (draft: StatusDraft, at: number) => void | Promise<unknown>;
  /** Save draft was pressed. */
  onSaveDraft?: (draft: StatusDraft) => void;
  /** The current time, ms; posts are stamped with it. Never read from the clock. @default defaultStatusNow */
  now?: number;
  /** The status page's name in the preview and the messages. @default "Waylight Status" */
  pageName?: string;
  /** Whether the live page has loaded. Loading shows a skeleton preview; error keeps the composer under a Retry banner. @default "ready" */
  status?: StatusLoad;
  /** Retry was pressed after the live page failed to load. */
  onRetry?: () => void;
  /** Height of the composer, px; each pane scrolls inside it. @default 540 */
  height?: number;
  /** Nothing can be edited, published or scheduled; the composer dims. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 14:32 UTC. */
export const defaultStatusNow = Date.UTC(2026, 9, 12, 14, 32);

export const defaultStatusComponents: StatusComponent[] = [
  { id: "api", name: "Waylight API", state: "degraded" },
  { id: "dashboard", name: "Dashboard", state: "operational" },
  { id: "webhooks", name: "Webhooks", state: "operational" },
  { id: "edge", name: "Edge delivery", state: "operational" },
  { id: "billing", name: "Billing", state: "operational" },
];

export const defaultStatusIncident: StatusIncident = {
  title: "Elevated API latency in eu-west",
  updates: [
    {
      id: "u-1",
      phase: "investigating",
      at: defaultStatusNow - 30 * MIN,
      text: "We're investigating slower responses from the Waylight API in eu-west. Some requests may time out.",
    },
  ],
};

export const defaultStatusTemplates: StatusTemplate[] = [
  {
    id: "investigating",
    label: "Investigating",
    phase: "investigating",
    text: "We're investigating reports of degraded performance. We'll post another update within 30 minutes.",
  },
  {
    id: "identified",
    label: "Cause identified",
    phase: "identified",
    text: "We've identified the cause and are working on a fix. Some requests may still be slower than usual.",
  },
  {
    id: "still-working",
    label: "Still working on it",
    phase: "identified",
    text: "We're still working on a fix. Next update in 30 minutes.",
  },
  {
    id: "monitoring",
    label: "Fix rolled out",
    phase: "monitoring",
    text: "A fix has been rolled out and we're watching the results. Everything should be working normally again.",
  },
  {
    id: "resolved",
    label: "Resolved",
    phase: "resolved",
    text: "This incident is resolved. Thank you for your patience; a full write-up will follow.",
  },
];

export const defaultStatusAudiences: StatusAudience[] = [
  { id: "email", label: "Email subscribers", count: 2481, channel: "email" },
  { id: "sms", label: "Text messages", count: 312, channel: "sms" },
  { id: "webhook", label: "Webhooks", count: 14, channel: "webhook" },
];

export const defaultStatusDraft: StatusDraft = {
  phase: "identified",
  text: "We've traced the latency to a saturated connection pool on the eu-west database proxy. Requests are slower than usual but succeeding. We're adding capacity now.",
  affected: { api: "partial", webhooks: "degraded" },
  notify: ["email", "sms"],
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** A filled shape in the accent: its hue and chroma at a fixed lightness, so it reads in both themes. */
const PIGMENT = "oklch(from var(--sd-accent) 0.8 c h)";
const ON_PIGMENT = "oklch(0.24 0.02 258)";

const STATES: StatusState[] = ["operational", "degraded", "partial", "major"];
const STATE_NAME: Record<StatusState, string> = {
  operational: "Operational",
  degraded: "Degraded",
  partial: "Partial outage",
  major: "Major outage",
};
const STATE_COLOR: Record<StatusState, string> = {
  operational: "var(--success)",
  degraded: "var(--warn)",
  partial: "color-mix(in oklch, var(--warn), var(--danger))",
  major: "var(--danger)",
};
const BANNER: Record<StatusState, string> = {
  operational: "All systems operational",
  degraded: "Degraded performance",
  partial: "Partial outage",
  major: "Major outage",
};

const PHASES: StatusPhase[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];
const PHASE_NAME: Record<StatusPhase, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
};
const PHASE_COLOR: Record<StatusPhase, string> = {
  investigating: "var(--danger)",
  identified: "var(--warn)",
  monitoring: "var(--accent-bright)",
  resolved: "var(--success)",
};

const MODES: { value: StatusPreviewMode; label: string; Icon: typeof Globe }[] =
  [
    { value: "page", label: "Page", Icon: Globe },
    { value: "email", label: "Email", Icon: Mail },
    { value: "sms", label: "Text", Icon: MessageSquare },
  ];

const pad = (n: number) => String(n).padStart(2, "0");
/** Fixed 24-hour UTC clock: a locale lookup would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
/** Thousands by hand, so Node and the browser print the same digits. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const plural = (n: number, one: string, other: string) =>
  `${grouped(n)} ${n === 1 ? one : other}`;

const rank = (s: StatusState) => STATES.indexOf(s);
const worst = (states: StatusState[]): StatusState =>
  states.reduce<StatusState>(
    (w, s) => (rank(s) > rank(w) ? s : w),
    "operational",
  );

/** The line the caret sits on, when it starts with a slash: the template query. */
function slashAt(text: string, caret: number) {
  const start = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const line = text.slice(start, caret);
  const match = /^\/([\w\s-]{0,24})$/.exec(line);
  return match ? { start, query: (match[1] ?? "").trim().toLowerCase() } : null;
}

/** 160 characters is one text; longer ones split into 153-character parts. */
const smsParts = (length: number) =>
  length <= 160 ? 1 : Math.ceil(length / 153);

/* ----------------------------------------------------------------------- */
/*                               Rolling count                             */
/* ----------------------------------------------------------------------- */

/**
 * A figure that runs to its new value on a base tween. The value lives in a
 * motion value rendered as text, so a roll costs no React render per frame
 * and the server prints the settled figure.
 */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => grouped(v));
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: durations.base,
      ease: easings.enter,
    });
    return () => controls.stop();
  }, [motionSafe, mv, value]);
  // Reduced motion prints the figure itself: a derived value can miss the
  // jump StrictMode's rehearsal remount swallows, and nothing rolls anyway.
  if (!motionSafe) return <span>{grouped(value)}</span>;
  return <motion.span>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                              Segmented radio                            */
/* ----------------------------------------------------------------------- */

function Segmented<T extends string>({
  id,
  label,
  options,
  value,
  onChange,
  motionSafe,
  disabled,
  className,
}: {
  id: string;
  label: string;
  options: { value: T; label: React.ReactNode; name: string }[];
  value: T;
  onChange: (value: T) => void;
  motionSafe: boolean;
  disabled: boolean;
  className?: string;
}) {
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const at = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const go = (index: number) => {
    const next = options[(index + options.length) % options.length];
    if (!next) return;
    if (!disabled) onChange(next.value);
    refs.current.get(next.value)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn("grid gap-0.5 rounded-2 bg-surface-2 p-0.5", className)}
    >
      {options.map((o, index) => {
        const checked = index === at;
        return (
          <button
            key={o.value}
            ref={(node) => {
              if (node) refs.current.set(o.value, node);
              else refs.current.delete(o.value);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.name}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!disabled) onChange(o.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                go(index + 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                go(index - 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                go(0);
              } else if (event.key === "End") {
                event.preventDefault();
                go(options.length - 1);
              }
            }}
            className={cn(
              "relative isolate flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[12px] transition-colors",
              FOCUS_RING,
              checked ? "font-medium text-foreground" : "text-ink-3",
              !disabled && !checked && "hover:text-ink-2",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            {checked ? (
              <motion.span
                layoutId={`${id}-pill`}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[5px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)] ring-1 ring-hairline"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-(--sd-accent)" />
              </motion.span>
            ) : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Stamp                                  */
/* ----------------------------------------------------------------------- */

/**
 * The mark pressed onto a posted update. A fresh one presses on from 1.6×,
 * turned a little further, on `springs.recoil`: a rubber stamp lands, gives
 * twice and settles. An old one is simply there.
 */
function Stamp({
  style,
  verb,
  at,
  fresh,
  motionSafe,
}: {
  style: StatusStampStyle;
  verb: string;
  at: number;
  fresh: boolean;
  motionSafe: boolean;
}) {
  const time = clock(at);
  const body =
    style === "seal" ? (
      <span className="relative flex size-12 flex-col items-center justify-center rounded-full border-2 border-(--sd-accent) text-(--sd-accent)">
        <span className="absolute inset-[3px] rounded-full border border-dashed border-[color-mix(in_oklab,var(--sd-accent)_55%,transparent)]" />
        <span className="font-mono text-[7px] leading-none font-semibold tracking-[0.12em] uppercase">
          {verb}
        </span>
        <span className="mt-0.5 font-mono text-[11px] leading-none font-semibold tabular-nums">
          {time}
        </span>
      </span>
    ) : style === "chip" ? (
      <span className="inline-flex h-6 items-center gap-1 rounded-1 border-2 border-(--sd-accent) px-1.5 font-mono text-[10px] font-semibold tracking-[0.08em] whitespace-nowrap text-(--sd-accent) uppercase tabular-nums">
        {verb} {time}
      </span>
    ) : (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--sd-accent)_12%,transparent)] pr-2 pl-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-(--sd-accent) tabular-nums">
        <span
          className="flex size-5 items-center justify-center rounded-full"
          style={{ backgroundColor: PIGMENT, color: ON_PIGMENT }}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
        {time}
      </span>
    );
  const rest = style === "tick" ? 0 : -6;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none inline-flex"
      initial={
        fresh
          ? motionSafe
            ? { opacity: 0, scale: 1.6, rotate: rest - 8 }
            : { opacity: 0, scale: 1, rotate: rest }
          : false
      }
      animate={{ opacity: 1, scale: 1, rotate: rest }}
      transition={
        motionSafe
          ? {
              scale: { ...springs.recoil, delay: 0.12 },
              rotate: { ...springs.recoil, delay: 0.12 },
              opacity: { duration: durations.blink, delay: 0.12 },
            }
          : { duration: durations.fast }
      }
    >
      {body}
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

type Wave = { key: number; delays: Record<string, number> };

/**
 * A status-page composer with the page beside it. Pick the phase, set what
 * each component is doing, write the update (a slash at the start of a line
 * offers templates) and choose who hears about it; the preview shows the
 * public page, the email and the text message as customers will get them,
 * the draft riding at the head of the timeline as a dashed ghost.
 *
 * Publishing folds the ghost away on a fast exit tween, lands the real entry
 * at the head of the timeline on `springs.recoil`, presses the stamp onto it
 * a beat later on the same spring, and then the component dots change to
 * their new states one after another on a `cascade()` stagger, each with a
 * ring that spreads once. A failed publish never celebrates: the ghost stays,
 * outlined, and the draft is untouched.
 *
 * Ctrl or ⌘ + Enter publishes from anywhere in the composer. Phase, preview
 * and every component's state are radiogroups; the template list is a listbox
 * driven from the textarea with Up, Down, Enter and Escape. At narrow widths
 * the preview becomes a tab. Under reduced motion nothing travels or bounces:
 * the entry and the stamp fade in and the dots change together, because the
 * new states are the information.
 */
export function StatusDispatch({
  previewMode = "page",
  onPreviewModeChange,
  stampStyle = "seal",
  accent = "var(--accent-bright)",
  components = defaultStatusComponents,
  incident = defaultStatusIncident,
  templates = defaultStatusTemplates,
  audiences = defaultStatusAudiences,
  draft,
  defaultDraft = defaultStatusDraft,
  onDraftChange,
  onPublish,
  onSchedule,
  onSaveDraft,
  now = defaultStatusNow,
  pageName = "Waylight Status",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: StatusDispatchProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${safeId}-title`;
  const textId = `${safeId}-text`;
  const hintId = `${safeId}-hint`;
  const listId = `${safeId}-templates`;

  /* ------------------------------- the draft ----------------------------- */

  const [own, setOwn] = React.useState<StatusDraft>(defaultDraft);
  const current = draft ?? own;

  /* ------------------------- the live page (owned) ----------------------- */

  const [live, setLive] = React.useState<Record<string, StatusState>>(() =>
    Object.fromEntries(components.map((c) => [c.id, c.state])),
  );
  const liveOf = (id: string): StatusState =>
    live[id] ?? components.find((c) => c.id === id)?.state ?? "operational";
  const [updates, setUpdates] = React.useState<StatusUpdate[]>(
    incident.updates,
  );
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [wave, setWave] = React.useState<Wave | null>(null);
  const [lastChanged, setLastChanged] = React.useState<string[]>([]);
  const counter = React.useRef(incident.updates.length);

  const changes = components.filter((c) => {
    const next = current.affected[c.id];
    return next !== undefined && next !== liveOf(c.id);
  });

  /* ------------------------------ preview mode --------------------------- */

  const [mode, setMode] = React.useState<StatusPreviewMode>(previewMode);
  // At narrow widths a host that asks for the email or the text opens on the
  // preview tab; the page view opens on Compose, where the work starts.
  const [tab, setTab] = React.useState<"compose" | "preview">(
    previewMode === "page" ? "compose" : "preview",
  );
  // A host that changes how the preview looks (its view, or the stamp) brings
  // the preview forward, so at narrow widths the change is not hidden behind
  // the Compose tab.
  const [seen, setSeen] = React.useState({ previewMode, stampStyle });
  if (seen.previewMode !== previewMode || seen.stampStyle !== stampStyle) {
    if (seen.previewMode !== previewMode) setMode(previewMode);
    setSeen({ previewMode, stampStyle });
    setTab("preview");
  }
  const chooseMode = (next: StatusPreviewMode) => {
    setMode(next);
    onPreviewModeChange?.(next);
  };

  /* --------------------------------- tabs -------------------------------- */

  const [narrow, setNarrow] = React.useState(false);
  const roRef = React.useRef<ResizeObserver | null>(null);
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setNarrow(entry.contentRect.width < 640);
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);
  React.useEffect(() => () => roRef.current?.disconnect(), []);
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());

  /* ------------------------------ announcements -------------------------- */

  const [announcement, setAnnouncement] = React.useState("");

  /* -------------------------------- editing ------------------------------ */

  const [publishState, setPublishState] = React.useState<
    "idle" | "publishing" | "failed"
  >("idle");
  const [folding, setFolding] = React.useState(false);

  // While a post is in flight the draft is what is being posted: it stays
  // read-only until the host answers, so nothing typed meanwhile is lost.
  const busy = publishState === "publishing" || folding;

  const change = (patch: Partial<StatusDraft>) => {
    if (disabled || busy) return;
    const next = { ...current, ...patch };
    if (draft === undefined) setOwn(next);
    onDraftChange?.(next);
    if (publishState === "failed") setPublishState("idle");
  };

  const setState = (id: string, state: StatusState) => {
    const affected = { ...current.affected };
    if (state === liveOf(id)) delete affected[id];
    else affected[id] = state;
    change({ affected });
  };

  const toggleNotify = (id: string) => {
    const on = current.notify.includes(id);
    change({
      notify: on
        ? current.notify.filter((n) => n !== id)
        : [...current.notify, id],
    });
  };

  const recipients = audiences
    .filter((a) => current.notify.includes(a.id))
    .reduce((sum, a) => sum + a.count, 0);

  /* ------------------------------- templates ----------------------------- */

  const textRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pendingCaret = React.useRef<number | null>(null);
  const [slash, setSlash] = React.useState<{
    start: number;
    query: string;
  } | null>(null);
  const [active, setActive] = React.useState(0);
  const matches = slash
    ? templates.filter(
        (t) =>
          !slash.query ||
          t.label.toLowerCase().includes(slash.query) ||
          t.phase.startsWith(slash.query),
      )
    : [];
  const listOpen = slash !== null && matches.length > 0;
  const activeTemplate = matches[Math.min(active, matches.length - 1)];

  React.useLayoutEffect(() => {
    const node = textRef.current;
    const caret = pendingCaret.current;
    if (!node || caret === null) return;
    pendingCaret.current = null;
    node.focus();
    node.setSelectionRange(caret, caret);
  });

  const insert = (template: StatusTemplate) => {
    if (!slash) return;
    const node = textRef.current;
    const caret = node?.selectionStart ?? current.text.length;
    const before = current.text.slice(0, slash.start);
    const after = current.text.slice(caret);
    const text = `${before}${template.text}${after}`;
    pendingCaret.current = before.length + template.text.length;
    setSlash(null);
    change({ text, phase: template.phase });
    setAnnouncement(
      `Inserted the ${template.label} template. Phase set to ${PHASE_NAME[template.phase]}.`,
    );
  };

  /* -------------------------------- timers ------------------------------- */

  const timers = React.useRef<number[]>([]);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    const list = timers.current;
    return () => {
      alive.current = false;
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(
      window.setTimeout(() => {
        if (alive.current) fn();
      }, ms),
    );
  };

  /* ------------------------------- publishing ---------------------------- */

  const hasDraft =
    current.text.trim().length > 0 || Object.keys(current.affected).length > 0;
  const blocked =
    disabled ||
    publishState === "publishing" ||
    status === "loading" ||
    !hasDraft;

  const land = (snapshot: StatusDraft) => {
    counter.current += 1;
    const entry: StatusUpdate = {
      id: `u-${counter.current}`,
      phase: snapshot.phase,
      at: now,
      text: snapshot.text.trim(),
    };
    const changed = components.filter((c) => {
      const next = snapshot.affected[c.id];
      return next !== undefined && next !== liveOf(c.id);
    });
    const gap = cascade(Math.max(2, changed.length));
    const delays: Record<string, number> = {};
    changed.forEach((c, i) => {
      // The dots wait for the stamp, then go one after another.
      delays[c.id] = motionSafe ? Number((0.34 + i * gap).toFixed(3)) : 0;
    });
    // Scheduled posts stay on top (they are still to come); the new post
    // heads everything already posted.
    setUpdates((prev) => [
      ...prev.filter((u) => u.scheduled),
      entry,
      ...prev.filter((u) => !u.scheduled),
    ]);
    setLive((prev) => ({ ...prev, ...snapshot.affected }));
    setWave({ key: counter.current, delays });
    setLastChanged(changed.map((c) => c.id));
    setFresh(entry.id);
    setFolding(false);
    setPublishState("idle");
    const cleared: StatusDraft = { ...snapshot, text: "", affected: {} };
    if (draft === undefined) setOwn(cleared);
    onDraftChange?.(cleared);
    setAnnouncement(
      `Update published at ${clock(now)}.${
        changed.length
          ? ` ${plural(changed.length, "component", "components")} changed.`
          : ""
      }`,
    );
    later(() => {
      setWave(null);
      setFresh(null);
    }, 1600);
  };

  const publish = () => {
    if (blocked) return;
    const snapshot = current;
    const succeed = () => {
      if (!alive.current) return;
      if (narrow) {
        setTab("preview");
        tabRefs.current.get("preview")?.focus();
      }
      if (!motionSafe) {
        land(snapshot);
        return;
      }
      setFolding(true);
      later(() => land(snapshot), 170);
    };
    const fail = () => {
      if (!alive.current) return;
      setPublishState("failed");
      setAnnouncement("Not published. Your draft is kept.");
    };
    let result: void | Promise<unknown>;
    try {
      result = onPublish?.(snapshot);
    } catch {
      fail();
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPublishState("publishing");
      (result as Promise<unknown>).then(succeed, fail);
    } else {
      succeed();
    }
  };

  /* ------------------------------- scheduling ---------------------------- */

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [menuAt, setMenuAt] = React.useState(0);
  const menuButton = React.useRef<HTMLButtonElement | null>(null);
  const menuItems = React.useRef<(HTMLButtonElement | null)[]>([]);
  const tomorrow = (() => {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 9);
  })();
  const slots = [
    { label: "In 30 minutes", at: now + 30 * MIN },
    { label: "In 1 hour", at: now + 60 * MIN },
    { label: "Tomorrow", at: tomorrow },
  ];
  React.useEffect(() => {
    if (menuOpen) menuItems.current[menuAt]?.focus();
  }, [menuOpen, menuAt]);

  const schedule = (at: number) => {
    setMenuOpen(false);
    menuButton.current?.focus();
    if (blocked) return;
    const snapshot = current;
    const done = () => {
      if (!alive.current) return;
      counter.current += 1;
      const entry: StatusUpdate = {
        id: `u-${counter.current}`,
        phase: snapshot.phase,
        at,
        text: snapshot.text.trim(),
        scheduled: true,
      };
      setUpdates((prev) => [entry, ...prev]);
      const cleared: StatusDraft = { ...snapshot, text: "", affected: {} };
      if (draft === undefined) setOwn(cleared);
      onDraftChange?.(cleared);
      setAnnouncement(`Update scheduled for ${clock(at)}.`);
    };
    let result: void | Promise<unknown>;
    try {
      result = onSchedule?.(snapshot, at);
    } catch {
      setPublishState("failed");
      setAnnouncement("Not scheduled. Your draft is kept.");
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(done, () => {
        if (!alive.current) return;
        setPublishState("failed");
        setAnnouncement("Not scheduled. Your draft is kept.");
      });
    } else {
      done();
    }
  };

  /* -------------------------------- saving ------------------------------- */

  const [saved, setSaved] = React.useState(false);
  const saveDraft = () => {
    if (disabled) return;
    onSaveDraft?.(current);
    setSaved(true);
    setAnnouncement("Draft saved.");
    later(() => setSaved(false), 1600);
  };

  /* -------------------------------- render ------------------------------- */

  const worstLive = worst(components.map((c) => liveOf(c.id)));
  const posted = updates.filter((u) => !u.scheduled);
  const latest = posted[0];
  const subject = (phase: StatusPhase) =>
    `[${PHASE_NAME[phase]}] ${incident.title}`;
  const smsBody = (phase: StatusPhase, text: string) =>
    `${pageName}: ${PHASE_NAME[phase]} - ${incident.title}. ${text.trim()} Reply STOP to opt out.`;
  const shown = hasDraft
    ? { phase: current.phase, text: current.text, draft: true as const }
    : latest
      ? { phase: latest.phase, text: latest.text, draft: false as const }
      : null;
  const sms = shown ? smsBody(shown.phase, shown.text) : "";
  const audienceOf = (channel: StatusAudience["channel"]) =>
    audiences.find((a) => a.channel === channel);
  const emailAudience = audienceOf("email");
  const smsAudience = audienceOf("sms");
  const emailOn = !!emailAudience && current.notify.includes(emailAudience.id);
  const smsOn = !!smsAudience && current.notify.includes(smsAudience.id);

  const ghostText = current.text.trim();

  const composer = (
    <div
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          setSlash(null);
          publish();
        }
      }}
      className="flex flex-1 flex-col overflow-hidden"
    >
      <div className="flex flex-1 [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-ink-3">Phase</span>
          <Segmented
            id={`${safeId}-phase`}
            label="Phase"
            options={PHASES.map((p) => ({
              value: p,
              name: PHASE_NAME[p],
              label: (
                <>
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PHASE_COLOR[p] }}
                  />
                  <span className="truncate">{PHASE_NAME[p]}</span>
                </>
              ),
            }))}
            value={current.phase}
            onChange={(phase) => change({ phase })}
            motionSafe={motionSafe}
            disabled={disabled}
            className="grid-cols-2 @min-[64rem]:grid-cols-4"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-2 text-[11px] font-medium text-ink-3">
            Affected components
            <span className="font-normal">
              {changes.length
                ? plural(changes.length, "change", "changes")
                : "No changes"}
            </span>
          </span>
          <ul className="flex flex-col divide-y divide-hairline rounded-2 border border-hairline">
            {components.map((c) => {
              const was = liveOf(c.id);
              const next = current.affected[c.id] ?? was;
              const changed = next !== was;
              return (
                <li
                  key={c.id}
                  className="relative flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-1.5 pl-3"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-0 w-[2px] rounded-full transition-colors"
                    style={{
                      backgroundColor: changed
                        ? STATE_COLOR[next]
                        : "transparent",
                    }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-foreground">
                      {c.name}
                    </span>
                    <span
                      className="truncate text-[11px] text-ink-3"
                      title={`${STATE_NAME[next]}${changed ? `, was ${STATE_NAME[was].toLowerCase()}` : ""}`}
                    >
                      <span style={{ color: STATE_COLOR[next] }}>
                        {STATE_NAME[next]}
                      </span>
                      {changed ? ` · was ${STATE_NAME[was].toLowerCase()}` : ""}
                    </span>
                  </span>
                  <StateRadios
                    name={c.name}
                    value={next}
                    onChange={(s) => setState(c.id, s)}
                    disabled={disabled}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <div className="relative flex flex-col gap-1.5">
          <label
            htmlFor={textId}
            className="flex items-baseline justify-between gap-2 text-[11px] font-medium text-ink-3"
          >
            Update
            <span id={hintId} className="font-normal">
              <kbd className="font-mono">/</kbd> templates ·{" "}
              <kbd className="font-mono">Ctrl+Enter</kbd> publishes
            </span>
          </label>
          <textarea
            ref={textRef}
            id={textId}
            value={current.text}
            disabled={disabled}
            readOnly={busy}
            aria-busy={busy || undefined}
            rows={4}
            placeholder="What's happening, and what are you doing about it?"
            aria-describedby={hintId}
            aria-autocomplete="list"
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={
              listOpen && activeTemplate
                ? `${listId}-${activeTemplate.id}`
                : undefined
            }
            onChange={(event) => {
              const text = event.currentTarget.value;
              const caret = event.currentTarget.selectionStart;
              const next = slashAt(text, caret);
              setSlash(next);
              if (next && next.query !== slash?.query) setActive(0);
              change({ text });
            }}
            onBlur={() => setSlash(null)}
            onKeyDown={(event) => {
              if (!listOpen) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((a) => (a + 1) % matches.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((a) => (a - 1 + matches.length) % matches.length);
              } else if (
                (event.key === "Enter" && !event.metaKey && !event.ctrlKey) ||
                event.key === "Tab"
              ) {
                if (!activeTemplate) return;
                event.preventDefault();
                insert(activeTemplate);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setSlash(null);
              }
            }}
            className={cn(
              "w-full resize-none rounded-2 border border-input bg-surface-1 px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-ink-3 disabled:opacity-60",
              FOCUS_RING,
            )}
          />
          {listOpen ? (
            <motion.ul
              id={listId}
              role="listbox"
              aria-label="Templates"
              className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
            >
              {matches.map((t, i) => {
                const on = t === activeTemplate;
                return (
                  <li
                    key={t.id}
                    id={`${listId}-${t.id}`}
                    role="option"
                    aria-selected={on}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => insert(t)}
                    className="relative isolate flex cursor-pointer items-center gap-2 rounded-2 px-2.5 py-1.5"
                  >
                    {on ? (
                      <motion.span
                        layoutId={`${safeId}-tpl-pill`}
                        aria-hidden
                        className="absolute inset-0 -z-10 rounded-2 bg-[color-mix(in_oklab,var(--sd-accent)_14%,transparent)]"
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    ) : null}
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: PHASE_COLOR[t.phase] }}
                    />
                    <span className="shrink-0 text-[12px] font-medium text-foreground">
                      {t.label}
                    </span>
                    <span className="min-w-0 truncate text-[11px] text-ink-3">
                      {t.text}
                    </span>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-2 text-[11px] font-medium text-ink-3">
            Notify
            <span className="font-normal tabular-nums">
              <Rolling value={recipients} motionSafe={motionSafe} />{" "}
              {recipients === 1 ? "recipient" : "recipients"}
            </span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {audiences.map((a) => {
              const on = current.notify.includes(a.id);
              return (
                <motion.button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${a.label}, ${plural(a.count, "recipient", "recipients")}`}
                  disabled={disabled}
                  onClick={() => toggleNotify(a.id)}
                  whileTap={
                    motionSafe && !disabled ? { scale: 0.96 } : undefined
                  }
                  transition={springs.flick}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    FOCUS_RING,
                    on
                      ? "border-[color-mix(in_oklab,var(--sd-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--sd-accent)_10%,transparent)] text-foreground"
                      : "border-hairline text-ink-3 hover:text-ink-2",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-3.5 items-center justify-center rounded-full border transition-colors",
                      on
                        ? "border-transparent"
                        : "border-hairline-strong bg-transparent",
                    )}
                    style={
                      on
                        ? { backgroundColor: PIGMENT, color: ON_PIGMENT }
                        : undefined
                    }
                  >
                    {on ? (
                      <Check className="size-2.5" strokeWidth={3.5} />
                    ) : null}
                  </span>
                  {a.label}
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {grouped(a.count)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {publishState === "failed" ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-2 border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] px-3 py-2 text-[12px] text-danger"
          >
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            Not published. Your draft is kept.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5 border-t border-hairline px-3 py-3 @min-[22rem]:gap-2 @min-[22rem]:px-4">
        <button
          type="button"
          onClick={saveDraft}
          aria-disabled={disabled || undefined}
          aria-label={saved ? "Saved" : "Save draft"}
          className={cn(
            "mr-auto inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <span aria-hidden className="relative flex size-3.5">
            {saved ? (
              <motion.span
                key="saved"
                className="absolute inset-0 flex text-success"
                initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </motion.span>
            ) : (
              <Save className="size-3.5" />
            )}
          </span>
          <span aria-hidden className="hidden @min-[22rem]:grid">
            <span
              className={cn("col-start-1 row-start-1", saved && "invisible")}
            >
              Save draft
            </span>
            <span
              aria-hidden={!saved}
              className={cn("col-start-1 row-start-1", !saved && "invisible")}
            >
              Saved
            </span>
          </span>
        </button>

        <div className="relative">
          <button
            ref={menuButton}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-disabled={blocked || undefined}
            onClick={() => {
              if (blocked) return;
              setMenuAt(0);
              setMenuOpen((o) => !o);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (blocked) return;
                setMenuAt(event.key === "ArrowUp" ? slots.length - 1 : 0);
                setMenuOpen(true);
              }
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors @min-[22rem]:px-3",
              FOCUS_RING,
              blocked
                ? "cursor-not-allowed opacity-60"
                : "hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <CalendarClock aria-hidden className="size-3.5" />
            <span className="sr-only @min-[22rem]:not-sr-only">Schedule</span>
          </button>
          {menuOpen ? (
            <motion.div
              role="menu"
              aria-label="Schedule for"
              className="absolute right-0 bottom-full z-30 mb-1.5 flex w-48 flex-col gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuOpen(false);
                  menuButton.current?.focus();
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMenuAt((i) => (i + 1) % slots.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMenuAt((i) => (i - 1 + slots.length) % slots.length);
                } else if (event.key === "Tab") {
                  setMenuOpen(false);
                }
              }}
              onBlur={(event) => {
                if (
                  !event.currentTarget.contains(event.relatedTarget as Node)
                ) {
                  setMenuOpen(false);
                }
              }}
            >
              {slots.map((s, i) => (
                <button
                  key={s.label}
                  ref={(node) => {
                    menuItems.current[i] = node;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={i === menuAt ? 0 : -1}
                  onClick={() => schedule(s.at)}
                  className={cn(
                    "flex h-8 items-center justify-between gap-2 rounded-2 px-2.5 text-left text-[12px] text-foreground hover:bg-surface-2",
                    FOCUS_RING,
                    "focus-visible:outline-offset-0",
                  )}
                >
                  {s.label}
                  <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {clock(s.at)}
                  </span>
                </button>
              ))}
            </motion.div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={publish}
          aria-disabled={blocked || undefined}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-[filter,opacity]",
            FOCUS_RING,
            blocked ? "cursor-not-allowed opacity-60" : "hover:brightness-105",
          )}
          style={{ backgroundColor: PIGMENT, color: ON_PIGMENT }}
        >
          {publishState === "publishing" ? (
            <LoaderCircle
              aria-hidden
              className="size-3.5 motion-safe:animate-spin"
            />
          ) : (
            <Send aria-hidden className="size-3.5" />
          )}
          <span className="grid">
            <span
              className={cn(
                "col-start-1 row-start-1",
                publishState === "publishing" && "invisible",
              )}
            >
              Publish
            </span>
            <span
              aria-hidden={publishState !== "publishing"}
              className={cn(
                "col-start-1 row-start-1",
                publishState !== "publishing" && "invisible",
              )}
            >
              Publishing
            </span>
          </span>
        </button>
      </div>
    </div>
  );

  const pageView = (
    <div className="flex flex-col gap-3">
      <div
        className="flex items-center gap-2 rounded-2 px-3 py-2 text-[12px] font-medium transition-colors duration-300"
        style={{
          color: STATE_COLOR[worstLive],
          backgroundColor: `color-mix(in oklab, ${STATE_COLOR[worstLive]} 11%, transparent)`,
          transitionDelay: wave ? "700ms" : "0ms",
        }}
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
        {BANNER[worstLive]}
      </div>

      <ul aria-label="Components" className="flex flex-col">
        {components.map((c) => {
          const state = liveOf(c.id);
          const pending = current.affected[c.id];
          const delay = wave?.delays[c.id];
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 border-b border-hairline py-1.5 last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] text-foreground">
                  {c.name}
                </span>
                {pending !== undefined && pending !== state ? (
                  <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-3">
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full border-[1.5px]"
                      style={{ borderColor: STATE_COLOR[pending] }}
                    />
                    <span className="truncate">
                      <span className="sr-only">Will change to </span>
                      <span aria-hidden>Next: </span>
                      {STATE_NAME[pending]}
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="inline-flex w-[7.5rem] shrink-0 items-center justify-end gap-1.5 text-[11px] text-ink-2">
                <span
                  className="text-right"
                  style={{
                    color: STATE_COLOR[state],
                    transition: `color 240ms ease ${Math.round((delay ?? 0) * 1000)}ms`,
                  }}
                >
                  {STATE_NAME[state]}
                </span>
                <span aria-hidden className="relative flex size-2 shrink-0">
                  {delay !== undefined && motionSafe && wave ? (
                    <motion.span
                      key={`ring-${wave.key}`}
                      className="absolute inset-0 rounded-full"
                      style={{ backgroundColor: STATE_COLOR[state] }}
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 2.6, opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.enter,
                        delay,
                      }}
                    />
                  ) : null}
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{
                      backgroundColor: STATE_COLOR[state],
                      transition: `background-color 240ms ease ${Math.round((delay ?? 0) * 1000)}ms`,
                    }}
                  />
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-foreground">
          {incident.title}
        </p>
        <ol aria-label="Updates" className="relative flex flex-col gap-2.5">
          {hasDraft ? (
            <motion.li
              key="ghost"
              style={{ originY: 0 }}
              animate={
                folding
                  ? { scaleY: 0.06, opacity: 0.35 }
                  : { scaleY: 1, opacity: 1 }
              }
              transition={{ duration: durations.fast, ease: easings.exit }}
              className={cn(
                "flex flex-col gap-1 rounded-2 border border-dashed px-3 py-2",
                publishState === "failed"
                  ? "border-[color-mix(in_oklab,var(--danger)_60%,transparent)] bg-[color-mix(in_oklab,var(--danger)_5%,transparent)]"
                  : "border-[color-mix(in_oklab,var(--sd-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--sd-accent)_5%,transparent)]",
              )}
            >
              <span className="flex items-center gap-2 text-[11px]">
                <span
                  className="font-medium"
                  style={{ color: PHASE_COLOR[current.phase] }}
                >
                  {PHASE_NAME[current.phase]}
                </span>
                <span className="rounded-full bg-surface-2 px-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink-3 uppercase">
                  {publishState === "publishing"
                    ? "Publishing"
                    : publishState === "failed"
                      ? "Not published"
                      : "Draft"}
                </span>
              </span>
              <span
                className={cn(
                  "text-[12px] leading-relaxed break-words",
                  ghostText ? "text-ink-2" : "text-ink-3 italic",
                )}
              >
                {ghostText || "Component changes only."}
              </span>
            </motion.li>
          ) : null}
          {updates.map((u) => {
            const isFresh = u.id === fresh;
            const stamped = !u.scheduled && u.id === latest?.id;
            return (
              <motion.li
                key={u.id}
                initial={
                  isFresh
                    ? { opacity: 0, y: motionSafe ? -distances.shift : 0 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  y: motionSafe ? springs.recoil : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
                className={cn(
                  "relative flex flex-col gap-1 rounded-2 px-3 py-2",
                  u.scheduled
                    ? "border border-dashed border-hairline-strong"
                    : "bg-surface-1 ring-1 ring-hairline",
                  stamped && stampStyle === "seal" && "pr-16",
                )}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                  <span
                    className="font-medium"
                    style={{ color: PHASE_COLOR[u.phase] }}
                  >
                    {PHASE_NAME[u.phase]}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-3 tabular-nums">
                    {u.scheduled ? (
                      <Clock aria-hidden className="size-3" />
                    ) : null}
                    {u.scheduled ? `Scheduled ${clock(u.at)}` : clock(u.at)}
                  </span>
                  {stamped && stampStyle !== "seal" ? (
                    <span className="ml-auto">
                      <Stamp
                        key={u.id}
                        style={stampStyle}
                        verb="Posted"
                        at={u.at}
                        fresh={isFresh}
                        motionSafe={motionSafe}
                      />
                    </span>
                  ) : null}
                </span>
                <span className="text-[12px] leading-relaxed break-words text-ink-2">
                  {u.text || "Component changes only."}
                </span>
                {stamped && stampStyle === "seal" ? (
                  <span className="absolute top-1.5 right-2">
                    <Stamp
                      key={u.id}
                      style="seal"
                      verb="Posted"
                      at={u.at}
                      fresh={isFresh}
                      motionSafe={motionSafe}
                    />
                  </span>
                ) : null}
              </motion.li>
            );
          })}
        </ol>
      </div>
    </div>
  );

  const freshMessage = !hasDraft && latest && latest.id === fresh;
  const sentStamp = (count: number | undefined, on: boolean) =>
    !hasDraft && latest && on ? (
      <Stamp
        key={latest.id}
        style={stampStyle}
        verb={`Sent ${grouped(count ?? 0)}`}
        at={latest.at}
        fresh={!!freshMessage}
        motionSafe={motionSafe}
      />
    ) : null;

  const emailView = (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-3 bg-card ring-1 ring-hairline",
        !emailOn && "opacity-60",
      )}
    >
      <div className="flex flex-col gap-1 border-b border-hairline px-3 py-2.5 text-[11px] text-ink-3">
        <span className="flex gap-2">
          <span className="w-12 shrink-0">From</span>
          <span className="truncate text-ink-2">{pageName}</span>
        </span>
        <span className="flex gap-2">
          <span className="w-12 shrink-0">To</span>
          <span className="truncate text-ink-2">
            {emailAudience && emailOn
              ? plural(emailAudience.count, "subscriber", "subscribers")
              : "Nobody: email is off"}
          </span>
        </span>
        <span className="flex gap-2">
          <span className="w-12 shrink-0">Subject</span>
          <span className="min-w-0 font-medium break-words text-foreground">
            {shown ? subject(shown.phase) : incident.title}
          </span>
        </span>
      </div>
      <div className="relative flex flex-col gap-2.5 px-3 py-3">
        <span className="absolute top-2 right-2">
          {sentStamp(emailAudience?.count, emailOn)}
        </span>
        <span className="text-[12px] leading-relaxed break-words text-ink-2">
          {shown?.text.trim() || "Component changes only."}
        </span>
        {(hasDraft ? changes.length : lastChanged.length) ? (
          <ul className="flex flex-col gap-1 rounded-2 bg-surface-1 px-2.5 py-2">
            {(hasDraft
              ? changes
              : components.filter((c) => lastChanged.includes(c.id))
            ).map((c) => {
              const s = hasDraft
                ? (current.affected[c.id] ?? liveOf(c.id))
                : liveOf(c.id);
              const delay = wave?.delays[c.id] ?? 0;
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-2 text-[11.5px] text-ink-2"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: STATE_COLOR[s],
                      transition: `background-color 240ms ease ${Math.round(delay * 1000)}ms`,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span style={{ color: STATE_COLOR[s] }}>{STATE_NAME[s]}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <span className="text-[10.5px] text-ink-3">
          View the status page · Unsubscribe
        </span>
      </div>
    </div>
  );

  const smsView = (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-3 bg-surface-1 px-3 py-4 ring-1 ring-hairline",
        !smsOn && "opacity-60",
      )}
    >
      <span className="self-center font-mono text-[10px] text-ink-3 tabular-nums">
        {pageName} · {clock(shown && !shown.draft && latest ? latest.at : now)}
      </span>
      <div className="relative max-w-[92%] self-start">
        <p className="rounded-[14px] rounded-bl-[4px] bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed break-words text-foreground">
          {sms}
        </p>
        <span className="absolute -right-3 -bottom-3">
          {sentStamp(smsAudience?.count, smsOn)}
        </span>
      </div>
      <span className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-3 tabular-nums">
        <span>
          <Rolling value={sms.length} motionSafe={motionSafe} /> / 160 ·{" "}
          {plural(smsParts(sms.length), "message", "messages")}
        </span>
        <span>
          {smsAudience && smsOn
            ? plural(smsAudience.count, "phone", "phones")
            : "Texts are off"}
        </span>
      </span>
    </div>
  );

  const preview = (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <span className="text-[11px] font-medium text-ink-3">
          As customers see it
        </span>
        <Segmented
          id={`${safeId}-mode`}
          label="Preview"
          options={MODES.map((m) => ({
            value: m.value,
            name: m.label,
            label: (
              <>
                <m.Icon aria-hidden className="size-3.5 shrink-0" />
                {m.label}
              </>
            ),
          }))}
          value={mode}
          onChange={chooseMode}
          motionSafe={motionSafe}
          disabled={false}
          className="grid-cols-3"
        />
      </div>
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain bg-surface-1 p-3 @min-[40rem]:p-4">
        {status === "error" ? (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] px-3 py-2"
          >
            <TriangleAlert
              aria-hidden
              className="size-4 shrink-0 text-danger"
            />
            <p className="min-w-0 flex-1 text-[12px] text-ink-2">
              Couldn&apos;t load the live page. Your draft is kept.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-3">
            <span className="h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
            {components.map((c) => (
              <span
                key={c.id}
                className="h-4 rounded-1 bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
            <span className="h-16 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ) : (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              opacity: { duration: durations.fast },
              y: motionSafe ? springs.glide : { duration: 0 },
            }}
            className="rounded-3 bg-card p-3 ring-1 ring-hairline"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-semibold text-foreground">
                {pageName}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                {mode === "page"
                  ? "Public page"
                  : mode === "email"
                    ? "Email"
                    : "Text message"}
              </span>
            </div>
            {mode === "page"
              ? pageView
              : mode === "email"
                ? emailView
                : smsView}
          </motion.div>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--sd-accent" as string]: accent }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <p id={titleId} className="truncate text-sm font-semibold">
            {incident.title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            Incident update · {pageName}
          </p>
        </div>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] text-ink-2">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{
              backgroundColor: PHASE_COLOR[latest?.phase ?? "investigating"],
            }}
          />
          {latest
            ? `${PHASE_NAME[latest.phase]} · ${clock(latest.at)}`
            : "Not posted"}
        </span>
      </header>

      <div
        role={narrow ? "tablist" : undefined}
        aria-label={narrow ? "Composer" : undefined}
        className="grid grid-cols-2 gap-0.5 border-b border-hairline bg-surface-1 p-1 @min-[40rem]:hidden"
      >
        {(["compose", "preview"] as const).map((t) => (
          <button
            key={t}
            ref={(node) => {
              if (node) tabRefs.current.set(t, node);
              else tabRefs.current.delete(t);
            }}
            type="button"
            role={narrow ? "tab" : undefined}
            id={`${safeId}-tab-${t}`}
            aria-selected={narrow ? tab === t : undefined}
            aria-controls={narrow ? `${safeId}-pane-${t}` : undefined}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = t === "compose" ? "preview" : "compose";
                setTab(next);
                tabRefs.current.get(next)?.focus();
              }
            }}
            className={cn(
              "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-2 text-[12px] transition-colors",
              FOCUS_RING,
              tab === t ? "font-medium text-foreground" : "text-ink-3",
            )}
          >
            {tab === t ? (
              <motion.span
                layoutId={`${safeId}-tab-pill`}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-2 bg-card ring-1 ring-hairline"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            {t === "compose" ? "Compose" : "Preview"}
            {t === "preview" && hasDraft ? (
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-(--sd-accent)"
              />
            ) : null}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <div
          id={`${safeId}-pane-compose`}
          role={narrow ? "tabpanel" : "group"}
          aria-labelledby={narrow ? `${safeId}-tab-compose` : undefined}
          aria-label={narrow ? undefined : "Compose"}
          className={cn(
            "min-w-0 flex-1 flex-col overflow-hidden @min-[40rem]:flex @min-[40rem]:border-r @min-[40rem]:border-hairline",
            tab === "compose" ? "flex" : "hidden",
          )}
        >
          {composer}
        </div>
        <div
          id={`${safeId}-pane-preview`}
          role={narrow ? "tabpanel" : "group"}
          aria-labelledby={narrow ? `${safeId}-tab-preview` : undefined}
          aria-label={narrow ? undefined : "Preview"}
          className={cn(
            "min-w-0 flex-1 flex-col overflow-hidden @min-[40rem]:flex",
            tab === "preview" ? "flex" : "hidden",
          )}
        >
          {preview}
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                           Component state radios                         */
/* ----------------------------------------------------------------------- */

/**
 * Four small segments, one per state, filled in the state's colour when
 * chosen. Small enough to sit beside the name at 258px; the state's name is
 * spelled out under the component, so colour is never the only signal.
 */
function StateRadios({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: StatusState;
  onChange: (state: StatusState) => void;
  disabled: boolean;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const at = STATES.indexOf(value);
  const go = (index: number) => {
    const i = (index + STATES.length) % STATES.length;
    const next = STATES[i];
    if (!next) return;
    if (!disabled) onChange(next);
    refs.current[i]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={`${name} state`}
      aria-disabled={disabled || undefined}
      className="flex shrink-0 items-center gap-0.5 @min-[22rem]:gap-1"
    >
      {STATES.map((s, index) => {
        const checked = index === at;
        return (
          <button
            key={s}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={STATE_NAME[s]}
            title={STATE_NAME[s]}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!disabled) onChange(s);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                go(index + 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                go(index - 1);
              }
            }}
            className={cn(
              "flex size-6 items-center justify-center rounded-2 transition-colors @min-[22rem]:size-7",
              FOCUS_RING,
              disabled
                ? "cursor-not-allowed"
                : "cursor-pointer hover:bg-surface-2",
            )}
          >
            <span
              aria-hidden
              className="block h-3 w-4 rounded-[3px] border-[1.5px] transition-colors"
              style={{
                borderColor: STATE_COLOR[s],
                backgroundColor: checked ? STATE_COLOR[s] : "transparent",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
