"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CropRect = { x: number; y: number; w: number; h: number };

export type CropFrameProps = {
  /** The picture, in its own pixels; `art` fills the stage. */
  image: { width: number; height: number; art: React.ReactNode };
  /** Width over height. Omit for a free crop. */
  aspect?: number;
  /** Controlled crop rect, in image pixels. */
  value?: CropRect;
  /** Initial crop rect for uncontrolled usage. @default a centred 70% crop */
  defaultValue?: CropRect;
  onValueChange?: (rect: CropRect) => void;
  className?: string;
};

/** Smallest crop, in image pixels — below this the handles collide. */
const MIN = 24;
/** Capture on pointerdown eats plain clicks; wait for real travel. */
const CAPTURE_PX = 4;
/** How much of an out-of-bounds drag the frame actually shows. */
const RUBBER = 0.3;

const DIM = "0 0 0 9999px color-mix(in oklab, var(--bg-0) 76%, transparent)";

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

type Corner = {
  id: string;
  pos: string;
  cursor: string;
  sx: 1 | -1;
  sy: 1 | -1;
};

const CORNERS: Corner[] = [
  { id: "nw", pos: "-top-3 -left-3", cursor: "nwse-resize", sx: -1, sy: -1 },
  { id: "ne", pos: "-top-3 -right-3", cursor: "nesw-resize", sx: 1, sy: -1 },
  { id: "sw", pos: "-bottom-3 -left-3", cursor: "nesw-resize", sx: -1, sy: 1 },
  { id: "se", pos: "-bottom-3 -right-3", cursor: "nwse-resize", sx: 1, sy: 1 },
];

/**
 * Keeps a rect legal: never smaller than MIN, never wider than the picture,
 * never hanging off an edge, and — with an aspect lock — never off its ratio.
 * Everything the component emits has been through here, so a caller never
 * receives a crop it could not honour.
 */
function fit(
  rect: CropRect,
  image: { width: number; height: number },
  aspect?: number,
): CropRect {
  let w = clamp(rect.w, MIN, image.width);
  let h = aspect ? w / aspect : clamp(rect.h, MIN, image.height);
  if (aspect) {
    if (h > image.height) {
      h = image.height;
      w = h * aspect;
    }
    if (w > image.width) {
      w = image.width;
      h = w / aspect;
    }
  }
  return {
    x: Math.round(clamp(rect.x, 0, Math.max(0, image.width - w))),
    y: Math.round(clamp(rect.y, 0, Math.max(0, image.height - h))),
    w: Math.round(w),
    h: Math.round(h),
  };
}

const same = (a: CropRect, b: CropRect) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * A crop frame that argues with its bounds. Dragging the frame or a corner
 * fades in the rule-of-thirds grid and deepens the dim outside — both tweens,
 * because nothing is travelling — while the rect itself tracks the pointer 1:1.
 * Pushed past an edge the frame only follows a third of the way, and on release
 * that overshoot springs home on `glide`: ζ0.98, no overshoot of its own, since
 * a surface returning to a legal position should not bounce twice.
 *
 * The committed rect is always legal — clamped, minimum-sized, and on ratio
 * when `aspect` is set — so the rubber band is purely a visual offset and a
 * caller never receives a crop it cannot honour.
 *
 * The frame takes focus: arrow keys nudge it, Shift and an arrow resize it. Its
 * numbers are also four real sliders under the picture, so x, y, width and
 * height can each be driven and read on their own. Under reduced motion there
 * is no rubber — the frame simply stops at the edge.
 */
