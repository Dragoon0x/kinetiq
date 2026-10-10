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
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SightLinesColor = "cobalt" | "redline" | "signal" | "ink";
export type SightLinesUnit = "px" | "rem" | "percent" | "none";

export type SightLinesMeasure = {
  /** The child the lines snapped onto. */
  target: HTMLElement;
  /** Its `data-measure` value, else its accessible name or text, else its tag. */
  label: string;
  /** Its box inside the container, in px (clamped to the container). */
  width: number;
  height: number;
  /** Its distance from each edge of the container, in px. */
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type SightLinesProps = {
  /** The content being measured; it keeps every click, focus and key. */
  children?: React.ReactNode;
  /** The unit of the distance labels and the readout, or "none" to hide the labels. @default "px" */
  labels?: SightLinesUnit;
  /** Hovering (or focusing) a child snaps the lines to its edges and shows its size. @default true */
  snap?: boolean;
  /** The hairline tone: a named tone or any CSS colour. @default "cobalt" */
  color?: SightLinesColor | (string & {});
  /** What the lines snap to, as a CSS selector; disabled controls never snap. @default `[data-measure]` and interactive elements */
  targets?: string;
  /** The house spring the lines ease after the pointer on. @default "glide" */
  follow?: "flick" | "snap" | "glide";
  /** Tick rulers along the four edges, with a marker at the pointer's coordinate. @default true */
  ticks?: boolean;
  /** Distance between minor ticks, in px; every fifth is a major tick. @default 8 */
  tickStep?: number;
  /** Dashed hairlines instead of solid ones. @default false */
  dashed?: boolean;
  /** Hairline thickness, in px. @default 1 */
  thickness?: number;
  /** A small tag with the pointer's coordinates, or a snapped child's width × height. @default true */
  readout?: boolean;
  /** Where the lines rest with nobody pointing: on the home target, at the centre, or hidden. @default "home" */
  rest?: "home" | "center" | "none";
  /** A crosshair cursor inside the container (text fields keep the I-beam). @default true */
  crosshair?: boolean;
  /** Decimals in pixel labels. @default 0 */
  precision?: number;
  /** Pixels per rem, for rem labels. @default 16 */
  rootSize?: number;
  /** Turn the overlay off. @default false */
  disabled?: boolean;
  /** Fires when the lines snap onto a child, and with null when they let go. */
  onMeasure?: (measure: SightLinesMeasure | null) => void;
  /** Classes for the container. */
  className?: string;
};

const TONES: Record<SightLinesColor, string> = {
  cobalt: "var(--accent-bright)",
  redline: "var(--danger)",
  signal: "var(--signal)",
  ink: "var(--foreground)",
};

const DEFAULT_TARGETS = [
  "[data-measure]",
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "img",
  "[role='button']",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

/** How deep the edge rulers are, in px. */
const RULER = 8;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

const usable = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement &&
  !el.matches(":disabled, [aria-disabled='true'], [inert] *");

type Frame = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
};

type Pill = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  text: MotionValue<string>;
  opacity: MotionValue<number>;
};

function usePill(): Pill {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const text = useMotionValue("");
  const opacity = useMotionValue(0);
  return React.useMemo(() => ({ x, y, text, opacity }), [x, y, text, opacity]);
}

function DistancePill({ pill }: { pill: Pill }) {
  return (
    <motion.div
      className="absolute top-0 left-0"
      style={{ x: pill.x, y: pill.y, opacity: pill.opacity }}
    >
      {/* Opaque, so the hairline breaks around the number. */}
      <motion.span className="absolute -translate-x-1/2 -translate-y-1/2 rounded-1 border border-current/30 bg-background px-1 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap tabular-nums">
        {pill.text}
      </motion.span>
    </motion.div>
  );
}

