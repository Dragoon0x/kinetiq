"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

/** Segment nodes, clamped to this range. */
const MIN_NODES = 4;
const MAX_NODES = 16;
/** Fixed physics tick — the sim always steps at 60Hz regardless of frame rate. */
const FIXED_DT = 1 / 60;
/** Cap accumulated substeps so a long stall can't trigger a spiral-of-death. */
const MAX_SUBSTEPS = 5;
/** Verlet velocity retention per step — under 1 so swings bleed energy and settle. */
const FRICTION = 0.98;
/** Downward pull in px per second², tuned to the stage scale via `layout`. */
const GRAVITY = 1400;
/** Constraint-relaxation passes per tick — more passes read as a stiffer, tauter rope. */
const CONSTRAINT_PASSES = 6;
/** Grab hit-test radius in px around a node. */
const GRAB_RADIUS = 28;
/** Pointer travel (px) before a press becomes a grab — protects taps/clicks. */
const DRAG_THRESHOLD = 3;
/** Fraction of the stage the rope's rest length spans (its natural sag/slack). */
const SLACK = 1.18;

export type TetherRopeProps = {
  /** Segment nodes. @default 12 (clamped to [4, 16]) */
  nodes?: number;
  /** `"top"` pins node 0 and the rope hangs; `"ends"` pins both ends like a slung cable. @default "top" */
  anchor?: "top" | "ends";
  className?: string;
  "aria-label"?: string;
  /** Stage height in px. @default 280 */
  height?: number;
};

/** One point mass. Verlet stores position + its previous position (velocity is implicit). */
type Node = {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  /** Hard-constrained each pass to `{pinX, pinY}` when set — anchors and the grabbed node. */
  pinned: boolean;
  pinX: number;
  pinY: number;
};

/**
 * A smooth Catmull-Rom `d` through the nodes, closed-form so the frame loop
 * allocates only this one string. The spline hugs every node, so the rope
 * reads as a continuous curve rather than a polyline of segments.
 */
const buildPath = (pts: readonly Node[]): string => {
  const n = pts.length;
  if (n === 0) return "";
  const first = pts[0];
  if (!first || n === 1) return first ? `M ${first.x} ${first.y}` : "";
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    if (!p0 || !p1 || !p2 || !p3) continue;
    // Catmull-Rom → cubic Bézier control points (tension 0).
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
};

/**
 * An interactive hanging rope, simulated with Verlet integration. N point
 * masses fall under gravity while several constraint-relaxation passes hold
 * each segment to its rest length, so the rope reads as weighty and taut —
 * grab it and it swings with real inertia, then settles. `anchor="top"` pins
 * the first node and the rope hangs; `anchor="ends"` pins both ends into a
 * slung catenary that sways when disturbed.
 *
 * One rAF loop drives an SVG `<path>` and node `<circle>`s imperatively from a
 * ref of node positions — never React state, so nothing re-renders per frame.
 * The loop is gated by an IntersectionObserver (paused under ~10% visible) and
 * `visibilitychange` (paused while the tab is hidden), sizes DPR-independently
 * via a ResizeObserver that re-lays-out the anchors and rest lengths from the
 * new stage, and cleans everything up on unmount. Pointer drag uses a 3px
 * threshold + `setPointerCapture`; the last frames' motion carries the release
 * swing for free (Verlet reads velocity from position history).
 *
 * Reduced motion: no loop, no observers — a single static catenary curve is
 * computed and rendered as one SVG path, fully legible at rest. The Reset
 * button stays for a keyboard-operable affordance.
 */
