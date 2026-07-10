"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** The pivot's two detents: facing the wall, or turned into a room. */
const WALL_DEG = 0;
const ROOM_DEG = -90;
/** The room face's parked local offset — it arrives at 0 when the assembly reaches ROOM_DEG. */
const ROOM_LOCAL_DEG = 90;

export type PivotCard = {
  /** Stable identity — reported by `onEnter` and used as the React key. */
  id: string;
  /** Card label, also the mono HUD readout and the default room heading. */
  label: string;
  /** Wall-face content under the label. */
  node?: React.ReactNode;
  /** Room-face content once entered. Falls back to the label + node. */
  room?: React.ReactNode;
};

export type PivotGridProps = {
  /** The wall roster, in tab and reading order. */
  cards: PivotCard[];
  /** Grid columns on the wall. @default 3 */
  columns?: number;
  /** Fires the entered card's id on enter, `null` on return. Deduped. */
  onEnter?: (id: string | null) => void;
  /** Stage height, px. @default 300 */
  height?: number;
  className?: string;
  /** Accessible name for the wall grid. */
  "aria-label"?: string;
};

/**
 * A card wall on a real CSS-3D hinge: picking a card pivots the whole
 * assembly a quarter turn so you round a corner into that card's room.
 *
 * THE CHASSIS — one `preserve-3d` element (the assembly) carries a single
 * motion value, `rotateY`, sprung between two detents: 0 facing the wall,
 * -90 turned into the room. Both faces are the assembly's direct children,
 * each `backface-visibility: hidden` so an edge-on face never shows its
 * reverse. The wall face parks at local `rotateY(0)`; the room face parks
 * pre-rotated at local `rotateY(90)`, so as the assembly sweeps 0 → -90 the
 * wall's effective angle runs 0 → -90 (swinging away, then edge-on) while
 * the room's runs 90 → 0 (swinging in to face the viewer) — one hinge, two
 * faces, opposite arcs. The outer stage alone carries `perspective`; no
 * overflow, filter, or backdrop-blur ever touches the assembly or its faces
 * (Safari flattens a 3D chain under any of the three).
 *
 * ENTER/RETURN — clicking a wall card (or pressing Enter on it) drives the
 * pivot to -90 on `springs.glide` and stamps that card as entered; Escape,
 * or the room's back affordance, drives it back to 0. Only one room shows
 * at a time. The non-facing face is `inert` and `aria-hidden` so a mid-swing
 * or parked face can never be focused or read, and `onEnter` fires the
 * entered id (or `null` on return), deduped against the last value reported
 * so redundant settles stay quiet.
 *
 * FOCUS — entering moves focus to the room's back button; returning moves
 * it to the card that was entered, both via a single rAF (cancelled on
 * re-schedule and unmount) so the newly-visible face's DOM already exists.
 * A polite live region announces "Entered <label>" / "Back to the wall".
 *
 * Reduced motion drops the 3D entirely: the wall grid and the room panel
 * swap instantly, same callbacks, same focus moves, same announcements.
 */
