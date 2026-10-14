"use client";

import * as React from "react";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import {
  Check,
  Copy,
  Fingerprint,
  Lock,
  LockOpen,
  MessageSquare,
  RotateCcw,
  Smartphone,
  Timer,
  TriangleAlert,
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

export type StepUpMethodKind = "passkey" | "code" | "sms";

export type StepUpMethod = {
  id: string;
  /** What the method asks for: a passkey ceremony, a code from an app, or a code sent by text. */
  kind: StepUpMethodKind;
  /** The option's name, e.g. "Passkey". */
  label: string;
  /** One line under it: the device, the app, or the masked number. */
  detail: string;
  /** Marks the option the product would rather the person used. @default false */
  recommended?: boolean;
};

export type StepUpResult = { ok: true } | { ok: false; reason: string };

/** Confirms a method; `code` is the six digits when the method takes one. */
export type StepUpVerify = (
  method: StepUpMethod,
  code?: string,
) => Promise<StepUpResult>;

/** Sends a code for a method that needs one sent first (SMS). */
export type StepUpSend = (method: StepUpMethod) => Promise<void>;

export type StepUpDetail = {
  id: string;
  label: string;
  value: string;
  /** Printed in mono, for codes and numbers. @default false */
  mono?: boolean;
};

export type StepUpStatus = "ready" | "loading" | "error";
export type StepUpReveal = "down" | "centre" | "fade";
export type StepUpDensity = "compact" | "cozy" | "roomy";

export type StepUpCheckProps = {
  /** How far the frost blurs what it covers, in px. @default 6 */
  frost?: number;
  /** How the frost lifts once the person is confirmed: from the top down, from the middle outward, or a cross-fade. @default "down" */
  reveal?: StepUpReveal;
  /** Padding, type size and row heights. @default "cozy" */
  density?: StepUpDensity;
  /** The ways the person can confirm, in the order they are offered. @default defaultStepUpMethods */
  methods?: StepUpMethod[];
  /** Controlled chosen method, by id. */
  method?: string;
  /** Initial method when uncontrolled. @default the first method */
  defaultMethod?: string;
  /** A different method was chosen. */
  onMethodChange?: (method: StepUpMethod) => void;
  /** Checks a passkey ceremony or a six-digit code. @default defaultStepUpVerify, which accepts any passkey and the code defaultStepUpCode */
  verify?: StepUpVerify;
  /** Sends the SMS code. @default defaultStepUpSend, which pretends to */
  sendCode?: StepUpSend;
  /** Controlled: the time the confirmation lasts until, in ms; null is locked. */
  verifiedUntil?: number | null;
  /** Initial time when uncontrolled. @default null */
  defaultVerifiedUntil?: number | null;
  /** Fires when the person is confirmed, with the time it lasts until and the method, and again with null when it lapses or is locked. */
  onChange?: (
    verifiedUntil: number | null,
    method: StepUpMethod | null,
  ) => void;
  /** Cancel was pressed: the host returns to the previous screen. */
  onCancel?: () => void;
  /** How long a confirmation lasts, in minutes. @default 15 */
  verifiedFor?: number;
  /** The clock the countdown reads, in ms. Leave it out and the surface keeps its own, ticking once a second while confirmed and on screen, and reports a lapse through onChange; given, it reads the lapse from your clock and leaves onChange to you. */
  now?: number;
  /** The protected panel behind the frost. @default a bank-details panel built from defaultStepUpDetails */
  children?: React.ReactNode;
  /** Whether the methods have arrived: a skeleton card while loading, a retry when the code could not be sent. @default "ready" */
  status?: StepUpStatus;
  /** Try again was pressed after a failed send or load. */
  onRetry?: () => void;
  /** The heading over the protected panel. @default "Bank details" */
  title?: string;
  /** The product line under the heading. @default "Gaugeworks Pay" */
  eyebrow?: string;
  /** Why the check is asked for. @default "To view bank details, confirm it's you." */
  reason?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the panel scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be chosen or confirmed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultStepUpMethods: StepUpMethod[] = [
  {
    id: "passkey",
    kind: "passkey",
    label: "Passkey",
    detail: "Touch ID on this MacBook",
    recommended: true,
  },
  {
    id: "authenticator",
    kind: "code",
    label: "Authenticator code",
    detail: "Gaugeworks Authenticator",
  },
  {
    id: "sms",
    kind: "sms",
    label: "Text message",
    detail: "+44 7700 ••• 231",
  },
];

/** The six digits the default verifier accepts for a code. */
export const defaultStepUpCode = "482913";

/** Any passkey passes after a short ceremony; a code must match defaultStepUpCode. */
export const defaultStepUpVerify: StepUpVerify = (method, code) =>
  new Promise((resolve) => {
    window.setTimeout(
      () => {
        if (method.kind === "passkey") resolve({ ok: true });
        else if (code === defaultStepUpCode) resolve({ ok: true });
        else resolve({ ok: false, reason: "That code didn't match." });
      },
      method.kind === "passkey" ? 1150 : 620,
    );
  });

/** Pretends to send a text in under a second. */
export const defaultStepUpSend: StepUpSend = () =>
  new Promise((resolve) => {
    window.setTimeout(resolve, 850);
  });

/** Fieldline's payout account at Coldbrook Bank. */
export const defaultStepUpDetails: StepUpDetail[] = [
  { id: "holder", label: "Account holder", value: "Fieldline Services Ltd" },
  { id: "bank", label: "Bank", value: "Coldbrook Bank" },
  { id: "sort", label: "Sort code", value: "40-21-18", mono: true },
  { id: "number", label: "Account number", value: "31229470", mono: true },
  {
    id: "iban",
    label: "IBAN",
    value: "GB29 CBRK 4021 1831 2294 70",
    mono: true,
  },
  { id: "schedule", label: "Payout schedule", value: "Weekly, on Fridays" },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60";

const MIN = 60_000;
const CELLS = 6;
const RING_R = 19;
const RING_HOLD = 0.82;

const DENSITY: Record<
  StepUpDensity,
  {
    pad: string;
    gap: string;
    row: string;
    option: string;
    text: string;
    cell: string;
  }
> = {
  compact: {
    pad: "p-3",
    gap: "gap-2.5",
    row: "py-1.5",
    option: "py-1.5",
    text: "text-[12px]",
    cell: "h-10 w-8",
  },
  cozy: {
    pad: "p-4",
    gap: "gap-3",
    row: "py-2",
    option: "py-2",
    text: "text-[13px]",
    cell: "h-11 w-9",
  },
  roomy: {
    pad: "p-5",
    gap: "gap-4",
    row: "py-2.5",
    option: "py-2.5",
    text: "text-sm",
    cell: "h-12 w-10",
  },
};

const KIND_ICON: Record<
  StepUpMethodKind,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  passkey: Fingerprint,
  code: Smartphone,
  sms: MessageSquare,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const noopSubscribe = () => () => {};

/** Read only from event handlers and timers, never during render. */
const clockNow = () => Date.now();

/** "14:59" from a remaining span in ms, never negative. */
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

/** "14 minutes" or "40 seconds", for an announcement. */
const spoken = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 90) return `${Math.round(s / 60)} minutes`;
  if (s >= 60) return "a minute";
  return `${s} seconds`;
};

const FROST_CLIP: Record<
  "down" | "top" | "bottom",
  { locked: string; open: string }
> = {
  down: { locked: "inset(0% 0% 0% 0%)", open: "inset(100% 0% 0% 0%)" },
  top: { locked: "inset(0% 0% 50% 0%)", open: "inset(0% 0% 100% 0%)" },
  bottom: { locked: "inset(50% 0% 0% 0%)", open: "inset(100% 0% 0% 0%)" },
};

/* ----------------------------------------------------------------------- */
/*                                Lock badge                                */
/* ----------------------------------------------------------------------- */

function LockBadge({
  open,
  motionSafe,
}: {
  open: boolean;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className="relative block size-9 shrink-0 [perspective:320px]"
    >
      <motion.span
        className="relative block size-full [transform-style:preserve-3d]"
        initial={false}
        animate={motionSafe ? { rotateY: open ? 180 : 0 } : { rotateY: 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full border border-hairline-strong bg-surface-1 text-ink-2 transition-opacity duration-150 [backface-visibility:hidden]",
            !motionSafe && open && "opacity-0",
          )}
        >
          <Lock aria-hidden className="size-4" />
        </span>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[color-mix(in_oklab,var(--success)_14%,var(--bg-1))] text-success transition-opacity duration-150 [backface-visibility:hidden]",
            !motionSafe && !open && "opacity-0",
          )}
          style={{ transform: motionSafe ? "rotateY(180deg)" : undefined }}
        >
          <LockOpen aria-hidden className="absolute size-4 opacity-25" />
          <svg viewBox="0 0 16 16" className="size-4">
            <motion.path
              d="M3.5 8.6 6.6 11.6 12.5 4.8"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: open ? 1 : 0 }}
              transition={
                motionSafe
                  ? { ...springs.flick, delay: open ? 0.12 : 0 }
                  : { duration: 0 }
              }
            />
          </svg>
        </span>
      </motion.span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Code cells                                */
