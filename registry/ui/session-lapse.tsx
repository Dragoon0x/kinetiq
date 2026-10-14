"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  LogOut,
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

export type LapseState = "active" | "signed-out";
export type LapseRingStyle = "ring" | "bar" | "digits";
export type LapseAccent = "cobalt" | "signal" | "ink";
export type LapseStatus = "ready" | "loading" | "error";

export type LapseChange = {
  from: LapseState;
  to: LapseState;
  /** What moved it: the clock ran out, Sign out now, or Sign in again. */
  source: "expired" | "sign-out" | "sign-in";
};

export type SessionLapseProps = {
  /** How the time left is drawn: a draining ring around the number, a bar under it, or the digits alone. @default "ring" */
  ringStyle?: LapseRingStyle;
  /** The warning window in seconds: the ring is full this long before the session ends. @default 120 */
  warnSeconds?: number;
  /** The colour of the ring while there is more than a minute left: blue, the signal hue, or ink. Under a minute it turns amber, under ten seconds red. @default "cobalt" */
  accent?: LapseAccent;
  /** When the session ends, in ms. @default defaultLapseExpiresAt */
  expiresAt?: number;
  /** The moment the surface counts from, in ms — never read from the clock. @default defaultLapseNow */
  now?: number;
  /** How much "Warn me earlier" adds to the window, in seconds. @default 60 */
  earlierSeconds?: number;
  /** Controlled: whether the wider window is on. */
  earlier?: boolean;
  /** Initial setting when uncontrolled. @default false */
  defaultEarlier?: boolean;
  /** "Warn me earlier" was pressed, or pressed again to undo it. */
  onEarlierChange?: (earlier: boolean) => void;
  /** Controlled session state. */
  state?: LapseState;
  /** Initial state when uncontrolled. @default "active" */
  defaultState?: LapseState;
  /** Fires when the clock runs out, Sign out now is pressed, or Sign in again is pressed, with the change. */
  onStateChange?: (state: LapseState, change: LapseChange) => void;
  /** Stay signed in was pressed: resolve to extend, reject to fail. @default defaultLapseExtend, which resolves after a short wait */
  onExtend?: () => Promise<void> | void;
  /** The session was extended; the new end, in ms. */
  onExtended?: (expiresAt: number) => void;
  /** Sign out now was pressed. The card has already turned. */
  onSignOut?: () => void;
  /** Sign in again was pressed from the signed-out face. */
  onSignIn?: () => void;
  /** The clock reached zero. */
  onExpire?: () => void;
  /** Unsaved drafts the product kept, shown on the signed-out face. @default 2 */
  drafts?: number;
  /** The extend call as the host sees it: a wait while extending, a retry when it failed. @default "ready" */
  status?: LapseStatus;
  /** Try again was pressed after a failed extend. */
  onRetry?: () => void;
  /** The product whose session this is. @default "Basinworks" */
  product?: string;
  /** The heading. @default "Still there?" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the card in px. @default 320 */
  height?: number;
  /** Read only: nothing can be extended, signed out or changed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Wednesday 14 October 2026, 09:20 UTC. */
export const defaultLapseNow = Date.UTC(2026, 9, 14, 9, 20);
/** Two minutes after `defaultLapseNow`, so the ring opens full. */
export const defaultLapseExpiresAt = defaultLapseNow + 120_000;

/** Pretends to extend the session: resolves after 650 ms. */
export const defaultLapseExtend = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 650);
  });

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<LapseAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink-2)",
};

/** How often the clock is read; the surface only re-renders when the second changes. */
const TICK_MS = 200;
/** How long the tick stays in the ring after an extend. */
const TICK_SHOW_MS = 1100;
const FLIP_FROM = 10;
const MINUTE = 60;
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

const noopSubscribe = () => () => {};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

/** "2:00", "0:09". */
const face = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / MINUTE)}:${String(s % MINUTE).padStart(2, "0")}`;
};

/** "1 minute 59 seconds", "9 seconds", "0 seconds". */
const words = (seconds: number) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / MINUTE);
  const rest = s % MINUTE;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (rest > 0 || m === 0) parts.push(`${rest} second${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
};

