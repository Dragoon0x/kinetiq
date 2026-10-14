"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Laptop,
  LoaderCircle,
  Mail,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Smartphone,
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

export type RecoveryStep = "identify" | "verify" | "reset" | "done";

export type RecoveryMethodKind =
  "email" | "sms" | "authenticator" | "recovery-code" | "device";

export type RecoveryMethod = {
  id: string;
  kind: RecoveryMethodKind;
  /** The card's name, e.g. "Email code". */
  label: string;
  /** Where it goes or what it needs, already masked: "j***r@fernmoor.io". */
  detail: string;
  /** Typical time to finish, in seconds; printed on the card as its cost. */
  seconds: number;
  /** Characters in the code it expects. 0 means an approval, with no code to type. */
  codeLength: number;
  /** Carries the "Most secure" badge. @default false */
  mostSecure?: boolean;
};

/** Where the traveller is on the route, and what they have given so far. */
export type RecoveryValue = {
  step: RecoveryStep;
  /** The email or handle given at Identify. */
  account: string;
  /** The chosen method's id once one is picked at Verify, else null. */
  method: string | null;
  /** Methods that led to a dead end, by id; the map draws their detour. */
  blocked: string[];
  /** The "Sign out other devices" switch at Done. */
  signOutOthers: boolean;
};

export type RecoveryChangeKind =
  | "account"
  | "identified"
  | "method"
  | "deadEnd"
  | "verified"
  | "reset"
  | "signOutOthers"
  | "back"
  | "restart";

export type RecoveryChange = {
  kind: RecoveryChangeKind;
  /** The step the route is on after the change. */
  step: RecoveryStep;
};

/** What a lookup or a verification came back with. */
export type RecoveryVerdict =
  | { ok: true }
  | {
      ok: false;
      /** Shown under the field, e.g. "That code didn't match." */
      reason: string;
      /** The way is closed for good: the map draws a detour and the card is struck. @default false */
      deadEnd?: boolean;
    };

export type RecoveryMapStyle = "line" | "rail" | "dots";
export type RecoveryDensity = "compact" | "cozy" | "roomy";
export type RecoveryAccent = "cobalt" | "signal" | "amber" | "graphite";
export type RecoveryStatus = "ready" | "loading" | "error";

