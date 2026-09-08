"use client";

import * as React from "react";

import { AnimatePresence, motion, useMotionValue } from "motion/react";

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

export type SignField = {
  id: string;
  /** Row label; also the field's name for assistive technology. */
  label: string;
  /** Literal value. Use `amount` instead for anything the reader counts. */
  value?: string;
  /** Numeric value; printed through `format`. */
  amount?: number;
  /** Marks a row that deserves a second look. Carries the word, not just colour. */
  tone?: "warn";
};

export type SignRequestProps = {
  /** Raises the sheet. Render it inside a `relative` frame. */
  open: boolean;
  /** The request, in reading order. */
  fields: SignField[];
  /** Who is asking. Read out with the title. */
  origin: string;
  /** Sheet heading and the dialog's accessible name. @default "Signature request" */
  title?: string;
  /** Every `amount` goes through this — the sheet never invents a currency. */
  format?: (value: number) => string;
  /** Copy on the arming control. @default "Sign" */
  signLabel?: string;
  /** Fires from the sign press, only ever while armed. */
  onSign?: () => void;
  /** Fires from the reject press, the scrim, or Escape. */
  onReject?: () => void;
  /** Fires from the scroll or resize callback that armed or disarmed the control. */
  onArmedChange?: (armed: boolean) => void;
  className?: string;
};

/** Explicit locale: the server and the first client render must agree. */
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

const defaultFormat = (value: number) => NUMBER.format(value);

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type SheetProps = Omit<SignRequestProps, "open"> &
  Required<Pick<SignRequestProps, "title" | "format" | "signLabel">>;

/**
 * Its own component so that every raise starts a fresh read: scroll position,
 * armed gate and announcement all mount with it rather than surviving.
 */
