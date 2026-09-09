"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VeilSpan = {
  id: string;
  /** The sensitive text under the bar. */
  text: string;
  /** What kind of thing it is — "account", "email" — printed on the bar. */
  kind: string;
};

export type VeilSegment = string | VeilSpan;

export type VeilChange = {
  id: string;
  revealed: boolean;
  /** What lifted or dropped the veil. */
  by: "hover" | "press" | "timer";
};

export type RedactVeilProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer in order: plain strings and spans to veil. */
  segments: VeilSegment[];
  /** Milliseconds a lifted veil stays lifted after the pointer and focus leave; 0 or less never re-veils. @default 4000 */
  revealFor?: number;
  /** Controlled ids of the spans currently lifted. */
  revealed?: string[];
  /** Initial lifted ids for uncontrolled usage. @default [] */
  defaultRevealed?: string[];
  /** Fires with the new lifted set and the span that changed. */
  onRevealChange?: (ids: string[], change: VeilChange) => void;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

const NONE: string[] = [];

/** Drawn, not just coloured, so the veil reads in both themes and in print. */
const HATCH =
  "repeating-linear-gradient(135deg, currentColor 0 1.5px, transparent 1.5px 5px)";

/** Keeps callbacks out of effect dependencies so a re-render never restarts a timer. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type SpanProps = {
  span: VeilSpan;
  lifted: boolean;
  revealFor: number;
  visible: boolean;
  motionSafe: boolean;
  onChange: (next: boolean, by: VeilChange["by"]) => void;
};

/**
 * One veiled span. The bar is an opaque hatched layer whose clip rises from
 * the bottom edge on `glide` — a curtain lifting — and the re-veil timer is
 * a motion value draining linearly, held while the pointer or focus is on
 * the span and while the tab is hidden. Holding the remainder in a motion
 * value means pausing is free: stop, resume from what is left, no re-render.
 */
function Veiled({
  span,
  lifted,
  revealFor,
  visible,
  motionSafe,
  onChange,
}: SpanProps) {
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const onChangeRef = useLatest(onChange);
  const remaining = useMotionValue(1);

  React.useEffect(() => {
    if (!lifted) {
      remaining.set(1);
      return;
    }
    if (hovered || focused || !visible || revealFor <= 0) return;
    const controls = animate(remaining, 0, {
      duration: (revealFor / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => onChangeRef.current(false, "timer"),
    });
    return () => controls.stop();
  }, [lifted, hovered, focused, visible, revealFor, remaining, onChangeRef]);

  const name = lifted
    ? `${span.kind}: ${span.text}. Press to veil.`
    : `${span.kind}, veiled. Press to reveal.`;

  return (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={lifted}
      aria-label={name}
      onPointerEnter={(event) => {
        // A touch tap is a press, not a hover: lifting on its pointerenter
        // would make the click that follows drop the veil straight back.
        if (event.pointerType === "touch") return;
        setHovered(true);
        if (!lifted) onChange(true, "hover");
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={() => onChange(!lifted, "press")}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onChange(!lifted, "press");
        }
      }}
      className={cn(
        "relative mx-0.5 inline-block cursor-pointer rounded-1 px-0.5 font-mono text-[0.9em] text-foreground outline-none",
        lifted ? "" : "select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <span aria-hidden>{span.text}</span>
      <motion.span
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-1 bg-surface-2 text-ink-3"
        style={{ backgroundImage: HATCH }}
        initial={false}
        animate={
          motionSafe
            ? {
                clipPath: lifted ? "inset(0 0 100% 0)" : "inset(0 0 0 0)",
                opacity: 1,
              }
            : { clipPath: "inset(0 0 0 0)", opacity: lifted ? 0 : 1 }
        }
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.enter }
        }
      >
        <span className="absolute inset-0 grid place-items-center overflow-hidden px-1 font-sans text-[9px] leading-none font-medium tracking-[0.08em] whitespace-nowrap text-ink-2 uppercase">
          {span.kind}
        </span>
      </motion.span>
      <motion.span
        aria-hidden
        className={cn(
          "absolute inset-x-0 -bottom-px h-px origin-left bg-warn transition-opacity",
          lifted && revealFor > 0 ? "opacity-100" : "opacity-0",
        )}
        style={{ scaleX: remaining }}
      />
    </span>
  );
}

/**
 * An answer whose sensitive spans sit under hatched bars until they are
 * wanted. Hovering (mouse or pen) or pressing lifts a veil: the bar's clip
 * rises from its bottom edge on `glide` and the text beneath becomes
 * readable and selectable. Lifting starts a timer that re-veils — a hairline
 * under the text drains across `revealFor`, holding still while the pointer
 * or focus is on the span and while the tab is hidden — and pressing a lifted
 * span drops it at once. A count in the header says how many are still
 * veiled.
 *
 * Each span is an inline button with `aria-pressed`; while veiled its name
 * is the kind, not the secret, and the covered text is hidden from assistive
 * technology and unselectable, so the veil is a veil for every reader. Focus
 * holds a timer but never lifts a veil; Enter or Space does. A polite live
 * region reads each change once. Under reduced motion the bar swaps on an
 * opacity tween and the timer still drains, because the moment of
 * re-veiling is information.
 */
export function RedactVeil({
  ref,
  segments,
  revealFor = 4000,
  revealed: revealedProp,
  defaultRevealed = NONE,
  onRevealChange,
  label,
  className,
}: RedactVeilProps) {
  const motionSafe = useMotionSafe();
  const [ownRevealed, setOwnRevealed] = React.useState(defaultRevealed);
  const revealed = revealedProp ?? ownRevealed;
  const revealedRef = useLatest(revealed);
  const [announce, setAnnounce] = React.useState("");

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A timer's callback fires long after the render that scheduled it, so the
  // set it builds on comes from the ref rather than a stale closure.
  const change = (span: VeilSpan, next: boolean, by: VeilChange["by"]) => {
    const current = revealedRef.current;
    if (current.includes(span.id) === next) return;
    const ids = next
      ? [...current, span.id]
      : current.filter((id) => id !== span.id);
    if (revealedProp === undefined) setOwnRevealed(ids);
    setAnnounce(next ? `Revealed ${span.kind}` : `Veiled ${span.kind} again`);
    onRevealChange?.(ids, { id: span.id, revealed: next, by });
  };

  const spans = segments.filter(
    (segment): segment is VeilSpan => typeof segment !== "string",
  );
  const veiledCount = spans.filter(
    (span) => !revealed.includes(span.id),
  ).length;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums">
          {veiledCount} of {spans.length} veiled
        </span>
      </div>

      <p className="text-sm leading-7 text-foreground">
        {segments.map((segment, index) =>
          typeof segment === "string" ? (
            <React.Fragment key={`text-${index}`}>{segment}</React.Fragment>
          ) : (
            <Veiled
              key={`span-${segment.id}`}
              span={segment}
              lifted={revealed.includes(segment.id)}
              revealFor={revealFor}
              visible={visible}
              motionSafe={motionSafe}
              onChange={(next, by) => change(segment, next, by)}
            />
          ),
        )}
      </p>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