export type RecoveryRouteProps = {
  /** How the route is drawn: a hairline with a travelling dot, a filled rail with numbered stops, or bare dots with a ring. @default "line" */
  mapStyle?: RecoveryMapStyle;
  /** Padding, card height and type size. @default "cozy" */
  density?: RecoveryDensity;
  /** The colour the route, the marker and the chosen card are drawn in. @default "cobalt" */
  accent?: RecoveryAccent;
  /** The ways to verify, in card order. @default defaultRecoveryMethods */
  methods?: RecoveryMethod[];
  /** Controlled step state. */
  value?: RecoveryValue;
  /** Initial step state when uncontrolled. @default defaultRecoveryValue */
  defaultValue?: RecoveryValue;
  /** Fires after every move along the route, with the whole state and what changed. */
  onChange?: (value: RecoveryValue, change: RecoveryChange) => void;
  /** Finds the account for Identify. Resolves after a pause by default. @default defaultRecoveryLookup */
  lookup?: (account: string) => Promise<RecoveryVerdict>;
  /** Called with `null` when a method is picked (send the code, or ask the device) and again with the code typed. The default simulator closes the SMS path. @default defaultRecoveryVerify */
  verify?: (
    method: RecoveryMethod,
    code: string | null,
  ) => Promise<RecoveryVerdict>;
  /** The new password was submitted at Reset; awaited when it returns a promise. */
  onReset?: (password: string, value: RecoveryValue) => Promise<void> | void;
  /** "Continue to sign in" was pressed at Done. */
  onFinish?: (value: RecoveryValue) => void;
  /** How many other devices are signed in, for the Done switch. @default 3 */
  otherDevices?: number;
  /** Whether the methods have arrived. @default "ready" */
  status?: RecoveryStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Recover your account" */
  title?: string;
  /** The product named in the eyebrow and the copy. @default "Basinworks" */
  product?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the step scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed, picked or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** The ways into a Basinworks account; the SMS number is stale. */
export const defaultRecoveryMethods: RecoveryMethod[] = [
  {
    id: "email",
    kind: "email",
    label: "Email code",
    detail: "j***r@fernmoor.io",
    seconds: 120,
    codeLength: 6,
  },
  {
    id: "sms",
    kind: "sms",
    label: "Text message",
    detail: "+44 ***** 418",
    seconds: 45,
    codeLength: 6,
  },
  {
    id: "authenticator",
    kind: "authenticator",
    label: "Authenticator app",
    detail: "Basinworks Authenticator",
    seconds: 20,
    codeLength: 6,
    mostSecure: true,
  },
  {
    id: "recovery-code",
    kind: "recovery-code",
    label: "Recovery code",
    detail: "One of the 8 codes you saved",
    seconds: 40,
    codeLength: 8,
  },
  {
    id: "device",
    kind: "device",
    label: "Trusted device",
    detail: "Coldbrook laptop, seen 2 days ago",
    seconds: 15,
    codeLength: 0,
  },
];

/** Jo Okafor's account, found; the traveller is at Verify. */
export const defaultRecoveryValue: RecoveryValue = {
  step: "verify",
  account: "j.okafor@fernmoor.io",
  method: null,
  blocked: [],
  signOutOthers: true,
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Finds any account with three characters or more, after a short pause. */
export const defaultRecoveryLookup = async (
  account: string,
): Promise<RecoveryVerdict> => {
  await wait(800);
  const a = account.trim();
  if (a.length < 3) {
    return { ok: false, reason: "Enter the email or handle on the account." };
  }
  if (/nobody|unknown/i.test(a)) {
    return { ok: false, reason: `No account matches "${a}".` };
  }
  return { ok: true };
};

/**
 * Sends after a pause, approves a trusted device after a longer one, and
 * closes the SMS path: its number is no longer valid. Any complete code is
 * accepted unless every character is the same.
 */
export const defaultRecoveryVerify = async (
  method: RecoveryMethod,
  code: string | null,
): Promise<RecoveryVerdict> => {
  if (code === null) {
    if (method.kind === "sms") {
      await wait(1100);
      return { ok: false, deadEnd: true, reason: "Number no longer valid" };
    }
    if (method.kind === "email") await wait(900);
    if (method.kind === "device") await wait(1600);
    return { ok: true };
  }
  await wait(700);
  if (code.length < method.codeLength) {
    return { ok: false, reason: `Enter all ${method.codeLength} characters.` };
  }
  if (/^(.)\1+$/.test(code)) {
    return {
      ok: false,
      reason: "That code didn't match. Check it and try again.",
    };
  }
  return { ok: true };
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const STEPS: { id: RecoveryStep; label: string; short: string }[] = [
  { id: "identify", label: "Identify", short: "ID" },
  { id: "verify", label: "Verify", short: "VF" },
  { id: "reset", label: "Reset", short: "RS" },
  { id: "done", label: "Done", short: "OK" },
];

const STEP_INDEX: Record<RecoveryStep, number> = {
  identify: 0,
  verify: 1,
  reset: 2,
  done: 3,
};

const ACCENTS: Record<RecoveryAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const DENSITY: Record<
  RecoveryDensity,
  {
    pad: string;
    gap: string;
    card: string;
    text: string;
    input: string;
    map: string;
  }
> = {
  compact: {
    pad: "px-3 py-2.5",
    gap: "gap-2",
    card: "px-2.5 py-2",
    text: "text-[12px] leading-[17px]",
    input: "h-8 text-[13px]",
    map: "px-2 pb-1",
  },
  cozy: {
    pad: "px-4 py-3",
    gap: "gap-2.5",
    card: "px-3 py-2.5",
    text: "text-[13px] leading-[19px]",
    input: "h-9 text-[13px]",
    map: "px-3 pb-2",
  },
  roomy: {
    pad: "px-5 py-4",
    gap: "gap-3",
    card: "px-3.5 py-3",
    text: "text-[13px] leading-5",
    input: "h-10 text-[14px]",
    map: "px-4 pb-3",
  },
};

const KIND_ICON: Record<
  RecoveryMethodKind,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  email: Mail,
  sms: MessageSquare,
  authenticator: Smartphone,
  "recovery-code": KeyRound,
  device: Laptop,
};

/** The height the map keeps above the track for a detour branch. */
const DETOUR_H = 30;
/** The stop row's height; the track runs through its middle. */
const STOP_ROW = 24;
/** Where the detour's dead-end stub sits, from the stop's centre. */
const STUB = { x: 36, y: -22 };

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** "~45 s", "~2 min". */
const cost = (seconds: number) =>
  seconds < 60 ? `~${seconds} s` : `~${Math.round(seconds / 60)} min`;

export type RecoveryStrength = 0 | 1 | 2 | 3 | 4;

/** Length, mixed case, a digit and a symbol each add one; under 8 characters stays weak. */
export const scorePassword = (password: string): RecoveryStrength => {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length < 8) score = Math.min(score, 1);
  return Math.max(1, Math.min(4, score)) as RecoveryStrength;
};

const STRENGTH_WORD: Record<RecoveryStrength, string> = {
  0: "",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
};

const STRENGTH_COLOR: Record<RecoveryStrength, string> = {
  0: "transparent",
  1: "var(--danger)",
  2: "var(--warn)",
  3: "var(--rr-accent)",
  4: "var(--success)",
};

const noopSubscribe = () => () => {};

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function TickMark({
  on,
  motionSafe,
  className,
}: {
  on: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("size-3", className)}>
      <motion.path
        d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={motionSafe ? springs.flick : { duration: durations.blink }}
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden
      className={cn("size-3.5 motion-safe:animate-spin", className)}
    />
  );
}

