"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  type Transition,
} from "motion/react";
import {
  ExternalLink,
  KeyRound,
  MailQuestion,
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

export type InboxState = "sent" | "verified" | "expired";
export type InboxIllustration = "envelope" | "paper-plane" | "bell";
export type InboxAccent = "cobalt" | "signal" | "success";
export type InboxStatus = "ready" | "loading" | "error";

export type InboxChange = {
  from: InboxState;
  to: InboxState;
  /** What moved it: a resend, a matching code, or a code the host must check. */
  source: "resend" | "code";
};

export type InboxWaitProps = {
  /** The drawing beside the text: a closed envelope with a flag, a paper plane on its way, or a bell. @default "envelope" */
  illustration?: InboxIllustration;
  /** Offer "Entered the code instead?" with a row of code cells under it. @default true */
  codeEntry?: boolean;
  /** The colour of the flag, the draining bar and the tick: blue, the signal hue, or green. @default "cobalt" */
  accent?: InboxAccent;
  /** Where the link went. Empty shows the no-address state. @default defaultInboxEmail */
  email?: string;
  /** The product the link signs in to, shown in the header and the mail button. @default "Basinworks" */
  product?: string;
  /** How long Resend stays disabled after a send, in seconds. @default 30 */
  resendSeconds?: number;
  /** When the link was sent, in ms; the countdown counts from it. @default defaultInboxSentAt */
  sentAt?: number;
  /** The moment the surface counts from, in ms — never read from the clock. @default defaultInboxNow */
  now?: number;
  /** How many cells the code has. @default 6 */
  codeLength?: number;
  /** The code the cells accept: a matching entry verifies, any other shakes and clears. Empty leaves the check to the host, and the cells wait. @default defaultInboxCode */
  expectedCode?: string;
  /** Controlled state: waiting on a sent link, verified, or expired. */
  state?: InboxState;
  /** Initial state when uncontrolled. @default "sent" */
  defaultState?: InboxState;
  /** Fires from a resend or a code that moved the state, with the change. */
  onChange?: (state: InboxState, change: InboxChange) => void;
  /** Resend was pressed once the countdown allowed it. */
  onResend?: () => void;
  /** Every cell is filled; the code is passed whether or not it matched. */
  onCode?: (code: string) => void;
  /** Change was pressed beside the address, or Add an address in the empty state. */
  onChangeEmail?: () => void;
  /** Open mail app was pressed. */
  onOpenMail?: () => void;
  /** Whether the link has been sent: a short progress while sending, a retry when it failed. @default "ready" */
  status?: InboxStatus;
  /** Try again was pressed after a failed send. */
  onRetry?: () => void;
  /** Prints the sent time under the status line. @default UTC "HH:MM" */
  formatTime?: (at: number) => string;
  /** The heading. @default "Check your inbox" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the body scrolls inside it when the cells open. @default 320 */
  height?: number;
  /** Read only: nothing can be resent, typed or opened. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Monday 12 October 2026, 09:14:30 UTC. */
export const defaultInboxNow = Date.UTC(2026, 9, 12, 9, 14, 30);
/** Six seconds before `defaultInboxNow`, so the countdown opens at 24. */
export const defaultInboxSentAt = defaultInboxNow - 6_000;
export const defaultInboxEmail = "mara.lind@basinworks.co";
/** The code the seeded link carries. */
export const defaultInboxCode = "482913";

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<InboxAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const SHAKE = [0, -6, 6, -4, 4, -2, 2, 0];
const TICK_MS = 1000;
const LANDING_MS = 160;

const noopSubscribe = () => () => {};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const sanitize = (raw: string, max: number) =>
  raw.replace(/\D/g, "").slice(0, max);

const utcTime = (at: number) => {
  const d = new Date(at);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

const STATE_LINE: Record<InboxState, string> = {
  sent: "Waiting for the link to be opened",
  verified: "Link opened. You're signed in.",
  expired: "That link has expired",
};

/* ----------------------------------------------------------------------- */
/*                               Illustrations                              */
/* ----------------------------------------------------------------------- */

type PictureProps = {
  kind: InboxIllustration;
  state: InboxState;
  /** True until a beat after mount, so the flag rises on load. */
  lowered: boolean;
  /** Bumps on every send so the picture plays its arrival again. */
  sentSeq: number;
  motionSafe: boolean;
  className?: string;
};

function Tick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.g
      initial={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? { ...springs.recoil, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
      style={{ transformBox: "view-box", originX: "56px", originY: "40px" }}
    >
      <circle
        cx={56}
        cy={40}
        r={9.5}
        fill="var(--iw-accent)"
        stroke="var(--bg-1)"
        strokeWidth={2}
      />
      <motion.path
        d="M51.5 40.2 54.6 43.2 60.5 37.2"
        fill="none"
        stroke="var(--bg-1)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={
          motionSafe
            ? { ...springs.flick, delay: durations.fast }
            : { duration: 0 }
        }
      />
    </motion.g>
  );
}

function Envelope({ state, lowered, motionSafe }: PictureProps) {
  const open = state === "verified";
  const up = state !== "expired" && !lowered;
  const spring = (s: Transition): Transition =>
    motionSafe ? s : { duration: 0 };
  return (
    <>
      <rect
        x={6}
        y={12}
        width={52}
        height={30}
        rx={3}
        fill="var(--bg-2)"
        stroke="var(--ink-3)"
        strokeWidth={1.5}
      />
      {/* The flap turns over its top edge; behind the letter so an open flap
          sits where a real one would. */}
      <motion.path
        d="M6 12 32 30 58 12"
        fill="var(--bg-2)"
        stroke="var(--ink-3)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        initial={false}
        animate={{ scaleY: open ? -1 : 1 }}
        transition={spring(springs.snap)}
        style={{ transformBox: "view-box", originX: "32px", originY: "12px" }}
      />
      <motion.g
        initial={false}
        animate={{ y: open ? -9 : 6, opacity: open ? 1 : 0 }}
        transition={{
          y: spring(springs.recoil),
          opacity: { duration: durations.fast, delay: open ? 0.06 : 0 },
        }}
      >
        <rect
          x={15}
          y={4}
          width={34}
          height={24}
          rx={2}
          fill="var(--bg-1)"
          stroke="var(--ink-3)"
          strokeWidth={1.5}
        />
        <path
          d="M21 11h22M21 16h22M21 21h12"
          stroke="var(--iw-accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </motion.g>
      <path
        d="M6 12 32 30 58 12v30H6z"
        fill="var(--bg-2)"
        stroke="var(--ink-3)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* The flag: up while a link is out, down once it has expired. */}
      <motion.g
        initial={false}
        animate={{ rotate: up ? 0 : 90 }}
        transition={spring(springs.snap)}
        style={{ transformBox: "view-box", originX: "58px", originY: "10px" }}
      >
        <path
          d="M58 10V-4"
          stroke="var(--ink-2)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <path d="M58 -4h9l-2.5 3.5L67 3h-9z" fill="var(--iw-accent)" />
      </motion.g>
    </>
  );
}

function PaperPlane({ state, lowered, sentSeq, motionSafe }: PictureProps) {
  const flying = state === "sent" && !lowered;
  const landed = state === "verified";
  return (
    <>
      <motion.path
        key={`${sentSeq}-${lowered ? "l" : "r"}`}
        d="M4 40c8 2 13-4 18-9 4-4 7-6 11-7"
        fill="none"
        stroke="var(--ink-3)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="3 3"
        initial={motionSafe ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
        animate={{
          pathLength: 1,
          opacity: state === "expired" ? 0.35 : landed ? 0 : 1,
        }}
        transition={
          motionSafe
            ? {
                pathLength: { ...springs.glide, delay: durations.fast },
                opacity: { duration: durations.base },
              }
            : { duration: 0 }
        }
      />
      <motion.g
        initial={false}
        animate={{
          rotate: state === "expired" ? 16 : flying ? -12 : 0,
          y: state === "expired" ? 5 : flying ? -3 : 0,
          opacity: state === "expired" ? 0.55 : 1,
        }}
        transition={
          motionSafe
            ? {
                rotate: springs.snap,
                y: springs.snap,
                opacity: { duration: durations.base },
              }
            : { duration: 0 }
        }
        style={{ transformBox: "view-box", originX: "32px", originY: "24px" }}
      >
        <path
          d="M6 22 58 6 42 44 31 30z"
          fill="var(--bg-2)"
          stroke="var(--ink-3)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path
          d="M31 30 58 6"
          stroke="var(--ink-3)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <path
          d="M31 30 28 40"
          stroke="var(--iw-accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </motion.g>
    </>
  );
}

function Bell({ state, lowered, sentSeq, motionSafe }: PictureProps) {
  const ringing = state === "sent" && !lowered;
  return (
    <>
      <motion.g
        key={`${sentSeq}-${lowered ? "l" : "r"}`}
        initial={motionSafe && ringing ? { rotate: 22 } : false}
        animate={{
          rotate: 0,
          opacity: state === "expired" ? 0.55 : 1,
        }}
        transition={
          motionSafe
            ? { rotate: springs.recoil, opacity: { duration: durations.base } }
            : { duration: 0 }
        }
        style={{ transformBox: "view-box", originX: "32px", originY: "6px" }}
      >
        <path
          d="M32 6v3"
          stroke="var(--ink-3)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        <path
          d="M18 34c2-3 3-6 3-11 0-7 5-13 11-13s11 6 11 13c0 5 1 8 3 11z"
          fill="var(--bg-2)"
          stroke="var(--ink-3)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path d="M14 34h36" stroke="var(--ink-3)" strokeWidth={1.5} />
        <circle cx={32} cy={40} r={4} fill="var(--iw-accent)" />
      </motion.g>
      <AnimatePresence>
        {ringing ? (
          <motion.g
            key="waves"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <path
              d="M9 14c-2 4-2 8 0 12M55 14c2 4 2 8 0 12"
              fill="none"
              stroke="var(--iw-accent)"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </motion.g>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Picture(props: PictureProps) {
  const { kind, state, sentSeq, motionSafe, className } = props;
  const verified = state === "verified";
  return (
    // The card settles once the link is opened: a landing on recoil.
    <motion.div
      key={verified ? "verified" : `waiting-${sentSeq}`}
      aria-hidden
      initial={
        motionSafe && verified ? { scale: 1.08 } : motionSafe ? { y: 2 } : false
      }
      animate={{ scale: 1, y: 0 }}
      transition={motionSafe ? springs.recoil : { duration: 0 }}
      className={cn("relative shrink-0", className)}
    >
      <svg
        viewBox="-2 -8 76 56"
        className="size-full overflow-visible"
        fill="none"
      >
        {kind === "paper-plane" ? (
          <PaperPlane {...props} />
        ) : kind === "bell" ? (
          <Bell {...props} />
        ) : (
          <Envelope {...props} />
        )}
        <AnimatePresence>
          {verified ? <Tick key="tick" motionSafe={motionSafe} /> : null}
        </AnimatePresence>
      </svg>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Code cells                                */
/* ----------------------------------------------------------------------- */

type Entry = { from: "type" | "paste"; start: number };

type CellsProps = {
  length: number;
  code: string;
  entry: Entry;
  locked: boolean;
  checking: boolean;
  failed: boolean;
  shakeSeq: number;
  motionSafe: boolean;
  onWrite: (at: number, digits: string, from: "type" | "paste") => void;
  onErase: (at: number) => void;
};

function CodeCells({
  length,
  code,
  entry,
  locked,
  checking,
  failed,
  shakeSeq,
  motionSafe,
  onWrite,
  onErase,
}: CellsProps) {
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const step = cascade(length);

  const focusCell = (i: number) => {
    inputs.current[clamp(i, 0, length - 1)]?.focus();
  };

  // The anchor is the first empty cell, so Tab lands where typing continues.
  const anchor = Math.min(code.length, length - 1);

  React.useEffect(() => {
    if (!shakeSeq || !motionSafe) return;
    const node = rowRef.current;
    if (!node) return;
    const controls = animate(
      node,
      { x: SHAKE },
      { duration: durations.slow, ease: easings.move },
    );
    return () => controls.stop();
  }, [shakeSeq, motionSafe]);

  const handleChange = (i: number, raw: string) => {
    if (locked) return;
    const old = code[i] ?? "";
    const typed = sanitize(raw, length);
    const digits = typed.length > 1 && old ? typed.replace(old, "") : typed;
    if (!digits) return;
    const at = Math.min(i, code.length);
    onWrite(at, digits, digits.length > 1 ? "paste" : "type");
    focusCell(at + digits.length);
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    event.preventDefault();
    if (locked) return;
    const digits = sanitize(event.clipboardData.getData("text"), length);
    if (!digits) return;
    const at = Math.min(i, code.length);
    onWrite(at, digits, "paste");
    focusCell(at + digits.length);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    switch (event.key) {
      case "Backspace": {
        event.preventDefault();
        if (locked) return;
        const at = Math.max(0, i < code.length ? i : i - 1);
        onErase(at);
        focusCell(at);
        break;
      }
      case "ArrowLeft":
        event.preventDefault();
        focusCell(i - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        focusCell(Math.min(anchor, i + 1));
        break;
      case "Home":
        event.preventDefault();
        focusCell(0);
        break;
      case "End":
        event.preventDefault();
        focusCell(anchor);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={rowRef}
      data-cells=""
      role="group"
      aria-label={`${length}-digit code`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length }, (_, i) => {
        const digit = code[i] ?? "";
        const delay =
          entry.from === "paste" && i >= entry.start
            ? r3((i - entry.start) * step)
            : 0;
        return (
          <span
            key={i}
            className={cn(
              "relative h-10 w-8 rounded-2 border bg-surface-0 transition-colors duration-200 @min-[28rem]:w-9",
              failed
                ? "border-danger"
                : checking
                  ? "border-(--iw-accent)"
                  : digit
                    ? "border-hairline-strong"
                    : "border-hairline",
            )}
          >
            <input
              ref={(node) => {
                inputs.current[i] = node;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1} of ${length}`}
              aria-invalid={failed || undefined}
              value={digit}
              readOnly={locked}
              tabIndex={i === anchor ? 0 : -1}
              onChange={(event) => handleChange(i, event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, i)}
              onPaste={(event) => handlePaste(event, i)}
              onFocus={(event) => event.target.select()}
              // The input keeps the real value for the caret and assistive
              // technology; the visible digit is the animated span over it.
              className={cn(
                "absolute inset-0 size-full rounded-2 bg-transparent text-center font-mono text-base text-transparent caret-transparent selection:bg-transparent",
                FOCUS_RING,
              )}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-base font-medium text-foreground tabular-nums"
            >
              <AnimatePresence initial={false}>
                {digit ? (
                  <motion.span
                    key={digit}
                    initial={
                      motionSafe
                        ? { scale: 0.5, opacity: 0, y: distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.flick,
                            delay,
                            opacity: { duration: durations.fast, delay },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    {digit}
                  </motion.span>
                ) : (
                  <span
                    key="dot"
                    className="size-1 rounded-full bg-hairline-strong"
                  />
                )}
              </AnimatePresence>
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * The pause after a magic link is sent. A drawn envelope with a flag — or a
 * paper plane, or a bell — beside the address the link went to, a status
 * line, a Resend button and an Open mail app button, and, under them, the
 * option of entering the code from the mail instead.
 *
 * The flag rises on `springs.snap` when the link is out and drops when it
 * expires. Resend starts disabled behind a bar that drains across its foot,
 * one linear second at a time while the number counts down, and the button
 * wakes on `springs.flick` when the bar is gone. When the host reports that
 * the link was used, the envelope's flap turns over on `springs.snap`, the
 * letter rises out of it and the whole picture settles on `springs.recoil`
 * as a tick draws in on `springs.flick`. Opening the code row glides it into
 * place on `springs.glide`; a pasted code fills its cells in a `cascade`,
 * each digit landing on `springs.flick`, and a wrong code shakes the row on
 * the move ease and clears it.
 *
 * Every button is a button; the cells are a group of one-character textboxes
 * with one tab stop that advance as digits land, Backspace steps back, and
 * Left/Right, Home and End move between them. Under reduced motion nothing
 * rises, turns or travels — the flag, flap and digits appear in place and
 * the bar steps — but every state is still reached and announced.
 */
export function InboxWait({
  illustration = "envelope",
  codeEntry = true,
  accent = "cobalt",
  email = defaultInboxEmail,
  product = "Basinworks",
  resendSeconds = 30,
  sentAt = defaultInboxSentAt,
  now = defaultInboxNow,
  codeLength = 6,
  expectedCode = defaultInboxCode,
  state,
  defaultState = "sent",
  onChange,
  onResend,
  onCode,
  onChangeEmail,
  onOpenMail,
  status = "ready",
  onRetry,
  formatTime = utcTime,
  title = "Check your inbox",
  label,
  height = 320,
  disabled = false,
  className,
}: InboxWaitProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const cellsId = `${uid}-cells`;

  const [own, setOwn] = React.useState<InboxState>(defaultState);
  const current = state ?? own;
  const ready = status === "ready";
  const hasEmail = email.trim().length > 0;
  const inert = disabled || !ready;

  // False for the server render and hydration; true once mounted, so the
  // countdown and the ambient dot only ever run on a live page.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const [awake, setAwake] = React.useState(true);
  const [elapsed, setElapsed] = React.useState(0);
  const [ownSentAt, setOwnSentAt] = React.useState<number | null>(null);
  const [sentSeq, setSentSeq] = React.useState(0);
  const [lowered, setLowered] = React.useState(true);
  const [codeOpen, setCodeOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [entry, setEntry] = React.useState<Entry>({ from: "type", start: 0 });
  const [checking, setChecking] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [shakeSeq, setShakeSeq] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pausedAt = React.useRef<number | null>(null);
  const seenSeq = React.useRef(0);
  const timers = React.useRef(new Set<number>());

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  /* ------------------------- host-driven changes ------------------------ */

  // A new `sentAt` from the host is a fresh send: the countdown restarts.
  const [seenSentAt, setSeenSentAt] = React.useState(sentAt);
  if (seenSentAt !== sentAt) {
    setSeenSentAt(sentAt);
    setOwnSentAt(null);
    setElapsed(0);
    setSentSeq((s) => s + 1);
    setLowered(true);
  }

  /** Tidies the code row for a state the surface has just reached. */
  const settle = (to: InboxState) => {
    if (to === "verified") {
      setCodeOpen(false);
      setChecking(false);
      setFailed(false);
    } else if (checking) {
      // The host answered a waiting code with anything but verified.
      setChecking(false);
      setFailed(true);
      setShakeSeq((s) => s + 1);
    }
  };

  // The host moved the state: say so, and tidy the code row. A move made
  // here marks `seenState` itself, so it is not announced twice.
  const [seenState, setSeenState] = React.useState(current);
  if (seenState !== current) {
    setSeenState(current);
    setAnnouncement(STATE_LINE[current]);
    settle(current);
  }

  /* ------------------------------ countdown ----------------------------- */

  const effSentAt = ownSentAt ?? sentAt;
  const remaining = clamp(
    Math.ceil(resendSeconds - (now + elapsed - effSentAt) / 1000),
    0,
    Math.max(0, resendSeconds),
  );
  const canResend = remaining === 0 || current === "expired";
  const counting =
    live && awake && ready && current === "sent" && remaining > 0;

  // The flag rises a beat after mount and after every send, so a page that
  // opens on "sent" shows the link going out rather than a flag that was
  // always up.
  React.useEffect(() => {
    if (!live || !lowered) return;
    const id = window.setTimeout(() => setLowered(false), 80);
    return () => window.clearTimeout(id);
  }, [live, lowered]);

  // Ticks only while someone could see them: a hidden tab or an off-screen
  // surface stops the interval, and the first tick after it resumes catches
  // up the time that passed.
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

  React.useEffect(() => {
    // A fresh send starts from nothing; only a pause within one countdown
    // is caught up.
    if (seenSeq.current !== sentSeq) {
      seenSeq.current = sentSeq;
      pausedAt.current = null;
    }
    if (!counting) return;
    let last = pausedAt.current ?? performance.now();
    pausedAt.current = null;
    const id = window.setInterval(() => {
      const t = performance.now();
      const delta = t - last;
      last = t;
      setElapsed((e) => e + delta);
    }, TICK_MS);
    return () => {
      window.clearInterval(id);
      pausedAt.current = performance.now();
    };
  }, [counting, sentSeq]);

  // The moment the bar is gone, say that Resend is back.
  const [seenCanResend, setSeenCanResend] = React.useState(canResend);
  if (seenCanResend !== canResend) {
    setSeenCanResend(canResend);
    if (canResend && current === "sent") setAnnouncement("You can resend now.");
  }

  /* ------------------------------- changes ------------------------------ */

  const move = (to: InboxState, source: InboxChange["source"]) => {
    if (to === current) return;
    if (state === undefined) setOwn(to);
    setSeenState(to);
    settle(to);
    onChange?.(to, { from: current, to, source });
  };

  const resend = () => {
    if (inert || !canResend || !hasEmail) return;
    setOwnSentAt(now + elapsed);
    setSentSeq((s) => s + 1);
    setLowered(true);
    setCode("");
    setFailed(false);
    setChecking(false);
    move("sent", "resend");
    onResend?.();
    setAnnouncement(`Link sent again to ${email}.`);
  };

  const toggleCode = () => {
    if (inert) return;
    setCodeOpen((open) => !open);
    setAnnouncement(codeOpen ? "Code entry closed." : "Enter the code.");
  };

  const finish = (full: string) => {
    onCode?.(full);
    if (expectedCode === "") {
      setChecking(true);
      setAnnouncement("Checking the code.");
      return;
    }
    if (full === expectedCode) {
      setAnnouncement("Code accepted.");
      move("verified", "code");
      return;
    }
    setFailed(true);
    setShakeSeq((s) => s + 1);
    setAnnouncement("That code didn't match. Try again.");
  };

  const write = (at: number, digits: string, from: "type" | "paste") => {
    if (inert || checking || failed) return;
    const next = (
      code.slice(0, at) +
      digits +
      code.slice(at + digits.length)
    ).slice(0, codeLength);
    setCode(next);
    setEntry({ from, start: at });
    if (next.length === codeLength) {
      // The check waits for the last digit to land, so a cascade finishes
      // before the row answers.
      const wait =
        motionSafe && from === "paste"
          ? (codeLength - 1 - at) * cascade(codeLength) * 1000 + LANDING_MS
          : 0;
      later(() => finish(next), wait);
    }
  };

  const erase = (at: number) => {
    if (inert || checking) return;
    setFailed(false);
    setCode((c) => c.slice(0, at) + c.slice(at + 1));
  };

  // A failed code clears itself after the shake and hands focus back.
  React.useEffect(() => {
    if (!failed) return;
    const id = window.setTimeout(
      () => {
        setFailed(false);
        setCode("");
        setEntry({ from: "type", start: 0 });
        rootRef.current
          ?.querySelector<HTMLInputElement>("[data-cells] input")
          ?.focus();
      },
      motionSafe ? durations.slow * 1000 + 200 : 400,
    );
    return () => window.clearTimeout(id);
  }, [failed, motionSafe]);

  /* -------------------------------- render ------------------------------ */

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const pct = resendSeconds > 0 ? (remaining / resendSeconds) * 100 : 0;
  const barTransition = motionSafe
    ? { duration: TICK_MS / 1000, ease: easings.linear }
    : { duration: 0 };

  const button =
    "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors";

  const body = !ready ? (
    status === "loading" ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
        <Picture
          kind={illustration}
          state="sent"
          lowered
          sentSeq={0}
          motionSafe={motionSafe}
          className="h-12 w-16 opacity-60"
        />
        <p className="text-sm text-ink-2">Sending your link to {email}</p>
        <div
          role="progressbar"
          aria-label="Sending"
          aria-valuetext="Sending"
          className="h-1 w-40 max-w-full overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            className="block h-full rounded-full bg-(--iw-accent)"
            initial={{ width: "8%" }}
            animate={{ width: "82%" }}
            transition={
              motionSafe ? springs.drift : { duration: durations.base }
            }
          />
        </div>
      </div>
    ) : (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          The link couldn&apos;t be sent.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              button,
              "border border-hairline text-foreground hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    )
  ) : !hasEmail ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6 text-center">
      <MailQuestion aria-hidden className="size-5 text-ink-3" />
      <p className="text-sm text-ink-2">No address to send a link to yet.</p>
      <button
        type="button"
        onClick={() => {
          if (!disabled) onChangeEmail?.();
        }}
        aria-disabled={disabled || undefined}
        className={cn(
          button,
          "mt-1 border border-hairline text-foreground hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        Add an address
      </button>
    </div>
  ) : (
    <div className="flex flex-col gap-3 px-4 pb-4 @min-[28rem]:flex-row @min-[28rem]:gap-5">
      <Picture
        kind={illustration}
        state={current}
        lowered={lowered}
        sentSeq={sentSeq}
        motionSafe={motionSafe}
        className="hidden h-16 w-[5.5rem] @min-[28rem]:block"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start gap-3">
          <Picture
            kind={illustration}
            state={current}
            lowered={lowered}
            sentSeq={sentSeq}
            motionSafe={motionSafe}
            className="mt-0.5 h-11 w-14 @min-[28rem]:hidden"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug text-ink-2">
              {current === "verified"
                ? "The link we sent to"
                : "We sent a sign-in link to"}
            </p>
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] leading-snug">
              <span className="font-medium break-all text-foreground">
                {email}
              </span>
              {current !== "verified" ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!inert) onChangeEmail?.();
                  }}
                  aria-disabled={inert || undefined}
                  className={cn(
                    "rounded-1 text-xs text-cobalt-bright underline-offset-2 hover:underline",
                    inert && "cursor-default text-ink-3 hover:no-underline",
                    FOCUS_RING,
                  )}
                >
                  Change
                </button>
              ) : null}
            </p>
          </div>
        </div>

        {/* The status line: one slot that cross-fades between states. */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex size-2 shrink-0 items-center justify-center">
            <AnimatePresence initial={false}>
              <motion.span
                key={current}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
                className={cn(
                  "absolute inset-0 rounded-full",
                  current === "verified"
                    ? "bg-success"
                    : current === "expired"
                      ? "bg-warn"
                      : "bg-(--iw-accent)",
                  current === "sent" &&
                    awake &&
                    motionSafe &&
                    "motion-safe:animate-pulse",
                )}
              />
            </AnimatePresence>
          </span>
          <div className="relative min-w-0 flex-1">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.p
                key={current}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                className="truncate text-xs text-ink-2"
              >
                {STATE_LINE[current]}
              </motion.p>
            </AnimatePresence>
          </div>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            sent {formatTime(effSentAt)}
          </span>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {current === "verified" ? (
            <motion.p
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                duration: durations.base,
                ease: easings.enter,
                delay: durations.fast,
              }}
              className="text-xs text-ink-3"
            >
              You can close this tab and go back to {product}.
            </motion.p>
          ) : (
            <motion.div
              key="actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className="flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resend}
                  aria-disabled={inert || !canResend || undefined}
                  aria-describedby={canResend ? undefined : `${uid}-wait`}
                  className={cn(
                    button,
                    "relative overflow-hidden border border-hairline",
                    canResend && !inert
                      ? "text-foreground hover:bg-surface-2"
                      : "cursor-default text-ink-3",
                    FOCUS_RING,
                  )}
                >
                  {/* The label wakes on flick the moment the bar is gone;
                      the button itself stays put, so focus does too. */}
                  <motion.span
                    key={canResend ? "ready" : "waiting"}
                    initial={motionSafe && canResend ? { scale: 0.9 } : false}
                    animate={{ scale: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                    className="inline-flex items-center gap-1.5 tabular-nums"
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    {canResend ? "Resend link" : `Resend in ${remaining}s`}
                  </motion.span>
                  {/* The bar drains one linear second at a time, in step with
                      the number; under reduced motion it steps instead. */}
                  <AnimatePresence>
                    {!canResend ? (
                      <motion.span
                        key="bar"
                        aria-hidden
                        className="absolute bottom-0 left-0 h-[3px] rounded-r-full bg-(--iw-accent)"
                        initial={false}
                        animate={{ width: `${r3(pct)}%` }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={barTransition}
                      />
                    ) : null}
                  </AnimatePresence>
                </button>
                <span id={`${uid}-wait`} className="sr-only">
                  Available in {remaining} seconds.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!inert) onOpenMail?.();
                  }}
                  aria-disabled={inert || undefined}
                  className={cn(
                    button,
                    "bg-primary text-primary-foreground hover:opacity-90",
                    inert && "cursor-default opacity-70 hover:opacity-70",
                    FOCUS_RING,
                  )}
                >
                  <ExternalLink aria-hidden className="size-3.5" />
                  Open mail app
                </button>
              </div>

              {codeEntry ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={toggleCode}
                    aria-expanded={codeOpen}
                    aria-controls={cellsId}
                    aria-disabled={inert || undefined}
                    className={cn(
                      "inline-flex w-fit items-center gap-1.5 rounded-1 text-xs text-ink-2 hover:text-foreground",
                      inert && "cursor-default text-ink-3 hover:text-ink-3",
                      FOCUS_RING,
                    )}
                  >
                    <KeyRound aria-hidden className="size-3.5" />
                    {codeOpen
                      ? "Enter the code from the mail"
                      : "Entered the code instead?"}
                  </button>
                  <AnimatePresence initial={false}>
                    {codeOpen ? (
                      <motion.div
                        key="cells"
                        id={cellsId}
                        initial={
                          motionSafe
                            ? { height: 0, opacity: 0 }
                            : { height: "auto", opacity: 0 }
                        }
                        animate={{ height: "auto", opacity: 1 }}
                        exit={
                          motionSafe
                            ? {
                                height: 0,
                                opacity: 0,
                                transition: exitFor(durations.base),
                              }
                            : {
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }
                        }
                        transition={
                          motionSafe
                            ? {
                                height: springs.glide,
                                opacity: { duration: durations.base },
                              }
                            : { duration: durations.base }
                        }
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col gap-1.5 p-[3px]">
                          <CodeCells
                            length={codeLength}
                            code={code}
                            entry={entry}
                            locked={inert || checking || failed}
                            checking={checking}
                            failed={failed}
                            shakeSeq={shakeSeq}
                            motionSafe={motionSafe}
                            onWrite={write}
                            onErase={erase}
                          />
                          <p className="text-[11px] text-ink-3">
                            {checking
                              ? "Checking the code"
                              : failed
                                ? "That code didn't match"
                                : "Paste it or type it; the row fills itself."}
                          </p>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
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
      style={{ height, ["--iw-accent" as string]: accentVar }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {product}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain">
        {body}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