/** "3 min", "90 s". */
const short = (seconds: number) =>
  seconds % MINUTE === 0 ? `${seconds / MINUTE} min` : `${seconds} s`;

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

type Move = "tick" | "settle";
type Phase = "idle" | "extending" | "extended" | "failed";

const colourFor = (seconds: number, accent: string) =>
  seconds <= FLIP_FROM
    ? "var(--danger)"
    : seconds <= MINUTE
      ? "var(--warn)"
      : accent;

/* ----------------------------------------------------------------------- */
/*                                   Digits                                 */
/* ----------------------------------------------------------------------- */

function Tick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.span
      key="tick"
      aria-hidden
      className="absolute inset-0 flex items-center justify-center text-success"
      initial={motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? { ...springs.recoil, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      <svg viewBox="0 0 24 24" className="size-[1.1em]">
        <motion.path
          d="M5 12.5 9.8 17 19 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      </svg>
    </motion.span>
  );
}

/**
 * The time left. Above ten seconds the text changes in place; from ten the
 * whole face flips each second on `springs.snap`: the old one rises out on
 * the exit ease, the new one lands from below. After an extend a tick takes
 * its place for a beat.
 */
function Digits({
  seconds,
  showTick,
  motionSafe,
  colour,
  className,
}: {
  seconds: number;
  showTick: boolean;
  motionSafe: boolean;
  colour: string;
  className?: string;
}) {
  const flipping = seconds <= FLIP_FROM;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex items-center justify-center font-mono leading-none font-medium tabular-nums transition-colors duration-200",
        className,
      )}
      style={{ color: showTick ? undefined : colour }}
    >
      {/* Reserves the widest face so the ring never shifts as digits change. */}
      <span className="invisible">{face(seconds)}</span>
      <AnimatePresence initial={false} mode="popLayout">
        {showTick ? (
          <Tick key="tick" motionSafe={motionSafe} />
        ) : (
          <motion.span
            key={flipping ? `s-${seconds}` : "steady"}
            className="absolute inset-0 flex items-center justify-center"
            initial={
              flipping
                ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: flipping && motionSafe ? -distances.step : 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {face(seconds)}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Ring and bar                              */
/* ----------------------------------------------------------------------- */

const drainOrSettle = (move: Move, motionSafe: boolean) =>
  !motionSafe
    ? { duration: 0 }
    : move === "settle"
      ? springs.glide
      : { duration: 1, ease: easings.linear };

function Ring({
  fraction,
  move,
  colour,
  motionSafe,
  size,
  children,
}: {
  fraction: number;
  move: Move;
  colour: string;
  motionSafe: boolean;
  size: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle
          cx={50}
          cy={50}
          r={RING_R}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={5}
        />
        <motion.circle
          cx={50}
          cy={50}
          r={RING_R}
          fill="none"
          stroke={colour}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          initial={false}
          animate={{ strokeDashoffset: r3(RING_C * (1 - fraction)) }}
          transition={drainOrSettle(move, motionSafe)}
          style={{ transition: "stroke 200ms" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function Bar({
  fraction,
  move,
  colour,
  motionSafe,
}: {
  fraction: number;
  move: Move;
  colour: string;
  motionSafe: boolean;
}) {
  return (
    <div
      aria-hidden
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <motion.div
        className="h-full rounded-full"
        style={{
          originX: 0,
          background: colour,
          transition: "background 200ms",
        }}
        initial={false}
        animate={{ scaleX: r3(fraction) }}
        transition={drainOrSettle(move, motionSafe)}
      />
    </div>
  );
}

/** One line of the signed-out face, arriving a beat after the one above it. */
function Rise({
  index,
  step,
  motionSafe,
  children,
}: {
  index: number;
  step: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const delay = r3(durations.fast + index * step);
  return (
    <motion.div
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter, delay },
      }}
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * The last two minutes of a session, on a card the size of a notice. A ring
 * drains one linear second at a time around the time left — or a bar under
 * it, or the digits alone — turning amber under a minute and red under ten
 * seconds, where the number starts flipping each second on `springs.snap`.
 * Stay signed in refills the ring on `springs.glide` and lands a tick in its
 * centre on `springs.recoil` while the check draws on `springs.flick`; Sign
 * out now, or the clock reaching zero, turns the card over on `springs.snap`
 * to its signed-out face, where a lock settles in, the kept drafts are
 * counted and Sign in again waits. Warn me earlier widens the window, and the
 * ring re-scales to it on `springs.glide`.
 *
 * The clock is `expiresAt` against `now` plus the time the surface has been
 * awake: it ticks only while the tab is visible and the card is on screen,
 * and the first tick after a pause catches up what passed, so a card that was
 * hidden past its end comes back signed out. Loading and error belong to the
 * extend call: a wait on the button, then a note with Retry.
 *
 * The countdown is a timer that stays quiet except at one minute and ten
 * seconds, which it says in words; every button is a button and the window
 * link is a pressed button. Under reduced motion nothing drains, flips or
 * turns — the ring and the digits step, the card cross-fades — but every
 * state is still reached and announced.
 */
export function SessionLapse({
  ringStyle = "ring",
  warnSeconds = 120,
  accent = "cobalt",
  expiresAt = defaultLapseExpiresAt,
  now = defaultLapseNow,
  earlierSeconds = 60,
  earlier,
  defaultEarlier = false,
  onEarlierChange,
  state,
  defaultState = "active",
  onStateChange,
  onExtend = defaultLapseExtend,
  onExtended,
  onSignOut,
  onSignIn,
  onExpire,
  drafts = 2,
  status = "ready",
  onRetry,
  product = "Basinworks",
  title = "Still there?",
  label,
  height = 320,
  disabled = false,
  className,
}: SessionLapseProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const timerId = `${uid}-timer`;

  const [ownState, setOwnState] = React.useState<LapseState>(defaultState);
  const current = state ?? ownState;
  const [ownEarlier, setOwnEarlier] = React.useState(defaultEarlier);
  const isEarlier = earlier ?? ownEarlier;

  // The piece's clock: `now` plus the time it has been awake, in ms. Only
  // moves when the displayed second would, so the card renders once a second.
  const [clock, setClock] = React.useState(now);
  // A re-anchored `now` restarts the clock from it.
  const [seenNow, setSeenNow] = React.useState(now);
  if (seenNow !== now) {
    setSeenNow(now);
    setClock(now);
  }
  // An extend or a fresh sign-in sets its own end; a new `expiresAt` prop clears it.
  const [override, setOverride] = React.useState<number | null>(null);
  const [seenExpiresAt, setSeenExpiresAt] = React.useState(expiresAt);
  if (seenExpiresAt !== expiresAt) {
    setSeenExpiresAt(expiresAt);
    setOverride(null);
  }

  const [move, setMove] = React.useState<Move>("tick");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [awake, setAwake] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration; the clock only runs after.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const elapsedRef = React.useRef(0);
  const pausedAt = React.useRef<number | null>(null);
  const shownRef = React.useRef(0);
  const expiryRef = React.useRef(0);
  const nowRef = React.useRef(now);
  const extendSeq = React.useRef(0);
  const tickTimer = React.useRef<number | null>(null);
  const mounted = React.useRef(false);
  const expireRef = React.useRef<() => void>(() => {});

  /* -------------------------------- data ------------------------------- */

  const windowSeconds = Math.max(
    1,
    Math.round(warnSeconds + (isEarlier ? earlierSeconds : 0)),
  );
  const expiry = override ?? expiresAt;
  const remainingMs = expiry - clock;
  const secondsLeft = Math.max(0, Math.ceil(remainingMs / 1000));
  const expired = remainingMs <= 0;
  const shown: LapseState =
    current === "signed-out" || expired ? "signed-out" : "active";
  const fraction = clamp(secondsLeft / windowSeconds, 0, 1);
  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const colour = colourFor(secondsLeft, accentVar);
  const extending = phase === "extending" || status === "loading";
  const failed = phase === "failed" || status === "error";
  const inert = disabled || shown !== "active";
  const controlled = state !== undefined;

  const outWords = `Signed out. ${
    drafts > 0
      ? `${plural(drafts, "unsaved draft was", "unsaved drafts were")} kept.`
      : "Nothing was left unsaved."
  }`;

  /* ------------------------------- clock ------------------------------- */

  // The clock ran out, from a tick: the state follows once and the host hears.
  const handleExpire = () => {
    if (current !== "active") return;
    if (!controlled) setOwnState("signed-out");
    onStateChange?.("signed-out", {
      from: "active",
      to: "signed-out",
      source: "expired",
    });
    onExpire?.();
    setAnnouncement(outWords);
  };

  // What a tick reads, kept current after every render.
  React.useEffect(() => {
    shownRef.current = secondsLeft;
    expiryRef.current = expiry;
    nowRef.current = now;
    expireRef.current = handleExpire;
  });

  // A re-anchored `now` restarts the awake time from zero.
  React.useEffect(() => {
    elapsedRef.current = 0;
    pausedAt.current = null;
  }, [now]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (tickTimer.current !== null) window.clearTimeout(tickTimer.current);
    };
  }, []);

  // Ticks only while someone could see them: a hidden tab or an off-screen
  // card stops the interval, and the first tick after it resumes catches up
  // the time that passed.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let visible = !document.hidden;
    let onScreen = true;
    const sync = () => setAwake(visible && onScreen);
    const onVisibility = () => {
      visible = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    let watcher: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      watcher = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        onScreen = Boolean(last?.isIntersecting);
        sync();
      });
      watcher.observe(root);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watcher?.disconnect();
    };
  }, []);

  const counting = live && awake && shown === "active" && secondsLeft > 0;

  React.useEffect(() => {
    if (!counting) return;
    let last = pausedAt.current ?? performance.now();
    pausedAt.current = null;
    const id = window.setInterval(() => {
      const t = performance.now();
      elapsedRef.current += t - last;
      last = t;
      const c = nowRef.current + elapsedRef.current;
      const left = Math.max(0, Math.ceil((expiryRef.current - c) / 1000));
      const prev = shownRef.current;
      if (left === prev) return;
      shownRef.current = left;
      setMove("tick");
      setClock(c);
      // One sentence at each threshold that matters; a catch-up that crosses
      // both says only the nearer one.
      if (left === 0) {
        window.clearInterval(id);
        expireRef.current();
      } else if (prev > FLIP_FROM && left <= FLIP_FROM) {
        setAnnouncement("Ten seconds left.");
      } else if (prev > MINUTE && left <= MINUTE) {
        setAnnouncement("One minute left.");
      }
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      pausedAt.current = performance.now();
    };
  }, [counting, now]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (to: LapseState, source: LapseChange["source"]) => {
    if (shown === to) return;
    if (!controlled) setOwnState(to);
    onStateChange?.(to, { from: shown, to, source });
  };

  const extend = async () => {
    if (inert || extending) return;
    const seq = (extendSeq.current += 1);
    setPhase("extending");
    try {
      await onExtend?.();
    } catch {
      if (mounted.current && extendSeq.current === seq) setPhase("failed");
      return;
    }
    if (!mounted.current || extendSeq.current !== seq) return;
    const next = nowRef.current + elapsedRef.current + windowSeconds * 1000;
    setMove("settle");
    setOverride(next);
    setPhase("extended");
    onExtended?.(next);
    setAnnouncement(`Session extended. ${words(windowSeconds)} left.`);
    if (tickTimer.current !== null) window.clearTimeout(tickTimer.current);
    tickTimer.current = window.setTimeout(() => {
      tickTimer.current = null;
      setPhase((p) => (p === "extended" ? "idle" : p));
    }, TICK_SHOW_MS);
  };

  const retry = () => {
    if (status === "error") {
      onRetry?.();
      return;
    }
    void extend();
  };

  const signOut = () => {
    if (inert) return;
    commit("signed-out", "sign-out");
    onSignOut?.();
    setAnnouncement(outWords);
  };

  const signIn = () => {
    if (disabled) return;
    const next = nowRef.current + elapsedRef.current + windowSeconds * 1000;
    setMove("settle");
    setOverride(next);
    setPhase("idle");
    commit("active", "sign-in");
    onSignIn?.();
    setAnnouncement(`Signed in. ${words(windowSeconds)} left.`);
  };

  const toggleEarlier = () => {
    if (inert) return;
    const next = !isEarlier;
    if (earlier === undefined) setOwnEarlier(next);
    onEarlierChange?.(next);
    setMove("settle");
    const window_ = Math.max(
      1,
      Math.round(warnSeconds + (next ? earlierSeconds : 0)),
    );
    setAnnouncement(
      next
        ? `You will be warned ${short(window_)} before the session ends.`
        : `Warning window back to ${short(window_)}.`,
    );
  };

  /* ------------------------------- render ------------------------------ */

  const step = cascade(3);

  const note = failed ? (
    <span className="flex items-center gap-1.5 text-danger">
      <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">Couldn&apos;t extend.</span>
      <button
        type="button"
        onClick={retry}
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 border border-hairline px-1.5 text-[11px] text-foreground transition-colors hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        <RotateCcw aria-hidden className="size-3" />
        Retry
      </button>
    </span>
  ) : phase === "extended" ? (
    <span className="text-success">Session extended.</span>
  ) : secondsLeft <= FLIP_FROM ? (
    <span className="text-danger">Signing out any second.</span>
  ) : secondsLeft <= MINUTE ? (
    <span className="text-warn">Under a minute left.</span>
  ) : (
    <span>Stay signed in to keep working.</span>
  );

  const activeFace = (
    <motion.div
      key="active"
      className="flex h-full flex-col gap-3 px-4 pb-3"
      style={{ transformPerspective: 900, originX: 0.5 }}
      initial={motionSafe ? { opacity: 0, rotateY: -70 } : { opacity: 0 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={
        motionSafe
          ? { opacity: 0, rotateY: 70, transition: exitFor(durations.base) }
          : { opacity: 0, transition: exitFor(durations.base) }
      }
      transition={
        motionSafe
          ? { ...springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center gap-4",
          ringStyle !== "ring" && "flex-col items-stretch justify-center gap-2",
        )}
      >
        {ringStyle === "ring" ? (
          <Ring
            fraction={fraction}
            move={move}
            colour={colour}
            motionSafe={motionSafe}
            size={96}
          >
            <Digits
              seconds={secondsLeft}
              showTick={phase === "extended"}
              motionSafe={motionSafe}
              colour={colour}
              className="text-[22px]"
            />
          </Ring>
        ) : null}
        <div
          id={timerId}
          role="timer"
          aria-live="off"
          aria-atomic
          aria-label={`${product} session ends in`}
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            ringStyle !== "ring" && "flex-none items-start",
          )}
        >
          <p className="text-[12px] text-ink-2">Your session ends in</p>
          {ringStyle !== "ring" ? (
            <div className="mt-0.5 flex items-center gap-2">
              <Digits
                seconds={secondsLeft}
                showTick={false}
                motionSafe={motionSafe}
                colour={colour}
                className="text-[36px] @min-[24rem]:text-[40px]"
              />
              <AnimatePresence>
                {phase === "extended" ? (
                  <motion.span
                    key="tick"
                    aria-hidden
                    className="text-success"
                    initial={
                      motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }
                    }
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <Check className="size-5" strokeWidth={2.4} />
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
          <p className="sr-only">{words(secondsLeft)}</p>
          <p
            aria-live="polite"
            className="mt-1 min-h-5 text-[12px] text-ink-2 transition-colors"
          >
            {note}
          </p>
        </div>
      </div>

      {ringStyle === "bar" ? (
        <Bar
          fraction={fraction}
          move={move}
          colour={colour}
          motionSafe={motionSafe}
        />
      ) : null}

      <div className="flex shrink-0 gap-2">
        <motion.button
          type="button"
          onClick={() => void extend()}
          aria-disabled={inert || extending || undefined}
          aria-busy={extending || undefined}
          whileTap={!inert && !extending && motionSafe ? { scale: 0.97 } : {}}
          transition={springs.flick}
          className={cn(
            "inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
            inert
              ? "cursor-not-allowed bg-surface-2 text-ink-3"
              : "bg-primary text-primary-foreground hover:opacity-90",
            FOCUS_RING,
          )}
        >
          {extending ? (
            <LoaderCircle
              aria-hidden
              className="size-3.5 motion-safe:animate-spin"
            />
          ) : (
            <Clock3 aria-hidden className="size-3.5" />
          )}
          <span className="truncate">
            {extending ? "Extending" : "Stay signed in"}
          </span>
        </motion.button>
        <motion.button
          type="button"
          onClick={signOut}
          aria-disabled={inert || undefined}
          whileTap={!inert && motionSafe ? { scale: 0.97 } : {}}
          transition={springs.flick}
          className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline px-3 text-xs transition-colors",
            inert
              ? "cursor-not-allowed text-ink-3"
              : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <LogOut aria-hidden className="size-3.5" />
          <span className="hidden @min-[22rem]:inline">Sign out now</span>
          <span className="@min-[22rem]:hidden">Sign out</span>
        </motion.button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggleEarlier}
          aria-pressed={isEarlier}
          aria-disabled={inert || undefined}
          className={cn(
            "inline-flex h-6 min-w-0 items-center gap-1 rounded-1 text-[11px] underline-offset-2 transition-colors",
            inert
              ? "cursor-not-allowed text-ink-3"
              : isEarlier
                ? "text-cobalt-bright"
                : "text-ink-2 hover:text-foreground hover:underline",
            FOCUS_RING,
          )}
        >
          <AnimatePresence initial={false} mode="wait">
            {isEarlier ? (
              <motion.span
                key="on"
                className="inline-flex items-center gap-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
              >
                <Check aria-hidden className="size-3" />
                <span className="truncate">
                  Warning from {face(windowSeconds)}
                </span>
              </motion.span>
            ) : (
              <motion.span
                key="off"
                className="truncate"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
              >
                Warn me earlier
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {drafts > 0
            ? plural(drafts, "draft", "drafts") + " saved"
            : "all saved"}
        </span>
      </div>
    </motion.div>
  );

  const outFace = (
    <motion.div
      key="out"
      className="flex h-full flex-col items-center justify-center gap-2 px-5 pb-4 text-center"
      style={{ transformPerspective: 900, originX: 0.5 }}
      initial={motionSafe ? { opacity: 0, rotateY: 70 } : { opacity: 0 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={
        motionSafe
          ? { opacity: 0, rotateY: -70, transition: exitFor(durations.base) }
          : { opacity: 0, transition: exitFor(durations.base) }
      }
      transition={
        motionSafe
          ? { ...springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      <motion.span
        aria-hidden
        className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"
        initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          motionSafe
            ? {
                ...springs.recoil,
                delay: durations.fast,
                opacity: { duration: durations.fast, delay: durations.fast },
              }
            : { duration: durations.fast }
        }
      >
        <LockKeyhole className="size-5" />
      </motion.span>
      <Rise index={0} step={step} motionSafe={motionSafe}>
        <p className="text-sm font-semibold">Signed out</p>
      </Rise>
      <Rise index={1} step={step} motionSafe={motionSafe}>
        <p className="max-w-[26ch] text-[12px] text-ink-2">
          Your {product} session ended.{" "}
          {drafts > 0
            ? `${plural(drafts, "unsaved draft was", "unsaved drafts were")} kept for you.`
            : "Nothing was left unsaved."}
        </p>
      </Rise>
      <Rise index={2} step={step} motionSafe={motionSafe}>
        <motion.button
          type="button"
          onClick={signIn}
          aria-disabled={disabled || undefined}
          whileTap={!disabled && motionSafe ? { scale: 0.97 } : {}}
          transition={springs.flick}
          className={cn(
            "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
            disabled
              ? "cursor-not-allowed bg-surface-2 text-ink-3"
              : "bg-primary text-primary-foreground hover:opacity-90",
            FOCUS_RING,
          )}
        >
          Sign in again
        </motion.button>
      </Rise>
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
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {shown === "active" ? title : "Session ended"}
        </p>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {product}
        </span>
      </header>

      <div className="relative min-h-0 flex-1 [perspective:900px]">
        <AnimatePresence initial={false} mode="wait">
          {shown === "active" ? activeFace : outFace}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
