"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PickModel = {
  id: string;
  name: string;
  /** One short line on what it is for. */
  note?: string;
  /** Speed on 0..scale. */
  speed: number;
  /** Quality on 0..scale. */
  quality: number;
};

export type ModelPickProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** At least one. */
  models: PickModel[];
  /** Segments per bar; speed and quality are read against it. @default 5 */
  scale?: number;
  /** Controlled model id. */
  value?: string;
  /** Initial model id for uncontrolled usage. @default the first model */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Names the group and heads the card. */
  label: string;
  className?: string;
};

/**
 * One five-segment bar. The dim reading is always drawn so an unchosen model
 * still compares; choosing lays the cobalt reading over it segment by segment,
 * mounted only while chosen so every pick re-draws from nothing.
 */
function Bar({
  value,
  scale,
  chosen,
  motionSafe,
}: {
  value: number;
  scale: number;
  chosen: boolean;
  motionSafe: boolean;
}) {
  const filled = Math.min(scale, Math.max(0, Math.round(value)));
  const stagger = cascade(scale);
  return (
    <span
      aria-hidden
      className="grid h-1.5 w-12 gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${scale}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: scale }, (_, index) => (
        <span
          key={index}
          className={cn(
            "relative overflow-hidden rounded-1",
            index < filled ? "bg-hairline-strong" : "bg-hairline",
          )}
        >
          {chosen && index < filled ? (
            <motion.span
              className="absolute inset-0 origin-left rounded-1 bg-cobalt-bright"
              initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
              animate={motionSafe ? { scaleX: 1 } : { opacity: 1 }}
              // A reading settles: glide, no overshoot, each segment a beat
              // after the last so the bar is read left to right.
              transition={
                motionSafe
                  ? { ...springs.glide, delay: index * stagger }
                  : { duration: durations.fast, ease: easings.enter }
              }
            />
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * Choose the mind. A radio list of models, each row carrying speed and
 * quality as five-segment bars, under a header whose badge names the choice.
 * Picking a row re-draws its bars — the segments fill left to right in a
 * `cascade()` on `glide`, a reading settling rather than a switch flipping —
 * while every other row's bars stay dim and still, so the comparison never
 * leaves the screen. The header badge swaps with a slide: the old name lifts
 * out on the exit ease, the new one rises from `distances.step` on `snap`,
 * and the pill's width glides to fit. The radio disc draws on `flick`.
 *
 * A radio group with a roving tabindex: Up and Down (or Left and Right) move
 * and select without wrapping, Home and End jump, Space and Enter select.
 * Each row is named by the model and described by its readings, and a status
 * line speaks the choice on settle. Under reduced motion the bars fill on a
 * fast tween without stagger and the badge cross-fades in place.
 */
export function ModelPick({
  ref,
  models,
  scale = 5,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
}: ModelPickProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const first = models[0];
  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? first?.id ?? "",
  );
  const current = value ?? uncontrolled;
  const currentIndex = Math.max(
    0,
    models.findIndex((model) => model.id === current),
  );
  const chosen = models[currentIndex];
  const [announce, setAnnounce] = React.useState("");

  // The badge's width is measured from the name in flow — the outgoing name
  // is lifted out by popLayout — and the pill glides to it, so the text is
  // never scale-corrected the way a `layout` width change would leave it.
  const nameRef = React.useRef<HTMLSpanElement | null>(null);
  const [pillWidth, setPillWidth] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = nameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setPillWidth(Math.round(node.getBoundingClientRect().width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const readings = (model: PickModel) =>
    `speed ${Math.round(model.speed)} of ${scale}, quality ${Math.round(
      model.quality,
    )} of ${scale}`;

  const select = (next: PickModel) => {
    if (next.id === current) return;
    if (value === undefined) setUncontrolled(next.id);
    onValueChange?.(next.id);
    setAnnounce(`${next.name} chosen. ${readings(next)}.`);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(models.length - 1, Math.max(0, index));
    const target = models[clamped];
    if (!target) return;
    document.getElementById(`${baseId}-row-${clamped}`)?.focus();
    select(target);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        return;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(models.length - 1);
        return;
      case " ":
      case "Enter": {
        event.preventDefault();
        const target = models[index];
        if (target) select(target);
        return;
      }
      default:
        return;
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-7 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <motion.span
          initial={false}
          animate={{ width: pillWidth ?? "auto" }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.move }
          }
          className="box-content flex h-6 shrink-0 items-center overflow-hidden rounded-full border border-hairline-strong bg-surface-2 font-mono text-[11px] text-foreground"
        >
          <span
            ref={nameRef}
            className="relative flex h-full shrink-0 items-center px-2"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={chosen?.id ?? "none"}
                className="block whitespace-nowrap"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.step : 0,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe ? { ...springs.snap, opacity: fade } : fade
                }
              >
                {chosen?.name ?? "No model"}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex flex-col gap-1"
      >
        {models.map((model, index) => {
          const checked = index === currentIndex;
          const nameId = `${baseId}-name-${index}`;
          const descId = `${baseId}-desc-${index}`;
          return (
            <button
              key={model.id}
              type="button"
              role="radio"
              id={`${baseId}-row-${index}`}
              aria-checked={checked}
              aria-labelledby={nameId}
              aria-describedby={descId}
              tabIndex={checked ? 0 : -1}
              onClick={() => select(model)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-2 border px-2.5 py-2 text-left transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "border-cobalt-bright/50 bg-cobalt-wash"
                  : "border-hairline bg-surface-0 hover:bg-accent",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  checked ? "border-cobalt-bright" : "border-input",
                )}
              >
                <motion.span
                  className="size-2 rounded-full bg-cobalt-bright"
                  initial={false}
                  animate={{ scale: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
                  transition={
                    motionSafe ? { ...springs.flick, opacity: fade } : fade
                  }
                />
              </span>

              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  id={nameId}
                  title={model.name}
                  className="truncate text-sm font-medium text-foreground"
                >
                  {model.name}
                </span>
                {model.note ? (
                  <span
                    title={model.note}
                    className="truncate text-[11px] text-ink-3"
                  >
                    {model.note}
                  </span>
                ) : null}
                <span id={descId} className="sr-only">
                  {readings(model)}
                </span>
              </span>

              <span className="grid shrink-0 grid-cols-[auto_auto] items-center gap-x-2 gap-y-1.5">
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Speed
                </span>
                <Bar
                  value={model.speed}
                  scale={scale}
                  chosen={checked}
                  motionSafe={motionSafe}
                />
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Quality
                </span>
                <Bar
                  value={model.quality}
                  scale={scale}
                  chosen={checked}
                  motionSafe={motionSafe}
                />
              </span>
            </button>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
