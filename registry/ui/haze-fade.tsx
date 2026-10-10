"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HazeFadeDirection = "right" | "left" | "up" | "down";
export type HazeFadeTrigger = "inView" | "mount" | "manual";
export type HazeFadeElement =
  | "div"
  | "section"
  | "article"
  | "header"
  | "footer"
  | "aside"
  | "figure"
  | "blockquote"
  | "p"
  | "h1"
  | "h2"
  | "h3";

export type HazeFadeProps = {
  /** The content that clears. Rendered once, live and interactive throughout. */
  children?: React.ReactNode;
  /** The element that wraps the content. @default "div" */
  as?: HazeFadeElement;
  /** Which way the clearing front travels. @default "right" */
  direction?: HazeFadeDirection;
  /** How thick the haze is, 0 to 1: blur, brightness lift and fade all scale with it. @default 0.6 */
  haze?: number;
  /** How long the front takes to cross, ms. @default 1400 */
  duration?: number;
  /** Width of the soft front as a share of the travel, 0 to 1. @default 0.4 */
  softness?: number;
  /** Blur at full haze, px. @default 14 */
  blur?: number;
  /** Brightness at full haze: hazed ink glows a little, the way mist holds light. @default 1.25 */
  brightness?: number;
  /** How far the hazed content fades toward the page at full haze, 0 to 1. @default 0.7 */
  fade?: number;
  /** How far the content rises into place as it clears, px; 0 keeps it still. @default 4 */
  drift?: number;
  /** What starts the clearing. @default "inView" */
  trigger?: HazeFadeTrigger;
  /** With trigger "manual": true clears, false lets the haze roll back in. @default false */
  play?: boolean;
  /** True: clears once. False: leaving view brings the haze back for the next visit. @default true */
  once?: boolean;
  /** Share of the content visible before an inView clearing starts, 0 to 1. @default 0.3 */
  amount?: number;
  /** Wait before the front sets off, ms. @default 0 */
  delay?: number;
  /** Change it to haze the content and clear it again. */
  replayKey?: string | number;
  /** The content is clear. */
  onComplete?: () => void;
  /** Classes for the wrapper; lay out the content here. */
  className?: string;
} & Omit<
  React.HTMLAttributes<HTMLElement>,
  | "children"
  | "className"
  | "style"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
>;

type Phase = "hazed" | "clearing" | "clear" | "returning";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const TOWARD: Record<HazeFadeDirection, string> = {
  right: "to right",
  left: "to left",
  up: "to top",
  down: "to bottom",
};

/** One motion element per tag, made once, so the wrapper is still the only node. */
const TAGS = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  header: motion.header,
  footer: motion.footer,
  aside: motion.aside,
  figure: motion.figure,
  blockquote: motion.blockquote,
  p: motion.p,
  h1: motion.h1,
  h2: motion.h2,
  h3: motion.h3,
} as unknown as Record<HazeFadeElement, typeof motion.div>;

/**
 * The three sheets, heavy to light. Each one's front sits half a front-width
 * from the next, so behind the light sheet's edge the content is crisp,
 * under it a little soft, and ahead of the heavy sheet fully hazed — a blur
 * ramp rather than a cross-fade with a seam.
 */
const SHEETS = [
  { offset: 0.5, blur: 1, lift: 1 },
  { offset: 0, blur: 0.45, lift: 0.5 },
  { offset: -0.5, blur: 0.18, lift: 0.2 },
] as const;

/**
 * The front's position for progress `p`: it starts a full front-width
 * before the content (every sheet opaque) and ends a full width past it
 * (every sheet clear).
 */
const frontAt = (p: number, soft: number) => -soft + p * (1 + 2 * soft);

function sheetMask(
  direction: HazeFadeDirection,
  p: number,
  offset: number,
  soft: number,
  edge: number,
): string {
  const centre = frontAt(p, soft) + offset * soft;
  const a = r2((centre - soft / 2) * 100);
  const b = r2((centre + soft / 2) * 100);
  const front = `linear-gradient(${TOWARD[direction]}, transparent ${a}%, black ${b}%)`;
  if (edge <= 0) return front;
  // The heavier sheets thin out within their own blur radius of the box's
  // edges, so a glyph near an edge never shows a halo sliced off by it.
  const e = Math.round(edge);
  return [
    front,
    `linear-gradient(to right, transparent, black ${e}px, black calc(100% - ${e}px), transparent)`,
    `linear-gradient(to bottom, transparent, black ${e}px, black calc(100% - ${e}px), transparent)`,
  ].join(", ");
}

