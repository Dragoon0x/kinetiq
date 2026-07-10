"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type PanHotspot = {
  /** Stable identity — also the value reported by `onVisit`. */
  id: string;
  /** Mono marker label and the voice of the announcement. */
  label: string;
  /** Position across the panorama, 0 (left edge) .. 1 (right edge). */
  x: number;
  /** One-line note that unfurls as the marker reaches center. */
  detail?: string;
};

export type PanWindowProps = {
  /** Two to four markers pinned across the vista. */
  hotspots: PanHotspot[];
  /** Fires when a centered marker is activated. */
  onVisit?: (id: string) => void;
  /** Window height, px. @default 240 */
  height?: number;
  /** Panorama width as a multiple of the window width. @default 2.2 */
  panoramaWidth?: number;
  className?: string;
  /** Accessible name for the group. @default "Panorama" */
  "aria-label"?: string;
};

/** Parallax carry per band, far to near — the ridge trails the ground. */
const FAR_FACTOR = 0.6;
const MID_FACTOR = 0.85;
const NEAR_FACTOR = 1;
/** Horizontal travel (px) before a press becomes a pan — protects marker taps. */
const DRAG_THRESHOLD = 3;
/** Rubber give past an edge, in pan-fraction; tanh saturates the pull. */
const RUBBER_FRAC = 0.08;
/** Release throw = velocity × this carry, seconds. */
const MOMENTUM_CARRY = 0.32;
/** Below this release speed (fraction/s) the pan just rests where it lands. */
const MOMENTUM_MIN = 0.05;
/** Momentum is capped to a believable throw, fraction/s. */
const MOMENTUM_CAP = 2.6;
/** A pointer-click on a marker popped at least this far counts as a visit. */
const POP_VISIT = 0.5;
/** Arrow keys pan by this fraction of the window width. */
const KEY_STEP_WINDOWS = 0.15;

/** Logical width the vista SVG scales from; drawing never needs pixel width. */
const VISTA_W = 1440;
/** Logical height band of the ridge silhouette. */
const RIDGE_H = 120;

// Dusk-neutral scene literals — the vista is a self-contained vignette so it
// stays legible in both themes; only the window frame and markers speak tokens.
const SKY =
  "linear-gradient(180deg, oklch(0.52 0.045 262) 0%, oklch(0.43 0.05 280) 58%, oklch(0.34 0.05 294) 100%)";
const RIDGE_BACK = "oklch(0.34 0.045 292)";
const RIDGE_FRONT = "oklch(0.28 0.04 294)";
const MAST_INK = "oklch(0.22 0.03 298)";
const BEACON = "oklch(0.83 0.13 82)";
const BEACON_GLOW = "0 0 6px oklch(0.78 0.12 82 / 0.6)";
const GROUND_INK = "oklch(0.15 0.02 300)";

/** A sine-hump silhouette closed to the band floor, drawn across VISTA_W. */
const ridgePath = (
  rng: () => number,
  cycles: number,
  amp: number,
  base: number,
): string => {
  const phase = rng() * Math.PI * 2;
  const warp = 0.7 + rng() * 0.6;
  const cmds: string[] = [];
  for (let x = 0; x <= VISTA_W; x += 24) {
    const t = (x / VISTA_W) * Math.PI * 2 * cycles;
    const y =
      base - amp * (Math.sin(t + phase) * 0.62 + Math.sin(t * warp) * 0.38);
    cmds.push(`${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)}`);
  }
  return `${cmds.join(" ")} L${VISTA_W} ${RIDGE_H} L0 ${RIDGE_H} Z`;
};

/** All scatter is seeded off the serial — identical on server and client. */
const VISTA = (() => {
  const rng = seeded(djb2("kinetiq:pan-window:KQ-084"));
  const ridgeBack = ridgePath(rng, 5, 30, 62);
  const ridgeFront = ridgePath(rng, 8, 20, 84);
  const masts = Array.from({ length: 11 }, (_, i) => ({
    x: (i + 0.5 + (rng() - 0.5) * 0.7) / 11,
    h: 24 + rng() * 24,
    lamp: rng() > 0.62,
  }));
  const posts = Array.from({ length: 16 }, (_, i) => ({
    x: (i + 0.5) / 16,
    h: 8 + rng() * 8,
  }));
  return { ridgeBack, ridgeFront, masts, posts };
})();

