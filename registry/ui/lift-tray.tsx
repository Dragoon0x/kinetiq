"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { springs } from "@/registry/lib/motion";
import {
  liftShadow,
  liftShadowCss,
  type LiftShadow,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type TrayItem = {
  id: string;
  label: string;
  node: React.ReactNode;
};

export type LiftTrayProps = {
  /** Three to five instruments, laid in a row. */
  items: TrayItem[];
  /** Fires on click or Enter, after the pick pop is issued. */
  onPick?: (id: string) => void;
  /** Peak levitation in px at full altitude. @default 14 */
  maxLift?: number;
  className?: string;
  /** Accessible name for the tray; also engraved on its nameplate. */
  "aria-label"?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** Altitude targets by row distance from the raised item. */
const SYMPATHY = [1, 0.18, 0.06] as const;

/** Extra altitude a pick adds before the recoil spring hands it back. */
const PICK_POP = 0.15;

/** Ground-ellipse footprint — contracts as the shadow's spread pulls in. */
const groundScaleOf = (s: LiftShadow): number => 1 + s.spread * 0.06;

/** Ground-ellipse softness — a quarter of the contact shadow's blur. */
const groundBlurOf = (s: LiftShadow): number => s.blur * 0.25;

/** Resting shadow tokens: the static ground pass under reduced motion. */
const GROUNDED = liftShadow(0);
const GROUND_AT_REST = {
  opacity: GROUNDED.opacity,
  scale: groundScaleOf(GROUNDED),
  filter: `blur(${groundBlurOf(GROUNDED)}px)`,
};

/**
 * Instruments that levitate off a recessed tray. Each item owns an altitude
 * target chased by a glide spring; hover (fine pointers) or focus raises it
 * to full lift while neighbors get a sympathetic stir — 0.18 beside, 0.06
 * two over. One altitude drives two views of the same truth: the plate's
 * contact shadow stretches and fades via liftShadowCss while the ground
 * ellipse painted on the tray shrinks, softens, and thins in step. A pick
 * pops extra altitude on the recoil spring and announces politely. Under
 * reduced motion nothing levitates: hover and focus are a flat color
 * highlight and the ground shadows hold their resting pass.
 */
export function LiftTray({
  items,
  onPick,
  maxLift = 14,
  className,
  "aria-label": ariaLabel = "Lift tray",
}: LiftTrayProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const live = motionSafe && pointerFine;
  const channelsRef = React.useRef(new Map<string, MotionValue<number>>());
  const [announcement, setAnnouncement] = React.useState("");

  const list = items.slice(0, 5);

  /** Raise one plate to full lift and stir its neighbors in sympathy. */
  const raiseAt = (index: number) => {
    list.forEach((item, i) => {
      const target = channelsRef.current.get(item.id);
      if (!target) return;
      target.set(SYMPATHY[Math.abs(index - i)] ?? 0);
    });
  };

  const settleAll = () => {
    for (const target of channelsRef.current.values()) target.set(0);
  };

  const handlePick = (item: TrayItem) => {
    setAnnouncement(`${item.label} lifted`);
    onPick?.(item.id);
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      onPointerLeave={live ? settleAll : undefined}
      className={cn(
        "border-hairline bg-surface-0 relative rounded-3 border p-3 shadow-[inset_0_1px_5px_rgb(0_0_0/0.16)]",
        className,
      )}
    >
      <div className="flex items-stretch gap-2">
        {list.map((item, index) => (
          <TrayPlate
            key={item.id}
            item={item}
            index={index}
            live={live}
            motionSafe={motionSafe}
            maxLift={maxLift}
            channelsRef={channelsRef}
            onRaise={raiseAt}
            onSettle={settleAll}
            onPickItem={handlePick}
          />
        ))}
      </div>

      {/* The tray's front lip, nameplate seated under it. */}
      <div className="border-hairline-strong mt-3 flex justify-center border-t pt-1.5">
        <span
          aria-hidden
          className="border-hairline bg-surface-1 text-ink-3 rounded-1 border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.15em] uppercase"
        >
          {ariaLabel}
        </span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type TrayPlateProps = {
  item: TrayItem;
  index: number;
  live: boolean;
  motionSafe: boolean;
  maxLift: number;
  channelsRef: React.RefObject<Map<string, MotionValue<number>>>;
  onRaise: (index: number) => void;
  onSettle: () => void;
  onPickItem: (item: TrayItem) => void;
};

function TrayPlate({
  item,
  index,
  live,
  motionSafe,
  maxLift,
  channelsRef,
  onRaise,
  onSettle,
  onPickItem,
}: TrayPlateProps) {
  const target = useMotionValue(0);
  const altitude = useSpring(target, GLIDE);
  const pick = useMotionValue(0);
  const pickControls = React.useRef<ReturnType<typeof animate> | null>(null);

  // Register this plate's altitude target with the tray; unhook on unmount.
  React.useEffect(() => {
    const channels = channelsRef.current;
    channels.set(item.id, target);
    return () => {
      channels.delete(item.id);
      pickControls.current?.stop();
    };
  }, [channelsRef, item.id, target]);

  // One truth: sprung altitude plus the pick pop feeds every view below.
  const lift = useTransform([altitude, pick], (values) => {
    const [a, p] = values as [number, number];
    return a + p;
  });
  const y = useTransform(lift, (l) => -l * maxLift);
  const scale = useTransform(lift, (l) => 1 + l * 0.05);
  const boxShadow = useTransform(lift, (l) => liftShadowCss(l));
  const groundOpacity = useTransform(lift, (l) => liftShadow(l).opacity);
  const groundScale = useTransform(lift, (l) => groundScaleOf(liftShadow(l)));
  const groundFilter = useTransform(
    lift,
    (l) => `blur(${groundBlurOf(liftShadow(l))}px)`,
  );

  const handleClick = () => {
    if (motionSafe) {
      pickControls.current?.stop();
      pick.set(PICK_POP);
      pickControls.current = animate(pick, 0, springs.recoil);
    }
    onPickItem(item);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <motion.button
        type="button"
        onClick={handleClick}
        onPointerEnter={live ? () => onRaise(index) : undefined}
        onFocus={motionSafe ? () => onRaise(index) : undefined}
        onBlur={motionSafe ? onSettle : undefined}
        style={motionSafe ? { y, scale, boxShadow } : undefined}
        className={cn(
          "border-hairline bg-surface-2 focus-visible:ring-cobalt-bright/50 flex w-full min-w-0 flex-1 flex-col items-center justify-between gap-2 rounded-2 border p-3 outline-none focus-visible:ring-2",
          !motionSafe &&
            "hover:border-hairline-strong hover:bg-surface-1 focus-visible:bg-surface-1 transition-colors duration-150",
        )}
      >
        <span aria-hidden className="flex h-8 items-center justify-center">
          {item.node}
        </span>
        <span className="text-ink w-full truncate text-center font-mono text-[10px] tracking-[0.08em]">
          {item.label}
        </span>
      </motion.button>

      {/* The plate's ground shadow, painted on the tray beneath it. */}
      <motion.span
        aria-hidden
        style={
          motionSafe
            ? { opacity: groundOpacity, scale: groundScale, filter: groundFilter }
            : GROUND_AT_REST
        }
        className="pointer-events-none mx-2 mt-1 h-1.5 rounded-[100%] bg-[oklch(0.05_0.02_258)]"
      />
    </div>
  );
}
