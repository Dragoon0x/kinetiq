"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ContextLayer = {
  id: string;
  /** What the layer is: Messages, Memory, System. */
  label: string;
  tokens: number;
  /** The resting readout — "12 turns", "4 facts" — before the size takes over. */
  note?: string;
};

export type ContextStackProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Top of the stack first; the last layer is the base. */
  layers: ContextLayer[];
  /** Tokens the model can take; the meter's maximum. */
  budget: number;
  /** Formats every count. @default Intl.NumberFormat("en-US") */
  format?: (tokens: number) => string;
  /** Fires when a slab lifts or settles, with the lifted id or null. */
  onLift?: (id: string | null) => void;
  /** Names the stack. */
  label: string;
  className?: string;
};

/** The stack's full height and the thinnest a slab may draw, in px. */
const STACK = 168;
const FLOOR = 36;

/** One material, thinner toward the base: the strata and their meter stripes share it. */
const SHADES = [
  "bg-cobalt-bright",
  "bg-cobalt-bright/60",
  "bg-cobalt-bright/35",
];

const round3 = (value: number) => Number(value.toFixed(3));
const numberFormat = new Intl.NumberFormat("en-US");
const defaultFormat = (tokens: number) => numberFormat.format(tokens);

/**
 * The model's context as strata: messages on top, memory beneath, the system
 * prompt at the base. Each slab's thickness is its share of the total — a
 * height on `glide` from a 36px floor — so the stack is a bar chart turned
 * on its side and stacked. Hovering or focusing a slab lifts it by
 * `distances.step` on `glide`, a surface shifting with no overshoot, and its
 * readout cross-fades from the layer's note to its size and share. Pressing
 * pins the lift so the readout survives the pointer leaving; pressing again
 * or Escape releases it. Beneath, a meter fills to the total's share of the
 * budget on `glide`, striped by layer from the base up, and the lifted
 * layer's stripe stays bright while the others dim.
 *
 * Every slab is a button whose name already carries the size and share, so
 * the readout is never the only place the number lives; Tab lifts, Enter or
 * Space pins. Under reduced motion nothing lifts: the slab brightens its
 * border and the readout swaps, while thickness and the meter still animate
 * on a tween because they are information.
 */
export function ContextStack({
  ref,
  layers,
  budget,
  format = defaultFormat,
  onLift,
  label,
  className,
}: ContextStackProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [hover, setHover] = React.useState<string | null>(null);
  const [focus, setFocus] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const lifted = pinned ?? hover ?? focus;

  // Three sources feed one lifted id, so each handler settles the next id
  // itself and reports a change from the event rather than from an effect.
  const apply = (next: {
    hover?: string | null;
    focus?: string | null;
    pinned?: string | null;
  }) => {
    const h = next.hover === undefined ? hover : next.hover;
    const f = next.focus === undefined ? focus : next.focus;
    const p = next.pinned === undefined ? pinned : next.pinned;
    if (next.hover !== undefined) setHover(next.hover);
    if (next.focus !== undefined) setFocus(next.focus);
    if (next.pinned !== undefined) setPinned(next.pinned);
    const after = p ?? h ?? f;
    if (after !== lifted) onLift?.(after);
  };

  const total = layers.reduce(
    (sum, layer) => sum + Math.max(0, layer.tokens),
    0,
  );
  const span = budget > 0 ? budget : 1;
  const percent = Math.round((total / span) * 100);
  const spare = Math.max(0, STACK - FLOOR * layers.length);
  const shareOf = (tokens: number) =>
    total > 0 ? Math.max(0, tokens) / total : 1 / Math.max(1, layers.length);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const grow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] tabular-nums transition-colors",
            total > budget ? "text-danger" : "text-ink-3",
          )}
        >
          {format(total)} / {format(budget)}
        </span>
      </div>

      <div
        role="group"
        aria-labelledby={labelId}
        onKeyDown={(event) => {
          if (event.key === "Escape" && pinned !== null) {
            event.preventDefault();
            apply({ pinned: null });
          }
        }}
        className="flex flex-col gap-1"
      >
        {layers.map((layer, index) => {
          const share = shareOf(layer.tokens);
          const height = Math.round(FLOOR + share * spare);
          const up = lifted === layer.id;
          const shade = SHADES[Math.min(index, SHADES.length - 1)];
          const size = `${format(layer.tokens)} · ${Math.round(share * 100)}%`;
          return (
            <motion.button
              key={layer.id}
              type="button"
              aria-pressed={pinned === layer.id}
              aria-label={`${layer.label}, ${format(layer.tokens)} tokens, ${Math.round(share * 100)} percent`}
              onPointerEnter={() => apply({ hover: layer.id })}
              onPointerLeave={() => apply({ hover: null })}
              onFocus={() => apply({ focus: layer.id })}
              onBlur={() => apply({ focus: null })}
              onClick={() =>
                apply({ pinned: pinned === layer.id ? null : layer.id })
              }
              initial={false}
              animate={{
                height,
                y: up && motionSafe ? -distances.step : 0,
              }}
              transition={{ height: grow, y: grow }}
              className={cn(
                "relative flex w-full items-center gap-3 overflow-hidden rounded-2 border bg-surface-0 pr-3 pl-4 text-left transition-[border-color,box-shadow] outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                up
                  ? "border-cobalt-bright shadow-md"
                  : "border-hairline-strong shadow-none",
                pinned === layer.id && "bg-cobalt-wash",
              )}
            >
              <span
                aria-hidden
                className={cn("absolute inset-y-0 left-0 w-1", shade)}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {layer.label}
              </span>
              {/* Both readouts share one grid cell so the cross-fade never
                  reflows the slab and no width is reserved for the longer. */}
              <span
                aria-hidden
                className="grid shrink-0 justify-items-end font-mono text-[11px] tabular-nums"
              >
                <motion.span
                  className="col-start-1 row-start-1 text-ink-3"
                  initial={false}
                  animate={{ opacity: up ? 0 : 1 }}
                  transition={fade}
                >
                  {layer.note ?? format(layer.tokens)}
                </motion.span>
                <motion.span
                  className="col-start-1 row-start-1 text-foreground"
                  initial={false}
                  animate={{ opacity: up ? 1 : 0 }}
                  transition={fade}
                >
                  {size}
                </motion.span>
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          role="meter"
          aria-labelledby={labelId}
          aria-valuenow={Math.min(Math.round(total), budget)}
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-valuetext={`${format(total)} of ${format(budget)} tokens, ${percent} percent`}
          className="flex h-2 w-full overflow-hidden rounded-full bg-hairline-strong"
        >
          {/* Base first: the stripes read left to right the way the strata
              read bottom to top. */}
          {[...layers].reverse().map((layer, index) => {
            const shade =
              SHADES[Math.min(layers.length - 1 - index, SHADES.length - 1)];
            const width = round3((Math.max(0, layer.tokens) / span) * 100);
            return (
              <motion.span
                key={layer.id}
                aria-hidden
                initial={false}
                animate={{
                  width: `${width}%`,
                  opacity: lifted === null || lifted === layer.id ? 1 : 0.35,
                }}
                transition={{ width: grow, opacity: fade }}
                className={cn("h-full shrink-0", shade)}
              />
            );
          })}
        </div>
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {percent}% of budget
        </span>
      </div>

      <span role="status" className="sr-only">
        {`${format(total)} of ${format(budget)} tokens`}
      </span>
    </div>
  );
}