/** Minor ticks every `step`, a major one every fifth, along all four edges. */
function rulerPath(w: number, h: number, step: number): string {
  if (w < 1 || h < 1 || step < 2) return "";
  const parts: string[] = [];
  for (let i = 1; i * step < w; i += 1) {
    const x = r2(i * step);
    const len = i % 5 === 0 ? 6 : 3;
    parts.push(`M${x} 0v${len}M${x} ${h}v${-len}`);
  }
  for (let i = 1; i * step < h; i += 1) {
    const y = r2(i * step);
    const len = i % 5 === 0 ? 6 : 3;
    parts.push(`M0 ${y}h${len}M${w} ${y}h${-len}`);
  }
  return parts.join("");
}

/**
 * A precision measuring overlay bounded to the container it wraps. Four
 * hairlines run in from the edges to the pointer, each with its length in a
 * mono pill at its midpoint; tick rulers run along the edges with a marker at
 * the pointer's coordinate, and a readout gives x and y. The lines ease after
 * the pointer on a house spring while the crosshair cursor stays exactly
 * under the hand. When the pointer reaches a child, the meeting point opens
 * into the child's box on springs.snap: the lines retract to its edges and
 * measure its margins, a hairline box outlines it, the readout becomes its
 * width × height and each ruler marker widens into the child's span; leaving
 * releases the lines back to the pointer on springs.glide.
 *
 * Keyboard focus on a child snaps the lines to it exactly as hover does. The
 * overlay is aria-hidden and never takes a click, focus or key. Under reduced
 * motion the lines sit exactly at the pointer and jump to a child's box, with
 * only the box and labels fading in.
 */