export function CropFrame({
  image,
  aspect,
  value,
  defaultValue,
  onValueChange,
  className,
}: CropFrameProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState<CropRect>(() =>
    fit(
      defaultValue ?? {
        x: image.width * 0.15,
        y: image.height * 0.15,
        w: image.width * 0.7,
        h: image.height * 0.7,
      },
      image,
      aspect,
    ),
  );
  const isControlled = value !== undefined;
  const rect = fit(isControlled ? value : uncontrolled, image, aspect);

  const [dragging, setDragging] = React.useState(false);
  const [scale, setScale] = React.useState(0);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const scaleRef = React.useRef(0);
  const grab = React.useRef<{
    px: number;
    py: number;
    from: CropRect;
    corner: Corner | null;
  } | null>(null);
  const captured = React.useRef(false);
  const settling = React.useRef<AnimationPlaybackControls[]>([]);

  const rubberX = useMotionValue(0);
  const rubberY = useMotionValue(0);

  const stopSettling = () => {
    settling.current.forEach((control) => control.stop());
    settling.current = [];
  };

  React.useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The observer's callback carries the measurement, so the width is never
    // read (and set) synchronously inside the effect body.
    const observer = new ResizeObserver(() => {
      const next = node.getBoundingClientRect().width / image.width;
      scaleRef.current = next;
      setScale(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [image.width]);

  React.useEffect(() => () => stopSettling(), []);

  const commit = (next: CropRect) => {
    const legal = fit(next, image, aspect);
    if (same(legal, rect)) return;
    if (!isControlled) setUncontrolled(legal);
    onValueChange?.(legal);
  };

  const settle = () => {
    stopSettling();
    if (!motionSafe) {
      rubberX.set(0);
      rubberY.set(0);
      return;
    }
    settling.current = [
      animate(rubberX, 0, springs.glide),
      animate(rubberY, 0, springs.glide),
    ];
  };

  const begin = (
    event: React.PointerEvent<HTMLElement>,
    corner: Corner | null,
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    grab.current = {
      px: event.clientX,
      py: event.clientY,
      from: rect,
      corner,
    };
    captured.current = false;
    stopSettling();
    setDragging(true);
  };

  const move = (event: React.PointerEvent<HTMLElement>) => {
    const from = grab.current;
    const k = scaleRef.current;
    if (!from) return;
    // A corner and the frame both listen; without this the frame would apply
    // the same delta a second time as the event bubbles out of the handle.
    event.stopPropagation();
    if (k <= 0) return;
    const dxPx = event.clientX - from.px;
    const dyPx = event.clientY - from.py;
    if (!captured.current) {
      if (Math.hypot(dxPx, dyPx) < CAPTURE_PX) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      captured.current = true;
    }
    const dx = dxPx / k;
    const dy = dyPx / k;

    if (!from.corner) {
      const wanted = { ...from.from, x: from.from.x + dx, y: from.from.y + dy };
      const legal = fit(wanted, image, aspect);
      commit(legal);
      // Only the excess is shown, and only a third of it — the frame reads as
      // pulling against the edge rather than escaping it.
      if (motionSafe) {
        rubberX.set((wanted.x - legal.x) * k * RUBBER);
        rubberY.set((wanted.y - legal.y) * k * RUBBER);
      }
      return;
    }

    const { sx, sy } = from.corner;
    let { x, y, w, h } = from.from;
    if (sx < 0) {
      w -= dx;
      x += dx;
    } else w += dx;
    if (sy < 0) {
      h -= dy;
      y += dy;
    } else h += dy;
    if (aspect) {
      h = Math.max(MIN, w) / aspect;
      if (sy < 0) y = from.from.y + from.from.h - h;
    }
    commit({ x, y, w, h });
  };

  const end = (event: React.PointerEvent<HTMLElement>) => {
    if (!grab.current) return;
    event.stopPropagation();
    if (
      captured.current &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    grab.current = null;
    captured.current = false;
    setDragging(false);
    settle();
  };

  const onFrameKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.altKey ? 1 : 4;
    const grow = event.shiftKey;
    let next: CropRect | null = null;
    if (event.key === "ArrowLeft")
      next = grow
        ? { ...rect, w: rect.w - step }
        : { ...rect, x: rect.x - step };
    else if (event.key === "ArrowRight")
      next = grow
        ? { ...rect, w: rect.w + step }
        : { ...rect, x: rect.x + step };
    else if (event.key === "ArrowUp")
      next = grow
        ? { ...rect, h: rect.h - step }
        : { ...rect, y: rect.y - step };
    else if (event.key === "ArrowDown")
      next = grow
        ? { ...rect, h: rect.h + step }
        : { ...rect, y: rect.y + step };
    if (!next) return;
    event.preventDefault();
    commit(next);
  };

  const sliders = [
    {
      id: "x",
      label: "X",
      name: "Crop left",
      value: rect.x,
      min: 0,
      max: Math.max(0, image.width - rect.w),
      apply: (v: number) => commit({ ...rect, x: v }),
    },
    {
      id: "y",
      label: "Y",
      name: "Crop top",
      value: rect.y,
      min: 0,
      max: Math.max(0, image.height - rect.h),
      apply: (v: number) => commit({ ...rect, y: v }),
    },
    {
      id: "w",
      label: "W",
      name: "Crop width",
      value: rect.w,
      min: MIN,
      max: image.width,
      apply: (v: number) =>
        commit({ ...rect, w: v, h: aspect ? v / aspect : rect.h }),
    },
    {
      id: "h",
      label: "H",
      name: "Crop height",
      value: rect.h,
      min: MIN,
      max: image.height,
      apply: (v: number) =>
        commit({ ...rect, h: v, w: aspect ? v * aspect : rect.w }),
    },
  ];

  const box = {
    left: rect.x * scale,
    top: rect.y * scale,
    width: rect.w * scale,
    height: rect.h * scale,
  };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={stageRef}
        className="relative w-full touch-none overflow-hidden rounded-3 border border-hairline bg-surface-2 select-none"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
      >
        <div aria-hidden className="absolute inset-0">
          {image.art}
        </div>

        <motion.div
          role="group"
          tabIndex={0}
          aria-label="Crop frame"
          aria-describedby={hintId}
          onKeyDown={onFrameKey}
          onPointerDown={(event) => begin(event, null)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{ ...box, x: rubberX, y: rubberY }}
          className="absolute cursor-grab border border-cobalt-bright outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:cursor-grabbing"
        >
          {/* One spread shadow paints everything outside the frame; the stage
              clips it, so no four-panel scrim has to be kept in sync. */}
          <motion.span
            aria-hidden
            initial={false}
            animate={{ opacity: dragging ? 1 : 0.62 }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="pointer-events-none absolute -inset-px"
            style={{ boxShadow: DIM }}
          />

          <motion.span
            aria-hidden
            initial={false}
            animate={{ opacity: dragging ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="pointer-events-none absolute inset-0"
          >
            <span className="absolute top-1/3 right-0 left-0 border-t border-cobalt-bright/45" />
            <span className="absolute top-2/3 right-0 left-0 border-t border-cobalt-bright/45" />
            <span className="absolute top-0 bottom-0 left-1/3 border-l border-cobalt-bright/45" />
            <span className="absolute top-0 bottom-0 left-2/3 border-l border-cobalt-bright/45" />
          </motion.span>

          {CORNERS.map((corner) => (
            <span
              key={corner.id}
              aria-hidden
              onPointerDown={(event) => begin(event, corner)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              style={{ cursor: corner.cursor }}
              className={cn(
                "absolute flex size-6 items-center justify-center",
                corner.pos,
              )}
            >
              <span className="size-2.5 rounded-[2px] border border-surface-0 bg-cobalt-bright" />
            </span>
          ))}
        </motion.div>
      </div>

      <div
        role="group"
        aria-label="Crop rectangle"
        className="grid grid-cols-4 gap-1.5"
      >
        {sliders.map((slider) => (
          <div
            key={slider.id}
            role="slider"
            tabIndex={0}
            aria-label={slider.name}
            aria-valuemin={slider.min}
            aria-valuemax={slider.max}
            aria-valuenow={slider.value}
            aria-valuetext={`${slider.value} pixels`}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 10 : 1;
              if (event.key === "ArrowRight" || event.key === "ArrowUp")
                slider.apply(slider.value + step);
              else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
                slider.apply(slider.value - step);
              else if (event.key === "Home") slider.apply(slider.min);
              else if (event.key === "End") slider.apply(slider.max);
              else return;
              event.preventDefault();
            }}
            className="flex h-10 flex-col items-center justify-center gap-0.5 rounded-2 border border-hairline bg-surface-1 leading-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="font-mono text-[9px] tracking-[0.12em] text-ink-3 uppercase">
              {slider.label}
            </span>
            <span className="font-mono text-xs text-foreground tabular-nums">
              {slider.value}
            </span>
          </div>
        ))}
      </div>

      {/* No live region here on purpose: the rect changes every pointer frame,
          and the four sliders already report their own values on focus. */}
      <span id={hintId} className="sr-only">
        Arrow keys move the frame; hold Shift and an arrow to resize it. Each
        edge is also a slider below the picture.
      </span>
    </div>
  );
}
