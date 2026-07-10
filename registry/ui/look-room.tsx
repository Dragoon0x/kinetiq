"use client";

import * as React from "react";

import {
  animate,
  motion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { springs } from "@/registry/lib/motion";
import { clamp, mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** Clamped look FOV — the room never rolls past a believable glance. */
const YAW_MAX = 18;
const PITCH_MAX = 10;

/** Arrow-key nudge per press, degrees — the coarse-pointer/keyboard fallback. */
const KEY_STEP_YAW = 6;
const KEY_STEP_PITCH = 4;

/** A focused plaque glides near, not dead center — it keeps its neighbors in view. */
const FOCUS_EASE = 0.72;

/** A plaque's detail chip unfurls once it rides within this much of center,
 * normalized to the ±FOV span (0 = edge, 1 = dead center). */
const DETAIL_NEAR = 0.55;

/** Flash duration on activation, seconds — a brief accent pulse, not a spring. */
const FLASH_S = 0.5;

const WALLS = ["front", "left", "right"] as const;
type Wall = (typeof WALLS)[number];

/** Per-wall dusk shading — a static machined-light gradient, legible in both themes. */
const WALL_SHADE: Record<Wall, string> = {
  front:
    "linear-gradient(175deg, oklch(0.32 0.03 258 / 0.5) 0%, oklch(0.22 0.03 258 / 0.65) 60%, oklch(0.16 0.03 258 / 0.75) 100%)",
  left: "linear-gradient(100deg, oklch(0.14 0.03 258 / 0.75) 0%, oklch(0.24 0.03 258 / 0.5) 100%)",
  right:
    "linear-gradient(260deg, oklch(0.14 0.03 258 / 0.75) 0%, oklch(0.24 0.03 258 / 0.5) 100%)",
};
const FLOOR_SHADE =
  "linear-gradient(0deg, oklch(0.1 0.02 258 / 0.85) 0%, oklch(0.2 0.03 258 / 0.55) 100%)";
const CEILING_SHADE =
  "linear-gradient(180deg, oklch(0.36 0.03 258 / 0.55) 0%, oklch(0.22 0.03 258 / 0.6) 100%)";

export type RoomHotspot = {
  /** Stable identity — reported by `onLook` and used as the React key. */
  id: string;
  /** Plaque label, also the voice of the "Facing …" announcement. */
  label: string;
  /** Which wall the plaque is mounted on. */
  wall: "front" | "left" | "right";
  /** Position across that wall, 0..1. @default 0.5 */
  at?: number;
  /** One-line copy shown once the plaque rides near center of view. */
  detail?: string;
};

export type LookRoomProps = {
  /** Wall plaques, focusable in document order. */
  hotspots: RoomHotspot[];
  /** Fires with the hotspot id on activation (click or Enter/Space). */
  onLook?: (id: string) => void;
  /** Room depth (front wall distance), px. @default 260 */
  depth?: number;
  /** Room height (floor to ceiling), px. @default 290 */
  height?: number;
  className?: string;
  /** Accessible name for the room group. @default "Room interior" */
  "aria-label"?: string;
};

/** The yaw a plaque needs centered in view — its resting address in the FOV. */
const wallYawFor = (wall: Wall, at: number): number => {
  // Front wall: sweeping across it linearly covers the clamped FOV. Side
  // walls are foreshortened (near the door jamb reads close to center, deep
  // in the corner reads near the edge), so the mapping compresses toward
  // the room's far corner.
  const across = mapRange(at, 0, 1, -1, 1);
  if (wall === "front") return across * YAW_MAX * 0.85;
  const corner = wall === "left" ? -YAW_MAX : YAW_MAX;
  return corner * mapRange(at, 0, 1, 0.35, 1);
};

/**
 * A CSS-3D room interior: pointer position over the stage steers a clamped
 * look (yaw ±18°, pitch ±10°) sprung on `glide`, and wall plaques are real
 * focusable buttons that pull the view toward them on focus.
 *
 * THE CHASSIS — an outer stage carries `perspective: 800px`; a single child
 * scene carries `preserve-3d` and is rotated by the sprung yaw/pitch. Five
 * faces (back/left/right/floor/ceiling) hang off that one rotated scene,
 * each `translateZ(depth/2)` out from center and rotated to face inward —
 * the same "one preserve-3d element, faces as its direct children" chassis
 * as `FacetCube`. No overflow, filter, or backdrop-blur ever touches the
 * scene or its faces (Safari flattens a 3D box under any of the three); the
 * stage's own `overflow-hidden` is the only clip in the chain, and it sits
 * outside the perspective, never on the rotated scene.
 *
 * THE LOOK — a fine pointer (`usePointerFine`) moving over the stage sets
 * a clamped yaw/pitch target that both springs chase directly; the scene
 * rotates so the wall under the cursor swings toward center, like turning
 * your head toward it. Coarse pointers and keyboard use the focused stage's
 * arrow keys instead — simpler than a drag gesture, already the pattern's
 * fallback (`FacetCube` steps its detents the same way), and it composes
 * for free with plaque tabbing since the stage and plaques share one DOM.
 *
 * PLAQUES — hotspots render as real buttons pinned on their wall at `at`
 * (0..1 across it), riding the same preserve-3d chain as the room. Hover
 * or focus lights a plaque's ring; focus also glides the look toward it.
 * Activating one fires `onLook`, flashes its own ring, and — once it rides
 * near the center of view — unfurls a one-line detail chip.
 *
 * A mono HUD (aria-hidden) reads the live yaw/pitch off the motion values
 * directly via a motion span; a polite live region announces "Facing …"
 * on every look change or activation, plus a standing description of the
 * room and its plaques for screen-reader users who never see the 3D at all.
 *
 * Reduced motion drops the room entirely: hotspots render as a flat,
 * focusable list grouped by wall — same activation, same announcements,
 * zero perspective.
 */
export function LookRoom({
  hotspots,
  onLook,
  depth = 260,
  height = 290,
  className,
  "aria-label": ariaLabel = "Room interior",
}: LookRoomProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();

  const stageRef = React.useRef<HTMLDivElement>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const yaw = useSpring(0, GLIDE);
  const pitch = useSpring(0, GLIDE);
  /** Last settled (non-pointer) orientation — arrow keys and focus accumulate from here. */
  const restRef = React.useRef({ yaw: 0, pitch: 0 });

  const [facing, setFacing] = React.useState<string | null>(null);
  const [activated, setActivated] = React.useState<string | null>(null);

  const stopFlights = () => {
    for (const controls of controlsRef.current) controls.stop();
    controlsRef.current = [];
  };

  // Nothing may outlive the component: any in-flight glide stops on unmount.
  React.useEffect(() => stopFlights, []);

  const lookAt = (targetYaw: number, targetPitch: number) => {
    const ty = clamp(targetYaw, -YAW_MAX, YAW_MAX);
    const tp = clamp(targetPitch, -PITCH_MAX, PITCH_MAX);
    stopFlights();
    if (motionSafe) {
      controlsRef.current = [
        animate(yaw, ty, springs.glide),
        animate(pitch, tp, springs.glide),
      ];
    } else {
      yaw.jump(ty);
      pitch.jump(tp);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe || !pointerFine) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const nx = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    const ny = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
    // Looking toward the cursor: the wall under it should swing to center.
    // Left/right plaques park at rotateY(±90); a positive pointer nx (right
    // side) must bring the right wall (rotateY(-90)) forward, so yaw runs
    // opposite nx. Pointer below center should tip the view down toward the
    // floor, which is rotateX(+); pitch tracks ny directly.
    stopFlights();
    yaw.set(-nx * YAW_MAX);
    pitch.set(ny * PITCH_MAX);
  };

  const handlePointerLeave = () => {
    if (!motionSafe || !pointerFine) return;
    lookAt(restRef.current.yaw, restRef.current.pitch);
  };

  const handleStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { yaw: y0, pitch: p0 } = restRef.current;
    let next: { yaw: number; pitch: number } | null = null;
    switch (event.key) {
      case "ArrowLeft":
        next = { yaw: y0 + KEY_STEP_YAW, pitch: p0 };
        break;
      case "ArrowRight":
        next = { yaw: y0 - KEY_STEP_YAW, pitch: p0 };
        break;
      case "ArrowUp":
        next = { yaw: y0, pitch: p0 - KEY_STEP_PITCH };
        break;
      case "ArrowDown":
        next = { yaw: y0, pitch: p0 + KEY_STEP_PITCH };
        break;
      default:
        return;
    }
    event.preventDefault();
    restRef.current = {
      yaw: clamp(next.yaw, -YAW_MAX, YAW_MAX),
      pitch: clamp(next.pitch, -PITCH_MAX, PITCH_MAX),
    };
    lookAt(restRef.current.yaw, restRef.current.pitch);
  };

  const focusPlaque = (hotspot: RoomHotspot) => {
    const targetYaw = wallYawFor(hotspot.wall, hotspot.at ?? 0.5) * FOCUS_EASE;
    restRef.current = { yaw: targetYaw, pitch: 0 };
    lookAt(targetYaw, 0);
    setFacing(hotspot.label);
  };

  const activatePlaque = (hotspot: RoomHotspot) => {
    setActivated(hotspot.id);
    setFacing(hotspot.label);
    onLook?.(hotspot.id);
  };

  const yawText = useTransform(yaw, formatYaw);
  const pitchText = useTransform(pitch, formatPitch);

  const half = depth / 2;
  const roomDescription = `A room interior with ${hotspots.length} wall plaque${
    hotspots.length === 1 ? "" : "s"
  }: ${hotspots.map((h) => h.label).join(", ")}.`;

  if (!motionSafe) {
    return (
      <RoomFlat
        hotspots={hotspots}
        activated={activated}
        className={className}
        ariaLabel={ariaLabel}
        roomDescription={roomDescription}
        onActivate={activatePlaque}
        onFocus={(hotspot) => setFacing(hotspot.label)}
      />
    );
  }

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleStageKeyDown}
      className={cn(
        "border-hairline focus-visible:ring-cobalt-bright/60 relative overflow-hidden rounded-3 border outline-none focus-visible:ring-2",
        className,
      )}
      style={{ height, perspective: perspectives.base }}
    >
      {/* THE SCENE — the only preserve-3d element; no clip/filter/blur here. */}
      <motion.div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          rotateX: pitch,
          rotateY: yaw,
          willChange: "transform",
        }}
      >
        {/* Back wall — the viewer's forward-facing surface. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            transform: `translateZ(${-half}px)`,
            background: WALL_SHADE.front,
          }}
        />
        {/* Left wall. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0"
          style={{
            width: depth,
            transform: `rotateY(90deg) translateZ(${-half}px)`,
            transformOrigin: "left center",
            background: WALL_SHADE.left,
          }}
        />
        {/* Right wall. */}
        <div
          aria-hidden
          className="absolute inset-y-0 right-0"
          style={{
            width: depth,
            transform: `rotateY(-90deg) translateZ(${-half}px)`,
            transformOrigin: "right center",
            background: WALL_SHADE.right,
          }}
        />
        {/* Floor. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0"
          style={{
            height: depth,
            transform: `rotateX(90deg) translateZ(${-half}px)`,
            transformOrigin: "bottom center",
            background: FLOOR_SHADE,
          }}
        />
        {/* Ceiling. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0"
          style={{
            height: depth,
            transform: `rotateX(-90deg) translateZ(${-half}px)`,
            transformOrigin: "top center",
            background: CEILING_SHADE,
          }}
        />

        {hotspots.map((hotspot) => (
          <Plaque
            key={hotspot.id}
            hotspot={hotspot}
            depth={depth}
            half={half}
            yaw={yaw}
            motionSafe={motionSafe}
            onFocusPlaque={() => focusPlaque(hotspot)}
            onActivate={() => activatePlaque(hotspot)}
          />
        ))}
      </motion.div>

      {/* HUD — mono readout, decorative only; the live region below carries meaning. */}
      <div
        aria-hidden
        className="border-hairline bg-surface-0/70 text-ink-3 pointer-events-none absolute bottom-2 left-2 flex gap-2 rounded-2 border px-2 py-1 font-mono text-[10px] tracking-[0.06em] tabular-nums"
      >
        <motion.span>{yawText}</motion.span>
        <motion.span>{pitchText}</motion.span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {facing ? `Facing ${facing}` : "Room open"}
      </span>
      <span className="sr-only">{roomDescription}</span>
    </div>
  );
}

