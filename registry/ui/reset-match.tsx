"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
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

export type ResetMeterStyle = "bar" | "ring" | "dots";
export type ResetDensity = "compact" | "cozy" | "roomy";
export type ResetStatus = "ready" | "loading" | "error";
export type ResetStrength = "empty" | "weak" | "fair" | "strong" | "excellent";
export type ResetField = "password" | "confirm";

/** Both fields' text. */
export type ResetValue = { password: string; confirm: string };

/** What a rule may look at besides the password itself. */
export type ResetRuleContext = {
  /** The account's address; a password must not contain it or its parts. */
  email: string;
  /** Lower-case passwords too common to allow. */
  common: string[];
};

export type ResetRule = {
  id: string;
  /** Shown in the checklist, e.g. "At least 12 characters". */
  label: string;
  /** True when the password satisfies the rule. */
  test: (password: string, context: ResetRuleContext) => boolean;
  /** A rule that, unmet, makes the password weak no matter what else it has: it is a problem, not a missing ingredient. @default false */
  critical?: boolean;
};

/** What the breach check answers. */
export type ResetCheck = {
  breached: boolean;
  /** How many times it has been seen, when the service knows. */
  seen?: number;
};

export type ResetScore = {
  strength: ResetStrength;
  /** Ids of the rules met. */
  met: string[];
  /** Ids of the rules not met. */
  failed: string[];
  /** A critical rule failed. */
  blocked: boolean;
  /** How full the meter is, 0 to 1. */
  fill: number;
};

export type ResetMatchProps = {
  /** How strength is drawn beneath the first field: a bar that fills, a ring that closes, or four dots that light. @default "bar" */
  meterStyle?: ResetMeterStyle;
  /** Draw the tie line that joins Confirm to the first field and knits when they match. @default true */
  tieLine?: boolean;
  /** Field heights, type size and spacing. @default "cozy" */
  density?: ResetDensity;
  /** The checklist, in order. @default defaultResetRules */
  rules?: ResetRule[];
  /** Controlled text of both fields. */
  value?: ResetValue;
  /** Initial text when uncontrolled. @default defaultResetValue */
  defaultValue?: ResetValue;
  /** Fires from every keystroke, the generator and Continue, with both fields and the one that changed. */
  onChange?: (value: ResetValue, field: ResetField) => void;
  /** Asks whether a password has appeared in a known breach. Runs, debounced, once every rule is met. @default defaultResetCheck */
  check?: (password: string) => Promise<ResetCheck>;
  /** Change password was pressed with a strong, matching password. A rejected promise shows an inline error. @default a short simulated round trip */
  onSubmit?: (password: string) => Promise<unknown> | unknown;
  /** Continue was pressed on the success card. */
  onContinue?: () => void;
  /** The account the password is for; shown in the header and kept out of the password. @default defaultResetEmail */
  email?: string;
  /** Passwords the "not a common password" rule refuses, lower case. @default defaultResetCommon */
  commonPasswords?: string[];
  /** Makes the password "Generate one" fills in; `attempt` counts from 1 so each press differs. @default generateResetPassword */
  generate?: (attempt: number) => string;
  /** Whether the reset link has been checked: a skeleton while it is, a note with Retry when the breach check failed (the form still works). @default "ready" */
  status?: ResetStatus;
  /** Retry was pressed after the breach check failed. */
  onRetry?: () => void;
  /** The heading. @default "Choose a new password" */
  title?: string;
  /** Shown on the success card beneath the tick. @default "You've been signed out everywhere else." */
  successNote?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the form scrolls inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be typed, generated or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultResetEmail = "mara.lind@coldbrook.app";

export const defaultResetValue: ResetValue = { password: "", confirm: "" };

/** Lower case; a password whose letters alone spell one of these is refused too. */
export const defaultResetCommon: string[] = [
  "password",
  "password1",
  "123456",
  "12345678",
  "qwerty",
  "letmein",
  "welcome",
  "welcome1",
  "coldbrook",
  "iloveyou",
  "admin",
  "sunshine",
  "monkey",
  "dragon",
];

const localParts = (email: string): string[] =>
  (email.split("@")[0] ?? "")
    .toLowerCase()
    .split(/[._+-]/)
    .filter((part) => part.length >= 3);

export const defaultResetRules: ResetRule[] = [
  {
    id: "length",
    label: "At least 12 characters",
    test: (password) => password.length >= 12,
  },
  {
    id: "number",
    label: "A number",
    test: (password) => /\d/.test(password),
  },
  {
    id: "symbol",
    label: "A symbol",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
  {
    id: "email",
    label: "Not your email address",
    critical: true,
    test: (password, { email }) => {
      if (password === "") return false;
      const low = password.toLowerCase();
      if (email && low.includes(email.toLowerCase())) return false;
      return !localParts(email).some((part) => low.includes(part));
    },
  },
  {
    id: "common",
    label: "Not a common password",
    critical: true,
    test: (password, { common }) => {
      if (password === "") return false;
      const low = password.toLowerCase();
      const letters = low.replace(/[^a-z]/g, "");
      if (common.includes(low)) return false;
      return !(letters.length >= 4 && common.includes(letters));
    },
  },
];

/** Passwords the simulated breach check has "seen". They pass every rule, which is the point. */
export const defaultResetBreached: string[] = ["Harbourlight42!"];

/** The simulator: answers in about 420ms and flags `defaultResetBreached`. */
export const defaultResetCheck = (password: string): Promise<ResetCheck> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        defaultResetBreached.includes(password)
          ? { breached: true, seen: 1204 }
          : { breached: false },
      );
    }, 420);
  });

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  "ember",
  "granite",
  "willow",
  "lantern",
  "quill",
  "tundra",
  "meadow",
  "orchid",
  "velvet",
  "saffron",
  "harbor",
  "cinder",
  "mantle",
  "juniper",
  "pebble",
  "thistle",
  "marrow",
  "lagoon",
  "kestrel",
  "oakmoss",
  "ripple",
  "sorrel",
  "basalt",
  "nimbus",
];

