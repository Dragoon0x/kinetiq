"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GateRequirement = {
  id: string;
  /** What the form still needs, in a few words: "Team chosen". */
  label: string;
  /** Whether the form already has it. */
  met: boolean;
};

export type GateButtonState = "idle" | "pending" | "success" | "error";

export type GateSegments = "arc" | "ring" | "pips";

export type GateHint = "list" | "next" | "off";

export type GateButtonSize = "sm" | "md" | "lg";

export type GateButtonProps = {
  /** What the form needs before it can be sent; one arc segment each. @default defaultRequirements */
  requirements?: GateRequirement[];
  /** Sends the form. Return a promise and the dots wait on it; the signal aborts on Escape. */
  onSubmit?: (signal: AbortSignal) => void | Promise<unknown>;
  /** Controlled action state. Every move goes through `onStateChange` and waits for this. */
  state?: GateButtonState;
  /** Each action state, from the press, the answer or the timer that caused it. */
  onStateChange?: (state: GateButtonState) => void;
  /** A press while locked, with what is still missing: scroll to it, focus it. */
  onLockedPress?: (missing: GateRequirement[]) => void;
  /** How the padlock wears the requirements: an arc open at the foot, a closed ring, or one pip each. @default "arc" */
  segments?: GateSegments;
  /** How strongly the button warms once it is ready, 0 to 1: an accent outline at 0, a solid accent fill at 1. @default 0.7 */
  warm?: number;
  /** What hovering or focusing the locked button shows: every requirement, only the next one, or nothing. @default "list" */
  hint?: GateHint;
  /** The list's heading. @default "Still needed" */
  hintTitle?: string;
  /** Which side of the button the hint opens on. @default "top" */
  hintSide?: "top" | "bottom";
  /** Which edge of the button the hint lines up with. @default "end" */
  hintAlign?: "start" | "center" | "end";
  /** The button's text. @default "Submit request" */
  label?: string;
  /** The text while sending. @default "Sending" */
  pendingLabel?: string;
  /** The text once sent. @default "Sent" */
  successLabel?: string;
  /** The text after a failed send; a press tries again. @default "Retry" */
  errorLabel?: string;
  /** The met segments and the warm fill. Any CSS colour. @default "var(--accent)" */
  accent?: string;
  /** How long "Sent" holds before the button rests, in ms. @default 1600 */
  successHold?: number;
  /** How long the error holds before the button rests, in ms. @default 2600 */
  errorHold?: number;
  /** 32, 40 or 48 px tall. @default "md" */
  size?: GateButtonSize;
  /** Play the segment clicks, the shackle's snap and the sent chime. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** A request-access form's three gates: one met, two to go. */
export const defaultRequirements: GateRequirement[] = [
  { id: "email", label: "Work email verified", met: true },
  { id: "team", label: "Team chosen", met: false },
  { id: "policy", label: "Data policy accepted", met: false },
];

type Geometry = { h: number; pad: number; icon: number; text: string };

const GEOMETRY: Record<GateButtonSize, Geometry> = {
  sm: { h: 32, pad: 10, icon: 22, text: "text-xs" },
  md: { h: 40, pad: 12, icon: 26, text: "text-sm" },
  lg: { h: 48, pad: 14, icon: 30, text: "text-base" },
};

/** The padlock's drawing box; everything below is in these units. */
const VB = 28;
const CX = 14;
const CY = 14;
const RING = 12.2;
/** A requirement met by the visitor sounds within this long of their input. */
const INPUT_BEAT_MS = 1200;
/** The sent chime answers a press within this long of it. */
const PRESS_BEAT_MS = 6000;
const PIN_MS = 2400;
const NBSP = "\u00a0";

const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof v === "object" &&
  v !== null &&
  typeof (v as { then?: unknown }).then === "function";

const polar = (deg: number, r = RING) => {
  const a = (deg * Math.PI) / 180;
  return [r3(CX + r * Math.cos(a)), r3(CY + r * Math.sin(a))] as const;
};

type Slot = { from: number; to: number; mid: number };

/** Where each requirement's segment sits, in screen degrees (clockwise). */
function slots(n: number, style: GateSegments): Slot[] {
  if (n <= 0) return [];
  const closed = style === "ring";
  const span = closed ? 360 : 270;
  const start = closed ? -90 : 135;
  const gap = n === 1 && !closed ? 0 : Math.min(14, 120 / n);
  const len = (span - gap * (closed ? n : n - 1)) / n;
  return Array.from({ length: n }, (_, i) => {
    const from = start + (closed ? gap / 2 : 0) + i * (len + gap);
    return { from, to: from + len, mid: from + len / 2 };
  });
}

const arcPath = ({ from, to }: Slot) => {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  return `M ${x1} ${y1} A ${RING} ${RING} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

type Api = {
  succeed: () => void;
  requestState: (next: GateButtonState) => void;
  transition: (was: GateButtonState, next: GateButtonState) => void;
};

/**
 * A submit button that shows its own readiness. A padlock at its left wears
 * a segmented arc, one segment per requirement; each one the form meets is
 * drawn along the arc on the flick spring with a click. When the last is met
 * the shackle pops open — a lift on recoil and a swing on snap — and the
 * button warms: an accent bloom grows out of the padlock across the face on
 * the glide spring, as strong as `warm` asks. Pressed, the padlock gives way
 * to three dots bouncing in a wave while `onSubmit` runs, then the dots
 * gather and a check draws, and the label rolls to "Sent".
 *
 * Locked, it is `aria-disabled` but still focusable: hovering or focusing it
 * lists what is missing (and its description says so for assistive
 * technology), and pressing it rattles the padlock, opens the list with the
 * first missing item flagged, and tells the host through `onLockedPress`.
 * Under reduced motion nothing lifts, swings, rattles or bounces: the
 * shackle swaps open, the warmth fades in, the dots pulse.
 */
export function GateButton({
  requirements = defaultRequirements,
  onSubmit,
  state,
  onStateChange,
  onLockedPress,
  segments = "arc",
  warm = 0.7,
  hint = "list",
  hintTitle = "Still needed",
  hintSide = "top",
  hintAlign = "end",
  label = "Submit request",
  pendingLabel = "Sending",
  successLabel = "Sent",
  errorLabel = "Retry",
  accent = "var(--accent)",
  successHold = 1600,
  errorHold = 2600,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: GateButtonProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const descId = `gate-${uid}-desc`;
  const maskId = `gate-${uid}-key`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const heat = clamp01(warm);
  const solid = heat >= 0.55;

  const total = requirements.length;
  const missing = requirements.filter((r) => !r.met);
  const metCount = total - missing.length;
  const ready = missing.length === 0;

  const [ownState, setOwnState] = React.useState<GateButtonState>("idle");
  const shownState = state ?? ownState;
  const busy = shownState === "pending" || shownState === "success";

  const [hovered, setHovered] = React.useState(false);
  const [focusVisible, setFocusVisible] = React.useState(false);
  const [pinned, setPinned] = React.useState(0);
  const [dismissed, setDismissed] = React.useState(false);
  const [flagged, setFlagged] = React.useState<{
    id: string;
    key: number;
  } | null>(null);

  // One sentence per change, frozen from the values it changed to.
  const [seen, setSeen] = React.useState({
    s: shownState,
    ready,
    met: metCount,
  });
  const [said, setSaid] = React.useState("");
  const missingList = missing.map((r) => r.label).join(", ");
  if (seen.s !== shownState || seen.ready !== ready || seen.met !== metCount) {
    const was = seen;
    setSeen({ s: shownState, ready, met: metCount });
    setSaid(
      was.s !== shownState
        ? shownState === "pending"
          ? `${pendingLabel}.`
          : shownState === "success"
            ? `${successLabel}.`
            : shownState === "error"
              ? `Not sent. Press ${errorLabel} to try again.`
              : was.s === "pending"
                ? "Cancelled."
                : ""
        : was.ready !== ready
          ? ready
            ? "Ready to submit."
            : `Locked. ${hintTitle}: ${missingList}.`
          : `${metCount} of ${total} requirements met.`,
    );
  }

  const bloom = useMotionValue(ready ? 1 : 0);
  const rattle = useMotionValue(0);
  const check = useMotionValue(0);
  const dotsOn = useMotionValue(0);
  const d0 = useMotionValue(0);
  const d1 = useMotionValue(0);
  const d2 = useMotionValue(0);
  const dx0 = useMotionValue(8.5);
  const dx1 = useMotionValue(CX);
  const dx2 = useMotionValue(19.5);
  const dotR = useMotionValue(2);
  const holdClock = useMotionValue(0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const api = React.useRef<Api | null>(null);
  const prevState = React.useRef(shownState);
  const prevMet = React.useRef(requirements.map((r) => r.met));
  const controller = React.useRef<AbortController | null>(null);
  const epoch = React.useRef(0);
  const pressedAt = React.useRef(-Infinity);
  const inputAt = React.useRef(-Infinity);
  const flagKey = React.useRef(0);
  const nudge = React.useRef(false);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + g.pad + g.icon / 2, null) : 0;
  };

  const requestState = (next: GateButtonState) => {
    if (state === undefined) setOwnState(next);
    onStateChange?.(next);
  };

  const succeed = () => requestState("success");

  const act = () => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    epoch.current += 1;
    const token = epoch.current;
    let result: unknown;
    try {
      result = onSubmit?.(ctrl.signal);
    } catch {
      requestState("error");
      return;
    }
    if (!isThenable(result)) {
      succeed();
      return;
    }
    requestState("pending");
    result.then(
      () => {
        if (epoch.current === token) api.current?.succeed();
      },
      () => {
        if (epoch.current === token) api.current?.requestState("error");
      },
    );
  };

  /** Refused: the padlock rattles and the list opens on what is missing. */
  const refuse = () => {
    audio.play("click", { pitch: 0.62, gain: 0.5, pan: pan() });
    if (motionSafe) {
      run(
        "rattle",
        animate(rattle, [0, -2.2, 2.2, -1.6, 1.4, -0.6, 0], {
          duration: 0.32,
          ease: "easeOut",
        }),
      );
    }
    const first = missing[0];
    if (first) {
      flagKey.current += 1;
      setFlagged({ id: first.id, key: flagKey.current });
    }
    setDismissed(false);
    setPinned((p) => p + 1);
    // The same words twice are not news to a screen reader: alternate an
    // invisible space so a second refusal is still spoken.
    nudge.current = !nudge.current;
    setSaid(
      `Locked. ${hintTitle}: ${missingList}.${nudge.current ? NBSP : ""}`,
    );
    onLockedPress?.(missing);
  };

  const press = () => {
    if (disabled || busy) return;
    pressedAt.current = performance.now();
    inputAt.current = pressedAt.current;
    if (!ready) {
      refuse();
      return;
    }
    audio.play("click", { pitch: 1.1, gain: 0.4, pan: pan() });
    act();
  };

  const cancel = () => {
    epoch.current += 1;
    controller.current?.abort();
    controller.current = null;
    requestState("idle");
  };

  const transition = (was: GateButtonState, next: GateButtonState) => {
    if (next === "pending") {
      dx0.jump(8.5);
      dx1.jump(CX);
      dx2.jump(19.5);
      dotR.jump(2);
      check.jump(0);
      run(
        "dotsOn",
        animate(dotsOn, 1, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    if (next === "success") {
      if (performance.now() - pressedAt.current < PRESS_BEAT_MS) {
        audio.play("chime", { pitch: 1, gain: 0.5, pan: pan() });
      }
      if (!motionSafe) {
        dotsOn.set(0);
        check.set(1);
        return;
      }
      // The dots run together, and the check is drawn out of where they met.
      const gather = { duration: 0.12, ease: easings.move };
      run("dx0", animate(dx0, CX, gather));
      run("dx2", animate(dx2, CX, gather));
      run("dotR", animate(dotR, 0, { ...gather, duration: 0.16 }));
      run("dotsOn", animate(dotsOn, 0, { duration: 0.16, ease: easings.exit }));
      run("check", animate(check, 1, { ...springs.flick, delay: 0.1 }));
      return;
    }
    if (was === "pending" || was === "success") {
      run(
        "dotsOn",
        animate(dotsOn, 0, { duration: durations.fast, ease: easings.exit }),
      );
      run(
        "check",
        animate(check, 0, { duration: durations.fast, ease: easings.exit }),
      );
    }
  };

  React.useEffect(() => {
    api.current = { succeed, requestState, transition };
  });

  React.useEffect(() => {
    const was = prevState.current;
    if (was === shownState) return;
    prevState.current = shownState;
    api.current?.transition(was, shownState);
  }, [shownState]);

  // The visitor's own input, so a requirement they just met can answer with
  // a sound, and one the host met on its own stays silent.
  React.useEffect(() => {
    if (!sound) return;
    const mark = () => {
      inputAt.current = performance.now();
    };
    document.addEventListener("pointerdown", mark, true);
    document.addEventListener("keydown", mark, true);
    return () => {
      document.removeEventListener("pointerdown", mark, true);
      document.removeEventListener("keydown", mark, true);
    };
  }, [sound]);

  // Requirements met and unmet: the clicks, the snap, the bloom.
  const metKey = requirements.map((r) => (r.met ? 1 : 0)).join("");
  React.useEffect(() => {
    const before = prevMet.current;
    const after = metKey.split("").map((c) => c === "1");
    prevMet.current = after;
    const wasReady = before.length > 0 ? before.every(Boolean) : true;
    const isReady = after.length > 0 ? after.every(Boolean) : true;
    const gained = after.filter((m, i) => m && !before[i]).length;
    const lost = after.filter((m, i) => !m && before[i]).length;
    const audibleNow = performance.now() - inputAt.current < INPUT_BEAT_MS;
    const count = after.filter(Boolean).length;
    if (audibleNow && isReady && !wasReady) {
      audio.play("snap", { pitch: 1, gain: 0.6, pan: pan() });
    } else if (audibleNow && gained > 0) {
      audio.play("click", {
        pitch: Number(semitones(count * 2).toFixed(3)),
        gain: 0.4,
        pan: pan(),
      });
    } else if (audibleNow && lost > 0) {
      audio.play("click", { pitch: 0.78, gain: 0.32, pan: pan() });
    }
    if (isReady === wasReady && before.length === after.length) return;
    if (!motionSafe) {
      run(
        "bloom",
        animate(bloom, isReady ? 1 : 0, {
          duration: durations.base,
          ease: isReady ? easings.enter : easings.exit,
        }),
      );
      return;
    }
    run(
      "bloom",
      animate(
        bloom,
        isReady ? 1 : 0,
        isReady
          ? springs.glide
          : { duration: durations.base, ease: easings.exit },
      ),
    );
    // `audio`, `bloom` and the pan read the latest values; the effect is the
    // requirements changing, nothing else.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metKey]);

  // Pending: the dots bounce in a wave; never on a hidden page.
  const bouncing = shownState === "pending";
  React.useEffect(() => {
    if (!bouncing) return;
    const dots = [d0, d1, d2];
    // Under reduced motion the dots stay put and only pulse together.
    const loops = motionSafe
      ? dots.map((dot, i) =>
          animate(dot, [0, -3.4, 0], {
            duration: 0.6,
            ease: easings.move,
            repeat: Infinity,
            repeatDelay: 0.12,
            delay: i * 0.12,
          }),
        )
      : [];
    const pulse = motionSafe
      ? null
      : animate(dotsOn, [1, 0.45, 1], {
          duration: 1.2,
          ease: easings.move,
          repeat: Infinity,
        });
    const all = pulse ? [...loops, pulse] : loops;
    const onVisibility = () => {
      for (const l of all) {
        if (document.hidden) l.pause();
        else l.play();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const l of all) l.stop();
      for (const dot of dots) dot.set(0);
    };
  }, [bouncing, motionSafe, d0, d1, d2, dotsOn]);

  // "Sent" and the error hold, then rest; both pause on a hidden page.
  const holding = shownState === "success" || shownState === "error";
  const holdMs = shownState === "success" ? successHold : errorHold;
  React.useEffect(() => {
    if (!holding) return;
    holdClock.jump(0);
    const controls = animate(holdClock, 1, {
      duration: Math.max(0, holdMs) / 1000,
      ease: "linear",
      onComplete: () => api.current?.requestState("idle"),
    });
    const onVisibility = () => {
      if (document.hidden) controls.pause();
      else controls.play();
    };
    if (document.hidden) controls.pause();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controls.stop();
    };
  }, [holding, holdMs, holdClock]);

  // A refused press keeps the list open a while, for hands that cannot hover.
  React.useEffect(() => {
    if (!pinned) return;
    const timer = window.setTimeout(() => setPinned(0), PIN_MS);
    return () => window.clearTimeout(timer);
  }, [pinned]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const controls of running.values()) controls.stop();
      running.clear();
      epoch.current += 1;
      controller.current?.abort();
    };
  }, []);

  const ring = React.useMemo(() => slots(total, segments), [total, segments]);
  const bloomClip = useTransform(
    bloom,
    (b) =>
      `circle(${Math.round(clamp01(b) * 1600) / 10}% at ${g.pad + g.icon / 2}px 50%)`,
  );

  const hintOpen =
    hint !== "off" &&
    !ready &&
    !disabled &&
    !dismissed &&
    (hovered || focusVisible || pinned > 0);
  const face =
    shownState === "pending"
      ? "dots"
      : shownState === "success"
        ? "check"
        : "lock";
  const text =
    shownState === "pending"
      ? pendingLabel
      : shownState === "success"
        ? successLabel
        : shownState === "error"
          ? errorLabel
          : label;
  // A failed send flushes the warm face toward danger instead of the accent.
  const warmFill = `color-mix(in oklab, ${shownState === "error" ? "var(--danger)" : "var(--gate-accent)"} ${Math.round(heat * 100)}%, var(--card))`;
  const lit = ready && solid;
  const nextMissing = missing[0];

  const lockTransition = motionSafe
    ? springs.flick
    : { duration: durations.fast };

  return (
    <span
      className={cn("relative inline-flex shrink-0 align-middle", className)}
      style={
        {
          "--gate-accent": accent,
          "--gate-warm": warmFill,
        } as React.CSSProperties
      }
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-disabled={!ready || undefined}
        aria-describedby={!ready ? descId : undefined}
        aria-busy={shownState === "pending" || undefined}
        onClick={press}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (shownState === "pending") {
            // Handled here, where focus is; the page must not also see it.
            event.preventDefault();
            cancel();
          } else if (hintOpen) {
            event.preventDefault();
            setDismissed(true);
            setPinned(0);
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse") return;
          setHovered(true);
          setDismissed(false);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          setHovered(false);
        }}
        onFocus={(event) => {
          setFocusVisible(event.currentTarget.matches(":focus-visible"));
          setDismissed(false);
        }}
        onBlur={() => {
          setFocusVisible(false);
          setPinned(0);
        }}
        className={cn(
          "relative inline-flex shrink-0 touch-manipulation items-center overflow-clip rounded-3 border font-medium whitespace-nowrap transition-[color,border-color,background-color,scale] duration-200 [contain:paint] outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "active:scale-[0.98] motion-reduce:active:scale-100",
          // Hover tints with the text's own colour, so it reads on any fill.
          "after:pointer-events-none after:absolute after:inset-0 after:bg-current after:opacity-0 after:transition-opacity",
          ready && !disabled && "hover:after:opacity-[0.07]",
          g.text,
          ready
            ? cn(
                "border-[color-mix(in_oklab,var(--gate-accent)_55%,transparent)]",
                lit ? "text-primary-foreground" : "text-foreground",
                shownState === "error" && !lit && "text-danger",
              )
            : "border-hairline-strong bg-surface-2 text-ink-2",
          ready && !lit && "bg-card",
          disabled
            ? "cursor-not-allowed opacity-50"
            : shownState === "pending"
              ? "cursor-progress"
              : ready
                ? "cursor-pointer"
                : "cursor-not-allowed",
        )}
        style={{
          height: g.h,
          paddingInline: g.pad,
          gap: Math.round(g.pad * 0.75),
        }}
      >
        {/* The warmth: a bloom out of the padlock, clipped as a circle. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-(--gate-warm)"
          style={{ clipPath: bloomClip }}
        />
        <svg
          aria-hidden
          width={g.icon}
          height={g.icon}
          viewBox={`0 0 ${VB} ${VB}`}
          className="relative shrink-0 overflow-visible"
          fill="none"
        >
          <defs>
            <mask id={maskId}>
              <rect width={VB} height={VB} fill="white" />
              <circle cx={CX} cy={16.6} r={1.15} fill="black" />
              <rect x={13.45} y={16.6} width={1.1} height={2.3} fill="black" />
            </mask>
          </defs>

          {/* One segment per requirement: a faint track, and the fill
              drawn along it as the requirement is met. */}
          {segments === "pips"
            ? requirements.map((r, i) => {
                const slot = ring[i];
                if (!slot) return null;
                const [x, y] = polar(slot.mid);
                return (
                  <g key={r.id}>
                    <circle
                      cx={x}
                      cy={y}
                      r={1.7}
                      className="fill-current opacity-25"
                    />
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={1.9}
                      className={
                        ready ? "fill-current" : "fill-(--gate-accent)"
                      }
                      style={{ originX: 0.5, originY: 0.5 }}
                      initial={false}
                      animate={{
                        scale: r.met ? 1 : 0,
                        opacity: r.met ? 1 : 0,
                      }}
                      transition={
                        motionSafe ? springs.snap : { duration: durations.fast }
                      }
                    />
                  </g>
                );
              })
            : requirements.map((r, i) => {
                const slot = ring[i];
                if (!slot) return null;
                const d = arcPath(slot);
                return (
                  <g key={r.id}>
                    <path
                      d={d}
                      strokeWidth={1.8}
                      className="stroke-current opacity-25"
                    />
                    <motion.path
                      d={d}
                      strokeWidth={1.8}
                      className={
                        ready ? "stroke-current" : "stroke-(--gate-accent)"
                      }
                      initial={false}
                      animate={{ pathLength: r.met ? 1 : 0 }}
                      transition={
                        motionSafe
                          ? springs.flick
                          : { duration: durations.fast }
                      }
                    />
                  </g>
                );
              })}

          <motion.g
            initial={false}
            animate={{
              opacity: face === "lock" ? 1 : 0,
              scale: face === "lock" || !motionSafe ? 1 : 0.7,
            }}
            transition={lockTransition}
            style={{ originX: 0.5, originY: 0.5 }}
          >
            <motion.g style={{ x: rattle }}>
              {/* The shackle's long leg runs down into the body, so it
                  can lift without leaving a gap. */}
              <motion.path
                d="M 11.5 16 V 10.5 A 2.5 2.5 0 0 1 16.5 10.5 V 13.5"
                strokeWidth={1.8}
                strokeLinecap="round"
                className="stroke-current"
                style={{ originX: 0, originY: 0.6875 }}
                initial={false}
                animate={
                  ready && motionSafe
                    ? { y: -2.5, rotate: -22 }
                    : ready
                      ? { y: -2.5, rotate: 0 }
                      : { y: 0, rotate: 0 }
                }
                transition={
                  motionSafe
                    ? {
                        y: ready ? springs.recoil : springs.snap,
                        rotate: springs.snap,
                      }
                    : { duration: 0 }
                }
              />
              <rect
                x={9.5}
                y={13.5}
                width={9}
                height={7.5}
                rx={1.8}
                className="fill-current"
                mask={`url(#${maskId})`}
              />
            </motion.g>
          </motion.g>

          <motion.g style={{ opacity: dotsOn }}>
            {[
              { x: dx0, y: d0 },
              { x: dx1, y: d1 },
              { x: dx2, y: d2 },
            ].map((dot, i) => (
              <motion.circle
                key={i}
                cx={dot.x}
                cy={CY}
                r={dotR}
                className="fill-current"
                style={{ y: dot.y }}
              />
            ))}
          </motion.g>

          <motion.path
            d="M 8.6 14.6 L 12.4 18.3 L 19.6 10.2"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-current"
            style={{ pathLength: check, opacity: check }}
          />
        </svg>

        {/* Every label stacked in one cell: the widest holds the width. */}
        <span className="relative grid overflow-clip [contain:paint]">
          {[label, pendingLabel, successLabel, errorLabel].map((t, i) => (
            <span
              key={i}
              aria-hidden
              className="invisible col-start-1 row-start-1"
            >
              {t}
            </span>
          ))}
          <AnimatePresence initial={false}>
            <motion.span
              key={text}
              className="col-start-1 row-start-1 text-left"
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{
                opacity: 1,
                y: 0,
                transition: motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.base } }
                  : { duration: durations.base },
              }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.step : 0,
                transition: exitFor(durations.base),
              }}
            >
              {text}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>

      <span id={descId} className="sr-only">
        {ready ? "" : `Locked. ${hintTitle}: ${missingList}.`}
      </span>

      <AnimatePresence>
        {hintOpen ? (
          <motion.div
            key="hint"
            aria-hidden
            className={cn(
              "pointer-events-none absolute z-30 w-max max-w-64 rounded-3 border border-hairline-strong bg-popover text-left shadow-raised",
              hintSide === "top" ? "bottom-full mb-2" : "top-full mt-2",
              hintAlign === "start"
                ? "left-0"
                : hintAlign === "end"
                  ? "right-0"
                  : "left-1/2",
              hint === "list" ? "p-3" : "px-2.5 py-1.5",
            )}
            style={{ x: hintAlign === "center" ? "-50%" : 0 }}
            initial={
              motionSafe
                ? {
                    opacity: 0,
                    y: hintSide === "top" ? distances.nudge : -distances.nudge,
                  }
                : { opacity: 0 }
            }
            animate={{
              opacity: 1,
              y: 0,
              transition: motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast },
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            {hint === "list" ? (
              <>
                <p className="mb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {hintTitle} · {metCount} of {total}
                </p>
                <ul className="flex flex-col gap-1">
                  {requirements.map((r) => (
                    <li
                      key={r.id}
                      className="relative flex h-6 items-center gap-2 rounded-2 px-1 text-xs"
                    >
                      {flagged?.id === r.id ? (
                        <motion.span
                          key={flagged.key}
                          className="absolute inset-0 rounded-2 bg-danger/12"
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 0 }}
                          transition={{ duration: 1.2, ease: easings.enter }}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative flex size-4 shrink-0 items-center justify-center rounded-full border",
                          r.met
                            ? "border-transparent bg-success/15 text-success"
                            : "border-hairline-strong",
                        )}
                      >
                        {r.met ? (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                          >
                            <path
                              d="M2 5.2 L4.1 7.2 L8 3"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "relative truncate",
                          r.met ? "text-ink-3 line-through" : "text-foreground",
                        )}
                      >
                        {r.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="truncate text-xs text-foreground">
                <span className="text-ink-3">Next: </span>
                {nextMissing?.label ?? ""}
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </span>
  );
}