const formatYaw = (v: number): string => {
  const rounded = Math.round(v);
  const sign = rounded >= 0 ? "+" : "-";
  return `YAW · ${sign}${String(Math.abs(rounded)).padStart(2, "0")}°`;
};
const formatPitch = (v: number): string => {
  const rounded = Math.round(v);
  const sign = rounded >= 0 ? "+" : "-";
  return `PITCH · ${sign}${String(Math.abs(rounded)).padStart(2, "0")}°`;
};

type PlaqueProps = {
  hotspot: RoomHotspot;
  depth: number;
  half: number;
  yaw: MotionValue<number>;
  motionSafe: boolean;
  onFocusPlaque: () => void;
  onActivate: () => void;
};

/**
 * One wall plaque, pinned on its wall's plane so it rides the same
 * preserve-3d chain as the room. Its "near center" factor derives from the
 * live yaw against the wall's own resting angle, driving the ring and the
 * detail chip; a local flash spring pulses the ring brighter on activation.
 */
function Plaque({
  hotspot,
  depth,
  half,
  yaw,
  motionSafe,
  onFocusPlaque,
  onActivate,
}: PlaqueProps) {
  const at = clamp(hotspot.at ?? 0.5, 0, 1);
  const restYaw = wallYawFor(hotspot.wall, at);

  const flash = useSpring(0, springs.flick);
  const flashControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  React.useEffect(() => () => flashControlsRef.current?.stop(), []);

  const near = useTransform(yaw, (v) => {
    const d = Math.abs(v - restYaw) / YAW_MAX;
    return clamp(1 - d, 0, 1);
  });
  const showDetail = useTransform(near, (n) => (n >= DETAIL_NEAR ? 1 : 0));
  const ringOpacity = useTransform([near, flash], (values) => {
    const [n, f] = values as [number, number];
    return Math.max(n * 0.7, f);
  });
  const ringShadow = useTransform(ringOpacity, (o) =>
    o > 0.02
      ? `0 0 0 2px color-mix(in oklab, var(--accent-bright) ${Math.round(o * 100)}%, transparent)`
      : "0 0 0 0 transparent",
  );

  const wallTransform =
    hotspot.wall === "front"
      ? `translateZ(${-half}px)`
      : hotspot.wall === "left"
        ? `rotateY(90deg) translateZ(${-half}px)`
        : `rotateY(-90deg) translateZ(${-half}px)`;

  const handleClick = () => {
    onActivate();
    flashControlsRef.current?.stop();
    if (motionSafe) {
      flash.set(1);
      flashControlsRef.current = animate(flash, 0, {
        duration: FLASH_S,
        ease: "easeOut",
      });
    } else {
      flash.jump(0);
    }
  };

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2"
      style={{
        left: `${at * 100}%`,
        width: hotspot.wall === "front" ? undefined : depth,
        transform: wallTransform,
        transformStyle: "preserve-3d",
      }}
    >
      <motion.button
        type="button"
        onFocus={onFocusPlaque}
        onClick={handleClick}
        style={{ x: "-50%", boxShadow: ringShadow }}
        className="bg-surface-1/90 border-hairline-strong relative flex flex-col items-center gap-1 rounded-2 border px-3 py-2 text-center outline-none"
      >
        <span className="text-ink font-mono text-[10px] tracking-[0.08em] whitespace-nowrap">
          {hotspot.label}
        </span>
        {hotspot.detail ? (
          <motion.span
            style={{ opacity: showDetail }}
            className="text-ink-3 max-w-32 text-[9px] leading-tight"
          >
            {hotspot.detail}
          </motion.span>
        ) : null}
      </motion.button>
    </div>
  );
}

