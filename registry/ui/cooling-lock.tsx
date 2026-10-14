"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
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

export type CoolingLockGlyph = "padlock" | "shield" | "ring";
export type CoolingLockDensity = "compact" | "cozy" | "roomy";
export type CoolingLockTone = "warn" | "danger" | "ink";
export type CoolingLockStatus = "ready" | "loading" | "error";
/** Where the card stands: counting down, open for another try, waiting on that try, or signed in. */
export type CoolingLockPhase = "locked" | "open" | "trying" | "signed";

export type CoolingLockCredentials = { email: string; password: string };

/** What a retry came back with; `message` is shown when it failed. */
export type CoolingLockResult = { ok: boolean; message?: string };

/** The lock: when it lifts, in ms (null when there is none), and the attempts used. */
export type CoolingLockValue = { until: number | null; attempts: number };

export type CoolingLockChange = {
  /** The countdown ran out, a failed retry locked the card again, or a retry signed in. */
  kind: "unlock" | "relock" | "signin";
  /** The failed retry's message, on a relock. */
  message?: string;
};

export type CoolingLockProps = {
  /** The glyph that cools and opens: a padlock, a shield with a latch, or a ring that parts. @default "padlock" */
  glyph?: CoolingLockGlyph;
  /** Padding, glyph size and digit size. @default "cozy" */
  density?: CoolingLockDensity;
  /** The warm wash's colour: amber, red or ink. @default "warn" */
  tone?: CoolingLockTone;
  /** Controlled: when the lockout lifts, in ms; null when there is no lockout. */
  until?: number | null;
  /** Initial lift time when uncontrolled. @default defaultCoolingLockUntil */
  defaultUntil?: number | null;
  /** Controlled: the attempts used so far. */
  attempts?: number;
  /** Initial attempts when uncontrolled. @default 3 */
  defaultAttempts?: number;
  /** How many attempts there are in all; one dot each. @default 5 */
  maxAttempts?: number;
  /** The moment the countdown reads from, in ms; never taken from the clock. @default defaultCoolingLockNow */
  now?: number;
  /** A full lockout's length, in ms: the wash is warmest with this long to go, and a failed retry locks for this long. @default 60000 */
  lockout?: number;
  /** Count the seconds between `now` updates while the card is locked, visible and on screen. @default true */
  live?: boolean;
  /** Fires when the countdown runs out, a failed retry locks the card again, or a retry signs in. */
  onChange?: (value: CoolingLockValue, change: CoolingLockChange) => void;
  /** Try again was pressed: resolves with whether the credentials signed in. @default simulateCoolingLockRetry */
  onRetry?: (credentials: CoolingLockCredentials) => Promise<CoolingLockResult>;
  /** "Reset password instead" was pressed. */
  onReset?: () => void;
  /** "Contact support" was pressed. */
  onSupport?: () => void;
  /** The email the fields come back with. @default defaultCoolingLockEmail */
  defaultEmail?: string;
  /** A line under the fields, e.g. what the simulator accepts. */
  hint?: string;
  /** Whether the lock's state has arrived: a skeleton while loading, a retry when it failed. @default "ready" */
  status?: CoolingLockStatus;
  /** Retry was pressed after the lock's state failed to load. */
  onReload?: () => void;
  /** The product line above the card. @default "Fieldline sign-in" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the card in px; its body scrolls inside it. @default 320 */
  height?: number;
  /** Read only: nothing can be typed or pressed. The countdown still runs. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const SEC = 1000;
const MIN = 60 * SEC;

/** Monday 12 October 2026, 09:14 UTC. */
export const defaultCoolingLockNow = Date.UTC(2026, 9, 12, 9, 14);

/** Forty-two seconds of a one-minute lockout still to go. */
export const defaultCoolingLockUntil = defaultCoolingLockNow + 42 * SEC;

export const defaultCoolingLockEmail = "ines.varga@fieldline.example";

/**
 * The stand-in for a sign-in call: after a short wait, any password of eight
 * characters or more signs in and anything shorter is wrong.
 */
export const simulateCoolingLockRetry = ({
  password,
}: CoolingLockCredentials): Promise<CoolingLockResult> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        password.length >= 8
          ? { ok: true }
          : { ok: false, message: "That password is not right." },
      );
    }, 900);
  });

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LINK =
  "inline-flex items-center gap-1 rounded-1 text-[12px] text-ink-2 underline decoration-hairline-strong underline-offset-3 transition-colors hover:text-foreground hover:decoration-current";

