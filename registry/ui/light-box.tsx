"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  safe,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LightBoxImage = {
  id: string;
  /** Describes the picture, and names the dialog while that picture is open. */
  alt: string;
  caption?: string;
  /** Rendered in both the tile and the viewer — make it fill its container. */
  art: React.ReactNode;
};

export type LightBoxProps = {
  images: LightBoxImage[];
  /** Controlled id of the open picture; null is closed. */
  open?: string | null;
  /** Initial open picture for uncontrolled usage. @default null */
  defaultOpen?: string | null;
  /** Fires on open, on every move, and on close. */
  onOpenChange?: (id: string | null) => void;
  className?: string;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Pictures enter from the direction of travel and leave against it. `dir` is 0
 * under reduced motion, which turns the whole move into a plain cross-fade
 * without a second code path.
 */
const SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: dir * distances.shift }),
  center: { opacity: 1, x: 0 },
  leave: (dir: number) => ({
    opacity: 0,
    x: -dir * distances.shift,
    transition: exitFor(),
  }),
};

const ARROW = "M10 3.5 5.5 8l4.5 4.5";

function Chevron({ forward }: { forward?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3.5 shrink-0", forward && "rotate-180")}
    >
      <path d={ARROW} />
    </svg>
  );
}

const STEP_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline-strong text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The thumbnail becomes the picture. Tile and viewer share one `layoutId`, so
 * opening FLIP-morphs the thumbnail's rect into the viewer on `glide` — ζ0.98,
 * no overshoot, because a surface changing size should not bounce — while the
 * backdrop tweens in behind it. Closing runs the morph in reverse and the
 * picture returns to the tile it grew from.
 *
 * Moving between pictures is a different gesture, so it reads differently: the
 * old picture leaves on the exit ease and the new one arrives from
 * `distances.shift` in the direction of travel. Arrows, a swipe, or the Left
 * and Right keys move; Escape closes and focus returns to the tile. Focus is
 * trapped in the dialog while it is open. Under reduced motion nothing travels
 * — the viewer cross-fades in and pictures cross-fade between each other.
 *
 * The viewer is absolutely positioned inside the nearest positioned ancestor,
 * so give the surface that owns the gallery `relative`.
 */
