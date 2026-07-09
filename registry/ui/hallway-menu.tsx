"use client";

import * as React from "react";

import { AnimatePresence, motion, useIsPresent, type Variants } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Hover-intent beat before a rail stop opens its corridor (fine pointers). */
const INTENT_MS = 80;
/** Grace window after the pointer leaves the whole component before closing. */
const GRACE_MS = 160;
/** How long the accent flash holds on a chosen door while the scene closes. */
const FLASH_MS = 260;
/** Wall-door hinge angle, degrees — left wall +, right wall mirrored −. */
const WALL_ANGLE = 48;
/** Hover/focus nudge toward the viewer, px of translateZ. */
const DOOR_NUDGE = 6;
/** Lateral travel of a swinging corridor scene, % of its width. */
const SWING_PCT = 14;
/** Wall-door plate footprint, % of stage width / height. */
const DOOR_WIDTH_PCT = 30;
const DOOR_HEIGHT_PCT = 62;
/** Component widths under this compress the walls to two doors each. */
const NARROW_WIDTH = 400;

/**
 * Recession table per wall rank (0 = nearest): inset from the outer edge
 * (% of stage width), plate scale, and resting ink. Deeper doors sit
 * closer to the centerline, smaller and dimmer — the one-point read.
 */
const WALL_RANKS = [
  { inset: 1.5, scale: 1, dim: 1 },
  { inset: 16, scale: 0.84, dim: 0.72 },
  { inset: 28.5, scale: 0.7, dim: 0.5 },
] as const;

export type HallwayItem = {
  /** Stable id, reported to onSelect. */
  id: string;
  /** Door label. */
  label: string;
  /** Optional mono annotation on the door plate. */
  hint?: string;
};

export type Hallway = {
  /** Stable id, reported to onSelect. */
  id: string;
  /** Rail-button and far-wall label. */
  label: string;
  items: HallwayItem[];
};

export type HallwayMenuProps = {
  /** The parallel hallways on the rail — designed for 2–5. */
  hallways: Hallway[];
  /** Fires when a door is chosen; the corridor closes after. */
  onSelect?: (hallwayId: string, itemId: string) => void;
  /** Corridor viewport height in px. Default 220. */
  corridorHeight?: number;
  className?: string;
  /** Accessible name for the nav landmark. Default "Hallway menu". */
  "aria-label"?: string;
};

type WallSide = "left" | "right";

type DoorSlot = { item: HallwayItem; side: WallSide; rank: number };

type Flash = { hallwayId: string; itemId: string };

/**
 * Distribute a hallway's items onto the walls. The first half (up to
 * `perWall`) marches down the LEFT wall near→far; the rest hang on the
 * RIGHT wall listed far→near, so array order is exactly the walk order:
 * left wall near→far, past the far wall, right wall far→near.
 */
const doorSlotsFor = (items: HallwayItem[], perWall: number): DoorSlot[] => {
  const shown = items.slice(0, perWall * 2);
  const leftCount = Math.min(perWall, Math.ceil(shown.length / 2));
  const left = shown.slice(0, leftCount);
  const right = shown.slice(leftCount);
  return [
    ...left.map((item, index) => ({
      item,
      side: "left" as const,
      rank: index,
    })),
    ...right.map((item, index) => ({
      item,
      side: "right" as const,
      rank: right.length - 1 - index,
    })),
  ];
};

const doorKey = (hallwayId: string, itemId: string): string =>
  `${hallwayId}::${itemId}`;