export function TetherRope({
  nodes = 12,
  anchor = "top",
  className,
  "aria-label": ariaLabel = "Tether rope",
  height = 280,
}: TetherRopeProps) {
  const motionSafe = useMotionSafe();
  const count = Math.max(MIN_NODES, Math.min(MAX_NODES, Math.round(nodes)));

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const pathRef = React.useRef<SVGPathElement | null>(null);
  const handleRef = React.useRef<SVGCircleElement | null>(null);
  const circleRefs = React.useRef<(SVGCircleElement | null)[]>([]);

  // Re-drops the rope. A discrete nonce (never per-frame) — bumping it restarts
  // the physics effect, which re-seeds nodes at rest.
  const [resetNonce, setResetNonce] = React.useState(0);

  // The live simulation. Everything below runs off refs and the DOM; no state
  // is written per frame, so React never re-renders while the rope swings.
  React.useEffect(() => {
    if (!motionSafe) return;
    const stage = stageRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!stage || !svg || !path) return;

    // --- geometry, rebuilt only on resize --------------------------------
    let width = 0;
    let stageH = 0;
    let restLength = 0;
    const nodesArr: Node[] = [];

    /** Where each anchor pins, in current stage coordinates. */
    const anchorFor = (index: number): { x: number; y: number } | null => {
      const topY = stageH * 0.12;
      if (anchor === "ends") {
        if (index === 0) return { x: width * 0.16, y: topY };
        if (index === count - 1) return { x: width * 0.84, y: topY };
        return null;
      }
      if (index === 0) return { x: width * 0.5, y: topY };
      return null;
    };

    /** Seed all nodes at rest for the current size — hung or slung, no motion. */
    const seed = () => {
      const span = anchor === "ends" ? width * 0.68 : 0;
      restLength =
        anchor === "ends"
          ? (span * SLACK) / Math.max(1, count - 1)
          : ((stageH * 0.66) / Math.max(1, count - 1)) * 0.98;
      const startX = anchor === "ends" ? width * 0.16 : width * 0.5;
      const topY = stageH * 0.12;
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        let x: number;
        let y: number;
        if (anchor === "ends") {
          // A cosine sag between the two pinned ends — the rest catenary.
          x = startX + span * t;
          y = topY + Math.sin(Math.PI * t) * stageH * 0.34;
        } else {
          x = startX;
          y = topY + i * restLength;
        }
        const pin = anchorFor(i);
        const node = nodesArr[i];
        if (node) {
          node.x = x;
          node.y = y;
          node.oldX = x;
          node.oldY = y;
          node.pinned = pin !== null;
          node.pinX = pin?.x ?? x;
          node.pinY = pin?.y ?? y;
        } else {
          nodesArr[i] = {
            x,
            y,
            oldX: x,
            oldY: y,
            pinned: pin !== null,
            pinX: pin?.x ?? x,
            pinY: pin?.y ?? y,
          };
        }
      }
    };

    // --- the Verlet step -------------------------------------------------
    const integrate = () => {
      const g = GRAVITY * FIXED_DT * FIXED_DT;
      for (let i = 0; i < count; i++) {
        const node = nodesArr[i];
        if (!node || node.pinned) continue;
        const vx = (node.x - node.oldX) * FRICTION;
        const vy = (node.y - node.oldY) * FRICTION;
        node.oldX = node.x;
        node.oldY = node.y;
        node.x += vx;
        node.y += vy + g;
      }
    };

    const relax = () => {
      for (let pass = 0; pass < CONSTRAINT_PASSES; pass++) {
        for (let i = 0; i < count - 1; i++) {
          const a = nodesArr[i];
          const b = nodesArr[i + 1];
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.0001;
          const diff = (restLength - dist) / dist / 2;
          const ox = dx * diff;
          const oy = dy * diff;
          if (!a.pinned) {
            a.x -= ox;
            a.y -= oy;
          }
          if (!b.pinned) {
            b.x += ox;
            b.y += oy;
          }
        }
        // Pins win every pass — hard-set so nothing drags an anchor off point.
        for (let i = 0; i < count; i++) {
          const node = nodesArr[i];
          if (node?.pinned) {
            node.x = node.pinX;
            node.y = node.pinY;
          }
        }
      }
    };

    // --- imperative render: path + circles, one string per frame ----------
    const draw = () => {
      path.setAttribute("d", buildPath(nodesArr));
      const circles = circleRefs.current;
      for (let i = 0; i < count; i++) {
        const node = nodesArr[i];
        const circle = circles[i];
        if (node && circle) {
          circle.setAttribute("cx", node.x.toFixed(2));
          circle.setAttribute("cy", node.y.toFixed(2));
        }
      }
      const free = nodesArr[count - 1];
      const handle = handleRef.current;
      if (free && handle) {
        handle.setAttribute("cx", free.x.toFixed(2));
        handle.setAttribute("cy", free.y.toFixed(2));
      }
    };

    // --- grab: pin the nearest node to the pointer ------------------------
    let grabbed = -1; // node index currently held, or -1
    let pressPointer: number | null = null;
    let pressed = false;
    let engaged = false;
    let startX = 0;
    let startY = 0;

    const toLocal = (event: PointerEvent): { x: number; y: number } => {
      const rect = svg.getBoundingClientRect();
      const sx = rect.width === 0 ? 1 : width / rect.width;
      const sy = rect.height === 0 ? 1 : stageH / rect.height;
      return {
        x: (event.clientX - rect.left) * sx,
        y: (event.clientY - rect.top) * sy,
      };
    };

    const nearest = (x: number, y: number): number => {
      let best = -1;
      let bestDist = GRAB_RADIUS * GRAB_RADIUS;
      for (let i = 0; i < count; i++) {
        const node = nodesArr[i];
        // Anchors aren't grabbable — only the free body of the rope.
        if (!node || node.pinned) continue;
        const dx = node.x - x;
        const dy = node.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          best = i;
        }
      }
      return best;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      const local = toLocal(event);
      const hit = nearest(local.x, local.y);
      if (hit === -1) return;
      pressPointer = event.pointerId;
      pressed = true;
      engaged = false;
      grabbed = hit;
      startX = event.clientX;
      startY = event.clientY;
      svg.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pressed || event.pointerId !== pressPointer || grabbed === -1) return;
      if (!engaged) {
        const moved = Math.hypot(
          event.clientX - startX,
          event.clientY - startY,
        );
        if (moved < DRAG_THRESHOLD) return;
        engaged = true;
        const node = nodesArr[grabbed];
        if (node) node.pinned = true;
      }
      const local = toLocal(event);
      const node = nodesArr[grabbed];
      if (node) {
        node.pinX = local.x;
        node.pinY = local.y;
        // Track old→new so the release inherits the drag's velocity.
        node.oldX = node.x;
        node.oldY = node.y;
        node.x = local.x;
        node.y = local.y;
      }
    };

    const release = (event: PointerEvent) => {
      if (event.pointerId !== pressPointer) return;
      const node = grabbed === -1 ? null : nodesArr[grabbed];
      // Only un-pin what the grab pinned — never an anchor.
      if (node && engaged && anchorFor(grabbed) === null) node.pinned = false;
      pressed = false;
      engaged = false;
      grabbed = -1;
      pressPointer = null;
      if (svg.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }
    };

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", release);
    svg.addEventListener("pointercancel", release);

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let last: number | null = null;
    let accumulator = 0;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (last === null) last = now;
      let dt = (now - last) / 1000;
      last = now;
      // Clamp a long first/resumed frame so we don't fast-forward the sim.
      if (dt > MAX_SUBSTEPS * FIXED_DT) dt = MAX_SUBSTEPS * FIXED_DT;
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        integrate();
        relax();
        accumulator -= FIXED_DT;
        steps += 1;
      }
      draw();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        last = null; // rebase the clock so the pause doesn't leap the sim
        accumulator = 0;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // Sizing is DPR-independent — the SVG viewBox tracks CSS px exactly.
    const measure = () => {
      const cssW = stage.clientWidth;
      const cssH = stage.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      width = cssW;
      stageH = cssH;
      svg.setAttribute("viewBox", `0 0 ${width} ${stageH}`);
      // Re-lay-out anchors and rest length for the new stage, keeping the rope
      // proportional. First measure also seeds the rope at rest.
      seed();
      draw();
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(stage);

    const intersection = new IntersectionObserver(
      (entries) => {
        const last2 = entries[entries.length - 1];
        if (last2) inView = last2.isIntersecting;
        syncLoop();
      },
      { threshold: 0.1 },
    );
    intersection.observe(stage);

    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      svg.removeEventListener("pointerup", release);
      svg.removeEventListener("pointercancel", release);
    };
  }, [motionSafe, count, anchor, height, resetNonce]);

  // Reduced motion: a single static catenary, computed at a nominal 600×`height`
  // and stretched to fit via preserveAspectRatio. No loop, no observers.
  const staticPath = React.useMemo(() => {
    const w = 600;
    const h = height;
    const topY = h * 0.12;
    const pts: Node[] = [];
    const mk = (x: number, y: number): Node => ({
      x,
      y,
      oldX: x,
      oldY: y,
      pinned: false,
      pinX: x,
      pinY: y,
    });
    if (anchor === "ends") {
      const span = w * 0.68;
      const startX = w * 0.16;
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        pts.push(mk(startX + span * t, topY + Math.sin(Math.PI * t) * h * 0.34));
      }
    } else {
      // A hanging rope curves as it settles — bias the sag toward the free end.
      const startX = w * 0.5;
      const drop = h * 0.66;
      for (let i = 0; i < count; i++) {
        const t = i / Math.max(1, count - 1);
        pts.push(mk(startX + Math.sin(t * Math.PI * 0.5) * w * 0.06, topY + t * drop));
      }
    }
    return { d: buildPath(pts), w, h, pts };
  }, [anchor, count, height]);

  const reset = () => setResetNonce((n) => n + 1);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "relative w-full overflow-hidden rounded-4 border border-border bg-card",
        className,
      )}
      style={{ height }}
    >
      <div ref={stageRef} className="absolute inset-0">
        {motionSafe ? (
          <svg
            ref={svgRef}
            aria-hidden
            className="size-full touch-none cursor-grab select-none active:cursor-grabbing"
            preserveAspectRatio="none"
          >
            <path
              ref={pathRef}
              fill="none"
              stroke="var(--signal)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {Array.from({ length: count }, (_, i) => (
              <circle
                key={i}
                ref={(el) => {
                  circleRefs.current[i] = el;
                }}
                r={1.6}
                fill="var(--ink-3)"
                opacity={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <circle
              ref={handleRef}
              r={6}
              fill="var(--signal)"
              stroke="var(--card)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <svg
            aria-hidden
            className="size-full"
            viewBox={`0 0 ${staticPath.w} ${staticPath.h}`}
            preserveAspectRatio="none"
          >
            <path
              d={staticPath.d}
              fill="none"
              stroke="var(--signal)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {staticPath.pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={1.6}
                fill="var(--ink-3)"
                opacity={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}
      </div>

      <button
        type="button"
        onClick={reset}
        className={cn(
          "absolute right-2 bottom-2 z-10 rounded-2 border border-border bg-card/80 px-2 py-1 text-label text-muted-foreground backdrop-blur transition-colors",
          "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        Reset
      </button>
    </div>
  );
}
