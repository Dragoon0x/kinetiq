"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import {
  ChevronDown,
  Clock3,
  Globe,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wifi,
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

export type MatchOutcome = "pending" | "approved" | "expired" | "locked";
export type MatchLockReason = "reported" | "attempts";
export type MatchPhonePosition = "right" | "below";
export type MatchDigitStyle = "roll" | "fade";
export type MatchAccent = "cobalt" | "signal" | "ink";
export type MatchStatus = "ready" | "loading" | "error";

/** Where the sign-in is coming from, shown on the phone under "Where is this from?". */
export type MatchSource = {
  /** City and country, e.g. "Leeds, United Kingdom". */
  location: string;
  /** Browser and OS, e.g. "Firefox on Windows". */
  browser: string;
  /** When the request was made, in ms. */
  at: number;
  /** The network it came over, if known, e.g. "Fieldline office". */
  network?: string;
};

/** What a resend resolves with; anything left out is filled in by the surface. */
export type MatchChallengeInput = {
  /** The two-digit number the sign-in shows. */
  number: number;
  /** The numbers the phone offers; the match is added if it is missing. @default two seeded decoys around the number */
  candidates?: number[];
  /** When it stops being accepted, in ms. @default now + lifetime */
  expiresAt?: number;
};

/** Handed to `onResend`: which resend this is (1-based), the number it replaces and a signal that fires on unmount. */
export type MatchResendContext = {
  attempt: number;
  previous: number;
  signal: AbortSignal;
};

export type MatchResend = (
  context: MatchResendContext,
) => Promise<MatchChallengeInput | void> | MatchChallengeInput | void;

/** One choice made on the phone. */
export type MatchAttempt = {
  /** The number that was pressed. */
  chosen: number;
  /** The number the sign-in showed. */
  number: number;
  matched: boolean;
  /** Wrong choices on this number so far, including this one if it missed. */
  misses: number;
};

export type MatchState = {
  outcome: MatchOutcome;
  number: number;
  misses: number;
  lockReason: MatchLockReason | null;
};

export type NumberMatchProps = {
  /** Where the phone sits: beside the sign-in from a 40rem container, or always under it. @default "right" */
  phonePosition?: MatchPhonePosition;
  /** How a new number arrives: its digits roll in like a counter, or cross-fade. @default "roll" */
  digitStyle?: MatchDigitStyle;
  /** The colour of the number, the timer ring and the chosen candidate. @default "cobalt" */
  accent?: MatchAccent;
  /** The two-digit number the sign-in shows. @default defaultMatchNumber */
  number?: number;
  /** The three numbers the phone offers, one of them the match. @default defaultMatchCandidates */
  candidates?: number[];
  /** When the number stops being accepted, in ms. @default defaultMatchExpiresAt */
  expiresAt?: number;
  /** The moment the clock starts from, in ms; never read from the clock during render. @default defaultMatchNow */
  now?: number;
  /** How long a resent number lives, in ms. @default 60000 */
  lifetime?: number;
  /** Wrong choices allowed before the number locks. @default 3 */
  maxAttempts?: number;
  /** Where the request is from, shown on the phone. @default defaultMatchSource */
  source?: MatchSource;
  /** The matching number was chosen on the phone. */
  onApprove?: (attempt: MatchAttempt) => void;
  /** Any number was chosen on the phone, right or wrong. */
  onAttempt?: (attempt: MatchAttempt) => void;
  /** The attempt was locked: "It wasn't me" was pressed, or the wrong choices ran out. */
  onDeny?: (reason: MatchLockReason) => void;
  /** The number ran out of time before a choice was made. */
  onExpire?: (number: number) => void;
  /** Sends a new number; resolves with it (or with nothing, and a seeded one is used). @default simulateMatchResend */
  onResend?: MatchResend;
  /** Fires after every change of outcome with the whole state. */
  onChange?: (state: MatchState) => void;
  /** The product being signed in to. @default "Gaugeworks" */
  product?: string;
  /** The account signing in, shown in the header. @default "mara.lind" */
  account?: string;
  /** Whether the push has been sent: a skeleton while it sends, a retry when it failed. @default "ready" */
  status?: MatchStatus;
  /** "Try again" was pressed after the push failed to send. */
  onRetry?: () => void;
  /** The heading. @default "Approve sign-in" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the panes scroll inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be chosen, resent or reported. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const SEC = 1000;

/** Monday 12 October 2026, 09:41 UTC. */
export const defaultMatchNow = Date.UTC(2026, 9, 12, 9, 41);
export const defaultMatchNumber = 47;
export const defaultMatchCandidates = [23, 47, 81];
/** One minute after `defaultMatchNow`. */
export const defaultMatchExpiresAt = defaultMatchNow + 60 * SEC;

/** A Fieldline office sign-in from Leeds, eight seconds ago. */
export const defaultMatchSource: MatchSource = {
  location: "Leeds, United Kingdom",
  browser: "Firefox on Windows",
  at: defaultMatchNow - 8 * SEC,
  network: "Fieldline office",
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

/** Two seeded decoys for a number, none within two of it, shuffled in with it. */
export const makeMatchCandidates = (number: number, seed: number): number[] => {
  const rand = mulberry32(seed);
  const picks = [number];
  let guard = 0;
  while (picks.length < 3 && guard < 200) {
    guard += 1;
    const n = 10 + Math.floor(rand() * 90);
    if (picks.every((p) => Math.abs(p - n) > 2)) picks.push(n);
  }
  for (let i = picks.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = picks[i] ?? number;
    picks[i] = picks[j] ?? number;
    picks[j] = a;
  }
  return picks;
};

/** A seeded two-digit number with its candidates. */
export const makeMatchChallenge = (
  seed: number,
): { number: number; candidates: number[] } => {
  const number = 10 + Math.floor(mulberry32(seed)() * 90);
  return { number, candidates: makeMatchCandidates(number, seed * 7 + 3) };
};

/**
 * The default `onResend`: waits 900 ms, then resolves with a fresh seeded
 * number. Hosts replace it with the call that sends their push.
 */
export const simulateMatchResend: MatchResend = ({ attempt, signal }) =>
  new Promise((resolve, reject) => {
    const id = setTimeout(
      () => resolve(makeMatchChallenge(1717 + attempt * 31)),
      900,
    );
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("The resend was cancelled.", "AbortError"));
      },
      { once: true },
    );
  });

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<MatchAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.1;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pad2 = (n: number) => String(n).padStart(2, "0");

