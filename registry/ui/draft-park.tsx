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

export type ParkedDraft = { id: string; text: string };

export type DraftParkProps = {
  /** The field, so a parent can focus it. */
  ref?: React.Ref<HTMLTextAreaElement>;
  /** Controlled field text. */
  value?: string;
  /** Initial field text for uncontrolled usage. */
  defaultValue?: string;
  /** Fires from every edit, a park and a restore. */
  onValueChange?: (value: string) => void;
  /** Controlled parked drafts, newest last. */
  drafts?: ParkedDraft[];
  /** Initial parked drafts for uncontrolled usage. */
  defaultDrafts?: ParkedDraft[];
  /** Fires from a park, a restore and a discard. */
  onDraftsChange?: (drafts: ParkedDraft[]) => void;
  /** Fires from the Park button with the draft it made. */
  onPark?: (draft: ParkedDraft) => void;
  /** Fires from a chip press with the draft it returned. */
  onRestore?: (draft: ParkedDraft) => void;
  /** Fires from a chip's discard button. */
  onDiscard?: (draft: ParkedDraft) => void;
  /** Fires from Enter or the Send button with the trimmed draft. */
  onSend?: (value: string) => void;
  /** A run is in flight: Send is held, Park and the rail still work. */
  live?: boolean;
  /** @default "Ask anything" */
  placeholder?: string;
  /** Names the field. */
  label: string;
  className?: string;
};

const NO_DRAFTS: ParkedDraft[] = [];

/** A chip carries the draft's first words, so a rail of them still reads. */
export const summariseDraft = (text: string): string => {
  const words = text.trim().split(/\s+/);
  const head = words.slice(0, 4).join(" ");
  return words.length > 4 ? `${head}…` : head;
};

type Layer = { key: string; text: string } | null;

/**
 * A composer with a parking rail beneath it. Park takes the field's draft and
 * puts it aside: a ghost of the text drops out of the field on the exit ease
 * while a chip with its first words lands on the rail from `-distances.shift`
 * on `glide` — a layout move, no bounce, because a draft being set aside is a
 * surface changing place, not a celebration. Pressing the chip slides it back:
 * the chip leaves upward on the exit ease and the text arrives in the field
 * from `distances.step` below on `glide`, caret at the end. If the field
 * already held a draft it is parked in the same motion, so a restore is a swap
 * and nothing is lost. The rail is measured, so its height glides to the chip
 * rows and to the empty line when the last chip goes. Drafts persist across
 * runs: Send clears the field, the parent runs its turn with `live`, and the
 * rail keeps every chip.
 *
 * The field is a real textarea with a hint, the rail is a labelled list whose
 * chips each carry a restore and a discard button named by the draft, and a
 * status line announces parks, restores, discards and sends on settle. Under
 * reduced motion the ghost does not travel, the chip and the restored text
 * fade, and the rail's height moves on a fast tween.
 */
