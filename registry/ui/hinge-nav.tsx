"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
  type Variants,
} from "motion/react";
import { X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { liftShadowCss, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Swing start/end, degrees — 2° past edge-on so a resting door reads shut. */
const HINGE_ANGLE = 92;
/** Frame nudge when a door lands, px — the door-hits-the-stop cue. */
const BUMP_X = 2;
/** Stage-floor ink while a door hangs over it. */
const DIM_OPACITY = 0.35;
/** Door altitude off the stage floor, for its contact shadow. */
const DOOR_LIFT = 0.45;
/** Static cast-shadow strength on the reduced-motion pathway. */
const REDUCED_SHADOW = 0.3;
/** House shadow ink for the cast-shadow gradient. */
const SHADOW_INK = "oklch(0.05 0.02 258 / 0.45)";

export type HingeDoorItem = {
  /** Stable id, reported to onSelect. */
  id: string;
  /** Row label. */
  label: string;
  /** Optional mono annotation on the row. */
  hint?: string;
};

export type HingeDoor = {
  /** Which frame edge the door hangs on. */
  side: "left" | "right";
  /** Tab and door-header label. */
  label: string;
  items: HingeDoorItem[];
};

export type HingeNavProps = {
  /** The hinged nav panels — one or two, one per side. */
  doors: HingeDoor[];
  /** Stage content the doors swing over. */
  children: React.ReactNode;
  /** Fires when a row is chosen; the door closes after. */
  onSelect?: (side: "left" | "right", id: string) => void;
  /** Stage height in px. Default 280. */
  height?: number;
  className?: string;
};

/**
 * Nav panels hinged on the frame edges, swinging in like doors over an
 * inline stage. Each side carries a slim vertical tab on the frame; pulling
 * one swings its door in from edge-on — rotateY ∓92°→0 about the hinged
 * edge under `perspective(perspectives.base)` on `springs.glide` — and the
 * landing bumps the whole frame ∓2px on `springs.recoil` (set-then-recoil),
 * the door hitting its stop. Every 3D child is an independent flat
 * transform (no preserve-3d), so the stage may clip freely.
 *
 * While a door is open the stage floor dims to 0.35 and goes pointer-inert
 * (base tween), and the door casts a moving shadow: a gradient overlay
 * whose opacity is driven from the live hinge angle via `useTransform`.
 * Closing — Escape, the tab again, the door's close chip, or a click on
 * the dimmed stage — swings the door back edge-on on `exitFor(durations.slow)`
 * (exits never spring) as the dim lifts. Only one door is open at a time;
 * opening the other side closes the first. Choosing a row fires
 * `onSelect(side, id)`, stamps a blink-tween accent flash that rides the
 * closing door out, and hands focus back to the tab.
 *
 * Keyboard and assistive tech: tabs are buttons with `aria-expanded` +
 * `aria-controls`; the door is a `role="region"` labelled by its door
 * label; opening moves focus to the first row (a single rAF scheduled from
 * the event, cancelled on re-schedule, close, and unmount); Escape closes
 * and returns focus to the tab. Rows sit in natural tab order — no roving
 * needed — with focus-visible rings throughout, and an sr-only polite
 * region announces "<label> door open/closed". A door animating out is
 * inert, so a mid-swing panel can never be clicked or read.
 *
 * Reduced motion trades the swing for a flat fade-slide (translateX ∓16→0
 * plus opacity on duration-fast): no rotation, no frame bump, and a static
 * cast shadow — semantics and focus order identical.
 */
export function HingeNav({
  doors,
  children,
  onSelect,
  height = 280,
  className,
}: HingeNavProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [openSide, setOpenSide] = React.useState<"left" | "right" | null>(
    null,
  );
  const [announcement, setAnnouncement] = React.useState("");

  const tabRefs = React.useRef(new Map<"left" | "right", HTMLButtonElement>());
  const firstItemRefs = React.useRef(
    new Map<"left" | "right", HTMLButtonElement>(),
  );
  const focusRafRef = React.useRef(0);
  const bumpControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  /** Frame recoil channel — the stage shell nudges x when a door lands. */
  const bumpX = useMotionValue(0);

  // One door per side; extras on a side are ignored by design.
  const leftDoor = doors.find((door) => door.side === "left");
  const rightDoor = doors.find((door) => door.side === "right");
  const openDoor =
    openSide === "left" ? leftDoor : openSide === "right" ? rightDoor : null;

  // Unmount hygiene only — no state is set here.
  React.useEffect(
    () => () => {
      cancelAnimationFrame(focusRafRef.current);
      bumpControlsRef.current?.stop();
    },
    [],
  );

  const panelIdFor = (side: "left" | "right") => `${baseId}-door-${side}`;

  /**
   * Open a door (swapping out any other) and move focus to its first row —
   * one rAF so the freshly mounted panel exists, cancelled on re-schedule.
   */
  const show = (door: HingeDoor) => {
    setOpenSide(door.side);
    setAnnouncement(`${door.label} door open`);
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      firstItemRefs.current.get(door.side)?.focus();
    });
  };

  /** Close and hand focus back to the door's tab. */
  const hide = (door: HingeDoor) => {
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = 0;
    setOpenSide(null);
    setAnnouncement(`${door.label} door closed`);
    tabRefs.current.get(door.side)?.focus();
  };

  const toggle = (door: HingeDoor) => {
    if (openSide === door.side) hide(door);
    else show(door);
  };

  const handleSelect = (door: HingeDoor, item: HingeDoorItem) => {
    onSelect?.(door.side, item.id);
    hide(door);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !openDoor) return;
    event.preventDefault();
    event.stopPropagation();
    hide(openDoor);
  };

  /** The landed door knocks the frame toward its hinge: set, then recoil. */
  const handleDoorLanded = (side: "left" | "right") => {
    bumpControlsRef.current?.stop();
    bumpX.set(side === "left" ? -BUMP_X : BUMP_X);
    bumpControlsRef.current = animate(bumpX, 0, springs.recoil);
  };

  const registerTab = (
    side: "left" | "right",
    element: HTMLButtonElement | null,
  ) => {
    if (element) tabRefs.current.set(side, element);
    else tabRefs.current.delete(side);
  };

  const registerFirstItem = (
    side: "left" | "right",
    element: HTMLButtonElement | null,
  ) => {
    if (element) firstItemRefs.current.set(side, element);
    else firstItemRefs.current.delete(side);
  };

  return (
    <div className={cn("w-full", className)} onKeyDown={handleKeyDown}>
      {/* The stage shell rides the recoil channel — tabs, floor, and door
          shudder together when a door hits its stop. */}
      <motion.div
        style={{ x: bumpX, height }}
        className="relative flex w-full overflow-hidden rounded-3 border border-hairline bg-surface-0"
      >
        {leftDoor && (
          <EdgeTab
            door={leftDoor}
            open={openSide === "left"}
            panelId={panelIdFor("left")}
            onToggle={toggle}
            onRegister={registerTab}
          />
        )}

        {/* Stage floor — the surface the doors swing over. */}
        <div className="relative min-w-0 flex-1">
          <motion.div
            initial={false}
            animate={{ opacity: openDoor ? DIM_OPACITY : 1 }}
            transition={{ duration: durations.base }}
            className={cn("h-full", openDoor && "pointer-events-none")}
          >
            {children}
          </motion.div>

          {/* Clicking the dimmed stage closes — a pointer path only; Escape
              and the close chip cover keyboard. */}
          {openDoor && (
            <div
              aria-hidden
              onClick={() => hide(openDoor)}
              className="absolute inset-0 z-10 cursor-pointer"
            />
          )}

          <AnimatePresence>
            {openDoor && (
              <DoorPanel
                key={openDoor.side}
                door={openDoor}
                panelId={panelIdFor(openDoor.side)}
                motionSafe={motionSafe}
                onLanded={handleDoorLanded}
                onSelectItem={handleSelect}
                onClose={hide}
                onRegisterFirstItem={registerFirstItem}
              />
            )}
          </AnimatePresence>
        </div>

        {rightDoor && (
          <EdgeTab
            door={rightDoor}
            open={openSide === "right"}
            panelId={panelIdFor("right")}
            onToggle={toggle}
            onRegister={registerTab}
          />
        )}
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type EdgeTabProps = {
  door: HingeDoor;
  open: boolean;
  panelId: string;
  onToggle: (door: HingeDoor) => void;
  onRegister: (
    side: "left" | "right",
    element: HTMLButtonElement | null,
  ) => void;
};

/** A slim vertical tab on the frame edge — the door's handle. */
function EdgeTab({ door, open, panelId, onToggle, onRegister }: EdgeTabProps) {
  const isLeft = door.side === "left";
  return (
    <button
      ref={(element) => onRegister(door.side, element)}
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => onToggle(door)}
      className={cn(
        "flex w-8 shrink-0 cursor-pointer items-center justify-center outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        isLeft ? "border-r border-hairline" : "border-l border-hairline",
        open
          ? "bg-surface-2 text-ink"
          : "bg-surface-1 text-ink-3 hover:bg-surface-2 hover:text-ink-2",
      )}
    >
      <span className="text-label [writing-mode:vertical-rl]">
        {door.label}
      </span>
    </button>
  );
}

