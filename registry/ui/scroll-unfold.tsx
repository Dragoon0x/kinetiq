"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type ScrollUnfoldStage = "folded" | "unfolding" | "unfolded";

export type ScrollUnfoldProps = {
  /** The media the card frames: an image, a video, an SVG. It fills the frame; give it `size-full object-cover`. */
  children: React.ReactNode;
  /** The headline that splits around the card. */
  headline: string;
  /** How many words go before the card. @default half the words, rounded up */
  splitAt?: number;
  /** The headline's element. @default "h2" */
  as?: "h1" | "h2" | "h3" | "p";
  /** A line under the card that slides away as it grows. */
  caption?: React.ReactNode;
  /** A title laid over the full-bleed frame, rising in over the last quarter. */
  overlay?: React.ReactNode;
  /** How far the reader scrolls to unfold it, px. @default 400 */
  range?: number;
  /** The card's starting inset, as a share of the stage width (0.05 to 0.45). @default 0.26 */
  inset?: number;
  /** The card's starting corner radius, px; it flattens to 0 at full bleed. @default 24 */
  radius?: number;
  /** How much the media zooms out as the frame opens, 0 to 0.4. @default 0.12 */
  zoom?: number;
  /** Hold the stage in place (sticky) while it unfolds. @default true */
  pin?: boolean;
  /** The stage's height, px. @default the scroll container's visible height */
  height?: number;
  /** Scroll distance before the unfold begins, px. @default 0 */
  start?: number;
  /** Eases the scroll-linked progress on a spring, 0 (1:1 with the scroll) to 1 (heavy). @default 0 */
  smooth?: number;
  /** The space between the headline and the card, px. @default 16 */
  gap?: number;
  /** Fires when the piece passes between folded, unfolding and unfolded. */
  onStageChange?: (stage: ScrollUnfoldStage) => void;
  /** Classes for the section. */
  className?: string;
};

