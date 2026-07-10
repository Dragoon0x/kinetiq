"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, djb2, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Resting angle of a fully open door, degrees about the left hinge. */
const OPEN_ANGLE = -104;
/** Hard stop — the hinge's overdrag give runs out here. */
const MAX_ANGLE = -118;
/** Release past this angle and the door commits to swinging open. */
const DETENT_ANGLE = -70;
/** Drag-to-angle rate: each px of leftward pull is 0.55° of swing. */
const DRAG_RATE = 0.55;
/** Compression of drag travel past the resting angle — the hinge gives. */
const GIVE = 0.45;
/** Lever drop while grabbed, degrees (negative dips the tip down). */
const LEVER_DROP = -24;
/** Frame nudge on slam, px — the door-hits-the-stop cue. */
const FRAME_BUMP = 2;
/** Pointer travel before a press counts as a drag, px. */
const DRAG_SLOP = 3;
/** Reduced-motion open pose: the door slides flat into the jamb. */
const REDUCED_OPEN_X = "-92%";
/** House shadow ink for the cast-shadow gradient. */
const SHADOW_INK = "oklch(0.05 0.02 258 / 0.5)";
/** Grille rows on the default minted door face. */
const VENT_LINES = [0, 1, 2, 3, 4] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Controls = ReturnType<typeof animate> | null;

/** Raw drag angle mapped into hinge travel: linear to −104°, soft give to −118°. */
const hingeTravel = (raw: number): number => {
  if (raw >= OPEN_ANGLE) return clamp(raw, OPEN_ANGLE, 0);
  const excess = OPEN_ANGLE - raw;
  return Math.max(OPEN_ANGLE - excess * GIVE, MAX_ANGLE);
};

/** Slam impact: knock the frame off its stop, puff the dust line at the jamb. */
const strikeFrame = (
  frameX: MotionValue<number>,
  dust: MotionValue<number>,
  frameControlsRef: { current: Controls },
  dustControlsRef: { current: Controls },
): void => {
  frameControlsRef.current?.stop();
  frameX.set(FRAME_BUMP);
  frameControlsRef.current = animate(frameX, 0, springs.recoil);
  dustControlsRef.current?.stop();
  dust.set(1);
  dustControlsRef.current = animate(dust, 0, {
    duration: durations.base,
    ease: easings.exit,
  });
};

export type SwingDoorProps = {
  /** What waits in the doorway. */
  children: React.ReactNode;
  /** Artwork on the door. Defaults to a minted plate number over a vent grille. */
  doorFace?: React.ReactNode;
  /** Controlled open state. */
  open?: boolean;
  /** Uncontrolled initial state. @default false */
  defaultOpen?: boolean;
  /** Fires when a gesture or Escape commits a new state. */
  onOpenChange?: (open: boolean) => void;
  /** Doorway height in px. @default 240 */
  height?: number;
  className?: string;
  /** Labels the doorway region and mints the default plate. @default "Door" */
  "aria-label"?: string;
};

/**
 * A freestanding hinged door with handle physics. The door fills a framed
 * doorway, hinged on its left edge — rotateY 0 (shut) to −104° (open) under
 * `perspective(perspectives.base)`. Grab the handle lever (a real button)
 * or the door body and pull: a pointer-captured drag maps horizontal travel
 * to hinge angle at −0.55°/px, clamped to −118° with compressed give past
 * the −104° rest, the lever flicking down 24° while grabbed. Release past
 * the −70° detent and the door swings open on `springs.glide`; release
 * short and it SLAMS — a `durations.base`/`easings.exit` tween to 0° whose
 * impact knocks the frame sideways (set 2px, recoil to 0 on
 * `springs.recoil`) and flashes a dust line at the latch jamb. A plain
 * click or Enter on the handle toggles with the same physics.
 *
 * The hinge angle lives in one motion value: the doorway's reveal opacity,
 * the cast-shadow gradient (its lean and reach), and the edge-on sliver the
 * open door leaves at the frame all read it back through `useTransform`.
 * Past edge-on the painted face backface-hides, so the resting door reads
 * as a bare board edge against the jamb.
 *
 * Disclosure semantics: the handle carries `aria-expanded` +
 * `aria-controls` for the doorway `role="region"`; the doorway is dimmed
 * and inert while shut; Escape slams it shut from anywhere inside; focus
 * moves to the doorway's first focusable (or the region) on open — one
 * cancelled rAF — and back to the handle on close. An sr-only status
 * announces "Door open" / "Door shut".
 *
 * Reduced motion swaps the swing for a flat translateX slide to the jamb
 * (duration-fast tween, the handle edge left showing as the close grip):
 * no drag, no slam, no shudder — semantics identical.
 */
