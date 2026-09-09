"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PolicyNoteReason = "press" | "read" | "escape";

export type PolicyNoteProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer the note explains. */
  answer: string;
  /** Whose answer it is; the header caption. */
  model: string;
  /** The policy's short code, printed in mono: "Coldbrook house policy 4.2". */
  code: string;
  /** The policy's name. */
  title: string;
  /** One or two sentences on the constraint. */
  note: string;
  /** Controlled unfolded state. */
  open?: boolean;
  /** Initial unfolded state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, Escape or the read-out timer that changed the state. */
  onOpenChange?: (open: boolean, by: PolicyNoteReason) => void;
  /** Milliseconds the note stays open once unfolded; 0 or less keeps it open. @default from the word count */
  readTime?: number;
  /** The tag's copy before the note has been read. @default "Why this answer" */
  tagLabel?: string;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

/** Words per minute the default read time assumes, floored at three seconds. */
const PACE = 220;
const MIN_READ = 3000;

const readTimeFor = (note: string) => {
  const words = note.split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_READ, Math.round((words / PACE) * 60000));
};

/** Keeps callbacks out of effect dependencies so a re-render never restarts the read. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * An answer with a small tag beneath it that unfolds into a note explaining
 * the constraint. The note is a sheet hinged at its top edge: pressing the
 * tag rotates it from -90° to flat on `glide` while its wrapper glides to the
 * measured height, so the sheet comes down rather than slides. Reading takes
 * time and the note knows how much — a hairline along its bottom edge drains
 * across `readTime` (by default from the word count at a reading pace),
 * holding while the pointer is over the note or focus is inside it and while
 * the tab is hidden. When it runs out the note folds itself, the hinge
 * closing on the exit ease, and the tag reads "Read" with a tick drawn on
 * `flick`. Pressing the tag while open folds it early; Escape folds it and
 * returns focus to the tag.
 *
 * The tag is a real button with `aria-expanded` and `aria-controls`; the note
 * is a region labelled by the policy title, inert while folded. A polite live
 * region reads the note's title once when it unfolds and "Note folded" once
 * when it folds. Under reduced motion the sheet fades without the hinge, the
 * height changes on a tween, and the hairline still drains, because the
 * moment of folding is information.
 */
export function PolicyNote({
  ref,
  answer,
  model,
  code,
  title,
  note,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  readTime,
  tagLabel = "Why this answer",
  label,
  className,
}: PolicyNoteProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const noteId = `${baseId}-note`;
  const titleId = `${baseId}-title`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const [read, setRead] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [focusedInside, setFocusedInside] = React.useState(false);
  const tagRef = React.useRef<HTMLButtonElement | null>(null);
  const onOpenChangeRef = useLatest(onOpenChange);
  const controlled = openProp !== undefined;

  // The announcement is derived from the committed open flag during render,
  // so a controlled parent toggling the note is announced like a press.
  const [seen, setSeen] = React.useState({ open, announce: "" });
  if (seen.open !== open) {
    setSeen({
      open,
      announce: open ? `Note open: ${code}, ${title}` : "Note folded",
    });
  }

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const duration = readTime ?? readTimeFor(note);
  // 1 → 0 across the read time. A motion value, not state: pausing stops
  // the animation and resuming continues from what is left, with no render.
  const remaining = useMotionValue(1);
  React.useEffect(() => {
    if (!open) {
      remaining.set(1);
      return;
    }
    if (hovered || focusedInside || !visible || duration <= 0) return;
    const controls = animate(remaining, 0, {
      duration: (duration / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => {
        if (!controlled) setOwnOpen(false);
        setRead(true);
        onOpenChangeRef.current?.(false, "read");
      },
    });
    return () => controls.stop();
  }, [
    open,
    hovered,
    focusedInside,
    visible,
    duration,
    controlled,
    remaining,
    onOpenChangeRef,
  ]);

  const setOpen = (next: boolean, by: PolicyNoteReason) => {
    if (next === open) return;
    if (!controlled) setOwnOpen(next);
    onOpenChange?.(next, by);
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setMeasured(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          setOpen(false, "escape");
          tagRef.current?.focus();
        }
      }}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {model}
      </span>
      <p className="text-sm leading-relaxed text-foreground">{answer}</p>

      <div className="flex items-center">
        <button
          ref={tagRef}
          type="button"
          aria-expanded={open}
          aria-controls={noteId}
          onClick={() => setOpen(!open, "press")}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors outline-none",
            open
              ? "border-hairline-strong bg-cobalt-wash text-foreground"
              : "border-hairline bg-surface-0 text-ink-2 hover:border-hairline-strong hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {/* Glyph and tick share one cell so the swap never nudges the label. */}
          <span className="grid size-3.5 shrink-0 place-items-center">
            <motion.svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              className="col-start-1 row-start-1 size-3.5"
              animate={{ opacity: read ? 0 : 1 }}
              transition={fade}
            >
              <path d="M4 2.5h5.5L12 5v8.5H4z" />
              <path d="M9.5 2.5V5H12" />
              <path d="M6 8h4M6 10.5h4" strokeLinecap="round" />
            </motion.svg>
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="col-start-1 row-start-1 size-3.5 text-success"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                pathLength={1}
                initial={false}
                animate={{ pathLength: read ? 1 : 0, opacity: read ? 1 : 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.flick,
                        opacity: { duration: durations.blink },
                      }
                    : { duration: 0 }
                }
              />
            </svg>
          </span>
          {read && !open ? "Read" : tagLabel}
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: open ? measured : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
        style={{ perspective: "600px" }}
      >
        <div ref={innerRef} className="pt-1">
          <motion.div
            id={noteId}
            role="region"
            aria-labelledby={titleId}
            aria-hidden={!open}
            inert={!open}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocusedInside(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setFocusedInside(false);
              }
            }}
            initial={false}
            animate={{
              rotateX: open || !motionSafe ? 0 : -90,
              opacity: open ? 1 : 0,
            }}
            transition={
              !motionSafe
                ? fade
                : open
                  ? { ...springs.glide, opacity: fade }
                  : { duration: durations.base, ease: easings.exit }
            }
            style={{ transformOrigin: "top center" }}
            className="relative flex flex-col gap-1 rounded-2 border border-hairline bg-surface-0 px-3 py-2.5"
          >
            <span className="font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase">
              {code}
            </span>
            <span id={titleId} className="text-sm font-semibold">
              {title}
            </span>
            <p className="text-xs leading-relaxed text-ink-2">{note}</p>
            <motion.span
              aria-hidden
              className={cn(
                "absolute inset-x-0 bottom-0 h-px origin-left bg-cobalt-bright transition-opacity",
                duration > 0 ? "opacity-100" : "opacity-0",
              )}
              style={{ scaleX: remaining }}
            />
          </motion.div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {seen.announce}
      </span>
    </div>
  );
}
