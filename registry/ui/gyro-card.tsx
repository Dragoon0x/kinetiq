"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Sprung, normalized tilt (-1..1) shared with GyroLayer for parallax. */
type GyroContextValue = {
  tiltX: MotionValue<number>;
  tiltY: MotionValue<number>;
};

const GyroContext = React.createContext<GyroContextValue | null>(null);

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** ζ≈0.64 — the leave-reset swings past level once before rebalancing. */
const REBALANCE = { type: "spring", stiffness: 120, damping: 14 } as const;

/** Counter-translation per depth unit at full tilt, in px. */
const PARALLAX_PX = 4;

export type GyroCardProps = {
  /** Peak rotation toward the pointer, in degrees. */
  maxTilt?: number;
  /** Radial sheen tracking the light angle. */
  glare?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * A card with a sense of balance. Pointer position maps to rotateX/rotateY
 * (perspective 800) and the rotation follows on a tight `glide` spring; when
 * the pointer leaves, a dedicated underdamped rebalance spring swings the
 * card past level once before it settles. GyroLayer children
 * counter-translate by depth for parallax, and a radial glare tracks the
 * pointer, fading out at `exitFor(durations.base)`. Focus-visible inside
 * flattens the card ("energized") behind a ring. Reduced motion: no tilt,
 * parallax, or glare — hover is a border emphasis and subtle shadow.
 */
export function GyroCard({
  maxTilt = 8,
  glare = true,
  className,
  children,
}: GyroCardProps) {
  const motionSafe = useMotionSafe();
  const cardRef = React.useRef<HTMLDivElement>(null);
  const rectRef = React.useRef<DOMRect | null>(null);
  const [energized, setEnergized] = React.useState(false);

  // Raw pointer target (-1..1); the spring makes the card chase it.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const tiltX = useSpring(pointerX, GLIDE);
  const tiltY = useSpring(pointerY, GLIDE);
  const rotateX = useTransform(tiltY, (v) => v * -maxTilt);
  const rotateY = useTransform(tiltX, (v) => v * maxTilt);

  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);
  const glareOpacity = useMotionValue(0);
  const glareBackground = useMotionTemplate`radial-gradient(320px circle at ${glareX}% ${glareY}%, var(--primary-foreground), transparent 65%)`;

  const rebalanceControls = React.useRef<ReturnType<typeof animate>[]>([]);
  const glareControls = React.useRef<ReturnType<typeof animate> | null>(null);

  const stopRebalance = React.useCallback(() => {
    for (const controls of rebalanceControls.current) controls.stop();
    rebalanceControls.current = [];
  }, []);

  const stopAllMotion = React.useCallback(() => {
    stopRebalance();
    glareControls.current?.stop();
    glareControls.current = null;
  }, [stopRebalance]);
  React.useEffect(() => stopAllMotion, [stopAllMotion]);

  // Pointer math uses the card's rect; ResizeObserver keeps it honest.
  React.useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      rectRef.current = node.getBoundingClientRect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Energized: focus-visible inside flattens the card and cuts the glare.
  React.useEffect(() => {
    if (!energized) return;
    stopRebalance();
    pointerX.set(0);
    pointerY.set(0);
    glareControls.current?.stop();
    glareControls.current = animate(glareOpacity, 0, exitFor(durations.base));
  }, [energized, pointerX, pointerY, glareOpacity, stopRebalance]);

  const measure = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    rectRef.current = rect;
    return rect;
  };

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe || energized) return;
    measure(event.currentTarget);
    stopRebalance();
    if (glare) {
      glareControls.current?.stop();
      glareControls.current = animate(glareOpacity, 0.1, {
        duration: durations.fast,
      });
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe || energized) return;
    stopRebalance();
    const rect = rectRef.current ?? measure(event.currentTarget);
    if (rect.width === 0 || rect.height === 0) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    pointerX.set(Math.max(-1, Math.min(1, px * 2 - 1)));
    pointerY.set(Math.max(-1, Math.min(1, py * 2 - 1)));
    if (glare) {
      glareX.set(px * 100);
      glareY.set(py * 100);
    }
  };

  const handlePointerLeave = () => {
    if (!motionSafe) return;
    stopRebalance();
    rebalanceControls.current = [
      animate(pointerX, 0, REBALANCE),
      animate(pointerY, 0, REBALANCE),
    ];
    glareControls.current?.stop();
    glareControls.current = animate(glareOpacity, 0, exitFor(durations.base));
  };

  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || target === event.currentTarget) return;
    if (target.matches(":focus-visible")) setEnergized(true);
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setEnergized(false);
    }
  };

  const contextValue = React.useMemo<GyroContextValue>(
    () => ({ tiltX, tiltY }),
    [tiltX, tiltY],
  );

  return (
    <motion.div
      ref={cardRef}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={
        motionSafe
          ? {
              rotateX,
              rotateY,
              transformPerspective: 800,
              transformStyle: "preserve-3d",
            }
          : undefined
      }
      className={cn(
        "border-border bg-card relative overflow-hidden rounded-4 border",
        energized && "ring-2 ring-ring",
        !motionSafe &&
          "transition-[border-color,box-shadow] duration-150 hover:border-input hover:shadow-[var(--shadow-raised)]",
        className,
      )}
    >
      {glare && motionSafe && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{ background: glareBackground, opacity: glareOpacity }}
        />
      )}
      <GyroContext.Provider value={contextValue}>
        {children}
      </GyroContext.Provider>
    </motion.div>
  );
}

export type GyroLayerProps = {
  /** Parallax depth: 0 pinned to the plate, 1 mid (±4px), 2 far (±8px). */
  depth: 0 | 1 | 2;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Depth slot inside a GyroCard: counter-translates against the sprung tilt
 * by `depth × 4px`, so stacked layers read as physical thickness. Depth 0 is
 * pinned; outside a GyroCard (or under reduced motion) it renders static.
 */
export function GyroLayer({ depth, className, children }: GyroLayerProps) {
  const context = React.useContext(GyroContext);
  const still = useMotionValue(0);
  const sourceX = context?.tiltX ?? still;
  const sourceY = context?.tiltY ?? still;
  const x = useTransform(sourceX, (v) => v * depth * -PARALLAX_PX);
  const y = useTransform(sourceY, (v) => v * depth * -PARALLAX_PX);

  return (
    <motion.div style={{ x, y }} className={className}>
      {children}
    </motion.div>
  );
}