/* ----------------------------------------------------------------------- */

type CellsProps = {
  value: string;
  onChange: (next: string, pasted: boolean) => void;
  onComplete: (code: string) => void;
  disabled: boolean;
  invalid: boolean;
  passed: boolean;
  motionSafe: boolean;
  density: StepUpDensity;
  groupLabel: string;
  describedBy?: string;
  firstRef: (node: HTMLInputElement | null) => void;
};

function Cells({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  passed,
  motionSafe,
  density,
  groupLabel,
  describedBy,
  firstRef,
}: CellsProps) {
  const nodes = React.useRef<(HTMLInputElement | null)[]>([]);
  // Each digit's arrival stamp: a pasted run keys all six at once so they
  // pop in on one cascade; a typed digit keys only its own cell.
  const [stamps, setStamps] = React.useState<{ at: number[]; run: boolean }>({
    at: Array.from({ length: CELLS }, () => 0),
    run: false,
  });
  const serial = React.useRef(0);

  const digits = Array.from({ length: CELLS }, (_, i) => value[i] ?? "");
  const focusCell = (i: number) =>
    nodes.current[clamp(i, 0, CELLS - 1)]?.focus();

  const stamp = (indices: number[], run: boolean) => {
    serial.current += 1;
    const at = serial.current;
    setStamps((prev) => ({
      at: prev.at.map((v, i) => (indices.includes(i) ? at : v)),
      run,
    }));
  };

  const put = (digitsIn: string, from: number, pasted: boolean) => {
    const clean = digitsIn.replace(/\D/g, "");
    if (!clean) return;
    const next = digits.slice();
    const touched: number[] = [];
    for (let k = 0; k < clean.length && from + k < CELLS; k += 1) {
      next[from + k] = clean[k] ?? "";
      touched.push(from + k);
    }
    const joined = next.join("");
    stamp(touched, pasted && touched.length > 1);
    onChange(joined, pasted);
    const last = touched[touched.length - 1] ?? from;
    if (joined.length === CELLS && next.every((d) => d !== "")) {
      focusCell(last);
      onComplete(joined);
    } else {
      focusCell(last + 1);
    }
  };

  const step = cascade(CELLS);
  const delayFor = (i: number) => (stamps.run ? r3(i * step) : 0);

  return (
    <div
      role="group"
      aria-label={groupLabel}
      aria-describedby={describedBy}
      className="flex items-center gap-1.5"
    >
      {digits.map((digit, i) => (
        <span
          key={i}
          className={cn(
            "relative shrink-0 rounded-2 border bg-surface-0 transition-colors",
            DENSITY[density].cell,
            passed
              ? "border-[color-mix(in_oklab,var(--success)_55%,transparent)]"
              : invalid
                ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
                : digit
                  ? "border-hairline-strong"
                  : "border-hairline",
            i === 3 && "ml-1.5",
          )}
        >
          <input
            ref={(node) => {
              nodes.current[i] = node;
              if (i === 0) firstRef(node);
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${CELLS}`}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            value={digit}
            onChange={(event) => {
              const typed = event.target.value.replace(/\D/g, "");
              if (!typed) {
                const next = digits.slice();
                next[i] = "";
                onChange(next.join(""), false);
                return;
              }
              put(typed, i, typed.length > 1);
            }}
            onPaste={(event) => {
              event.preventDefault();
              put(event.clipboardData.getData("text"), i, true);
            }}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Backspace") {
                event.preventDefault();
                const next = digits.slice();
                if (digit) {
                  next[i] = "";
                  onChange(next.join(""), false);
                } else if (i > 0) {
                  next[i - 1] = "";
                  onChange(next.join(""), false);
                  focusCell(i - 1);
                }
              } else if (event.key === "Delete") {
                event.preventDefault();
                const next = digits.slice();
                next[i] = "";
                onChange(next.join(""), false);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                focusCell(i - 1);
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                focusCell(i + 1);
              } else if (event.key === "Home") {
                event.preventDefault();
                focusCell(0);
              } else if (event.key === "End") {
                event.preventDefault();
                focusCell(CELLS - 1);
              }
            }}
            // The input keeps the real value for the caret and assistive
            // technology; the visible digit is the animated span beside it.
            className={cn(
              "absolute inset-0 size-full rounded-2 bg-transparent text-center font-mono text-lg text-transparent caret-transparent selection:bg-transparent",
              FOCUS_RING,
            )}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-lg font-medium text-foreground tabular-nums"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {digit ? (
                <motion.span
                  key={`${i}-${stamps.at[i] ?? 0}`}
                  initial={
                    motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.blink) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          delay: delayFor(i),
                          opacity: {
                            duration: durations.blink,
                            delay: delayFor(i),
                          },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {digit}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
          {!digit ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto h-px w-3 bg-hairline-strong"
            />
          ) : null}
        </span>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Passkey ring                               */
/* ----------------------------------------------------------------------- */

function PasskeyRing({
  phase,
  motionSafe,
}: {
  phase: "idle" | "running" | "done" | "failed";
  motionSafe: boolean;
}) {
  const fill = phase === "running" ? RING_HOLD : phase === "done" ? 1 : 0;
  return (
    <span aria-hidden className="relative block size-12 shrink-0">
      <svg viewBox="0 0 48 48" className="size-full -rotate-90">
        <circle
          cx={24}
          cy={24}
          r={RING_R}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={2}
        />
        <motion.circle
          cx={24}
          cy={24}
          r={RING_R}
          fill="none"
          stroke={phase === "failed" ? "var(--danger)" : "var(--accent-bright)"}
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: fill, opacity: phase === "idle" ? 0 : 1 }}
          transition={
            motionSafe
              ? phase === "done"
                ? { ...springs.flick, opacity: { duration: durations.fast } }
                : { ...springs.glide, opacity: { duration: durations.fast } }
              : { duration: 0 }
          }
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {phase === "done" ? (
            <motion.span
              key="tick"
              className="text-success"
              initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.recoil : { duration: durations.fast }
              }
            >
              <Check aria-hidden className="size-5" />
            </motion.span>
          ) : (
            <motion.span
              key="print"
              className={cn(
                phase === "failed"
                  ? "text-danger"
                  : phase === "running"
                    ? "text-cobalt-bright"
                    : "text-ink-2",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              <Fingerprint aria-hidden className="size-5" />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Details panel                               */
/* ----------------------------------------------------------------------- */

function DetailsPanel({
  details,
  density,
  motionSafe,
  locked,
}: {
  details: StepUpDetail[];
  density: StepUpDensity;
  motionSafe: boolean;
  locked: boolean;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = (d: StepUpDetail) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(d.value).catch(() => {});
    }
    setCopied(d.id);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setCopied(null);
    }, 1400);
  };
  const dz = DENSITY[density];
  return (
    <dl
      className={cn(
        "grid grid-cols-1 gap-x-6 @min-[32rem]:grid-cols-2",
        dz.pad,
      )}
    >
      {details.map((d) => (
        <div
          key={d.id}
          className={cn(
            "flex items-center justify-between gap-3 border-b border-hairline",
            dz.row,
          )}
        >
          <div className="min-w-0">
            <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {d.label}
            </dt>
            <dd
              className={cn(
                "truncate text-foreground",
                dz.text,
                d.mono && "font-mono tabular-nums",
              )}
            >
              {d.value}
            </dd>
          </div>
          <button
            type="button"
            tabIndex={locked ? -1 : 0}
            onClick={() => copy(d)}
            aria-label={
              copied === d.id ? `${d.label} copied` : `Copy ${d.label}`
            }
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {copied === d.id ? (
                <motion.span
                  key="ok"
                  className="text-success"
                  initial={
                    motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? springs.flick : { duration: durations.fast }
                  }
                >
                  <Check aria-hidden className="size-3.5" />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast }}
                >
                  <Copy aria-hidden className="size-3.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Busy = "ceremony" | "checking" | "sending" | "done" | null;

/**
 * An interstitial that stands between a person and something sensitive. The
 * protected panel sits behind a frosted layer with a lock badge over it; a
 * card on the frost says why ("to view bank details, confirm it's you") and
 * offers the ways to do it as one radio group — a passkey, a code from an
 * authenticator app, a code by text. Choosing one slides its control in on
 * `springs.snap`: the passkey button runs a mock ceremony with a fingerprint
 * ring that fills most of the way on `springs.glide` and completes on
 * `springs.flick` when the device answers; the code field is six cells that
 * advance as digits land, take a paste in one cascade and shake a little on
 * a wrong code; the text option sends first and then shows the same cells.
 *
 * Confirmed, the card leaves on the exit ease, the frost lifts from the top
 * down on `springs.glide` (or from the middle outward, or cross-fades), the
 * badge flips on `springs.snap` to an unlocked tick drawn on `springs.flick`,
 * and a "verified for 15:00" chip lands in the header on `springs.recoil`
 * and counts down. The host can lock again at any time, and the surface
 * locks itself when the time lapses: the frost returns and the card rises
 * back in. Cancel hands control back to the host.
 *
 * The methods are a radio group (Up/Down or Left/Right choose, Home/End
 * jump), the cells a group of textboxes (Left/Right, Backspace steps back,
 * Home/End), and every change is announced. Under reduced motion nothing
 * flips, fills or travels: the frost and the badge cross-fade, the chip and
 * the card fade in place, and every state is still reached and announced.
 */
export function StepUpCheck({
  frost = 6,
  reveal = "down",
  density = "cozy",
  methods = defaultStepUpMethods,
  method: methodProp,
  defaultMethod,
  onMethodChange,
  verify = defaultStepUpVerify,
  sendCode = defaultStepUpSend,
  verifiedUntil,
  defaultVerifiedUntil = null,
  onChange,
  onCancel,
  verifiedFor = 15,
  now,
  children,
  status = "ready",
  onRetry,
  title = "Bank details",
  eyebrow = "Gaugeworks Pay",
  reason = "To view bank details, confirm it's you.",
  label,
  height = 540,
  disabled = false,
  className,
}: StepUpCheckProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const cardId = `${uid}-card`;
  const reasonId = `${uid}-reason`;
  const codeHintId = `${uid}-code-hint`;

  const dz = DENSITY[density];
  const windowMs = Math.max(1, verifiedFor) * MIN;

  /* ------------------------------- value ------------------------------- */

  const [ownUntil, setOwnUntil] = React.useState<number | null>(
    defaultVerifiedUntil,
  );
  const until = verifiedUntil === undefined ? ownUntil : verifiedUntil;

  const [ownMethod, setOwnMethod] = React.useState<string>(
    defaultMethod ?? methods[0]?.id ?? "",
  );
  const chosenId = methodProp ?? ownMethod;
  const chosen = methods.find((m) => m.id === chosenId) ?? methods[0] ?? null;

  const [clock, setClock] = React.useState<number | null>(null);
  const current = now ?? clock;
  const verified =
    until !== null && (current === null ? true : until > current);
  const remaining =
    until === null
      ? 0
      : clamp(until - (current ?? until - windowMs), 0, windowMs);

  const [verifiedWith, setVerifiedWith] = React.useState<StepUpMethod | null>(
    null,
  );
  const [busy, setBusy] = React.useState<Busy>(null);
  const [fail, setFail] = React.useState<string | null>(null);
  const [attempts, setAttempts] = React.useState(0);
  const [code, setCode] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [passed, setPassed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [onScreen, setOnScreen] = React.useState(true);
  const [focusReq, setFocusReq] = React.useState<{
    where: "lock" | "radio" | "cell" | "passkey";
    seq: number;
  } | null>(null);
  // False for the server render and hydration, so the card never fades in on
  // first paint; true once the surface is live.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const radioNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const lockRef = React.useRef<HTMLButtonElement | null>(null);
  const passkeyRef = React.useRef<HTMLButtonElement | null>(null);
  const firstCell = React.useRef<HTMLInputElement | null>(null);
  const seq = React.useRef(0);
  const alive = React.useRef(true);
  const landTimer = React.useRef<number | null>(null);
  const minuteSaid = React.useRef(false);
  const [shakeScope, shake] = useAnimate();

  const inert = disabled || status === "loading";

  const requestFocus = (where: NonNullable<typeof focusReq>["where"]) =>
    setFocusReq((f) => ({ where, seq: (f?.seq ?? 0) + 1 }));

  /* ----------------------------- lifecycle ----------------------------- */

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      seq.current += 1;
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    };
  }, []);

  // The countdown only ticks while something is counting, the tab is
  // visible and the surface is on screen.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    io.observe(root);
    return () => io.disconnect();
  }, []);

  // What a tick does besides moving the clock — the lapse and the one-minute
  // warning — lives in a ref, so the interval never holds a stale handler.
  const onTick = React.useRef<(t: number) => void>(() => {});
  React.useEffect(() => {
    onTick.current = (t) => {
      if (until === null) return;
      if (t >= until) {
        if (verifiedUntil === undefined) setOwnUntil(null);
        onChange?.(null, null);
        setVerifiedWith(null);
        minuteSaid.current = false;
        setAnnouncement(`Confirmation lapsed. Locked. ${reason}`);
        return;
      }
      if (until - t <= MIN && !minuteSaid.current) {
        minuteSaid.current = true;
        setAnnouncement("One minute of confirmation left.");
      }
    };
  });

  React.useEffect(() => {
    if (now !== undefined || until === null || !onScreen) return;
    let id: number | null = null;
    const tick = () => {
      const t = clockNow();
      setClock(t);
      onTick.current(t);
    };
    const start = () => {
      if (id !== null) return;
      tick();
      id = window.setInterval(tick, 1000);
    };
    const stop = () => {
      if (id === null) return;
      window.clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [now, until, onScreen]);

  // The surface locked again — the host took the time away, or its clock
  // passed it: the card comes back fresh. Derived state, adjusted in render.
  const [wasVerified, setWasVerified] = React.useState(verified);
  if (wasVerified !== verified) {
    setWasVerified(verified);
    if (!verified) {
      setBusy(null);
      setFail(null);
      setAttempts(0);
      setCode("");
      setSent(false);
      setPassed(false);
    }
  }

  // Focus follows the state: to the lock button once the chip has mounted,
  // back to the chosen method when the surface locks again.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      focusReq.where === "lock"
        ? lockRef.current
        : focusReq.where === "radio"
          ? radioNodes.current.get(chosenId)
          : focusReq.where === "cell"
            ? firstCell.current
            : passkeyRef.current;
    node?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq]);

  /* ------------------------------- actions ----------------------------- */

  const resetMethodState = () => {
    seq.current += 1;
    if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    landTimer.current = null;
    setBusy(null);
    setFail(null);
    setAttempts(0);
    setCode("");
    setSent(false);
    setPassed(false);
  };

  const choose = (m: StepUpMethod) => {
    if (inert || m.id === chosenId) return;
    if (methodProp === undefined) setOwnMethod(m.id);
    onMethodChange?.(m);
    resetMethodState();
    setAnnouncement(`${m.label} chosen. ${m.detail}.`);
  };

  const succeed = (m: StepUpMethod) => {
    const base = now ?? clockNow();
    const next = base + windowMs;
    if (verifiedUntil === undefined) setOwnUntil(next);
    onChange?.(next, m);
    setVerifiedWith(m);
    minuteSaid.current = false;
    setBusy(null);
    setAnnouncement(
      `Confirmed with ${m.label.toLowerCase()} for ${spoken(windowMs)}. ${title} shown.`,
    );
    requestFocus("lock");
  };

  const land = (m: StepUpMethod) => {
    // The ring completes and the cells turn green before the frost lifts.
    setBusy("done");
    setPassed(true);
    if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    landTimer.current = window.setTimeout(
      () => {
        landTimer.current = null;
        succeed(m);
      },
      motionSafe ? 460 : 160,
    );
  };

  const run = async (m: StepUpMethod, digits?: string) => {
    if (inert) return;
    seq.current += 1;
    const my = seq.current;
    setBusy(m.kind === "passkey" ? "ceremony" : "checking");
    setFail(null);
    setAnnouncement(
      m.kind === "passkey" ? "Waiting for the passkey." : "Checking the code.",
    );
    let result: StepUpResult;
    try {
      result = await verify(m, digits);
    } catch {
      result = { ok: false, reason: "Something went wrong. Try again." };
    }
    if (my !== seq.current || !alive.current) return;
    if (result.ok) {
      land(m);
      return;
    }
    setBusy(null);
    setFail(result.reason);
    setAttempts((a) => a + 1);
    setCode("");
    const more = attempts + 1 >= 2 ? " You can try another way." : "";
    setAnnouncement(`${result.reason}${more}`);
    if (m.kind !== "passkey") {
      if (motionSafe && shakeScope.current) {
        void shake(
          shakeScope.current,
          { x: [0, -5, 5, -3, 3, 0] },
          { duration: durations.base, ease: easings.move },
        );
      }
      requestFocus("cell");
    }
  };

  const send = async (m: StepUpMethod) => {
    if (inert) return;
    seq.current += 1;
    const my = seq.current;
    setBusy("sending");
    setFail(null);
    setCode("");
    setAnnouncement(`Sending a code to ${m.detail}.`);
    try {
      await sendCode(m);
    } catch {
      if (my !== seq.current || !alive.current) return;
      setBusy(null);
      setFail("The code didn't send. Try again, or another way.");
      setAnnouncement("The code didn't send.");
      return;
    }
    if (my !== seq.current || !alive.current) return;
    setBusy(null);
    setSent(true);
    setAnnouncement(`Code sent to ${m.detail}. Enter the six digits.`);
    requestFocus("cell");
  };

  const lock = (why: "pressed" | "cancel") => {
    seq.current += 1;
    if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    landTimer.current = null;
    if (verifiedUntil === undefined) setOwnUntil(null);
    onChange?.(null, null);
    setVerifiedWith(null);
    resetMethodState();
    if (why === "pressed") {
      setAnnouncement(`Locked. ${reason}`);
      requestFocus("radio");
    }
  };

  const cancel = () => {
    if (inert) return;
    resetMethodState();
    onCancel?.();
    setAnnouncement("Cancelled.");
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onRadioKey = (event: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = methods.length - 1;
    else return;
    event.preventDefault();
    const target = methods[(to + methods.length) % methods.length];
    if (!target) return;
    radioNodes.current.get(target.id)?.focus();
    choose(target);
  };

  /* ------------------------------- render ------------------------------ */

  const frostLayers: ("down" | "top" | "bottom")[] =
    reveal === "centre" && motionSafe ? ["top", "bottom"] : ["down"];
  const fades = reveal === "fade" || !motionSafe;
  const frostBackground = "color-mix(in oklab, var(--bg-1) 62%, transparent)";

  const Icon = chosen ? KIND_ICON[chosen.kind] : Lock;
  const attemptsLeftHint = attempts >= 2;

  const renderControl = () => {
    if (!chosen) return null;
    if (chosen.kind === "passkey") {
      const phase =
        busy === "ceremony"
          ? "running"
          : busy === "done"
            ? "done"
            : fail
              ? "failed"
              : "idle";
      return (
        <div className="flex flex-col gap-2">
          <button
            ref={passkeyRef}
            type="button"
            disabled={inert || busy !== null}
            onClick={() => void run(chosen)}
            aria-describedby={fail ? `${uid}-fail` : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-3 border border-hairline-strong bg-surface-0 px-3 py-2.5 text-left transition-colors hover:bg-surface-1 disabled:cursor-default",
              FOCUS_RING,
            )}
          >
            <PasskeyRing phase={phase} motionSafe={motionSafe} />
            <span className="min-w-0 flex-1">
              <span className={cn("block font-medium", dz.text)}>
                {phase === "running"
                  ? "Waiting for your device"
                  : phase === "done"
                    ? "Confirmed"
                    : phase === "failed"
                      ? "Try the passkey again"
                      : "Use your passkey"}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                {phase === "running"
                  ? "Touch the sensor when it asks"
                  : chosen.detail}
              </span>
            </span>
          </button>
          {fail ? (
            <p id={`${uid}-fail`} className="text-[12px] text-danger">
              {fail}
            </p>
          ) : null}
        </div>
      );
    }

    const isSms = chosen.kind === "sms";
    const showCells = !isSms || sent;
    return (
      <div className="flex flex-col gap-2.5">
        {isSms ? (
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className={cn("text-ink-2", dz.text)}>
              {busy === "sending" ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-28 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  />
                  <span className="sr-only">Sending</span>
                </span>
              ) : sent ? (
                <>
                  Code sent to{" "}
                  <span className="font-mono text-foreground tabular-nums">
                    {chosen.detail}
                  </span>
                </>
              ) : (
                <>
                  We&apos;ll text a code to{" "}
                  <span className="font-mono text-foreground tabular-nums">
                    {chosen.detail}
                  </span>
                </>
              )}
            </p>
            <button
              type="button"
              disabled={inert || busy !== null}
              onClick={() => void send(chosen)}
              className={cn(BUTTON, "h-7 px-2.5", FOCUS_RING)}
            >
              {sent ? "Resend" : "Send code"}
            </button>
          </div>
        ) : null}
        {showCells ? (
          <motion.div
            ref={shakeScope}
            initial={live ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="flex flex-col gap-2"
          >
            <Cells
              value={code}
              onChange={(next) => {
                setCode(next);
                if (fail) setFail(null);
              }}
              onComplete={(digits) => void run(chosen, digits)}
              disabled={inert || busy === "checking" || busy === "done"}
              invalid={fail !== null}
              passed={passed}
              motionSafe={motionSafe}
              density={density}
              groupLabel={`${chosen.label}, six digits`}
              describedBy={codeHintId}
              firstRef={(node) => {
                firstCell.current = node;
              }}
            />
            <p
              id={codeHintId}
              className={cn("text-[12px]", fail ? "text-danger" : "text-ink-3")}
              aria-live="off"
            >
              {busy === "checking"
                ? "Checking..."
                : busy === "done"
                  ? "Confirmed"
                  : fail
                    ? `${fail}${attemptsLeftHint ? " You can try another way." : ""}`
                    : isSms
                      ? "Enter the six digits from the text."
                      : "Open the app and enter the six digits it shows."}
            </p>
          </motion.div>
        ) : fail ? (
          <p className="text-[12px] text-danger">{fail}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      style={{ height }}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <LockBadge open={verified} motionSafe={motionSafe} />
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold">
              {title}
            </p>
            <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {eyebrow}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {verified ? (
              <motion.div
                key="chip"
                className="flex items-center gap-1.5"
                initial={
                  motionSafe
                    ? { opacity: 0, scale: 0.85, y: -distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
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
                <span
                  className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] pr-2.5 pl-2 text-[11px] text-success"
                  aria-label={`Confirmed${verifiedWith ? ` with ${verifiedWith.label.toLowerCase()}` : ""}, ${spoken(remaining)} left`}
                >
                  <Timer aria-hidden className="size-3.5" />
                  <span aria-hidden className="hidden @min-[28rem]:inline">
                    Verified for
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-[12px] tabular-nums"
                  >
                    {mmss(remaining)}
                  </span>
                </span>
                <button
                  ref={lockRef}
                  type="button"
                  disabled={disabled}
                  onClick={() => lock("pressed")}
                  aria-label="Lock now"
                  title="Lock now"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                    FOCUS_RING,
                  )}
                >
                  <Lock aria-hidden className="size-3.5" />
                </button>
              </motion.div>
            ) : (
              <motion.p
                key="locked"
                className="hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[28rem]:flex"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
              >
                <Lock aria-hidden className="size-3" />
                Locked
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {/* The protected panel. Hidden from assistive technology and inert
            while locked: the frost is a visual, not the control. */}
        <div
          inert={!verified || undefined}
          aria-hidden={!verified || undefined}
          className="absolute inset-0 overflow-y-auto overscroll-contain"
        >
          {children ?? (
            <DetailsPanel
              details={defaultStepUpDetails}
              density={density}
              motionSafe={motionSafe}
              locked={!verified}
            />
          )}
        </div>

        {frostLayers.map((layer) => (
          <motion.div
            key={layer}
            aria-hidden
            initial={false}
            animate={
              fades
                ? { opacity: verified ? 0 : 1 }
                : {
                    opacity: 1,
                    clipPath: verified
                      ? FROST_CLIP[layer].open
                      : FROST_CLIP[layer].locked,
                  }
            }
            transition={
              fades
                ? {
                    duration: motionSafe ? durations.slow : durations.fast,
                    ease: verified ? easings.exit : easings.enter,
                  }
                : { ...springs.glide, opacity: { duration: 0 } }
            }
            style={{
              clipPath: fades ? undefined : FROST_CLIP[layer].locked,
              backdropFilter: `blur(${clamp(frost, 0, 24)}px)`,
              WebkitBackdropFilter: `blur(${clamp(frost, 0, 24)}px)`,
              background: frostBackground,
            }}
            className={cn(
              "absolute inset-0",
              verified ? "pointer-events-none" : "pointer-events-auto",
            )}
          />
        ))}

        <AnimatePresence initial={false}>
          {!verified ? (
            <motion.div
              key="card-layer"
              className="absolute inset-0 flex items-start justify-center overflow-y-auto overscroll-contain p-3 @min-[36rem]:items-center"
              initial={live ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <motion.section
                id={cardId}
                aria-labelledby={`${uid}-card-title`}
                aria-describedby={reasonId}
                aria-busy={status === "loading" || undefined}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && !inert) {
                    event.preventDefault();
                    cancel();
                  }
                }}
                initial={
                  live
                    ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.nudge : 0,
                  transition: exitFor(durations.base),
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.base } }
                    : { duration: durations.base }
                }
                className={cn(
                  "flex w-full max-w-[26rem] flex-col rounded-3 border border-hairline-strong bg-popover shadow-[0_18px_40px_-18px_color-mix(in_oklab,black_50%,transparent)]",
                  dz.pad,
                  dz.gap,
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-cobalt-wash text-cobalt-bright"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h2
                      id={`${uid}-card-title`}
                      className="text-sm font-semibold"
                    >
                      Confirm it&apos;s you
                    </h2>
                    <p id={reasonId} className="text-[12px] text-ink-2">
                      {reason}
                    </p>
                  </div>
                </div>

                {status === "loading" ? (
                  <div aria-hidden className="flex flex-col gap-2">
                    {Array.from({ length: 3 }, (_, i) => (
                      <span
                        key={i}
                        className="h-11 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                        style={{ animationDelay: `${i * 90}ms` }}
                      />
                    ))}
                    <span className="mt-1 h-10 w-2/3 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                  </div>
                ) : methods.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <Lock aria-hidden className="size-5 text-ink-3" />
                    <p className="text-[13px] text-ink-2">
                      No way to confirm is set up on this account.
                    </p>
                    <p className="text-[11px] text-ink-3">
                      Add a passkey or an authenticator in Security settings.
                    </p>
                  </div>
                ) : (
                  <>
                    <div
                      role="radiogroup"
                      aria-label="How to confirm"
                      className="flex flex-col gap-1.5"
                    >
                      {methods.map((m, i) => {
                        const checked = m.id === chosenId;
                        const MIcon = KIND_ICON[m.kind];
                        return (
                          <button
                            key={m.id}
                            ref={(node) => {
                              if (node) radioNodes.current.set(m.id, node);
                              else radioNodes.current.delete(m.id);
                            }}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            aria-disabled={inert || undefined}
                            tabIndex={checked ? 0 : -1}
                            onClick={() => choose(m)}
                            onKeyDown={(event) => onRadioKey(event, i)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2 border px-2.5 text-left transition-colors",
                              dz.option,
                              checked
                                ? "border-[color-mix(in_oklab,var(--accent-bright)_45%,transparent)] bg-cobalt-wash"
                                : "border-hairline hover:bg-surface-1",
                              inert ? "cursor-not-allowed" : "cursor-pointer",
                              FOCUS_RING,
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                                checked
                                  ? "border-cobalt-bright"
                                  : "border-hairline-strong",
                              )}
                            >
                              <motion.span
                                className="size-2 rounded-full bg-cobalt-bright"
                                initial={false}
                                animate={{ scale: checked ? 1 : 0 }}
                                transition={
                                  motionSafe
                                    ? springs.snap
                                    : { duration: durations.fast }
                                }
                              />
                            </span>
                            <MIcon
                              aria-hidden
                              className={cn(
                                "size-4 shrink-0",
                                checked ? "text-cobalt-bright" : "text-ink-3",
                              )}
                            />
                            <span className="flex min-w-0 flex-1 flex-col @min-[30rem]:flex-row @min-[30rem]:items-baseline @min-[30rem]:gap-2">
                              <span
                                className={cn(
                                  "font-medium",
                                  dz.text,
                                  checked ? "text-foreground" : "text-ink",
                                )}
                              >
                                {m.label}
                              </span>
                              <span className="truncate text-[11px] text-ink-3">
                                {m.detail}
                              </span>
                            </span>
                            {m.recommended ? (
                              <span className="shrink-0 rounded-full border border-hairline-strong px-1.5 py-px font-mono text-[9px] tracking-[0.08em] text-ink-2 uppercase">
                                Best
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {status === "error" ? (
                      <div className="flex flex-col items-center gap-2 rounded-2 border border-hairline bg-surface-0 px-4 py-4 text-center">
                        <TriangleAlert
                          aria-hidden
                          className="size-4 text-danger"
                        />
                        <p className="text-[13px]">
                          The code couldn&apos;t be sent.
                        </p>
                        <p className="text-[11px] text-ink-3">
                          Try again, or pick another way above.
                        </p>
                        {onRetry ? (
                          <button
                            type="button"
                            onClick={onRetry}
                            className={cn(BUTTON, "mt-1", FOCUS_RING)}
                          >
                            <RotateCcw aria-hidden className="size-3.5" />
                            Try again
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="relative">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.div
                            key={chosenId}
                            initial={
                              motionSafe
                                ? { opacity: 0, y: distances.nudge }
                                : { opacity: 0 }
                            }
                            animate={{ opacity: 1, y: 0 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={
                              motionSafe
                                ? {
                                    ...springs.snap,
                                    opacity: { duration: durations.fast },
                                  }
                                : { duration: durations.fast }
                            }
                          >
                            {renderControl()}
                          </motion.div>
                        </AnimatePresence>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
                  <button
                    type="button"
                    disabled={inert}
                    onClick={cancel}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                    Cancel
                  </button>
                  <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {attempts > 0
                      ? `${attempts} ${attempts === 1 ? "attempt" : "attempts"}`
                      : `Lasts ${verifiedFor} min`}
                  </p>
                </div>
              </motion.section>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
