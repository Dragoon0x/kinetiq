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

export type DraftChannel = {
  id: string;
  /** Printed after a hash: "dispatch" reads as #dispatch. */
  name: string;
  /** The row's second line while the channel holds no draft. */
  topic: string;
};

export type DraftBadgeProps = {
  ref?: React.Ref<HTMLDivElement>;
  channels: DraftChannel[];
  /** Controlled draft text per channel id. */
  drafts?: Record<string, string>;
  /** Initial drafts for uncontrolled usage. */
  defaultDrafts?: Record<string, string>;
  /** Fires from every keystroke and from the clear after a send. */
  onDraftsChange?: (drafts: Record<string, string>) => void;
  /** Controlled open channel id. */
  active?: string;
  /** Initial open channel for uncontrolled usage; defaults to the first. */
  defaultActive?: string;
  /** Fires from a row press or the key that opened a channel. */
  onActiveChange?: (id: string) => void;
  /** Fires from Enter or the Send button with the trimmed text. */
  onSend?: (channelId: string, text: string) => void;
  /** @default "Message" */
  placeholder?: string;
  /** Names the channel list and the composer for assistive technology. */
  label: string;
  className?: string;
};

const NO_DRAFTS: Record<string, string> = {};

/** A badge carries the draft's first words, so a row of them still reads. */
export const firstWords = (text: string): string => {
  const words = text.trim().split(/\s+/);
  const head = words.slice(0, 4).join(" ");
  return words.length > 4 ? `${head}…` : head;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

type Arrival = { key: string; text: string } | null;

/**
 * A channel list that remembers what you did not send. Typing writes a draft
 * for the open channel; leaving it puts a badge on the row you left — a pencil
 * and the draft's first words rising from `distances.nudge` on `snap` in place
 * of the topic line, so the row never changes height. Opening the channel again
 * drops the badge out of the row on the exit ease while the same text arrives
 * in the composer from `distances.step` above on `glide`: the draft travels
 * from the row back into the field, caret at the end. Every channel keeps its
 * own draft, and a send clears only the open one.
 *
 * The rows are tabs with a roving tabindex — arrows move, Home and End jump,
 * Enter or Space opens — and the composer is their panel: a real textarea where
 * Enter sends and Shift+Enter breaks the line. Each badge is an image whose
 * sentence names the draft, and a status region says when a draft is kept,
 * restored or sent. Under reduced motion the badge and the returning text fade
 * in place and nothing travels.
 */
export function DraftBadge({
  ref,
  channels,
  drafts,
  defaultDrafts,
  onDraftsChange,
  active,
  defaultActive,
  onActiveChange,
  onSend,
  placeholder = "Message",
  label,
  className,
}: DraftBadgeProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;
  const hintId = `${baseId}-hint`;
  const tabId = (id: string) => `${baseId}-tab-${id}`;

  const [uncontrolledDrafts, setUncontrolledDrafts] = React.useState(
    defaultDrafts ?? NO_DRAFTS,
  );
  const draftMap = drafts ?? uncontrolledDrafts;
  const [uncontrolledActive, setUncontrolledActive] = React.useState(
    () => defaultActive ?? channels[0]?.id ?? "",
  );
  const activeId = active ?? uncontrolledActive;
  const activeChannel = channels.find((channel) => channel.id === activeId);
  const text = draftMap[activeId] ?? "";

  const [arrival, setArrival] = React.useState<Arrival>(null);
  const [announce, setAnnounce] = React.useState("");
  const [focusTick, setFocusTick] = React.useState(0);
  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const arrivals = React.useRef(0);

  // Focus lands in the field with the caret after the restored text, once
  // that text has committed — a draft comes back ready to continue.
  React.useEffect(() => {
    if (focusTick === 0) return;
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, [focusTick]);

  const nameOf = (id: string) =>
    `#${channels.find((channel) => channel.id === id)?.name ?? id}`;

  const commitDrafts = (next: Record<string, string>) => {
    if (drafts === undefined) setUncontrolledDrafts(next);
    onDraftsChange?.(next);
  };
  const writeDraft = (id: string, value: string) => {
    const next = { ...draftMap };
    if (value.length > 0) next[id] = value;
    else delete next[id];
    commitDrafts(next);
  };

  const open = (id: string) => {
    if (id === activeId) return;
    const kept = (draftMap[activeId] ?? "").trim().length > 0;
    const incoming = draftMap[id] ?? "";
    const restored = incoming.trim().length > 0;
    if (restored) {
      arrivals.current += 1;
      setArrival({ key: `${id}-${arrivals.current}`, text: incoming });
    }
    if (active === undefined) setUncontrolledActive(id);
    onActiveChange?.(id);
    setAnnounce(
      restored
        ? `Draft restored in ${nameOf(id)}`
        : kept
          ? `Draft kept in ${nameOf(activeId)}`
          : `Opened ${nameOf(id)}`,
    );
    setFocusTick((tick) => tick + 1);
  };

  const send = () => {
    const trimmed = text.trim();
    if (!activeChannel || trimmed.length === 0) return;
    writeDraft(activeId, "");
    setAnnounce(`Sent to ${nameOf(activeId)}`);
    onSend?.(activeId, trimmed);
  };

  const focusTab = (index: number) => {
    const channel = channels[Math.min(channels.length - 1, Math.max(0, index))];
    if (!channel) return;
    document.getElementById(tabId(channel.id))?.focus();
  };

  const handleTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    id: string,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open(id);
      return;
    }
    // Manual activation: the arrows only move focus, so a keyboard reader can
    // walk the rows and read their badges without opening every channel.
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: channels.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    focusTab(to);
  };

  const canSend = text.trim().length > 0 && activeChannel !== undefined;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="vertical"
        className="flex flex-col gap-0.5 rounded-3 border border-hairline bg-surface-1 p-1"
      >
        {channels.map((channel, index) => {
          const selected = channel.id === activeId;
          const draft = draftMap[channel.id] ?? "";
          const badged = !selected && draft.trim().length > 0;
          return (
            <button
              key={channel.id}
              type="button"
              role="tab"
              id={tabId(channel.id)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(channel.id)}
              onKeyDown={(event) => handleTabKey(event, index, channel.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-2 px-2 py-1.5 text-left transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? "bg-surface-2 text-foreground"
                  : "text-ink-2 hover:bg-accent hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-2 border font-mono text-xs",
                  selected
                    ? "border-hairline-strong bg-surface-0 text-foreground"
                    : "border-hairline bg-surface-1 text-ink-3",
                )}
              >
                #
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm leading-5 font-medium">
                  {channel.name}
                </span>
                {/* Topic and badge share one cell, so the swap between them
                    never changes the row's height. */}
                <span className="grid h-4 items-center">
                  <motion.span
                    aria-hidden={badged}
                    className="col-start-1 row-start-1 truncate text-xs leading-4 text-ink-3"
                    initial={false}
                    animate={{ opacity: badged ? 0 : 1 }}
                    transition={FADE}
                  >
                    {channel.topic}
                  </motion.span>
                  <AnimatePresence initial={false} custom={activeId}>
                    {badged ? (
                      <motion.span
                        key="badge"
                        role="img"
                        aria-label={`Draft: ${firstWords(draft)}`}
                        title={draft}
                        className="col-start-1 row-start-1 flex min-w-0 items-center gap-1 text-xs leading-4"
                        initial={
                          motionSafe
                            ? { opacity: 0, y: distances.nudge }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        variants={{
                          // Opening the channel sends the badge down toward the
                          // composer, the way its text is going; any other
                          // clearing simply fades.
                          exit: (openedId: string) => ({
                            opacity: 0,
                            y:
                              motionSafe && openedId === channel.id
                                ? distances.step
                                : 0,
                            transition: exitFor(durations.fast),
                          }),
                        }}
                        exit="exit"
                        transition={
                          motionSafe ? { ...springs.snap, opacity: FADE } : FADE
                        }
                      >
                        <svg
                          viewBox="0 0 16 16"
                          aria-hidden
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-3 shrink-0 text-signal"
                        >
                          <path d="m3 13 .8-3.2L10.6 3a1.4 1.4 0 0 1 2 2L5.8 11.8z" />
                        </svg>
                        <span className="shrink-0 font-medium text-signal">
                          Draft
                        </span>
                        <span className="min-w-0 truncate text-ink-2">
                          {firstWords(draft)}
                        </span>
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={activeChannel ? tabId(activeChannel.id) : undefined}
        className="flex flex-col rounded-3 border border-input bg-surface-0 focus-within:border-hairline-strong"
      >
        <div className="relative overflow-hidden">
          <textarea
            ref={fieldRef}
            value={text}
            rows={2}
            placeholder={placeholder}
            disabled={!activeChannel}
            aria-label={
              activeChannel ? `Message ${nameOf(activeChannel.id)}` : label
            }
            aria-describedby={hintId}
            onChange={(event) => writeDraft(activeId, event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                send();
              }
            }}
            className={cn(
              "block w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 outline-none placeholder:text-ink-3 disabled:opacity-60",
              arrival ? "text-transparent caret-foreground" : "text-foreground",
            )}
          />
          {/* The restored draft rides in on this layer while the textarea,
              already holding the same text, stays transparent underneath and
              takes over on settle — so the words land where the field draws
              them, with no second layout. */}
          {arrival ? (
            <motion.div
              key={arrival.key}
              aria-hidden
              initial={
                motionSafe ? { y: -distances.step, opacity: 0 } : { opacity: 0 }
              }
              animate={{ y: 0, opacity: 1 }}
              transition={
                motionSafe ? { ...springs.glide, opacity: FADE } : FADE
              }
              onAnimationComplete={() => setArrival(null)}
              className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2 text-sm leading-5 wrap-break-word whitespace-pre-wrap text-foreground"
            >
              {arrival.text}
            </motion.div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-hairline py-1.5 pr-1.5 pl-3">
          {/* Short enough to sit whole at the 342px column; the full sentence
              is the textarea's description, so nothing is lost to the reader. */}
          <span
            aria-hidden
            className="min-w-0 font-mono text-[11px] text-ink-3"
          >
            Enter sends · Shift+Enter breaks
          </span>
          <button
            type="button"
            onClick={send}
            aria-disabled={canSend ? undefined : true}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity outline-none hover:opacity-90",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              !canSend && "opacity-40",
            )}
          >
            Send
          </button>
        </div>
      </div>

      <span id={hintId} className="sr-only">
        Enter sends, Shift+Enter breaks the line
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