export function SightLines({
  children,
  labels = "px",
  snap = true,
  color = "cobalt",
  targets = DEFAULT_TARGETS,
  follow = "glide",
  ticks = true,
  tickStep = 8,
  dashed = false,
  thickness = 1,
  readout = true,
  rest = "home",
  crosshair = true,
  precision = 0,
  rootSize = 16,
  disabled = false,
  onMeasure,
  className,
}: SightLinesProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [tag, setTag] = React.useState({
    boxed: false,
    left: false,
    up: false,
  });

  // The six numbers the whole drawing is read from: the aperture (a point
  // when free, a child's box when snapped) and its centre.
  const ax0 = useMotionValue(0);
  const ay0 = useMotionValue(0);
  const ax1 = useMotionValue(0);
  const ay1 = useMotionValue(0);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const cw = useMotionValue(0);
  const ch = useMotionValue(0);
  const boxed = useMotionValue(0);
  const shown = useMotionValue(0);
  // The readout belongs to someone pointing or focusing, not to the rest.
  const engaged = useMotionValue(0);

  const bw = useMotionValue(0);
  const bh = useMotionValue(0);
  const markX = useMotionValue(0);
  const markW = useMotionValue(2);
  const markY = useMotionValue(0);
  const markH = useMotionValue(2);
  const farX = useMotionValue(0);
  const farY = useMotionValue(0);
  const tagX = useMotionValue(0);
  const tagY = useMotionValue(0);
  const tagText = useMotionValue("");
  const left = usePill();
  const right = usePill();
  const top = usePill();
  const bottom = usePill();

  const tone = TONES[color as SightLinesColor] ?? color;
  const step = Math.max(2, tickStep);
  const stroke = Math.max(0.5, thickness);

  const params = React.useRef({
    labels,
    snap,
    targets,
    follow,
    rest,
    precision,
    rootSize,
    disabled,
    motionSafe,
    onMeasure,
  });
  React.useEffect(() => {
    params.current = {
      labels,
      snap,
      targets,
      follow,
      rest,
      precision,
      rootSize,
      disabled,
      motionSafe,
      onMeasure,
    };
  });
  const api = React.useRef<{ refresh: () => void } | null>(null);
  const tagRef = React.useRef(tag);

  // Everything drawn is derived here from the six numbers, in one
  // subscription: a combined transform can go stale after StrictMode's
  // rehearsal remount, a subscription that places on mount cannot.
  React.useEffect(() => {
    const fmt = (v: number, axis: "x" | "y") => {
      const p = params.current;
      if (p.labels === "rem") {
        return `${Number((v / Math.max(1, p.rootSize)).toFixed(2))}rem`;
      }
      if (p.labels === "percent") {
        const whole = axis === "x" ? cw.get() : ch.get();
        return `${whole > 0 ? ((v / whole) * 100).toFixed(1) : "0.0"}%`;
      }
      return clamp(v, 0, 99999).toFixed(clamp(Math.round(p.precision), 0, 2));
    };
    const pill = (
      target: Pill,
      x: number,
      y: number,
      length: number,
      axis: "x" | "y",
    ) => {
      target.x.set(r2(x));
      target.y.set(r2(y));
      target.text.set(fmt(Math.max(0, length), axis));
      // Labels fade out on lines too short to carry them.
      target.opacity.set(
        params.current.labels === "none"
          ? 0
          : r2(clamp((length - 26) / 14, 0, 1)),
      );
    };
    const place = () => {
      const W = cw.get();
      const H = ch.get();
      const x0 = ax0.get();
      const x1 = ax1.get();
      const y0 = ay0.get();
      const y1 = ay1.get();
      const mx = cx.get();
      const my = cy.get();
      bw.set(r2(Math.max(0, x1 - x0)));
      bh.set(r2(Math.max(0, y1 - y0)));
      // A point's marker is a 2px tick; a box's widens into its span.
      markX.set(r2(x1 - x0 < 2 ? (x0 + x1) / 2 - 1 : x0));
      markW.set(r2(Math.max(2, x1 - x0)));
      markY.set(r2(y1 - y0 < 2 ? (y0 + y1) / 2 - 1 : y0));
      markH.set(r2(Math.max(2, y1 - y0)));
      farX.set(r2(W - RULER));
      farY.set(r2(H - RULER));
      const rowY = clamp(my, 10, Math.max(10, H - 10));
      const colX = clamp(mx, 24, Math.max(24, W - 24));
      pill(left, x0 / 2, rowY, x0, "x");
      pill(right, (x1 + W) / 2, rowY, W - x1, "x");
      pill(top, colX, y0 / 2, y0, "y");
      pill(bottom, colX, (y1 + H) / 2, H - y1, "y");
      // Before the box has a size there is nothing to place a tag against.
      if (W < 1 || H < 1) return;
      const isBoxed = boxed.get() > 0.5;
      if (isBoxed) {
        const below = H - y1 >= 24 || y0 < 24;
        tagX.set(r2(clamp(mx, 44, Math.max(44, W - 44))));
        tagY.set(r2(below ? Math.min(H - 4, y1 + 4) : y0 - 4));
        tagText.set(`${fmt(x1 - x0, "x")} × ${fmt(y1 - y0, "y")}`);
        const next = { boxed: true, left: false, up: !below };
        if (
          tagRef.current.boxed !== next.boxed ||
          tagRef.current.up !== next.up
        ) {
          tagRef.current = next;
          setTag(next);
        }
      } else {
        tagX.set(r2(mx));
        tagY.set(r2(my));
        tagText.set(`x ${fmt(mx, "x")}  y ${fmt(my, "y")}`);
        // The tag sits in the quadrant away from a short line, so it never
        // lands on that line's own label.
        const next = { boxed: false, left: W - mx < 140, up: H - my < 64 };
        const now = tagRef.current;
        if (
          now.boxed !== next.boxed ||
          now.left !== next.left ||
          now.up !== next.up
        ) {
          tagRef.current = next;
          setTag(next);
        }
      }
    };
    place();
    const off = [ax0, ay0, ax1, ay1, cx, cy, cw, ch, boxed].map((v) =>
      v.on("change", place),
    );
    return () => {
      for (const unsubscribe of off) unsubscribe();
    };
  }, [
    ax0,
    ax1,
    ay0,
    ay1,
    bh,
    bottom,
    boxed,
    bw,
    ch,
    cw,
    cx,
    cy,
    farX,
    farY,
    left,
    markH,
    markW,
    markX,
    markY,
    right,
    tagText,
    tagX,
    tagY,
    top,
    labels,
    precision,
    rootSize,
  ]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let inside = false;
    let keyboard = false;
    let touched = false;
    let locked: HTMLElement | null = null;
    let resting: HTMLElement | null = null;
    let running: AnimationPlaybackControls[] = [];
    let aim: Frame | null = null;
    let last = { x: 0, y: 0 };
    let targetSizer: ResizeObserver | null = null;

    const stop = () => {
      for (const c of running) c.stop();
      running = [];
    };

    const go = (
      f: Frame,
      spring: (typeof springs)[keyof typeof springs] | null,
    ) => {
      stop();
      if (!spring || !params.current.motionSafe) {
        ax0.set(f.x0);
        ay0.set(f.y0);
        ax1.set(f.x1);
        ay1.set(f.y1);
        cx.set(f.cx);
        cy.set(f.cy);
        return;
      }
      running = [
        animate(ax0, f.x0, spring),
        animate(ay0, f.y0, spring),
        animate(ax1, f.x1, spring),
        animate(ay1, f.y1, spring),
        animate(cx, f.cx, spring),
        animate(cy, f.cy, spring),
      ];
    };

    const level = (target: MotionValue<number>, to: number) => {
      if (target.get() === to && !target.isAnimating()) return;
      animate(
        target,
        to,
        to > target.get()
          ? { duration: durations.fast, ease: easings.enter }
          : exitFor(),
      );
    };

    const pointFrame = (x: number, y: number): Frame => ({
      x0: r2(x),
      y0: r2(y),
      x1: r2(x),
      y1: r2(y),
      cx: r2(x),
      cy: r2(y),
    });

    const frameOf = (el: HTMLElement): Frame => {
      const box = root.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const x0 = clamp(r.left - box.left, 0, box.width);
      const y0 = clamp(r.top - box.top, 0, box.height);
      const x1 = clamp(r.right - box.left, 0, box.width);
      const y1 = clamp(r.bottom - box.top, 0, box.height);
      return {
        x0: r2(x0),
        y0: r2(y0),
        x1: r2(x1),
        y1: r2(y1),
        cx: r2((x0 + x1) / 2),
        cy: r2((y0 + y1) / 2),
      };
    };

    const nameOf = (el: HTMLElement) =>
      (
        el.dataset.measure ||
        el.getAttribute("aria-label") ||
        el.textContent?.trim().slice(0, 40) ||
        el.tagName.toLowerCase()
      ).trim();

    const report = (el: HTMLElement | null) => {
      const p = params.current;
      if (!p.onMeasure) return;
      if (!el) {
        p.onMeasure(null);
        return;
      }
      const f = frameOf(el);
      p.onMeasure({
        target: el,
        label: nameOf(el),
        width: Math.round(f.x1 - f.x0),
        height: Math.round(f.y1 - f.y0),
        left: Math.round(f.x0),
        top: Math.round(f.y0),
        right: Math.round(cw.get() - f.x1),
        bottom: Math.round(ch.get() - f.y1),
      });
    };

    const homeTarget = () => {
      const marked = root.querySelector("[data-measure-home]");
      if (usable(marked)) return marked;
      for (const el of root.querySelectorAll(params.current.targets)) {
        if (usable(el) && el !== root) return el;
      }
      return null;
    };

    // Nobody pointing, nothing focused: the lines rest dimly, so the piece
    // shows what it does before anyone touches it.
    const settleRest = (animated: boolean) => {
      const p = params.current;
      resting = null;
      if (inside || locked || p.disabled || p.rest === "none") {
        if (!inside && !locked) level(shown, 0);
        return;
      }
      const spring = animated ? springs.glide : null;
      const home = p.rest === "home" && p.snap ? homeTarget() : null;
      if (home) {
        resting = home;
        go(frameOf(home), spring);
        level(boxed, 1);
      } else {
        go(pointFrame(cw.get() / 2, ch.get() / 2), spring);
        level(boxed, 0);
      }
      level(engaged, 0);
      level(shown, 0.45);
    };

    const lock = (el: HTMLElement, quiet = false) => {
      if (locked === el && !quiet) return;
      const fresh = locked !== el;
      locked = el;
      resting = null;
      if (fresh) {
        targetSizer?.disconnect();
        targetSizer?.observe(el);
      }
      const f = frameOf(el);
      if (
        quiet &&
        aim &&
        Math.abs(f.x0 - aim.x0) +
          Math.abs(f.y0 - aim.y0) +
          Math.abs(f.x1 - aim.x1) +
          Math.abs(f.y1 - aim.y1) <
          0.5
      ) {
        return;
      }
      aim = f;
      go(f, quiet ? springs.flick : springs.snap);
      level(boxed, 1);
      level(shown, 1);
      level(engaged, 1);
      if (fresh) report(el);
    };

    /** Let go of the child: back to the pointer, or to rest when it has gone. */
    const release = (toRest = false) => {
      if (!locked) return;
      locked = null;
      aim = null;
      targetSizer?.disconnect();
      report(null);
      if (inside && !toRest) {
        go(pointFrame(last.x, last.y), springs.glide);
        level(boxed, 0);
      } else {
        settleRest(true);
      }
    };

    const targetAt = (node: EventTarget | null) => {
      const p = params.current;
      if (!p.snap || !(node instanceof Element)) return null;
      const el = node.closest(p.targets);
      if (!el || el === root || !root.contains(el)) return null;
      return usable(el) ? el : null;
    };

    const local = (event: PointerEvent) => {
      const box = root.getBoundingClientRect();
      return {
        x: r2(clamp(event.clientX - box.left, 0, box.width)),
        y: r2(clamp(event.clientY - box.top, 0, box.height)),
      };
    };

    const point = (event: PointerEvent) => {
      const p = params.current;
      const pt = local(event);
      const arriving = !inside;
      inside = true;
      keyboard = false;
      last = pt;
      level(shown, 1);
      level(engaged, 1);
      const el = targetAt(event.target);
      if (el) {
        lock(el);
        return;
      }
      if (locked) {
        release();
        return;
      }
      if (arriving && !resting && shown.get() < 0.1) {
        // Arriving to nothing shown, the lines start where the pointer is
        // rather than flying in from wherever they last were.
        go(pointFrame(pt.x, pt.y), null);
        level(boxed, 0);
        return;
      }
      if (resting) {
        resting = null;
        level(boxed, 0);
      }
      const spring = springs[p.follow] ?? springs.glide;
      go(pointFrame(pt.x, pt.y), spring);
    };

    const onMove = (event: PointerEvent) => {
      if (params.current.disabled || event.pointerType === "touch") return;
      touched = false;
      point(event);
    };
    // A finger has no hover: a tap measures where it lands, and the
    // measurement stays until the next tap.
    const onDown = (event: PointerEvent) => {
      if (params.current.disabled || event.pointerType !== "touch") return;
      touched = true;
      point(event);
    };

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch" || touched) return;
      inside = false;
      const active = document.activeElement;
      if (keyboard && active instanceof HTMLElement && root.contains(active)) {
        return;
      }
      if (locked) release(true);
      else settleRest(true);
    };

    const onFocusIn = (event: FocusEvent) => {
      if (params.current.disabled) return;
      const el = targetAt(event.target);
      if (!el || !el.matches(":focus-visible")) return;
      keyboard = true;
      lock(el);
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      if (!keyboard) return;
      keyboard = false;
      if (inside) release();
      else if (locked) release(true);
      else settleRest(true);
    };

    const follow = () => {
      if (locked && locked.isConnected) lock(locked, true);
      else if (locked) release();
      else if (resting || !inside) settleRest(false);
    };

    const measure = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      cw.set(w);
      ch.set(h);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
      follow();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    const sizer = new ResizeObserver(measure);
    sizer.observe(root);
    targetSizer = new ResizeObserver(follow);

    api.current = {
      refresh: () => {
        const p = params.current;
        if (p.disabled) {
          inside = false;
          keyboard = false;
          touched = false;
          if (locked) {
            locked = null;
            aim = null;
            targetSizer?.disconnect();
            report(null);
          }
          stop();
          level(shown, 0);
          level(boxed, 0);
          level(engaged, 0);
          return;
        }
        if (locked && !p.snap) {
          release();
          return;
        }
        if (locked) lock(locked, true);
        else if (!inside) settleRest(false);
      },
    };

    return () => {
      stop();
      sizer.disconnect();
      targetSizer?.disconnect();
      window.removeEventListener("scroll", follow, { capture: true });
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      api.current = null;
    };
  }, [ax0, ax1, ay0, ay1, boxed, ch, cw, cx, cy, engaged, shown]);

  React.useEffect(() => {
    api.current?.refresh();
  }, [disabled, rest, snap, targets, motionSafe]);

  const ringOpacity = useTransform(boxed, (b) => r2(1 - b));
  const washOpacity = useTransform(boxed, (b) => r2(b * 0.07));
  const path = ticks ? rulerPath(size.w, size.h, step) : "";
  const dash = dashed ? "4 3" : undefined;

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative",
        crosshair &&
          !disabled &&
          "cursor-crosshair [&_input]:cursor-text [&_textarea]:cursor-text",
        className,
      )}
    >
      {children}
      {/* The colour sits on a plain wrapper: a changed `color` is then
          React's to apply, not a static style motion might keep. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip"
        style={{ color: tone }}
      >
        <motion.div className="absolute inset-0" style={{ opacity: shown }}>
          <svg className="absolute inset-0 size-full overflow-visible">
            {path ? (
              <path
                d={path}
                className="stroke-ink-3/60"
                strokeWidth={1}
                shapeRendering="crispEdges"
                fill="none"
              />
            ) : null}
            {ticks ? (
              <g fill="currentColor">
                <motion.rect x={markX} y={0} width={markW} height={RULER} />
                <motion.rect x={markX} y={farY} width={markW} height={RULER} />
                <motion.rect x={0} y={markY} width={RULER} height={markH} />
                <motion.rect x={farX} y={markY} width={RULER} height={markH} />
              </g>
            ) : null}
            <g
              stroke="currentColor"
              strokeWidth={stroke}
              strokeDasharray={dash}
              shapeRendering="crispEdges"
            >
              <motion.line x1={0} y1={cy} x2={ax0} y2={cy} />
              <motion.line x1={ax1} y1={cy} x2={cw} y2={cy} />
              <motion.line x1={cx} y1={0} x2={cx} y2={ay0} />
              <motion.line x1={cx} y1={ay1} x2={cx} y2={ch} />
            </g>
            <motion.rect
              x={ax0}
              y={ay0}
              width={bw}
              height={bh}
              fill="currentColor"
              style={{ opacity: washOpacity }}
            />
            <motion.rect
              x={ax0}
              y={ay0}
              width={bw}
              height={bh}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              shapeRendering="crispEdges"
              style={{ opacity: boxed }}
            />
            <motion.circle
              cx={cx}
              cy={cy}
              r={3}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              style={{ opacity: ringOpacity }}
            />
          </svg>
          <DistancePill pill={left} />
          <DistancePill pill={right} />
          <DistancePill pill={top} />
          <DistancePill pill={bottom} />
          {readout ? (
            <motion.div
              className="absolute top-0 left-0"
              style={{ x: tagX, y: tagY, opacity: engaged }}
            >
              <motion.span
                className={cn(
                  "absolute rounded-1 bg-current px-1.5 py-0.5 font-mono text-[10px] leading-none whitespace-nowrap tabular-nums",
                  tag.boxed
                    ? "-translate-x-1/2"
                    : tag.left
                      ? "right-2.5"
                      : "left-2.5",
                  tag.boxed
                    ? tag.up
                      ? "bottom-0"
                      : "top-0"
                    : tag.up
                      ? "bottom-2.5"
                      : "top-2.5",
                )}
              >
                {/* Reversed out of the tone, so the tag reads on any content. */}
                <motion.span className="text-background">{tagText}</motion.span>
              </motion.span>
            </motion.div>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}