type DoorPanelProps = {
  door: HingeDoor;
  panelId: string;
  motionSafe: boolean;
  onLanded: (side: "left" | "right") => void;
  onSelectItem: (door: HingeDoor, item: HingeDoorItem) => void;
  onClose: (door: HingeDoor) => void;
  onRegisterFirstItem: (
    side: "left" | "right",
    element: HTMLButtonElement | null,
  ) => void;
};

/**
 * One hinged door and the shadow it casts. The hinge angle lives in a
 * motion value — the swing drives it declaratively and the cast-shadow
 * overlay reads it back through `useTransform`, so light always follows
 * the door. The selection flash is local state: an exiting AnimatePresence
 * subtree keeps its last-rendered props, but its own state still updates,
 * so the stamp rides the closing door out.
 */
function DoorPanel({
  door,
  panelId,
  motionSafe,
  onLanded,
  onSelectItem,
  onClose,
  onRegisterFirstItem,
}: DoorPanelProps) {
  const isLeft = door.side === "left";
  const sign = isLeft ? -1 : 1;
  // A door animating out must already be inert — AnimatePresence would
  // otherwise keep it clickable while it swings away.
  const isPresent = useIsPresent();
  const [flashId, setFlashId] = React.useState<string | null>(null);

  /** Hinge angle, degrees — the one source for the swing and its shadow. */
  const rotateY = useMotionValue(motionSafe ? sign * HINGE_ANGLE : 0);
  /** Cast-shadow strength follows the angle: edge-on 0 → landed 1. */
  const shadowOpacity = useTransform(
    rotateY,
    isLeft ? [-HINGE_ANGLE, 0] : [0, HINGE_ANGLE],
    isLeft ? [0, 1] : [1, 0],
  );

  const doorVariants: Variants = motionSafe
    ? {
        closed: { rotateY: sign * HINGE_ANGLE },
        open: { rotateY: 0, transition: springs.glide },
        exit: {
          rotateY: sign * HINGE_ANGLE,
          transition: exitFor(durations.slow),
        },
      }
    : {
        closed: { opacity: 0, x: sign * distances.shift },
        open: { opacity: 1, x: 0, transition: { duration: durations.fast } },
        exit: {
          opacity: 0,
          x: sign * distances.shift,
          transition: { duration: durations.fast },
        },
      };

  const doorStyle = motionSafe
    ? {
        rotateY,
        transformPerspective: perspectives.base,
        transformOrigin: isLeft ? "left center" : "right center",
        boxShadow: liftShadowCss(DOOR_LIFT),
      }
    : {
        transformOrigin: isLeft ? "left center" : "right center",
        boxShadow: liftShadowCss(DOOR_LIFT),
      };

  const shadowGradient = `linear-gradient(to ${isLeft ? "right" : "left"}, ${SHADOW_INK}, transparent 78%)`;
  const shadowClass = cn(
    "pointer-events-none absolute inset-y-0 z-10 w-3/4",
    isLeft ? "left-0" : "right-0",
  );

  const handleRowClick = (item: HingeDoorItem) => {
    setFlashId(item.id);
    onSelectItem(door, item);
  };

  return (
    <>
      {motionSafe ? (
        // The moving shadow — its opacity is the hinge angle, remapped.
        <motion.div
          aria-hidden
          className={shadowClass}
          style={{ opacity: shadowOpacity, background: shadowGradient }}
        />
      ) : (
        // Reduced motion: the shadow is static while the door is present.
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: REDUCED_SHADOW }}
          exit={{ opacity: 0, transition: { duration: durations.fast } }}
          transition={{ duration: durations.fast }}
          className={shadowClass}
          style={{ background: shadowGradient }}
        />
      )}

      <motion.div
        id={panelId}
        role="region"
        aria-label={door.label}
        variants={doorVariants}
        initial="closed"
        animate="open"
        exit="exit"
        onAnimationComplete={(definition) => {
          if (definition === "open" && motionSafe) onLanded(door.side);
        }}
        inert={!isPresent}
        aria-hidden={!isPresent || undefined}
        style={doorStyle}
        className={cn(
          "absolute inset-y-0 z-20 flex w-[min(68%,300px)] flex-col border border-hairline bg-surface-1 max-[375px]:w-[min(82%,300px)]",
          isLeft ? "left-0 rounded-r-3" : "right-0 rounded-l-3",
          !isPresent && "pointer-events-none",
        )}
      >
        {/* Hinge seam on the hinged edge. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-hairline-strong",
            isLeft ? "left-0" : "right-0",
          )}
        />

        <div className="flex items-center gap-2 border-b border-hairline py-2 pr-2 pl-3">
          <span className="min-w-0 truncate text-label text-ink-2">
            {door.label}
          </span>
          <span className="ml-auto font-mono text-[10px] tracking-[0.1em] text-ink-3 tabular-nums">
            {String(door.items.length).padStart(2, "0")}
          </span>
          <button
            type="button"
            aria-label={`Close ${door.label} door`}
            onClick={() => onClose(door)}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-2 border border-hairline text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>

        {/* Rows in natural tab order — the door is small enough to walk. */}
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
          {door.items.map((item, index) => (
            <button
              key={item.id}
              ref={
                index === 0
                  ? (element) => onRegisterFirstItem(door.side, element)
                  : undefined
              }
              type="button"
              onClick={() => handleRowClick(item)}
              className={cn(
                "relative flex cursor-pointer items-center justify-between gap-2 rounded-2 border border-hairline bg-surface-2 px-2.5 py-2 text-left outline-none",
                "transition-colors hover:border-hairline-strong",
                "focus-visible:ring-2 focus-visible:ring-ring/60",
              )}
            >
              <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: item.id === flashId ? 1 : 0 }}
                transition={{
                  duration:
                    item.id === flashId ? durations.blink : durations.base,
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
      </motion.div>
    </>
  );
}