/**
 * The content's own fade, travelling with the heavy sheet: opaque behind
 * the front, `keep` opaque ahead of it. A mask, not a tint, so the content
 * fades toward whatever is really behind it — any surface, either theme.
 */
function contentMask(
  direction: HazeFadeDirection,
  p: number,
  soft: number,
  keep: number,
): string {
  if (p >= 1 || keep >= 0.999) return "none";
  const centre = frontAt(p, soft) + SHEETS[0].offset * soft;
  const a = r2((centre - soft / 2) * 100);
  const b = r2((centre + soft / 2) * 100);
  return `linear-gradient(${TOWARD[direction]}, black ${a}%, rgb(0 0 0 / ${r2(keep)}) ${b}%)`;
}

/**
 * A wrapper whose content clears like haze lifting off a valley: blur,
 * brightness and fade resolve together behind a soft front that travels
 * across, so a headline sharpens letter by letter from one side to the
 * other. Three stacked backdrop-filter sheets, each masked a little ahead of
 * the last, make a real blur ramp at the front, and the content's own mask
 * carries the fade with them, so it fades toward the actual surface behind
 * it in either theme. The front crosses on the move ease (blur, masks and
 * opacity are tweens) while the content lifts a few pixels into place on the
 * drift spring. Once clear, the sheets and the mask are gone — nothing sits
 * on the content at rest.
 *
 * The content is never duplicated: it stays selectable, readable and
 * interactive while hazed, and focus moving into it clears it at once.
 * Reduced motion: no travelling front and no lift — the whole haze
 * cross-fades away.
 */