const TONES: Record<CoolingLockTone, string> = {
  warn: "var(--warn)",
  danger: "var(--danger)",
  ink: "var(--ink-2)",
};

const DENSITY: Record<
  CoolingLockDensity,
  { pad: string; gap: string; disc: number; digits: number; field: string }
> = {
  compact: { pad: "p-3", gap: "gap-2.5", disc: 44, digits: 24, field: "h-8" },
  cozy: { pad: "p-4", gap: "gap-3", disc: 56, digits: 30, field: "h-9" },
  roomy: { pad: "p-5", gap: "gap-4", disc: 68, digits: 36, field: "h-10" },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.15;
/** The digits roll, rather than swap, inside this many seconds. */
const ROLL_FROM = 10;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

/** Whole seconds left, never rounding a sliver down to zero early. */
const secondsLeft = (ms: number) => Math.max(0, Math.ceil(ms / SEC));

/** "04:52" for the digits. */
const clockText = (ms: number) => {
  const s = secondsLeft(ms);
  const m = Math.floor(s / 60);
  return `${String(Math.min(99, m)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** "4 minutes 52 seconds" for a sentence. */
export const phraseCoolingLock = (ms: number) => {
  const s = secondsLeft(ms);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  if (rest > 0 || m === 0)
    parts.push(`${rest} ${rest === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  text,
  roll,
  size,
  className,
}: {
  text: string;
  /** Roll to the new digit on `snap`; otherwise it swaps in place. */
  roll: boolean;
  /** Font size in px. */
  size: number;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{
        fontSize: size,
        height: `${DIGIT_H}em`,
        lineHeight: `${DIGIT_H}em`,
      }}
    >
      {chars.map((char, i) => {
        const key = chars.length - i;
        const digit = DIGITS.indexOf(char);
        if (digit < 0) {
          return (
            <span key={key} className="inline-block" style={{ width: "0.6ch" }}>
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(digit * DIGIT_H)}em` }}
              transition={roll ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Glyphs                                  */
/* ----------------------------------------------------------------------- */

type GlyphProps = { open: boolean; motionSafe: boolean };

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A padlock whose shackle lifts and swings aside on `snap`. */
function Padlock({ open, motionSafe }: GlyphProps) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-[55%]">
      <motion.path
        d="M11 14 V10 a5 5 0 0 1 10 0 V14"
        {...STROKE}
        style={{ transformBox: "fill-box", transformOrigin: "100% 100%" }}
        initial={false}
        animate={{ rotate: open ? -28 : 0, y: open ? -2.5 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
      <rect
        x="7.5"
        y="14"
        width="17"
        height="13"
        rx="3"
        fill="color-mix(in oklab, currentColor 12%, transparent)"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <motion.circle
        cx="16"
        cy="20"
        r="1.7"
        fill="currentColor"
        initial={false}
        animate={{ rotate: open ? 90 : 0 }}
        style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
      <motion.path
        d="M16 21.5 V24"
        {...STROKE}
        initial={false}
        animate={{ rotate: open ? 90 : 0 }}
        style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </svg>
  );
}

/** A shield whose latch slides out on `snap`, leaving the keyhole open. */
function Shield({ open, motionSafe }: GlyphProps) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-[58%]">
      <path
        d="M16 4 L26 8 V15 c0 6.5 -4.2 11 -10 13 c-5.8 -2 -10 -6.5 -10 -13 V8 Z"
        {...STROKE}
        fill="color-mix(in oklab, currentColor 10%, transparent)"
      />
      <motion.circle
        cx="16"
        cy="14.5"
        r="2.2"
        initial={false}
        animate={{ scale: open ? 1.25 : 1 }}
        style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <motion.path
        d="M10.5 19.5 H21.5"
        {...STROKE}
        initial={false}
        animate={{ x: open ? 9 : 0, opacity: open ? 0 : 1 }}
        transition={
          motionSafe
            ? { x: springs.snap, opacity: { duration: durations.fast } }
            : { x: { duration: 0 }, opacity: { duration: durations.fast } }
        }
      />
    </svg>
  );
}

/** A ring that parts at the top on `snap`, like a carabiner's gate. */
function Ring({ open, motionSafe }: GlyphProps) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-[58%]">
      <motion.circle
        cx="16"
        cy="16"
        r="10.5"
        {...STROKE}
        initial={false}
        animate={{ pathLength: open ? 0.82 : 1, rotate: open ? -140 : -90 }}
        style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
        transition={
          motionSafe
            ? { pathLength: springs.snap, rotate: springs.snap }
            : { duration: 0 }
        }
      />
      <motion.circle
        cx="16"
        cy="16"
        r="2.4"
        fill="currentColor"
        initial={false}
        animate={{ scale: open ? 0.6 : 1 }}
        style={{ transformBox: "fill-box", transformOrigin: "50% 50%" }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </svg>
  );
}

/** The check that draws on `flick` once a retry has signed in. */
function Done({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-[55%]">
      <motion.path
        d="M8 16.5 L13.5 22 L24 10.5"
        {...STROKE}
        strokeWidth={2.6}
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

const GLYPHS: Record<CoolingLockGlyph, (props: GlyphProps) => React.ReactNode> =
  {
    padlock: Padlock,
    shield: Shield,
    ring: Ring,
  };

/* ----------------------------------------------------------------------- */
/*                                   Disc                                   */
/* ----------------------------------------------------------------------- */

function Disc({
  glyph,
  phase,
  warmth,
  rising,
  size,
  motionSafe,
}: {
  glyph: CoolingLockGlyph;
  phase: CoolingLockPhase;
  warmth: number;
  /** The wash just got warmer (another failed attempt): it fills quickly rather than cooling slowly. */
  rising: boolean;
  size: number;
  motionSafe: boolean;
}) {
  const Glyph = GLYPHS[glyph];
  const open = phase !== "locked";
  const signed = phase === "signed";
  const wash = {
    duration: rising ? durations.slow : 1,
    ease: rising ? easings.enter : easings.linear,
  } as const;
  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* The glow outside the disc; the wash inside it. Both read the
          same warmth, which cools over the lockout. */}
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={{
          inset: -Math.round(size * 0.16),
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--cl-warm) 32%, transparent), transparent)",
        }}
        initial={false}
        animate={{ opacity: warmth }}
        transition={wash}
      />
      <span
        className={cn(
          "absolute inset-0 rounded-full border transition-colors duration-300",
          signed
            ? "border-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[color-mix(in_oklab,var(--success)_14%,var(--bg-2))]"
            : "border-hairline bg-surface-2",
        )}
      />
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-[color-mix(in_oklab,var(--cl-warm)_34%,transparent)]"
        initial={false}
        animate={{ opacity: warmth }}
        transition={wash}
      />
      <span
        className={cn(
          "relative flex size-full items-center justify-center transition-colors duration-300",
          signed ? "text-success" : open ? "text-cobalt-bright" : "text-ink",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {signed ? (
            <motion.span
              key="done"
              className="flex size-full items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              <Done motionSafe={motionSafe} />
            </motion.span>
          ) : (
            <motion.span
              key="lock"
              className="flex size-full items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              <Glyph open={open} motionSafe={motionSafe} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Dots                                   */
/* ----------------------------------------------------------------------- */

function Dots({
  attempts,
  max,
  live,
  motionSafe,
}: {
  attempts: number;
  max: number;
  /** True after mount: a dot that fills later lands; one filled at mount just is. */
  live: boolean;
  motionSafe: boolean;
}) {
  const n = Math.max(1, Math.min(12, max));
  const step = cascade(n);
  return (
    <span
      role="img"
      aria-label={`${Math.min(n, attempts)} of ${n} attempts used`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: n }, (_, i) => {
        const filled = i < attempts;
        return (
          <motion.span
            // The key changes with the fill, so a dot that just filled
            // mounts afresh and lands on recoil.
            key={`${i}-${filled ? "on" : "off"}`}
            aria-hidden
            className={cn(
              "block size-2 rounded-full border",
              filled
                ? "border-transparent bg-danger"
                : "border-hairline-strong bg-transparent",
            )}
            initial={
              live && filled && motionSafe
                ? { scale: 0.3, opacity: 0.4 }
                : false
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe
                ? { ...springs.recoil, delay: r3(i * step * 0.25) }
                : { duration: durations.fast }
            }
          />
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A sign-in card that has locked after too many attempts. The glyph sits in
 * a disc washed warm, and the wash cools over the lockout: its opacity is
 * the time left as a share of the whole lockout, re-tweened each second on a
 * linear second so it fades without a step. The digits beside it count down;
 * for most of the wait they swap in place, and inside the last ten seconds
 * each column rolls to its next face on `springs.snap`. Under the digits the
 * attempts sit as a row of dots, the used ones red.
 *
 * At zero the lock clicks open on `springs.snap` (the shackle lifts, the
 * latch slides out, the ring parts) and the sign-in fields return, landing
 * from above on `springs.recoil` while the countdown fades out. Try again
 * resolves through `onRetry`: a success draws a check on `springs.flick`
 * and the disc turns green; a failure locks the card again for a full
 * lockout, the wash filling back on an enter tween and a new dot landing on
 * `springs.recoil`. A host can do the same from outside by moving `until`
 * and `attempts`.
 *
 * The countdown reads against `now` and counts its own seconds only while
 * the card is locked, the tab is visible and the root is on screen; nothing
 * runs once the lock is open. The digits are a `role="timer"` that never
 * announces; a status line speaks at one minute, at the opening, on each
 * failed attempt and on signing in. The fields, Try again and both links are
 * ordinary form controls in tab order, Enter submits, and when the lock opens
 * with focus inside the card it moves to the password field. Under reduced
 * motion nothing swings, rolls or lands: the glyph cross-fades to its open
 * form, the digits swap, and the fields fade in.
 */
export function CoolingLock({
  glyph = "padlock",
  density = "cozy",
  tone = "warn",
  until: untilProp,
  defaultUntil = defaultCoolingLockUntil,
  attempts: attemptsProp,
  defaultAttempts = 3,
  maxAttempts = 5,
  now = defaultCoolingLockNow,
  lockout = MIN,
  live = true,
  onChange,
  onRetry = simulateCoolingLockRetry,
  onReset,
  onSupport,
  defaultEmail = defaultCoolingLockEmail,
  hint,
  status = "ready",
  onReload,
  title = "Fieldline sign-in",
  label,
  height = 320,
  disabled = false,
  className,
}: CoolingLockProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const emailId = `${uid}-email`;
  const passwordId = `${uid}-password`;
  const hintId = `${uid}-hint`;
  const failId = `${uid}-fail`;

  const [own, setOwn] = React.useState<CoolingLockValue>({
    until: defaultUntil,
    attempts: defaultAttempts,
  });
  const until = untilProp === undefined ? own.until : untilProp;
  const attempts = Math.max(0, attemptsProp ?? own.attempts);
  const max = Math.max(1, maxAttempts);
  const lockoutMs = Math.max(SEC, lockout);

  const [offset, setOffset] = React.useState({ base: now, ms: 0 });
  const [done, setDone] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState(defaultEmail);
  const [password, setPassword] = React.useState("");
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so a dot already filled on
  // the page never lands; true for dots that fill later.
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const passwordRef = React.useRef<HTMLInputElement | null>(null);
  const anchor = React.useRef<{ base: number; at: number } | null>(null);
  const seq = React.useRef(0);
  const alive = React.useRef(true);
  const lastMessage = React.useRef<string | null>(null);

  const ready = status === "ready";
  const inert = disabled || !ready;

  /* -------------------------------- clock ------------------------------ */

  // The seconds counted since the host last set `now`; they only apply to
  // that same `now`, so a fresh value from the host never carries old drift.
  const drift = live && offset.base === now ? offset.ms : 0;
  const clockNow = now + drift;
  const remainingMs = until === null ? 0 : Math.max(0, until - clockNow);
  const locked = remainingMs > 0;
  const remaining = secondsLeft(remainingMs);
  const warmth = locked ? clamp(remainingMs / lockoutMs, 0, 1) : 0;

  const phase: CoolingLockPhase = done
    ? "signed"
    : locked
      ? "locked"
      : pending
        ? "trying"
        : "open";

  React.useEffect(() => {
    anchor.current = { base: now, at: Date.now() };
  }, [now]);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  React.useEffect(() => {
    const host = rootRef.current;
    if (!live || !ready || !locked || until === null || !host) return;
    let timer: number | null = null;
    let inView = true;
    const tick = () => {
      const a = anchor.current;
      if (a) setOffset({ base: a.base, ms: Date.now() - a.at });
    };
    const loop = () => {
      tick();
      // The next tick lands exactly when a second of the countdown rolls
      // over, so the digits never change late.
      const a = anchor.current;
      const left = a ? until - a.base - (Date.now() - a.at) : SEC;
      const delay = left <= 0 ? SEC : left % SEC || SEC;
      timer = window.setTimeout(loop, delay);
    };
    const sync = () => {
      const run = inView && !document.hidden;
      if (run && timer === null) timer = window.setTimeout(loop, 0);
      else if (!run && timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            const last = entries[entries.length - 1];
            if (last) inView = last.isIntersecting;
            sync();
          })
        : null;
    io?.observe(host);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [live, ready, locked, until, now]);

  /** The moment it is now, by the host's clock plus the seconds counted since. */
  const readNow = () => {
    const a = anchor.current;
    if (!live || !a || a.base !== now) return now;
    const ms = Date.now() - a.at;
    setOffset({ base: a.base, ms });
    return a.base + ms;
  };

  /* --------------------------- announcements --------------------------- */

  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  const valueRef = React.useRef<CoolingLockValue>({ until, attempts });
  React.useEffect(() => {
    valueRef.current = { until, attempts };
  });

  // The opening: announced, reported, and focus moves to the password field
  // when it was already inside the card.
  const prevLocked = React.useRef(locked);
  React.useEffect(() => {
    const was = prevLocked.current;
    prevLocked.current = locked;
    if (was === locked) return;
    const timer = window.setTimeout(() => {
      if (locked) {
        setDone(null);
        setFailure(null);
        return;
      }
      setAnnouncement("The lock has opened. You can try again.");
      onChangeRef.current?.(valueRef.current, { kind: "unlock" });
      const root = rootRef.current;
      if (root && root.contains(document.activeElement)) {
        passwordRef.current?.focus({ preventScroll: true });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [locked]);

  // One minute to go, once per lockout.
  const prevRemaining = React.useRef(remaining);
  React.useEffect(() => {
    const was = prevRemaining.current;
    prevRemaining.current = remaining;
    if (!locked || was <= 60 || remaining > 60) return;
    const timer = window.setTimeout(
      () => setAnnouncement("One minute until you can try again."),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [locked, remaining]);

  // Another failed attempt, from a retry here or from the host: the dots
  // grew or the lift time moved later. The wash fills back quickly for the
  // length of that tween, then cools slowly as before.
  const [rising, setRising] = React.useState(false);
  const prevLock = React.useRef<CoolingLockValue | null>(null);
  const remainingRef = React.useRef(remainingMs);
  React.useEffect(() => {
    remainingRef.current = remainingMs;
  });
  React.useEffect(() => {
    const prev = prevLock.current;
    prevLock.current = { until, attempts };
    if (!prev) return;
    const grew = attempts > prev.attempts;
    const later = until !== null && (prev.until === null || until > prev.until);
    if (!grew && !later) return;
    const timer = window.setTimeout(() => {
      const lead = lastMessage.current ?? "Another failed attempt";
      lastMessage.current = null;
      const left = remainingRef.current;
      if (later) setRising(true);
      setAnnouncement(
        `${lead}. ${Math.min(max, attempts)} of ${max} attempts used.${
          left > 0 ? ` Locked for ${phraseCoolingLock(left)}.` : ""
        }`,
      );
    }, 0);
    const settle = window.setTimeout(
      () => setRising(false),
      durations.slow * 1000 + 50,
    );
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(settle);
    };
  }, [until, attempts, max]);

  /* ------------------------------- retry ------------------------------- */

  const relock = (message?: string) => {
    const at = readNow();
    const next: CoolingLockValue = {
      until: at + lockoutMs,
      attempts: Math.min(max, attempts + 1),
    };
    lastMessage.current = message ?? null;
    setOwn(next);
    setPassword("");
    onChange?.(next, { kind: "relock", message });
  };

  const submit = () => {
    if (inert || phase !== "open") return;
    const credentials = { email: email.trim(), password };
    const id = (seq.current += 1);
    setPending(true);
    setFailure(null);
    onRetry(credentials)
      .then((result) => {
        if (!alive.current || id !== seq.current) return;
        setPending(false);
        if (result.ok) {
          setDone(credentials.email);
          setPassword("");
          setAnnouncement(`Signed in as ${credentials.email}.`);
          onChange?.({ until, attempts }, { kind: "signin" });
        } else {
          relock(result.message);
        }
      })
      .catch(() => {
        if (!alive.current || id !== seq.current) return;
        setPending(false);
        setFailure("Fieldline could not be reached.");
        setAnnouncement("Fieldline could not be reached. Retry when you can.");
      });
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const warm = TONES[tone] ?? TONES.warn;
  const left = Math.max(0, max - Math.min(max, attempts));
  const leftWord =
    left === 0
      ? "No attempts left"
      : left === 1
        ? "Last attempt"
        : `${left} attempts left`;
  const heading =
    phase === "signed"
      ? "Signed in"
      : phase === "locked"
        ? `Locked after ${Math.min(max, attempts)} ${Math.min(max, attempts) === 1 ? "attempt" : "attempts"}`
        : phase === "trying"
          ? "Signing in"
          : "You can try again";
  const timerText = `${phraseCoolingLock(remainingMs)} until you can try again.`;
  const fieldClass = cn(
    "w-full min-w-0 rounded-2 border border-hairline-strong bg-surface-0 px-2.5 text-[13px] text-foreground placeholder:text-ink-3 transition-colors",
    "focus:border-cobalt-bright",
    d.field,
    FOCUS_RING,
    inert && "cursor-not-allowed opacity-70",
  );
  const enter = (delay = 0) =>
    motionSafe
      ? {
          y: { ...springs.recoil, delay },
          opacity: { duration: durations.base, ease: easings.enter, delay },
        }
      : { duration: durations.fast };
  const step = cascade(4);

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
      style={{ height, ["--cl-warm" as string]: warm }}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 pb-0",
          d.pad,
        )}
      >
        <p
          id={titleId}
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {title}
        </p>
        {ready ? (
          <p
            aria-hidden
            className={cn(
              "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
              phase === "signed"
                ? "text-success"
                : phase === "locked"
                  ? "text-(--cl-warm)"
                  : "text-cobalt-bright",
            )}
          >
            {phase === "signed"
              ? "Open"
              : phase === "locked"
                ? "Locked"
                : "Unlocked"}
          </p>
        ) : null}
      </header>

      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain",
          d.pad,
          d.gap,
        )}
      >
        {status === "loading" ? (
          <div aria-hidden className={cn("flex flex-col", d.gap)}>
            <div className="flex items-center gap-3">
              <span
                className="shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: d.disc, height: d.disc }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="h-3.5 w-2/3 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className="w-1/2 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{ height: d.digits, animationDelay: "90ms" }}
                />
                <span className="flex gap-1.5">
                  {Array.from({ length: max }, (_, i) => (
                    <span
                      key={i}
                      className="size-2 rounded-full bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${120 + i * 60}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
            <span className="h-3 w-1/3 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ) : status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-4 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The lock&apos;s state didn&apos;t load.
            </p>
            {onReload ? (
              <button
                type="button"
                onClick={onReload}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Disc
                glyph={glyph}
                phase={phase}
                warmth={warmth}
                rising={rising}
                size={d.disc}
                motionSafe={motionSafe}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                <p className="truncate text-sm font-semibold">{heading}</p>
                <AnimatePresence initial={false} mode="popLayout">
                  {phase === "locked" ? (
                    <motion.div
                      key="count"
                      className="flex flex-col gap-1.5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                      }}
                    >
                      <p
                        role="timer"
                        aria-live="off"
                        aria-label={timerText}
                        className="flex items-baseline gap-1.5"
                      >
                        <Roll
                          text={clockText(remainingMs)}
                          roll={motionSafe && remaining <= ROLL_FROM}
                          size={d.digits}
                          className="font-mono font-semibold text-foreground"
                        />
                      </p>
                      <p aria-hidden className="text-[12px] text-ink-2">
                        until you can try again
                      </p>
                      <Dots
                        attempts={attempts}
                        max={max}
                        live={mounted}
                        motionSafe={motionSafe}
                      />
                    </motion.div>
                  ) : phase === "signed" ? (
                    <motion.div
                      key="signed"
                      className="flex flex-col gap-1.5"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? -distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={enter()}
                    >
                      <p className="truncate text-[12px] text-ink-2">
                        as <span className="text-foreground">{done}</span>
                      </p>
                      <Dots
                        attempts={attempts}
                        max={max}
                        live={mounted}
                        motionSafe={motionSafe}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="open"
                      className="flex flex-col gap-1.5"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? -distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={enter()}
                    >
                      <p className="text-[12px] text-ink-2">
                        {leftWord}
                        {left === 0 ? ": a wrong one locks you out again" : ""}
                      </p>
                      <Dots
                        attempts={attempts}
                        max={max}
                        live={mounted}
                        motionSafe={motionSafe}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {phase === "open" || phase === "trying" ? (
                <motion.form
                  key="fields"
                  className={cn("flex flex-col", d.gap)}
                  aria-label="Sign in again"
                  aria-busy={phase === "trying" || undefined}
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                  initial={{ opacity: 0, y: motionSafe ? -distances.shift : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={enter(r3(step))}
                >
                  <div className="flex flex-col gap-2 @min-[30rem]:flex-row">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label
                        htmlFor={emailId}
                        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                      >
                        Email
                      </label>
                      <input
                        id={emailId}
                        type="email"
                        name="email"
                        autoComplete="username"
                        value={email}
                        disabled={inert || phase === "trying"}
                        onChange={(event) => setEmail(event.target.value)}
                        className={fieldClass}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <label
                        htmlFor={passwordId}
                        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                      >
                        Password
                      </label>
                      <input
                        ref={passwordRef}
                        id={passwordId}
                        type="password"
                        name="password"
                        autoComplete="current-password"
                        value={password}
                        disabled={inert || phase === "trying"}
                        aria-describedby={
                          [hint ? hintId : null, failure ? failId : null]
                            .filter(Boolean)
                            .join(" ") || undefined
                        }
                        aria-invalid={failure ? true : undefined}
                        onChange={(event) => setPassword(event.target.value)}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <motion.button
                      type="submit"
                      aria-disabled={inert || phase === "trying" || undefined}
                      whileTap={
                        motionSafe && !inert ? { scale: 0.97 } : undefined
                      }
                      transition={springs.flick}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity",
                        d.field,
                        (inert || phase === "trying") && "opacity-70",
                        inert ? "cursor-not-allowed" : "cursor-pointer",
                        FOCUS_RING,
                      )}
                    >
                      {phase === "trying" ? (
                        <LoaderCircle
                          aria-hidden
                          className="size-3.5 motion-safe:animate-spin"
                        />
                      ) : (
                        <KeyRound aria-hidden className="size-3.5" />
                      )}
                      {phase === "trying" ? "Signing in" : "Try again"}
                    </motion.button>
                    {failure ? (
                      <span
                        id={failId}
                        className="flex min-w-0 items-center gap-2 text-[12px] text-danger"
                      >
                        <span className="truncate">{failure}</span>
                        <button
                          type="submit"
                          className={cn(
                            "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 border border-hairline px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2",
                            FOCUS_RING,
                          )}
                        >
                          <RotateCcw aria-hidden className="size-3" />
                          Retry
                        </button>
                      </span>
                    ) : hint ? (
                      <span
                        id={hintId}
                        className="min-w-0 truncate text-[12px] text-ink-3"
                      >
                        {hint}
                      </span>
                    ) : null}
                  </div>
                </motion.form>
              ) : null}
            </AnimatePresence>
          </>
        )}
      </div>

      {ready && phase !== "signed" ? (
        <footer
          className={cn(
            "flex shrink-0 flex-col items-start gap-x-4 gap-y-1 border-t border-hairline pt-2.5 @min-[24rem]:flex-row @min-[24rem]:items-center",
            d.pad,
          )}
        >
          <button
            type="button"
            onClick={() => {
              if (!inert) onReset?.();
            }}
            aria-disabled={inert || undefined}
            className={cn(LINK, FOCUS_RING, inert && "cursor-not-allowed")}
          >
            Reset password instead
          </button>
          <span
            aria-hidden
            className="hidden text-[11px] text-ink-3 @min-[24rem]:inline"
          >
            ·
          </span>
          <button
            type="button"
            onClick={() => {
              if (!inert) onSupport?.();
            }}
            aria-disabled={inert || undefined}
            className={cn(LINK, FOCUS_RING, inert && "cursor-not-allowed")}
          >
            <LifeBuoy aria-hidden className="size-3" />
            Contact support
          </button>
        </footer>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