/**
 * A wide dusk panorama behind glass that you drag-pan across. One pan value
 * `p` (a fraction, 0 at the left edge .. 1 at the right) drives everything:
 * three depth bands translate as percentages of their own width at ×0.6 /
 * ×0.85 / ×1.0, so the ridge trails the ground for parallax. A pointer-
 * captured drag tracks `p` one-to-one with tanh rubber-resist past the edges;
 * release throws it on a velocity-seeded two-keyframe `springs.drift`, clamped
 * home if it overshoots. Arrow keys pan by 15% of the window on `springs.glide`,
 * Home and End jump to the ends.
 *
 * Markers are pinned on the near band at their panorama x and are real buttons
 * in tab order. Each derives its centeredness from `p` and pops as it enters
 * the center third — scale to 1.12, a −6px step forward, an accent ring, and
 * its detail line unfurling. Focusing a marker glides it to center; activating
 * a centered marker visits it with a brief accent flash; clicking an off-center
 * one glides it to center instead.
 *
 * Reduced motion: pans resolve instantly with a hard clamp — no glide, no
 * momentum, no rubber — and pops swap in place. Same markers, keys, and
 * announcements. Cleanup stops every in-flight control on unmount; there are
 * no rAF loops and nothing random or clock-derived.
 */
export function PanWindow({
  hotspots,
  onVisit,
  height = 240,
  panoramaWidth = 2.2,
  className,
  "aria-label": ariaLabel = "Panorama",
}: PanWindowProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const roster = hotspots.slice(0, 4);
  /** Panorama span; guarded above 1 so the pan range never collapses. */
  const pw = Math.max(1.08, panoramaWidth);
  const span = ((pw - 1) / pw) * 100; // near-band travel, % of its own width

  /** p — pan fraction; every visual derives from it. */
  const p = useMotionValue(0);
  const nearX = useTransform(p, (v) => `${-v * span * NEAR_FACTOR}%`);
  const midX = useTransform(p, (v) => `${-v * span * MID_FACTOR}%`);
  const farX = useTransform(p, (v) => `${-v * span * FAR_FACTOR}%`);
  const bearingText = useTransform(p, (v) =>
    String(Math.round(clamp(v, 0, 1) * 120)).padStart(3, "0"),
  );

  const [announcement, setAnnouncement] = React.useState("");
  const [grabbing, setGrabbing] = React.useState(false);

  // Window width is read only inside handlers (px → pan-fraction), never in
  // render — so it lives in a ref and a resize never forces a re-render.
  const frameRef = React.useRef<HTMLDivElement>(null);
  const widthRef = React.useRef(0);
  const dragRef = React.useRef({
    id: -1,
    active: false,
    engaged: false,
    startX: 0,
    startP: 0,
    lastX: 0,
    lastT: 0,
    v: 0,
  });
  /** A pan's release click must not read as a marker pick. */
  const suppressRef = React.useRef(false);
  /** In-flight glide/drift controls — stopped by any seize and on unmount. */
  const flightsRef = React.useRef<Set<ReturnType<typeof animate>>>(new Set());

  const seize = () => {
    const flights = flightsRef.current;
    flights.forEach((flight) => flight.stop());
    flights.clear();
  };

  const track = (control: ReturnType<typeof animate>) => {
    const flights = flightsRef.current;
    flights.add(control);
    const drop = () => flights.delete(control);
    control.then(drop, drop);
  };

  /** Glide (or, under reduced motion, jump) the pan to a clamped target. */
  const panTo = (target: number, spring: (typeof springs)[keyof typeof springs]) => {
    seize();
    const clamped = clamp(target, 0, 1);
    if (!motionSafe) {
      p.set(clamped);
      return;
    }
    track(animate(p, clamped, spring));
  };

  /** Center the marker at panorama-x. */
  const seek = (x: number) => panTo((x * pw - 0.5) / (pw - 1), springs.glide);

  const visit = (spot: PanHotspot) => {
    setAnnouncement(`${spot.label} visited`);
    onVisit?.(spot.id);
  };

  const consumeSuppressed = (): boolean => {
    if (suppressRef.current) {
      suppressRef.current = false;
      return true;
    }
    return false;
  };

  /** Pan range in px; guarded so a pre-measure gesture can't divide by zero. */
  const maxPx = () => (pw - 1) * (widthRef.current || 1);

  const rubber = (over: number) => RUBBER_FRAC * Math.tanh(over / RUBBER_FRAC);
  const resist = (frac: number) =>
    frac < 0 ? -rubber(-frac) : frac > 1 ? 1 + rubber(frac - 1) : frac;

  // Measure the window once and on resize; ref only, no state.
  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      widthRef.current = el.clientWidth;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A flight in progress must never outlive the component.
  React.useEffect(() => {
    const flights = flightsRef.current;
    return () => {
      flights.forEach((flight) => flight.stop());
      flights.clear();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Only when the frame itself holds focus — never inside a marker button.
    if (event.target !== event.currentTarget) return;
    const step = KEY_STEP_WINDOWS / (pw - 1);
    let handled = true;
    if (event.key === "ArrowRight") panTo(p.get() + step, springs.glide);
    else if (event.key === "ArrowLeft") panTo(p.get() - step, springs.glide);
    else if (event.key === "Home") panTo(0, springs.glide);
    else if (event.key === "End") panTo(1, springs.glide);
    else handled = false;
    if (handled) event.preventDefault();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const drag = dragRef.current;
    drag.id = event.pointerId;
    drag.active = true;
    drag.engaged = false;
    drag.startX = event.clientX;
    drag.startP = p.get();
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    drag.v = 0;
    suppressRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.id) return;
    if (!drag.engaged) {
      if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) return;
      // Crossed the threshold — this is a pan. Seizing here (not on
      // pointerdown) means a plain tap never strands a glide mid-flight.
      drag.engaged = true;
      seize();
      drag.startX = event.clientX;
      drag.startP = p.get();
      drag.lastX = event.clientX;
      drag.lastT = event.timeStamp;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
      return;
    }
    const max = maxPx();
    const raw = drag.startP + (drag.startX - event.clientX) / max;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    const dFrac = (drag.lastX - event.clientX) / max;
    if (dt > 0) drag.v = drag.v * 0.4 + (dFrac / dt) * 0.6;
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    p.set(motionSafe ? resist(raw) : clamp(raw, 0, 1));
  };

  const settleDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    fling: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.id) return;
    const engaged = drag.engaged;
    drag.active = false;
    drag.engaged = false;
    drag.id = -1;
    if (!engaged) return;
    setGrabbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // The click minted by this release is a pan, not a pick.
    suppressRef.current = true;
    const cur = p.get();
    // Pulled past an edge — let the rubber spring home.
    if (cur < 0 || cur > 1) {
      panTo(clamp(cur, 0, 1), springs.glide);
      return;
    }
    if (!motionSafe) return;
    const v = clamp(drag.v, -MOMENTUM_CAP, MOMENTUM_CAP);
    if (fling && Math.abs(v) >= MOMENTUM_MIN) {
      seize();
      track(
        animate(p, clamp(cur + v * MOMENTUM_CARRY, 0, 1), {
          ...springs.drift,
          velocity: v,
        }),
      );
    }
  };

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => settleDrag(event, true)}
      onPointerCancel={(event) => settleDrag(event, false)}
      onClick={() => {
        suppressRef.current = false;
      }}
      className={cn(
        "relative w-full touch-none select-none overflow-hidden rounded-4 border border-hairline bg-surface-0 outline-none focus-visible:ring-2 focus-visible:ring-cobalt-bright/40",
        grabbing ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{ height }}
    >
      <p className="sr-only">
        A wide dusk ridge behind glass. Drag or use the arrow keys to pan across
        it; {roster.length} survey markers are pinned along the ridge and step
        forward as each crosses the center of the window. Home and End jump to
        the ends.
      </p>

      {/* sky wash */}
      <div aria-hidden className="absolute inset-0" style={{ background: SKY }} />

      {/* FAR ridge ×0.6 — two seeded sine-hump silhouettes. */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: `${pw * 100}%`, x: farX }}
      >
        <svg
          width="100%"
          height="58%"
          viewBox={`0 0 ${VISTA_W} ${RIDGE_H}`}
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0"
          fill="none"
        >
          <path d={VISTA.ridgeBack} fill={RIDGE_BACK} />
          <path d={VISTA.ridgeFront} fill={RIDGE_FRONT} />
        </svg>
      </motion.div>

      {/* MID masts ×0.85 — seeded signal posts, a few lit for the night run. */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: `${pw * 100}%`, x: midX }}
      >
        {VISTA.masts.map((mast) => (
          <div
            key={mast.x}
            className="absolute"
            style={{ left: `${mast.x * 100}%`, bottom: "22%", height: mast.h }}
          >
            <span
              className="absolute bottom-0 left-1/2 -translate-x-1/2"
              style={{ width: 2, height: "100%", background: MAST_INK }}
            />
            {mast.lamp && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  background: BEACON,
                  boxShadow: BEACON_GLOW,
                }}
              />
            )}
          </div>
        ))}
      </motion.div>

      {/* NEAR band ×1.0 — ground line, foreground posts, and the markers. */}
      <motion.div
        className="absolute inset-y-0 left-0"
        style={{ width: `${pw * 100}%`, x: nearX }}
      >
        <span
          aria-hidden
          className="absolute inset-x-0"
          style={{ bottom: "17%", height: 2, background: GROUND_INK, opacity: 0.8 }}
        />
        {VISTA.posts.map((post) => (
          <span
            aria-hidden
            key={post.x}
            className="absolute"
            style={{
              left: `${post.x * 100}%`,
              bottom: "17%",
              width: 2,
              height: post.h,
              background: GROUND_INK,
              opacity: 0.55,
            }}
          />
        ))}
        {roster.map((spot) => (
          <Marker
            key={spot.id}
            spot={spot}
            pw={pw}
            p={p}
            motionSafe={motionSafe}
            onSeek={seek}
            onVisit={visit}
            consumeSuppressed={consumeSuppressed}
          />
        ))}
      </motion.div>

      {/* center-third pop zone + glass vignette (decorative). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/3 right-1/3 border-x border-dashed"
        style={{ borderColor: "oklch(0.95 0 0 / 0.14)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 30px oklch(0.1 0.02 300 / 0.45)" }}
      />

      {/* HUD bearing readout. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-2 left-2 rounded-2 border border-hairline bg-surface-0/80 px-2 py-1 font-mono text-[10px] tracking-wide text-ink-3 backdrop-blur-sm"
      >
        BEARING &middot;{" "}
        <motion.span className="text-ink-2 tabular-nums">
          {bearingText}
        </motion.span>
        &deg;
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type MarkerProps = {
  spot: PanHotspot;
  pw: number;
  p: MotionValue<number>;
  motionSafe: boolean;
  onSeek: (x: number) => void;
  onVisit: (spot: PanHotspot) => void;
  consumeSuppressed: () => boolean;
};

/**
 * One pinned survey marker. Its pop is pure derivation off the shared pan:
 * centeredness = 1 at the window center, falling to 0 at the edge of the
 * center third, and scale, lift, ring, dot, and detail height all chain off
 * it. Focus glides the marker to center; a keyboard activation always visits,
 * a pointer click visits only when popped and otherwise glides to center.
 */
function Marker({
  spot,
  pw,
  p,
  motionSafe,
  onSeek,
  onVisit,
  consumeSuppressed,
}: MarkerProps) {
  const x = clamp(spot.x, 0, 1);
  const pop = useTransform(p, (v) => {
    // Screen offset from window center, in fractions of the window width.
    const offset = x * pw - v * (pw - 1) - 0.5;
    return clamp(1 - Math.abs(offset) / (1 / 6), 0, 1);
  });
  const scale = useTransform(pop, [0, 1], [1, 1.12]);
  const lift = useTransform(pop, [0, 1], [0, -6]);
  const dotOpacity = useTransform(pop, [0, 1], [0.4, 1]);
  const detailHeight = useTransform(pop, [0, 1], [0, 15]);

  const flash = useMotionValue(0);
  const flashRef = React.useRef<ReturnType<typeof animate> | null>(null);
  React.useEffect(() => () => flashRef.current?.stop(), []);

  const activate = (fromKeyboard: boolean) => {
    if (!fromKeyboard && consumeSuppressed()) return;
    const popped = fromKeyboard || pop.get() >= POP_VISIT;
    if (!popped) {
      onSeek(x);
      return;
    }
    if (motionSafe) {
      flashRef.current?.stop();
      flashRef.current = animate(flash, [1, 0], {
        duration: 0.45,
        ease: easings.exit,
      });
    }
    onVisit(spot);
  };

  return (
    <motion.div
      className="absolute bottom-[17%]"
      style={{ left: `${x * 100}%`, y: lift }}
    >
      <div className="flex -translate-x-1/2 flex-col items-center">
        <motion.button
          type="button"
          onFocus={() => onSeek(x)}
          onClick={(event) => activate(event.detail === 0)}
          style={{ scale }}
          className="relative flex origin-bottom flex-col items-center rounded-2 border border-hairline bg-surface-1/85 px-2 py-1 text-ink-2 backdrop-blur-sm outline-none focus-visible:ring-2 focus-visible:ring-cobalt-bright/50"
        >
          <span className="font-mono text-[10px] tracking-[0.12em] whitespace-nowrap">
            {spot.label}
          </span>
          {spot.detail && (
            <motion.span
              aria-hidden
              style={{ height: detailHeight, opacity: pop }}
              className="overflow-hidden font-mono text-[9px] leading-tight text-ink-3 whitespace-nowrap"
            >
              {spot.detail}
            </motion.span>
          )}
          <motion.span
            aria-hidden
            style={{ opacity: pop }}
            className="pointer-events-none absolute inset-0 rounded-2 border border-[var(--accent)]"
          />
          <motion.span
            aria-hidden
            style={{ opacity: flash }}
            className="pointer-events-none absolute inset-0 rounded-2 bg-[var(--accent-wash)]"
          />
        </motion.button>
        <span
          aria-hidden
          className="mt-1 w-px"
          style={{ height: 26, background: "var(--hairline-strong)" }}
        />
        <motion.span
          aria-hidden
          style={{ opacity: dotOpacity }}
          className="size-1.5 rounded-full bg-[var(--accent)]"
        />
      </div>
    </motion.div>
  );
}
