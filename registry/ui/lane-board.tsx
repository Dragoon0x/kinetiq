"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LaneCard = {
  id: string;
  title: string;
  /** Short trailing note — an owner, an estimate, a label. */
  tag?: string;
};

export type BoardLane = {
  id: string;
  title: string;
  cards: LaneCard[];
};

export type LaneBoardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Seeds the board; it owns card placement after that and reports via onMove. */
  lanes: BoardLane[];
  /** Fires on a drop or a keyboard move, with the index the card landed on. */
  onMove?: (cardId: string, toLane: string, index: number) => void;
  /** Visible board label. Omit it and pass `aria-label` to name it invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** Three lanes fit the doc column; on a 342px phone the third is a scroll
 *  away under a fade. */
const LANE_W = 132;
const LANE_GAP = 8;
/** Travel before a press becomes a drag, so the card's own click still lands. */
const DRAG_SLOP = 4;

/** Capture throws on a synthetic pointer id; the drag works without it. */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // No live pointer to capture — the drag continues unconfined.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

/**
 * Lane bands and card midlines, frozen at the moment the drag engages — so the
 * placeholder cannot chase the very cards it is displacing.
 */
type LaneSnap = { id: string; left: number; right: number; mids: number[] };

const hitLane = (snaps: LaneSnap[], x: number, y: number) => {
  let lane: LaneSnap | undefined;
  let nearest = Number.POSITIVE_INFINITY;
  for (const snap of snaps) {
    const distance =
      x < snap.left ? snap.left - x : x > snap.right ? x - snap.right : 0;
    if (distance < nearest) {
      nearest = distance;
      lane = snap;
    }
  }
  if (!lane) return null;
  return { laneId: lane.id, index: lane.mids.filter((mid) => mid < y).length };
};

type Row =
  { kind: "slot" } | { kind: "card"; card: LaneCard; cardIndex: number };

/**
 * A board whose columns make room. Lifting a card takes it out of its lane on
 * `flick` — the scale and the raised edge land in about a tenth of a second, so
 * the lift reads as the grab itself — and the lane under the pointer opens a
 * placeholder of exactly that card's height, which travels between lanes on
 * `glide` while the cards around it re-flow. Letting go settles the card from
 * where the hand left it into the slot on `snap`, and both lanes' counts roll.
 *
 * The pointer is captured only after 4px of travel: capturing on pointerdown
 * would swallow the click that opens a card's move menu. The drop target is
 * read from lane bands measured once, as the drag engages, so it stays steady
 * instead of hunting between two slots at the boundary.
 *
 * Every card is a menu button. Enter or Space opens its four moves — a lane
 * left, a lane right, a place up, a place down — arrow keys walk them past the
 * ones that are unavailable, Escape closes, and every landing is announced
 * politely. Lanes scroll sideways under edge fades on a phone. Under reduced
 * motion nothing travels: the card stays put and marked while the placeholder
 * shows where it will land, because the place is the information.
 */
