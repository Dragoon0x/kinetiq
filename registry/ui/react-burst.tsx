"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Reaction marks are drawn, never typed: one stroke path per reaction. */
export type BurstGlyph = "spark" | "agree" | "lift" | "watching" | "question";

const GLYPHS: Record<BurstGlyph, string> = {
  spark: "M8 2.6 9.5 6.5 13.4 8 9.5 9.5 8 13.4 6.5 9.5 2.6 8 6.5 6.5Z",
  agree: "m3.6 8.4 2.9 2.9 5.9-6.2",
  lift: "M8 12.8V4.2m0 0 3.2 3.2M8 4.2 4.8 7.4",
  watching:
    "M1.9 8S4.4 4.2 8 4.2 14.1 8 14.1 8 11.6 11.8 8 11.8 1.9 8 1.9 8Zm6.1 0a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0Z",
  question: "M5.9 6a2.1 2.1 0 1 1 2.7 2c-.5.2-.6.6-.6 1v.5M8 12.2v.1",
};

export type ReactionTally = {
  /** Stable identity — what `onReact` reports and what `mine` holds. */
  id: string;
  /** The word under the mark: "Spark", "Agree". Reactions are named, not shaped. */
  label: string;
  /** Which stroke mark to draw. @default "spark" */
  glyph?: BurstGlyph;
  /** Everyone else on this reaction. Never you — `mine` carries that. */
  people: string[];
};

export type ReactBurstProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The seeded tallies, in the order they should sit. */
  reactions: ReactionTally[];
  /** Controlled list of reaction ids you have taken. */
  mine?: string[];
  /** Initial list for uncontrolled usage. @default [] */
  defaultMine?: string[];
  /** Fires with the whole next list on every press. */
  onMineChange?: (mine: string[]) => void;
  /** Fires with the reaction pressed and whether it is now yours. */
  onReact?: (id: string, reacted: boolean) => void;
  /** Names printed before the card says "and 4 more". @default 3 */
  maxNames?: number;
  /** Holds every chip; the row stays readable. @default false */
  disabled?: boolean;
  /** Names the row, e.g. "Reactions on Marta's message". */
  label: string;
  className?: string;
};

type Pulse = { id: string; kind: "add" | "drop"; nonce: number };

/** "Marta, Rui and you" — the same words the chip's own label carries. */
const nameList = (
  people: string[],
  mine: boolean,
  maxNames: number,
): string => {
  const all = mine ? [...people, "you"] : people;
  const shown = all.slice(0, Math.max(1, maxNames));
  const rest = all.length - shown.length;
  const last = shown[shown.length - 1] ?? "";
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length <= 1) return last;
  return `${shown.slice(0, -1).join(", ")} and ${last}`;
};

/**
 * Reactions that land like something dropped. Taking a reaction bursts its mark
 * — `[1.32, 1]` on `recoil`, exactly two keyframes driven imperatively so the
 * spring cannot silently drop a middle frame — while a ring the size of the
 * chip expands and drains on the exit ease and the count rolls in a single grid
 * cell, the outgoing digit leaving as the incoming one arrives.
 *
 * Withdrawing is deliberately not a celebration: the mark shrinks `[0.86, 1]`
 * on `flick`, no ring, and a chip whose count reaches zero leaves on the exit
 * ease while the row re-flows on `glide`. Hovering or focusing a chip raises a
 * card that reads who reacted; the same sentence is already in the chip's
 * `aria-label`, so nothing is hover-only and nobody waits for a pointer.
 *
 * Under reduced motion the mark holds still and the chip's fill swaps on a
 * tween — but the count still rolls, because a count is information.
 */
