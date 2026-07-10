"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** A port on the map. `x`/`y` are normalized 0..1 across the panel. */
export type RoutePin = { id: string; label: string; x: number; y: number };

/** A great-circle hop between two pins, referenced by id. */
export type Route = { id: string; from: string; to: string; label?: string };

export type ArcRoutesProps = {
  pins: RoutePin[];
  routes: Route[];
  /** Fires the route id when a ride begins, and `null` when it ends. */
  onRide?: (routeId: string | null) => void;
  /** Stage height in px; the width is fluid and the viewBox fixed. @default 280 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** Fixed viewBox width — the SVG scales to its container via `w-full`. */
const VIEW_W = 640;
const PAD_X = 48;
const PAD_Y = 28;
/** Pin marker radius, viewBox px. */
const PIN_R = 3.5;
/** Seconds for the rider to travel a full arc. */
const RIDE_S = 0.9;
/** Lift added per unit of normalized pin distance — longer hops arch higher. */
const LIFT_PER_DIST = 130;
/** Floor/ceiling on the control-point lift, viewBox px. */
const MIN_LIFT = 18;
const MAX_LIFT = 100;

/** A pin resolved into viewBox space. */
type LaidPin = { id: string; label: string; x: number; y: number };

/** A route resolved into its bezier endpoints + control point. */
type LaidRoute = {
  id: string;
  label: string;
  from: LaidPin;
  to: LaidPin;
  /** Quadratic control point — the arc's raised midpoint. */
  cx: number;
  cy: number;
};

/** Point on a quadratic bezier at t (0..1). Pure math — SSR-safe. */
function quadPoint(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): { x: number; y: number } {
  const mt = 1 - t;
  const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
  const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
  return { x, y };
}

/** SVG path `d` for a quadratic bezier between two laid pins via its control point. */
function arcPath(r: LaidRoute): string {
  return (
    `M${r.from.x.toFixed(2)} ${r.from.y.toFixed(2)} ` +
    `Q${r.cx.toFixed(2)} ${r.cy.toFixed(2)} ` +
    `${r.to.x.toFixed(2)} ${r.to.y.toFixed(2)}`
  );
}

/**
 * A flat map with great-circle arcs lifted between pins. Each route is a
 * quadratic bezier computed in JS — its control point is the midpoint raised
 * in screen-Y proportional to the pin distance, so longer hops arch higher
 * (the great-circle-lift cue). Routes are real buttons in a legend; hovering
 * or focusing one brightens its arc and sends a rider dot travelling
 * `from`→`to` along the bezier, driven by a `t` motion value tweened 0→1 and
 * looped while the route stays active.
 *
 * Reduced motion: no traveling rider — hover/focus brightens the arc and
 * shows a static marker at its midpoint. `onRide` still fires the same way.
 * Layout is computed from props against a fixed viewBox, so nothing is
 * measured and SSR is stable.
 */
export function ArcRoutes({
  pins,
  routes,
  onRide,
  height = 280,
  className,
  "aria-label": ariaLabel,
}: ArcRoutesProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  // The route currently hovered or focused. null = nothing riding.
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const byId = new Map<string, LaidPin>();
  for (const p of pins) {
    byId.set(p.id, {
      id: p.id,
      label: p.label,
      x: PAD_X + clamp(p.x, 0, 1) * (VIEW_W - PAD_X * 2),
      y: PAD_Y + clamp(p.y, 0, 1) * (height - PAD_Y * 2),
    });
  }

  const laidRoutes: LaidRoute[] = [];
  for (const r of routes) {
    const from = byId.get(r.from);
    const to = byId.get(r.to);
    if (!from || !to) continue;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const lift = clamp(
      mapRange(dist, 0, VIEW_W, 0, LIFT_PER_DIST),
      MIN_LIFT,
      MAX_LIFT,
    );
    laidRoutes.push({
      id: r.id,
      label: r.label ?? `${from.label}-${to.label}`,
      from,
      to,
      cx: (from.x + to.x) / 2,
      cy: (from.y + to.y) / 2 - lift,
    });
  }

  const activeRoute = laidRoutes.find((r) => r.id === activeId) ?? null;

  const setActive = (id: string | null) => {
    setActiveId(id);
    onRide?.(id);
  };

  const hudText = activeRoute
    ? `ROUTE · ${activeRoute.from.label}-${activeRoute.to.label}`
    : "IDLE";
  const announceText = activeRoute
    ? `Riding ${activeRoute.from.label} to ${activeRoute.to.label}`
    : "";

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Flight route map"}
      aria-describedby={`${uid}-summary`}
      className={cn("w-full", className)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        style={{ height }}
        className="block w-full overflow-visible"
        aria-hidden
      >
        {/* Map panel: hairline frame + faint graticule + a subtle land wash. */}
        <rect
          x={0.5}
          y={0.5}
          width={VIEW_W - 1}
          height={height - 1}
          rx={10}
          fill="var(--card)"
          stroke="var(--hairline)"
        />
        <MapGraticule width={VIEW_W} height={height} />

        {/* Arcs beneath pins so pins and labels sit on top of the strokes. */}
        <g fill="none">
          {laidRoutes.map((r) => {
            const on = r.id === activeId;
            return (
              <path
                key={r.id}
                d={arcPath(r)}
                stroke={on ? "var(--accent-bright)" : "var(--accent)"}
                strokeWidth={on ? 2 : 1}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{
                  opacity: on ? 0.9 : 0.22,
                  transition: "opacity 150ms linear, stroke-width 150ms linear",
                }}
              />
            );
          })}
        </g>

        {/* Riders: only the active route mounts a dot, so idle routes cost
            nothing. Keyed by route id so switching routes remounts fresh —
            the ride always starts clean at t=0. */}
        {activeRoute ? (
          <ArcRider key={activeRoute.id} route={activeRoute} motionSafe={motionSafe} />
        ) : null}

        {/* Pins on top of everything — the map's fixed reference points. */}
        <g>
          {pins.map((p) => {
            const laid = byId.get(p.id);
            if (!laid) return null;
            const dimmed =
              activeRoute !== null &&
              activeRoute.from.id !== p.id &&
              activeRoute.to.id !== p.id;
            const lit =
              activeRoute !== null &&
              (activeRoute.from.id === p.id || activeRoute.to.id === p.id);
            return (
              <g
                key={p.id}
                style={{
                  opacity: dimmed ? 0.45 : 1,
                  transition: "opacity 150ms linear",
                }}
              >
                <circle
                  cx={laid.x}
                  cy={laid.y}
                  r={PIN_R}
                  fill={lit ? "var(--signal)" : "var(--ink-2)"}
                />
                <circle
                  cx={laid.x}
                  cy={laid.y}
                  r={PIN_R + 3}
                  fill="none"
                  stroke={lit ? "var(--signal)" : "var(--hairline-strong)"}
                  strokeWidth={1}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* Pin labels live in the DOM, not the SVG, so text never distorts. */}
      <div className="pointer-events-none relative" style={{ height, marginTop: -height }}>
        {pins.map((p) => {
          const laid = byId.get(p.id);
          if (!laid) return null;
          const dimmed =
            activeRoute !== null &&
            activeRoute.from.id !== p.id &&
            activeRoute.to.id !== p.id;
          const below = laid.y < PAD_Y + 14;
          return (
            <span
              key={p.id}
              className={cn(
                "text-label absolute whitespace-nowrap",
                dimmed ? "text-ink-3 opacity-45" : "text-ink-2",
              )}
              style={{
                left: `${(laid.x / VIEW_W) * 100}%`,
                top: `${((laid.y + (below ? 10 : -10)) / height) * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {p.label}
            </span>
          );
        })}
      </div>

      {/* Legend: real buttons in tab order — the ride trigger for hover + focus. */}
      <div
        role="group"
        aria-label="Routes"
        className="mt-3 flex flex-wrap gap-1.5"
      >
        {laidRoutes.map((r) => {
          const on = r.id === activeId;
          return (
            <button
              key={r.id}
              type="button"
              className={cn(
                "text-label rounded-1 border px-1.5 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cobalt-bright/40",
                on
                  ? "border-hairline-strong text-cobalt-bright"
                  : "border-hairline text-ink-3 hover:text-ink-2",
              )}
              style={{ backgroundColor: on ? "var(--accent-wash)" : "transparent" }}
              onPointerEnter={() => setActive(r.id)}
              onPointerLeave={() =>
                setActiveId((cur) => {
                  if (cur !== r.id) return cur;
                  onRide?.(null);
                  return null;
                })
              }
              onFocus={() => setActive(r.id)}
              onBlur={() =>
                setActiveId((cur) => {
                  if (cur !== r.id) return cur;
                  onRide?.(null);
                  return null;
                })
              }
              onClick={() => setActive(r.id)}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Mono HUD readout. */}
      <p className="text-label text-ink-3 mt-2">{hudText}</p>

      <span role="status" aria-live="polite" className="sr-only">
        {announceText}
      </span>
      <span id={`${uid}-summary`} className="sr-only">
        {laidRoutes.length === 0
          ? "Flight map: no routes"
          : `Flight map, ${laidRoutes.length} route${laidRoutes.length === 1 ? "" : "s"}. ${laidRoutes
              .map((r) => `${r.from.label} to ${r.to.label}`)
              .join("; ")}.`}
      </span>
    </div>
  );
}

/** Faint hairline graticule + a subtle land wash — the flat map's plane. */
function MapGraticule({
  width,
  height,
}: {
  width: number;
  height: number;
}): React.JSX.Element {
  const cols = 8;
  const rows = 4;
  const lines: React.JSX.Element[] = [];
  for (let i = 1; i < cols; i++) {
    const x = (i / cols) * width;
    lines.push(
      <line
        key={`v${i}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke="var(--hairline)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  for (let i = 1; i < rows; i++) {
    const y = (i / rows) * height;
    lines.push(
      <line
        key={`h${i}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke="var(--hairline)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  return (
    <g style={{ opacity: 0.6 }}>
      {/* Land wash: two soft bands hinting at continents, never literal. */}
      <ellipse
        cx={width * 0.28}
        cy={height * 0.58}
        rx={width * 0.22}
        ry={height * 0.3}
        fill="var(--accent-wash)"
      />
      <ellipse
        cx={width * 0.72}
        cy={height * 0.42}
        rx={width * 0.24}
        ry={height * 0.32}
        fill="var(--accent-wash)"
      />
      {lines}
    </g>
  );
}

/**
 * The traveling rider for one active route. Mounted only while a route is
 * active, so idle routes never carry a motion value. A `t` tween 0→1 drives
 * the dot's position via `useTransform` off the route's quadratic bezier —
 * pure math, SSR-safe. Loops while mounted (re-triggered from `onComplete`);
 * unmounting (pointer leave / blur) stops the tween via effect cleanup.
 *
 * Reduced motion: renders a static marker at the arc's midpoint instead —
 * same visual language, no motion value, no tween.
 */
function ArcRider({
  route,
  motionSafe,
}: {
  route: LaidRoute;
  motionSafe: boolean;
}): React.JSX.Element {
  const t = useMotionValue(0);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(() => {
    if (!motionSafe) return undefined;
    const ride = () => {
      controlsRef.current = animate(t, 1, {
        duration: RIDE_S,
        ease: easings.move,
        onComplete: () => {
          t.set(0);
          ride();
        },
      });
    };
    ride();
    return () => {
      controlsRef.current?.stop();
    };
    // Mounted fresh per route (parent keys ArcRider by route.id), so this
    // only needs to react to the reduced-motion pathway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motionSafe]);

  const cx = useTransform(t, (v) =>
    quadPoint(route.from.x, route.from.y, route.cx, route.cy, route.to.x, route.to.y, v).x,
  );
  const cy = useTransform(t, (v) =>
    quadPoint(route.from.x, route.from.y, route.cx, route.cy, route.to.x, route.to.y, v).y,
  );

  if (!motionSafe) {
    return (
      <circle
        cx={route.cx}
        cy={route.cy}
        r={4}
        fill="var(--signal)"
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    );
  }

  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={4}
      fill="var(--signal)"
      stroke="var(--card)"
      strokeWidth={1.5}
    />
  );
}