type RoomFlatProps = {
  hotspots: RoomHotspot[];
  activated: string | null;
  className: string | undefined;
  ariaLabel: string;
  roomDescription: string;
  onActivate: (hotspot: RoomHotspot) => void;
  onFocus: (hotspot: RoomHotspot) => void;
};

const WALL_TITLE: Record<Wall, string> = {
  front: "Front wall",
  left: "Left wall",
  right: "Right wall",
};

/** Reduced motion: the room collapses to a flat, focusable plaque list — no 3D. */
function RoomFlat({
  hotspots,
  activated,
  className,
  ariaLabel,
  roomDescription,
  onActivate,
  onFocus,
}: RoomFlatProps) {
  const activatedHotspot = hotspots.find((h) => h.id === activated);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "border-hairline bg-surface-1 flex flex-col gap-3 rounded-3 border p-3",
        className,
      )}
    >
      {WALLS.map((wall) => {
        const onWall = hotspots.filter((h) => h.wall === wall);
        if (onWall.length === 0) return null;
        return (
          <div key={wall} className="flex flex-col gap-1.5">
            <p className="text-label text-ink-3">{WALL_TITLE[wall]}</p>
            <div className="flex flex-wrap gap-1.5">
              {onWall.map((hotspot) => (
                <button
                  key={hotspot.id}
                  type="button"
                  onFocus={() => onFocus(hotspot)}
                  onClick={() => onActivate(hotspot)}
                  className={cn(
                    "border-hairline-strong bg-surface-2 focus-visible:ring-cobalt-bright/60 rounded-2 border px-3 py-2 text-left outline-none focus-visible:ring-2",
                    activated === hotspot.id && "border-cobalt-bright",
                  )}
                >
                  <span className="text-ink block font-mono text-[10px] tracking-[0.08em]">
                    {hotspot.label}
                  </span>
                  {hotspot.detail ? (
                    <span className="text-ink-3 mt-0.5 block text-[9px] leading-tight">
                      {hotspot.detail}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <span role="status" aria-live="polite" className="sr-only">
        {activatedHotspot ? `Facing ${activatedHotspot.label}` : "Room open"}
      </span>
      <span className="sr-only">{roomDescription}</span>
    </div>
  );
}