/**
 * A mega-menu as parallel hallways: the top rail is a row of hallway
 * buttons, and resting on one (fine pointers wait an 80ms intent beat;
 * keyboard focus is immediate) opens the corridor below — a one-point
 * perspective hallway under `perspective(perspectives.far)`, every plate
 * an independent flat transform (no preserve-3d, Safari-safe). The
 * hallway's items hang as door plates: up to three on the left wall
 * (rotateY +48°, hinged on the outer edge; each successive plate smaller,
 * nearer the centerline, dimmer), up to three mirrored on the right wall
 * (rotateY −48°), and a far-wall plate at the vanishing point carrying
 * the hallway label and true item count (aria-hidden — the live region
 * already tells that story). Two aria-hidden hairline strips, rotateX
 * tilted into ceiling and floor planes, converge on the same point.
 *
 * Sweeping along the rail swings the corridor: the outgoing scene shifts
 * laterally toward its own rail button and fades on `exitFor` (exits
 * never spring) while the incoming scene arrives from its side on
 * `springs.glide`. Direction is the rail-order delta, delivered through
 * AnimatePresence `custom`, so a scene already leaving re-aims when the
 * sweep reverses; a fresh open (and a close) fades with a step of y
 * instead of a swing. Hovering or focusing a door brightens it to full
 * ink (fast opacity tween) and nudges it 6px toward the viewer
 * (translateZ on `springs.snap`); choosing one fires
 * `onSelect(hallwayId, itemId)`, stamps a blink-tween accent flash that
 * rides the closing scene out, and hands focus back to the rail. The
 * pointer leaving the whole component (rail + corridor) starts a 160ms
 * grace timer before closing; re-entering cancels it. Escape closes and
 * restores focus to the open rail button; pressing pointer-down outside
 * closes too, so coarse pointers are never stranded. All timers (intent,
 * grace, flash) and the focus rAF are cleared on re-entry and unmount.
 *
 * Keyboard: rail buttons sit in the normal tab order with
 * `aria-expanded` + `aria-controls` on the corridor region; focusing one
 * opens its corridor (pointer-initiated focus is filtered so taps toggle
 * via click instead). ArrowDown moves focus onto the corridor's first
 * door. Inside, the doors form one wrapping walk in reading order —
 * LEFT WALL near→far, past the far wall, RIGHT WALL far→near — on
 * ArrowDown/ArrowRight forward and ArrowUp/ArrowLeft back, under a
 * roving tabindex; Enter or Space selects, Escape returns to the rail.
 * An sr-only polite region announces "<label> hallway, N doors" on every
 * open and swing. A scene animating out marks itself inert
 * (useIsPresent), so a mid-swing corridor can never be clicked or read.
 *
 * Below ~400px of component width the walls compress to two doors each
 * (ResizeObserver-driven; the walk and announcements follow the rendered
 * doors). Reduced motion trades the corridor for a flat panel — hallway
 * label plus a two-column list of every item — swapping on duration-fast
 * opacity with no swing and no perspective, keyboard and announcements
 * identical.
 */