export function DraftPark({
  ref,
  value,
  defaultValue,
  onValueChange,
  drafts,
  defaultDrafts,
  onDraftsChange,
  onPark,
  onRestore,
  onDiscard,
  onSend,
  live = false,
  placeholder = "Ask anything",
  label,
  className,
}: DraftParkProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? "",
  );
  const text = value ?? uncontrolledValue;
  const [uncontrolledDrafts, setUncontrolledDrafts] = React.useState(
    defaultDrafts ?? NO_DRAFTS,
  );
  const parked = drafts ?? uncontrolledDrafts;

  const [ghost, setGhost] = React.useState<Layer>(null);
  const [arrival, setArrival] = React.useState<Layer>(null);
  const [leaving, setLeaving] = React.useState<"restore" | "discard">(
    "discard",
  );
  const [announce, setAnnounce] = React.useState("");
  const [caret, setCaret] = React.useState(0);

  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const setFieldNode = (node: HTMLTextAreaElement | null) => {
    fieldRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
  const minted = React.useRef(0);

  // The rail's border-box height, read by the observer and never in render.
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = railRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Focus returns to the field with the caret at the end after a park, a
  // restore or a discard, once the new text is in it.
  React.useEffect(() => {
    if (caret === 0) return;
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, [caret]);

  const commitValue = (next: string) => {
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  };
  const commitDrafts = (next: ParkedDraft[]) => {
    if (drafts === undefined) setUncontrolledDrafts(next);
    onDraftsChange?.(next);
  };
  const mint = (draft: string): ParkedDraft => {
    minted.current += 1;
    return { id: `${baseId}-d${minted.current}`, text: draft };
  };
  const refocus = () => setCaret((n) => n + 1);

  const trimmed = text.trim();
  const canPark = trimmed.length > 0;
  const canSend = canPark && !live;

  const park = () => {
    if (!canPark) return;
    const draft = mint(text);
    const next = [...parked, draft];
    if (motionSafe) setGhost({ key: draft.id, text });
    commitValue("");
    commitDrafts(next);
    setAnnounce(`Parked: ${summariseDraft(text)}. ${next.length} parked.`);
    onPark?.(draft);
    refocus();
  };

  const restore = (draft: ParkedDraft) => {
    const swapped = canPark ? mint(text) : null;
    const next = parked.filter((entry) => entry.id !== draft.id);
    if (swapped) next.push(swapped);
    setLeaving("restore");
    if (swapped && motionSafe) setGhost({ key: swapped.id, text });
    setArrival({ key: draft.id, text: draft.text });
    commitValue(draft.text);
    commitDrafts(next);
    setAnnounce(
      `Restored: ${summariseDraft(draft.text)}. ${next.length} parked.`,
    );
    onRestore?.(draft);
    if (swapped) onPark?.(swapped);
    refocus();
  };

  const discard = (draft: ParkedDraft) => {
    const next = parked.filter((entry) => entry.id !== draft.id);
    setLeaving("discard");
    commitDrafts(next);
    setAnnounce(
      `Discarded: ${summariseDraft(draft.text)}. ${next.length} parked.`,
    );
    onDiscard?.(draft);
    refocus();
  };

  const send = () => {
    if (!canSend) return;
    commitValue("");
    setAnnounce("Sent");
    onSend?.(trimmed);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const layerClass =
    "pointer-events-none absolute inset-0 overflow-hidden px-3 py-2.5 text-sm leading-5 break-words whitespace-pre-wrap";
  const buttonClass =
    "flex h-8 shrink-0 items-center rounded-2 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex flex-col rounded-3 border border-hairline bg-surface-1 focus-within:border-hairline-strong">
        <div className="relative overflow-hidden">
          <textarea
            ref={setFieldNode}
            value={text}
            rows={3}
            placeholder={placeholder}
            aria-label={label}
            aria-describedby={hintId}
            onChange={(event) => commitValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            className={cn(
              "block w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-ink-3",
              arrival ? "text-transparent caret-foreground" : "text-foreground",
            )}
          />
          {/* The ghost is the parked text falling out of the field; the
              arrival is the restored text rising into it. The textarea goes
              transparent under the arrival, then takes over on settle. */}
          {ghost ? (
            <motion.div
              key={ghost.key}
              aria-hidden
              initial={{ y: 0, opacity: 1 }}
              animate={{ y: distances.shift, opacity: 0 }}
              transition={exitFor()}
              onAnimationComplete={() => setGhost(null)}
              className={cn(layerClass, "text-ink-2")}
            >
              {ghost.text}
            </motion.div>
          ) : null}
          {arrival ? (
            <motion.div
              key={arrival.key}
              aria-hidden
              initial={
                motionSafe ? { y: distances.step, opacity: 0 } : { opacity: 0 }
              }
              animate={{ y: 0, opacity: 1 }}
              transition={
                motionSafe ? { ...springs.glide, opacity: fade } : fade
              }
              onAnimationComplete={() => setArrival(null)}
              className={cn(layerClass, "text-foreground")}
            >
              {arrival.text}
            </motion.div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline py-2 pr-2 pl-3">
          <span className="min-w-0 truncate font-mono text-[11px] text-ink-3">
            {live ? "Run live" : "Enter sends"}
          </span>
          <span id={hintId} className="sr-only">
            Enter sends, Shift+Enter breaks the line, Park puts the draft aside
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-disabled={canPark ? undefined : true}
              onClick={park}
              className={cn(
                buttonClass,
                "border border-hairline-strong bg-surface-2 text-foreground hover:bg-accent",
                !canPark && "opacity-40",
              )}
            >
              Park
            </button>
            <button
              type="button"
              aria-disabled={canSend ? undefined : true}
              onClick={send}
              className={cn(
                buttonClass,
                "bg-primary text-primary-foreground hover:bg-primary/90",
                !canSend && "opacity-40",
              )}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={railRef}>
          {parked.length === 0 ? (
            <p className="flex h-7 items-center px-1 text-xs text-ink-3">
              No parked drafts
            </p>
          ) : (
            <ul
              aria-label="Parked drafts"
              className="flex flex-wrap gap-1.5 px-0.5 py-0.5"
            >
              {/* `custom` tells a leaving chip whether it went back to the
                  field (up, the way it came) or was discarded (fades). */}
              <AnimatePresence initial={false} custom={leaving}>
                {parked.map((draft) => {
                  const summary = summariseDraft(draft.text);
                  return (
                    <motion.li
                      key={draft.id}
                      layout={motionSafe ? "position" : false}
                      initial={
                        motionSafe
                          ? { y: -distances.shift, opacity: 0 }
                          : { opacity: 0 }
                      }
                      animate={{ y: 0, opacity: 1 }}
                      variants={{
                        exit: (how: "restore" | "discard") => ({
                          opacity: 0,
                          y:
                            motionSafe && how === "restore"
                              ? -distances.shift
                              : 0,
                          scale: motionSafe && how === "discard" ? 0.92 : 1,
                          transition: exitFor(),
                        }),
                      }}
                      exit="exit"
                      transition={
                        motionSafe ? { ...springs.glide, opacity: fade } : fade
                      }
                      className="flex h-8 max-w-full items-center rounded-2 border border-hairline-strong bg-surface-2 pr-0.5"
                    >
                      <button
                        type="button"
                        aria-label={`Restore: ${summary}`}
                        title={draft.text}
                        onClick={() => restore(draft)}
                        className="flex h-full min-w-0 items-center gap-1.5 rounded-l-2 pr-1 pl-2 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          aria-hidden
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3.5 shrink-0 text-ink-3"
                        >
                          <path d="M4 13.5V3.5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v10l-4-2.5z" />
                        </svg>
                        <span className="min-w-0 truncate">{summary}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Discard: ${summary}`}
                        onClick={() => discard(draft)}
                        className="grid size-6 shrink-0 place-items-center rounded-1 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          aria-hidden
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          className="size-3"
                        >
                          <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                        </svg>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