type Geometry = {
  w: number;
  h: number;
  leadW: number;
  leadH: number;
  tailW: number;
  tailH: number;
  capH: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** The one curve every part shares: the house's symmetric move, as a function. */
const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** The nearest ancestor that scrolls vertically, or null for the window. */
function scrollerOf(node: HTMLElement): HTMLElement | null {
  let n = node.parentElement;
  while (n && n !== document.body) {
    const style = getComputedStyle(n);
    if (/(auto|scroll|overlay)/.test(style.overflowY)) return n;
    n = n.parentElement;
  }
  return null;
}

/**
 * A scroll-linked media card that grows to fill the frame. The section pins a
 * stage for `range` px of scroll in its nearest scroll container; the
 * distance scrolled is the progress, 1:1 (scroll-linked values stay linear),
 * eased once by the house's symmetric curve and shared by every part. The
 * card's clip opens from its inset to full bleed while its corners flatten
 * and the picture inside zooms out to meet it; the headline is split around
 * the card and each half is pushed by the card's own edge — it keeps a fixed
 * gap from the frame at every moment, so the words part to make room and
 * slide off the stage — while the caption rides the frame's bottom edge away.
 * An overlay title rises over the last quarter. Scrolling back folds it.
 *
 * On a wide stage the words sit either side of the card; when the side
 * columns would be narrower than 120px they stack above and below it.
 * Under reduced motion it is a still: the folded composition, unpinned.
 */
export function ScrollUnfold({
  children,
  headline,
  splitAt,
  as = "h2",
  caption,
  overlay,
  range = 400,
  inset = 0.26,
  radius = 24,
  zoom = 0.12,
  pin = true,
  height,
  start = 0,
  smooth = 0,
  gap = 16,
  onStageChange,
  className,
}: ScrollUnfoldProps) {
  const motionSafe = useMotionSafe();
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const leadRef = React.useRef<HTMLSpanElement | null>(null);
  const tailRef = React.useRef<HTMLSpanElement | null>(null);
  const captionRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState<number | null>(null);
  const [geo, setGeo] = React.useState<Geometry>({
    w: 0,
    h: 0,
    leadW: 0,
    leadH: 0,
    tailW: 0,
    tailH: 0,
    capH: 0,
  });

  const words = headline.trim().split(/\s+/).filter(Boolean);
  const cut = clamp(splitAt ?? Math.ceil(words.length / 2), 0, words.length);
  const lead = words.slice(0, cut).join(" ");
  const tail = words.slice(cut).join(" ");
  const hasCaption = Boolean(caption);

  const stageH = Math.max(160, height ?? measured ?? 480);
  const pinned = pin && motionSafe;
  const span = Math.max(1, range);

  // Scroll progress: set 1:1 from the scroll; `smooth` hands it to a spring.
  const raw = useMotionValue(0);
  const stiffness = 400 - clamp(smooth, 0, 1) * 310;
  const springy = useSpring(raw, {
    stiffness,
    damping: 2 * Math.sqrt(stiffness),
    mass: 1,
  });
  const progress: MotionValue<number> = smooth > 0 ? springy : raw;

  const report = React.useRef(onStageChange);
  React.useEffect(() => {
    report.current = onStageChange;
  });

  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section || !motionSafe) {
      raw.jump(0);
      return;
    }
    const scroller = scrollerOf(section);
    const target: EventTarget = scroller ?? window;
    let stage: ScrollUnfoldStage | null = null;
    let listening = false;

    const update = () => {
      const rect = section.getBoundingClientRect();
      const top = scroller
        ? scroller.getBoundingClientRect().top + scroller.clientTop
        : 0;
      const view = scroller ? scroller.clientHeight : window.innerHeight;
      const passed = pinned
        ? top - rect.top - start
        : top + view * 0.75 - rect.top - start;
      const p = clamp(passed / span, 0, 1);
      raw.set(Math.round(p * 10000) / 10000);
      const next: ScrollUnfoldStage =
        p <= 0 ? "folded" : p >= 1 ? "unfolded" : "unfolding";
      if (next !== stage) {
        stage = next;
        report.current?.(next);
      }
    };
    const listen = (on: boolean) => {
      if (on === listening) return;
      listening = on;
      if (on) {
        target.addEventListener("scroll", update, { passive: true });
        update();
      } else {
        target.removeEventListener("scroll", update);
      }
    };
    // Only listen while the section is near the scroll container's view.
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) listen(true);
        else {
          update();
          listen(false);
        }
      },
      { root: scroller, rootMargin: "200px 0px" },
    );
    watcher.observe(section);
    // The stage takes the scroll container's height unless one is given.
    const sizer = new ResizeObserver(() => {
      const view = scroller ? scroller.clientHeight : window.innerHeight;
      setMeasured((prev) => (prev === view ? prev : view));
      update();
    });
    if (scroller) sizer.observe(scroller);
    else sizer.observe(document.documentElement);
    return () => {
      watcher.disconnect();
      sizer.disconnect();
      listen(false);
    };
  }, [motionSafe, pinned, raw, span, start]);

  // The stage, the two halves of the headline and the caption are measured
  // as they arrive and whenever they change size.
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const read = () => {
      const lead = leadRef.current;
      const tail = tailRef.current;
      const cap = captionRef.current;
      const next: Geometry = {
        w: stage.clientWidth,
        h: stage.clientHeight,
        leadW: lead?.offsetWidth ?? 0,
        leadH: lead?.offsetHeight ?? 0,
        tailW: tail?.offsetWidth ?? 0,
        tailH: tail?.offsetHeight ?? 0,
        capH: cap?.offsetHeight ?? 0,
      };
      // Only a real change re-renders: the observer also reports on attach.
      setGeo((prev) =>
        (Object.keys(next) as (keyof Geometry)[]).every(
          (k) => prev[k] === next[k],
        )
          ? prev
          : next,
      );
    };
    const sizer = new ResizeObserver(read);
    for (const node of [
      stage,
      leadRef.current,
      tailRef.current,
      captionRef.current,
    ]) {
      if (node) sizer.observe(node);
    }
    return () => sizer.disconnect();
  }, [lead, tail, hasCaption]);

  // The folded layout, from the measured geometry.
  const w = geo.w;
  const h = geo.h || stageH;
  const side = w * clamp(inset, 0.05, 0.45);
  const row = w > 0 && side - gap - 12 >= 120;
  const column = row ? Math.max(0, side - gap - 12) : Math.max(0, w - 24);
  const capGap = caption ? geo.capH + 10 : 0;
  let x0: number;
  let y0: number;
  let fh0: number;
  let leadTop: number;
  let tailTop: number;
  if (row) {
    x0 = side;
    fh0 = Math.max(
      80,
      Math.min(h * 0.62, (w - 2 * x0) * 0.75, h - capGap - 24),
    );
    y0 = (h - fh0 - capGap) / 2;
    leadTop = y0 + fh0 / 2 - geo.leadH / 2;
    tailTop = y0 + fh0 / 2 - geo.tailH / 2;
  } else {
    x0 = Math.max(12, side * 0.5);
    const words = geo.leadH + geo.tailH + 2 * gap;
    fh0 = clamp(h - words - capGap - 24, Math.min(h * 0.25, 120), h * 0.5);
    const total = words + fh0 + capGap;
    leadTop = (h - total) / 2;
    y0 = leadTop + geo.leadH + gap;
    tailTop = y0 + fh0 + gap;
  }
  const yb0 = Math.max(0, h - y0 - fh0);
  const r0 = Math.max(0, radius);

  const clipPath = useTransform(progress, (p) => {
    const e = ease(clamp(p, 0, 1));
    const k = 1 - e;
    return `inset(${r2(y0 * k)}px ${r2(x0 * k)}px ${r2(yb0 * k)}px ${r2(x0 * k)}px round ${r2(r0 * k)}px)`;
  });
  const mediaScale = useTransform(progress, (p) =>
    r2(1 + clamp(zoom, 0, 0.4) * (1 - ease(clamp(p, 0, 1)))),
  );
  // Each half of the headline keeps `gap` from the frame's edge.
  const leadX = useTransform(progress, (p) => {
    const k = 1 - ease(clamp(p, 0, 1));
    return row ? r2(x0 * k - gap - geo.leadW) : r2((w - geo.leadW) / 2);
  });
  const leadY = useTransform(progress, (p) => {
    const k = 1 - ease(clamp(p, 0, 1));
    return row ? r2(leadTop) : r2(y0 * k - gap - geo.leadH);
  });
  const tailX = useTransform(progress, (p) => {
    const k = 1 - ease(clamp(p, 0, 1));
    return row ? r2(w - x0 * k + gap) : r2((w - geo.tailW) / 2);
  });
  const tailY = useTransform(progress, (p) => {
    const k = 1 - ease(clamp(p, 0, 1));
    return row ? r2(tailTop) : r2(h - yb0 * k + gap);
  });
  const wordsOpacity = useTransform(progress, (p) =>
    r2(1 - clamp((ease(clamp(p, 0, 1)) - 0.35) / 0.6, 0, 1)),
  );
  const captionY = useTransform(progress, (p) => {
    const k = 1 - ease(clamp(p, 0, 1));
    return row ? r2(h - yb0 * k + 10) : r2(h - yb0 * k + gap + geo.tailH + 10);
  });
  const captionOpacity = useTransform(progress, (p) =>
    r2(1 - clamp(ease(clamp(p, 0, 1)) * 2.2, 0, 1)),
  );
  const overlayOpacity = useTransform(progress, (p) =>
    r2(clamp((p - 0.75) / 0.25, 0, 1)),
  );
  const overlayY = useTransform(overlayOpacity, (o) => r2((1 - o) * 8));

  const Heading = as;
  const ready = w > 0;

  return (
    <section
      ref={sectionRef}
      className={cn("relative w-full", className)}
      style={{ height: pinned ? stageH + span : stageH }}
    >
      <div
        ref={stageRef}
        className={cn(
          "@container top-0 w-full overflow-clip",
          pinned ? "sticky" : "relative",
        )}
        style={{ height: stageH }}
      >
        <motion.div
          className="absolute inset-0 overflow-hidden bg-muted"
          style={{ clipPath }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ scale: mediaScale }}
          >
            {children}
          </motion.div>
          {overlay ? (
            <motion.div
              className="absolute inset-x-0 bottom-0 p-5"
              style={{ opacity: overlayOpacity, y: overlayY }}
            >
              {overlay}
            </motion.div>
          ) : null}
        </motion.div>
        <Heading className="pointer-events-none absolute inset-0 m-0 text-[clamp(22px,4.4cqi,48px)] leading-[1.05] font-semibold tracking-[-0.02em] text-foreground">
          <motion.span
            ref={leadRef}
            className={cn(
              "pointer-events-auto absolute top-0 left-0 block",
              row ? "text-right" : "text-center",
              !ready && "invisible",
            )}
            style={{
              maxWidth: column || undefined,
              x: leadX,
              y: leadY,
              opacity: wordsOpacity,
            }}
          >
            {lead}
          </motion.span>{" "}
          <motion.span
            ref={tailRef}
            className={cn(
              "pointer-events-auto absolute top-0 left-0 block",
              row ? "text-left" : "text-center",
              !ready && "invisible",
            )}
            style={{
              maxWidth: column || undefined,
              x: tailX,
              y: tailY,
              opacity: wordsOpacity,
            }}
          >
            {tail}
          </motion.span>
        </Heading>
        {caption ? (
          <motion.div
            ref={captionRef}
            className={cn(
              "absolute top-0 text-xs text-ink-3",
              row ? "text-left" : "inset-x-3 text-center",
              !ready && "invisible",
            )}
            style={{
              left: row ? x0 : undefined,
              width: row ? Math.max(0, w - 2 * x0) : undefined,
              y: captionY,
              opacity: captionOpacity,
            }}
          >
            {caption}
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
