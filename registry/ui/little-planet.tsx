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
import { springs } from "@/registry/lib/motion";
import { angleDelta, clamp, wrapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Pointer travel (px) mapped to one full lap of the rim while dragging. */
const DRAG_PX_PER_LAP = 340;
/** Release velocity (deg/s) is clamped to a believable spin. */
const MAX_FLING = 900;
/** Card scale at the top (surfaced) slot vs. the far side of the rim. */
const MAX_SCALE = 1.1;
const MIN_SCALE = 0.55;
/** Opacity floor for the section furthest around the back. */
const MIN_OPACITY = 0.08;
/** Proximity (cos of angle-from-top) below which a section tucks out of the
 *  hit-test and stops taking focus/clicks. */
const BACK_CUTOFF = -0.15;
/** Card tangent tilt is eased to this fraction of the true rim angle, so
 *  labels never read upside-down near the bottom of the globe. */
const TILT_FRACTION = 0.34;
const MAX_TILT = 26;
/** Pointer travel (px) before a press counts as a spin, not a tap. */
const DRAG_THRESHOLD = 3;

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** Signed angle in (-180, 180] — 0 is straight up (the top/surfaced slot). */
const signedFromTop = (deg: number): number => {
  const wrapped = wrapAngle(deg);
  return wrapped > 180 ? wrapped - 360 : wrapped;
};

export type PlanetSection = {
  /** Stable identity — also the value reported by `onSurface`. */
  id: string;
  /** Accessible name and default card label. */
  label: string;
  /** Custom card content, replacing the default label chip. */
  node?: React.ReactNode;
};

export type LittlePlanetProps = {
  /** Sections spaced evenly around the rim. */
  sections: PlanetSection[];
  /** Controlled surfaced section id; glides to the top when changed at rest. */
  value?: string;
  /** Initial surfaced section when uncontrolled. @default the first section */
  defaultValue?: string;
  /** Fires with a section's id when it settles at the top — deduped. */
  onSurface?: (id: string) => void;
  /** Rim radius, px. @default 96 */
  radius?: number;
  /** Frame height, px. @default 320 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

type DragState = {
  pointerId: number;
  startX: number;
  /** rotation value when the press began. */
  startRotation: number;
  lastX: number;
  lastT: number;
  /** Smoothed velocity, deg/s. */
  velocity: number;
  engaged: boolean;
};

/**
 * A little planet: sections ride evenly spaced around its rim, the nearest
 * one to the top slot fully readable and enlarged, the rest curving away and
 * shrinking/dimming into the back half. A single `rotation` motion value
 * (unwrapped degrees) is the only source of truth — each card's position,
 * scale, opacity, tangent tilt and z-order derive from it via `useTransform`
 * off its own fixed base angle, and the mono HUD derives from whichever
 * section is nearest the top.
 *
 * Horizontal pointer drag anywhere on the frame spins `rotation` freely (one
 * lap per ~340px of travel); release projects the drag's smoothed velocity
 * forward and SNAPS the nearest section's angle the short way to the top
 * (`angleDelta`) on `springs.snap`, seeded with the release velocity so a
 * fast flip carries its momentum into the landing. Clicking a visible
 * non-top section — or ArrowLeft/Right / Home on the focused planet — glides
 * that section to the top on `springs.glide`. Every in-flight spin is
 * stopped before a new gesture starts and on unmount.
 *
 * The planet is a focusable group; the surfaced section is reported through
 * `onSurface`, deduped against the last committed id, and announced politely
 * ("<label> at the surface") via an sr-only region derived straight from the
 * committed section each render — no state or effect of its own, so it is
 * always safe to settle from a gesture, a keypress, or a controlled `value`
 * change. `defaultValue` seeds the uncontrolled case.
 *
 * Reduced motion drops the spin: sections sit in a static ring at their
 * resting angles with the surfaced one enlarged, and drag/keys/click set
 * `rotation` straight to its target (no `animate`) — same callbacks, same
 * announcements, same snap-to-top semantics.
 */
export function LittlePlanet({
  sections,
  value,
  defaultValue,
  onSurface,
  radius = 96,
  height = 320,
  className,
  "aria-label": ariaLabel = "Little planet",
}: LittlePlanetProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const count = sections.length;

  const baseAngleOf = (index: number): number =>
    count > 0 ? (360 / count) * index : 0;

  const indexOfId = (id: string | undefined): number => {
    if (id === undefined) return 0;
    const found = sections.findIndex((section) => section.id === id);
    return found === -1 ? 0 : found;
  };

  const [initialIndex] = React.useState(() => indexOfId(value ?? defaultValue));

  /** THE rim spin — every card pose and the HUD derive from this one value. */
  const rotation = useMotionValue(-baseAngleOf(initialIndex));

  /** The section actually settled at the top, right now — the single source
   *  for the HUD/announcement in BOTH controlled and uncontrolled usage, and
   *  the uncontrolled mirror. Sourced only from `commitSurface`, i.e. only
   *  once a spin genuinely lands, never straight from a controlled `value`
   *  prop mid-flight — otherwise a controlled `value` change would repaint
   *  the HUD/announcement instantly while the card was still visibly gliding
   *  and `onSurface` hadn't fired yet. */
  const [surfacedId, setSurfacedId] = React.useState<string | undefined>(
    sections[initialIndex]?.id,
  );
  const [grabbing, setGrabbing] = React.useState(false);

  const flightRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  /** Ref mirror of `surfacedId`, readable synchronously from handlers/effects
   *  (state itself only updates on the next render) — dedupes `onSurface`. */
  const surfacedRef = React.useRef<string | undefined>(sections[initialIndex]?.id);
  /** Bumped on every new drag/settle so a superseded flight's completion
   *  becomes a no-op instead of clobbering a fresher land. */
  const epochRef = React.useRef(0);

  const onSurfaceRef = React.useRef(onSurface);
  React.useEffect(() => {
    onSurfaceRef.current = onSurface;
  });

  const stopFlight = () => {
    flightRef.current?.stop();
    flightRef.current = null;
  };

  // Nothing in flight may outlive the component.
  React.useEffect(() => stopFlight, []);

  /** The section index nearest the top slot at unwrapped rotation `r`. */
  const nearestIndexAt = (r: number): number => {
    let best = 0;
    let bestAbs = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i += 1) {
      const abs = Math.abs(signedFromTop(baseAngleOf(i) + r));
      if (abs < bestAbs) {
        bestAbs = abs;
        best = i;
      }
    }
    return best;
  };

  /** Commit the section at `index` as surfaced: dedupe, update `surfacedId`
   *  (which drives the HUD/announcement in both controlled and uncontrolled
   *  usage), notify. The polite announcement itself is derived from that
   *  state during render (below), not set here, so this stays safe to call
   *  from an effect body (the controlled-value sync) as well as
   *  gesture/keyboard handlers and animation `onComplete` callbacks. */
  const commitSurface = (index: number) => {
    const id = sections[index]?.id;
    if (id === undefined || surfacedRef.current === id) return;
    surfacedRef.current = id;
    setSurfacedId(id);
    onSurfaceRef.current?.(id);
  };

  /**
   * Animate `rotation` so section `index` lands at the top, the short way
   * round from wherever it currently sits. A drag release SNAPS
   * (`springs.snap`, seeded with the release velocity so a fast flip carries
   * momentum into the landing); a click, keypress, or controlled `value`
   * change GLIDES (`springs.glide`). Reduced motion jumps instantly either
   * way. Guarded by `epochRef` so a superseded flight's completion never
   * overwrites a fresher land.
   */
  const surfaceIndex = (
    index: number,
    spring: "snap" | "glide" = "glide",
    velocity = 0,
  ) => {
    if (count === 0) return;
    const epoch = (epochRef.current += 1);
    stopFlight();
    const target = -baseAngleOf(index);
    const from = rotation.get();
    const to = from + angleDelta(wrapAngle(from), wrapAngle(target));
    if (!motionSafe) {
      rotation.set(to);
      commitSurface(index);
      return;
    }
    flightRef.current = animate(rotation, to, {
      ...springs[spring],
      velocity,
      onComplete: () => {
        if (epochRef.current !== epoch) return;
        commitSurface(index);
      },
    });
  };

  // Controlled value steers the planet at rest — a motion op, not setState.
  React.useEffect(() => {
    if (value === undefined || count === 0) return;
    const index = indexOfId(value);
    if (surfacedRef.current === sections[index]?.id) return;
    surfaceIndex(index, "glide");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- surfaceIndex closes over refs/motion values only.
  }, [value, count]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Reduced motion drops the spin gesture entirely — the ring stays static
    // and only click/keys move it.
    if (!motionSafe) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRotation: rotation.get(),
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!motionSafe || !drag || event.pointerId !== drag.pointerId) return;

    if (!drag.engaged) {
      if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) return;
      // Crossed the threshold — a spin, not a tap. Capture now so taps on
      // section buttons still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      epochRef.current += 1;
      stopFlight();
      setGrabbing(true);
    }

    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      const degMoved = ((event.clientX - drag.lastX) / DRAG_PX_PER_LAP) * 360;
      const instant = degMoved / dt;
      // Smooth the instantaneous velocity so release reads intent, not noise.
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;

    const totalDx = event.clientX - drag.startX;
    rotation.set(drag.startRotation + (totalDx / DRAG_PX_PER_LAP) * 360);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return;
    setGrabbing(false);
    const velocity = clamp(drag.velocity, -MAX_FLING, MAX_FLING);
    // Project where the fling would coast, then snap the nearest to the top.
    const projected = rotation.get() + velocity * 0.12;
    surfaceIndex(nearestIndexAt(projected), "snap", velocity);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const current = nearestIndexAt(rotation.get());
    switch (event.key) {
      case "ArrowRight":
        surfaceIndex((current + 1) % count, "glide");
        break;
      case "ArrowLeft":
        surfaceIndex((current - 1 + count) % count, "glide");
        break;
      case "Home":
        surfaceIndex(0, "glide");
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // Reduced motion: reseat the static ring under the current surfaced
  // section whenever motion-safety or the section count changes, without a
  // running spring.
  React.useEffect(() => {
    if (motionSafe) return;
    rotation.set(-baseAngleOf(indexOfId(surfacedRef.current)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle only; baseAngleOf/indexOfId/rotation/surfacedRef are stable across a given count.
  }, [motionSafe, count]);

  // The HUD, announcement, and each card's highlighted state all read
  // `surfacedId` — never the raw controlled `value` — so all three, plus
  // `onSurface`, move in lockstep off the same true settle event whether the
  // planet is controlled or not.
  const committedId = surfacedId;
  const committedIndex = indexOfId(committedId);
  const surfacedLabel = sections[committedIndex]?.label ?? "";

  // sr-only announcement — derived from the committed (settled) section only,
  // never live drag; a live region announces on text change, so this needs
  // no state or effect of its own, and stays a no-op to call from anywhere.
  const announced =
    committedId === undefined ? "" : `${surfacedLabel} at the surface`;

  const planetSize = Math.min(radius * 1.1, height * 0.42);
  const originY = height - planetSize * 0.62;

  return (
    <div className={cn("w-full select-none", className)} style={{ height }}>
      <div
        ref={stageRef}
        role="group"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-roledescription="little planet"
        className={cn(
          "relative h-full w-full touch-none overflow-hidden rounded-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        {/* Anchor at the planet's rim center; every card and the globe hang
            off this point so θ=0 (top) lines up with straight up from here. */}
        <div className="pointer-events-none absolute left-1/2" style={{ top: originY }}>
          {/* THE PLANET: disc + horizon gradient + a couple of latitude arcs.
              zIndex sits below every card's range (0..200) so the back half
              unambiguously tucks behind the globe regardless of DOM order. */}
          <div
            aria-hidden
            className="absolute rounded-full"
            style={{
              width: planetSize,
              height: planetSize,
              left: -planetSize / 2,
              top: -planetSize / 2,
              zIndex: -1,
              background:
                "radial-gradient(circle at 50% 28%, var(--accent-wash), transparent 60%), linear-gradient(to bottom, var(--card), var(--muted))",
              border: "1px solid var(--hairline-strong)",
              boxShadow: "inset 0 10px 24px oklch(0.05 0.02 258 / 0.35)",
            }}
          >
            <div
              className="absolute inset-x-[10%] top-[38%] rounded-full border-t"
              style={{ borderColor: "var(--hairline)" }}
            />
            <div
              className="absolute inset-x-[22%] top-[58%] rounded-full border-t"
              style={{ borderColor: "var(--hairline)" }}
            />
          </div>

          {sections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              baseAngle={baseAngleOf(index)}
              radius={radius}
              rotation={rotation}
              surfaced={committedId === section.id}
              onActivate={() => surfaceIndex(index, "glide")}
            />
          ))}
        </div>

        {/* HUD — mono readout of whichever section is at the top. */}
        <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 font-mono text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase">
          SURFACE · <span className="text-cobalt-bright">{surfacedLabel}</span>
        </div>

        <span role="status" aria-live="polite" className="sr-only">
          {announced}
        </span>
      </div>
    </div>
  );
}

type SectionCardProps = {
  section: PlanetSection;
  /** This section's fixed resting angle on the rim, degrees. */
  baseAngle: number;
  radius: number;
  rotation: MotionValue<number>;
  surfaced: boolean;
  onActivate: () => void;
};

/**
 * One rim card. Every visual derives from the shared `rotation` value via
 * `useTransform`: its rim angle θ = baseAngle + rotation, position
 * center + (sin θ, −cos θ)·radius, proximity = cos(θ) drives scale/opacity/
 * z-order, and the card tilts tangent to the curve (eased + clamped so far
 * side text never reads upside-down). Cards past the back cutoff drop out of
 * the hit-test so only the visible rim is clickable/focusable.
 */
function SectionCard({
  section,
  baseAngle,
  radius,
  rotation,
  surfaced,
  onActivate,
}: SectionCardProps) {
  const x = useTransform(rotation, (r) =>
    Math.sin(rad(baseAngle + r)) * radius,
  );
  const y = useTransform(rotation, (r) =>
    -Math.cos(rad(baseAngle + r)) * radius,
  );
  const proximity = useTransform(rotation, (r) =>
    Math.cos(rad(baseAngle + r)),
  );
  const scale = useTransform(proximity, [-1, 1], [MIN_SCALE, MAX_SCALE]);
  const opacity = useTransform(proximity, [-1, 1], [MIN_OPACITY, 1]);
  const rotate = useTransform(rotation, (r) => {
    const signed = signedFromTop(baseAngle + r);
    return clamp(signed * TILT_FRACTION, -MAX_TILT, MAX_TILT);
  });
  const zIndex = useTransform(proximity, (p) => Math.round(p * 100) + 100);
  const pointerEvents = useTransform(proximity, (p): string =>
    p > BACK_CUTOFF ? "auto" : "none",
  );

  return (
    <motion.button
      type="button"
      aria-pressed={surfaced}
      aria-label={section.label}
      tabIndex={-1}
      onClick={onActivate}
      // Motion writes x/y/scale/rotate into one CSS `transform`, so the
      // static self-centering (−50%, −50%) has to be folded into that same
      // template rather than sit in a separate Tailwind translate class —
      // a class-based `transform` would just lose to the inline one.
      transformTemplate={(_, generated) => `translate(-50%, -50%) ${generated}`}
      className={cn(
        "absolute flex w-24 cursor-pointer flex-col items-center gap-1 rounded-2 border px-2 py-1.5 text-center",
        surfaced
          ? "border-[var(--accent-bright)] bg-surface-2 text-ink"
          : "border-hairline bg-surface-1 text-ink-2",
      )}
      style={{
        x,
        y,
        scale,
        opacity,
        rotate,
        zIndex,
        pointerEvents,
      }}
    >
      {section.node ?? (
        <span className="pointer-events-none font-mono text-[10px] font-medium tracking-[0.06em] uppercase">
          {section.label}
        </span>
      )}
    </motion.button>
  );
}
