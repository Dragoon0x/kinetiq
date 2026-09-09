"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FlagNoteValue = {
  reason: string;
  note: string;
};

export type FlagNoteProps = {
  ref?: React.Ref<HTMLElement>;
  /** Whose answer this is; the header caption. */
  model: string;
  /** The answer text. */
  answer: string;
  /** The reason chips. @default Wrong / Unsafe / Off topic / Style */
  reasons?: string[];
  /** Controlled flag, or null when unflagged. */
  flag?: FlagNoteValue | null;
  /** Initial flag for uncontrolled usage. @default null */
  defaultFlag?: FlagNoteValue | null;
  /** Fires from Submit with the flag, or from Remove with null. */
  onFlagChange?: (flag: FlagNoteValue | null) => void;
  /** Fires when the note panel opens or closes. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const DEFAULT_REASONS = ["Wrong", "Unsafe", "Off topic", "Style"];

function FlagGlyph({
  filled,
  motionSafe,
}: {
  filled: boolean;
  motionSafe: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      className="size-3.5 shrink-0"
    >
      <path d="M3.5 14.5v-12" />
      <motion.path
        d="M3.5 2.5h8.5l-2.5 3 2.5 3H3.5z"
        fill="currentColor"
        initial={false}
        animate={{ fillOpacity: filled ? 1 : 0 }}
        transition={{
          duration: motionSafe ? durations.base : durations.fast,
          ease: easings.enter,
        }}
      />
    </svg>
  );
}

const CONTROL =
  "flex h-7 items-center gap-1.5 rounded-2 border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * An answer with a Flag control. Pressing it raises a note panel beneath the
 * answer: the panel's box glides from zero to its measured height on `glide`
 * — a ResizeObserver on the content, so the fold is a real number — and
 * focus moves to the reason chips. Submit folds the panel back and the flag
 * badge lands in the header on `snap`, the one crisp overshoot of something
 * clicking into place, its glyph filling on a colour tween. Pressing the
 * badge reopens the panel to edit; Remove clears it and the badge leaves on
 * the exit ease, never a bounce, because removing is not an event to enjoy.
 *
 * The Flag button carries `aria-expanded` and `aria-controls`; the panel is
 * inert while folded; reasons are a radiogroup with a roving tabindex, and
 * Escape cancels and returns focus to the control that opened it. Under
 * reduced motion the panel still opens and closes on a tween — the field is
 * information — and the badge fades in place.
 */
export function FlagNote({
  ref,
  model,
  answer,
  reasons = DEFAULT_REASONS,
  flag,
  defaultFlag = null,
  onFlagChange,
  onOpenChange,
  className,
}: FlagNoteProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const modelId = `${baseId}-model`;
  const panelId = `${baseId}-panel`;
  const noteId = `${baseId}-note`;

  const [uncontrolled, setUncontrolled] = React.useState<FlagNoteValue | null>(
    defaultFlag,
  );
  const isControlled = flag !== undefined;
  const current = isControlled ? flag : uncontrolled;

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{
    reason: string | null;
    note: string;
  }>({ reason: null, note: "" });
  const [announce, setAnnounce] = React.useState("");

  const chipRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  // Where focus lands next, set by the event that moved it and claimed by the
  // target's ref callback once it exists: the badge mounts only after the Flag
  // button has left, so an effect on the same render would find nothing.
  const pendingFocus = React.useRef<"flag" | "badge" | "panel" | null>(null);
  const claimFocus = (
    target: "flag" | "badge" | "panel",
    node: HTMLElement | null,
  ) => {
    if (!node || pendingFocus.current !== target) return;
    pendingFocus.current = null;
    // The panel is a clipped box mid-glide; scrolling into view would shove
    // its content out of the clip.
    node.focus({ preventScroll: true });
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const next = box ? box.blockSize : node.getBoundingClientRect().height;
      setHeight(Math.ceil(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const show = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const openPanel = () => {
    setDraft({ reason: current?.reason ?? null, note: current?.note ?? "" });
    pendingFocus.current = "panel";
    show(true);
  };

  const cancel = () => {
    pendingFocus.current = current ? "badge" : "flag";
    show(false);
  };

  const submit = () => {
    if (!draft.reason) return;
    const next = { reason: draft.reason, note: draft.note.trim() };
    if (!isControlled) setUncontrolled(next);
    onFlagChange?.(next);
    setAnnounce(`Flagged as ${next.reason}`);
    pendingFocus.current = "badge";
    show(false);
  };

  const remove = () => {
    if (!isControlled) setUncontrolled(null);
    onFlagChange?.(null);
    setAnnounce("Flag removed");
    pendingFocus.current = "flag";
    if (open) show(false);
  };

  const selectedIndex = Math.max(
    0,
    reasons.findIndex((reason) => reason === draft.reason),
  );
  const focusChip = (index: number) => {
    const clamped = Math.min(reasons.length - 1, Math.max(0, index));
    const reason = reasons[clamped];
    if (reason === undefined) return;
    chipRefs.current[clamped]?.focus();
    setDraft((prev) => ({ ...prev, reason }));
  };
  const onChipKey = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusChip(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusChip(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusChip(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusChip(reasons.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      focusChip(index);
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const fold = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  return (
    <article
      ref={ref}
      aria-labelledby={modelId}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <span
          id={modelId}
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
          title={model}
        >
          {model}
        </span>

        <AnimatePresence initial={false} mode="wait">
          {current ? (
            <motion.span
              key="badge"
              className="flex shrink-0 items-center gap-1"
              initial={
                motionSafe
                  ? { scale: 0.85, y: distances.nudge, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
            >
              <button
                ref={(node) => claimFocus("badge", node)}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={`Flagged as ${current.reason}${
                  current.note ? `, note: ${current.note}` : ""
                }. Edit flag`}
                title={current.note || undefined}
                onClick={() => (open ? cancel() : openPanel())}
                className={cn(
                  CONTROL,
                  "border-warn/40 bg-warn/15 text-warn hover:bg-warn/25",
                )}
              >
                <FlagGlyph filled motionSafe={motionSafe} />
                {current.reason}
              </button>
              <button
                type="button"
                aria-label="Remove flag"
                onClick={remove}
                className={cn(
                  "flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  className="size-3.5 shrink-0"
                >
                  <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                </svg>
              </button>
            </motion.span>
          ) : (
            <motion.span
              key="flag"
              className="flex shrink-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              <button
                ref={(node) => claimFocus("flag", node)}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => (open ? cancel() : openPanel())}
                className={cn(
                  CONTROL,
                  open
                    ? "border-hairline-strong bg-accent"
                    : "border-hairline-strong bg-surface-0 hover:bg-accent",
                )}
              >
                <FlagGlyph filled={false} motionSafe={motionSafe} />
                Flag
              </button>
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <p className="px-3 pt-2 pb-3 text-sm leading-relaxed text-foreground">
        {answer}
      </p>

      <motion.div
        id={panelId}
        className="overflow-hidden"
        initial={false}
        animate={{ height: open ? height : 0 }}
        transition={fold}
      >
        <div
          ref={innerRef}
          role="group"
          aria-label="Flag note"
          inert={!open || undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className="flex flex-col gap-2.5 border-t border-hairline px-3 py-3"
        >
          <div
            role="radiogroup"
            aria-label="Reason"
            className="flex flex-wrap items-center gap-1.5"
          >
            {reasons.map((reason, index) => {
              const checked = draft.reason === reason;
              return (
                <button
                  key={reason}
                  ref={(node) => {
                    chipRefs.current[index] = node;
                    if (index === selectedIndex) claimFocus("panel", node);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={open && index === selectedIndex ? 0 : -1}
                  onClick={() => focusChip(index)}
                  onKeyDown={(event) => onChipKey(event, index)}
                  className={cn(
                    CONTROL,
                    "rounded-full",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-hairline-strong bg-surface-0 hover:bg-accent",
                  )}
                >
                  {reason}
                </button>
              );
            })}
          </div>

          <label htmlFor={noteId} className="sr-only">
            Note
          </label>
          <textarea
            id={noteId}
            rows={2}
            value={draft.note}
            placeholder="Say why, in a line or two"
            tabIndex={open ? 0 : -1}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, note: event.target.value }))
            }
            className={cn(
              "w-full resize-none rounded-2 border border-input bg-surface-0 px-2.5 py-2 text-sm leading-snug text-foreground outline-none placeholder:text-ink-3",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          />

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={cancel}
              className={cn(
                CONTROL,
                "border-hairline-strong bg-surface-0 hover:bg-accent",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.reason}
              tabIndex={open ? 0 : -1}
              onClick={submit}
              className={cn(
                CONTROL,
                "border-primary bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-primary",
              )}
            >
              {current ? "Update flag" : "Submit flag"}
            </button>
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </article>
  );
}