export function LaneBoard({
  ref,
  lanes,
  onMove,
  label,
  className,
  "aria-label": ariaLabel,
}: LaneBoardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;

  const [board, setBoard] = React.useState<BoardLane[]>(lanes);
  const [drag, setDrag] = React.useState<{
    cardId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    toLane: string;
    toIndex: number;
  } | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const [menuIndex, setMenuIndex] = React.useState(0);
  const [landing, setLanding] = React.useState<{
    cardId: string;
    dx: number;
    dy: number;
  } | null>(null);
  const [refocus, setRefocus] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const dragRef = React.useRef<{
    cardId: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
    snaps: LaneSnap[];
    engaged: boolean;
  } | null>(null);
  const suppressClick = React.useRef(false);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const stackRefs = React.useRef(new Map<string, HTMLUListElement | null>());
  const cardRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const floatRef = React.useRef<HTMLDivElement | null>(null);
  const slotRef = React.useRef<HTMLLIElement | null>(null);
  const menuRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // A card that has changed lane unmounts from one list and mounts in another,
  // so the node under the ref is new by the time focus can be restored — which
  // is exactly why this runs after the commit and not in the handler.
  React.useEffect(() => {
    if (!refocus) return;
    cardRefs.current.get(refocus.id)?.focus();
  }, [refocus]);

  React.useEffect(() => {
    if (!menuFor) return;
    menuRefs.current[menuIndex]?.focus();
  }, [menuFor, menuIndex]);

  // Edge fades appear only where there is more board to reach; the observer
  // fires once on observe, so the first paint is already correct.
  const [edges, setEdges] = React.useState({ start: false, end: false });
  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const overflow = node.scrollWidth - node.clientWidth;
      setEdges((prev) => {
        const next = {
          start: node.scrollLeft > 1,
          end: node.scrollLeft < overflow - 1,
        };
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    };
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  const findCard = (cardId: string) => {
    for (const lane of board) {
      const card = lane.cards.find((entry) => entry.id === cardId);
      if (card) return { lane, card };
    }
    return null;
  };

  const applyMove = (cardId: string, toLane: string, index: number) => {
    const found = findCard(cardId);
    if (!found) return;
    const next = board.map((lane) => ({
      ...lane,
      cards: lane.cards.filter((entry) => entry.id !== cardId),
    }));
    const target = next.find((lane) => lane.id === toLane);
    if (!target) return;
    const at = Math.min(Math.max(index, 0), target.cards.length);
    target.cards.splice(at, 0, found.card);
    setBoard(next);
    // Reported from the handler that caused it — a parent callback fired from
    // inside an updater would run during another component's render.
    onMove?.(cardId, toLane, at);
    setAnnouncement(
      `${found.card.title} moved to ${target.title}, position ${at + 1} of ${
        target.cards.length
      }.`,
    );
  };

  const startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    cardId: string,
  ) => {
    // A second finger must not steal a drag already under way.
    if (event.button !== 0 || dragRef.current?.engaged) return;
    // Cleared here rather than in the click that may never arrive: a card that
    // changes lane is a new element, and the click lands on nothing.
    suppressClick.current = false;
    const frame = frameRef.current?.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left - (frame?.left ?? 0),
      originY: rect.top - (frame?.top ?? 0),
      width: rect.width,
      height: rect.height,
      snaps: [],
      engaged: false,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const grip = dragRef.current;
    if (!grip || grip.pointerId !== event.pointerId) return;
    const dx = event.clientX - grip.startX;
    const dy = event.clientY - grip.startY;
    if (!grip.engaged) {
      if (Math.abs(dx) <= DRAG_SLOP && Math.abs(dy) <= DRAG_SLOP) return;
      grip.engaged = true;
      grip.snaps = board.map((lane) => {
        const rect = stackRefs.current.get(lane.id)?.getBoundingClientRect();
        return {
          id: lane.id,
          left: rect?.left ?? 0,
          right: rect?.right ?? 0,
          mids: lane.cards
            .filter((card) => card.id !== grip.cardId)
            .map((card) => {
              const box = cardRefs.current
                .get(card.id)
                ?.getBoundingClientRect();
              return box ? box.top + box.height / 2 : 0;
            }),
        };
      });
      setMenuFor(null);
      capturePointer(event.currentTarget, event.pointerId);
    }
    const hit = hitLane(grip.snaps, event.clientX, event.clientY);
    if (!hit) return;
    setDrag({
      cardId: grip.cardId,
      x: grip.originX + dx,
      y: grip.originY + dy,
      width: grip.width,
      height: grip.height,
      toLane: hit.laneId,
      toIndex: hit.index,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const grip = dragRef.current;
    releasePointer(event.currentTarget, event.pointerId);
    dragRef.current = null;
    const held = drag;
    setDrag(null);
    if (!grip?.engaged || !held) return;
    suppressClick.current = true;
    // The empty slot is still in the DOM: measuring it now is what lets the
    // card travel from the hand to the place instead of blinking into it.
    const from = floatRef.current?.getBoundingClientRect();
    const to = slotRef.current?.getBoundingClientRect();
    setLanding(
      motionSafe && from && to
        ? {
            cardId: held.cardId,
            dx: from.left - to.left,
            dy: from.top - to.top,
          }
        : null,
    );
    applyMove(held.cardId, held.toLane, held.toIndex);
  };

  const cancelDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    dragRef.current = null;
    setDrag(null);
  };

  const movesFor = (laneIndex: number, cardIndex: number, cardId: string) => {
    const lane = board[laneIndex];
    const left = board[laneIndex - 1];
    const right = board[laneIndex + 1];
    return [
      {
        key: "left",
        label: "Lane left",
        enabled: !!left,
        run: () =>
          left &&
          applyMove(cardId, left.id, Math.min(cardIndex, left.cards.length)),
      },
      {
        key: "right",
        label: "Lane right",
        enabled: !!right,
        run: () =>
          right &&
          applyMove(cardId, right.id, Math.min(cardIndex, right.cards.length)),
      },
      {
        key: "up",
        label: "Move up",
        enabled: cardIndex > 0,
        run: () => lane && applyMove(cardId, lane.id, cardIndex - 1),
      },
      {
        key: "down",
        label: "Move down",
        enabled: cardIndex < (lane?.cards.length ?? 0) - 1,
        run: () => lane && applyMove(cardId, lane.id, cardIndex + 1),
      },
    ];
  };

  type Move = ReturnType<typeof movesFor>[number];

  const bumpFocus = (cardId: string) =>
    setRefocus({ id: cardId, n: (refocus?.n ?? 0) + 1 });

  const openMenu = (cardId: string, moves: Move[]) => {
    const first = moves.findIndex((move) => move.enabled);
    if (first === -1) return;
    setMenuIndex(first);
    setMenuFor(cardId);
  };

  const closeMenu = (cardId: string) => {
    setMenuFor(null);
    bumpFocus(cardId);
  };

  const runMove = (cardId: string, move: Move) => {
    setMenuFor(null);
    setLanding(null);
    move.run();
    bumpFocus(cardId);
  };

  const stepMenu = (moves: Move[], step: number) => {
    let next = menuIndex;
    for (let pass = 0; pass < moves.length; pass += 1) {
      next = (next + step + moves.length) % moves.length;
      if (moves[next]?.enabled) break;
    }
    setMenuIndex(next);
  };

  /** Under reduced motion the card is never in flight, so it stays in its lane
   *  and the placeholder alone shows where it would land. */
  const liftedId = drag && motionSafe ? drag.cardId : null;
  const shown = liftedId
    ? board.map((lane) => ({
        ...lane,
        cards: lane.cards.filter((card) => card.id !== liftedId),
      }))
    : board;
  const dragged = drag ? findCard(drag.cardId)?.card : undefined;
  const boardWidth = board.length * LANE_W + (board.length - 1) * LANE_GAP;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {label ? (
        <span id={labelId} className="truncate text-sm font-semibold">
          {label}
        </span>
      ) : null}

      <p id={hintId} className="sr-only">
        Press Enter to open this card&apos;s move menu, then arrow keys to pick
        a move and Escape to close.
      </p>

      <div ref={frameRef} className="relative">
        <div ref={scrollerRef} className="overflow-x-auto pb-1">
          <div
            role="group"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            className="flex items-start"
            style={{ minWidth: boardWidth, gap: LANE_GAP }}
          >
            {shown.map((lane, laneIndex) => {
              const isTarget = drag?.toLane === lane.id;
              const count = board[laneIndex]?.cards.length ?? 0;
              const rows: Row[] = lane.cards.map((card, cardIndex) => ({
                kind: "card",
                card,
                cardIndex,
              }));
              if (drag && isTarget) {
                rows.splice(Math.min(drag.toIndex, rows.length), 0, {
                  kind: "slot",
                });
              }

              return (
                <div
                  key={lane.id}
                  className="relative shrink-0"
                  style={{ width: LANE_W }}
                >
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute -inset-x-1.5 -top-1.5 -bottom-1.5 rounded-3 bg-cobalt-wash"
                    initial={false}
                    animate={{ opacity: isTarget ? 1 : 0 }}
                    transition={{ duration: durations.fast }}
                  />

                  <div className="relative mb-2 flex items-center gap-1.5">
                    <span
                      title={lane.title}
                      className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase"
                    >
                      {lane.title}
                    </span>
                    <span className="inline-flex h-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-2 px-1.5 font-mono text-[10px] tabular-nums">
                      <motion.span
                        key={count}
                        className="inline-block text-ink-2"
                        initial={motionSafe ? { y: -7 } : { opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      >
                        {count}
                      </motion.span>
                    </span>
                  </div>

                  <ul
                    ref={(node) => {
                      stackRefs.current.set(lane.id, node);
                    }}
                    aria-label={lane.title}
                    className="relative flex flex-col gap-1.5"
                  >
                    {rows.map((row) => {
                      if (row.kind === "slot") {
                        return (
                          <motion.li
                            key="slot"
                            ref={slotRef}
                            aria-hidden
                            layoutId={motionSafe ? `${uid}-slot` : undefined}
                            transition={springs.glide}
                            className="rounded-2 border border-dashed border-cobalt-bright/60 bg-cobalt-wash"
                            style={{ height: drag?.height }}
                          />
                        );
                      }

                      const { card, cardIndex } = row;
                      const moves = movesFor(laneIndex, cardIndex, card.id);
                      const open = menuFor === card.id;
                      const held = drag?.cardId === card.id;
                      const lands = landing?.cardId === card.id;

                      return (
                        <motion.li
                          key={card.id}
                          layout={motionSafe ? "position" : false}
                          transition={springs.glide}
                          className="relative"
                        >
                          {/* The landing offset rides an inner element: a
                              transform on the same node motion is FLIPping
                              would fight the layout projection. */}
                          <motion.div
                            initial={
                              lands && landing
                                ? { x: landing.dx, y: landing.dy }
                                : false
                            }
                            animate={{ x: 0, y: 0 }}
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          >
                            <button
                              ref={(node) => {
                                cardRefs.current.set(card.id, node);
                              }}
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={open}
                              aria-controls={
                                open ? `${uid}-menu-${card.id}` : undefined
                              }
                              aria-describedby={hintId}
                              aria-label={`${card.title}${
                                card.tag ? `, ${card.tag}` : ""
                              }, ${lane.title}, position ${cardIndex + 1} of ${
                                lane.cards.length
                              }`}
                              onClick={() => {
                                if (suppressClick.current) {
                                  suppressClick.current = false;
                                  return;
                                }
                                if (open) closeMenu(card.id);
                                else openMenu(card.id, moves);
                              }}
                              onPointerDown={(event) =>
                                startDrag(event, card.id)
                              }
                              onPointerMove={moveDrag}
                              onPointerUp={endDrag}
                              onPointerCancel={cancelDrag}
                              onLostPointerCapture={cancelDrag}
                              style={{ touchAction: "none" }}
                              className={cn(
                                "w-full cursor-grab rounded-2 border bg-surface-0 p-2 text-left transition-colors outline-none",
                                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                open || held
                                  ? "border-cobalt-bright"
                                  : "border-hairline hover:border-hairline-strong",
                              )}
                            >
                              <span className="block text-[11px] leading-snug font-medium text-foreground">
                                {card.title}
                              </span>
                              {card.tag ? (
                                <span className="mt-1.5 inline-flex h-4 items-center rounded-full border border-hairline bg-surface-2 px-1.5 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                                  {card.tag}
                                </span>
                              ) : null}
                            </button>
                          </motion.div>

                          {open ? (
                            <div
                              id={`${uid}-menu-${card.id}`}
                              role="menu"
                              aria-label={`Move ${card.title}`}
                              className="mt-1 grid grid-cols-2 gap-1"
                              onKeyDown={(event) => {
                                if (
                                  event.key === "ArrowRight" ||
                                  event.key === "ArrowDown"
                                ) {
                                  event.preventDefault();
                                  stepMenu(moves, 1);
                                } else if (
                                  event.key === "ArrowLeft" ||
                                  event.key === "ArrowUp"
                                ) {
                                  event.preventDefault();
                                  stepMenu(moves, -1);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  closeMenu(card.id);
                                } else if (event.key === "Tab") {
                                  setMenuFor(null);
                                }
                              }}
                            >
                              {moves.map((move, index) => (
                                <button
                                  key={move.key}
                                  ref={(node) => {
                                    menuRefs.current[index] = node;
                                  }}
                                  type="button"
                                  role="menuitem"
                                  tabIndex={index === menuIndex ? 0 : -1}
                                  disabled={!move.enabled}
                                  onClick={() => runMove(card.id, move)}
                                  className={cn(
                                    "flex h-7 items-center justify-center rounded-1 border border-hairline bg-surface-2 text-[10px] font-medium transition-colors outline-none",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                    move.enabled
                                      ? "text-ink-2 hover:bg-accent hover:text-accent-foreground"
                                      : "cursor-not-allowed text-ink-3 opacity-50",
                                  )}
                                >
                                  {move.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </motion.li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {edges.start ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-surface-1 to-surface-1/0"
          />
        ) : null}
        {edges.end ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-surface-1 to-surface-1/0"
          />
        ) : null}

        {drag && dragged && motionSafe ? (
          <motion.div
            ref={floatRef}
            aria-hidden
            className="pointer-events-none absolute z-40 overflow-hidden rounded-2 border border-cobalt-bright bg-surface-0 p-2 shadow-lg"
            style={{
              left: drag.x,
              top: drag.y,
              width: drag.width,
              height: drag.height,
            }}
            initial={{ scale: 1 }}
            animate={{ scale: 1.03 }}
            transition={springs.flick}
          >
            <span className="block text-[11px] leading-snug font-medium text-foreground">
              {dragged.title}
            </span>
          </motion.div>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
