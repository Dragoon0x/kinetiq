"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Copy,
  KeyRound,
  LoaderCircle,
  Plus,
  RotateCcw,
  RotateCw,
  TriangleAlert,
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

/** One permission a token can carry, listed under its group. */
export type LockerScope = { id: string; label: string; group: string };

export type LockerToken = {
  id: string;
  name: string;
  /** Scope ids. */
  scopes: string[];
  /** Created, ms. */
  created: number;
  /** Last request made with it, ms, or null for never. */
  lastUsed: number | null;
  /** When it stops working, ms, or null for never. */
  expires: number | null;
  /** The last four characters: all a stored token ever shows again. */
  hint: string;
  /** When it was revoked, ms. Revoked tokens are listed under Revoked. */
  revoked?: number | null;
};

/** What the create form hands to `onCreate`. */
export type LockerDraft = {
  name: string;
  scopes: string[];
  /** Days until it expires, or null for never. */
  expiresInDays: number | null;
};

export type LockerStatus = "ready" | "loading" | "error";
export type LockerMaskStyle = "blur" | "dots" | "bars";
export type LockerDensity = "compact" | "regular" | "roomy";
export type LockerPalette = "cobalt" | "signal" | "amber" | "graphite";

/** What `onCreate` and `onRotate` may hand back: the new secret, or nothing. */
export type LockerSecret = string | void;

