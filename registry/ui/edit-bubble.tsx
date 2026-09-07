"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EditBubbleProps = {
  /** Current value. The reading state mirrors it; each edit starts from it. */
  value: string;
  /** Called on commit. Return a promise to hold the bubble open while it saves. */
  onSave?: (value: string) => void | Promise<void>;
  /** Return a reason to block the save; null lets it through. */
  validate?: (value: string) => string | null;
  /** Input type. @default "text" */
  type?: "text" | "number";
  /** Accessible name of the field, also shown above it. */
  label: string;
  className?: string;
};

/** How long the saved tick holds before the pencil hint comes back. */
const STAMP_HOLD_MS = 1200;

const PENCIL = "M11.2 2.8a1.7 1.7 0 0 1 2.4 2.4L6.2 12.6 3 13.4l.8-3.2Z";

const CAPTION =
  "col-start-1 row-start-1 truncate font-mono text-[10px] tracking-[0.08em] uppercase";

/**
 * Click the value; it becomes the field. The reading state and the bubble share
 * one `layoutId`, so the box grows out of the value on `snap` — ζ0.83, one crisp
 * overshoot, the physics of a control taking its position — instead of a panel
 * appearing over it. The text keeps its place through the growth, and committing
 * lands the new value on `recoil`, whose two bounces read as a stamp hitting
 * paper, while a tick takes over the pencil hint's slot.
 *
 * Enter saves, Escape restores the old value, and blurring saves too, so tabbing
 * onward never loses an edit. A blocked save nudges the bubble four pixels and
 * prints the reason where the label sits rather than discarding the edit. Both
 * states are the same height, so nothing below the field ever jumps. Under
 * reduced motion the bubble swaps in, the tick appears, and a refusal states its
 * reason without the nudge.
 */
export function EditBubble({
  value,
  onSave,
  validate,
  type = "text",
  label,
  className,
}: EditBubbleProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const reasonId = `${uid}-reason`;
  const shellId = `${uid}-shell`;

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [reason, setReason] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [stamped, setStamped] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  // Closing unmounts the input, and that unmount must not read as a blur-save.
  const closing = React.useRef(false);

  const nudgeX = useMotionValue(0);

  React.useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  React.useEffect(() => {
    if (!stamped) return;
    const timer = window.setTimeout(() => setStamped(false), STAMP_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [stamped]);

  const nudge = () => {
    if (!motionSafe) return;
    // A refusal is a shake of the head: a symmetric tween out and back, never a
    // spring, so nothing about being blocked reads as celebration.
    animate(nudgeX, [0, -distances.nudge, distances.nudge, 0], {
      duration: durations.base,
      ease: easings.move,
    });
  };

  const close = (didSave: boolean) => {
    closing.current = true;
    setSaving(false);
    setReason(null);
    setEditing(false);
    if (didSave) setStamped(true);
    requestAnimationFrame(() => {
      closing.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    });
  };

  const commit = () => {
    if (closing.current || saving) return;
    const next = draft.trim();
    const blocked = validate?.(next) ?? null;
    if (blocked) {
      setReason(blocked);
      nudge();
      return;
    }
    if (next === value) {
      close(false);
      return;
    }
    const result = onSave?.(next);
    if (result instanceof Promise) {
      setSaving(true);
      result.then(
        () => close(true),
        () => {
          setSaving(false);
          setReason("Could not save");
          nudge();
        },
      );
      return;
    }
    close(true);
  };

  const cancel = () => {
    setDraft(value);
    close(false);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const shell = "absolute inset-0 rounded-2 border transition-colors";
  const shellOpen = "border-cobalt-bright/60 bg-surface-0";
  const shellIdle =
    "border-transparent group-hover:border-hairline-strong group-hover:bg-surface-2 group-focus-visible:border-hairline-strong";

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      {/* Label and edit hint share one line, so switching to the field costs no
          height and nothing below the control moves. */}
      <span className="grid min-w-0">
        <motion.span
          id={labelId}
          animate={{ opacity: editing ? 0 : 1 }}
          transition={fade}
          className={cn(CAPTION, "text-ink-3")}
        >
          {label}
        </motion.span>
        <motion.span
          id={reasonId}
          role="status"
          aria-hidden={!editing}
          animate={{ opacity: editing ? 1 : 0 }}
          transition={fade}
          className={cn(CAPTION, reason ? "text-danger" : "text-ink-3")}
        >
          {reason ?? (saving ? "Saving" : "Enter saves · Esc restores")}
        </motion.span>
      </span>

      <div className="relative flex">
        {editing ? (
          <motion.div
            style={{ x: nudgeX }}
            className="relative h-8 w-full"
            onBlur={(event) => {
              if (closing.current) return;
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) {
                return;
              }
              commit();
            }}
          >
            {motionSafe ? (
              <motion.span
                aria-hidden
                layoutId={shellId}
                transition={springs.snap}
                className={cn(shell, shellOpen)}
              />
            ) : (
              <span aria-hidden className={cn(shell, shellOpen)} />
            )}
            <input
              ref={inputRef}
              type={type}
              inputMode={type === "number" ? "decimal" : undefined}
              value={draft}
              disabled={saving}
              aria-labelledby={labelId}
              aria-invalid={reason !== null}
              aria-describedby={reasonId}
              onChange={(event) => {
                setDraft(event.target.value);
                if (reason) setReason(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
              className="relative h-8 w-full rounded-2 bg-transparent px-2 text-sm font-medium outline-none disabled:opacity-60"
            />
          </motion.div>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Edit ${label}, currently ${value}`}
            onClick={() => {
              setDraft(value);
              setReason(null);
              setEditing(true);
            }}
            className="group relative inline-flex h-8 max-w-full items-center gap-2 rounded-2 px-2 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {motionSafe ? (
              <motion.span
                aria-hidden
                layoutId={shellId}
                transition={springs.snap}
                className={cn(shell, shellIdle)}
              />
            ) : (
              <span aria-hidden className={cn(shell, shellIdle)} />
            )}

            {/* Keyed by value, so a commit remounts it and the new reading lands
                on recoil; `initial={false}` keeps the first paint still. */}
            <motion.span
              key={value}
              initial={
                stamped && motionSafe
                  ? { y: -distances.nudge, opacity: 0 }
                  : false
              }
              animate={{ y: 0, opacity: 1 }}
              transition={{
                ...springs.recoil,
                opacity: { duration: durations.blink },
              }}
              title={value}
              className="relative min-w-0 truncate text-sm font-medium"
            >
              {value}
            </motion.span>

            {/* Pencil and tick share one slot, so the hint turning into a
                confirmation reflows nothing. */}
            <span className="relative grid size-4 shrink-0 place-items-center">
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                className={cn(
                  "col-start-1 row-start-1 size-4 text-ink-3 opacity-0 transition-opacity",
                  !stamped &&
                    "group-hover:opacity-100 group-focus-visible:opacity-100",
                )}
              >
                <path d={PENCIL} />
              </svg>
              <motion.svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="col-start-1 row-start-1 size-4 text-success"
                initial={false}
                animate={{
                  opacity: stamped ? 1 : 0,
                  scale: motionSafe && !stamped ? 0.6 : 1,
                }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
              </motion.svg>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