export function PivotGrid({
  cards,
  columns = 3,
  onEnter,
  height = 300,
  className,
  "aria-label": ariaLabel = "Room wall",
}: PivotGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [enteredId, setEnteredId] = React.useState<string | null>(null);
  // The room face keeps painting the last-entered card through the return
  // swing (never cleared on return) so it doesn't go blank mid-turn; only
  // `enteredId` — cleared immediately — drives aria/inert/focus/dedup.
  const [displayedId, setDisplayedId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const pivot = useMotionValue(WALL_DEG);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);
  const focusRafRef = React.useRef(0);

  const cardRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const backRef = React.useRef<HTMLButtonElement>(null);

  // Nothing may outlive the component: an in-flight pivot stops on unmount,
  // and a scheduled focus move never lands after teardown.
  React.useEffect(() => {
    return () => {
      for (const controls of controlsRef.current) controls.stop();
      controlsRef.current = [];
      cancelAnimationFrame(focusRafRef.current);
    };
  }, []);

  const registerCard = (id: string, element: HTMLButtonElement | null) => {
    if (element) cardRefs.current.set(id, element);
    else cardRefs.current.delete(id);
  };

  const drivePivot = (target: number) => {
    for (const controls of controlsRef.current) controls.stop();
    if (motionSafe) {
      controlsRef.current = [animate(pivot, target, springs.glide)];
    } else {
      controlsRef.current = [];
      pivot.jump(target);
    }
  };

  const enter = (card: PivotCard) => {
    if (enteredId === card.id) return;
    setEnteredId(card.id);
    setDisplayedId(card.id);
    setAnnouncement(`Entered ${card.label}`);
    onEnter?.(card.id);
    drivePivot(ROOM_DEG);
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      backRef.current?.focus();
    });
  };

  const returnToWall = () => {
    if (enteredId === null) return;
    const cameFrom = enteredId;
    setEnteredId(null);
    setAnnouncement("Back to the wall");
    onEnter?.(null);
    drivePivot(WALL_DEG);
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      cardRefs.current.get(cameFrom)?.focus();
    });
  };

  const handleWallKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || enteredId === null) return;
    event.preventDefault();
    returnToWall();
  };

  const enteredCard = cards.find((card) => card.id === enteredId) ?? null;
  // What the room face paints — persists through the return swing so it
  // never goes blank mid-turn; harmless once inert/aria-hidden takes over.
  const displayedCard = cards.find((card) => card.id === displayedId) ?? null;
  const hudLabel = enteredCard ? enteredCard.label : "WALL";

  if (!motionSafe) {
    return (
      <PivotFlat
        cards={cards}
        columns={columns}
        height={height}
        enteredCard={enteredCard}
        hudLabel={hudLabel}
        announcement={announcement}
        className={className}
        ariaLabel={ariaLabel}
        onEnterCard={enter}
        onReturn={returnToWall}
        registerCard={registerCard}
        backRef={backRef}
      />
    );
  }

  return (
    <div
      onKeyDown={handleWallKeyDown}
      className={cn("relative w-full overflow-hidden rounded-3", className)}
      style={{ height, perspective: perspectives.base }}
    >
      {/* THE ASSEMBLY — the only preserve-3d element; no clip/filter here. */}
      <motion.div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          rotateY: pivot,
          willChange: "transform",
        }}
      >
        {/* WALL face — parked at local 0deg. No clip here: the outer stage
            (a non-3D wrapper) is the only element in the chain allowed to. */}
        <div
          aria-hidden={enteredId !== null || undefined}
          inert={enteredId !== null}
          className="absolute inset-0 rounded-3 border border-hairline bg-surface-1"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div
            role="group"
            aria-label={ariaLabel}
            className="grid h-full gap-2 p-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {cards.map((card) => (
              <button
                key={card.id}
                ref={(element) => registerCard(card.id, element)}
                type="button"
                id={`${baseId}-card-${card.id}`}
                tabIndex={enteredId === null ? 0 : -1}
                onClick={() => enter(card)}
                className="focus-visible:ring-cobalt-bright/60 flex flex-col items-center justify-center gap-1 rounded-2 border border-hairline-strong bg-surface-2 p-2 text-center outline-none transition-colors hover:border-hairline-strong hover:bg-surface-2/70 focus-visible:ring-2"
              >
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink">
                  {card.label}
                </span>
                {card.node ? (
                  <span className="text-ink-3 text-[10px] leading-tight">
                    {card.node}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* ROOM face — parked pre-rotated at local 90deg, arrives at 0. */}
        <div
          aria-hidden={enteredId === null || undefined}
          inert={enteredId === null}
          className="absolute inset-0 rounded-3 border border-hairline bg-surface-1"
          style={{
            transform: `rotateY(${ROOM_LOCAL_DEG}deg)`,
            backfaceVisibility: "hidden",
          }}
        >
          {displayedCard ? (
            <RoomPanel card={displayedCard} onBack={returnToWall} backRef={backRef} />
          ) : null}
        </div>
      </motion.div>

      {/* HUD — mono readout, decorative only; the live region carries meaning. */}
      <div
        aria-hidden
        className="border-hairline bg-surface-0/70 text-ink-3 pointer-events-none absolute bottom-2 left-2 rounded-2 border px-2 py-1 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap"
      >
        {`VIEW · ${hudLabel.toUpperCase()}`}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type RoomPanelProps = {
  card: PivotCard;
  onBack: () => void;
  backRef: React.RefObject<HTMLButtonElement | null>;
};

/** The entered card's room: full-frame content plus a back affordance. */
function RoomPanel({ card, onBack, backRef }: RoomPanelProps) {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-ink font-mono text-xs tracking-[0.08em]">
          {card.label}
        </p>
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className="focus-visible:ring-cobalt-bright/60 rounded-2 border border-hairline-strong bg-surface-2 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 outline-none transition-colors hover:text-ink focus-visible:ring-2"
        >
          BACK
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto text-sm text-ink-2">
        {card.room ?? (
          <div className="flex flex-col gap-1">
            <p>{card.label}</p>
            {card.node}
          </div>
        )}
      </div>
    </div>
  );
}

type PivotFlatProps = {
  cards: PivotCard[];
  columns: number;
  height: number;
  enteredCard: PivotCard | null;
  hudLabel: string;
  announcement: string;
  className: string | undefined;
  ariaLabel: string;
  onEnterCard: (card: PivotCard) => void;
  onReturn: () => void;
  registerCard: (id: string, element: HTMLButtonElement | null) => void;
  backRef: React.RefObject<HTMLButtonElement | null>;
};

/** Reduced motion: an instant flat swap between the wall grid and the room panel. */
function PivotFlat({
  cards,
  columns,
  height,
  enteredCard,
  hudLabel,
  announcement,
  className,
  ariaLabel,
  onEnterCard,
  onReturn,
  registerCard,
  backRef,
}: PivotFlatProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !enteredCard) return;
    event.preventDefault();
    onReturn();
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className={cn(
        "border-hairline bg-surface-1 relative overflow-hidden rounded-3 border",
        className,
      )}
      style={{ minHeight: height }}
    >
      {enteredCard ? (
        <RoomPanel card={enteredCard} onBack={onReturn} backRef={backRef} />
      ) : (
        <div
          role="group"
          aria-label={ariaLabel}
          className="grid gap-2 p-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cards.map((card) => (
            <button
              key={card.id}
              ref={(element) => registerCard(card.id, element)}
              type="button"
              onClick={() => onEnterCard(card)}
              className="focus-visible:ring-cobalt-bright/60 flex flex-col items-center justify-center gap-1 rounded-2 border border-hairline-strong bg-surface-2 p-2 text-center outline-none transition-colors hover:bg-surface-2/70 focus-visible:ring-2"
            >
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink">
                {card.label}
              </span>
              {card.node ? (
                <span className="text-ink-3 text-[10px] leading-tight">
                  {card.node}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      <div
        aria-hidden
        className="border-hairline bg-surface-0/70 text-ink-3 pointer-events-none absolute bottom-2 left-2 rounded-2 border px-2 py-1 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap"
      >
        {`VIEW · ${hudLabel.toUpperCase()}`}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