const JOINS = ["-", "_", ".", "!", "#"];

/** Three capitalised words, a symbol between them and two digits: seeded, so attempt 1 is always the same. */
export const generateResetPassword = (attempt: number): string => {
  const rand = mulberry32(1719 + attempt * 7919);
  const word = () => {
    const w = WORDS[Math.floor(rand() * WORDS.length)] ?? "ember";
    return w.charAt(0).toUpperCase() + w.slice(1);
  };
  const join = JOINS[Math.floor(rand() * JOINS.length)] ?? "-";
  const n = 10 + Math.floor(rand() * 90);
  return `${word()}${join}${word()}${join}${word()}${n}`;
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const INPUT =
  "w-full rounded-2 border border-hairline-strong bg-surface-0 font-mono text-foreground tracking-[0.02em] placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-3 transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-60";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

const CHECK_DELAY = 450;
const SUBMIT_SIM_MS = 600;
const GUTTER = 24;

const r3 = (v: number) => Number(v.toFixed(3));

const noopSubscribe = () => () => {};

const DENSITY: Record<
  ResetDensity,
  {
    field: string;
    text: string;
    gap: string;
    pad: string;
    item: string;
    small: string;
  }
> = {
  compact: {
    field: "h-8 px-2.5",
    text: "text-[12px]",
    gap: "gap-3",
    pad: "px-3 py-3",
    item: "gap-1.5 text-[11px]",
    small: "text-[10px]",
  },
  cozy: {
    field: "h-9 px-3",
    text: "text-[13px]",
    gap: "gap-4",
    pad: "px-4 py-4",
    item: "gap-2 text-[12px]",
    small: "text-[11px]",
  },
  roomy: {
    field: "h-10 px-3.5",
    text: "text-[14px]",
    gap: "gap-5",
    pad: "px-5 py-5",
    item: "gap-2.5 text-[13px]",
    small: "text-[12px]",
  },
};

const LEVEL: Record<
  ResetStrength,
  { word: string; colour: string; dots: number }
> = {
  empty: { word: "", colour: "var(--ink-3)", dots: 0 },
  weak: { word: "Weak", colour: "var(--danger)", dots: 1 },
  fair: { word: "Fair", colour: "var(--warn)", dots: 2 },
  strong: { word: "Strong", colour: "var(--success)", dots: 3 },
  excellent: { word: "Excellent", colour: "var(--accent-bright)", dots: 4 },
};

/**
 * Scores a password against the rules. Every rule met is a point, and so are
 * sixteen characters and mixed case; a failed critical rule makes it weak
 * outright. Exported so a host can show the strength elsewhere.
 */
export function scoreReset(
  password: string,
  rules: ResetRule[],
  context: ResetRuleContext,
): ResetScore {
  if (password === "") {
    return {
      strength: "empty",
      met: [],
      failed: rules.map((r) => r.id),
      blocked: false,
      fill: 0,
    };
  }
  const met = rules.filter((r) => r.test(password, context));
  const failed = rules.filter((r) => !met.includes(r));
  const blocked = failed.some((r) => r.critical === true);
  const long = password.length >= 16;
  const mixed = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const points = met.length + (long ? 1 : 0) + (mixed ? 1 : 0);
  const max = rules.length + 2;
  const ratio = points / max;
  let strength: ResetStrength;
  if (blocked || points <= Math.max(2, Math.floor(max * 0.3))) {
    strength = "weak";
  } else if (failed.length > 0) {
    strength = "fair";
  } else if (points >= max) {
    strength = "excellent";
  } else {
    strength = "strong";
  }
  const fill =
    strength === "weak"
      ? 0.08 + 0.22 * ratio
      : strength === "fair"
        ? 0.38 + 0.24 * ratio
        : strength === "strong"
          ? 0.8
          : 1;
  return {
    strength,
    met: met.map((r) => r.id),
    failed: failed.map((r) => r.id),
    blocked,
    fill: r3(fill),
  };
}

type TieState = "idle" | "match" | "mismatch";
type CheckState = "idle" | "checking" | "clear" | "breached" | "failed";
type SubmitState = "idle" | "pending" | "done" | "failed";
type Geo = { y1: number; y2: number; h: number };

/* ----------------------------------------------------------------------- */
/*                                   Meter                                  */
/* ----------------------------------------------------------------------- */

function Meter({
  style,
  strength,
  fill,
  motionSafe,
}: {
  style: ResetMeterStyle;
  strength: ResetStrength;
  fill: number;
  motionSafe: boolean;
}) {
  const colour = LEVEL[strength].colour;
  if (style === "ring") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-5 shrink-0 -rotate-90"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth="2.5"
        />
        <motion.circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={colour}
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          style={{ transition: "stroke 200ms" }}
          initial={false}
          animate={{ strokeDashoffset: r3(1 - fill) }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </svg>
    );
  }
  if (style === "dots") {
    const lit = LEVEL[strength].dots;
    const step = cascade(4);
    return (
      <span aria-hidden className="flex shrink-0 items-center gap-1">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="size-2 rounded-full transition-colors duration-200"
            style={{ background: i < lit ? colour : "var(--hairline-strong)" }}
            initial={false}
            animate={{ scale: i < lit ? 1 : 0.7 }}
            transition={
              motionSafe
                ? { ...springs.snap, delay: i < lit ? r3(i * step) : 0 }
                : { duration: 0 }
            }
          />
        ))}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
    >
      <motion.span
        className="absolute inset-y-0 left-0 w-full rounded-full transition-colors duration-200"
        style={{ originX: 0, background: colour }}
        initial={false}
        animate={{ scaleX: fill }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Tie line                                */
/* ----------------------------------------------------------------------- */

/**
 * A bracket in the gutter from the first field down to Confirm. Matching
 * draws it solid in green from the top on `springs.glide` while stitches
 * knit across it behind the head; a mismatch dashes it red and frays three
 * strands off its middle on `springs.flick`.
 */
function Tie({
  geo,
  state,
  motionSafe,
}: {
  geo: Geo;
  state: TieState;
  motionSafe: boolean;
}) {
  const { y1, y2, h } = geo;
  const x = 7;
  const d = `M ${GUTTER} ${y1} H ${x + 4} Q ${x} ${y1} ${x} ${y1 + 4} V ${y2 - 4} Q ${x} ${y2} ${x + 4} ${y2} H ${GUTTER}`;
  const ym = r3((y1 + y2) / 2);
  const span = Math.max(1, y2 - y1);
  const stitches: number[] = [];
  for (let y = y1 + 10; y <= y2 - 10; y += 8) stitches.push(y);
  const colour = state === "match" ? "var(--success)" : "var(--danger)";
  const fray = cascade(3);

  return (
    <svg
      aria-hidden
      width={GUTTER}
      height={Math.max(1, h)}
      viewBox={`0 0 ${GUTTER} ${Math.max(1, h)}`}
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="3 3"
      />
      <AnimatePresence initial={false}>
        {state === "match" ? (
          <motion.g
            key="match"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <motion.path
              d={d}
              fill="none"
              stroke={colour}
              strokeWidth={1.5}
              strokeLinecap="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
            {stitches.map((y) => (
              <motion.path
                key={y}
                d={`M ${x - 3} ${y} H ${x + 3}`}
                fill="none"
                stroke={colour}
                strokeWidth={1.5}
                strokeLinecap="round"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.flick,
                        delay: r3(0.05 + ((y - y1) / span) * 0.32),
                      }
                    : { duration: 0 }
                }
              />
            ))}
          </motion.g>
        ) : state === "mismatch" ? (
          <motion.g
            key="mismatch"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <path
              d={d}
              fill="none"
              stroke={colour}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="4 3"
            />
            {[-6, 0, 6].map((dy, i) => (
              <motion.path
                key={dy}
                d={`M ${x} ${ym} L ${x - 5} ${r3(ym + dy)}`}
                fill="none"
                stroke={colour}
                strokeWidth={1.5}
                strokeLinecap="round"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.flick, delay: r3(i * fray) }
                    : { duration: 0 }
                }
              />
            ))}
          </motion.g>
        ) : null}
      </AnimatePresence>
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Checklist                                */
/* ----------------------------------------------------------------------- */