function Switch({
  checked,
  onChange,
  motionSafe,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  motionSafe: boolean;
  disabled: boolean;
  label: string;
  id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200",
        checked
          ? "border-transparent bg-(--rr-accent)"
          : "border-hairline-strong bg-surface-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute top-0.5 left-0.5 block size-3.5 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]"
        initial={false}
        animate={{ x: checked ? 16 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </button>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {label}
        </label>
        {hint ? (
          <span
            id={`${id}-hint`}
            className="min-w-0 truncate text-right text-[11px] text-ink-3"
          >
            {hint}
          </span>
        ) : null}
      </div>
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="err"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="flex items-start gap-1.5 text-[12px] text-danger"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span>{error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const INPUT =
  "w-full min-w-0 rounded-2 border border-hairline-strong bg-surface-0 px-3 text-foreground placeholder:text-ink-3 transition-colors focus-visible:border-(--rr-accent) aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

function PrimaryButton({
  busy,
  busyLabel,
  children,
  disabled,
  type = "submit",
  onClick,
  className,
}: {
  busy: boolean;
  busyLabel: string;
  children: React.ReactNode;
  disabled: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      aria-disabled={disabled || busy || undefined}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium transition-colors",
        disabled && !busy
          ? "cursor-not-allowed bg-surface-2 text-ink-3"
          : "bg-(--rr-accent) text-(--bg-0) hover:brightness-110",
        busy && "cursor-progress",
        FOCUS_RING,
        className,
      )}
    >
      {busy ? (
        <>
          <Spinner />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-60",
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The map                                  */
/* ----------------------------------------------------------------------- */

type DetourPhase = "out" | "back" | null;

type RouteMapProps = {
  index: number;
  mapStyle: RecoveryMapStyle;
  density: RecoveryDensity;
  motionSafe: boolean;
  /** Labels of the methods that hit a dead end, with the latest reason. */
  detour: { labels: string[]; reason: string } | null;
  detourPhase: DetourPhase;
  canGoBack: boolean;
  onBack: (step: RecoveryStep) => void;
};

function RouteMap({
  index,
  mapStyle,
  density,
  motionSafe,
  detour,
  detourPhase,
  canGoBack,
  onBack,
}: RouteMapProps) {
  const n = STEPS.length;
  const trackY = DETOUR_H + STOP_ROW / 2;
  const edge = `${r3(50 / n)}%`;
  const pos = (index + 0.5) / n;
  // The track spans the first to the last stop's centre, (n - 1) / n of the
  // row; how far along it the traveller is, as a share of the whole row.
  const progress = `${r3((index / (n - 1)) * (1 - 1 / n) * 100)}%`;
  const dx = detourPhase === "out" ? STUB.x : 0;
  const dy = detourPhase === "out" ? STUB.y : 0;

  const trackH = mapStyle === "rail" ? 6 : mapStyle === "line" ? 1 : 0;
  const markerSize = mapStyle === "rail" ? 14 : mapStyle === "line" ? 12 : 22;

  const marker = (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute z-10"
      style={{
        top: trackY - markerSize / 2,
        width: markerSize,
        height: markerSize,
        marginLeft: -markerSize / 2,
      }}
      initial={false}
      animate={{ left: `${r3(pos * 100)}%`, x: dx, y: dy }}
      transition={
        motionSafe
          ? {
              left: { ...springs.glide, delay: durations.blink },
              x: springs.glide,
              y: springs.glide,
            }
          : { duration: 0 }
      }
    >
      {mapStyle === "dots" ? (
        <span className="block size-full rounded-full border-2 border-(--rr-accent) bg-transparent" />
      ) : mapStyle === "rail" ? (
        <span className="block size-full rounded-full border-2 border-card bg-(--rr-accent)" />
      ) : (
        <span className="block size-full rounded-full bg-(--rr-accent) shadow-[0_0_0_3px_var(--rr-wash)]" />
      )}
    </motion.span>
  );

  return (
    <div
      className={cn(
        "relative shrink-0 border-b border-hairline",
        DENSITY[density].map,
      )}
    >
      <div className="relative">
        {/* The track and how far along it the traveller is. */}
        {mapStyle === "dots" ? (
          <span
            aria-hidden
            className="absolute border-t border-dotted border-hairline-strong"
            style={{ top: trackY, left: edge, right: edge }}
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              "absolute rounded-full",
              mapStyle === "rail" ? "bg-surface-2" : "bg-hairline-strong",
            )}
            style={{
              top: trackY - trackH / 2,
              height: trackH,
              left: edge,
              right: edge,
            }}
          />
        )}
        <motion.span
          aria-hidden
          className={cn(
            "absolute rounded-full",
            mapStyle === "dots"
              ? "border-t-2 border-dotted border-(--rr-accent)"
              : "bg-(--rr-accent)",
          )}
          style={{
            top: mapStyle === "dots" ? trackY - 0.5 : trackY - trackH / 2,
            height: mapStyle === "dots" ? 0 : trackH,
            left: edge,
          }}
          initial={false}
          animate={{ width: progress }}
          transition={
            motionSafe
              ? { ...springs.glide, delay: durations.blink }
              : { duration: 0 }
          }
        />
        {marker}

        <ol aria-label="Route" className="relative flex items-start">
          {STEPS.map((step, i) => {
            const passed = i < index;
            const current = i === index;
            const interactive = passed && canGoBack;
            const inner = (
              <>
                <span
                  aria-hidden
                  className="relative flex w-full items-center justify-center"
                  style={{ height: STOP_ROW }}
                >
                  <span
                    className={cn(
                      "flex items-center justify-center rounded-full border transition-colors duration-200",
                      mapStyle === "rail"
                        ? "size-6 font-mono text-[10px]"
                        : mapStyle === "line"
                          ? "size-4"
                          : "size-2.5",
                      passed
                        ? "border-transparent bg-(--rr-accent) text-(--bg-0)"
                        : current
                          ? "border-(--rr-accent) bg-card text-(--rr-accent)"
                          : "border-hairline-strong bg-card text-ink-3",
                    )}
                  >
                    {mapStyle === "dots" ? null : passed ? (
                      <TickMark
                        on
                        motionSafe={motionSafe}
                        className={mapStyle === "rail" ? "size-3" : "size-2.5"}
                      />
                    ) : mapStyle === "rail" ? (
                      <span>{i + 1}</span>
                    ) : current && mapStyle === "line" ? (
                      <span className="size-1.5 rounded-full bg-(--rr-accent)" />
                    ) : null}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-1 block truncate font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                    current
                      ? "text-foreground"
                      : passed
                        ? "text-ink-2"
                        : "text-ink-3",
                  )}
                >
                  <span className="hidden @min-[24rem]:inline">
                    {step.label}
                  </span>
                  <span className="@min-[24rem]:hidden">{step.short}</span>
                </span>
              </>
            );
            return (
              <li
                key={step.id}
                className="relative flex min-w-0 flex-1 flex-col items-center"
                style={{ paddingTop: DETOUR_H }}
              >
                {step.id === "verify" && detour ? (
                  <DetourBranch
                    detour={detour}
                    trackY={trackY}
                    motionSafe={motionSafe}
                  />
                ) : null}
                {interactive ? (
                  <button
                    type="button"
                    onClick={() => onBack(step.id)}
                    aria-label={`Back to ${step.label}, step ${i + 1} of ${n}, done`}
                    className={cn(
                      "relative z-[1] flex w-full flex-col items-center rounded-2 px-1 pb-0.5 transition-colors hover:bg-surface-1",
                      FOCUS_RING,
                    )}
                  >
                    {inner}
                  </button>
                ) : (
                  <span
                    aria-current={current ? "step" : undefined}
                    className="relative z-[1] flex w-full flex-col items-center px-1 pb-0.5"
                  >
                    <span className="sr-only">
                      {step.label}, step {i + 1} of {n},{" "}
                      {passed ? "done" : current ? "current" : "ahead"}
                    </span>
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function DetourBranch({
  detour,
  trackY,
  motionSafe,
}: {
  detour: { labels: string[]; reason: string };
  trackY: number;
  motionSafe: boolean;
}) {
  const out = `M0 0 C 8 -12, 18 ${STUB.y}, ${STUB.x} ${STUB.y}`;
  const back = `M${STUB.x} ${STUB.y} C ${STUB.x + 12} ${STUB.y}, ${STUB.x + 8} -6, 12 -3 L 3 -1`;
  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute left-1/2 overflow-visible"
        style={{ top: trackY, width: 1, height: 1 }}
      >
        <motion.path
          d={out}
          fill="none"
          stroke="var(--danger)"
          strokeWidth={1.5}
          strokeLinecap="round"
          initial={motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
        <motion.path
          d={back}
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth={1.25}
          strokeDasharray="3 3"
          strokeLinecap="round"
          initial={motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe
              ? { ...springs.glide, delay: durations.slow }
              : { duration: 0 }
          }
        />
        <motion.g
          initial={motionSafe ? { scale: 0, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { ...springs.recoil, delay: durations.base }
              : { duration: durations.fast }
          }
          style={{
            transformOrigin: `${STUB.x}px ${STUB.y}px`,
            transformBox: "fill-box",
          }}
        >
          <circle
            cx={STUB.x}
            cy={STUB.y}
            r={5}
            fill="var(--bg-0)"
            stroke="var(--danger)"
            strokeWidth={1.5}
          />
          <path
            d={`M${STUB.x - 2} ${STUB.y - 2} l4 4 M${STUB.x + 2} ${STUB.y - 2} l-4 4`}
            stroke="var(--danger)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </motion.g>
      </svg>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute z-[2] font-mono text-[10px] whitespace-nowrap text-danger"
        style={{
          left: `calc(50% + ${STUB.x + 9}px)`,
          top: trackY + STUB.y - 7,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: durations.base,
          ease: easings.enter,
          delay: motionSafe ? durations.base : 0,
        }}
      >
        {detour.labels.join(", ")}: {detour.reason.toLowerCase()}
      </motion.span>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Strength                                  */
/* ----------------------------------------------------------------------- */

function StrengthMeter({
  score,
  motionSafe,
  id,
}: {
  score: RecoveryStrength;
  motionSafe: boolean;
  id: string;
}) {
  const word = STRENGTH_WORD[score];
  return (
    <div
      id={id}
      role="meter"
      aria-label="Password strength"
      aria-valuemin={0}
      aria-valuemax={4}
      aria-valuenow={score}
      aria-valuetext={word || "Empty"}
      className="flex items-center gap-2"
    >
      <span aria-hidden className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
          >
            <motion.span
              className="block h-full w-full origin-left rounded-full"
              style={{ backgroundColor: STRENGTH_COLOR[score] }}
              initial={false}
              animate={{ scaleX: score >= i ? 1 : 0 }}
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      delay: score >= i ? r3((i - 1) * 0.03) : 0,
                    }
                  : { duration: durations.fast }
              }
            />
          </span>
        ))}
      </span>
      <span
        aria-hidden
        className="w-11 text-right font-mono text-[10px] tracking-[0.08em] uppercase"
        style={{ color: score ? STRENGTH_COLOR[score] : "var(--ink-3)" }}
      >
        {word || "—"}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Busy = "lookup" | "send" | "check" | "reset" | null;

/**
 * An account recovery flow drawn as a route: four stops in a line —
 * Identify, Verify, Reset, Done — with a marker that travels between them.
 * When a step completes, a tick draws on `springs.flick` at the stop just
 * passed and the marker glides on to the next on `springs.glide`, a blink
 * behind it, while the finished panel eases out and the next slides in from
 * the direction of travel.
 *
 * Verify lays the ways in as cards, each with its cost in time and one with
 * the "Most secure" badge. Picking one slides a code field in on glide; a
 * way that turns out closed (the seeded text message: its number is no
 * longer valid) sends the marker out along a detour branch above the stop
 * and back to Verify, the branch stays drawn, and the card is struck. Reset
 * fills a strength meter on glide as the password grows and ticks the
 * confirm field on flick the moment it matches; Done lands a stamp on
 * `springs.recoil` beside a "Sign out other devices" switch that snaps.
 *
 * Keyboard is native: the fields and buttons tab in order, the cards are a
 * radio group (arrows move and pick, Space picks), and the stops already
 * passed are links that go back. Every move is announced. Under reduced
 * motion nothing travels: the marker, the panels and the branch appear in
 * place and the meter cross-fades.
 */
export function RecoveryRoute({
  mapStyle = "line",
  density = "cozy",
  accent = "cobalt",
  methods = defaultRecoveryMethods,
  value,
  defaultValue = defaultRecoveryValue,
  onChange,
  lookup = defaultRecoveryLookup,
  verify = defaultRecoveryVerify,
  onReset,
  onFinish,
  otherDevices = 3,
  status = "ready",
  onRetry,
  title = "Recover your account",
  product = "Basinworks",
  label,
  height = 540,
  disabled = false,
  className,
}: RecoveryRouteProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const accountId = `${uid}-account`;
  const codeId = `${uid}-code`;
  const passwordId = `${uid}-password`;
  const confirmId = `${uid}-confirm`;
  const meterId = `${uid}-meter`;
  const switchId = `${uid}-switch`;

  const [own, setOwn] = React.useState<RecoveryValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const index = STEP_INDEX[current.step];
  const d = DENSITY[density];

  const [busy, setBusy] = React.useState<Busy>(null);
  const [error, setError] = React.useState<{
    step: RecoveryStep;
    text: string;
  } | null>(null);
  const [draft, setDraft] = React.useState(current.account);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [dir, setDir] = React.useState<1 | -1>(1);
  const [detourPhase, setDetourPhase] = React.useState<DetourPhase>(null);
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = React.useState("");
  const [activeCard, setActiveCard] = React.useState<string | null>(null);

  // False for the server render and hydration, so the first panel never
  // slides in on arrival; true for every step reached after that.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const flight = React.useRef(0);
  const alive = React.useRef(true);
  const timers = React.useRef(new Set<number>());
  const cardNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const codeRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      flight.current += 1;
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      if (alive.current) fn();
    }, ms);
    timers.current.add(t);
  };

  /* ------------------------------- data -------------------------------- */

  const method = methods.find((m) => m.id === current.method) ?? null;
  const blockedSet = new Set(current.blocked);
  const blockedMethods = methods.filter((m) => blockedSet.has(m.id));
  const latestBlocked = current.blocked[current.blocked.length - 1];
  const detour =
    blockedMethods.length > 0
      ? {
          labels: blockedMethods.map((m) => m.label),
          reason:
            (latestBlocked ? reasons[latestBlocked] : undefined) ??
            "no longer reachable",
        }
      : null;
  const stepError = error && error.step === current.step ? error.text : null;
  const score = scorePassword(password);
  const matches = confirm.length > 0 && confirm === password;
  const canReset = score >= 2 && matches && !inert;
  const stepLabel = STEPS[index]?.label ?? "";

  /* ------------------------------ changes ------------------------------ */

  const commit = (next: RecoveryValue, change: RecoveryChange) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, change);
  };

  const announceStep = (step: RecoveryStep, lead: string) => {
    const i = STEP_INDEX[step];
    setAnnouncement(
      `${lead} Step ${i + 1} of ${STEPS.length}, ${STEPS[i]?.label ?? step}.`,
    );
  };

  /** Moves on to the next stop: tick behind, marker ahead. */
  const advance = (
    base: RecoveryValue,
    step: RecoveryStep,
    kind: RecoveryChangeKind,
    lead: string,
  ) => {
    setDir(1);
    setBusy(null);
    setError(null);
    commit({ ...base, step }, { kind, step });
    announceStep(step, lead);
  };

  const fail = (step: RecoveryStep, text: string) => {
    setBusy(null);
    setError({ step, text });
    setAnnouncement(text);
  };

  const submitIdentify = () => {
    if (inert || busy) return;
    const account = draft.trim();
    const id = ++flight.current;
    setBusy("lookup");
    setError(null);
    setAnnouncement("Looking for the account.");
    const base: RecoveryValue = { ...current, account };
    commit(base, { kind: "account", step: "identify" });
    lookup(account).then(
      (verdict) => {
        if (!alive.current || id !== flight.current) return;
        if (verdict.ok) {
          advance(base, "verify", "identified", "Account found.");
        } else fail("identify", verdict.reason);
      },
      () => {
        if (!alive.current || id !== flight.current) return;
        fail("identify", "Couldn't reach the account service. Try again.");
      },
    );
  };

  const deadEnd = (base: RecoveryValue, m: RecoveryMethod, reason: string) => {
    setBusy(null);
    setError(null);
    setReasons((r) => ({ ...r, [m.id]: reason }));
    const next: RecoveryValue = {
      ...base,
      method: null,
      blocked: base.blocked.includes(m.id)
        ? base.blocked
        : [...base.blocked, m.id],
    };
    commit(next, { kind: "deadEnd", step: "verify" });
    setAnnouncement(
      `${m.label} is a dead end: ${reason.toLowerCase()}. Back at Verify; choose another way.`,
    );
    if (motionSafe) {
      setDetourPhase("out");
      later(() => setDetourPhase("back"), 520);
      later(() => setDetourPhase(null), 1000);
    }
  };

  /** Picks a way and asks for it to be sent (or the device to be asked). */
  const choose = (m: RecoveryMethod) => {
    if (inert || blockedSet.has(m.id)) return;
    if (current.method === m.id && busy !== "send" && !stepError) return;
    const id = ++flight.current;
    const base: RecoveryValue = { ...current, method: m.id };
    commit(base, { kind: "method", step: "verify" });
    setCode("");
    setError(null);
    setBusy("send");
    setAnnouncement(
      m.codeLength === 0
        ? `${m.label} chosen. Waiting for approval on ${m.detail}.`
        : m.kind === "email" || m.kind === "sms"
          ? `${m.label} chosen. Sending a code to ${m.detail}.`
          : `${m.label} chosen. Enter the ${m.codeLength}-character code.`,
    );
    verify(m, null).then(
      (verdict) => {
        if (!alive.current || id !== flight.current) return;
        if (verdict.ok) {
          if (m.codeLength === 0) {
            advance(base, "reset", "verified", `Approved on ${m.detail}.`);
            return;
          }
          setBusy(null);
          setAnnouncement(
            m.kind === "email" || m.kind === "sms"
              ? `Code sent to ${m.detail}. Enter it below.`
              : `Enter the ${m.codeLength}-character code.`,
          );
          codeRef.current?.focus({ preventScroll: true });
        } else if (verdict.deadEnd) deadEnd(base, m, verdict.reason);
        else fail("verify", verdict.reason);
      },
      () => {
        if (!alive.current || id !== flight.current) return;
        fail("verify", "Couldn't send the code. Try again.");
      },
    );
  };

  const submitCode = () => {
    if (inert || busy || !method) return;
    const id = ++flight.current;
    setBusy("check");
    setError(null);
    setAnnouncement("Checking the code.");
    const base = current;
    verify(method, code).then(
      (verdict) => {
        if (!alive.current || id !== flight.current) return;
        if (verdict.ok) {
          advance(base, "reset", "verified", "Code accepted.");
        } else if (verdict.deadEnd) deadEnd(base, method, verdict.reason);
        else fail("verify", verdict.reason);
      },
      () => {
        if (!alive.current || id !== flight.current) return;
        fail("verify", "Couldn't check the code. Try again.");
      },
    );
  };

  const submitReset = () => {
    if (!canReset || busy) return;
    const id = ++flight.current;
    setBusy("reset");
    setError(null);
    setAnnouncement("Saving the new password.");
    const base = current;
    Promise.resolve()
      .then(() => onReset?.(password, base))
      .then(
        () => {
          if (!alive.current || id !== flight.current) return;
          setPassword("");
          setConfirm("");
          setShowPassword(false);
          advance(base, "done", "reset", "Password changed.");
        },
        () => {
          if (!alive.current || id !== flight.current) return;
          fail("reset", "Couldn't save the password. Try again.");
        },
      );
  };

  const back = (step: RecoveryStep) => {
    if (inert || current.step === "done") return;
    flight.current += 1;
    setBusy(null);
    setError(null);
    setDir(-1);
    setCode("");
    const next: RecoveryValue = {
      ...current,
      step,
      method: step === "identify" ? null : current.method,
    };
    commit(next, { kind: "back", step });
    announceStep(step, "Went back.");
  };

  const restart = () => {
    if (disabled) return;
    flight.current += 1;
    setBusy(null);
    setError(null);
    setDir(-1);
    setDraft("");
    setCode("");
    setPassword("");
    setConfirm("");
    setDetourPhase(null);
    const next: RecoveryValue = {
      step: "identify",
      account: "",
      method: null,
      blocked: [],
      signOutOthers: true,
    };
    commit(next, { kind: "restart", step: "identify" });
    announceStep("identify", "Started over.");
  };

  const setSignOut = (on: boolean) => {
    commit(
      { ...current, signOutOthers: on },
      { kind: "signOutOthers", step: "done" },
    );
    setAnnouncement(
      on
        ? `Other devices will be signed out: ${otherDevices}.`
        : "Other devices stay signed in.",
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const pickable = methods.filter((m) => !blockedSet.has(m.id));
  const activeId =
    (current.method && !blockedSet.has(current.method)
      ? current.method
      : null) ??
    (activeCard && pickable.some((m) => m.id === activeCard)
      ? activeCard
      : (pickable[0]?.id ?? null));

  const onCardKey = (event: React.KeyboardEvent, m: RecoveryMethod) => {
    const i = pickable.findIndex((x) => x.id === m.id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      to = (i + 1) % pickable.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      to = (i - 1 + pickable.length) % pickable.length;
    } else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = pickable.length - 1;
    else if (event.key === " ") {
      event.preventDefault();
      choose(m);
      return;
    } else return;
    event.preventDefault();
    const target = pickable[to];
    if (!target) return;
    cardNodes.current.get(target.id)?.focus({ preventScroll: true });
    choose(target);
  };

  /* ------------------------------- panels ------------------------------ */

  const stagger = cascade(methods.length);
  const sending = busy === "send";
  const fieldHint =
    !method || sending
      ? null
      : method.kind === "email" || method.kind === "sms"
        ? `Sent to ${method.detail}`
        : method.kind === "recovery-code"
          ? "Any unused code"
          : `From ${method.detail}`;

  const identifyPanel = (
    <form
      className={cn("flex flex-col", d.gap)}
      onSubmit={(event) => {
        event.preventDefault();
        submitIdentify();
      }}
    >
      <p className={cn("text-ink-2", d.text)}>
        Tell us which {product} account this is and we will find a way back in.
      </p>
      <Field id={accountId} label="Email or handle" error={stepError}>
        <input
          id={accountId}
          type="text"
          autoComplete="username"
          spellCheck={false}
          value={draft}
          placeholder="you@fernmoor.io"
          aria-disabled={inert || undefined}
          readOnly={inert}
          aria-describedby={stepError ? `${accountId}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          className={cn(INPUT, d.input, FOCUS_RING)}
        />
      </Field>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-3">
          We never show the full address.
        </span>
        <PrimaryButton
          busy={busy === "lookup"}
          busyLabel="Looking"
          disabled={inert || draft.trim().length === 0}
        >
          Find account
          <ArrowRight aria-hidden className="size-3.5" />
        </PrimaryButton>
      </div>
    </form>
  );

  const verifyPanel =
    methods.length === 0 ? (
      <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
        <Inbox aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-foreground">
          No way to verify this account.
        </p>
        <p className="text-[12px] text-ink-3">
          Nothing is on file for {current.account || "it"}. Ask {product}{" "}
          support to add one.
        </p>
      </div>
    ) : (
      <div className={cn("flex flex-col", d.gap)}>
        <p className={cn("text-ink-2", d.text)}>
          Prove it is you. Pick a way to verify{" "}
          <span className="font-medium text-foreground">{current.account}</span>
          .
        </p>
        <div
          role="radiogroup"
          aria-label="Ways to verify"
          className={cn("grid grid-cols-1 @min-[36rem]:grid-cols-2", d.gap)}
        >
          {methods.map((m, i) => {
            const Icon = KIND_ICON[m.kind];
            const blocked = blockedSet.has(m.id);
            const checked = current.method === m.id;
            return (
              <motion.button
                key={m.id}
                ref={(node) => {
                  if (node) cardNodes.current.set(m.id, node);
                  else cardNodes.current.delete(m.id);
                }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-disabled={blocked || inert || undefined}
                aria-label={`${m.label}, ${m.detail}, ${cost(m.seconds)}${m.mostSecure ? ", most secure" : ""}${blocked ? `, dead end: ${(reasons[m.id] ?? "no longer reachable").toLowerCase()}` : ""}`}
                tabIndex={!blocked && activeId === m.id ? 0 : -1}
                onFocus={() => setActiveCard(m.id)}
                onClick={() => choose(m)}
                onKeyDown={(event) => {
                  if (!blocked) onCardKey(event, m);
                }}
                initial={
                  live
                    ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  y: motionSafe
                    ? { ...springs.glide, delay: r3(i * stagger) }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: r3(i * stagger),
                  },
                }}
                className={cn(
                  "relative flex items-start gap-2.5 rounded-3 border text-left transition-colors duration-200",
                  d.card,
                  blocked
                    ? "cursor-not-allowed border-dashed border-hairline-strong bg-transparent"
                    : checked
                      ? "border-(--rr-line) bg-(--rr-wash)"
                      : "border-hairline bg-surface-0 hover:border-hairline-strong hover:bg-surface-1",
                  inert && !blocked && "cursor-not-allowed",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-2 transition-colors",
                    blocked
                      ? "bg-surface-1 text-ink-3"
                      : checked
                        ? "bg-(--rr-accent) text-(--bg-0)"
                        : "bg-surface-2 text-ink-2",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate font-medium",
                        d.text,
                        blocked ? "text-ink-3 line-through" : "text-foreground",
                      )}
                    >
                      {m.label}
                    </span>
                    {m.mostSecure ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] px-1.5 py-px font-mono text-[9px] tracking-[0.08em] text-success uppercase">
                        <ShieldCheck aria-hidden className="size-2.5" />
                        <span className="hidden @min-[28rem]:inline">
                          Most secure
                        </span>
                        <span className="@min-[28rem]:hidden">Secure</span>
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "truncate text-[11px]",
                      blocked ? "text-danger" : "text-ink-3",
                    )}
                  >
                    {blocked
                      ? (reasons[m.id] ?? "No longer reachable")
                      : m.detail}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      blocked ? "text-ink-3 line-through" : "text-ink-3",
                    )}
                  >
                    {cost(m.seconds)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-3.5 items-center justify-center rounded-full border transition-colors",
                      checked
                        ? "border-(--rr-accent) bg-(--rr-accent) text-(--bg-0)"
                        : "border-hairline-strong bg-card text-transparent",
                    )}
                  >
                    <TickMark
                      on={checked}
                      motionSafe={motionSafe}
                      className="size-2.5"
                    />
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {method && !blockedSet.has(method.id) ? (
            <motion.div
              key={method.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: {
                  height: motionSafe
                    ? exitFor(durations.base)
                    : { duration: 0 },
                  opacity: exitFor(durations.fast),
                },
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
              {method.codeLength === 0 ? (
                <div className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-0 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {sending ? (
                      <Spinner className="text-(--rr-accent)" />
                    ) : (
                      <TriangleAlert
                        aria-hidden
                        className="size-3.5 text-danger"
                      />
                    )}
                    <span className={cn("text-foreground", d.text)}>
                      {sending
                        ? `Waiting for approval on ${method.detail}`
                        : (stepError ?? "Approval not received")}
                    </span>
                  </div>
                  {!sending ? (
                    <div>
                      <GhostButton
                        onClick={() => choose(method)}
                        disabled={inert}
                      >
                        <RotateCcw aria-hidden className="size-3.5" />
                        Ask again
                      </GhostButton>
                    </div>
                  ) : null}
                </div>
              ) : (
                <form
                  className={cn("flex flex-col", d.gap)}
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitCode();
                  }}
                >
                  <Field
                    id={codeId}
                    label="Code"
                    hint={
                      sending ? (
                        <span className="inline-flex items-center gap-1">
                          <Spinner className="size-3" />
                          Sending to {method.detail}
                        </span>
                      ) : (
                        fieldHint
                      )
                    }
                    error={stepError}
                  >
                    <div className="flex gap-2">
                      <input
                        ref={codeRef}
                        id={codeId}
                        type="text"
                        inputMode={
                          method.kind === "recovery-code" ? "text" : "numeric"
                        }
                        autoComplete="one-time-code"
                        spellCheck={false}
                        maxLength={method.codeLength}
                        value={code}
                        placeholder={"•".repeat(method.codeLength)}
                        aria-disabled={inert || sending || undefined}
                        readOnly={inert || sending}
                        aria-describedby={
                          stepError ? `${codeId}-error` : `${codeId}-hint`
                        }
                        onChange={(event) =>
                          setCode(
                            event.target.value
                              .replace(/\s/g, "")
                              .slice(0, method.codeLength),
                          )
                        }
                        className={cn(
                          INPUT,
                          d.input,
                          "font-mono tracking-[0.3em]",
                          FOCUS_RING,
                        )}
                      />
                      <PrimaryButton
                        busy={busy === "check"}
                        busyLabel="Checking"
                        disabled={
                          inert || sending || code.length < method.codeLength
                        }
                      >
                        Verify
                      </PrimaryButton>
                    </div>
                  </Field>
                </form>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );

  const resetPanel = (
    <form
      className={cn("flex flex-col", d.gap)}
      onSubmit={(event) => {
        event.preventDefault();
        submitReset();
      }}
    >
      <p className={cn("text-ink-2", d.text)}>
        Verified
        {method ? (
          <>
            {" "}
            with{" "}
            <span className="font-medium text-foreground">
              {method.label.toLowerCase()}
            </span>
          </>
        ) : null}
        . Choose a new password for {current.account}.
      </p>
      <Field
        id={passwordId}
        label="New password"
        hint="8 characters or more"
        error={stepError}
      >
        <div className="relative">
          <input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            aria-disabled={inert || undefined}
            readOnly={inert}
            aria-describedby={meterId}
            onChange={(event) => setPassword(event.target.value)}
            className={cn(INPUT, d.input, "pr-10", FOCUS_RING)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className={cn(
              "absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {showPassword ? (
              <EyeOff aria-hidden className="size-3.5" />
            ) : (
              <Eye aria-hidden className="size-3.5" />
            )}
          </button>
        </div>
        <StrengthMeter score={score} motionSafe={motionSafe} id={meterId} />
      </Field>
      <Field
        id={confirmId}
        label="Confirm"
        hint={
          confirm.length === 0
            ? null
            : matches
              ? "Matches"
              : "Doesn't match yet"
        }
      >
        <div className="relative">
          <input
            id={confirmId}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            aria-disabled={inert || undefined}
            readOnly={inert}
            aria-describedby={`${confirmId}-hint`}
            aria-invalid={confirm.length > 0 && !matches ? true : undefined}
            onChange={(event) => setConfirm(event.target.value)}
            className={cn(INPUT, d.input, "pr-10", FOCUS_RING)}
          />
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 right-2.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-full border transition-colors duration-150",
              matches
                ? "border-transparent bg-success text-(--bg-0)"
                : "border-hairline-strong bg-card text-transparent",
            )}
          >
            <TickMark
              on={matches}
              motionSafe={motionSafe}
              className="size-2.5"
            />
          </span>
        </div>
      </Field>
      <div className="flex items-center justify-end gap-2">
        <PrimaryButton
          busy={busy === "reset"}
          busyLabel="Saving"
          disabled={!canReset}
        >
          Reset password
        </PrimaryButton>
      </div>
    </form>
  );

  const donePanel = (
    <div className={cn("flex flex-col", d.gap)}>
      <div className="flex items-center gap-2.5">
        <motion.span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--rr-accent) text-(--bg-0)"
          initial={live && motionSafe ? { scale: 0.4, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { ...springs.recoil, delay: durations.base }
              : { duration: durations.fast }
          }
        >
          <TickMark on motionSafe={motionSafe} className="size-4" />
        </motion.span>
        <div className="min-w-0">
          <p className={cn("font-medium text-foreground", d.text)}>
            Account recovered
          </p>
          <p className="truncate text-[11px] text-ink-3">
            You can sign in to {product} with the new password.
          </p>
        </div>
      </div>
      <dl className="flex flex-col gap-1.5 rounded-3 border border-hairline bg-surface-0 px-3 py-2.5">
        {[
          ["Account", current.account],
          [
            "Verified with",
            method ? `${method.label}, ${method.detail}` : "Trusted device",
          ],
          ["Password", "Changed just now"],
          [
            "Dead ends",
            blockedMethods.length
              ? blockedMethods.map((m) => m.label).join(", ")
              : "None",
          ],
        ].map(([k, v], i) => (
          <motion.div
            key={k}
            className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3"
            initial={live ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{
              duration: durations.base,
              ease: easings.enter,
              delay: r3(i * cascade(4)),
            }}
          >
            <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {k}
            </dt>
            <dd className={cn("min-w-0 truncate text-foreground", d.text)}>
              {v}
            </dd>
          </motion.div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-3 rounded-3 border border-hairline px-3 py-2.5">
        <label htmlFor={switchId} className="flex min-w-0 flex-col">
          <span className={cn("font-medium text-foreground", d.text)}>
            Sign out other devices
          </span>
          <span className="text-[11px] text-ink-3">
            {otherDevices === 0
              ? "No other device is signed in."
              : current.signOutOthers
                ? `${otherDevices} other ${otherDevices === 1 ? "device" : "devices"} will be signed out.`
                : `${otherDevices} other ${otherDevices === 1 ? "device stays" : "devices stay"} signed in.`}
          </span>
        </label>
        <Switch
          id={switchId}
          checked={current.signOutOthers}
          onChange={setSignOut}
          motionSafe={motionSafe}
          disabled={inert}
          label="Sign out other devices"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <GhostButton onClick={restart} disabled={disabled}>
          <RotateCcw aria-hidden className="size-3.5" />
          Start over
        </GhostButton>
        <PrimaryButton
          type="button"
          busy={false}
          busyLabel=""
          disabled={inert}
          onClick={() => {
            if (!inert) onFinish?.(current);
          }}
        >
          Continue to sign in
          <ArrowRight aria-hidden className="size-3.5" />
        </PrimaryButton>
      </div>
    </div>
  );

  const panels: Record<RecoveryStep, React.ReactNode> = {
    identify: identifyPanel,
    verify: verifyPanel,
    reset: resetPanel,
    done: donePanel,
  };

  /* ------------------------------- render ------------------------------ */

  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={busy !== null || undefined}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--rr-accent" as string]: accentVar,
        ["--rr-wash" as string]: `color-mix(in oklab, ${accentVar} 12%, transparent)`,
        ["--rr-line" as string]: `color-mix(in oklab, ${accentVar} 45%, transparent)`,
      }}
    >
      <header
        className={cn(
          "flex shrink-0 items-end justify-between gap-3 pb-2",
          d.pad,
        )}
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {product}
          </p>
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        {ready ? (
          <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Step {index + 1} of {STEPS.length}
            <span className="hidden @min-[24rem]:inline"> · {stepLabel}</span>
          </p>
        ) : null}
      </header>

      {status === "loading" ? (
        <div aria-hidden className="flex flex-1 flex-col">
          <div className={cn("shrink-0 border-b border-hairline", d.map)}>
            <div
              className="relative flex items-start"
              style={{ paddingTop: DETOUR_H }}
            >
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <span
                    className="size-4 rounded-full bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 90}ms` }}
                  />
                  <span className="h-2 w-10 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          <div className={cn("flex flex-col gap-2.5", d.pad)}>
            <span className="h-3 w-2/3 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className="h-12 rounded-3 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 110}ms` }}
              />
            ))}
          </div>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The ways to verify didn&apos;t load.
          </p>
          {onRetry ? (
            <GhostButton onClick={onRetry}>
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </GhostButton>
          ) : null}
        </div>
      ) : (
        <>
          <RouteMap
            index={index}
            mapStyle={mapStyle}
            density={density}
            motionSafe={motionSafe}
            detour={detour}
            detourPhase={detourPhase}
            canGoBack={!inert && current.step !== "done"}
            onBack={back}
          />
          <div className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            <AnimatePresence initial={false} mode="wait" custom={dir}>
              <motion.section
                key={current.step}
                aria-label={`${stepLabel}, step ${index + 1} of ${STEPS.length}`}
                custom={dir}
                initial={
                  live
                    ? { opacity: 0, x: motionSafe ? dir * distances.shift : 0 }
                    : false
                }
                animate={{ opacity: 1, x: 0 }}
                exit={{
                  opacity: 0,
                  x: motionSafe ? -dir * distances.step : 0,
                  transition: exitFor(durations.fast),
                }}
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
                className={d.pad}
              >
                {panels[current.step]}
              </motion.section>
            </AnimatePresence>
          </div>
        </>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
