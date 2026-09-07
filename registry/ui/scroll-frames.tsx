"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScrollFramesProps = {
  /** Frame count. */
  frames: number;
  /** Draws one frame. Called with logical (CSS) pixels; the retina scale is set. */
  renderFrame: (
    index: number,
    ctx: CanvasRenderingContext2D,
    size: { w: number; h: number },
  ) => void;
  /** The scrolling element the stage is pinned inside. */
  container: React.RefObject<HTMLElement | null>;
  /** Scroll distance the sequence is spread over, in pixels. @default 600 */
  height?: number;
  /** Names the stage. @default "Frame sequence" */
  label?: string;
  /** Fires with the frame index whenever it changes. */
  onFrameChange?: (index: number) => void;
  className?: string;
};

/** Retina is worth two device pixels per CSS pixel; past that it is only heat. */
const MAX_SCALE = 2;

/**
 * A frame sequence scrubbed by scroll. The stage pins to the top of its
 * container while a tall spacer scrolls past underneath, and the fraction of
 * that spacer already gone picks the frame — linearly, because a scrub has no
 * physics of its own: the reader's hand is the animation, and any easing laid
 * over it would fight the finger.
 *
 * Frames are drawn, not loaded. `renderFrame` is handed a context already scaled
 * to the display and sized by a ResizeObserver, so the sequence costs one canvas
 * rather than a folder of images, redraws itself when the box or the theme
 * changes, and stays sharp on any screen.
 *
 * Scrolling is the container's own, so the keyboard reaches it the moment the
 * container is focusable — arrows, Page keys and Home/End all scrub. Under
 * reduced motion nothing is pinned and nothing moves on its own: the stage shows
 * the final frame at its natural height with a real range input under it, so the
 * whole sequence is still there to be read at whatever pace suits.
 */
export function ScrollFrames({
  frames,
  renderFrame,
  container,
  height = 600,
  label = "Frame sequence",
  onFrameChange,
  className,
}: ScrollFramesProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const progress = useMotionValue(0);

  const [stageHeight, setStageHeight] = React.useState(0);
  const [scrollIndex, setScrollIndex] = React.useState(0);
  const lastFrame = Math.max(frames - 1, 0);
  // Reduced motion opens on the finished frame, so the sequence reads as a
  // result rather than as something the reader failed to start.
  const [scrubIndex, setScrubIndex] = React.useState(lastFrame);

  const shown = Math.min(motionSafe ? scrollIndex : scrubIndex, lastFrame);

  const draw = React.useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      if (!canvas || frames <= 0) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
      const pixelW = Math.round(w * scale);
      const pixelH = Math.round(h * scale);
      // Assigning width or height clears the canvas, so it is only done when
      // the box has actually changed.
      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, w, h);
      renderFrame(index, context, { w, h });
    },
    [frames, renderFrame],
  );

  // Latest-ref mirrors: the observers below are attached once, but the work
  // they do has to see this render's frame, callback and geometry.
  const drawLatest = React.useRef<() => void>(() => {});
  const measureLatest = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    drawLatest.current = () => draw(shown);
    measureLatest.current = () => {
      const root = rootRef.current;
      const scroller = container.current;
      if (!root || !scroller || frames <= 0) return;
      const span = root.offsetHeight - scroller.clientHeight;
      const travelled =
        scroller.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const fraction =
        span > 0 ? Math.min(1, Math.max(0, travelled / span)) : 0;
      progress.set(fraction);
      // The last frame owns the final sliver, so a fully scrolled stage lands
      // on the end of the sequence rather than one frame short of it.
      const next = Math.min(lastFrame, Math.floor(fraction * frames));
      if (next !== scrollIndex) {
        setScrollIndex(next);
        onFrameChange?.(next);
      }
    };
  });

  React.useEffect(() => {
    draw(shown);
  }, [draw, shown]);

  React.useEffect(() => {
    const scroller = container.current;
    const canvas = canvasRef.current;
    if (!scroller) return;
    // Fires once on observe, which seeds the first measurement and the first
    // draw without setting state inside the effect body.
    const observer = new ResizeObserver(() => {
      setStageHeight(scroller.clientHeight);
      measureLatest.current();
      drawLatest.current();
    });
    observer.observe(scroller);
    if (canvas) observer.observe(canvas);
    return () => observer.disconnect();
  }, [container]);

  React.useEffect(() => {
    const scroller = container.current;
    if (!scroller || !motionSafe) return;
    const onScroll = () => measureLatest.current();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [container, motionSafe]);

  // A canvas holds paint, not tokens: when the document flips theme the frame
  // on screen would keep the old palette until the next scroll.
  React.useEffect(() => {
    const observer = new MutationObserver(() => drawLatest.current());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const width = String(Math.max(frames, 0)).length;
  const counter =
    frames > 0
      ? `${String(shown + 1).padStart(width, "0")} / ${frames}`
      : "0 / 0";

  return (
    <div
      ref={rootRef}
      style={{ height: motionSafe ? height : stageHeight || undefined }}
      className={cn("relative w-full", className)}
    >
      <div
        className="sticky top-0 w-full overflow-hidden"
        style={{ height: stageHeight || undefined }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="block h-full w-full text-ink"
        />

        {/* The bar waits for the stage to be measured rather than flashing at
            the wrong size for a frame. The counter itself never animates: a
            number being scrubbed should read, not blink. */}
        <motion.div
          initial={false}
          animate={{ opacity: stageHeight > 0 ? 1 : 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
          className={cn(
            "absolute inset-x-0 bottom-0 flex h-9 items-center gap-3 border-t border-hairline bg-surface-1/85 px-3 backdrop-blur-sm",
            // Over a pinned stage the bar must not eat the scroll gesture; with
            // the range input in it, it has to take pointer events.
            motionSafe && "pointer-events-none",
          )}
        >
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-2 tabular-nums">
            {counter}
          </span>

          {motionSafe ? (
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
              <motion.span
                style={{ scaleX: progress }}
                className="block h-full w-full origin-left rounded-full bg-cobalt-bright"
              />
            </span>
          ) : (
            <input
              type="range"
              min={0}
              max={lastFrame}
              step={1}
              value={shown}
              aria-label={`${label} frame`}
              onChange={(event) => {
                const next = Number(event.target.value);
                setScrubIndex(next);
                onFrameChange?.(next);
              }}
              className="h-4 min-w-0 flex-1 cursor-pointer accent-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
