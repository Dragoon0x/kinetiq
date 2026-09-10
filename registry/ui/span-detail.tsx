"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

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

export type SpanAttribute = {
  key: string;
  value: string;
  /** Masked until the viewer presses Reveal. */
  secret?: boolean;
};

export type SpanEvent = {
  id: string;
  label: string;
  /** Milliseconds from the start of the trace window, on the same axis as the span. */
  atMs: number;
};

export type SpanRecord = {
  id: string;
  service: string;
  operation: string;
  /** Milliseconds from the start of the trace window. */
  startMs: number;
  durationMs: number;
  status: "ok" | "error";
  /** One short line naming the failure; printed when status is "error". */
  error?: string;
  attributes: SpanAttribute[];
  events: SpanEvent[];
};

export type SpanDetailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The one span this card opens. */
  span: SpanRecord;
  /** The trace window the track represents, in milliseconds. */
  windowMs: number;
  /** Controlled unfolded state of the record. */
  open?: boolean;
  /** Initial unfolded state for uncontrolled usage. */
  defaultOpen?: boolean;
  /** Fires from the press that folded or unfolded the record. */
  onOpenChange?: (open: boolean) => void;
  /** Fires when a masked attribute is revealed by its own control. */
  onReveal?: (key: string) => void;
  /** Fires when an event row is activated. */
  onEventSelect?: (id: string) => void;
  /** Renders every duration in the card, so a host changes units in one place. */
  formatMs?: (ms: number) => string;
  /** Names the card for assistive technology. @default "Span" */
  label?: string;
  className?: string;
};

/** Rounded before it is printed: a raw float has no place in a readout. */
const formatDuration = (ms: number): string =>
  ms >= 1000
    ? `${(Math.round(ms) / 1000).toFixed(2)} s`
    : `${Math.round(ms)} ms`;

/** Percentages reach `left` and `width`, so they are rounded to three places. */
const pct = (value: number): number =>
  Number((Math.min(1, Math.max(0, value)) * 100).toFixed(3));

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** Log copy is written lowercase; a spoken sentence still opens with a capital. */
const sentence = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

const MASK = "••••••••";

/**
 * One span, in full. The head names the service, the operation and the
 * duration; under it a track draws the trace window with this span's extent
 * laid on it at its own offset, arriving by scaling from its left origin on
 * `glide` — a quantity settling, so no overshoot — with the event ticks drawing
 * afterwards on `flick` in a `cascade()`.
 *
 * Pressing the head unfolds the record. A ResizeObserver measures the body and
 * the wrapper glides to that height while the attribute rows and the event list
 * arrive from `distances.nudge`, so nothing reserves room for a state it is not
 * in. Attributes marked secret print as dots until their own Reveal control is
 * pressed. An errored span stamps on `snap` at scale 1.06 → 1: one crisp
 * arrival, never `recoil`, because a failure does not get to bounce twice.
 *
 * Every millisecond comes from props — the card never reads a clock. The event
 * list is an `<ol role="list">` under a roving tabindex, and under reduced
 * motion the bar still fills and the ticks still appear, on tweens, because a
 * duration is information rather than flourish.
 */
