"use client";

import * as React from "react";

import { AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Keyboard panning step, as a fraction of the picture. */
const PAN = 0.12;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export type ZoomGalleryImage = {
  id: string;
  /** Names the picture for screen readers and labels its thumbnail. */
  alt: string;
  /** Rendered in the thumbnail, the frame, and the zoom pane — make it fill. */
  art: React.ReactNode;
};

export type ZoomGalleryProps = {
  images: ZoomGalleryImage[];
  /** Magnification of the zoom pane. @default 2 */
  zoom?: number;
  /** Controlled active picture id. */
  value?: string;
  /** Initial active picture for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Fires when the zoom pane opens or closes. */
  onZoomChange?: (zoomed: boolean) => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * A product gallery with a loupe. Choosing a thumbnail cross-fades the frame
 * while the arriving picture settles from a hair over full size on `glide` —
 * ζ0.98, no overshoot, because a picture that bounced would read as a toy —
 * and the selection ring travels between thumbnails on a shared `layoutId`
 * rather than blinking out and back.
 *
 * Hovering the frame opens the zoom pane: a scaled copy of the same art,
 * translated so the point under the pointer stays under the pointer. The
 * fraction is clamped to the frame, so the pane can never show past the
 * picture's own edges, and only the frame's pointer events drive it.
 *
 * The thumbnails are a tablist: Left and Right swap pictures, Home and End
 * jump to the ends. The zoom is a pressed button rather than a hover-only
 * trick — it opens centred, Arrow keys pan it, Escape closes it. Under reduced
 * motion pictures swap without travel and the pane holds still instead of
 * following the pointer; the magnification itself still shows.
 */
export function ZoomGallery({
  images,
  zoom = 2,
  value,
  defaultValue,
  onValueChange,
  onZoomChange,
  className,
  "aria-label": ariaLabel,
}: ZoomGalleryProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? images[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const index = Math.max(
    0,
    images.findIndex((image) => image.id === current),
  );
  const active = images[index];

  const [zoomed, setZoomed] = React.useState(false);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  /** Where the loupe is aimed, as a fraction of the frame. */
  const focus = React.useRef({ x: 0.5, y: 0.5 });
  /** True while the pointer owns the pane, so a keyboard-opened pane stays. */
  const hovered = React.useRef(false);

  const paneX = useMotionValue(0);
  const paneY = useMotionValue(0);

  // Translate so the aimed point lands back under itself: with the origin at
  // the top-left, a point at fraction f sits at f·size·zoom once scaled, and
  // -f·size·(zoom-1) puts it back. Clamped input, so the pane never shows past
  // the picture.
  const aim = React.useCallback(
    (fx: number, fy: number) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      focus.current = { x: clamp(fx, 0, 1), y: clamp(fy, 0, 1) };
      paneX.set(-focus.current.x * rect.width * (zoom - 1));
      paneY.set(-focus.current.y * rect.height * (zoom - 1));
    },
    [paneX, paneY, zoom],
  );

  const setZoom = (next: boolean) => {
    if (next === zoomed) return;
    setZoomed(next);
    onZoomChange?.(next);
  };

  const select = (id: string) => {
    if (!isControlled) setUncontrolled(id);
    if (id !== current) onValueChange?.(id);
  };

  const focusTab = (to: number) => {
    const at = clamp(to, 0, images.length - 1);
    const next = images[at];
    if (!next) return;
    tabRefs.current[at]?.focus();
    select(next.id);
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(images.length - 1);
        break;
      default:
        break;
    }
  };

  const onZoomKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      if (!zoomed) return;
      event.preventDefault();
      setZoom(false);
      return;
    }
    if (!zoomed || !motionSafe) return;
    const point = focus.current;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        aim(point.x + PAN, point.y);
        break;
      case "ArrowLeft":
        event.preventDefault();
        aim(point.x - PAN, point.y);
        break;
      case "ArrowDown":
        event.preventDefault();
        aim(point.x, point.y + PAN);
        break;
      case "ArrowUp":
        event.preventDefault();
        aim(point.x, point.y - PAN);
        break;
      default:
        break;
    }
  };

  // A resize moves the aimed point under the loupe; re-aim from the observer's
  // own callback so nothing is measured during render.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      aim(focus.current.x, focus.current.y);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [aim]);

  const trackPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    aim(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  };

  const panelId = `${uid}-frame`;
  const tabId = active ? `${uid}-tab-${active.id}` : undefined;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div
        ref={frameRef}
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId}
        // The panel holds no focusable content, so it takes focus itself and
        // reads the picture's name when the tabs are stepped through.
        tabIndex={0}
        onPointerEnter={(event) => {
          if (!motionSafe || event.pointerType !== "mouse") return;
          hovered.current = true;
          trackPointer(event);
          setZoom(true);
        }}
        onPointerMove={(event) => {
          if (!zoomed) return;
          trackPointer(event);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          // A pane the keyboard opened outlives the pointer wandering over it.
          if (!hovered.current) return;
          hovered.current = false;
          setZoom(false);
        }}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-3 border border-hairline bg-surface-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <AnimatePresence initial={false}>
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, scale: motionSafe ? 1.04 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={{
                opacity: {
                  duration: motionSafe ? durations.base : durations.fast,
                  ease: easings.enter,
                },
                scale: springs.glide,
              }}
              className="absolute inset-0"
            >
              {active.art}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {zoomed && active ? (
            <motion.div
              key="pane"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <motion.div
                initial={{ scale: motionSafe ? 1 : zoom }}
                animate={{ scale: zoom }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                style={{
                  x: paneX,
                  y: paneY,
                  transformOrigin: "0 0",
                }}
                className="absolute inset-0"
              >
                {active.art}
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <span className="sr-only">{active?.alt}</span>

        <AnimatePresence>
          {zoomed ? (
            <motion.span
              key="badge"
              aria-hidden
              initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
              className="pointer-events-none absolute right-2 bottom-2 rounded-full border border-hairline-strong bg-surface-0/85 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 tabular-nums"
            >
              {zoom}x
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex h-8 items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate text-xs text-ink-2"
          title={active?.alt}
        >
          {active?.alt}
        </p>
        <button
          type="button"
          aria-pressed={zoomed}
          aria-controls={panelId}
          aria-describedby={`${uid}-hint`}
          onClick={() => {
            const next = !zoomed;
            // Opening from the keyboard has no pointer to follow, so the loupe
            // starts where it was last aimed — the centre on first use.
            if (next) aim(focus.current.x, focus.current.y);
            else hovered.current = false;
            setZoom(next);
          }}
          onKeyDown={onZoomKeyDown}
          className={cn(
            "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            zoomed
              ? "bg-cobalt-wash text-cobalt-bright"
              : "bg-surface-1 text-ink-2 hover:bg-accent hover:text-foreground",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="size-4 shrink-0"
          >
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.2 10.2 3.3 3.3M5.2 7h3.6M7 5.2v3.6" />
          </svg>
          Zoom
        </button>
      </div>

      <div
        role="tablist"
        aria-label={ariaLabel ?? "Product views"}
        className="grid grid-cols-4 gap-2"
      >
        {images.map((image, i) => {
          const selected = i === index;
          return (
            <button
              key={image.id}
              ref={(node) => {
                tabRefs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${image.id}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(image.id)}
              onKeyDown={onTabKeyDown}
              className="relative aspect-square cursor-pointer overflow-hidden rounded-2 border border-hairline bg-surface-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="absolute inset-0">{image.art}</span>
              {selected &&
                (motionSafe ? (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-ring`}
                    transition={springs.glide}
                    className="absolute inset-0 rounded-2 ring-2 ring-cobalt-bright ring-inset"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-2 ring-2 ring-cobalt-bright ring-inset"
                  />
                ))}
              <span className="sr-only">{image.alt}</span>
            </button>
          );
        })}
      </div>

      <span id={`${uid}-hint`} className="sr-only">
        Arrow keys pan the zoom; Escape closes it.
      </span>
    </div>
  );
}
