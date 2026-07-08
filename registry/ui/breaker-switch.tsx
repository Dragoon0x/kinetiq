"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/**
 * Fixed geometry per size (px). Travel is derived from these constants, so
 * the thumb never needs a layout measurement. `labeledWidth` applies when
 * `onLabel`/`offLabel` render inside the track ends.
 */
const SIZES = {
  sm: { height: 20, width: 36, labeledWidth: 56, thumb: 14, pad: 3, text: "text-[8px]" },
  md: { height: 24, width: 44, labeledWidth: 68, thumb: 18, pad: 3, text: "text-[9px]" },
  lg: { height: 32, width: 60, labeledWidth: 84, thumb: 26, pad: 3, text: "text-[10px]" },
} as const;

export type BreakerSwitchProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  | "value"
  | "onChange"
  | "defaultChecked"
  | "children"
  | "role"
  | "aria-checked"
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: keyof typeof SIZES;
  /** Tiny uppercase mono text inside the on-side track end. */
  onLabel?: string;
  /** Tiny uppercase mono text inside the off-side track end. */
  offLabel?: string;
  /** Submits `value` (default "on") under `name` while checked. */
  name?: string;
  value?: string;
  /** Adjacent clickable `<label>`, associated to the switch via id. */
  label?: React.ReactNode;
};

/**
 * A toggle thrown like a breaker. While held, the thumb stretches toward the
 * far side on `flick` (anticipation); releasing throws it across on `snap`,
 * squashing it against the track end on arrival while the track recoils 1px
 * against the throw. State color crossfades on a fast tween — which is all
 * that remains under reduced motion.
 */
export function BreakerSwitch({
  checked: controlledChecked,
  defaultChecked = false,
  onCheckedChange,
  size = "md",
  onLabel,
  offLabel,
  disabled,
  name,
  value,
  label,
  id,
  className,
  onClick,
  onPointerDown,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  ...props
}: BreakerSwitchProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledChecked, setUncontrolledChecked] =
    React.useState(defaultChecked);
  const checked = controlledChecked ?? uncontrolledChecked;
  const autoId = React.useId();
  const switchId = id ?? autoId;

  const geo = SIZES[size];
  const hasTrackLabels = Boolean(onLabel) || Boolean(offLabel);
  const width = hasTrackLabels ? geo.labeledWidth : geo.width;
  const travel = width - geo.thumb - geo.pad * 2;
  const labelZone = width - geo.thumb - geo.pad;

  /** Track recoil (px) — kicked opposite the throw, settles on flick. */
  const trackX = useMotionValue(0);
  /** Thumb deformation — 1.1 anticipation stretch, 0.85 arrival squash. */
  const stretch = useMotionValue(1);
  const stretchAnimation = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const prevChecked = React.useRef(checked);

  // Impact choreography runs off the resolved checked value, so controlled
  // flips from outside land with the same conviction as a click.
  React.useEffect(() => {
    if (prevChecked.current === checked) return;
    prevChecked.current = checked;
    if (!motionSafe) return;
    trackX.stop();
    trackX.set(checked ? -1 : 1);
    animate(trackX, 0, springs.flick);
    stretchAnimation.current?.stop();
    stretchAnimation.current = animate(stretch, [stretch.get(), 0.85, 1], {
      ...springs.snap,
      // The squash waits for the snap travel to reach the far wall (~120ms).
      delay: 0.12,
    });
  }, [checked, motionSafe, stretch, trackX]);

  const beginPress = React.useCallback(() => {
    if (disabled || !motionSafe) return;
    stretchAnimation.current?.stop();
    stretchAnimation.current = animate(stretch, 1.1, springs.flick);
  }, [disabled, motionSafe, stretch]);

  const relaxPress = React.useCallback(() => {
    if (!motionSafe) return;
    stretchAnimation.current?.stop();
    stretchAnimation.current = animate(stretch, 1, springs.flick);
  }, [motionSafe, stretch]);

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      {label !== undefined && (
        <label
          htmlFor={switchId}
          className={cn(
            "cursor-pointer text-sm select-none",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          {label}
        </label>
      )}
      <button
        {...props}
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        disabled={disabled}
        onClick={(event) => {
          onClick?.(event);
          const next = !checked;
          if (controlledChecked === undefined) setUncontrolledChecked(next);
          onCheckedChange?.(next);
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.button === 0) beginPress();
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          relaxPress();
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          relaxPress();
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key === " " && !event.repeat) beginPress();
        }}
        onKeyUp={(event) => {
          onKeyUp?.(event);
          if (event.key === " ") relaxPress();
        }}
        className={cn(
          "relative shrink-0 rounded-full select-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <motion.span
          aria-hidden
          style={{
            x: trackX,
            width,
            height: geo.height,
            transitionDuration: `${durations.fast}s`,
          }}
          className={cn(
            "relative block rounded-full border transition-colors",
            checked ? "border-primary bg-primary" : "border-input bg-muted",
          )}
        >
          {onLabel !== undefined && (
            <span
              style={{
                width: labelZone,
                transitionDuration: `${durations.fast}s`,
              }}
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center font-mono font-medium tracking-widest uppercase transition-opacity",
                geo.text,
                checked ? "text-primary-foreground/90 opacity-100" : "opacity-0",
              )}
            >
              {onLabel}
            </span>
          )}
          {offLabel !== undefined && (
            <span
              style={{
                width: labelZone,
                transitionDuration: `${durations.fast}s`,
              }}
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center font-mono font-medium tracking-widest uppercase transition-opacity",
                geo.text,
                checked ? "opacity-0" : "text-muted-foreground opacity-100",
              )}
            >
              {offLabel}
            </span>
          )}
          <motion.span
            className="absolute block"
            style={{
              top: geo.pad,
              left: geo.pad,
              width: geo.thumb,
              height: geo.thumb,
            }}
            initial={false}
            animate={{ x: checked ? travel : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <motion.span
              className="bg-background block size-full rounded-full shadow-sm"
              style={{
                scaleX: stretch,
                // Anchor deformation on the wall the thumb sits against, so
                // the anticipation stretch and arrival squash both read as
                // contact with that end.
                transformOrigin: checked ? "100% 50%" : "0% 50%",
              }}
            />
          </motion.span>
        </motion.span>
      </button>
      {name !== undefined && (
        <input
          type="hidden"
          name={name}
          value={value ?? "on"}
          // Mirrors native checkbox semantics: submits only while on.
          disabled={!checked || disabled}
        />
      )}
    </div>
  );
}