function SignSheet({
  fields,
  origin,
  title,
  format,
  signLabel,
  onSign,
  onReject,
  onArmedChange,
  className,
}: SheetProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const originId = `${baseId}-origin`;
  const gateId = `${baseId}-gate`;

  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const restoreRef = React.useRef<HTMLElement | null>(null);

  const [armed, setArmed] = React.useState(false);
  const [note, setNote] = React.useState("");

  // Reading progress is scroll-linked, so it lives in a motion value: the
  // hairline tracks the thumb without a re-render per scroll event.
  const progress = useMotionValue(0);

  // The parent hears about the gate from the scroll or resize callback that
  // moved it, never from a state updater or a render pass.
  const armedRef = React.useRef(false);
  const changeRef = React.useRef(onArmedChange);
  React.useEffect(() => {
    changeRef.current = onArmedChange;
  });
  const setArmedFrom = React.useCallback((next: boolean) => {
    if (armedRef.current === next) return;
    armedRef.current = next;
    setArmed(next);
    changeRef.current?.(next);
  }, []);

  React.useEffect(() => {
    const previous = document.activeElement;
    restoreRef.current = previous instanceof HTMLElement ? previous : null;
    // Focus the list, not the buttons: reading is the first thing to do here,
    // and PageDown has to land somewhere that scrolls.
    listRef.current?.focus();
    return () => {
      const node = restoreRef.current;
      if (node && document.contains(node)) node.focus();
    };
  }, []);

  React.useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const measure = () => {
      const span = node.scrollHeight - node.clientHeight;
      // A request short enough to read at a glance has already been read.
      const fraction = span <= 1 ? 1 : Math.min(1, node.scrollTop / span);
      progress.set(fraction);
      setArmedFrom(fraction >= 0.995);
    };
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const inner = node.firstElementChild;
    if (inner) observer.observe(inner);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [progress, setArmedFrom]);

  const jumpToEnd = () => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: motionSafe ? "smooth" : "auto",
    });
    // Asking to be taken to the end is the acknowledgement the gate wants, so
    // the control arms from the press rather than from where the scroll lands.
    progress.set(1);
    setArmedFrom(true);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onReject?.();
      return;
    }
    if (event.key !== "Tab") return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const nodes = Array.from(
      sheet.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((node) => node.offsetParent !== null);
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const press = () => {
    if (!armed) {
      jumpToEnd();
      setNote("Request scrolled to the end. Press sign again.");
      return;
    }
    onSign?.();
  };

  const stagger = cascade(fields.length);
  const rowSpring = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  return (
    <div className={cn("absolute inset-0 z-30", className)}>
      <motion.button
        type="button"
        tabIndex={-1}
        aria-hidden
        onClick={() => onReject?.()}
        className="absolute inset-0 cursor-default bg-background/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{ duration: durations.fast, ease: easings.enter }}
      />

      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={originId}
        onKeyDown={handleKeyDown}
        className="absolute inset-x-0 top-8 bottom-0 flex flex-col overflow-hidden rounded-t-3 border-t border-hairline-strong bg-popover text-popover-foreground shadow-raised"
        initial={
          motionSafe ? { y: distances.shift, opacity: 0 } : { opacity: 0 }
        }
        animate={{ y: 0, opacity: 1 }}
        exit={{ opacity: 0, transition: exitFor() }}
        transition={
          motionSafe
            ? { ...springs.glide, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        <div className="flex shrink-0 flex-col gap-0.5 border-b border-hairline px-3 py-2.5">
          <span id={titleId} className="text-sm font-semibold">
            {title}
          </span>
          <span id={originId} className="truncate text-[11px] text-ink-3">
            Requested by {origin}
          </span>
        </div>

        <div
          ref={listRef}
          role="group"
          tabIndex={0}
          aria-label="Request details"
          className="min-h-0 flex-1 overflow-y-auto outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <dl className="flex flex-col">
            {fields.map((field, index) => (
              <motion.div
                key={field.id}
                className="flex flex-col gap-0.5 border-b border-hairline px-3 py-2 last:border-b-0"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...rowSpring,
                  delay: motionSafe ? index * stagger : 0,
                }}
              >
                <dt className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                  <span className="min-w-0 truncate">{field.label}</span>
                  {field.tone === "warn" ? (
                    <span className="flex h-4 shrink-0 items-center rounded-full border border-warn px-1.5 text-[9px] text-warn">
                      Warning
                    </span>
                  ) : null}
                </dt>
                <dd
                  className={cn(
                    "font-mono text-[11px] break-all tabular-nums",
                    field.tone === "warn" ? "text-warn" : "text-foreground",
                  )}
                >
                  {field.amount !== undefined
                    ? format(field.amount)
                    : (field.value ?? "—")}
                </dd>
              </motion.div>
            ))}
          </dl>
        </div>

        <span aria-hidden className="block h-px w-full shrink-0 bg-hairline">
          <motion.span
            className="block h-full origin-left bg-cobalt-bright"
            style={{ scaleX: progress }}
          />
        </span>

        <div className="flex shrink-0 flex-col gap-2 px-3 py-2.5">
          <div className="flex h-7 items-center justify-between gap-2">
            <span
              id={gateId}
              className={cn(
                "min-w-0 truncate text-[11px]",
                armed ? "text-success" : "text-ink-3",
              )}
            >
              {armed
                ? "Read to the end. Ready to sign."
                : "Scroll to the end of the request to sign."}
            </span>
            {armed ? null : (
              <button
                type="button"
                onClick={jumpToEnd}
                className="flex h-7 shrink-0 items-center gap-1 rounded-2 border border-input px-2 text-[11px] font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Jump to end
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 shrink-0"
                >
                  <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onReject?.()}
              className="flex h-9 flex-1 items-center justify-center rounded-2 border border-input bg-surface-1 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Reject
            </button>
            <button
              type="button"
              aria-disabled={!armed}
              aria-describedby={gateId}
              onClick={press}
              className="relative flex h-9 flex-1 items-center justify-center overflow-hidden rounded-2 border border-input outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {/* The fill sweeps from the left as the gate opens — a switch
                  closing, so it snaps rather than glides. */}
              <motion.span
                aria-hidden
                className="absolute inset-0 origin-left bg-primary"
                initial={false}
                animate={{ scaleX: armed ? 1 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
              <span
                className={cn(
                  "relative text-xs font-medium transition-colors",
                  armed ? "text-primary-foreground" : "text-ink-3",
                )}
              >
                {signLabel}
              </span>
            </button>
          </div>
        </div>

        <span role="status" className="sr-only">
          {note || (armed ? "Ready to sign." : "")}
        </span>
      </motion.div>
    </div>
  );
}

/**
 * A signing sheet that refuses to be rubber-stamped. It rises inside the
 * wallet's own frame — the scrim on a tween, the panel from a `shift` on
 * `glide` — and lays the request out one row at a time, each arriving from a
 * `nudge` behind a `cascade()` delay so the whole list is placed inside the
 * 600ms budget and reads as one sweep rather than a dump.
 *
 * The list is the sheet's only scroller, so it takes exactly the room the frame
 * leaves and reserves none. How much of it has been read is measured: a scroll
 * listener writes the fraction into a motion value that scales the hairline
 * beneath without a re-render, and reaching the end — or a request too short to
 * scroll, caught by a ResizeObserver — arms the sign control, whose fill sweeps
 * in from the left on `snap`. Rejecting never celebrates: the sheet leaves on
 * the exit ease with no spring at all.
 *
 * It is a real `dialog`: focus moves to the list on open and back to the opener
 * on close, Tab is trapped, Escape rejects, and the closed gate is an
 * `aria-disabled` control with its reason attached — a press while closed takes
 * the reader to the end instead. Under reduced motion nothing travels and the
 * fill swaps, but the hairline still tracks the scroll.
 */
export function SignRequest({
  open,
  fields,
  origin,
  title = "Signature request",
  format = defaultFormat,
  signLabel = "Sign",
  onSign,
  onReject,
  onArmedChange,
  className,
}: SignRequestProps) {
  return (
    <AnimatePresence>
      {open ? (
        <SignSheet
          fields={fields}
          origin={origin}
          title={title}
          format={format}
          signLabel={signLabel}
          onSign={onSign}
          onReject={onReject}
          onArmedChange={onArmedChange}
          className={className}
        />
      ) : null}
    </AnimatePresence>
  );
}