/** "0:48" for a span in ms. */
const spanWord = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / SEC));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
};

/** "09:41" in UTC, so the server and the client print the same clock. */
const timeWord = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

/** "just now", "8 seconds ago", "3 min ago". */
const agoWord = (now: number, at: number) => {
  const s = Math.max(0, Math.round((now - at) / SEC));
  if (s < 3) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const isAbort = (err: unknown) =>
  err instanceof DOMException && err.name === "AbortError";

const noopSubscribe = () => () => {};

function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type Live = {
  /** Identifies the number; the session state is keyed to it. */
  key: string;
  number: number;
  candidates: number[];
  expiresAt: number;
  issuedAt: number;
};

type Choice = { value: number; matched: boolean; seq: number };

type Session = {
  key: string;
  outcome: MatchOutcome;
  misses: number;
  lockReason: MatchLockReason | null;
  choice: Choice | null;
};

const FRESH: Omit<Session, "key"> = {
  outcome: "pending",
  misses: 0,
  lockReason: null,
  choice: null,
};

/* ----------------------------------------------------------------------- */
/*                                   Parts                                  */
/* ----------------------------------------------------------------------- */

function Tick({
  motionSafe,
  delay = 0,
  className,
}: {
  motionSafe: boolean;
  delay?: number;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <motion.path
        d="M5 12.5 9.8 17 19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
        animate={motionSafe ? { pathLength: 1 } : { opacity: 1 }}
        transition={
          motionSafe
            ? { ...springs.flick, delay }
            : { duration: durations.fast, delay }
        }
      />
    </svg>
  );
}

/** The two digits, each a column of ten that rolls to its value on snap. */
function RollingDigits({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const digits = pad2(clamp(Math.round(value), 0, 99)).split("");
  return (
    <span
      aria-hidden
      className="inline-flex"
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      {digits.map((d, i) => (
        <span
          key={i}
          className="relative inline-block overflow-hidden"
          style={{ width: "0.68em", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={
              motionSafe
                ? { ...springs.snap, delay: i * cascade(2) }
                : { duration: 0 }
            }
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** The two digits as one glyph pair that cross-fades when the number changes. */
function FadingDigits({ value }: { value: number }) {
  const text = pad2(clamp(Math.round(value), 0, 99));
  return (
    <span
      aria-hidden
      className="relative inline-block"
      style={{
        width: "1.36em",
        height: `${DIGIT_H}em`,
        lineHeight: `${DIGIT_H}em`,
      }}
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          className="absolute inset-0 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.base) }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function BigNumber({
  value,
  style,
  motionSafe,
  muted,
}: {
  value: number;
  style: MatchDigitStyle;
  motionSafe: boolean;
  muted: boolean;
}) {
  return (
    <span
      className={cn(
        "block font-mono text-[56px] font-medium tracking-[-0.02em] tabular-nums transition-colors duration-300 @min-[40rem]:text-[64px]",
        muted ? "text-ink-3" : "text-(--nm-accent)",
      )}
    >
      {style === "roll" && motionSafe ? (
        <RollingDigits value={value} motionSafe={motionSafe} />
      ) : (
        <FadingDigits value={value} />
      )}
    </span>
  );
}

/** A ring that drains as the number ages, with the seconds left inside. */
function TimerRing({
  fraction,
  seconds,
  motionSafe,
  muted,
  low,
}: {
  fraction: number;
  seconds: number;
  motionSafe: boolean;
  muted: boolean;
  low: boolean;
}) {
  return (
    <span
      aria-hidden
      className="relative inline-flex size-12 shrink-0 items-center justify-center"
    >
      <svg
        viewBox="0 0 48 48"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth="3"
        />
        <motion.circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke={
            muted ? "var(--ink-3)" : low ? "var(--warn)" : "var(--nm-accent)"
          }
          strokeWidth="3"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: clamp(fraction, 0, 1) }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
          style={{ transition: "stroke 300ms" }}
        />
      </svg>
      <span
        className={cn(
          "relative font-mono text-[11px] tabular-nums",
          muted ? "text-ink-3" : low ? "text-warn" : "text-ink-2",
        )}
      >
        {seconds}
      </span>
    </span>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-2 bg-surface-2 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                               Sign-in pane                               */
/* ----------------------------------------------------------------------- */

type SignInPaneProps = {
  outcome: MatchOutcome;
  lockReason: MatchLockReason | null;
  number: number;
  secondsLeft: number;
  fraction: number;
  misses: number;
  maxAttempts: number;
  sending: boolean;
  sendError: string | null;
  canResend: boolean;
  product: string;
  account: string;
  digitStyle: MatchDigitStyle;
  motionSafe: boolean;
  inert: boolean;
  resendRef: React.RefObject<HTMLButtonElement | null>;
  onResend: () => void;
};

function SignInPane({
  outcome,
  lockReason,
  number,
  secondsLeft,
  fraction,
  misses,
  maxAttempts,
  sending,
  sendError,
  canResend,
  product,
  account,
  digitStyle,
  motionSafe,
  inert,
  resendRef,
  onResend,
}: SignInPaneProps) {
  const muted = outcome !== "pending" || sending;
  const low = outcome === "pending" && !sending && secondsLeft <= 10;
  const stage =
    outcome === "approved"
      ? "approved"
      : outcome === "locked"
        ? "locked"
        : "number";

  const enter = motionSafe
    ? { opacity: 0, y: distances.shift, scale: 0.94 }
    : { opacity: 0 };
  const settle = { opacity: 1, y: 0, scale: 1 };

  const statusLine = sending
    ? "Sending a new number"
    : sendError
      ? "The number didn't send"
      : outcome === "expired"
        ? "This number expired"
        : outcome === "approved"
          ? "Approved on your phone"
          : outcome === "locked"
            ? lockReason === "reported"
              ? "Reported from your phone"
              : "Too many wrong choices"
            : misses > 0
              ? `Didn't match on the phone, ${plural(maxAttempts - misses, "try", "tries")} left`
              : "Waiting for your phone";

  return (
    <section
      aria-label="Your sign-in"
      className="relative flex min-w-0 flex-1 flex-col rounded-3 border border-hairline bg-surface-1 p-4 @min-[40rem]:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Signing in to
          </p>
          <p className="truncate text-sm font-semibold">{product}</p>
        </div>
        <p className="min-w-0 truncate rounded-full border border-hairline px-2 py-0.5 font-mono text-[11px] text-ink-2">
          {account}
        </p>
      </div>

      <div className="relative my-auto flex min-h-[172px] flex-col justify-center py-5">
        <AnimatePresence initial={false} mode="wait">
          {stage === "approved" ? (
            <motion.div
              key="approved"
              initial={enter}
              animate={settle}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.base }
              }
              className="flex items-center gap-4 rounded-3 border border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] p-4"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success text-primary-foreground">
                <Tick
                  motionSafe={motionSafe}
                  delay={motionSafe ? 0.12 : 0}
                  className="size-6"
                />
              </span>
              <div className="min-w-0">
                <p className="text-lg leading-tight font-semibold">Approved</p>
                <p className="text-[13px] text-ink-2">
                  Signing you in to {product}.
                </p>
              </div>
            </motion.div>
          ) : stage === "locked" ? (
            <motion.div
              key="locked"
              initial={enter}
              animate={settle}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.base }
              }
              className="flex items-center gap-4 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] p-4"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-danger">
                <ShieldAlert aria-hidden className="size-6" />
              </span>
              <div className="min-w-0">
                <p className="text-lg leading-tight font-semibold">
                  {lockReason === "reported"
                    ? "Sign-in reported"
                    : "Number locked"}
                </p>
                <p className="text-[13px] text-ink-2">
                  {lockReason === "reported"
                    ? "This attempt was denied and other sessions were signed out."
                    : `${maxAttempts} wrong choices. Send a new number to try again.`}
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="number"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "flex h-[88px] min-w-[112px] items-center justify-center rounded-3 border bg-card px-5 transition-colors duration-300",
                    muted
                      ? "border-hairline"
                      : "border-[color-mix(in_oklab,var(--nm-accent)_35%,transparent)]",
                  )}
                >
                  {sending ? (
                    <RefreshCw
                      aria-hidden
                      className="size-6 text-ink-3 motion-safe:animate-spin"
                    />
                  ) : (
                    <BigNumber
                      value={number}
                      style={digitStyle}
                      motionSafe={motionSafe}
                      muted={muted}
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <TimerRing
                    fraction={sending ? 0 : fraction}
                    seconds={sending ? 0 : secondsLeft}
                    motionSafe={motionSafe}
                    muted={muted}
                    low={low}
                  />
                  <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {outcome === "expired" && !sending
                      ? "expired"
                      : sending
                        ? "sending"
                        : "expires"}
                  </p>
                </div>
              </div>
              <p className="text-[13px] leading-snug text-ink-2">
                {outcome === "expired" && !sending ? (
                  <>Nobody chose it in time. Send a new number and try again.</>
                ) : (
                  <>
                    Open your <span className="text-foreground">{product}</span>{" "}
                    app and choose this number.
                  </>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline pt-3">
        <p
          aria-hidden
          className={cn(
            "min-w-0 truncate font-mono text-[10px] tracking-[0.08em] uppercase",
            sendError || outcome === "locked"
              ? "text-danger"
              : outcome === "approved"
                ? "text-success"
                : outcome === "expired"
                  ? "text-warn"
                  : "text-ink-3",
          )}
        >
          {statusLine}
        </p>
        {canResend ? (
          <button
            ref={resendRef}
            type="button"
            onClick={onResend}
            aria-disabled={inert || sending || undefined}
            aria-busy={sending || undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-xs transition-colors",
              outcome === "expired" || sendError
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              (inert || sending) && "cursor-default opacity-60",
              FOCUS_RING,
            )}
          >
            <RefreshCw
              aria-hidden
              className={cn("size-3.5", sending && "motion-safe:animate-spin")}
            />
            {sendError ? "Try again" : "Resend"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Phone pane                                */
/* ----------------------------------------------------------------------- */

type PhonePaneProps = {
  outcome: MatchOutcome;
  lockReason: MatchLockReason | null;
  candidates: number[];
  choice: Choice | null;
  misses: number;
  maxAttempts: number;
  sending: boolean;
  clock: number;
  source: MatchSource;
  product: string;
  motionSafe: boolean;
  inert: boolean;
  shakeX: ReturnType<typeof useMotionValue<number>>;
  activeIndex: number;
  candidateRef: (index: number, node: HTMLButtonElement | null) => void;
  onFocusCandidate: (index: number) => void;
  onChoose: (value: number) => void;
  onNav: (event: React.KeyboardEvent, index: number) => void;
  onReport: () => void;
};

function PhonePane({
  outcome,
  lockReason,
  candidates,
  choice,
  misses,
  maxAttempts,
  sending,
  clock,
  source,
  product,
  motionSafe,
  inert,
  shakeX,
  activeIndex,
  candidateRef,
  onFocusCandidate,
  onChoose,
  onNav,
  onReport,
}: PhonePaneProps) {
  const uid = React.useId();
  const detailsId = `${uid}-from`;
  const [open, setOpen] = React.useState(false);
  const pending = outcome === "pending" && !sending;
  const canChoose = pending && !inert;
  const canReport =
    !inert && !sending && (outcome === "pending" || outcome === "expired");
  const empty = candidates.length === 0;
  const step = cascade(candidates.length);

  const wrong = choice && !choice.matched ? choice : null;
  const left = maxAttempts - misses;

  return (
    <section
      aria-label={`Your phone, the ${product} app`}
      className="flex min-w-0 flex-col items-center"
    >
      <motion.div
        style={{ x: shakeX }}
        className="flex w-full max-w-[300px] flex-col overflow-hidden rounded-[22px] border border-hairline-strong bg-surface-0 shadow-[0_18px_40px_-24px_color-mix(in_oklab,black_55%,transparent)]"
      >
        {/* Status bar */}
        <div
          aria-hidden
          className="flex items-center justify-between px-4 pt-2.5 pb-1 font-mono text-[11px] text-ink-2 tabular-nums"
        >
          <span>{timeWord(clock)}</span>
          <span className="flex items-center gap-1">
            <Wifi className="size-3" />
            <span className="inline-block h-2.5 w-5 rounded-[3px] border border-current p-px">
              <span className="block h-full w-4/5 rounded-[1px] bg-current" />
            </span>
          </span>
        </div>

        {/* App header */}
        <div className="flex items-center gap-2 px-4 pt-2 pb-3">
          <span className="flex size-7 items-center justify-center rounded-2 bg-(--nm-accent) text-primary-foreground">
            <ShieldCheck aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] leading-tight font-semibold">
              {product}
            </p>
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Sign-in request
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <AnimatePresence initial={false} mode="wait">
            {sending ? (
              <motion.div
                key="sending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="flex flex-col gap-3"
              >
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-16 rounded-3" />
                  <Skeleton className="h-16 rounded-3" />
                  <Skeleton className="h-16 rounded-3" />
                </div>
                <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Incoming request
                </p>
              </motion.div>
            ) : outcome === "approved" ? (
              <motion.div
                key="approved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="flex flex-col items-center gap-2 py-4 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-success text-primary-foreground">
                  <Tick motionSafe={motionSafe} className="size-6" />
                </span>
                <p className="text-base font-semibold">Approved</p>
                <p className="text-[12px] text-ink-2">
                  You chose {choice?.value ?? ""}. You can close this.
                </p>
              </motion.div>
            ) : outcome === "locked" ? (
              <motion.div
                key="locked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="flex flex-col items-center gap-2 py-4 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--danger)_18%,transparent)] text-danger">
                  <ShieldAlert aria-hidden className="size-6" />
                </span>
                <p className="text-base font-semibold">
                  {lockReason === "reported" ? "Reported" : "Too many tries"}
                </p>
                <p className="text-[12px] text-ink-2">
                  {lockReason === "reported"
                    ? "We denied the sign-in and locked this attempt."
                    : "Ask for a new number on your other screen."}
                </p>
              </motion.div>
            ) : empty ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className="flex flex-col items-center gap-2 py-4 text-center"
              >
                <Smartphone aria-hidden className="size-5 text-ink-3" />
                <p className="text-[13px] font-medium">
                  Nothing to choose from
                </p>
                <p className="text-[12px] text-ink-2">
                  The request arrived without numbers. Send a new one from your
                  other screen.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="prompt"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                className={cn(
                  "flex flex-col gap-3 transition-opacity duration-300",
                  outcome === "expired" && "opacity-60",
                )}
              >
                <div>
                  <p className="text-[15px] leading-tight font-semibold">
                    Is this you signing in?
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-ink-2">
                    {outcome === "expired"
                      ? "This request expired. Ask for a new number on your other screen."
                      : "Choose the number shown on your other screen."}
                  </p>
                </div>

                <div
                  role="group"
                  aria-label="Choose the number shown on your other screen"
                  className="grid grid-cols-3 gap-2"
                >
                  {candidates.map((n, i) => {
                    const isWrong = wrong?.value === n;
                    return (
                      <motion.button
                        key={`${n}-${i}`}
                        ref={(node) => candidateRef(i, node)}
                        type="button"
                        tabIndex={i === activeIndex ? 0 : -1}
                        aria-disabled={!canChoose || undefined}
                        aria-label={`${n}${isWrong ? ", didn't match" : ""}`}
                        onFocus={() => onFocusCandidate(i)}
                        onClick={() => onChoose(n)}
                        onKeyDown={(event) => onNav(event, i)}
                        initial={
                          motionSafe
                            ? { opacity: 0, y: distances.step }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        whileTap={
                          canChoose && motionSafe ? { scale: 0.96 } : undefined
                        }
                        transition={{
                          y: motionSafe
                            ? { ...springs.glide, delay: r3(i * step) }
                            : { duration: 0 },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: motionSafe ? r3(i * step) : 0,
                          },
                          scale: springs.flick,
                        }}
                        className={cn(
                          "flex h-16 items-center justify-center rounded-3 border font-mono text-2xl font-medium tabular-nums transition-colors duration-200",
                          isWrong
                            ? "border-danger bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
                            : "border-hairline-strong bg-card text-foreground",
                          canChoose
                            ? "hover:border-(--nm-accent) hover:bg-(--nm-wash)"
                            : "cursor-default",
                          FOCUS_RING,
                        )}
                      >
                        {n}
                      </motion.button>
                    );
                  })}
                </div>

                <div className="min-h-[18px]" aria-hidden>
                  <AnimatePresence initial={false} mode="wait">
                    {wrong && outcome === "pending" ? (
                      <motion.p
                        key={wrong.seq}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          duration: durations.base,
                          ease: easings.enter,
                        }}
                        className="flex items-center justify-between gap-2 text-[12px] text-danger"
                      >
                        <span>That didn&apos;t match.</span>
                        <span className="font-mono text-[10px] tracking-[0.08em] uppercase">
                          {plural(left, "try", "tries")} left
                        </span>
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="flex flex-col rounded-3 border border-hairline bg-card">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={detailsId}
                    onClick={() => setOpen((o) => !o)}
                    className={cn(
                      "flex h-9 items-center justify-between rounded-3 px-3 text-left text-[12px] text-ink-2 transition-colors hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    Where is this from?
                    <motion.span
                      aria-hidden
                      className="flex"
                      initial={false}
                      animate={{ rotate: open ? 180 : 0 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    >
                      <ChevronDown className="size-3.5" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open ? (
                      <motion.div
                        key="details"
                        id={detailsId}
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
                                opacity: {
                                  duration: durations.base,
                                  ease: easings.enter,
                                },
                              }
                            : {
                                height: { duration: 0 },
                                opacity: { duration: durations.fast },
                              }
                        }
                        className="overflow-hidden"
                      >
                        <dl className="flex flex-col gap-1.5 border-t border-hairline px-3 py-2.5 text-[12px]">
                          <div className="flex items-start gap-2">
                            <dt className="sr-only">Location</dt>
                            <MapPin
                              aria-hidden
                              className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                            />
                            <dd className="min-w-0 truncate">
                              {source.location}
                            </dd>
                          </div>
                          <div className="flex items-start gap-2">
                            <dt className="sr-only">Browser</dt>
                            <Globe
                              aria-hidden
                              className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                            />
                            <dd className="min-w-0 truncate">
                              {source.browser}
                              {source.network ? (
                                <span className="text-ink-3">
                                  {" "}
                                  · {source.network}
                                </span>
                              ) : null}
                            </dd>
                          </div>
                          <div className="flex items-start gap-2">
                            <dt className="sr-only">Time</dt>
                            <Clock3
                              aria-hidden
                              className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                            />
                            <dd className="min-w-0 truncate">
                              {agoWord(clock, source.at)}
                              <span className="text-ink-3">
                                {" "}
                                · {timeWord(source.at)} UTC
                              </span>
                            </dd>
                          </div>
                        </dl>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <button
                  type="button"
                  onClick={onReport}
                  aria-disabled={!canReport || undefined}
                  className={cn(
                    "self-center rounded-2 px-2 py-1 text-[12px] underline-offset-2 transition-colors",
                    canReport
                      ? "text-danger hover:underline"
                      : "cursor-default text-ink-3",
                    FOCUS_RING,
                  )}
                >
                  It wasn&apos;t me
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A number-matching push approval with two sides on one surface. The sign-in
 * side shows a two-digit number, large — its digits roll in on `springs.snap`
 * like a counter — beside a timer ring that drains on `springs.glide` as the
 * number ages, and a Resend. The phone side is a mock card of the app's push
 * prompt: three candidate numbers as big buttons, a "Where is this from?"
 * disclosure that opens on `springs.glide` with the location, browser and time,
 * and an "It wasn't me" link.
 *
 * Choosing the matching number ticks both panes on `springs.flick` and lands
 * an Approved card on the sign-in side on `springs.recoil`. A wrong choice
 * shakes the phone — a landing on `springs.recoil` from a step aside — marks
 * the button, says "that didn't match" and counts the tries left; running out
 * locks the number. The timer expiring greys both sides and offers Resend,
 * which asks `onResend` for a new number (the default simulates a push) and
 * rolls it in while the phone's candidates cascade back. "It wasn't me" denies
 * and locks the attempt.
 *
 * The candidates are one group with a roving tab stop: arrows and Home/End
 * move, Enter or Space chooses; Resend, the disclosure and the report are
 * buttons. Every outcome is announced in words. Under reduced motion the
 * digits cross-fade, nothing shakes, lands or rolls, and every state is still
 * reached.
 */
export function NumberMatch({
  phonePosition = "right",
  digitStyle = "roll",
  accent = "cobalt",
  number = defaultMatchNumber,
  candidates = defaultMatchCandidates,
  expiresAt = defaultMatchExpiresAt,
  now = defaultMatchNow,
  lifetime = 60 * SEC,
  maxAttempts = 3,
  source = defaultMatchSource,
  onApprove,
  onAttempt,
  onDeny,
  onExpire,
  onResend = simulateMatchResend,
  onChange,
  product = "Gaugeworks",
  account = "mara.lind",
  status = "ready",
  onRetry,
  title = "Approve sign-in",
  label,
  height = 520,
  disabled = false,
  className,
}: NumberMatchProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const ready = status === "ready";
  const inert = disabled || !ready;

  /* ------------------------------ challenge ---------------------------- */

  // The number on show is the host's until a resend replaces it; a replacement
  // is tied to the props it replaced, so new props from the host win again.
  const propKey = `p:${number}|${candidates.join(",")}|${expiresAt}`;
  const [replacement, setReplacement] = React.useState<{
    basedOn: string;
    live: Live;
  } | null>(null);
  const live: Live =
    replacement && replacement.basedOn === propKey
      ? replacement.live
      : { key: propKey, number, candidates, expiresAt, issuedAt: now };

  // Everything that happened to a number is keyed to it, so a new number
  // starts fresh without an effect having to reset anything.
  const [session, setSession] = React.useState<Session>({ key: "", ...FRESH });
  const s: Omit<Session, "key"> = session.key === live.key ? session : FRESH;
  const update = (patch: Partial<Omit<Session, "key">>) =>
    setSession({ key: live.key, ...s, ...patch });

  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [resendCount, setResendCount] = React.useState(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  /* -------------------------------- clock ------------------------------ */

  // The clock starts at `now` for the server render and hydration, then runs
  // on from it once mounted, so the page never prints a time the server did
  // not.
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const mountedAt = React.useRef<number | null>(null);
  const [clock, setClock] = React.useState(now);
  const nowMs = React.useCallback(() => {
    if (mountedAt.current === null) mountedAt.current = Date.now();
    return now + (Date.now() - mountedAt.current);
  }, [now]);

  const [onScreen, setOnScreen] = React.useState(true);
  const [tabVisible, setTabVisible] = React.useState(true);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const resendRef = React.useRef<HTMLButtonElement | null>(null);
  const candidateNodes = React.useRef(new Map<number, HTMLButtonElement>());
  const controller = React.useRef<AbortController | null>(null);
  const resendSeq = React.useRef(0);
  const choiceSeq = React.useRef(0);
  const expiredKey = React.useRef<string | null>(null);
  const shakeX = useMotionValue(0);
  const shakeAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const outcome: MatchOutcome =
    s.outcome === "pending" && clock >= live.expiresAt ? "expired" : s.outcome;
  const left = Math.max(0, live.expiresAt - clock);
  const total = Math.max(SEC, live.expiresAt - live.issuedAt);
  const fraction = clamp(left / total, 0, 1);
  const secondsLeft = Math.ceil(left / SEC);

  const latest = useLatest({ live, outcome, s, onExpire, onChange });

  React.useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setOnScreen(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  const ticking =
    mounted &&
    ready &&
    onScreen &&
    tabVisible &&
    outcome === "pending" &&
    !sending;

  React.useEffect(() => {
    if (!ticking) return;
    const tick = () => {
      const t = nowMs();
      setClock(t);
      const L = latest.current;
      if (t >= L.live.expiresAt && expiredKey.current !== L.live.key) {
        expiredKey.current = L.live.key;
        setAnnouncement(
          `The number ${L.live.number} expired. Resend to get a new one.`,
        );
        L.onExpire?.(L.live.number);
        L.onChange?.({
          outcome: "expired",
          number: L.live.number,
          misses: L.s.misses,
          lockReason: null,
        });
      }
    };
    const id = window.setInterval(tick, SEC);
    return () => window.clearInterval(id);
  }, [ticking, nowMs, latest]);

  React.useEffect(
    () => () => {
      controller.current?.abort();
      shakeAnim.current?.stop();
    },
    [],
  );

  /* ------------------------------- changes ----------------------------- */

  const emit = (next: MatchState) => onChange?.(next);

  const shake = () => {
    if (!motionSafe) return;
    shakeAnim.current?.stop();
    shakeX.set(-distances.shift);
    shakeAnim.current = animate(shakeX, 0, springs.recoil);
  };

  const choose = (value: number) => {
    if (inert || sending || outcome !== "pending") return;
    const matched = value === live.number;
    const misses = matched ? s.misses : s.misses + 1;
    const attempt: MatchAttempt = {
      chosen: value,
      number: live.number,
      matched,
      misses,
    };
    choiceSeq.current += 1;
    const choice: Choice = { value, matched, seq: choiceSeq.current };
    onAttempt?.(attempt);
    if (matched) {
      update({ outcome: "approved", choice });
      onApprove?.(attempt);
      setAnnouncement(
        `Approved. ${value} matched. Signing you in to ${product}.`,
      );
      emit({
        outcome: "approved",
        number: live.number,
        misses,
        lockReason: null,
      });
      return;
    }
    shake();
    if (misses >= maxAttempts) {
      update({ outcome: "locked", lockReason: "attempts", misses, choice });
      onDeny?.("attempts");
      setAnnouncement(
        `That didn't match. ${plural(maxAttempts, "wrong choice", "wrong choices")}; the number is locked. Resend to get a new one.`,
      );
      emit({
        outcome: "locked",
        number: live.number,
        misses,
        lockReason: "attempts",
      });
      return;
    }
    update({ misses, choice });
    setAnnouncement(
      `That didn't match. ${plural(maxAttempts - misses, "try", "tries")} left.`,
    );
  };

  const report = () => {
    if (inert || sending) return;
    if (outcome !== "pending" && outcome !== "expired") return;
    update({ outcome: "locked", lockReason: "reported" });
    onDeny?.("reported");
    setAnnouncement(
      "Reported. The sign-in was denied and this attempt is locked.",
    );
    emit({
      outcome: "locked",
      number: live.number,
      misses: s.misses,
      lockReason: "reported",
    });
  };

  const resend = () => {
    if (inert || sending) return;
    if (outcome === "approved") return;
    if (outcome === "locked" && s.lockReason === "reported") return;
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    resendSeq.current += 1;
    const seq = resendSeq.current;
    const attempt = resendCount + 1;
    setResendCount(attempt);
    setSending(true);
    setSendError(null);
    setAnnouncement("Sending a new number.");
    const basedOn = propKey;
    const previous = live.number;
    Promise.resolve()
      .then(() => onResend({ attempt, previous, signal: ac.signal }))
      .then((result) => {
        if (seq !== resendSeq.current || ac.signal.aborted) return;
        const t = nowMs();
        const seed = 1717 + attempt * 31;
        const base: MatchChallengeInput = result ?? makeMatchChallenge(seed);
        const n = clamp(Math.round(base.number), 0, 99);
        let list = base.candidates ?? makeMatchCandidates(n, seed);
        if (!list.includes(n)) list = [...list, n];
        const next: Live = {
          key: `r:${attempt}:${n}|${list.join(",")}`,
          number: n,
          candidates: list,
          expiresAt: base.expiresAt ?? t + lifetime,
          issuedAt: t,
        };
        setReplacement({ basedOn, live: next });
        setClock(t);
        setSending(false);
        setActiveIndex(0);
        setAnnouncement(
          `New number sent: ${n}. Open your ${product} app and choose it.`,
        );
        onChange?.({
          outcome: "pending",
          number: n,
          misses: 0,
          lockReason: null,
        });
      })
      .catch((err: unknown) => {
        if (seq !== resendSeq.current || isAbort(err)) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "The number didn't send.";
        setSending(false);
        setSendError(message);
        setAnnouncement(`The number didn't send. ${message}`);
      });
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onNav = (event: React.KeyboardEvent, index: number) => {
    const count = live.candidates.length;
    if (count === 0) return;
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = index - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = count - 1;
    else return;
    event.preventDefault();
    const target = (to + count) % count;
    candidateNodes.current.get(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const canResend =
    ready &&
    outcome !== "approved" &&
    !(outcome === "locked" && s.lockReason === "reported");
  const headerWord = !ready
    ? status === "loading"
      ? "sending push"
      : "not sent"
    : sending
      ? "resending"
      : outcome === "pending"
        ? `expires in ${spanWord(left)}`
        : outcome;

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
      style={{
        height,
        ["--nm-accent" as string]: accentVar,
        ["--nm-wash" as string]: `color-mix(in oklab, ${accentVar} 12%, transparent)`,
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Smartphone aria-hidden className="size-4 shrink-0 text-ink-3" />
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        <p
          aria-hidden
          className={cn(
            "flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase",
            outcome === "approved" && ready
              ? "text-success"
              : outcome === "locked" && ready
                ? "text-danger"
                : outcome === "expired" && ready && !sending
                  ? "text-warn"
                  : "text-ink-3",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              outcome === "approved" && ready
                ? "bg-success"
                : outcome === "locked" && ready
                  ? "bg-danger"
                  : outcome === "expired" && ready && !sending
                    ? "bg-warn"
                    : "bg-(--nm-accent)",
            )}
          />
          {headerWord}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The push didn&apos;t reach your phone.
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
          <div
            aria-hidden
            className={cn(
              "flex flex-col gap-4 p-4",
              phonePosition === "right" && "@min-[40rem]:flex-row",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-4 @min-[40rem]:p-5">
              <Skeleton className="h-3 w-24" />
              <div className="flex items-center gap-4 py-5">
                <Skeleton className="h-[88px] w-[112px] rounded-3" />
                <Skeleton className="size-12 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/4" />
              <p className="mt-auto border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Sending a push to your phone
              </p>
            </div>
            <div
              className={cn(
                "mx-auto flex w-full max-w-[300px] flex-col gap-3 rounded-[22px] border border-hairline-strong bg-surface-0 p-4",
                phonePosition === "right" &&
                  "@min-[40rem]:w-[280px] @min-[40rem]:shrink-0",
              )}
            >
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-16 rounded-3" />
                <Skeleton className="h-16 rounded-3" />
                <Skeleton className="h-16 rounded-3" />
              </div>
              <Skeleton className="h-9 rounded-3" />
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-4 p-4",
              phonePosition === "right" &&
                "@min-[40rem]:flex-row @min-[40rem]:items-stretch",
            )}
          >
            <SignInPane
              outcome={outcome}
              lockReason={s.lockReason}
              number={live.number}
              secondsLeft={secondsLeft}
              fraction={fraction}
              misses={s.misses}
              maxAttempts={maxAttempts}
              sending={sending}
              sendError={sendError}
              canResend={canResend}
              product={product}
              account={account}
              digitStyle={digitStyle}
              motionSafe={motionSafe}
              inert={inert}
              resendRef={resendRef}
              onResend={resend}
            />
            <div
              className={cn(
                "flex min-w-0 flex-col justify-center",
                phonePosition === "right" &&
                  "@min-[40rem]:w-[280px] @min-[40rem]:shrink-0",
              )}
            >
              <PhonePane
                outcome={outcome}
                lockReason={s.lockReason}
                candidates={live.candidates}
                choice={s.choice}
                misses={s.misses}
                maxAttempts={maxAttempts}
                sending={sending}
                clock={clock}
                source={source}
                product={product}
                motionSafe={motionSafe}
                inert={inert}
                shakeX={shakeX}
                activeIndex={clamp(
                  activeIndex,
                  0,
                  Math.max(0, live.candidates.length - 1),
                )}
                candidateRef={(i, node) => {
                  if (node) candidateNodes.current.set(i, node);
                  else candidateNodes.current.delete(i);
                }}
                onFocusCandidate={setActiveIndex}
                onChoose={choose}
                onNav={onNav}
                onReport={report}
              />
            </div>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