export type TokenLockerProps = {
  /** Seeds the tokens; the locker owns them after that and reports every change. @default defaultLockerTokens */
  tokens?: LockerToken[];
  /** The scopes on offer, grouped by `group`. @default defaultLockerScopes */
  scopes?: LockerScope[];
  /** Fires with every token after a create, rotate or revoke. */
  onTokensChange?: (tokens: LockerToken[]) => void;
  /** Create was confirmed. Return the new secret (or a promise of it); without one, a placeholder secret is minted. A rejection is reported in the form. */
  onCreate?: (draft: LockerDraft) => LockerSecret | Promise<LockerSecret>;
  /** Rotate was confirmed. Return the replacement secret, as for `onCreate`. */
  onRotate?: (token: LockerToken) => LockerSecret | Promise<LockerSecret>;
  /** Revoke was confirmed. May return a promise; a rejection leaves the token active and says so. */
  onRevoke?: (token: LockerToken) => void | Promise<unknown>;
  /** Now, ms, for "last used" and expiry. @default defaultLockerNow */
  now?: number;
  /** How long a new secret stays readable before it is masked for good, seconds. @default 30 */
  revealSeconds?: number;
  /** A token unused for this many days is flagged. @default 90 */
  staleDays?: number;
  /** Printed before every secret. @default "gw_live_" */
  prefix?: string;
  /** The workspace the tokens belong to. @default "Gaugeworks" */
  workspace?: string;
  /** Whether the tokens have loaded. @default "ready" */
  status?: LockerStatus;
  /** "Try again" was pressed after the tokens failed to load. */
  onRetry?: () => void;
  /** How a secret is hidden: blurred, dotted out, or redacted with bars. @default "blur" */
  maskStyle?: LockerMaskStyle;
  /** Row padding and type size. @default "regular" */
  density?: LockerDensity;
  /** The reveal panel, its ring and the primary buttons. @default "cobalt" */
  palette?: LockerPalette;
  /** The heading. @default "API tokens" */
  title?: string;
  /** Height of the locker, px; the list scrolls inside. @default 520 */
  height?: number;
  /** Create, rotate and revoke are inert; the locker dims. @default false */
  disabled?: boolean;
  /** Classes for the outer locker. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** Now on the seeded workspace: 12 October 2026, 09:00 UTC. */
export const defaultLockerNow = Date.UTC(2026, 9, 12, 9);

export const defaultLockerScopes: LockerScope[] = [
  { id: "gauges:read", label: "Read gauges", group: "Gauges" },
  { id: "gauges:write", label: "Edit gauges", group: "Gauges" },
  { id: "readings:read", label: "Read readings", group: "Readings" },
  { id: "readings:write", label: "Write readings", group: "Readings" },
  { id: "readings:delete", label: "Delete readings", group: "Readings" },
  { id: "workspace:members", label: "View members", group: "Workspace" },
  { id: "workspace:billing", label: "View billing", group: "Workspace" },
];

export const defaultLockerTokens: LockerToken[] = [
  {
    id: "ingest",
    name: "Ingest bot",
    scopes: ["readings:write", "gauges:read"],
    created: Date.UTC(2026, 5, 3),
    lastUsed: defaultLockerNow - 2 * 3_600_000,
    expires: Date.UTC(2027, 5, 3),
    hint: "3f9a",
  },
  {
    id: "dashboard",
    name: "Lobby dashboard",
    scopes: ["readings:read", "gauges:read"],
    created: Date.UTC(2026, 1, 14),
    lastUsed: defaultLockerNow - 3 * DAY,
    expires: null,
    hint: "a71c",
  },
  {
    id: "legacy",
    name: "Legacy importer",
    scopes: ["readings:write"],
    created: Date.UTC(2025, 10, 20),
    lastUsed: Date.UTC(2026, 4, 30),
    expires: Date.UTC(2026, 9, 20),
    hint: "0d2e",
  },
  {
    id: "billing",
    name: "Billing export",
    scopes: ["workspace:billing"],
    created: Date.UTC(2026, 8, 1),
    lastUsed: null,
    expires: Date.UTC(2026, 10, 30),
    hint: "c45b",
  },
  {
    id: "ci",
    name: "Old CI runner",
    scopes: ["gauges:read", "readings:read"],
    created: Date.UTC(2025, 2, 9),
    lastUsed: Date.UTC(2026, 7, 28),
    expires: null,
    hint: "77e0",
    revoked: Date.UTC(2026, 8, 2),
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

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

/** Dates by hand: a locale lookup in render would not survive hydration. */
const dateText = (ms: number) => {
  const t = new Date(ms);
  return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`;
};

const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

const usedText = (lastUsed: number | null, now: number) => {
  if (lastUsed === null) return "Never";
  const ms = Math.max(0, now - lastUsed);
  if (ms < 3_600_000) return "Just now";
  if (ms < DAY) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / DAY);
  if (days < 45) return `${days}d ago`;
  return `${Math.round(days / 30)} months ago`;
};

const expiryOf = (expires: number | null, now: number) => {
  if (expires === null) return { text: "No expiry", tone: "rest" as const };
  const days = Math.ceil((expires - now) / DAY);
  if (days <= 0) return { text: "Expired", tone: "danger" as const };
  if (days <= 14)
    return { text: `in ${plural(days, "day")}`, tone: "warn" as const };
  if (days <= 60) return { text: `in ${days} days`, tone: "rest" as const };
  return { text: dateText(expires), tone: "rest" as const };
};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GLYPHS = "▖▗▘▝▚▞░▒#%&*+=?@0123456789abcdef";

const hashOf = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** A placeholder secret, seeded — never a real credential. */
const mint = (prefix: string, seed: string) => {
  const rand = mulberry32(hashOf(seed));
  let body = "";
  for (let i = 0; i < 32; i += 1)
    body += ALPHABET[Math.floor(rand() * ALPHABET.length)] ?? "x";
  return `${prefix}${body}`;
};

const PALETTE: Record<LockerPalette, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const DENSITY: Record<
  LockerDensity,
  { row: string; name: string; meta: string; button: string; gap: string }
> = {
  compact: {
    row: "px-3.5 py-2.5",
    name: "text-[13px]",
    meta: "text-[11.5px]",
    button: "h-7 px-2.5",
    gap: "gap-2",
  },
  regular: {
    row: "px-4 py-3.5",
    name: "text-[13.5px]",
    meta: "text-[12px]",
    button: "h-8 px-3",
    gap: "gap-2.5",
  },
  roomy: {
    row: "px-5 py-5",
    name: "text-[14.5px]",
    meta: "text-[12.5px]",
    button: "h-9 px-3.5",
    gap: "gap-3",
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/** One column template for the heading row and every token row, so they line up. */
const GRID =
  "@min-[42rem]:grid @min-[42rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_6.5rem_7rem_9.75rem] @min-[42rem]:items-center @min-[42rem]:gap-x-4";

const EXPIRY_CHOICES: { days: number | null; label: string }[] = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: null, label: "Never" },
];

/* ----------------------------------------------------------------------- */
/*                                 Secret                                   */
/* ----------------------------------------------------------------------- */

type Phase = "resolving" | "shown" | "masking";

/**
 * The secret, one cell per character. Resolving runs a single rAF loop that
 * writes each cell's text node directly — cycling glyphs until its moment,
 * then the real character, left to right inside 600ms — and stops when the
 * last one lands. Masking is CSS: each cell's transition is delayed a
 * cascade step, so the mask sweeps across.
 */
function SecretCells({
  secret,
  phase,
  maskStyle,
  motionSafe,
  onResolved,
}: {
  secret: string;
  phase: Phase;
  maskStyle: LockerMaskStyle;
  motionSafe: boolean;
  onResolved: () => void;
}) {
  const cells = React.useRef<(HTMLSpanElement | null)[]>([]);
  const scrambles = React.useRef<(HTMLSpanElement | null)[]>([]);
  const chars = Array.from(secret);
  const step = Math.min(14, 520 / Math.max(1, chars.length));

  React.useEffect(() => {
    if (phase !== "resolving") return;
    if (!motionSafe) {
      onResolved();
      return;
    }
    let raf = 0;
    const start = performance.now();
    for (const cell of cells.current) if (cell) delete cell.dataset.landed;
    const tick = (t: number) => {
      const elapsed = t - start;
      const frame = Math.floor(elapsed / 45);
      let left = 0;
      for (let i = 0; i < chars.length; i += 1) {
        const cell = cells.current[i];
        if (!cell || cell.dataset.landed) continue;
        if (elapsed >= 60 + i * step) {
          cell.dataset.landed = "true";
        } else {
          left += 1;
          const glyph = scrambles.current[i];
          if (glyph)
            glyph.textContent =
              GLYPHS[(hashOf(`${i}:${frame}`) >>> 3) % GLYPHS.length] ?? "·";
        }
      }
      if (left > 0) raf = requestAnimationFrame(tick);
      else onResolved();
    };
    raf = requestAnimationFrame(tick);
    // A StrictMode rehearsal stops the loop; the second run starts it again
    // from the top, so the resolve always finishes.
    return () => cancelAnimationFrame(raf);
    // The loop belongs to one secret and one phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secret, motionSafe]);

  const resolving = phase === "resolving";
  const masked = phase === "masking";
  return (
    <span aria-hidden className="font-mono leading-[1.6] break-all">
      {chars.map((ch, i) => {
        const delay = masked ? `${Math.round(i * 12)}ms` : undefined;
        return (
          <span
            key={i}
            ref={(node) => {
              cells.current[i] = node;
            }}
            className="group/tl-cell relative inline-block"
          >
            {/* The real character: hidden until its moment, then it lands
                in the accent and settles to ink. */}
            <span
              className={cn(
                "inline-block transition-[filter,opacity,color] duration-300",
                resolving
                  ? "text-(--tl-accent) opacity-0 group-data-landed/tl-cell:text-foreground group-data-landed/tl-cell:opacity-100"
                  : "text-foreground",
                masked && maskStyle === "blur" && "opacity-60 blur-[4px]",
                masked && maskStyle !== "blur" && "opacity-0",
              )}
              style={{ transitionDelay: delay }}
            >
              {ch}
            </span>
            {resolving ? (
              <span
                ref={(node) => {
                  scrambles.current[i] = node;
                }}
                className="absolute inset-0 text-center text-ink-3 group-data-landed/tl-cell:hidden"
              />
            ) : null}
            {maskStyle === "dots" ? (
              <span
                className={cn(
                  "absolute inset-0 flex items-center justify-center text-ink-3 transition-opacity duration-200",
                  masked ? "opacity-100" : "opacity-0",
                )}
                style={{ transitionDelay: delay }}
              >
                •
              </span>
            ) : null}
            {maskStyle === "bars" ? (
              <span
                className={cn(
                  "absolute inset-x-0 top-[24%] bottom-[24%] origin-left bg-foreground transition-transform duration-200",
                  masked ? "scale-x-100" : "scale-x-0",
                )}
                style={{ transitionDelay: delay }}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

/** A stored token at rest: its prefix, a masked middle and the last four. */
function MaskedHint({
  prefix,
  hint,
  maskStyle,
  seed,
}: {
  prefix: string;
  hint: string;
  maskStyle: LockerMaskStyle;
  seed: string;
}) {
  const filler = mint("", seed).slice(0, 8);
  return (
    <span className="inline-flex items-center font-mono text-[11.5px] text-ink-3">
      <span>{prefix}</span>
      {maskStyle === "dots" ? (
        <span aria-hidden className="tracking-[0.12em]">
          ••••••••
        </span>
      ) : maskStyle === "bars" ? (
        <span
          aria-hidden
          className="mx-0.5 inline-block h-[0.6em] w-[6.5ch] rounded-[1px] bg-ink-3"
        />
      ) : (
        <span aria-hidden className="opacity-70 blur-[3px] select-none">
          {filler}
        </span>
      )}
      <span className="text-ink-2">{hint}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Countdown ring                             */
/* ----------------------------------------------------------------------- */

const RING_R = 8;
const RING_C = Number((2 * Math.PI * RING_R).toFixed(3));

function Countdown({
  progress,
  seconds,
}: {
  progress: MotionValue<number>;
  seconds: number;
}) {
  const offset = useTransform(progress, (p) =>
    Number((RING_C * (1 - p)).toFixed(3)),
  );
  const label = useTransform(progress, (p) => {
    const s = Math.max(0, Math.ceil(p * seconds));
    return `0:${String(s).padStart(2, "0")}`;
  });
  return (
    <span aria-hidden className="inline-flex items-center gap-1.5">
      <svg viewBox="0 0 20 20" className="size-5 -rotate-90">
        <circle
          cx={10}
          cy={10}
          r={RING_R}
          fill="none"
          strokeWidth={2}
          className="stroke-hairline-strong"
        />
        <motion.circle
          cx={10}
          cy={10}
          r={RING_R}
          fill="none"
          strokeWidth={2}
          strokeLinecap="round"
          stroke="var(--tl-accent)"
          strokeDasharray={RING_C}
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      <motion.span className="w-8 font-mono text-[11.5px] text-ink-2 tabular-nums">
        {label}
      </motion.span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Reveal = { id: string; secret: string; phase: Phase; n: number };
/** `n` keys each opening, so a confirm reopened mid-fold is a new node and takes focus. */
type Confirm = { id: string; kind: "rotate" | "revoke"; n: number };

/**
 * API tokens for one workspace. A new token is shown once: its characters
 * resolve in place, left to right, beside a Copy button (or C) and a ring that
 * drains over `revealSeconds` — paused while the pointer rests on it, while
 * the page is hidden or the panel is off screen — then the mask sweeps across
 * and the panel folds on `glide` to the ordinary row, which keeps only the
 * last four characters.
 *
 * Revoking strikes the name through on `flick` and, a beat later, the row
 * slides down into Revoked as one shared-layout move on `glide`. Rotate
 * reveals the replacement the same way. Scopes are grouped checkboxes under
 * tri-state group boxes; tokens unused for `staleDays` are flagged; narrow
 * lockers turn rows into cards.
 */
export function TokenLocker({
  tokens: tokensProp = defaultLockerTokens,
  scopes = defaultLockerScopes,
  onTokensChange,
  onCreate,
  onRotate,
  onRevoke,
  now = defaultLockerNow,
  revealSeconds = 30,
  staleDays = 90,
  prefix = "gw_live_",
  workspace = "Gaugeworks",
  status = "ready",
  onRetry,
  maskStyle = "blur",
  density = "regular",
  palette = "cobalt",
  title = "API tokens",
  height = 520,
  disabled = false,
  className,
}: TokenLockerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const accent = PALETTE[palette] ?? PALETTE.cobalt;

  const [tokens, setTokens] = React.useState<LockerToken[]>(tokensProp);
  const [creating, setCreating] = React.useState(false);
  const [formKey, setFormKey] = React.useState(0);
  const [draft, setDraft] = React.useState<LockerDraft>({
    name: "",
    scopes: ["readings:read"],
    expiresInDays: 90,
  });
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [reveal, setReveal] = React.useState<Reveal | null>(null);
  const [copied, setCopied] = React.useState<"idle" | "done" | "failed">(
    "idle",
  );
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [rowError, setRowError] = React.useState<{
    id: string;
    text: string;
  } | null>(null);
  const [striking, setStriking] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const counter = React.useRef(0);
  const latest = React.useRef(tokens);
  React.useEffect(() => {
    latest.current = tokens;
  });
  const timers = React.useRef<number[]>([]);
  const newButton = React.useRef<HTMLButtonElement | null>(null);
  const actionRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const [nameField, setNameField] = React.useState<HTMLInputElement | null>(
    null,
  );
  const [copyButton, setCopyButton] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [confirmButton, setConfirmButton] =
    React.useState<HTMLButtonElement | null>(null);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Focus is bound to the node when it arrives, never fired on a guess.
  React.useEffect(() => {
    nameField?.focus({ preventScroll: true });
  }, [nameField]);
  React.useEffect(() => {
    if (!copyButton) return;
    copyButton.focus({ preventScroll: true });
    // The new token's row is brought into view inside the locker only — the
    // page never scrolls.
    const box = scroller.current;
    const rowNode = copyButton.closest("li");
    if (!box || !rowNode) return;
    const top = Math.max(0, rowNode.offsetTop - 4);
    if (Math.abs(box.scrollTop - top) > 2)
      box.scrollTo({ top, behavior: motionSafe ? "smooth" : "auto" });
    // Only the arrival of a Copy button moves the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyButton]);
  React.useEffect(() => {
    confirmButton?.focus({ preventScroll: true });
  }, [confirmButton]);

  const commit = (next: LockerToken[]) => {
    setTokens(next);
    onTokensChange?.(next);
  };

  /* --- the countdown: one motion value, paused rather than restarted */
  const progress = useMotionValue(1);
  const countdown = React.useRef<AnimationPlaybackControls | null>(null);
  const hovering = React.useRef(false);
  const warned = React.useRef(false);
  const counting = reveal !== null && reveal.phase === "shown";

  const finishReveal = React.useCallback(() => {
    // Done may come before the last character has landed: it masks anyway.
    setReveal((r) =>
      r && r.phase !== "masking" ? { ...r, phase: "masking" } : r,
    );
  }, []);

  React.useEffect(() => {
    if (!counting) return;
    warned.current = false;
    const controls = animate(progress, 0, {
      duration: revealSeconds * Math.max(0, Math.min(1, progress.get())),
      ease: "linear",
      onUpdate: (p) => {
        if (!warned.current && p * revealSeconds <= 10 && revealSeconds > 12) {
          warned.current = true;
          setAnnouncement("Ten seconds until the token is hidden.");
        }
      },
      onComplete: finishReveal,
    });
    countdown.current = controls;
    if (hovering.current || document.hidden) controls.pause();
    const onVisibility = () => {
      if (document.hidden) controls.pause();
      else if (!hovering.current) controls.play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const panel = panelRef.current;
    const observer =
      panel && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            if (!entry) return;
            if (!entry.isIntersecting) controls.pause();
            else if (!hovering.current && !document.hidden) controls.play();
          })
        : null;
    if (panel && observer) observer.observe(panel);
    return () => {
      controls.stop();
      countdown.current = null;
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [counting, finishReveal, progress, revealSeconds]);

  // The mask sweeps, then the panel folds back into its row.
  React.useEffect(() => {
    if (reveal?.phase !== "masking") return;
    const len = reveal.secret.length;
    const id = window.setTimeout(
      () => {
        setReveal((r) => (r && r.n === reveal.n ? null : r));
        setCopied("idle");
        setAnnouncement(
          "The token is hidden now. Only its last four characters remain.",
        );
        actionRefs.current
          .get(`rotate-${reveal.id}`)
          ?.focus({ preventScroll: true });
      },
      motionSafe ? len * 12 + 420 : 60,
    );
    return () => window.clearTimeout(id);
  }, [motionSafe, reveal]);

  const startReveal = (id: string, secret: string) => {
    counter.current += 1;
    progress.jump(1);
    setCopied("idle");
    setReveal({
      id,
      secret,
      phase: motionSafe ? "resolving" : "shown",
      n: counter.current,
    });
  };

  const copy = async () => {
    if (!reveal || reveal.phase === "masking") return;
    try {
      await navigator.clipboard.writeText(reveal.secret);
      setCopied("done");
      setAnnouncement("Copied. Store it somewhere safe.");
    } catch {
      setCopied("failed");
      setAnnouncement(
        "Copy did not work. Select the token and copy it by hand.",
      );
    }
  };

  /* --- create */
  const groups = React.useMemo(() => {
    const out: { group: string; items: LockerScope[] }[] = [];
    for (const s of scopes) {
      const g = out.find((x) => x.group === s.group);
      if (g) g.items.push(s);
      else out.push({ group: s.group, items: [s] });
    }
    return out;
  }, [scopes]);

  const openForm = () => {
    if (disabled || status !== "ready") return;
    setFormError(null);
    setConfirm(null);
    counter.current += 1;
    setFormKey(counter.current);
    setCreating(true);
  };
  const closeForm = (refocus = true) => {
    setCreating(false);
    setNameField(null);
    setFormError(null);
    if (refocus) newButton.current?.focus({ preventScroll: true });
  };

  const submitCreate = async () => {
    if (busy) return;
    const name = draft.name.trim();
    if (!name) {
      setFormError("Name the token after where it will live.");
      nameField?.focus();
      return;
    }
    if (draft.scopes.length === 0) {
      setFormError("Give it at least one scope.");
      return;
    }
    setBusy("create");
    setFormError(null);
    try {
      counter.current += 1;
      const given = await onCreate?.({ ...draft, name });
      const secret =
        typeof given === "string" && given
          ? given
          : mint(prefix, `${name}:${counter.current}`);
      const id = `new-${counter.current}`;
      const token: LockerToken = {
        id,
        name,
        scopes: draft.scopes,
        created: now,
        lastUsed: null,
        expires:
          draft.expiresInDays === null ? null : now + draft.expiresInDays * DAY,
        hint: secret.slice(-4),
      };
      setBusy(null);
      commit([token, ...tokens]);
      setDraft({ name: "", scopes: ["readings:read"], expiresInDays: 90 });
      closeForm(false);
      startReveal(id, secret);
      setAnnouncement(
        `${name} created. Copy the token now: press C. It will not be shown again.`,
      );
    } catch (error) {
      setBusy(null);
      setFormError(
        `The token was not created.${error instanceof Error && error.message ? ` ${error.message}` : ""}`,
      );
    }
  };

  /* --- rotate and revoke */
  const runConfirm = async (token: LockerToken, kind: Confirm["kind"]) => {
    if (busy) return;
    setBusy(`${kind}-${token.id}`);
    setRowError(null);
    try {
      if (kind === "rotate") {
        counter.current += 1;
        const given = await onRotate?.(token);
        const secret =
          typeof given === "string" && given
            ? given
            : mint(prefix, `${token.id}:rotate:${counter.current}`);
        setBusy(null);
        setConfirm(null);
        setConfirmButton(null);
        commit(
          tokens.map((t) =>
            t.id === token.id
              ? { ...t, hint: secret.slice(-4), lastUsed: null }
              : t,
          ),
        );
        startReveal(token.id, secret);
        setAnnouncement(
          `${token.name} rotated. The old secret stopped working. Copy the new one now: press C.`,
        );
        return;
      }
      await onRevoke?.(token);
      setBusy(null);
      setConfirm(null);
      setConfirmButton(null);
      if (reveal?.id === token.id) setReveal(null);
      setStriking(token.id);
      // Focus moves on before the row leaves for Revoked.
      const active = tokens.filter((t) => !t.revoked && t.id !== token.id);
      const at = tokens
        .filter((t) => !t.revoked)
        .findIndex((t) => t.id === token.id);
      const nextFocus = active[Math.min(at, active.length - 1)];
      (nextFocus
        ? actionRefs.current.get(`rotate-${nextFocus.id}`)
        : newButton.current
      )?.focus({ preventScroll: true });
      later(
        () => {
          setStriking(null);
          commit(
            latest.current.map((t) =>
              t.id === token.id ? { ...t, revoked: now } : t,
            ),
          );
        },
        motionSafe ? 320 : 0,
      );
      setAnnouncement(
        `${token.name} revoked. Anything using it has lost access.`,
      );
    } catch (error) {
      setBusy(null);
      setRowError({
        id: token.id,
        text: `${token.name} was not ${kind === "rotate" ? "rotated" : "revoked"}; it still works.${error instanceof Error && error.message ? ` ${error.message}` : ""}`,
      });
    }
  };

  const active = tokens.filter((t) => !t.revoked);
  const revoked = tokens.filter((t) => t.revoked);
  const scopeLabel = (id: string) =>
    scopes.find((s) => s.id === id)?.label ?? id;

  const buttonClass = cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline-strong text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    d.button,
    FOCUS_RING,
  );
  const primaryClass = cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2 bg-(--tl-accent) text-[12px] font-medium text-background transition-opacity hover:opacity-90",
    d.button,
    FOCUS_RING,
  );

  const row = (token: LockerToken, isRevoked: boolean) => {
    const stale =
      !isRevoked && (token.lastUsed ?? token.created) < now - staleDays * DAY;
    const expiry = expiryOf(token.expires, now);
    const showing = reveal?.id === token.id ? reveal : null;
    const confirmingThis = confirm?.id === token.id ? confirm : null;
    const struck = isRevoked || striking === token.id;
    const nameId = `${uid}-name-${token.id}`;
    return (
      <motion.li
        key={token.id}
        layoutId={`${uid}-token-${token.id}`}
        layout={motionSafe ? "position" : false}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className={cn(
          "relative border-b border-hairline bg-card last:border-b-0",
          isRevoked && "bg-transparent",
        )}
      >
        <article
          aria-labelledby={nameId}
          className={cn("flex flex-col", d.gap, d.row, GRID)}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3
                id={nameId}
                className={cn(
                  "relative min-w-0 truncate font-medium",
                  d.name,
                  isRevoked ? "text-ink-3" : "text-foreground",
                )}
                title={token.name}
              >
                {token.name}
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 top-1/2 h-[1.5px] bg-current"
                  style={{ originX: 0 }}
                  initial={false}
                  animate={{ scaleX: struck ? 1 : 0 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </h3>
              {stale ? (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-[color-mix(in_oklab,var(--warn)_45%,transparent)] px-2 text-[10.5px] text-warn">
                  Unused {staleDays}+ days
                </span>
              ) : null}
              {showing ? (
                <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[color-mix(in_oklab,var(--tl-accent)_14%,transparent)] px-2 text-[10.5px] text-(--tl-accent)">
                  New
                </span>
              ) : null}
              {isRevoked ? (
                <span className="text-[11px] text-ink-3">
                  Revoked {dateText(token.revoked ?? now)}
                </span>
              ) : null}
            </div>
            <MaskedHint
              prefix={prefix}
              hint={token.hint}
              maskStyle={maskStyle}
              seed={token.id}
            />
          </div>

          <dl
            className={cn(
              "grid grid-cols-2 gap-x-4 gap-y-1.5 @min-[42rem]:contents",
              d.meta,
            )}
          >
            <div className="col-span-2 flex min-w-0 flex-col @min-[42rem]:col-span-1">
              <dt className="text-ink-3 @min-[42rem]:sr-only">Scopes</dt>
              <dd className="flex flex-wrap gap-1">
                {token.scopes.slice(0, 2).map((s) => (
                  <span
                    key={s}
                    className="inline-flex h-5 items-center rounded-1 bg-surface-2 px-1.5 font-mono text-[10.5px] text-ink-2"
                    title={scopeLabel(s)}
                  >
                    {s}
                  </span>
                ))}
                {token.scopes.length > 2 ? (
                  <span
                    className="inline-flex h-5 items-center px-1 font-mono text-[10.5px] text-ink-3"
                    title={token.scopes.slice(2).join(", ")}
                  >
                    +{token.scopes.length - 2}
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col">
              <dt className="text-ink-3 @min-[42rem]:sr-only">Last used</dt>
              <dd className={cn(stale ? "text-warn" : "text-ink-2")}>
                {usedText(token.lastUsed, now)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col">
              <dt className="text-ink-3 @min-[42rem]:sr-only">Expires</dt>
              <dd
                className={cn(
                  isRevoked
                    ? "text-ink-3"
                    : expiry.tone === "danger"
                      ? "text-danger"
                      : expiry.tone === "warn"
                        ? "text-warn"
                        : "text-ink-2",
                )}
              >
                {isRevoked ? "—" : expiry.text}
              </dd>
            </div>
          </dl>

          {isRevoked ? (
            <span className="hidden @min-[42rem]:block" />
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 @min-[42rem]:justify-end">
              <button
                ref={(node) => {
                  if (node) actionRefs.current.set(`rotate-${token.id}`, node);
                  else actionRefs.current.delete(`rotate-${token.id}`);
                }}
                type="button"
                aria-disabled={disabled || undefined}
                aria-label={`Rotate ${token.name}`}
                aria-expanded={confirmingThis?.kind === "rotate"}
                onClick={() => {
                  if (disabled) return;
                  setRowError(null);
                  counter.current += 1;
                  setConfirm(
                    confirmingThis?.kind === "rotate"
                      ? null
                      : { id: token.id, kind: "rotate", n: counter.current },
                  );
                }}
                className={cn(buttonClass, "flex-1 @min-[42rem]:flex-none")}
              >
                <RotateCw aria-hidden className="size-3.5" />
                Rotate
              </button>
              <button
                ref={(node) => {
                  if (node) actionRefs.current.set(`revoke-${token.id}`, node);
                  else actionRefs.current.delete(`revoke-${token.id}`);
                }}
                type="button"
                aria-disabled={disabled || undefined}
                aria-label={`Revoke ${token.name}`}
                aria-expanded={confirmingThis?.kind === "revoke"}
                onClick={() => {
                  if (disabled) return;
                  setRowError(null);
                  counter.current += 1;
                  setConfirm(
                    confirmingThis?.kind === "revoke"
                      ? null
                      : { id: token.id, kind: "revoke", n: counter.current },
                  );
                }}
                className={cn(
                  buttonClass,
                  "flex-1 hover:text-danger @min-[42rem]:flex-none",
                )}
              >
                Revoke
              </button>
            </div>
          )}
        </article>

        <AnimatePresence initial={false}>
          {confirmingThis || rowError?.id === token.id ? (
            <motion.div
              key={confirmingThis ? `confirm-${confirmingThis.n}` : "error"}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.base),
              }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
              className="overflow-hidden"
            >
              <div
                role="group"
                aria-label={
                  confirmingThis?.kind === "rotate"
                    ? "Confirm rotate"
                    : "Confirm revoke"
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    const kind = confirm?.kind ?? "revoke";
                    setConfirm(null);
                    setConfirmButton(null);
                    actionRefs.current
                      .get(`${kind}-${token.id}`)
                      ?.focus({ preventScroll: true });
                  }
                }}
                className={cn(
                  "mx-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-hairline-strong bg-surface-1 px-3 py-2.5",
                )}
              >
                <p className="min-w-0 flex-1 basis-48 text-[12.5px] leading-snug text-ink-2">
                  {rowError?.id === token.id ? (
                    <span className="text-danger">{rowError.text}</span>
                  ) : confirmingThis?.kind === "rotate" ? (
                    <>
                      Rotate{" "}
                      <span className="text-foreground">{token.name}</span>? The
                      current secret stops working now.
                    </>
                  ) : (
                    <>
                      Revoke{" "}
                      <span className="text-foreground">{token.name}</span>?
                      Anything using it loses access now.
                    </>
                  )}
                </p>
                {confirmingThis ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirm(null);
                        setConfirmButton(null);
                        actionRefs.current
                          .get(`${confirmingThis.kind}-${token.id}`)
                          ?.focus({ preventScroll: true });
                      }}
                      className={buttonClass}
                    >
                      Cancel
                    </button>
                    <button
                      ref={setConfirmButton}
                      type="button"
                      aria-busy={
                        busy === `${confirmingThis.kind}-${token.id}` ||
                        undefined
                      }
                      onClick={() =>
                        void runConfirm(token, confirmingThis.kind)
                      }
                      className={cn(
                        confirmingThis.kind === "revoke"
                          ? cn(
                              "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2 bg-danger text-[12px] font-medium text-destructive-foreground hover:opacity-90",
                              d.button,
                              FOCUS_RING,
                            )
                          : primaryClass,
                      )}
                    >
                      {busy === `${confirmingThis.kind}-${token.id}` ? (
                        <LoaderCircle
                          aria-hidden
                          className="size-3.5 motion-safe:animate-spin"
                        />
                      ) : null}
                      {confirmingThis.kind === "rotate" ? "Rotate" : "Revoke"}
                    </button>
                  </span>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {showing ? (
            <motion.div
              key={`reveal-${showing.n}`}
              ref={panelRef}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.slow),
              }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base },
              }}
              className="overflow-hidden"
              onPointerEnter={() => {
                hovering.current = true;
                countdown.current?.pause();
              }}
              onPointerLeave={() => {
                hovering.current = false;
                if (!document.hidden) countdown.current?.play();
              }}
            >
              <div className="mx-3 mb-3 flex flex-col gap-2.5 rounded-2 border border-[color-mix(in_oklab,var(--tl-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--tl-accent)_7%,var(--card))] px-3 py-3">
                <p className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  <KeyRound
                    aria-hidden
                    className="size-3.5 shrink-0 text-(--tl-accent)"
                  />
                  Copy it now. You won’t see it again.
                </p>
                <div className="rounded-2 border border-hairline bg-card px-2.5 py-2 text-[12.5px]">
                  <SecretCells
                    key={showing.n}
                    secret={showing.secret}
                    phase={showing.phase}
                    maskStyle={maskStyle}
                    motionSafe={motionSafe}
                    onResolved={() =>
                      setReveal((r) =>
                        r && r.n === showing.n && r.phase === "resolving"
                          ? { ...r, phase: "shown" }
                          : r,
                      )
                    }
                  />
                  {showing.phase !== "masking" ? (
                    <span className="sr-only">{showing.secret}</span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    ref={setCopyButton}
                    type="button"
                    onClick={() => void copy()}
                    aria-keyshortcuts="C"
                    className={primaryClass}
                  >
                    {copied === "done" ? (
                      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
                        <motion.path
                          d="M3.5 8.5 6.5 11.5 12.5 4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={{ pathLength: motionSafe ? 0 : 1 }}
                          animate={{ pathLength: 1 }}
                          transition={
                            motionSafe ? springs.flick : { duration: 0 }
                          }
                        />
                      </svg>
                    ) : (
                      <Copy aria-hidden className="size-3.5" />
                    )}
                    {copied === "done" ? "Copied" : "Copy"}
                    <kbd className="ml-0.5 rounded-[4px] border border-current/30 px-1 font-mono text-[10px] opacity-80">
                      C
                    </kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      countdown.current?.stop();
                      finishReveal();
                    }}
                    className={buttonClass}
                  >
                    Done
                  </button>
                  <span className="ml-auto flex items-center gap-2">
                    {copied === "failed" ? (
                      <span className="text-[11.5px] text-danger">
                        Copy did not work. Select it by hand.
                      </span>
                    ) : null}
                    <Countdown progress={progress} seconds={revealSeconds} />
                  </span>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.li>
    );
  };

  const body = () => {
    if (status === "loading") {
      return (
        <ul aria-busy="true" aria-label="Loading tokens">
          {Array.from({ length: 4 }, (_, i) => (
            <li
              key={i}
              aria-hidden
              className={cn(
                "flex flex-col gap-2 border-b border-hairline",
                d.row,
              )}
            >
              <span
                className="h-3 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${30 + ((i * 19) % 30)}%` }}
              />
              <span className="h-2.5 w-40 rounded-full bg-surface-2" />
            </li>
          ))}
        </ul>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <TriangleAlert aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">Tokens did not load.</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className={buttonClass}>
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    return (
      <LayoutGroup id={uid}>
        {active.length === 0 && !creating ? (
          // Auto margins centre it in the list and stay safe if it overflows.
          <div className="my-auto flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-surface-2">
              <KeyRound aria-hidden className="size-4.5 text-ink-2" />
            </span>
            <p className="text-[13.5px] font-medium">No active tokens</p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-3">
              Tokens let scripts and services read and write {workspace} data
              without anyone’s password. Each one carries only the scopes you
              give it, and you can revoke it at any time.
            </p>
            <button type="button" onClick={openForm} className={primaryClass}>
              <Plus aria-hidden className="size-3.5" />
              Create a token
            </button>
          </div>
        ) : null}
        {active.length > 0 ? (
          <section aria-label="Active tokens" className="shrink-0">
            <div
              aria-hidden
              className={cn(
                "hidden border-b border-hairline px-4 py-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
                GRID,
              )}
            >
              <span>Token</span>
              <span>Scopes</span>
              <span>Last used</span>
              <span>Expires</span>
              <span />
            </div>
            <ul role="list">{active.map((t) => row(t, false))}</ul>
          </section>
        ) : null}
        {revoked.length > 0 ? (
          <section aria-labelledby={`${uid}-revoked`} className="mt-1 shrink-0">
            <h3
              id={`${uid}-revoked`}
              className="flex items-center gap-2 border-y border-hairline bg-surface-1 px-4 py-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              Revoked
              <motion.span
                key={revoked.length}
                initial={{ y: motionSafe ? distances.nudge : 0, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
                className="tabular-nums"
              >
                {revoked.length}
              </motion.span>
            </h3>
            <ul role="list" className="opacity-80">
              {revoked.map((t) => row(t, true))}
            </ul>
          </section>
        ) : null}
      </LayoutGroup>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (
          (event.key === "c" || event.key === "C") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          reveal &&
          reveal.phase !== "masking"
        ) {
          const el = event.target as HTMLElement;
          if (el.closest("input, textarea, [contenteditable=true]")) return;
          event.preventDefault();
          void copy();
        }
      }}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--tl-accent" as string]: accent }}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 pt-3.5 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <p className="text-[12px] text-ink-3">
            {workspace} · {plural(active.length, "active token")}
            {revoked.length ? ` · ${revoked.length} revoked` : ""}
          </p>
        </div>
        <button
          ref={newButton}
          type="button"
          aria-expanded={creating}
          aria-disabled={disabled || status !== "ready" || undefined}
          onClick={() => (creating ? closeForm() : openForm())}
          className={creating ? buttonClass : primaryClass}
        >
          <Plus
            aria-hidden
            className={cn(
              "size-3.5 transition-transform",
              creating && "rotate-45",
            )}
          />
          {creating ? "Close" : "New token"}
        </button>
      </header>

      <div
        ref={scroller}
        className="relative flex flex-1 [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain"
      >
        <AnimatePresence initial={false}>
          {creating ? (
            <motion.div
              key={`create-${formKey}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.base),
              }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              className="shrink-0 overflow-hidden border-b border-hairline bg-surface-1"
            >
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitCreate();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeForm();
                  }
                }}
                className="flex flex-col gap-3.5 px-4 py-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`${uid}-new-name`}
                    className="text-[12px] font-medium text-ink-2"
                  >
                    Name
                  </label>
                  <input
                    ref={setNameField}
                    id={`${uid}-new-name`}
                    value={draft.name}
                    onChange={(event) => {
                      const name = event.currentTarget.value;
                      setDraft((v) => ({ ...v, name }));
                    }}
                    placeholder="e.g. Weather station sync"
                    autoComplete="off"
                    aria-invalid={formError?.startsWith("Name") || undefined}
                    aria-describedby={
                      formError ? `${uid}-form-error` : undefined
                    }
                    className="h-9 w-full max-w-md rounded-2 border border-input bg-card px-3 text-[13px] text-foreground outline-none placeholder:text-ink-3 focus-visible:border-(--tl-accent) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--tl-accent) focus-visible:outline-solid"
                  />
                </div>
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 text-[12px] font-medium text-ink-2">
                    Expires
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPIRY_CHOICES.map((c) => (
                      <label
                        key={c.label}
                        className={cn(
                          "inline-flex h-8 cursor-pointer items-center rounded-2 border px-3 text-[12px] transition-colors select-none",
                          draft.expiresInDays === c.days
                            ? "border-(--tl-accent) bg-[color-mix(in_oklab,var(--tl-accent)_10%,var(--card))] text-foreground"
                            : "border-hairline bg-card text-ink-2 hover:border-hairline-strong",
                          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-solid",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${uid}-expiry`}
                          checked={draft.expiresInDays === c.days}
                          onChange={() =>
                            setDraft((v) => ({ ...v, expiresInDays: c.days }))
                          }
                          className="sr-only"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-1 gap-3 @min-[34rem]:grid-cols-3">
                  {groups.map(({ group, items }) => {
                    const on = items.filter((s) =>
                      draft.scopes.includes(s.id),
                    ).length;
                    const all = on === items.length;
                    const some = on > 0 && !all;
                    return (
                      <fieldset
                        key={group}
                        className="flex flex-col gap-1.5 rounded-2 border border-hairline bg-card px-3 py-2.5"
                      >
                        <legend className="sr-only">{group}</legend>
                        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium select-none">
                          <input
                            type="checkbox"
                            checked={all}
                            ref={(node) => {
                              if (node) node.indeterminate = some;
                            }}
                            onChange={() =>
                              setDraft((v) => ({
                                ...v,
                                scopes: all
                                  ? v.scopes.filter(
                                      (s) => !items.some((i) => i.id === s),
                                    )
                                  : [
                                      ...v.scopes,
                                      ...items
                                        .map((i) => i.id)
                                        .filter((id) => !v.scopes.includes(id)),
                                    ],
                              }))
                            }
                            className="size-3.5 accent-(--tl-accent)"
                          />
                          {group}
                          <span className="ml-auto font-mono text-[10.5px] text-ink-3 tabular-nums">
                            {on}/{items.length}
                          </span>
                        </label>
                        {items.map((s) => (
                          <label
                            key={s.id}
                            className="flex cursor-pointer items-center gap-2 pl-5 text-[12px] text-ink-2 select-none"
                          >
                            <input
                              type="checkbox"
                              checked={draft.scopes.includes(s.id)}
                              onChange={() =>
                                setDraft((v) => ({
                                  ...v,
                                  scopes: v.scopes.includes(s.id)
                                    ? v.scopes.filter((x) => x !== s.id)
                                    : [...v.scopes, s.id],
                                }))
                              }
                              className="size-3.5 accent-(--tl-accent)"
                            />
                            {s.label}
                          </label>
                        ))}
                      </fieldset>
                    );
                  })}
                </div>
                {formError ? (
                  <p
                    id={`${uid}-form-error`}
                    role="alert"
                    className="text-[12px] text-danger"
                  >
                    {formError}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => closeForm()}
                    className={buttonClass}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    aria-busy={busy === "create" || undefined}
                    className={primaryClass}
                  >
                    {busy === "create" ? (
                      <LoaderCircle
                        aria-hidden
                        className="size-3.5 motion-safe:animate-spin"
                      />
                    ) : null}
                    {busy === "create" ? "Creating…" : `Create token`}
                  </button>
                </div>
              </form>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {body()}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