export function ReactBurst({
  ref,
  reactions,
  mine,
  defaultMine = [],
  onMineChange,
  onReact,
  maxNames = 3,
  disabled = false,
  label,
  className,
}: ReactBurstProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(defaultMine);
  const takenList = mine ?? uncontrolled;
  const taken = React.useMemo(() => new Set(takenList), [takenList]);

  const [pulse, setPulse] = React.useState<Pulse | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [reading, setReading] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);

  const nonceRef = React.useRef(0);
  const refocusRef = React.useRef<number | null>(null);
  const chipRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const markRefs = React.useRef(new Map<string, HTMLSpanElement>());

  const visible = React.useMemo(
    () =>
      reactions
        .map((reaction) => {
          const isMine = taken.has(reaction.id);
          return {
            ...reaction,
            mine: isMine,
            count: reaction.people.length + (isMine ? 1 : 0),
          };
        })
        .filter((reaction) => reaction.count > 0),
    [reactions, taken],
  );

  const ids = visible.map((reaction) => reaction.id);
  const known = focusId === null ? -1 : ids.indexOf(focusId);
  const currentIndex = known === -1 ? 0 : known;

  // A burst is a press, not a count change: the nonce re-fires it even when the
  // same chip is taken twice, and the spring runs on the mark's own node so the
  // chip's own colour tween never fights it for the same style.
  React.useEffect(() => {
    if (!pulse || !motionSafe) return;
    const node = markRefs.current.get(pulse.id);
    if (!node) return;
    const controls = animate(
      node,
      { scale: pulse.kind === "add" ? [1.32, 1] : [0.86, 1] },
      pulse.kind === "add" ? springs.recoil : springs.flick,
    );
    return () => controls.stop();
  }, [pulse, motionSafe]);

  // Withdrawing the last of a reaction takes its chip out of the row, so focus
  // is walked to the neighbour rather than dropped on the document. Focusing
  // the chip is enough: its own onFocus is what moves the roving tab stop, so
  // this effect writes to the DOM and never to state.
  React.useEffect(() => {
    const wanted = refocusRef.current;
    refocusRef.current = null;
    if (wanted === null || visible.length === 0) return;
    const index = Math.min(visible.length - 1, Math.max(0, wanted));
    const id = visible[index]?.id;
    if (!id) return;
    chipRefs.current.get(id)?.focus({ preventScroll: true });
  }, [visible]);

  const toggle = (id: string, index: number) => {
    if (disabled) return;
    const reaction = reactions.find((item) => item.id === id);
    if (!reaction) return;
    const nowMine = !taken.has(id);
    const next = nowMine
      ? [...takenList, id]
      : takenList.filter((item) => item !== id);
    const count = reaction.people.length + (nowMine ? 1 : 0);

    if (mine === undefined) setUncontrolled(next);
    onMineChange?.(next);
    onReact?.(id, nowMine);

    nonceRef.current += 1;
    setPulse({ id, kind: nowMine ? "add" : "drop", nonce: nonceRef.current });
    // Frozen at the press: a host that edits the tallies afterwards cannot make
    // the region read a sentence that was true a moment ago.
    setAnnounce(
      nowMine
        ? `${reaction.label} now ${count}, you reacted`
        : count === 0
          ? `${reaction.label} withdrawn, no reactions left`
          : `${reaction.label} now ${count}, reaction withdrawn`,
    );
    if (count === 0) refocusRef.current = index;
  };

  const moveTo = (index: number) => {
    const clamped = Math.min(ids.length - 1, Math.max(0, index));
    const id = ids[clamped];
    if (!id) return;
    setFocusId(id);
    chipRefs.current.get(id)?.focus({ preventScroll: true });
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(ids.length - 1);
    }
  };

  const card = visible.find((reaction) => reaction.id === reading);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  // The card opens under the chips in the component's own flow. Floating it
  // above the row put it over whatever the host had written there — a message,
  // in every thread this belongs to. Its height is measured from its content
  // and never reserved, so a row nobody is reading is exactly the chips.
  const [cardNode, setCardNode] = React.useState<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = React.useState(0);
  React.useEffect(() => {
    if (!cardNode) return;
    const observer = new ResizeObserver(() =>
      setCardHeight(cardNode.offsetHeight),
    );
    observer.observe(cardNode);
    return () => observer.disconnect();
  }, [cardNode]);

  return (
    <div
      ref={ref}
      className={cn("relative flex w-full flex-col", className)}
      onPointerLeave={() => setReading(null)}
    >
      <ul role="list" aria-label={label} className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {visible.map((reaction, index) => {
            const names = nameList(reaction.people, reaction.mine, maxNames);
            const dropping =
              pulse?.id === reaction.id && pulse.kind === "drop" && motionSafe;
            return (
              <motion.li
                key={reaction.id}
                layout={motionSafe}
                initial={
                  motionSafe ? { opacity: 0, scale: 0.86 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.8 : 1,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe ? { ...springs.glide, opacity: fade } : fade
                }
                className="flex"
              >
                <button
                  type="button"
                  ref={(node) => {
                    if (node) chipRefs.current.set(reaction.id, node);
                    else chipRefs.current.delete(reaction.id);
                  }}
                  aria-pressed={reaction.mine}
                  aria-disabled={disabled ? true : undefined}
                  tabIndex={index === currentIndex ? 0 : -1}
                  aria-label={`${reaction.label}, ${reaction.count} ${
                    reaction.count === 1 ? "person" : "people"
                  }: ${names}. ${
                    reaction.mine ? "Press to withdraw." : "Press to react."
                  }`}
                  onClick={() => toggle(reaction.id, index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  onFocus={() => {
                    setFocusId(reaction.id);
                    setReading(reaction.id);
                  }}
                  onBlur={() =>
                    setReading((prev) => (prev === reaction.id ? null : prev))
                  }
                  onPointerEnter={() => setReading(reaction.id)}
                  className={cn(
                    "relative flex h-7 items-center gap-1.5 rounded-full border px-2 transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    reaction.mine
                      ? "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline-strong bg-surface-1 text-ink-2 hover:bg-accent hover:text-foreground",
                    disabled && "pointer-events-none opacity-60",
                  )}
                >
                  {/* The ring is inset on the chip, so it is sized by the chip
                      rather than by a number that would drift from it. */}
                  <AnimatePresence initial={false}>
                    {motionSafe &&
                    pulse?.id === reaction.id &&
                    pulse.kind === "add" ? (
                      <motion.span
                        key={pulse.nonce}
                        aria-hidden
                        initial={{ opacity: 0.55, scale: 0.7 }}
                        animate={{ opacity: 0, scale: 1.25 }}
                        exit={{ opacity: 0, transition: { duration: 0 } }}
                        transition={{
                          duration: durations.slow,
                          ease: easings.exit,
                        }}
                        className="pointer-events-none absolute inset-0 rounded-full border border-cobalt-bright"
                      />
                    ) : null}
                  </AnimatePresence>

                  <span
                    ref={(node) => {
                      if (node) markRefs.current.set(reaction.id, node);
                      else markRefs.current.delete(reaction.id);
                    }}
                    aria-hidden
                    className="flex size-4 shrink-0 items-center justify-center"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={GLYPHS[reaction.glyph ?? "spark"]} />
                    </svg>
                  </span>

                  <span aria-hidden className="grid overflow-hidden">
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={reaction.count}
                        initial={
                          motionSafe
                            ? {
                                opacity: 0,
                                y: dropping ? distances.step : -distances.step,
                              }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        exit={
                          motionSafe
                            ? {
                                opacity: 0,
                                y: dropping ? -distances.step : distances.step,
                                transition: exitFor(durations.fast),
                              }
                            : { opacity: 0, transition: { duration: 0 } }
                        }
                        transition={
                          motionSafe
                            ? { ...springs.snap, opacity: fade }
                            : { duration: durations.blink, ease: easings.enter }
                        }
                        className="col-start-1 row-start-1 text-center font-mono text-[11px] leading-4 tabular-nums"
                      >
                        {reaction.count}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <motion.div
        aria-hidden
        className="overflow-hidden"
        initial={false}
        animate={{ height: card ? cardHeight : 0 }}
        transition={motionSafe ? springs.snap : { duration: durations.fast }}
      >
        <div ref={setCardNode} className="pt-1.5">
          <motion.div
            className="w-fit max-w-full rounded-2 border border-hairline bg-surface-2 px-2 py-1 text-[11px] leading-4 text-ink-2"
            initial={false}
            animate={{ opacity: card ? 1 : 0 }}
            transition={fade}
          >
            <span className="font-medium text-ink">
              {card?.label ?? reactions[0]?.label ?? ""}
            </span>
            {card ? ` · ${nameList(card.people, card.mine, maxNames)}` : ""}
          </motion.div>
        </div>
      </motion.div>

      {visible.length === 0 ? (
        <p className="text-[11px] leading-7 text-ink-3">No reactions yet</p>
      ) : null}

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