export function HazeFade({
  children,
  as = "div",
  direction = "right",
  haze = 0.6,
  duration = 1400,
  softness = 0.4,
  blur = 14,
  brightness = 1.25,
  fade = 0.7,
  drift = 4,
  trigger = "inView",
  play = false,
  once = true,
  amount = 0.3,
  delay = 0,
  replayKey,
  onComplete,
  className,
  ...rest
}: HazeFadeProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sheetsRef = React.useRef<HTMLSpanElement | null>(null);
  const phase = React.useRef<Phase>("hazed");
  const lastKey = React.useRef<string | null>(null);
  const [seen, setSeen] = React.useState(false);
  const [inView, setInView] = React.useState(false);

  const completeRef = React.useRef(onComplete);
  React.useEffect(() => {
    completeRef.current = onComplete;
  });

  // `progress` carries the front across (0 hazed, 1 clear); `veil` is the
  // reduced-motion path, where the whole haze cross-fades instead.
  const progress = useMotionValue(0);
  const veil = useMotionValue(1);
  const lift = useMotionValue(Math.max(0, drift));
  const soft = clamp(softness, 0.05, 1);
  const thick = clamp(haze, 0, 1);
  const keepAhead = 1 - clamp(fade, 0, 1) * thick;

  const reach = (i: 0 | 1 | 2) => Math.max(0, blur) * thick * SHEETS[i].blur;
  const heavyEdge = reach(0) * 1.2;
  const midEdge = reach(1) * 1.2;
  const heavyMask = useTransform(progress, (p) =>
    sheetMask(direction, p, SHEETS[0].offset, soft, heavyEdge),
  );
  const midMask = useTransform(progress, (p) =>
    sheetMask(direction, p, SHEETS[1].offset, soft, midEdge),
  );
  const lightMask = useTransform(progress, (p) =>
    sheetMask(direction, p, SHEETS[2].offset, soft, 0),
  );
  const masks = [heavyMask, midMask, lightMask];
  const ownMask = useTransform(
    [progress, veil] as MotionValue<number>[],
    ([p, v]) =>
      contentMask(
        direction,
        p as number,
        soft,
        1 - (1 - keepAhead) * (v as number),
      ),
  );

  const wanted =
    trigger === "mount" || (trigger === "manual" ? play : once ? seen : inView);

  React.useEffect(() => {
    if (trigger !== "inView") return;
    const root = rootRef.current;
    if (!root) return;
    if (once && seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        setInView(last.isIntersecting);
        if (last.isIntersecting) setSeen(true);
      },
      { threshold: clamp(amount, 0, 1) },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [trigger, once, seen, amount]);

  React.useEffect(() => {
    const sheets = sheetsRef.current;
    if (!sheets) return;
    const key = String(replayKey ?? "");
    const running: AnimationPlaybackControls[] = [];
    let cancelled = false;
    const rise = motionSafe ? Math.max(0, drift) : 0;

    const hazeNow = () => {
      sheets.style.display = "";
      progress.jump(0);
      veil.jump(1);
      lift.jump(rise);
      phase.current = "hazed";
    };
    const stop = () => {
      cancelled = true;
      for (const c of running) c.stop();
    };

    if (wanted) {
      if (phase.current === "clear" && lastKey.current === key) return;
      if (phase.current === "clear" || lastKey.current !== key) hazeNow();
      lastKey.current = key;
      phase.current = "clearing";
      const wait = Math.max(0, delay) / 1000;
      if (motionSafe) {
        running.push(
          animate(progress, 1, {
            duration: Math.max(0.2, duration / 1000),
            ease: easings.move,
            delay: wait,
          }),
          animate(lift, 0, { ...springs.drift, delay: wait }),
        );
      } else {
        progress.jump(0);
        lift.jump(0);
        running.push(
          animate(veil, 0, {
            duration: durations.page,
            ease: easings.enter,
            delay: wait,
          }),
        );
      }
      Promise.all(running.map((c) => c.finished)).then(
        () => {
          if (cancelled) return;
          // Clear means nothing on the content: the sheets and their
          // backdrop filters switched off, the mask gone, the lift at rest.
          sheets.style.display = "none";
          progress.jump(1);
          lift.jump(0);
          phase.current = "clear";
          completeRef.current?.();
        },
        () => {},
      );
      return stop;
    }

    if (phase.current === "hazed") {
      hazeNow();
      return;
    }
    if (trigger === "manual" && motionSafe) {
      // The haze rolls back in from where the front stands, on the exit
      // ease: a host that withdraws the content sees it go soft again.
      phase.current = "returning";
      sheets.style.display = "";
      running.push(
        animate(progress, 0, {
          duration: Math.max(0.2, duration / 1000) * 0.6,
          ease: easings.exit,
        }),
      );
      Promise.all(running.map((c) => c.finished)).then(
        () => {
          if (cancelled) return;
          phase.current = "hazed";
        },
        () => {},
      );
      return stop;
    }
    // Out of view (or reduced motion): the haze is simply back for next time.
    hazeNow();
  }, [
    wanted,
    replayKey,
    trigger,
    motionSafe,
    drift,
    delay,
    duration,
    progress,
    veil,
    lift,
  ]);

  const filterFor = (sheet: (typeof SHEETS)[number]) => {
    const b = r2(Math.max(0, blur) * thick * sheet.blur);
    const lifted = r2(1 + (Math.max(1, brightness) - 1) * thick * sheet.lift);
    const sat = r2(1 - 0.3 * thick * sheet.lift);
    return `blur(${b}px) brightness(${lifted}) saturate(${sat})`;
  };

  const Tag = TAGS[as] ?? TAGS.div;

  return (
    <Tag
      {...rest}
      ref={rootRef}
      onFocus={(event: React.FocusEvent<HTMLDivElement>) => {
        rest.onFocus?.(event);
        if (trigger !== "inView") return;
        // Focus is a visit: hazed content a keyboard user reaches clears now.
        setSeen(true);
        setInView(true);
      }}
      className={cn("relative isolate", className)}
      style={{ y: lift, maskImage: ownMask, WebkitMaskImage: ownMask }}
    >
      {children}
      <span
        ref={sheetsRef}
        aria-hidden
        data-haze=""
        className="pointer-events-none absolute inset-0 z-10 block overflow-hidden rounded-[inherit]"
      >
        {SHEETS.map((sheet, i) => {
          const filter = filterFor(sheet);
          return (
            <motion.span
              key={i}
              className="absolute inset-0 block"
              style={{
                opacity: veil,
                backdropFilter: filter,
                WebkitBackdropFilter: filter,
                maskImage: masks[i],
                WebkitMaskImage: masks[i],
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            />
          );
        })}
      </span>
    </Tag>
  );
}