export function SwingDoor({
  children,
  doorFace,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  height = 240,
  className,
  "aria-label": ariaLabel = "Door",
}: SwingDoorProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const doorwayId = `${baseId}-doorway`;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;
  const [grabbed, setGrabbed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  /** Hinge angle, degrees — one source for the swing, shadow, and sliver. */
  const angle = useMotionValue(open ? OPEN_ANGLE : 0);
  /** Frame recoil channel — the plate shudders when the door hits its stop. */
  const frameX = useMotionValue(0);
  /** Dust-line flash at the latch jamb, 0..1. */
  const dust = useMotionValue(0);

  const doorwayRef = React.useRef<HTMLDivElement>(null);
  const handleRef = React.useRef<HTMLButtonElement>(null);
  const doorControlsRef = React.useRef<Controls>(null);
  const frameControlsRef = React.useRef<Controls>(null);
  const dustControlsRef = React.useRef<Controls>(null);
  const focusRafRef = React.useRef(0);
  /** The pose the angle was last sent toward — guards the sync effect. */
  const poseRef = React.useRef(open ? OPEN_ANGLE : 0);
  const dragStartXRef = React.useRef(0);
  const dragStartAngleRef = React.useRef(0);
  const draggedRef = React.useRef(false);

  // Unmount hygiene only — no state is set here.
  React.useEffect(
    () => () => {
      cancelAnimationFrame(focusRafRef.current);
      doorControlsRef.current?.stop();
      frameControlsRef.current?.stop();
      dustControlsRef.current?.stop();
    },
    [],
  );

  // State is the single swing authority: any committed or external change
  // animates from here. poseRef keeps drag settles that never changed state
  // (handled inline at release) from re-animating.
  React.useEffect(() => {
    const target = open ? OPEN_ANGLE : 0;
    if (poseRef.current === target) return;
    poseRef.current = target;
    doorControlsRef.current?.stop();
    if (!motionSafe) {
      angle.set(target);
      return;
    }
    doorControlsRef.current = open
      ? animate(angle, OPEN_ANGLE, springs.glide)
      : animate(angle, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () =>
            strikeFrame(frameX, dust, frameControlsRef, dustControlsRef),
        });
  }, [open, motionSafe, angle, frameX, dust]);

  /** One rAF into the doorway's first focusable, cancelled on re-schedule. */
  const scheduleDoorwayFocus = () => {
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      const region = doorwayRef.current;
      if (!region) return;
      (region.querySelector<HTMLElement>(FOCUSABLE) ?? region).focus();
    });
  };

  /** Commit a state change from a user gesture: semantics, voice, focus. */
  const commit = (next: boolean) => {
    if (next === open) return;
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    setAnnouncement(next ? "Door open" : "Door shut");
    if (next) {
      scheduleDoorwayFocus();
    } else {
      cancelAnimationFrame(focusRafRef.current);
      focusRafRef.current = 0;
      handleRef.current?.focus();
    }
  };

  /** Detent decision at release: swing home on glide, or slam on the frame. */
  const settleRelease = () => {
    const wantOpen = angle.get() <= DETENT_ANGLE;
    if (wantOpen !== open) {
      commit(wantOpen); // the sync effect swings or slams from here
      return;
    }
    // No semantic change — settle the door body directly.
    poseRef.current = wantOpen ? OPEN_ANGLE : 0;
    doorControlsRef.current?.stop();
    doorControlsRef.current = wantOpen
      ? animate(angle, OPEN_ANGLE, springs.glide)
      : animate(angle, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: () =>
            strikeFrame(frameX, dust, frameControlsRef, dustControlsRef),
        });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe || event.button !== 0) return;
    doorControlsRef.current?.stop();
    draggedRef.current = false;
    dragStartXRef.current = event.clientX;
    dragStartAngleRef.current = angle.get();
    setGrabbed(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = event.clientX - dragStartXRef.current; // pull left to open
    if (Math.abs(dx) > DRAG_SLOP) draggedRef.current = true;
    angle.set(hingeTravel(dragStartAngleRef.current + dx * DRAG_RATE));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe) return;
    setGrabbed(false);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!draggedRef.current) return; // the click that follows toggles instead
    settleRelease();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe) return;
    setGrabbed(false);
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const wasDragged = draggedRef.current;
    draggedRef.current = false;
    if (!wasDragged) {
      angle.set(poseRef.current); // no meaningful pull — reseat silently
      return;
    }
    settleRelease();
  };

  /** Click or Enter with no meaningful drag toggles with the same physics. */
  const handleDoorClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    commit(!open);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
    commit(false);
  };

  /** Doorway reveal follows the door live: shut 0.5 → open 1. */
  const stageOpacity = useTransform(angle, [OPEN_ANGLE, 0], [1, 0.5]);
  /** Cast-shadow strength: shut 0 → resting open 1. */
  const shadowOpacity = useTransform(angle, [OPEN_ANGLE, 0], [1, 0]);
  /** The shadow leans and reaches with the door — angle and extent, one MV. */
  const shadowGradient = useTransform(angle, (a) => {
    const t = clamp(a / OPEN_ANGLE, 0, 1.2);
    const tilt = 90 - t * 12;
    const reach = 10 + t * 52;
    return `linear-gradient(${tilt}deg, ${SHADOW_INK}, transparent ${reach}%)`;
  });
  /** Past ~88° the painted door leaves the frame; the edge sliver takes over. */
  const sliverOpacity = useTransform(
    angle,
    [OPEN_ANGLE, OPEN_ANGLE + 16],
    [1, 0],
  );

  return (
    <div className={cn("w-full", className)} onKeyDown={handleKeyDown}>
      {/* The doorframe plate rides the recoil channel — lintel, jambs, and
          doorway shudder together when the door slams home. */}
      <motion.div
        style={{ x: frameX }}
        className="w-full rounded-3 border border-hairline-strong bg-surface-1"
      >
        {/* Lintel — the frame's spec strip. */}
        <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
          <span className="min-w-0 truncate text-label text-ink-2">
            {ariaLabel}
          </span>
          <span className="shrink-0 font-mono text-[9px] tracking-[0.12em] text-ink-3 uppercase tabular-nums">
            L-Hinge &middot; Swg 104&deg;
          </span>
        </div>

        <div className="p-2">
          {/* Doorway stage — the door and everything it reveals. */}
          <div
            className="relative overflow-hidden rounded-2 border border-hairline bg-surface-0"
            style={{ height }}
          >
            <motion.div
              ref={doorwayRef}
              id={doorwayId}
              role="region"
              aria-label={ariaLabel}
              tabIndex={-1}
              inert={!open}
              initial={false}
              animate={motionSafe ? undefined : { opacity: open ? 1 : 0.5 }}
              transition={{ duration: durations.fast }}
              style={motionSafe ? { opacity: stageOpacity } : undefined}
              className="h-full"
            >
              {children}
            </motion.div>

            {/* The door's shadow falling across the doorway. */}
            {motionSafe && (
              <motion.div
                aria-hidden
                style={{
                  opacity: shadowOpacity,
                  backgroundImage: shadowGradient,
                }}
                className="pointer-events-none absolute inset-0 z-10"
              />
            )}

            {/* THE DOOR — hinged left, dragged by the handle or the body. */}
            <motion.div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onClick={handleDoorClick}
              initial={false}
              animate={{
                x: motionSafe ? "0%" : open ? REDUCED_OPEN_X : "0%",
              }}
              transition={{ duration: durations.fast }}
              style={
                motionSafe
                  ? {
                      rotateY: angle,
                      transformPerspective: perspectives.base,
                      transformOrigin: "left center",
                    }
                  : undefined
              }
              className={cn(
                "absolute inset-0 z-20 touch-none border-r border-hairline-strong bg-surface-2 select-none",
                motionSafe
                  ? "cursor-grab active:cursor-grabbing"
                  : "cursor-pointer",
              )}
            >
              {/* Hinge seam on the hinged edge. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 z-10 w-0.5 bg-hairline-strong"
              />

              {/* Door face — backface-hidden so past edge-on it reads as bare board. */}
              <div className="pointer-events-none h-full pr-10 [backface-visibility:hidden]">
                {doorFace ?? <MintedFace label={ariaLabel} />}
              </div>

              {/* Handle lever — the disclosure control, riding the door. */}
              <button
                ref={handleRef}
                type="button"
                aria-expanded={open}
                aria-controls={doorwayId}
                aria-label={`${ariaLabel} handle`}
                className="absolute top-1/2 right-1.5 z-20 flex h-9 w-7 -translate-y-1/2 items-center justify-end rounded-2 border border-hairline-strong bg-surface-1 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ rotate: grabbed ? LEVER_DROP : 0 }}
                  transition={springs.flick}
                  style={{ transformOrigin: "100% 50%" }}
                  className="block h-1 w-4 rounded-full bg-ink-2"
                />
              </button>
            </motion.div>

            {/* Edge-on sliver — the open door resting against the frame edge.
                A pointer path only (grab or click it shut); keyboard closes
                via the handle or Escape. */}
            {motionSafe && (
              <motion.div
                aria-hidden
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onClick={handleDoorClick}
                style={{ opacity: sliverOpacity }}
                className={cn(
                  "absolute inset-y-0 left-0 z-30 w-2.5 touch-none",
                  open
                    ? "cursor-grab active:cursor-grabbing"
                    : "pointer-events-none",
                )}
              >
                <span className="absolute inset-y-0 left-0 w-1.5 border-r border-hairline-strong bg-surface-2" />
              </motion.div>
            )}

            {/* Dust line at the latch jamb — flashes on impact. */}
            <motion.div
              aria-hidden
              style={{ opacity: dust }}
              className="pointer-events-none absolute inset-y-0 right-0 z-40 w-0.5 bg-ink-3"
            />
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

/** Default door artwork: a minted plate number over a small vent grille. */
function MintedFace({ label }: { label: string }) {
  // djb2 mints a stable plate number from the label — never random.
  const plate = String(100 + (djb2(label) % 900));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <span className="rounded-1 border border-hairline-strong bg-surface-1 px-2 py-1 font-mono text-[10px] tracking-[0.15em] text-ink-2 uppercase tabular-nums">
        No. {plate}
      </span>
      <span aria-hidden className="flex w-10 flex-col gap-1">
        {VENT_LINES.map((line) => (
          <span key={line} className="h-px w-full bg-hairline-strong" />
        ))}
      </span>
    </div>
  );
}