function RuleItem({
  rule,
  met,
  danger,
  draw,
  motionSafe,
  className,
}: {
  rule: ResetRule;
  met: boolean;
  danger: boolean;
  draw: boolean;
  motionSafe: boolean;
  className: string;
}) {
  return (
    <li className={cn("flex items-center", className)}>
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
          met
            ? "border-transparent bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success"
            : danger
              ? "border-transparent bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger"
              : "border-hairline-strong text-ink-3",
        )}
      >
        {met ? (
          <svg aria-hidden viewBox="0 0 14 14" className="size-2.5">
            <motion.path
              d="M3 7.4 5.8 10 11 4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={draw && motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        ) : danger ? (
          <X aria-hidden className="size-2.5" strokeWidth={2.5} />
        ) : null}
      </span>
      <span
        className={cn(
          "min-w-0 truncate transition-colors duration-200",
          met ? "text-foreground" : danger ? "text-danger" : "text-ink-2",
        )}
      >
        {rule.label}
      </span>
      <span className="sr-only">
        {met ? ", met" : danger ? ", must change" : ", not yet"}
      </span>
    </li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A password reset that answers as you type. A strength meter beneath the
 * first field fills on `springs.glide` with a word — weak, fair, strong,
 * excellent — and the checklist beside it ticks each rule on `springs.flick`
 * as it is met. The Confirm field is tied to the first by a bracket in the
 * gutter: while the two differ it is dashed red and frays, and the moment
 * they match it draws solid green from the top on `springs.glide`, stitches
 * knitting across it behind the head. A switch shows both passwords at once.
 *
 * "Generate one" types a seeded strong password into the first field one
 * character at a time on a `cascade`, the meter and the ticks following it
 * up, then fills Confirm so the tie knits. Once every rule is met the
 * password is checked, debounced, against known breaches; one that has been
 * seen gets an inline warning and holds the Submit. Change password is held
 * until the two match and the strength is at least strong; success lands a
 * tick on `springs.recoil` with the signed-out-elsewhere note and Continue.
 *
 * The fields are native, the Show switch is a switch, and each change of
 * strength, match or breach state is spoken by a status region. Under reduced
 * motion the meter and the tie take their state at once, cross-fading, and
 * the generator fills both fields in one step.
 */