export function HallwayMenu({
  hallways,
  onSelect,
  corridorHeight = 220,
  className,
  "aria-label": ariaLabel = "Hallway menu",
}: HallwayMenuProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const corridorId = `${baseId}-corridor`;

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [direction, setDirection] = React.useState(0);
  const [roving, setRoving] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<Flash | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const navRef = React.useRef<HTMLElement | null>(null);
  const railRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const doorRefs = React.useRef(new Map<string, HTMLButtonElement>());
  /** Mirror of openId for timers and handlers — never read in render. */
  const openRef = React.useRef<string | null>(null);
  /** True between a rail pointerdown and its click — that focus must not open. */
  const pointerFocusRef = React.useRef(false);
  /** True while we hand focus back to the rail, so onFocus does not reopen. */
  const suppressOpenRef = React.useRef(false);
  const intentTimerRef = React.useRef(0);
  const leaveTimerRef = React.useRef(0);
  const flashTimerRef = React.useRef(0);
  const focusRafRef = React.useRef(0);

  const perWall = narrow ? 2 : 3;

  const openHallway = hallways.find((hallway) => hallway.id === openId);
  const openDoors: HallwayItem[] = openHallway
    ? motionSafe
      ? doorSlotsFor(openHallway.items, perWall).map((slot) => slot.item)
      : openHallway.items
    : [];
  const rovingId = openDoors.some((item) => item.id === roving)
    ? roving
    : (openDoors[0]?.id ?? null);

  /** Walls compress to two doors each under NARROW_WIDTH of component. */
  React.useEffect(() => {
    const node = navRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setNarrow(width > 0 && width < NARROW_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const closeCorridor = React.useCallback(() => {
    if (openRef.current === null) return;
    openRef.current = null;
    window.clearTimeout(intentTimerRef.current);
    setDirection(0);
    setOpenId(null);
  }, []);

  /** Open (or swing to) a hallway; direction is the rail-order delta. */
  const openCorridor = (id: string) => {
    window.clearTimeout(leaveTimerRef.current);
    const previous = openRef.current;
    if (previous === id) return;
    const to = hallways.findIndex((hallway) => hallway.id === id);
    const hallway = hallways[to];
    if (!hallway) return;
    const from =
      previous === null
        ? -1
        : hallways.findIndex((candidate) => candidate.id === previous);
    openRef.current = id;
    setDirection(from === -1 ? 0 : to > from ? 1 : -1);
    setOpenId(id);
    setRoving(null);
    // Re-entry hygiene: a still-pending flash never leaks into a new scene.
    window.clearTimeout(flashTimerRef.current);
    setFlash(null);
    const count = motionSafe
      ? doorSlotsFor(hallway.items, perWall).length
      : hallway.items.length;
    setAnnouncement(
      `${hallway.label} hallway, ${count} ${count === 1 ? "door" : "doors"}`,
    );
  };

  /** Hand focus to a rail button without its onFocus reopening a corridor. */
  const focusRailQuietly = (hallwayId: string) => {
    const button = railRefs.current.get(hallwayId);
    if (!button) return;
    suppressOpenRef.current = true;
    button.focus();
    suppressOpenRef.current = false;
  };

  /**
   * Focus a door after the open commit — one rAF, scheduled only from
   * event handlers, cancelled on re-schedule and unmount.
   */
  const scheduleDoorFocus = (hallwayId: string, itemId: string) => {
    setRoving(itemId);
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      doorRefs.current.get(doorKey(hallwayId, itemId))?.focus();
    });
  };

  /** Move focus between live doors — elements exist, no rAF needed. */
  const focusDoorNow = (hallwayId: string, itemId: string) => {
    setRoving(itemId);
    doorRefs.current.get(doorKey(hallwayId, itemId))?.focus();
  };

  const selectDoor = (hallway: Hallway, item: HallwayItem) => {
    onSelect?.(hallway.id, item.id);
    // The flash and the close land in one commit, so the accent stamp
    // rides the exiting scene out.
    setFlash({ hallwayId: hallway.id, itemId: item.id });
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    closeCorridor();
    focusRailQuietly(hallway.id);
  };

  // -- rail handlers ---------------------------------------------------

  const railPointerEnter = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (event.pointerType === "touch") return;
    window.clearTimeout(leaveTimerRef.current);
    window.clearTimeout(intentTimerRef.current);
    intentTimerRef.current = window.setTimeout(
      () => openCorridor(id),
      INTENT_MS,
    );
  };

  const railPointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch") return;
    window.clearTimeout(intentTimerRef.current);
  };

  const railFocus = (id: string) => {
    if (suppressOpenRef.current) return;
    if (pointerFocusRef.current) {
      pointerFocusRef.current = false;
      return;
    }
    openCorridor(id);
  };

  const railClick = (id: string) => {
    pointerFocusRef.current = false;
    if (openRef.current === id) closeCorridor();
    else openCorridor(id);
  };

  const railKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    hallway: Hallway,
  ) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    openCorridor(hallway.id);
    const first = motionSafe
      ? doorSlotsFor(hallway.items, perWall)[0]?.item
      : hallway.items[0];
    if (first) scheduleDoorFocus(hallway.id, first.id);
  };

  // -- corridor handlers -------------------------------------------------

  const doorKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: HallwayItem,
  ) => {
    if (!openHallway) return;
    const index = openDoors.findIndex((door) => door.id === item.id);
    if (index === -1) return;
    let target: HallwayItem | undefined;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      target = openDoors[(index + 1) % openDoors.length];
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      target = openDoors[(index - 1 + openDoors.length) % openDoors.length];
    else return;
    event.preventDefault();
    if (target) focusDoorNow(openHallway.id, target.id);
  };

  // -- component-level open/close discipline -----------------------------

  const handleRootPointerEnter = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    window.clearTimeout(leaveTimerRef.current);
  };

  const handleRootPointerLeave = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    window.clearTimeout(intentTimerRef.current);
    if (openRef.current === null) return;
    window.clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = window.setTimeout(closeCorridor, GRACE_MS);
  };

  const handleRootKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || openRef.current === null) return;
    event.preventDefault();
    event.stopPropagation();
    const id = openRef.current;
    closeCorridor();
    focusRailQuietly(id);
  };

  const handleRootBlur = (event: React.FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && !event.currentTarget.contains(next))
      closeCorridor();
  };

  /** Pointer-down outside closes — coarse pointers have no hover to leave. */
  const hasOpen = openId !== null;
  React.useEffect(() => {
    if (!hasOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const node = navRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target))
        closeCorridor();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [hasOpen, closeCorridor]);

  // Unmount cleanup only — no state is set here.
  React.useEffect(
    () => () => {
      window.clearTimeout(intentTimerRef.current);
      window.clearTimeout(leaveTimerRef.current);
      window.clearTimeout(flashTimerRef.current);
      cancelAnimationFrame(focusRafRef.current);
    },
    [],
  );

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={cn("relative w-full", className)}
      onPointerEnter={handleRootPointerEnter}
      onPointerLeave={handleRootPointerLeave}
      onKeyDown={handleRootKeyDown}
      onBlur={handleRootBlur}
    >
      {/* Top rail — hallway stops in the normal tab order. */}
      <div className="flex items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {hallways.map((hallway, index) => {
          const open = hallway.id === openId;
          return (
            <button
              key={hallway.id}
              ref={(element) => {
                if (element) railRefs.current.set(hallway.id, element);
                else railRefs.current.delete(hallway.id);
              }}
              type="button"
              aria-expanded={open}
              aria-controls={corridorId}
              onPointerDown={() => {
                pointerFocusRef.current = true;
              }}
              onPointerEnter={(event) => railPointerEnter(event, hallway.id)}
              onPointerLeave={railPointerLeave}
              onFocus={() => railFocus(hallway.id)}
              onClick={() => railClick(hallway.id)}
              onKeyDown={(event) => railKeyDown(event, hallway)}
              className={cn(
                "relative flex shrink-0 cursor-pointer items-baseline gap-1.5 rounded-2 px-3 pt-1.5 pb-3 whitespace-nowrap transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/60",
                open ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  open ? "text-cobalt-bright" : "text-ink-3",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-label">{hallway.label}</span>
              {open && (
                <motion.span
                  aria-hidden
                  layoutId={`${baseId}-rail-underline`}
                  className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-cobalt"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Corridor region — an overlay reserved below the rail. The wrapper
          never takes pointer events; the mounted scene does. */}
      <div
        id={corridorId}
        className="pointer-events-none absolute inset-x-0 top-full z-30 mt-2"
        style={{ height: corridorHeight }}
      >
        <AnimatePresence custom={direction} initial={false}>
          {openHallway && (
            <CorridorScene
              key={openHallway.id}
              hallway={openHallway}
              direction={direction}
              motionSafe={motionSafe}
              perWall={perWall}
              rovingId={rovingId}
              flashItemId={
                flash && flash.hallwayId === openHallway.id
                  ? flash.itemId
                  : null
              }
              onSelectDoor={(item) => selectDoor(openHallway, item)}
              onDoorKeyDown={doorKeyDown}
              onDoorFocus={setRoving}
              onRegisterDoor={(itemId, element) => {
                const key = doorKey(openHallway.id, itemId);
                if (element) doorRefs.current.set(key, element);
                else doorRefs.current.delete(key);
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </nav>
  );
}

type CorridorSceneProps = {
  hallway: Hallway;
  direction: number;
  motionSafe: boolean;
  perWall: number;
  rovingId: string | null;
  flashItemId: string | null;
  onSelectDoor: (item: HallwayItem) => void;
  onDoorKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: HallwayItem,
  ) => void;
  onDoorFocus: (itemId: string) => void;
  onRegisterDoor: (itemId: string, element: HTMLButtonElement | null) => void;
};

/**
 * One hallway scene. Swings in from its side of the rail (direction rides
 * AnimatePresence custom, the stage-tabs idiom); a fresh open and the
 * close are fade-plus-y instead. While exiting it is inert and hidden.
 */
function CorridorScene({
  hallway,
  direction,
  motionSafe,
  perWall,
  rovingId,
  flashItemId,
  onSelectDoor,
  onDoorKeyDown,
  onDoorFocus,
  onRegisterDoor,
}: CorridorSceneProps) {
  // A scene animating out must already be inert — AnimatePresence would
  // otherwise keep it clickable with its last-render props.
  const isPresent = useIsPresent();
  const hidden = !isPresent;

  const sceneVariants: Variants = {
    enter: (dir: number) =>
      motionSafe
        ? dir === 0
          ? { opacity: 0, x: "0%", y: -distances.step }
          : { opacity: 0, x: `${SWING_PCT * dir}%`, y: 0 }
        : { opacity: 0 },
    center: {
      opacity: 1,
      x: "0%",
      y: 0,
      transition: motionSafe
        ? {
            x: springs.glide,
            y: springs.glide,
            opacity: { duration: durations.base },
          }
        : { duration: durations.fast },
    },
    exit: (dir: number) =>
      motionSafe
        ? {
            opacity: 0,
            x: dir === 0 ? "0%" : `${-SWING_PCT * dir}%`,
            y: dir === 0 ? -distances.step : 0,
            transition: exitFor(durations.base),
          }
        : { opacity: 0, transition: { duration: durations.fast } },
  };

  const slots = doorSlotsFor(hallway.items, perWall);

  return (
    <motion.div
      custom={direction}
      variants={sceneVariants}
      initial="enter"
      animate="center"
      exit="exit"
      aria-hidden={hidden || undefined}
      inert={hidden}
      className={cn(
        "pointer-events-auto absolute inset-0 overflow-hidden rounded-3 border border-hairline bg-surface-0",
        !motionSafe && "overflow-y-auto p-3",
        hidden && "pointer-events-none",
      )}
      style={motionSafe ? { perspective: perspectives.far } : undefined}
    >
      {motionSafe ? (
        <>
          {/* Ceiling and floor — hairline strips tilted onto their planes,
              side edges converging on the vanishing point. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[9%] top-[6%] z-0 h-[32%] border-x border-hairline-strong"
            style={{
              transform: `rotateX(-${WALL_ANGLE + 10}deg)`,
              transformOrigin: "50% 0%",
              background:
                "linear-gradient(to bottom, var(--hairline), transparent)",
              maskImage:
                "linear-gradient(to bottom, black 12%, transparent 92%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 12%, transparent 92%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[9%] bottom-[6%] z-0 h-[32%] border-x border-hairline-strong"
            style={{
              transform: `rotateX(${WALL_ANGLE + 10}deg)`,
              transformOrigin: "50% 100%",
              background:
                "linear-gradient(to top, var(--hairline), transparent)",
              maskImage: "linear-gradient(to top, black 12%, transparent 92%)",
              WebkitMaskImage:
                "linear-gradient(to top, black 12%, transparent 92%)",
            }}
          />

          {/* Far wall at the vanishing point — smallest and dimmest; the
              sr-only region already announces label and count. */}
          <div
            aria-hidden
            className="absolute z-[1] flex flex-col items-center justify-center gap-1 rounded-2 border border-hairline bg-surface-1 px-1 text-center opacity-75"
            style={{
              left: "50%",
              top: "50%",
              width: "24%",
              height: "38%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="text-label max-w-full truncate text-ink-2">
              {hallway.label}
            </span>
            <span className="font-mono text-[9px] tracking-[0.1em] text-ink-3 tabular-nums">
              {String(hallway.items.length).padStart(2, "0")} ITEMS
            </span>
          </div>

          {slots.map((slot) => (
            <WallDoor
              key={slot.item.id}
              slot={slot}
              roving={slot.item.id === rovingId}
              flashed={slot.item.id === flashItemId}
              onSelect={onSelectDoor}
              onKeyDown={onDoorKeyDown}
              onFocus={onDoorFocus}
              onRegister={onRegisterDoor}
            />
          ))}
        </>
      ) : (
        <>
          {/* Reduced motion: the corridor flattens into a standard
              mega-menu panel — label header, two-column door list. */}
          <p className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-label text-ink-2">{hallway.label}</span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-ink-3 tabular-nums">
              {String(hallway.items.length).padStart(2, "0")} ITEMS
            </span>
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {hallway.items.map((item) => (
              <button
                key={item.id}
                ref={(element) => onRegisterDoor(item.id, element)}
                type="button"
                tabIndex={!hidden && item.id === rovingId ? 0 : -1}
                onClick={() => onSelectDoor(item)}
                onKeyDown={(event) => onDoorKeyDown(event, item)}
                onFocus={() => onDoorFocus(item.id)}
                className={cn(
                  "relative flex cursor-pointer items-center justify-between gap-2 rounded-2 border border-hairline bg-surface-2 px-2.5 py-2 text-left outline-none",
                  "transition-colors hover:border-hairline-strong",
                  "focus-visible:ring-2 focus-visible:ring-ring/60",
                )}
              >
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ opacity: item.id === flashItemId ? 1 : 0 }}
                  transition={{
                    duration:
                      item.id === flashItemId
                        ? durations.blink
                        : durations.base,
                  }}
                  className="pointer-events-none absolute inset-0 rounded-2 border border-cobalt bg-cobalt-wash"
                />
                <span className="min-w-0 truncate text-xs font-medium text-ink">
                  {item.label}
                </span>
                {item.hint && (
                  <span className="shrink-0 font-mono text-[9px] tracking-[0.1em] text-ink-3 uppercase">
                    {item.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

type WallDoorProps = {
  slot: DoorSlot;
  roving: boolean;
  flashed: boolean;
  onSelect: (item: HallwayItem) => void;
  onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: HallwayItem,
  ) => void;
  onFocus: (itemId: string) => void;
  onRegister: (itemId: string, element: HTMLButtonElement | null) => void;
};

/**
 * One door plate on a wall: hinged on its outer edge at ±48°, recessed by
 * rank. Hover or focus brightens it to full ink and nudges it 6px toward
 * the viewer on `snap`; the accent flash is a blink tween.
 */
function WallDoor({
  slot,
  roving,
  flashed,
  onSelect,
  onKeyDown,
  onFocus,
  onRegister,
}: WallDoorProps) {
  const [lit, setLit] = React.useState(false);
  const { item, side, rank } = slot;
  const geometry =
    WALL_RANKS[Math.min(rank, WALL_RANKS.length - 1)] ?? WALL_RANKS[0];
  const isLeft = side === "left";
  const placement: React.CSSProperties = isLeft
    ? { left: `${geometry.inset}%` }
    : { right: `${geometry.inset}%` };

  return (
    <motion.button
      ref={(element) => onRegister(item.id, element)}
      type="button"
      tabIndex={roving ? 0 : -1}
      initial={false}
      animate={{
        y: "-50%",
        z: lit ? DOOR_NUDGE : 0,
        opacity: lit ? 1 : geometry.dim,
        rotateY: isLeft ? WALL_ANGLE : -WALL_ANGLE,
        scale: geometry.scale,
      }}
      transition={{ z: springs.snap, opacity: { duration: durations.fast } }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setLit(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setLit(false);
      }}
      onFocus={() => {
        setLit(true);
        onFocus(item.id);
      }}
      onBlur={() => setLit(false)}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => onKeyDown(event, item)}
      className={cn(
        "absolute flex cursor-pointer flex-col justify-between rounded-2 border border-hairline bg-surface-2 p-2 text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60",
      )}
      style={{
        ...placement,
        top: "50%",
        width: `${DOOR_WIDTH_PCT}%`,
        height: `${DOOR_HEIGHT_PCT}%`,
        transformOrigin: isLeft ? "left center" : "right center",
        zIndex: 8 - rank,
      }}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: flashed ? 1 : 0 }}
        transition={{
          duration: flashed ? durations.blink : durations.base,
        }}
        className="pointer-events-none absolute inset-0 rounded-2 border border-cobalt bg-cobalt-wash"
      />
      <span className="text-[11px] leading-tight font-medium break-words text-ink">
        {item.label}
      </span>
      {item.hint && (
        <span className="font-mono text-[9px] tracking-[0.1em] text-ink-3 uppercase">
          {item.hint}
        </span>
      )}
    </motion.button>
  );
}
