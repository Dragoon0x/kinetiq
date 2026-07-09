"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Sprung, normalized pointer position (-1..1) shared with every ParallaxLayer. */
type ParallaxContextValue = {
  px: MotionValue<number>;
  py: MotionValue<number>;
};

const ParallaxContext = React.createContext<ParallaxContextValue | null>(null);

/**
 * `drift` without its discriminant — useSpring takes bare spring options.
 * The ambient/parallax-settle spring: layers ease home rather than snap.
 */
const DRIFT = {
  stiffness: springs.drift.stiffness,
  damping: springs.drift.damping,
  mass: springs.drift.mass,
} as const;

/** Peak shift of the nearest (depth 1) layer at full pointer throw, in px. */
const SHIFT = 32;
/** Peak depth separation: nearest layer sits this many px forward. */
const DEPTH_Z = 40;

/** Clamp a normalized pointer axis into [-1, 1]. */
const clampAxis = (v: number): number => Math.max(-1, Math.min(1, v));

export type ParallaxSceneProps = {
  /** ParallaxLayer elements (recommended max 4). */
  children: React.ReactNode;
  /** Degrees the scene rotates toward the pointer. */
  maxTilt?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A depth-layered diorama that reacts to the pointer. The scene owns two
 * motion values for the normalized pointer position (px, py in -1..1, with
 * 0,0 at center), read from the container's rect in `onPointerMove` and eased
 * on the `drift` spring; on pointer-leave both spring home to 0. The outer
 * container holds the perspective, and a `preserve-3d` inner wrapper rotates
 * `rotateX = py·-maxTilt` / `rotateY = px·maxTilt` toward the pointer. The
 * sprung pointer values reach each ParallaxLayer through context, so nearer
 * layers parade past farther ones. Cap 4 layers so the depth stays legible.
 *
 * The parallax is a decorative enhancement: layer *content* stays in normal
 * flow and fully accessible. Reduced motion: no perspective, tilt, or
 * subscribed springs — layers render flat and stationary at their neutral
 * position, so the scene stays visually complete.
 */
export function ParallaxScene({
  children,
  maxTilt = 8,
  className,
  "aria-label": ariaLabel,
}: ParallaxSceneProps) {
  const motionSafe = useMotionSafe();
  const sceneRef = React.useRef<HTMLDivElement>(null);
  const rectRef = React.useRef<DOMRect | null>(null);

  // Raw pointer target (-1..1); the drift spring makes the scene chase it.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const px = useSpring(pointerX, DRIFT);
  const py = useSpring(pointerY, DRIFT);
  const rotateX = useTransform(py, (v) => v * -maxTilt);
  const rotateY = useTransform(px, (v) => v * maxTilt);

  // Pointer math uses the scene's rect; ResizeObserver keeps it honest.
  React.useEffect(() => {
    const node = sceneRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      rectRef.current = node.getBoundingClientRect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measure = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    rectRef.current = rect;
    return rect;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe) return;
    const rect = rectRef.current ?? measure(event.currentTarget);
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    pointerX.set(clampAxis(nx * 2 - 1));
    pointerY.set(clampAxis(ny * 2 - 1));
  };

  const handlePointerLeave = () => {
    if (!motionSafe) return;
    // Springs ease both axes back to neutral.
    pointerX.set(0);
    pointerY.set(0);
  };

  const contextValue = React.useMemo<ParallaxContextValue>(
    () => ({ px, py }),
    [px, py],
  );

  // Reduced motion: flat, stationary stack — no perspective, tilt, or springs.
  if (!motionSafe) {
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn("relative overflow-hidden", className)}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={sceneRef}
      role="group"
      aria-label={ariaLabel}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      className={cn("relative overflow-hidden", className)}
      style={{ perspective: 900 }}
    >
      {/* The tilting plane: every layer shares this preserve-3d space. */}
      <motion.div
        className="relative h-full w-full"
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
      >
        <ParallaxContext.Provider value={contextValue}>
          {children}
        </ParallaxContext.Provider>
      </motion.div>
    </div>
  );
}

export type ParallaxLayerProps = {
  /** 0 = far (moves least) … 1 = near (moves most). */
  depth: number;
  className?: string;
  children: React.ReactNode;
};

/**
 * One depth slot inside a ParallaxScene. It reads the sprung pointer from
 * context and translates by `x = px·depth·SHIFT` / `y = py·depth·SHIFT`, and
 * sits at an integer `translateZ` proportional to depth so nearer layers are
 * physically closer. This is the only `will-change: transform` element per
 * layer. Used outside a ParallaxScene (or under reduced motion) it renders
 * its children statically, so it always degrades safely.
 */
export function ParallaxLayer({ depth, className, children }: ParallaxLayerProps) {
  const context = React.useContext(ParallaxContext);
  // Fallback source so the hooks below stay unconditional out of context.
  const still = useMotionValue(0);
  const sourceX = context?.px ?? still;
  const sourceY = context?.py ?? still;
  const x = useTransform(sourceX, (v) => v * depth * SHIFT);
  const y = useTransform(sourceY, (v) => v * depth * SHIFT);
  // Integer translateZ: nearer layers forward, on a whole pixel to avoid seams.
  const z = Math.round(depth * DEPTH_Z);

  // Outside a scene: static children, no motion subscribed.
  if (!context) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      style={{ x, y, z, willChange: "transform" }}
    >
      {children}
    </motion.div>
  );
}