export function ResetMatch({
  meterStyle = "bar",
  tieLine = true,
  density = "cozy",
  rules = defaultResetRules,
  value,
  defaultValue = defaultResetValue,
  onChange,
  check = defaultResetCheck,
  onSubmit,
  onContinue,
  email = defaultResetEmail,
  commonPasswords = defaultResetCommon,
  generate = generateResetPassword,
  status = "ready",
  onRetry,
  title = "Choose a new password",
  successNote = "You've been signed out everywhere else.",
  label,
  height = 520,
  disabled = false,
  className,
}: ResetMatchProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const pwId = `${uid}-pw`;
  const cfId = `${uid}-cf`;
  const strengthId = `${uid}-strength`;
  const matchId = `${uid}-match`;
  const rulesId = `${uid}-rules`;
  const generateHintId = `${uid}-gen`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [own, setOwn] = React.useState<ResetValue>(defaultValue);
  const current = value ?? own;
  const password = current.password;
  const confirm = current.confirm;
  const ready = status !== "loading";
  const inert = disabled || !ready;

  const [shown, setShown] = React.useState(false);
  const [checked, setChecked] = React.useState<{
    password: string;
    result: "clear" | "breached" | "failed";
    seen?: number;
  } | null>(null);
  const [retrySeq, setRetrySeq] = React.useState(0);
  const [submitState, setSubmitState] = React.useState<SubmitState>("idle");
  const [note, setNote] = React.useState("");
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [fieldsEl, setFieldsEl] = React.useState<HTMLDivElement | null>(null);
  // False for the server render and hydration, so ticks already met on the
  // page never draw in; true for rules met later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rowA = React.useRef<HTMLDivElement | null>(null);
  const rowB = React.useRef<HTMLDivElement | null>(null);
  const pwRef = React.useRef<HTMLInputElement | null>(null);
  const continueRef = React.useRef<HTMLButtonElement | null>(null);
  const checkRef = React.useRef(check);
  const seq = React.useRef(0);
  const genTimer = React.useRef<number | null>(null);
  const genCount = React.useRef(0);
  const alive = React.useRef(true);

  /* -------------------------------- score ------------------------------ */

  const context: ResetRuleContext = { email, common: commonPasswords };
  const score = scoreReset(password, rules, context);
  const allMet = password !== "" && score.failed.length === 0;
  const matched = confirm !== "" && confirm === password;
  const tieState: TieState =
    confirm === "" ? "idle" : matched ? "match" : "mismatch";
  const level = LEVEL[score.strength];

  const wantCheck = ready && status !== "error" && allMet;
  const checkState: CheckState = !wantCheck
    ? status === "error" && allMet
      ? "failed"
      : "idle"
    : checked?.password === password
      ? checked.result
      : "checking";
  const seen = checked?.password === password ? checked.seen : undefined;

  const strongEnough =
    score.strength === "strong" || score.strength === "excellent";
  const canSubmit =
    !inert &&
    matched &&
    strongEnough &&
    checkState !== "breached" &&
    checkState !== "checking" &&
    submitState !== "pending";

  /* ------------------------------ lifetimes ---------------------------- */

  React.useEffect(() => {
    checkRef.current = check;
  }, [check]);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (genTimer.current !== null) window.clearTimeout(genTimer.current);
    };
  }, []);

  // The breach check: debounced from the last keystroke, only once every rule
  // is met, and a result that arrives for an older password is dropped.
  const fresh =
    checked !== null &&
    checked.password === password &&
    checked.result !== "failed";
  React.useEffect(() => {
    if (!wantCheck || fresh) return;
    seq.current += 1;
    const id = seq.current;
    const timer = window.setTimeout(() => {
      let result: Promise<ResetCheck>;
      try {
        result = checkRef.current(password);
      } catch {
        result = Promise.reject(new Error("check failed"));
      }
      result.then(
        (res) => {
          if (seq.current !== id) return;
          setChecked({
            password,
            result: res.breached ? "breached" : "clear",
            seen: res.seen,
          });
        },
        () => {
          if (seq.current !== id) return;
          setChecked({ password, result: "failed" });
        },
      );
    }, CHECK_DELAY);
    return () => {
      window.clearTimeout(timer);
      seq.current += 1;
    };
  }, [wantCheck, fresh, password, retrySeq]);

  // The tie needs the two fields' centres; one observer on their column
  // follows density changes and wraps.
  React.useEffect(() => {
    if (!fieldsEl || !tieLine || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => {
      const a = rowA.current;
      const b = rowB.current;
      if (!a || !b) return;
      const next: Geo = {
        y1: Math.round(a.offsetTop + a.offsetHeight / 2),
        y2: Math.round(b.offsetTop + b.offsetHeight / 2),
        h: Math.round(fieldsEl.offsetHeight),
      };
      setGeo((prev) =>
        prev && prev.y1 === next.y1 && prev.y2 === next.y2 && prev.h === next.h
          ? prev
          : next,
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(fieldsEl);
    return () => ro.disconnect();
  }, [fieldsEl, tieLine]);

  // Focus lands on Continue with the success card, so Enter carries on.
  React.useLayoutEffect(() => {
    if (submitState === "done") {
      continueRef.current?.focus({ preventScroll: true });
    }
  }, [submitState]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: ResetValue, field: ResetField) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, field);
  };

  const clearGen = () => {
    if (genTimer.current !== null) window.clearTimeout(genTimer.current);
    genTimer.current = null;
  };

  const edit = (field: ResetField, text: string) => {
    if (inert) return;
    clearGen();
    if (submitState === "failed") setSubmitState("idle");
    commit(
      field === "password"
        ? { password: text, confirm }
        : { password, confirm: text },
      field,
    );
  };

  const runGenerate = () => {
    if (inert || submitState === "pending") return;
    clearGen();
    genCount.current += 1;
    const next = generate(genCount.current);
    if (submitState === "failed") setSubmitState("idle");
    if (!motionSafe) {
      commit({ password: next, confirm: next }, "confirm");
      setNote("Generated a password and filled both fields.");
      return;
    }
    const stepMs = Math.round(cascade(next.length) * 1000);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i <= next.length) {
        commit({ password: next.slice(0, i), confirm: "" }, "password");
        genTimer.current = window.setTimeout(tick, stepMs);
      } else {
        genTimer.current = null;
        commit({ password: next, confirm: next }, "confirm");
        setNote("Generated a password and filled both fields.");
      }
    };
    tick();
  };

  const retryCheck = () => {
    if (status === "error") {
      onRetry?.();
      return;
    }
    setChecked(null);
    setRetrySeq((n) => n + 1);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      pwRef.current?.focus();
      return;
    }
    setSubmitState("pending");
    setNote("");
    let run: Promise<unknown>;
    try {
      run = onSubmit
        ? Promise.resolve(onSubmit(password))
        : new Promise((resolve) => window.setTimeout(resolve, SUBMIT_SIM_MS));
    } catch {
      run = Promise.reject(new Error("submit failed"));
    }
    run.then(
      () => {
        if (!alive.current) return;
        setSubmitState("done");
        setNote(`Password changed. ${successNote}`);
      },
      () => {
        if (!alive.current) return;
        setSubmitState("failed");
        setNote("The password could not be changed. Try again.");
      },
    );
  };

  const proceed = () => {
    const next: ResetValue = { password: "", confirm: "" };
    if (value === undefined) setOwn(next);
    onChange?.(next, "password");
    setChecked(null);
    setSubmitState("idle");
    setNote("");
    onContinue?.();
  };

  /* ------------------------------- render ------------------------------ */

  const strengthText =
    score.strength === "empty"
      ? ""
      : `${level.word} · ${score.met.length} of ${rules.length}`;

  const liveText = [
    score.strength === "empty"
      ? "No password yet."
      : `Strength ${level.word.toLowerCase()}, ${score.met.length} of ${rules.length} met.`,
    tieState === "idle"
      ? ""
      : matched
        ? "Passwords match."
        : "Passwords do not match yet.",
    checkState === "breached"
      ? "This password has appeared in a known breach."
      : checkState === "failed"
        ? "The breach check is unavailable."
        : "",
  ]
    .filter(Boolean)
    .join(" ");

  const skeleton = (
    <div aria-hidden className={cn("flex flex-col", d.gap, d.pad)}>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <span className="h-2.5 w-20 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
          <span
            className={cn(
              "w-full rounded-2 bg-surface-2 motion-safe:animate-pulse",
              d.field.split(" ")[0],
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          />
          {i === 0 ? (
            <span className="mt-1 h-1.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
          ) : null}
        </div>
      ))}
      <div className="flex flex-col gap-2 pt-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{
              width: `${44 + ((i * 17) % 30)}%`,
              animationDelay: `${i * 70}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );

  const checkLine = (
    <AnimatePresence initial={false} mode="wait">
      {checkState === "checking" ? (
        <motion.p
          key="checking"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.fast }}
          className={cn("flex items-center gap-1.5 text-ink-3", d.small)}
        >
          <LoaderCircle
            aria-hidden
            className="size-3 shrink-0 motion-safe:animate-spin"
          />
          Checking against known breaches
        </motion.p>
      ) : checkState === "clear" ? (
        <motion.p
          key="clear"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { ...springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          className={cn("flex items-center gap-1.5 text-success", d.small)}
        >
          <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
          Not seen in any known breach
        </motion.p>
      ) : checkState === "breached" ? (
        <motion.div
          key="breached"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { ...springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          className={cn(
            "flex items-start gap-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-2.5 py-2 text-foreground",
            d.small,
          )}
        >
          <ShieldAlert
            aria-hidden
            className="mt-px size-3.5 shrink-0 text-danger"
          />
          <span>
            This password has appeared in a known breach
            {seen !== undefined ? ` ${seen.toLocaleString()} times` : ""}.
            Choose a different one.
          </span>
        </motion.div>
      ) : checkState === "failed" ? (
        <motion.div
          key="failed"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { ...springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          className={cn(
            "flex flex-col gap-2 rounded-2 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] px-2.5 py-2 text-foreground",
            d.small,
          )}
        >
          <span className="flex items-start gap-2">
            <TriangleAlert
              aria-hidden
              className="mt-px size-3.5 shrink-0 text-warn"
            />
            <span>
              The breach check could not be reached. You can still change your
              password.
            </span>
          </span>
          <button
            type="button"
            onClick={retryCheck}
            className={cn(BUTTON, "self-start bg-card", FOCUS_RING)}
          >
            <RotateCcw aria-hidden className="size-3" />
            Retry
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const form = (
    <motion.form
      key="form"
      noValidate
      onSubmit={submit}
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className={cn(
            "grid gap-5 @min-[40rem]:grid-cols-[minmax(0,1fr)_13.5rem] @min-[40rem]:gap-6",
            d.pad,
          )}
        >
          <div className={cn("flex min-w-0 flex-col", d.gap)}>
            <div
              ref={setFieldsEl}
              className={cn("relative flex flex-col", d.gap)}
              style={{ paddingLeft: tieLine ? GUTTER + 6 : undefined }}
            >
              {tieLine && geo ? (
                <Tie geo={geo} state={tieState} motionSafe={motionSafe} />
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label htmlFor={pwId} className={LABEL}>
                  New password
                </label>
                <div ref={rowA}>
                  <input
                    ref={pwRef}
                    id={pwId}
                    type={shown ? "text" : "password"}
                    value={password}
                    autoComplete="new-password"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="At least 12 characters"
                    disabled={inert}
                    aria-describedby={`${strengthId} ${rulesId}`}
                    aria-invalid={score.blocked || undefined}
                    onChange={(event) => edit("password", event.target.value)}
                    className={cn(INPUT, d.field, d.text, FOCUS_RING)}
                  />
                </div>
                <div className="flex h-5 items-center gap-2.5">
                  <Meter
                    style={meterStyle}
                    strength={score.strength}
                    fill={score.fill}
                    motionSafe={motionSafe}
                  />
                  <span
                    id={strengthId}
                    className={cn(
                      "relative shrink-0 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap uppercase",
                      meterStyle !== "bar" && "flex-1",
                    )}
                  >
                    <span className="sr-only">
                      {score.strength === "empty"
                        ? "Strength: none yet"
                        : `Strength: ${level.word}`}
                    </span>
                    <AnimatePresence initial={false} mode="popLayout">
                      <motion.span
                        key={score.strength}
                        aria-hidden
                        className="inline-block transition-colors duration-200"
                        style={{ color: level.colour }}
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.nudge : 0,
                        }}
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
                        {score.strength === "empty" ? "Strength" : strengthText}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={cfId} className={LABEL}>
                  Confirm
                </label>
                <div ref={rowB}>
                  <input
                    id={cfId}
                    type={shown ? "text" : "password"}
                    value={confirm}
                    autoComplete="new-password"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Type it again"
                    disabled={inert}
                    aria-describedby={matchId}
                    aria-invalid={tieState === "mismatch" || undefined}
                    onChange={(event) => edit("confirm", event.target.value)}
                    className={cn(
                      INPUT,
                      d.field,
                      d.text,
                      tieState === "match" &&
                        "border-[color-mix(in_oklab,var(--success)_55%,transparent)]",
                      tieState === "mismatch" &&
                        "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]",
                      FOCUS_RING,
                    )}
                  />
                </div>
                <p id={matchId} className={cn("relative h-4", d.small)}>
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={tieState}
                      className={cn(
                        "inline-flex items-center gap-1",
                        tieState === "match"
                          ? "text-success"
                          : tieState === "mismatch"
                            ? "text-danger"
                            : "text-ink-3",
                      )}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.nudge : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {tieState === "match"
                        ? "Matches"
                        : tieState === "mismatch"
                          ? "Doesn't match yet"
                          : "Type the same password again"}
                    </motion.span>
                  </AnimatePresence>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button
                type="button"
                onClick={runGenerate}
                aria-disabled={inert || submitState === "pending" || undefined}
                aria-describedby={generateHintId}
                className={cn(
                  BUTTON,
                  (inert || submitState === "pending") &&
                    "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-ink-2",
                  FOCUS_RING,
                )}
              >
                <Sparkles aria-hidden className="size-3.5" />
                Generate one
              </button>
              <span id={generateHintId} className={cn("text-ink-3", d.small)}>
                Fills both fields. Keep it somewhere safe.
              </span>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-3">
            <div className="rounded-3 border border-hairline bg-surface-0 p-3">
              <p className={cn(LABEL, "mb-2")}>Your password needs</p>
              <ul
                id={rulesId}
                aria-label="Password requirements"
                className="flex flex-col gap-1.5"
              >
                {rules.map((rule) => {
                  const met = score.met.includes(rule.id);
                  return (
                    <RuleItem
                      key={rule.id}
                      rule={rule}
                      met={met}
                      danger={!met && rule.critical === true && password !== ""}
                      draw={live}
                      motionSafe={motionSafe}
                      className={d.item}
                    />
                  );
                })}
              </ul>
            </div>
            {checkLine}
          </aside>
        </div>
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-hairline px-4 py-3 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between">
        <p
          className={cn(
            "min-w-0",
            d.small,
            submitState === "failed" ? "text-danger" : "text-ink-3",
          )}
        >
          {submitState === "failed"
            ? "The password could not be changed. Try again."
            : !matched || !strongEnough
              ? "Make it strong and matching to continue."
              : "Changing it signs you out everywhere else."}
        </p>
        <button
          type="submit"
          aria-disabled={!canSubmit || undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-4 text-sm font-medium transition-colors",
            canSubmit
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : submitState === "pending"
                ? "bg-primary text-primary-foreground opacity-80"
                : "cursor-not-allowed bg-surface-2 text-ink-3",
            FOCUS_RING,
          )}
        >
          {submitState === "pending" ? (
            <LoaderCircle
              aria-hidden
              className="size-3.5 motion-safe:animate-spin"
            />
          ) : null}
          {submitState === "pending" ? "Changing" : "Change password"}
        </button>
      </footer>
    </motion.form>
  );

  const done = (
    <motion.div
      key="done"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.base }
      }
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8 text-center"
    >
      <motion.span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success"
        initial={motionSafe ? { scale: 0.4 } : false}
        animate={{ scale: 1 }}
        transition={
          motionSafe ? { ...springs.recoil, delay: 0.08 } : { duration: 0 }
        }
      >
        <svg viewBox="0 0 24 24" className="size-6">
          <motion.path
            d="M5 12.5 9.8 17 19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={
              motionSafe ? { ...springs.flick, delay: 0.18 } : { duration: 0 }
            }
          />
        </svg>
      </motion.span>
      <p className="text-sm font-semibold">Password changed</p>
      <p className={cn("max-w-[28rem] text-ink-2", d.text)}>{successNote}</p>
      <button
        ref={continueRef}
        type="button"
        onClick={proceed}
        className={cn(
          "mt-1 inline-flex h-9 items-center justify-center rounded-2 bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90",
          FOCUS_RING,
        )}
      >
        Continue
      </button>
    </motion.div>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      style={{ height }}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <p className="hidden min-w-0 truncate font-mono text-[11px] text-ink-3 @min-[24rem]:block">
            for {email}
          </p>
        </div>
        {status === "loading" ? (
          <p
            className={cn(
              "flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
            )}
          >
            <LoaderCircle
              aria-hidden
              className="size-3 motion-safe:animate-spin"
            />
            Checking link
          </p>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={shown}
            aria-label="Show passwords"
            onClick={() => setShown((s) => !s)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-2 rounded-full pr-1 pl-2 text-xs text-ink-2 transition-colors hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {shown ? (
              <EyeOff aria-hidden className="size-3.5" />
            ) : (
              <Eye aria-hidden className="size-3.5" />
            )}
            <span className="hidden @min-[24rem]:inline">
              {shown ? "Hide" : "Show"}
            </span>
            <span
              aria-hidden
              className={cn(
                "relative h-4 w-7 rounded-full border transition-colors duration-200",
                shown
                  ? "border-transparent bg-primary"
                  : "border-hairline-strong bg-surface-2",
              )}
            >
              <motion.span
                className={cn(
                  "absolute top-0.5 left-0.5 size-[10px] rounded-full transition-colors duration-200",
                  shown ? "bg-primary-foreground" : "bg-ink-3",
                )}
                initial={false}
                animate={{ x: shown ? 12 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            </span>
          </button>
        )}
      </header>

      {status === "loading" ? (
        skeleton
      ) : (
        <AnimatePresence initial={false} mode="wait">
          {submitState === "done" ? done : form}
        </AnimatePresence>
      )}

      <p role="status" aria-atomic className="sr-only">
        {liveText}
      </p>
      <p role="status" className="sr-only">
        {note}
      </p>
    </div>
  );
}
