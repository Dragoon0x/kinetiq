"use client";

import * as React from "react";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
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

export type ResetMatchRule = {
  id: string;
  /** Short, as it reads in the list: "At least 12 characters". */
  label: string;
  /** True when the password meets the rule. */
  test: (password: string) => boolean;
};

export type ResetMatchLineStyle = "line" | "stitch" | "capsule";
export type ResetMatchDensity = "compact" | "regular" | "roomy";
export type ResetMatchStatus = "ready" | "loading" | "error" | "done";

export type ResetMatchAccount = { name: string; email: string };

/** What the form knows after a keystroke — counts and positions, never characters. */
export type ResetMatchCheck = {
  /** Ids of the rules the new password meets. */
  met: string[];
  /** Characters in the new password. */
  length: number;
  /** Characters in the confirmation. */
  confirmLength: number;
  /** How many leading characters of the confirmation agree. */
  matched: number;
  /** The 1-based character where the confirmation first differs, or null. */
  differsAt: number | null;
  /** Every rule met and the two fields agree in full. */
  ready: boolean;
};

export type ResetMatchProps = {
  /** The requirements, checked live as the new password is typed. @default defaultResetMatchRules */
  rules?: ResetMatchRule[];
  /** How a matched pair is joined on the rail: a short line, a cross-stitch, or the two dots merged into one capsule. @default "line" */
  lineStyle?: ResetMatchLineStyle;
  /** Field heights (36, 40, 44px), gaps and the size of the rail. @default "regular" */
  density?: ResetMatchDensity;
  /** Joints, locked dots, the match chip and met ticks; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Asked on submit, before `onSubmit`. True refuses the password with `reusedMessage`. */
  isReused?: (password: string) => boolean | Promise<boolean>;
  /** Why a reused password is refused. @default "You've used this password before. Choose one you haven't used on Fernworks." */
  reusedMessage?: string;
  /** Fires with an accepted password. Return a promise to show "Updating"; a rejection shows its message under the field. */
  onSubmit?: (password: string) => void | Promise<unknown>;
  /** "Continue to sign in" was pressed on the done panel. */
  onContinue?: () => void;
  /** "Back to sign in" was pressed. Omit it to hide the link. */
  onCancel?: () => void;
  /** "Send a new link" was pressed on the expired-link panel. */
  onResend?: () => void;
  /** Whose password this is: named under the title and offered to password managers. @default defaultResetMatchAccount */
  account?: ResetMatchAccount;
  /** loading: the reset link is being checked; error: it has expired; done: the password is set. @default "ready" */
  status?: ResetMatchStatus;
  /** The heading. @default "Set a new password" */
  title?: string;
  /** The submit button's words. @default "Update password" */
  submitLabel?: string;
  /** Longest password the fields take; the rail tightens its pitch to fit it. @default 64 */
  maxLength?: number;
  /** What the new-password field starts with, uncontrolled — for a form resumed mid-way. @default "" */
  defaultPassword?: string;
  /** What the confirmation field starts with, uncontrolled. @default "" */
  defaultConfirm?: string;
  /** Fires from each keystroke with counts and positions (never characters), e.g. to narrate progress elsewhere. */
  onCheck?: (check: ResetMatchCheck) => void;
  /** Disables the fields and every action. @default false */
  disabled?: boolean;
  /** Classes for the outer panel. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultResetMatchAccount: ResetMatchAccount = {
  name: "Ines Park",
  email: "ines.park@fernworks.app",
};

const chars = (s: string) => Array.from(s);

export const defaultResetMatchRules: ResetMatchRule[] = [
  {
    id: "length",
    label: "At least 12 characters",
    test: (p) => chars(p).length >= 12,
  },
  {
    id: "case",
    label: "Upper and lower case",
    test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p),
  },
  { id: "number", label: "A number", test: (p) => /\d/.test(p) },
  {
    id: "symbol",
    label: "A symbol, like ! or #",
    test: (p) => /[^A-Za-z0-9\s]/.test(p),
  },
];

const DEFAULT_REUSED =
  "You've used this password before. Choose one you haven't used on Fernworks.";

type Geometry = {
  field: string;
  text: string;
  gap: string;
  rail: number;
  dot: number;
  lift: number;
  pitch: number;
};

const DENSITY: Record<ResetMatchDensity, Geometry> = {
  compact: {
    field: "h-9",
    text: "text-[13px]",
    gap: "gap-3",
    rail: 22,
    dot: 2.6,
    lift: 3,
    pitch: 10,
  },
  regular: {
    field: "h-10",
    text: "text-[13px]",
    gap: "gap-4",
    rail: 28,
    dot: 3,
    lift: 4,
    pitch: 12,
  },
  roomy: {
    field: "h-11",
    text: "text-sm",
    gap: "gap-5",
    rail: 34,
    dot: 3.4,
    lift: 5,
    pitch: 14,
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/* ----------------------------------------------------------------------- */
/*                                 The rail                                 */
/* ----------------------------------------------------------------------- */

type Pair = "locked" | "gap" | "loose" | "extra";

/** Where the confirmation first parts from the password, or -1 while it agrees. */
function firstDifference(a: string[], b: string[]): number {
  for (let i = 0; i < b.length; i += 1) {
    if (i >= a.length || a[i] !== b[i]) return i;
  }
  return -1;
}

/**
 * The comparison strip between the two fields. It is handed counts and the
 * first difference only — the characters never reach it — and draws one dot
 * per character on each row, locking matched pairs together.
 */
function MatchRail({
  top,
  bottom,
  diff,
  lineStyle,
  geometry,
  sealed,
  motionSafe,
}: {
  top: number;
  bottom: number;
  diff: number;
  lineStyle: ResetMatchLineStyle;
  geometry: Geometry;
  sealed: boolean;
  motionSafe: boolean;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(320);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() =>
      setWidth(Math.max(80, Math.round(node.clientWidth))),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  const g = geometry;
  const n = Math.max(top, bottom);
  const inset = 12;
  const room = Math.max(40, width - inset * 2);
  const pitch = r2(Math.min(g.pitch, Math.max(4, room / Math.max(1, n))));
  const r = r2(Math.min(g.dot, pitch * 0.34));
  const topY = r2(g.dot + 3);
  const botY = r2(g.rail - g.dot - 3);
  const lockY = r2(botY - g.lift);
  const midY = r2((topY + botY) / 2);
  const xOf = (i: number) => r2(inset + pitch * i + pitch / 2);
  const locked = diff === -1 ? bottom : diff;
  const step = cascade(Math.max(2, locked));

  const pairOf = (i: number): Pair =>
    i < locked ? "locked" : i === diff ? "gap" : i >= top ? "extra" : "loose";

  const tween = { duration: durations.fast, ease: easings.enter };
  const exit = { duration: durations.blink * 1.5, ease: easings.exit };
  const glide = motionSafe ? springs.glide : { duration: 0 };
  const snap = motionSafe ? springs.snap : { duration: 0 };
  const flick = motionSafe ? springs.flick : { duration: 0 };

  const joint = (i: number) => {
    const x = xOf(i);
    const y1 = r2(topY + r * 0.6);
    const y2 = r2(lockY - r * 0.6);
    const shine = sealed
      ? {
          duration: motionSafe ? 0.46 : durations.base,
          ease: easings.move,
          delay: motionSafe ? i * step : 0,
        }
      : tween;
    let mark: React.ReactNode;
    if (lineStyle === "capsule") {
      // The pair becomes one pill: drawn behind the two dots, in their colour.
      mark = (
        <motion.rect
          x={r2(-r)}
          y={r2(topY - r)}
          width={r2(r * 2)}
          rx={r}
          className="fill-(--rm-accent)"
          initial={{ height: r2(r * 2), opacity: 0.35 }}
          animate={{
            height: r2(lockY - topY + r * 2),
            opacity: sealed ? (motionSafe ? [0.35, 1, 0.8] : 0.8) : 0.35,
          }}
          transition={{ height: flick, opacity: shine }}
        />
      );
    } else if (lineStyle === "stitch") {
      // A cross-stitch: two short diagonals, the way a seam is sewn shut.
      const s = r2(Math.min(pitch * 0.3, 3.2));
      mark = (
        <motion.path
          d={`M ${-s} ${y1} L ${s} ${y2} M ${s} ${y1} L ${-s} ${y2}`}
          fill="none"
          strokeLinecap="round"
          className="stroke-(--rm-accent)"
          initial={{ pathLength: 0, strokeWidth: 1.25 }}
          animate={{
            pathLength: 1,
            strokeWidth: sealed ? (motionSafe ? [1.25, 2.2, 1.6] : 1.6) : 1.25,
          }}
          transition={{ pathLength: flick, strokeWidth: shine }}
        />
      );
    } else {
      mark = (
        <motion.line
          x1={0}
          x2={0}
          y1={y1}
          strokeLinecap="round"
          className="stroke-(--rm-accent)"
          initial={{ y2: y1, strokeWidth: 1.5 }}
          animate={{
            y2,
            strokeWidth: sealed ? (motionSafe ? [1.5, 2.6, 2] : 2) : 1.5,
          }}
          transition={{ y2: flick, strokeWidth: shine }}
        />
      );
    }
    // The joint rides a group translated along the rail, so a pitch change
    // carries it with its dots on the same spring.
    return (
      <motion.g
        key={`j${i}`}
        initial={{ x, opacity: 0 }}
        animate={{ x, opacity: 1 }}
        exit={{ opacity: 0, transition: exit }}
        transition={{ x: glide, opacity: tween }}
      >
        {mark}
      </motion.g>
    );
  };

  return (
    <div ref={setNode} aria-hidden className="relative w-full">
      <svg
        width="100%"
        height={g.rail}
        viewBox={`0 0 ${width} ${g.rail}`}
        preserveAspectRatio="none"
        className="block overflow-visible"
      >
        {/* The seam's track: a hairline the dots sit either side of. */}
        <line
          x1={inset}
          x2={width - inset}
          y1={midY}
          y2={midY}
          className="stroke-hairline"
          strokeDasharray="2 4"
        />
        {diff >= 0 ? (
          <motion.g
            key={`gap${diff}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={tween}
          >
            <rect
              x={r2(xOf(diff) - pitch / 2)}
              y={0}
              width={pitch}
              height={g.rail}
              rx={2}
              className={cn(
                diff >= top
                  ? "fill-[color-mix(in_oklab,var(--danger)_12%,transparent)]"
                  : "fill-[color-mix(in_oklab,var(--warn)_14%,transparent)]",
              )}
            />
            <path
              d={`M ${r2(xOf(diff) - 3)} ${r2(midY + 2)} L ${xOf(diff)} ${r2(midY - 1.5)} L ${r2(xOf(diff) + 3)} ${r2(midY + 2)}`}
              fill="none"
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={diff >= top ? "stroke-danger" : "stroke-warn"}
            />
          </motion.g>
        ) : null}
        <AnimatePresence initial={false}>
          {Array.from({ length: locked }, (_, i) => joint(i))}
        </AnimatePresence>
        {/* Dots there at the first paint stand still; later ones pop in. */}
        <AnimatePresence initial={false}>
          {Array.from({ length: top }, (_, i) => {
            const on = i < locked;
            return (
              <motion.circle
                key={`t${i}`}
                cy={topY}
                className={cn(
                  "transition-colors duration-150",
                  on ? "fill-(--rm-accent)" : "fill-ink-2",
                )}
                initial={{ cx: xOf(i), r: 0 }}
                animate={{
                  cx: xOf(i),
                  r: sealed && on && motionSafe ? [r, r2(r * 1.35), r] : r,
                }}
                transition={{
                  cx: glide,
                  r:
                    sealed && on
                      ? {
                          duration: motionSafe ? 0.46 : durations.base,
                          ease: easings.move,
                          delay: motionSafe ? i * step : 0,
                        }
                      : flick,
                }}
              />
            );
          })}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {Array.from({ length: bottom }, (_, i) => {
            const pair = pairOf(i);
            const y =
              pair === "locked" ? lockY : pair === "gap" ? r2(botY + 2) : botY;
            const hollow = pair === "gap" || pair === "extra";
            return (
              <motion.circle
                key={`b${i}`}
                strokeWidth={hollow ? 1.25 : 0}
                className={cn(
                  "transition-colors duration-150",
                  pair === "locked" && "fill-(--rm-accent)",
                  pair === "loose" && "fill-ink-3 opacity-50",
                  pair === "gap" &&
                    (i >= top
                      ? "fill-transparent stroke-danger"
                      : "fill-transparent stroke-warn"),
                  pair === "extra" &&
                    "fill-transparent stroke-danger opacity-70",
                )}
                initial={{ cx: xOf(i), cy: botY, r: 0 }}
                animate={{
                  cx: xOf(i),
                  cy: y,
                  r: hollow ? r2(Math.max(1.6, r - 0.5)) : r,
                }}
                transition={{ cx: glide, cy: snap, r: flick }}
              />
            );
          })}
        </AnimatePresence>
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Pieces                                  */
/* ----------------------------------------------------------------------- */

/** A box whose height follows its content on glide, measured. */
function Measured({
  glide,
  children,
}: {
  glide: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && height !== null ? height : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 6 }}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

function Tick({ on, motionSafe }: { on: boolean; motionSafe: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
        on
          ? "border-transparent bg-(--rm-accent) text-primary-foreground"
          : "border-hairline-strong bg-transparent text-transparent",
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3">
        <motion.path
          d="M4 8.5 L6.8 11 L12 5.2"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      </svg>
    </span>
  );
}

function FieldError({
  id,
  text,
  motionSafe,
}: {
  id: string;
  text: string | null;
  motionSafe: boolean;
}) {
  return (
    <AnimatePresence initial={false}>
      {text ? (
        <motion.p
          key="err"
          id={id}
          className="overflow-clip text-[12px] leading-snug text-danger"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{
            height: 0,
            opacity: 0,
            transition: { duration: durations.fast, ease: easings.exit },
          }}
          transition={{
            height: motionSafe ? springs.glide : { duration: 0 },
            opacity: { duration: durations.fast },
          }}
        >
          <span className="block pt-1.5">{text}</span>
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The form                                */
/* ----------------------------------------------------------------------- */

type Phase = "form" | "checking" | "saving" | "done";

/**
 * A set-new-password form whose confirmation shows, without ever showing a
 * character, how far it agrees with the password above it. Between the two
 * fields runs a rail: a dot for every character of the new password on top,
 * a dot for every character of the confirmation below. While the confirmation
 * agrees, each new dot rises toward its partner on snap and the joint between
 * them draws on flick — a line, a cross-stitch or one merged capsule. At the
 * first difference a gap opens — that dot drops, turns hollow in warn under a
 * small caret — and everything after it hangs loose. When the two agree in
 * full and every rule is met, a highlight runs along the joints in a cascade
 * and a Match chip lands on recoil.
 *
 * Requirements are checked live and spoken as they flip; the rail's state is
 * spoken after a pause, as a position, never a character. Submitting checks
 * the rules, then the match, then `isReused`, then `onSubmit`; a refusal
 * nudges the field on a symmetric tween — never a spring — and says why.
 * Under reduced motion dots and joints appear in place and the seam lights at
 * once; every state still shows.
 */
export function ResetMatch({
  rules = defaultResetMatchRules,
  lineStyle = "line",
  density = "regular",
  accent = "var(--accent-bright)",
  isReused,
  reusedMessage = DEFAULT_REUSED,
  onSubmit,
  onContinue,
  onCancel,
  onResend,
  account = defaultResetMatchAccount,
  status = "ready",
  title = "Set a new password",
  submitLabel = "Update password",
  maxLength = 64,
  onCheck,
  defaultPassword = "",
  defaultConfirm = "",
  disabled = false,
  className,
}: ResetMatchProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const g = DENSITY[density] ?? DENSITY.regular;
  const pwId = `${uid}-pw`;
  const confirmId = `${uid}-confirm`;
  const pwErrId = `${uid}-pw-err`;
  const confirmErrId = `${uid}-confirm-err`;
  const rulesId = `${uid}-rules`;
  const titleId = `${uid}-title`;

  const [pw, setPw] = React.useState(defaultPassword);
  const [confirm, setConfirm] = React.useState(defaultConfirm);
  const [showPw, setShowPw] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("form");
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);
  const [confirmTouched, setConfirmTouched] = React.useState(false);

  const a = chars(pw);
  const b = chars(confirm);
  const diff = firstDifference(a, b);
  const met = rules.map((rule) => rule.test(pw));
  const metCount = met.filter(Boolean).length;
  const allMet = metCount === rules.length;
  const full = a.length > 0 && b.length === a.length && diff === -1;
  const sealed = full && allMet;

  /** Reported from the keystroke that caused it, computed from the new values. */
  const report = (nextPw: string, nextConfirm: string) => {
    if (!onCheck) return;
    const na = chars(nextPw);
    const nb = chars(nextConfirm);
    const d = firstDifference(na, nb);
    const metIds = rules.filter((rule) => rule.test(nextPw)).map((r) => r.id);
    onCheck({
      met: metIds,
      length: na.length,
      confirmLength: nb.length,
      matched: d === -1 ? nb.length : d,
      differsAt: d === -1 ? null : d + 1,
      ready:
        metIds.length === rules.length &&
        na.length > 0 &&
        nb.length === na.length &&
        d === -1,
    });
  };
  const busy = phase === "checking" || phase === "saving";
  const shown: ResetMatchStatus | Phase =
    status === "ready" ? phase : status === "done" ? "done" : status;

  /* ------------------------------ speech ------------------------------- */

  const railText =
    b.length === 0
      ? ""
      : full
        ? "Passwords match."
        : diff === -1
          ? `Confirmation matches so far, ${b.length} of ${a.length} characters.`
          : diff >= a.length
            ? "Confirmation is longer than the password."
            : `Confirmation differs from character ${diff + 1}.`;
  const metKey = met.map((m) => (m ? 1 : 0)).join("");
  const [seenMet, setSeenMet] = React.useState(metKey);
  const [flipped, setFlipped] = React.useState("");
  if (seenMet !== metKey) {
    // The rule that just changed, named from the render that sees it change.
    const changed = rules.find(
      (_, i) => (seenMet.charAt(i) === "1") !== (met[i] ?? false),
    );
    setSeenMet(metKey);
    if (changed) {
      const on = changed.test(pw);
      setFlipped(
        `${on ? "Requirement met" : "Requirement no longer met"}: ${changed.label}.`,
      );
    }
  }
  const [spoken, setSpoken] = React.useState("");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  // Typing is spoken after a pause, never per key.
  React.useEffect(() => {
    const text = [flipped, railText].filter(Boolean).join(" ");
    const t = window.setTimeout(() => setSpoken(text), 600);
    return () => window.clearTimeout(t);
  }, [flipped, railText]);

  /* ------------------------------ nudges ------------------------------- */

  const [pwBox, animatePw] = useAnimate<HTMLDivElement>();
  const [confirmBox, animateConfirm] = useAnimate<HTMLDivElement>();
  const nudge = (which: "pw" | "confirm") => {
    const scope = which === "pw" ? pwBox : confirmBox;
    const run = which === "pw" ? animatePw : animateConfirm;
    if (!scope.current) return;
    if (motionSafe) {
      // A refusal is a symmetric shake on a tween: nothing about it celebrates.
      run(
        scope.current,
        { x: [0, -6, 6, -4, 4, 0] },
        { duration: 0.36, ease: easings.move },
      );
    } else {
      // Still: the field dims once instead of travelling.
      run(
        scope.current,
        { opacity: [1, 0.55, 1] },
        { duration: 0.3, ease: easings.move },
      );
    }
  };

  const pwRef = React.useRef<HTMLInputElement | null>(null);
  const confirmRef = React.useRef<HTMLInputElement | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* ------------------------------ submit ------------------------------- */

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || disabled || status !== "ready") return;
    const missing = rules.find((rule) => !rule.test(pw));
    if (missing) {
      setPwError(`Needs ${lowerFirst(missing.label)}.`);
      setSaid((s) => ({
        n: s.n + 1,
        text: `Needs ${lowerFirst(missing.label)}.`,
      }));
      nudge("pw");
      pwRef.current?.focus();
      return;
    }
    if (!full) {
      const why =
        b.length === 0
          ? "Type the password again to confirm it."
          : diff === -1
            ? `Doesn't match yet — ${plural(a.length - b.length, "character", "characters")} to go.`
            : diff >= a.length
              ? "Doesn't match — the confirmation is longer."
              : `Doesn't match yet — the difference starts at character ${diff + 1}.`;
      setConfirmTouched(true);
      setConfirmError(why);
      setSaid((s) => ({ n: s.n + 1, text: why }));
      nudge("confirm");
      confirmRef.current?.focus();
      return;
    }
    const password = pw;
    setPwError(null);
    setConfirmError(null);
    if (isReused) {
      setPhase("checking");
      let reused = false;
      try {
        reused = await isReused(password);
      } catch {
        reused = false;
      }
      if (!alive.current) return;
      if (reused) {
        setPhase("form");
        setPwError(reusedMessage);
        setSaid((s) => ({ n: s.n + 1, text: reusedMessage }));
        nudge("pw");
        pwRef.current?.focus();
        return;
      }
    }
    setPhase("saving");
    try {
      await onSubmit?.(password);
      if (!alive.current) return;
      setPhase("done");
      setSaid((s) => ({ n: s.n + 1, text: "Password updated." }));
    } catch (error) {
      if (!alive.current) return;
      const why =
        error instanceof Error && error.message
          ? error.message
          : "The password could not be updated. Try again.";
      setPhase("form");
      setPwError(why);
      setSaid((s) => ({ n: s.n + 1, text: why }));
      nudge("pw");
      pwRef.current?.focus();
    }
  };

  /* ------------------------------ render ------------------------------- */

  const confirmInvalid =
    confirmTouched && b.length > 0 && !full ? true : undefined;
  const progress =
    b.length === 0 ? null : full ? "match" : `${Math.min(b.length, a.length)}`;

  const input = (
    id: string,
    value: string,
    show: boolean,
    errorId: string,
    error: string | null,
    invalid: boolean | undefined,
    ref: React.RefObject<HTMLInputElement | null>,
    onChange: (next: string) => void,
    onBlur?: () => void,
    describedBy?: string,
  ) => (
    <input
      ref={ref}
      id={id}
      type={show ? "text" : "password"}
      value={value}
      autoComplete="new-password"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      maxLength={maxLength}
      disabled={disabled}
      aria-invalid={invalid || (error ? true : undefined)}
      aria-describedby={
        [error ? errorId : null, describedBy].filter(Boolean).join(" ") ||
        undefined
      }
      onChange={(event) => onChange(event.currentTarget.value)}
      onBlur={onBlur}
      className={cn(
        "w-full rounded-2 border bg-surface-1 pr-11 pl-3 font-mono tracking-[0.04em] text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
        g.field,
        g.text,
        error || invalid
          ? "border-danger/60"
          : "border-hairline-strong hover:border-[color-mix(in_oklab,var(--foreground)_28%,transparent)]",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
      )}
    />
  );

  const eye = (id: string, show: boolean, toggle: () => void) => (
    <button
      type="button"
      aria-label={show ? "Hide password" : "Show password"}
      aria-pressed={show}
      aria-controls={id}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        "absolute inset-y-1 right-1 flex w-9 items-center justify-center rounded-[5px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
    >
      {show ? (
        <EyeOff aria-hidden className="size-4" />
      ) : (
        <Eye aria-hidden className="size-4" />
      )}
    </button>
  );

  const ruleList = (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Requirements
      </p>
      <ul
        id={rulesId}
        role="list"
        tabIndex={0}
        aria-label={`Password requirements, ${metCount} of ${rules.length} met`}
        className={cn(
          "-mx-1.5 grid gap-1.5 rounded-2 px-1.5 py-1 @min-[24rem]:grid-cols-2 @min-[40rem]:grid-cols-1",
          FOCUS,
        )}
      >
        {rules.map((rule, i) => {
          const on = met[i] ?? false;
          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-2 py-0.5 text-[13px] transition-colors duration-200",
                on ? "text-foreground" : "text-ink-3",
              )}
            >
              <Tick on={on} motionSafe={motionSafe} />
              <span className="min-w-0">
                {rule.label}
                <span className="sr-only">{on ? ", met" : ", not met"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const header = (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-3 border border-hairline bg-surface-1 text-(--rm-accent)"
      >
        <KeyRound className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2
          id={titleId}
          className="text-[17px] leading-snug font-semibold tracking-[-0.01em]"
        >
          {title}
        </h2>
        <p className="text-[13px] text-ink-2">
          for{" "}
          <span className="font-medium break-words text-foreground">
            {/* A long address breaks before the @, never mid-word. */}
            {account.email.split("@")[0]}
            <wbr />
            {account.email.includes("@")
              ? `@${account.email.split("@").slice(1).join("@")}`
              : null}
          </span>
        </p>
      </div>
    </div>
  );

  const solid = cn(
    "inline-flex w-full items-center justify-center gap-2 rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-60",
    g.field,
    FOCUS,
  );
  const ghost = cn(
    "inline-flex h-8 items-center gap-1.5 self-start rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
    FOCUS,
  );

  const backLink = onCancel ? (
    <button
      type="button"
      onClick={onCancel}
      disabled={disabled}
      className={cn(ghost, "-ml-2")}
    >
      <ArrowLeft aria-hidden className="size-3.5" />
      Back to sign in
    </button>
  ) : null;

  const form = (
    <div
      className={cn(
        "grid gap-5 @min-[40rem]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] @min-[40rem]:grid-rows-[auto_1fr] @min-[40rem]:gap-x-10 @min-[40rem]:gap-y-6",
      )}
    >
      <div className="@min-[40rem]:col-start-1 @min-[40rem]:row-start-1">
        {header}
      </div>

      <form
        noValidate
        onSubmit={submit}
        aria-labelledby={titleId}
        className={cn(
          "flex flex-col @min-[40rem]:col-start-2 @min-[40rem]:row-span-2 @min-[40rem]:row-start-1",
          g.gap,
        )}
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={account.email}
          readOnly
          hidden
        />

        <div className="flex flex-col">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={pwId}
              className="flex h-5 items-center text-[13px] font-medium"
            >
              New password
            </label>
            <div ref={pwBox} className="relative">
              {input(
                pwId,
                pw,
                showPw,
                pwErrId,
                pwError,
                undefined,
                pwRef,
                (next) => {
                  report(next, confirm);
                  setPw(next);
                  setPwError(null);
                },
                undefined,
                rulesId,
              )}
              {eye(pwId, showPw, () => setShowPw((v) => !v))}
            </div>
            <FieldError id={pwErrId} text={pwError} motionSafe={motionSafe} />
          </div>

          <div className="py-1">
            <MatchRail
              top={a.length}
              bottom={b.length}
              diff={diff}
              lineStyle={lineStyle}
              geometry={g}
              sealed={sealed}
              motionSafe={motionSafe}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex h-5 items-center justify-between gap-2">
              <label htmlFor={confirmId} className="text-[13px] font-medium">
                Confirm password
              </label>
              <span className="relative flex h-5 items-center">
                <AnimatePresence initial={false} mode="popLayout">
                  {progress === "match" ? (
                    <motion.span
                      key="match"
                      className="inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium"
                      style={{
                        color: accent,
                        backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
                      }}
                      initial={{
                        opacity: 0,
                        scale: motionSafe ? 0.6 : 1,
                      }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }}
                      transition={
                        motionSafe
                          ? {
                              scale: {
                                ...springs.recoil,
                                delay: sealed
                                  ? cascade(a.length) * a.length * 0.6
                                  : 0,
                              },
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <Check aria-hidden className="size-3" />
                      Match
                    </motion.span>
                  ) : progress !== null ? (
                    <motion.span
                      key="count"
                      className={cn(
                        "font-mono text-[11px] tabular-nums",
                        diff >= 0 ? "text-warn" : "text-ink-3",
                      )}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{
                        opacity: 0,
                        transition: {
                          duration: durations.blink,
                          ease: easings.exit,
                        },
                      }}
                      transition={{ duration: durations.fast }}
                    >
                      {diff >= 0
                        ? `differs at ${diff + 1}`
                        : `${progress} / ${a.length}`}
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            </div>
            <div ref={confirmBox} className="relative">
              {input(
                confirmId,
                confirm,
                showConfirm,
                confirmErrId,
                confirmError,
                confirmInvalid,
                confirmRef,
                (next) => {
                  report(pw, next);
                  setConfirm(next);
                  setConfirmError(null);
                },
                () => {
                  if (b.length > 0) setConfirmTouched(true);
                },
              )}
              {eye(confirmId, showConfirm, () => setShowConfirm((v) => !v))}
            </div>
            <FieldError
              id={confirmErrId}
              text={confirmError}
              motionSafe={motionSafe}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            aria-disabled={busy || disabled || undefined}
            aria-busy={busy || undefined}
            className={solid}
          >
            {busy ? (
              <motion.span
                aria-hidden
                className="size-3.5 rounded-full border-2 border-current border-t-transparent"
                animate={motionSafe ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  motionSafe
                    ? { duration: 0.8, ease: "linear", repeat: Infinity }
                    : { duration: 0 }
                }
              />
            ) : null}
            {phase === "checking"
              ? "Checking"
              : phase === "saving"
                ? "Updating"
                : submitLabel}
          </button>
          <div className="@min-[40rem]:hidden">{backLink}</div>
        </div>
      </form>

      <div className="flex flex-col gap-5 @min-[40rem]:col-start-1 @min-[40rem]:row-start-2">
        {ruleList}
        <div className="hidden @min-[40rem]:block">{backLink}</div>
      </div>
    </div>
  );

  const bindContinue = React.useCallback((node: HTMLButtonElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  const done = (
    <motion.div
      key="done"
      className="flex flex-col items-center gap-4 py-6 text-center"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? { y: springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
    >
      <motion.span
        aria-hidden
        className="flex size-12 items-center justify-center rounded-full text-primary-foreground"
        style={{ backgroundColor: `oklch(from ${accent} 0.58 c h)` }}
        initial={{ scale: motionSafe ? 0.5 : 1 }}
        animate={{ scale: 1 }}
        transition={motionSafe ? springs.recoil : { duration: 0 }}
      >
        <Check className="size-6" />
      </motion.span>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">Password updated</h2>
        <p className="max-w-xs text-[13px] text-balance text-ink-2">
          You can sign in to Fernworks with your new password. Other devices
          will ask for it next time.
        </p>
      </div>
      {onContinue ? (
        <button
          ref={phase === "done" ? bindContinue : undefined}
          type="button"
          onClick={onContinue}
          className={cn(solid, "w-auto")}
        >
          Continue to sign in
        </button>
      ) : null}
    </motion.div>
  );

  const loading = (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p className="sr-only">Checking your reset link.</p>
      <div className="size-9 rounded-3 bg-surface-2" />
      <div className="h-5 w-48 rounded-full bg-surface-2 motion-safe:animate-pulse" />
      <div className={cn("w-full rounded-2 bg-surface-2", g.field)} />
      <div className="h-px w-full bg-hairline" />
      <div className={cn("w-full rounded-2 bg-surface-2", g.field)} />
    </div>
  );

  const expired = (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-warn"
      >
        <TriangleAlert className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">
          This reset link has expired
        </h2>
        <p className="max-w-xs text-[13px] text-balance text-ink-2">
          Links last 30 minutes. We can send a fresh one to {account.email}.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onResend ? (
          <button
            type="button"
            onClick={onResend}
            disabled={disabled}
            className={cn(solid, "w-auto")}
          >
            <Mail aria-hidden className="size-3.5" />
            Send a new link
          </button>
        ) : null}
        {backLink}
      </div>
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={shown === "form" || busy ? titleId : undefined}
      aria-label={shown === "form" || busy ? undefined : title}
      className={cn(
        "@container w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ ["--rm-accent" as string]: accent }}
    >
      <Measured glide={motionSafe}>
        <div className="p-5 @min-[24rem]:p-6 @min-[40rem]:p-8">
          {shown === "loading"
            ? loading
            : shown === "error"
              ? expired
              : shown === "done"
                ? done
                : form}
        </div>
      </Measured>

      <p role="status" className="sr-only">
        <span key={`r${said.n}`}>{said.text}</span> <span>{spoken}</span>
      </p>
    </div>
  );
}