export function LightBox({
  images,
  open,
  defaultOpen = null,
  onOpenChange,
  className,
}: LightBoxProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultOpen,
  );
  const isControlled = open !== undefined;
  const openId = isControlled ? open : uncontrolled;

  const [direction, setDirection] = React.useState(1);
  // The tile the viewer grew out of. Held for the whole session so that moving
  // between pictures never re-points the morph at another tile mid-flight.
  const [anchorId, setAnchorId] = React.useState<string | null>(defaultOpen);

  const tiles = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const returnTo = React.useRef<string | null>(null);

  const index = images.findIndex((image) => image.id === openId);
  const current = index < 0 ? undefined : images[index];
  const anchor = anchorId ?? current?.id;

  const setOpenId = React.useCallback(
    (next: string | null) => {
      if (next !== null) returnTo.current = next;
      if (!isControlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const close = React.useCallback(() => {
    setAnchorId(null);
    setOpenId(null);
  }, [setOpenId]);

  const move = (delta: number) => {
    if (index < 0 || images.length < 2) return;
    const next = images[(index + delta + images.length) % images.length];
    if (!next) return;
    setDirection(delta < 0 ? -1 : 1);
    setOpenId(next.id);
  };

  // Focus lands on the panel rather than a control so the picture's name is
  // read first; the trap below covers the wrap-around from there.
  React.useEffect(() => {
    if (!current) return;
    const frame = requestAnimationFrame(() =>
      panelRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [current]);

  React.useEffect(() => {
    if (!current) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [current, close]);

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const chrome = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: exitFor(durations.fast) },
    transition: { duration: durations.base, ease: easings.enter },
  };

  return (
    <div className={cn("w-full", className)}>
      <ul className="grid grid-cols-2 gap-2">
        {images.map((image) => (
          <li key={image.id}>
            <button
              type="button"
              ref={(node) => {
                tiles.current[image.id] = node;
              }}
              aria-haspopup="dialog"
              aria-expanded={image.id === openId}
              onClick={() => {
                setDirection(1);
                setAnchorId(image.id);
                setOpenId(image.id);
              }}
              className="relative block aspect-square w-full overflow-hidden rounded-3 border border-hairline transition-colors outline-none hover:border-cobalt-bright/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {/* The tile keeps its layout node while the viewer is open: motion
                  morphs from it, and relegates back to it on close. */}
              <motion.span
                layoutId={motionSafe ? `${uid}-art-${image.id}` : undefined}
                transition={springs.glide}
                className="absolute inset-0 block"
              >
                {image.art}
              </motion.span>
              <span className="sr-only">{image.alt}</span>
            </button>
          </li>
        ))}
      </ul>

      <AnimatePresence
        onExitComplete={() => {
          const id = returnTo.current;
          if (id) tiles.current[id]?.focus({ preventScroll: true });
        }}
      >
        {current ? (
          <div
            key="viewer"
            className="absolute inset-0 z-40 flex items-center justify-center p-3"
          >
            <motion.button
              type="button"
              aria-label="Close viewer"
              onClick={close}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
            />

            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              onKeyDown={onPanelKeyDown}
              className="relative z-10 flex w-full max-w-sm flex-col gap-2 outline-none"
            >
              <h2 id={titleId} className="sr-only">
                {current.alt}
              </h2>

              <motion.div
                {...chrome}
                className="flex items-center justify-between gap-2"
              >
                <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 tabular-nums">
                  {index + 1} / {images.length}
                </span>
                <button
                  type="button"
                  aria-label="Close viewer"
                  onClick={close}
                  className={STEP_BUTTON}
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    className="size-3.5 shrink-0"
                  >
                    <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                  </svg>
                </button>
              </motion.div>

              <motion.div
                layoutId={motionSafe ? `${uid}-art-${anchor}` : undefined}
                initial={motionSafe ? undefined : { opacity: 0 }}
                animate={motionSafe ? undefined : { opacity: 1 }}
                exit={
                  motionSafe
                    ? undefined
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                transition={
                  motionSafe ? springs.glide : { duration: durations.fast }
                }
                className="relative aspect-[3/2] w-full overflow-hidden rounded-3 border border-hairline-strong bg-surface-2"
              >
                {/* Nested AnimatePresence: its children keep their own presence,
                    so closing the viewer morphs a picture that is still there
                    instead of an empty frame. */}
                <AnimatePresence
                  custom={motionSafe ? direction : 0}
                  initial={false}
                >
                  <motion.div
                    key={current.id}
                    custom={motionSafe ? direction : 0}
                    variants={SLIDE}
                    initial="enter"
                    animate="center"
                    exit="leave"
                    transition={safe(springs.glide)(motionSafe)}
                    drag={motionSafe && images.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.14}
                    onDragEnd={(_event, info) => {
                      const travel = info.offset.x + info.velocity.x * 0.08;
                      if (travel < -40) move(1);
                      else if (travel > 40) move(-1);
                    }}
                    className="absolute inset-0"
                  >
                    {current.art}
                  </motion.div>
                </AnimatePresence>
              </motion.div>

              <motion.div {...chrome} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous picture"
                  disabled={images.length < 2}
                  onClick={() => move(-1)}
                  className={STEP_BUTTON}
                >
                  <Chevron />
                </button>

                {/* One grid cell holds every caption, so the row keeps its
                    height and the arrows never shift as pictures change. */}
                <span className="grid min-w-0 flex-1">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={current.id}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.nudge : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={safe(springs.glide)(motionSafe)}
                      title={current.caption ?? current.alt}
                      className="col-start-1 row-start-1 truncate text-center text-xs text-ink-2"
                    >
                      {current.caption ?? current.alt}
                    </motion.span>
                  </AnimatePresence>
                </span>

                <button
                  type="button"
                  aria-label="Next picture"
                  disabled={images.length < 2}
                  onClick={() => move(1)}
                  className={STEP_BUTTON}
                >
                  <Chevron forward />
                </button>
              </motion.div>
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
