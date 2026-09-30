"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SplitConfirmStyle = "crack" | "slide";
export type SplitConfirmTone = "danger" | "neutral";
export type SplitConfirmCancelReason = "cancel" | "timeout" | "escape";

export type SplitConfirmProps = {
  /** The action, as the button reads before it is pressed. */
  label: string;
  /** The right half's answer. @default "Confirm" */
  confirmLabel?: string;
  /** The left half's answer. @default "Cancel" */
  cancelLabel?: string;
  /** What the latched button reads once the action is confirmed. @default "Done" */
  confirmedLabel?: string;
  /** Controlled: whether the action has been confirmed (the button is latched). */
  confirmed?: boolean;
  /** Initial latch when uncontrolled. @default false */
  defaultConfirmed?: boolean;
  /** Fires once, from the Confirm press. */
  onConfirm?: () => void;
  /** Fires when the question closes unanswered, with why. */
  onCancel?: (reason: SplitConfirmCancelReason) => void;
  /** Seconds the halves stay apart before they rejoin on their own. @default 4 */
  timeout?: number;
  /** A zigzag crack that snaps apart, or a clean seam that glides. @default "crack" */
  split?: SplitConfirmStyle;
  /** Destructive red, or the primary accent. @default "danger" */
  tone?: SplitConfirmTone;
  /** Play the crack, rejoin and confirm sounds. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Phase = "whole" | "cracked" | "open" | "closing";

/** Height of the control (h-10) and the gap the halves open to (gap-3). */
const H = 40;
const GAP = 12;
/** A press this soon after the split is a double press, not an answer. */
const ARM_MS = 320;
/** The crack overlay's width; the zigzag stays inside it. */
const LANE = 16;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A zigzag down the lane, seeded by the label so it breaks the same way twice. */
function crackPath(seed: number, jagged: boolean): string {
  const mid = LANE / 2;
  if (!jagged) return `M${mid} 0L${mid} ${H}`;
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const points: string[] = [];
  for (let k = 0; k <= 6; k += 1) {
    const edge = k === 0 || k === 6;
    const x = edge ? mid : mid + (k % 2 ? 1 : -1) * (1.5 + next() * 2);
    points.push(`${r2(x)} ${r2((H * k) / 6)}`);
  }
  return `M${points.join("L")}`;
}

const seconds = (n: number) => {
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${text} ${n === 1 ? "second" : "seconds"}`;
};

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
    >
      <path
        d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4 4.25l.6 8.4a1 1 0 0 0 1 .93h4.8a1 1 0 0 0 1-.93l.6-8.4M6.75 7v4M9.25 7v4"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
    >
      <path
        d="M3.5 8.5 6.5 11.25 12.5 4.75"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TONE = {
  danger: {
    whole: "bg-danger/10 text-danger ring-danger/40 hover:bg-danger/15",
    confirm:
      "bg-destructive text-destructive-foreground ring-transparent hover:bg-destructive/90",
    line: "text-danger",
  },
  neutral: {
    whole: "bg-surface-2 text-foreground ring-hairline-strong hover:ring-ink-3",
    confirm:
      "bg-primary text-primary-foreground ring-transparent hover:bg-primary/90",
    line: "text-ink-2",
  },
} as const;

const CANCEL =
  "bg-surface-2 text-foreground ring-hairline-strong hover:ring-ink-3";
const LATCHED = "bg-surface-2 text-ink-2 ring-hairline";
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function Half({
  side,
  width,
  radius,
  pieceWidth,
  pieceOpacity,
  answerOpacity,
  answerY,
  piece,
  answer,
  className,
  live,
  buttonRef,
  onClick,
  onKeyDown,
}: {
  side: "left" | "right";
  width: MotionValue<string>;
  radius: MotionValue<string>;
  pieceWidth: MotionValue<string>;
  pieceOpacity: MotionValue<number>;
  answerOpacity: MotionValue<number>;
  answerY: MotionValue<number>;
  piece: React.ReactNode;
  answer: React.ReactNode;
  className: string;
  live: boolean;
  buttonRef: React.Ref<HTMLButtonElement>;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <motion.button
      ref={buttonRef}
      type="button"
      tabIndex={live ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      style={{ width, borderRadius: radius }}
      className={cn(
        "absolute inset-y-0 cursor-pointer overflow-clip text-sm font-medium ring-1 select-none ring-inset",
        "transition-[color,background-color,box-shadow] duration-200",
        FOCUS,
        side === "left" ? "left-0" : "right-0",
        className,
      )}
    >
      {/* The old label, cut by the crack: it stays where it was while the
          half's edge retracts across it, then fades as the answer arrives. */}
      <motion.span
        aria-hidden
        className={cn(
          "absolute inset-y-0 flex items-center justify-center gap-2 whitespace-nowrap",
          side === "left" ? "left-0" : "right-0",
        )}
        style={{ width: pieceWidth, opacity: pieceOpacity }}
      >
        {piece}
      </motion.span>
      <motion.span
        className="absolute inset-0 flex items-center justify-center gap-1.5 px-4 whitespace-nowrap"
        style={{ opacity: answerOpacity, y: answerY }}
      >
        {answer}
      </motion.span>
    </motion.button>
  );
}

/**
 * A destructive button that asks by coming apart. Pressed, a crack runs down
 * its middle and the halves part — their inner edges retract so a gap opens
 * without the control growing — and each half becomes an answer: Cancel on
 * the left, Confirm on the right. The crack stays in the gap as a hairline
 * countdown that heals from both ends; when it is gone the halves slide back
 * together. Confirm fires once and latches: the halves close into a muted
 * button that reads what happened, with no bounce and no celebration.
 *
 * Every half is a real button. Focus moves to Confirm as it arrives, the
 * arrow keys cross between the halves, Escape closes the question, and a
 * double press or a held Enter cannot confirm by accident — Confirm arms a
 * moment after the split. Under reduced motion the gap simply appears and
 * the answers cross-fade, and the countdown still shortens, because the time
 * left is information.
 */
export function SplitConfirm({
  label,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmedLabel = "Done",
  confirmed,
  defaultConfirmed = false,
  onConfirm,
  onCancel,
  timeout = 4,
  split = "crack",
  tone = "danger",
  sound = false,
  disabled = false,
  className,
}: SplitConfirmProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const clipId = `split-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const controlled = confirmed !== undefined;
  const [own, setOwn] = React.useState(defaultConfirmed);
  const latched = confirmed ?? own;
  const [phase, setPhase] = React.useState<Phase>("whole");
  const [closingAs, setClosingAs] = React.useState<"cancel" | "confirm">(
    "cancel",
  );
  const [said, setSaid] = React.useState("");
  const palette = TONE[tone] ?? TONE.danger;
  const jagged = split !== "slide";
  const limit = Math.min(30, Math.max(1, timeout));

  const gap = useMotionValue(0);
  const draw = useMotionValue(0);
  const remaining = useMotionValue(1);
  const swap = useMotionValue(0);

  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  const wholeRef = React.useRef<HTMLButtonElement | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const confirmRef = React.useRef<HTMLButtonElement | null>(null);
  const phaseRef = React.useRef<Phase>("whole");
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const countdown = React.useRef<AnimationPlaybackControls | null>(null);
  const subs = React.useRef<(() => void)[]>([]);
  const openedAt = React.useRef(0);
  const focusNext = React.useRef<"whole" | "confirm" | null>(null);
  // The confirm latch: once fired, nothing fires again until the host says
  // the action is undone (or refuses it).
  const fired = React.useRef(false);
  const latchedNow = React.useRef(latched);

  React.useEffect(() => {
    latchedNow.current = latched;
    if (!latched && phaseRef.current === "whole") fired.current = false;
  }, [latched]);

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const halt = React.useCallback(() => {
    for (const run of runs.current) run.stop();
    runs.current = [];
    for (const off of subs.current) off();
    subs.current = [];
  }, []);

  const stopCountdown = () => {
    countdown.current?.stop();
    countdown.current = null;
  };

  React.useEffect(
    () => () => {
      halt();
      countdown.current?.stop();
    },
    [halt],
  );

  // A hidden page stops the clock; the question waits for the visitor.
  React.useEffect(() => {
    if (phase !== "open") return;
    const onVisibility = () => {
      if (document.hidden) countdown.current?.pause();
      else countdown.current?.play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase]);

  // Focus follows the layer that is live, once it is live: Confirm when the
  // halves open, the whole button when they have closed (only if focus was
  // inside — a timeout never pulls focus from elsewhere on the page).
  React.useLayoutEffect(() => {
    if (focusNext.current === "confirm" && phase === "open") {
      focusNext.current = null;
      confirmRef.current?.focus();
    } else if (focusNext.current === "whole" && phase === "whole") {
      focusNext.current = null;
      wholeRef.current?.focus();
    }
  }, [phase]);

  const panAt = (el: Element | null) => {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return panFrom(rect.left + rect.width / 2, null);
  };

  const close = (reason: SplitConfirmCancelReason | "confirm") => {
    const now = phaseRef.current;
    if (now !== "open" && now !== "cracked") return;
    halt();
    stopCountdown();
    const inside =
      typeof document !== "undefined" &&
      !!rootRef.current?.contains(document.activeElement);
    if (inside || reason !== "timeout") focusNext.current = "whole";
    setClosingAs(reason === "confirm" ? "confirm" : "cancel");
    go("closing");

    const touch = () => {
      for (const run of runs.current) run.stop();
      runs.current = [];
      gap.set(0);
      swap.set(0);
      draw.set(0);
      remaining.set(1);
      if (reason !== "confirm") {
        audio.play("clack", { gain: 0.55, pan: panAt(rootRef.current) });
      }
      if (!latchedNow.current) fired.current = false;
      go("whole");
    };

    const heal = { duration: durations.fast, ease: easings.exit };
    runs.current.push(
      animate(remaining, 0, heal),
      animate(swap, 0, { duration: durations.fast, ease: easings.enter }),
    );
    if (!motionSafe || gap.get() <= 1) {
      touch();
      return;
    }
    // The halves are thrown shut and meet at speed: a spring that would
    // overshoot is stopped by the other half, so contact is the first frame
    // the gap reaches zero — and the clack is read off the gap itself rather
    // than guessed from a duration. A slow settle would leave a hairline
    // seam hanging open for a beat.
    const off = gap.on("change", (v) => {
      if (v > 1) return;
      off();
      touch();
    });
    subs.current.push(off);
    runs.current.push(
      animate(gap, 0, reason === "confirm" ? springs.flick : springs.snap),
    );
  };

  const open = () => {
    go("open");
    draw.set(1);
    remaining.set(1);
    if (motionSafe) {
      runs.current.push(
        animate(gap, GAP, jagged ? springs.snap : springs.glide),
        animate(swap, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay: 0.04,
        }),
      );
    } else {
      gap.set(GAP);
      runs.current.push(
        animate(swap, 1, { duration: durations.base, ease: easings.enter }),
      );
    }
    countdown.current = animate(remaining, 0, {
      duration: limit,
      ease: "linear",
      onComplete: () => {
        setSaid("Timed out");
        onCancel?.("timeout");
        close("timeout");
      },
    });
    if (typeof document !== "undefined" && document.hidden) {
      countdown.current.pause();
    }
  };

  const pressWhole = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || latched || phaseRef.current !== "whole") return;
    halt();
    openedAt.current = event.timeStamp;
    focusNext.current = "confirm";
    setSaid(
      `${label}: ${confirmLabel} or ${cancelLabel}, closes in ${seconds(limit)}`,
    );
    // The tink of the break, on the press itself.
    audio.play("tick", {
      pitch: jagged ? 1.35 : 1.1,
      gain: jagged ? 0.55 : 0.35,
      pan: panAt(rootRef.current),
    });
    if (!motionSafe || !jagged) {
      open();
      return;
    }
    go("cracked");
    draw.set(0);
    runs.current.push(
      animate(draw, 1, {
        duration: 0.09,
        ease: easings.enter,
        onComplete: open,
      }),
    );
  };

  const pressConfirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (phaseRef.current !== "open" || fired.current) return;
    if (event.timeStamp - openedAt.current < ARM_MS) return;
    fired.current = true;
    audio.play("thock", { gain: 0.7, pan: panAt(confirmRef.current) });
    setSaid("");
    if (!controlled) setOwn(true);
    onConfirm?.();
    close("confirm");
  };

  const pressCancel = () => {
    if (phaseRef.current !== "open") return;
    setSaid("Cancelled");
    onCancel?.("cancel");
    close("cancel");
  };

  const onHalfKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (phaseRef.current !== "open") return;
      setSaid("Cancelled");
      onCancel?.("escape");
      close("escape");
      return;
    }
    // A held key repeats its click; an answer is one deliberate press.
    if (event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "Home") {
      event.preventDefault();
      cancelRef.current?.focus();
    } else if (event.key === "ArrowRight" || event.key === "End") {
      event.preventDefault();
      confirmRef.current?.focus();
    }
  };

  const halfWidth = useTransform(
    gap,
    (g) => `calc(50% - ${r2(Math.max(0, g) / 2)}px)`,
  );
  const pieceWidth = useTransform(
    gap,
    (g) => `calc(200% + ${r2(Math.max(0, g))}px)`,
  );
  const inner = useTransform(gap, (g) =>
    r2(Math.min(H / 2, Math.max(0, g) * 1.8)),
  );
  const leftRadius = useTransform(
    inner,
    (r) => `${H / 2}px ${r}px ${r}px ${H / 2}px`,
  );
  const rightRadius = useTransform(
    inner,
    (r) => `${r}px ${H / 2}px ${H / 2}px ${r}px`,
  );
  const pieceOpacity = useTransform(swap, (s) => r2(1 - clamp01(s * 1.6)));
  const answerOpacity = useTransform(swap, (s) => r2(clamp01(s * 1.4 - 0.2)));
  const answerY = useTransform(swap, (s) =>
    motionSafe ? r2((1 - clamp01(s)) * distances.nudge) : 0,
  );
  const clipY = useTransform(remaining, (r) => r2((H * (1 - r)) / 2));
  const clipHeight = useTransform(
    [draw, remaining] as MotionValue<number>[],
    (values) => {
      const [d = 0, r = 0] = values as number[];
      const top = (H * (1 - r)) / 2;
      const bottom = Math.min(H * d, H - top);
      return r2(Math.max(0, bottom - top));
    },
  );
  const lineOpacity = useTransform(gap, (g) =>
    jagged ? 1 : r2(clamp01((g / GAP) * 2)),
  );

  const crack = React.useMemo(
    () => crackPath(hash(label), jagged),
    [label, jagged],
  );

  const split_ = phase !== "whole";
  // The whole button stays the live layer through the crack, so focus never
  // drops to the page: it hands over to Confirm in the commit that opens.
  const wholeLive = phase === "whole" || phase === "cracked";
  const halvesLive = !wholeLive;
  const face = latched ? LATCHED : palette.whole;
  const halfStyle = (answer: string) =>
    phase === "open"
      ? answer
      : phase === "closing" && closingAs === "confirm" && latched
        ? LATCHED
        : palette.whole;

  const content = latched ? (
    <>
      <CheckIcon />
      <span>{confirmedLabel}</span>
    </>
  ) : (
    <>
      {tone === "danger" ? <TrashIcon /> : null}
      <span>{label}</span>
    </>
  );
  const confirmContent = (
    <>
      {tone === "danger" ? <TrashIcon /> : <CheckIcon />}
      <span>{confirmLabel}</span>
    </>
  );

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-grid h-10 align-middle", className)}
    >
      {/* Sizes the box for the widest state, so the halves always fit and
          the control never grows when it splits. */}
      <span
        aria-hidden
        className="invisible grid grid-cols-2 gap-3 text-sm font-medium whitespace-nowrap [grid-area:1/1]"
      >
        <span className="flex h-10 items-center justify-center px-4">
          {cancelLabel}
        </span>
        <span className="flex h-10 items-center justify-center gap-1.5 px-4">
          {confirmContent}
        </span>
      </span>

      <button
        ref={wholeRef}
        type="button"
        disabled={disabled}
        aria-disabled={latched || undefined}
        inert={!wholeLive}
        aria-hidden={!wholeLive || undefined}
        onClick={pressWhole}
        style={{ opacity: split_ ? 0 : 1 }}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium whitespace-nowrap ring-1 select-none [grid-area:1/1] ring-inset",
          "transition-[color,background-color,box-shadow] duration-200",
          FOCUS,
          latched ? "cursor-default" : "cursor-pointer",
          phase === "cracked" && "pointer-events-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          face,
        )}
      >
        {content}
      </button>

      <span
        inert={!halvesLive}
        aria-hidden={!halvesLive || undefined}
        className="pointer-events-none absolute inset-0 [&>button]:pointer-events-auto"
        style={{ opacity: split_ ? 1 : 0 }}
      >
        <Half
          side="left"
          buttonRef={cancelRef}
          live={halvesLive}
          width={halfWidth}
          radius={leftRadius}
          pieceWidth={pieceWidth}
          pieceOpacity={pieceOpacity}
          answerOpacity={answerOpacity}
          answerY={answerY}
          piece={split_ ? content : null}
          answer={<span>{cancelLabel}</span>}
          className={halfStyle(CANCEL)}
          onClick={pressCancel}
          onKeyDown={onHalfKey}
        />
        <Half
          side="right"
          buttonRef={confirmRef}
          live={halvesLive}
          width={halfWidth}
          radius={rightRadius}
          pieceWidth={pieceWidth}
          pieceOpacity={pieceOpacity}
          answerOpacity={answerOpacity}
          answerY={answerY}
          piece={split_ ? content : null}
          answer={confirmContent}
          className={halfStyle(palette.confirm)}
          onClick={pressConfirm}
          onKeyDown={onHalfKey}
        />
        <motion.svg
          aria-hidden
          width={LANE}
          height={H}
          viewBox={`0 0 ${LANE} ${H}`}
          className={cn(
            "pointer-events-none absolute top-0 left-1/2 -ml-2 overflow-visible",
            palette.line,
          )}
          style={{ opacity: lineOpacity }}
          fill="none"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.rect
                x={-2}
                y={clipY}
                width={LANE + 4}
                height={clipHeight}
              />
            </clipPath>
          </defs>
          <path
            d={crack}
            clipPath={`url(#${clipId})`}
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {latched ? confirmedLabel : said}
      </span>
    </span>
  );
}
