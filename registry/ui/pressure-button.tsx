"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const VARIANT_CLASSES = {
  solid:
    "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95",
  outline:
    "border border-input bg-transparent text-foreground hover:bg-accent",
  ghost: "bg-transparent text-foreground hover:bg-accent",
  danger:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/95",
} as const;

const SIZE_CLASSES = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-base",
} as const;

export type PressureButtonProps = Omit<
  React.ComponentPropsWithoutRef<typeof motion.button>,
  "children"
> & {
  variant?: keyof typeof VARIANT_CLASSES;
  size?: keyof typeof SIZE_CLASSES;
  /**
   * Milliseconds the button must be held before it confirms. While held, a
   * gauge ring fills; releasing early springs it back. Confirmation fires
   * `onConfirm`, not `onClick`.
   */
  holdToConfirm?: number;
  onConfirm?: () => void;
  children?: React.ReactNode;
};

/**
 * A button that pushes back. Press squashes it on `flick`; release rebounds
 * on `snap`. With `holdToConfirm`, a gauge ring fills while held and the
 * button confirms with a `recoil` pop — Escape or early release cancels.
 */
export function PressureButton({
  variant = "solid",
  size = "md",
  holdToConfirm,
  onConfirm,
  onClick,
  onKeyDown,
  onKeyUp,
  disabled,
  className,
  children,
  ...props
}: PressureButtonProps) {
  const motionSafe = useMotionSafe();
  const [pressed, setPressed] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);
  const holdProgress = useMotionValue(0);
  const gaugeDashOffset = useTransform(holdProgress, [0, 1], [1, 0]);
  const holdAnimation = React.useRef<ReturnType<typeof animate> | null>(null);
  const keyHeld = React.useRef(false);
  const hintId = React.useId();

  const isHold = typeof holdToConfirm === "number" && holdToConfirm > 0;

  const stopHold = React.useCallback(
    (didConfirm: boolean) => {
      holdAnimation.current?.stop();
      holdAnimation.current = null;
      if (didConfirm) {
        holdProgress.set(0);
      } else {
        holdAnimation.current = animate(holdProgress, 0, {
          duration: 0.15,
        });
      }
    },
    [holdProgress],
  );

  const beginPress = React.useCallback(() => {
    if (disabled) return;
    setPressed(true);
    if (!isHold) return;
    holdAnimation.current?.stop();
    holdAnimation.current = animate(holdProgress, 1, {
      // Progress is feedback, not flourish — it fills under reduced motion too.
      duration: holdToConfirm / 1000,
      ease: "linear",
      onComplete: () => {
        setPressed(false);
        setConfirmed(true);
        stopHold(true);
        onConfirm?.();
      },
    });
  }, [disabled, holdProgress, holdToConfirm, isHold, onConfirm, stopHold]);

  const endPress = React.useCallback(
    (didConfirm = false) => {
      setPressed(false);
      if (isHold && !didConfirm) stopHold(false);
    },
    [isHold, stopHold],
  );

  React.useEffect(() => {
    if (!confirmed) return;
    const timer = window.setTimeout(() => setConfirmed(false), 600);
    return () => window.clearTimeout(timer);
  }, [confirmed]);

  const squash = motionSafe && pressed && !disabled;

  return (
    <motion.button
      type="button"
      disabled={disabled}
      aria-describedby={isHold ? hintId : undefined}
      onPointerDown={(event) => {
        if (event.button === 0) beginPress();
      }}
      onPointerUp={() => endPress()}
      onPointerLeave={() => endPress()}
      onPointerCancel={() => endPress()}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Escape" && isHold) endPress();
        if ((event.key === " " || event.key === "Enter") && !keyHeld.current) {
          keyHeld.current = true;
          if (isHold) event.preventDefault();
          beginPress();
        }
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        if (event.key === " " || event.key === "Enter") {
          keyHeld.current = false;
          endPress();
        }
      }}
      onClick={(event) => {
        // A hold button confirms by holding, never by click.
        if (isHold) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      animate={
        confirmed && motionSafe
          ? { scaleX: [1, 1.04, 1], scaleY: [1, 1.04, 1] }
          : squash
            ? { scaleX: 1.02, scaleY: 0.96 }
            : { scaleX: 1, scaleY: 1 }
      }
      transition={
        confirmed ? springs.recoil : squash ? springs.flick : springs.snap
      }
      className={cn(
        "relative inline-flex items-center justify-center rounded-2 font-medium whitespace-nowrap select-none",
        "disabled:pointer-events-none disabled:opacity-50",
        !motionSafe && "active:brightness-90",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {isHold && (
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-3.5 shrink-0 -rotate-90"
        >
          <circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="2"
          />
          <motion.circle
            cx="8"
            cy="8"
            r="6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: gaugeDashOffset }}
          />
        </svg>
      )}
      {children}
      {isHold && (
        <span id={hintId} className="sr-only">
          Hold to confirm
        </span>
      )}
      {isHold && (
        <span role="status" className="sr-only">
          {confirmed ? "Confirmed" : ""}
        </span>
      )}
    </motion.button>
  );
}