export function SpanDetail({
  ref,
  span,
  windowMs,
  open,
  defaultOpen = false,
  onOpenChange,
  onReveal,
  onEventSelect,
  formatMs = formatDuration,
  label = "Span",
  className,
}: SpanDetailProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const bodyId = `${baseId}-body`;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;

  const [revealed, setRevealed] = React.useState<string[]>([]);
  const [activeEvent, setActiveEvent] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  // A different span is a different record: what was revealed and where the
  // caret sat belong to the span that is leaving, not the one arriving. The
  // reset happens in render off an anchor rather than in an effect, so the
  // committed pass never shows one span's secrets against another's rows.
  const [anchor, setAnchor] = React.useState(span.id);
  if (anchor !== span.id) {
    setAnchor(span.id);
    setRevealed([]);
    setActiveEvent(0);
  }

  const win = windowMs > 0 ? windowMs : 1;
  const startMs = Math.max(0, span.startMs);
  const endMs = Math.min(win, startMs + Math.max(0, span.durationMs));
  const leftPct = pct(startMs / win);
  const widthPct = pct(Math.max(0, endMs - startMs) / win);
  const failed = span.status === "error";

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [bodyHeight, setBodyHeight] = React.useState(0);

  React.useEffect(() => {
    const node = bodyRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setBodyHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const attributeCount = span.attributes.length;
  const eventCount = span.events.length;
  const eventStagger = cascade(Math.max(eventCount, attributeCount));

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setUncontrolledOpen(next);
    // The sentence is frozen here, from the press that caused the change —
    // not from an effect watching a value a controlled host may never move.
    setAnnouncement(
      next
        ? `Span record open, ${plural(attributeCount, "attribute", "attributes")} and ${plural(eventCount, "event", "events")}.`
        : "Span record folded.",
    );
    onOpenChange?.(next);
  };

  const toggleSecret = (key: string) => {
    const next = revealed.includes(key)
      ? revealed.filter((entry) => entry !== key)
      : [...revealed, key];
    setRevealed(next);
    setAnnouncement(
      next.includes(key)
        ? `Attribute ${key} revealed.`
        : `Attribute ${key} masked again.`,
    );
    if (next.includes(key)) onReveal?.(key);
  };

  const focusEvent = (index: number) => {
    const clamped = Math.min(eventCount - 1, Math.max(0, index));
    const target = span.events[clamped];
    if (!target) return;
    setActiveEvent(clamped);
    document.getElementById(`${baseId}-event-${target.id}`)?.focus();
  };

  const handleEventKeys = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusEvent(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusEvent(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusEvent(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusEvent(eventCount - 1);
    }
  };

  const headLabel = `${span.service} ${span.operation}, ${failed ? "error" : "ok"}, ${formatMs(span.durationMs)}.`;
  const trackLabel = `Runs from ${formatMs(startMs)} to ${formatMs(endMs)} in a ${formatMs(win)} window, ${plural(eventCount, "event", "events")}.`;
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const rowTransition = (index: number) =>
    motionSafe
      ? { ...springs.glide, delay: isOpen ? index * eventStagger : 0 }
      : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "w-full overflow-clip rounded-3 border border-hairline bg-surface-1 [contain:paint]",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        aria-label={headLabel}
        className={cn(
          "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="flex w-full items-center gap-2">
          <motion.span
            aria-hidden
            className="flex size-3 shrink-0 items-center justify-center text-ink-3"
            animate={{ rotate: isOpen ? 90 : 0 }}
            initial={false}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <svg
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
            >
              <path d="m4.5 2.5 4 3.5-4 3.5" />
            </svg>
          </motion.span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-ink">
            {span.service}
          </span>
          {/* Keyed by span and status so a new record re-stamps rather than
              inheriting the last one's arrival. */}
          <motion.span
            key={`${span.id}-${span.status}`}
            className={cn(
              "shrink-0 rounded-1 px-1.5 py-px font-mono text-[10px] font-semibold tracking-[0.08em] uppercase",
              failed
                ? "bg-destructive text-destructive-foreground"
                : "bg-surface-2 text-success",
            )}
            initial={
              motionSafe
                ? { scale: 1.06, opacity: 0 }
                : { scale: 1, opacity: 0 }
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={motionSafe ? springs.snap : fade}
          >
            {failed ? "error" : "ok"}
          </motion.span>
          <span className="shrink-0 font-mono text-[11px] text-ink tabular-nums">
            {formatMs(span.durationMs)}
          </span>
        </span>
        <span className="w-full truncate pl-5 font-mono text-[11px] text-ink-3">
          {span.operation}
        </span>
      </button>

      <div className="flex flex-col gap-1.5 px-3 pb-3">
        <div
          role="img"
          aria-label={trackLabel}
          className="relative h-1.5 w-full rounded-full bg-hairline-strong"
        >
          <motion.span
            aria-hidden
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            className={cn(
              "absolute inset-y-0 origin-left rounded-full",
              failed ? "bg-danger" : "bg-cobalt-bright",
            )}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.enter }
            }
          />
          {span.events.map((event, index) => {
            const at = pct(Math.max(0, event.atMs) / win);
            const current = index === activeEvent;
            return (
              <motion.span
                key={event.id}
                aria-hidden
                style={{ left: `${at}%` }}
                className={cn(
                  "absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors",
                  current ? "bg-ink" : "bg-ink-3",
                )}
                initial={{ opacity: 0, scaleY: motionSafe ? 0.4 : 1 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.flick, delay: 0.16 + index * eventStagger }
                    : { duration: durations.base, ease: easings.enter }
                }
              />
            );
          })}
        </div>
        <div
          aria-hidden
          className="flex items-center justify-between font-mono text-[10px] text-ink-3 tabular-nums"
        >
          <span>{formatMs(startMs)}</span>
          <span>{formatMs(win)}</span>
        </div>

        <AnimatePresence initial={false}>
          {failed && span.error ? (
            <motion.p
              key={`${span.id}-error`}
              className="rounded-2 border border-danger/25 bg-danger/10 px-2 py-1.5 font-mono text-[11px] leading-snug text-danger"
              initial={
                motionSafe
                  ? { opacity: 0, y: -distances.nudge }
                  : { opacity: 0, y: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={motionSafe ? springs.snap : fade}
            >
              {span.error}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <motion.div
        id={bodyId}
        aria-hidden={!isOpen}
        className="overflow-clip [contain:paint]"
        initial={false}
        animate={{ height: isOpen ? bodyHeight : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.enter }
        }
      >
        <div
          ref={bodyRef}
          className="flex flex-col gap-3 border-t border-hairline px-3 py-3"
        >
          <dl className="flex flex-col gap-1">
            {span.attributes.map((attribute, index) => {
              const shown =
                !attribute.secret || revealed.includes(attribute.key);
              return (
                <motion.div
                  key={attribute.key}
                  className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-x-2"
                  initial={false}
                  animate={{
                    opacity: isOpen ? 1 : 0,
                    y: isOpen || !motionSafe ? 0 : distances.nudge,
                  }}
                  transition={rowTransition(index)}
                >
                  <dt className="truncate font-mono text-[11px] text-ink-3">
                    {attribute.key}
                  </dt>
                  <dd className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-mono text-[11px] text-ink",
                        !shown && "tracking-[0.12em] text-ink-3",
                      )}
                      title={shown ? attribute.value : undefined}
                    >
                      {shown ? attribute.value : MASK}
                    </span>
                    {attribute.secret ? (
                      <button
                        type="button"
                        tabIndex={isOpen ? 0 : -1}
                        onClick={() => toggleSecret(attribute.key)}
                        aria-label={
                          shown
                            ? `Mask ${attribute.key}.`
                            : `Reveal ${attribute.key}.`
                        }
                        className={cn(
                          "shrink-0 rounded-1 border border-hairline-strong px-1.5 py-px font-mono text-[10px] text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        )}
                      >
                        {shown ? "Mask" : "Reveal"}
                      </button>
                    ) : null}
                  </dd>
                </motion.div>
              );
            })}
          </dl>

          {eventCount > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {plural(eventCount, "event", "events")}
              </p>
              <ol role="list" className="flex flex-col gap-0.5">
                {span.events.map((event, index) => (
                  <motion.li
                    key={event.id}
                    initial={false}
                    animate={{
                      opacity: isOpen ? 1 : 0,
                      y: isOpen || !motionSafe ? 0 : distances.nudge,
                    }}
                    transition={rowTransition(index)}
                  >
                    <button
                      type="button"
                      id={`${baseId}-event-${event.id}`}
                      tabIndex={isOpen && index === activeEvent ? 0 : -1}
                      onClick={() => {
                        setActiveEvent(index);
                        onEventSelect?.(event.id);
                      }}
                      onKeyDown={(keyEvent) => handleEventKeys(keyEvent, index)}
                      aria-label={`${sentence(event.label)} at ${formatMs(event.atMs)}.`}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-2 px-1.5 py-1 text-left transition-colors outline-none",
                        "hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        index === activeEvent && "bg-cobalt-wash",
                      )}
                    >
                      <span className="w-12 shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                        {formatMs(event.atMs)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink">
                        {event.label}
                      </span>
                    </button>
                  </motion.li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
