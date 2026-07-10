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
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Logical SVG space; the facet mesh scales to the plate via viewBox. */
const VIEW_W = 300;
const VIEW_H = 200;
/** Vertex grid: 6×4 vertices → 5×3 cells → 30 facet triangles (≤ 60). */
const COLS = 6;
const ROWS = 4;
/** The finished wad: the flat sheet compressed to ~14% of its span. */
const BALL_SCALE = 0.13;
/** Wad chip footprint in px — the mesh ball lands where the chip mounts. */
const WAD_W = 64;
const WAD_H = 40;
/** Chip inset from the plate's bottom edge, px (matches bottom-3). */
const WAD_BOTTOM = 12;
/** Mid-flight bulge amplitudes (viewBox units): paths curve, never beeline. */
const BULGE_X = 28;
const BULGE_Y = 20;
/** Content is gone by 40% of the travel; paper facets materialize by 25%. */
const CONTENT_FADE_SPAN = 0.4;

type Phase = "flat" | "crumpling" | "wad" | "restoring";

type CrumpleVertex = {
  /** Rest position on the flat sheet, viewBox units. */
  rx: number;
  ry: number;
  /** Final position inside the wad, jittered per vertex. */
  fx: number;
  fy: number;
  /** Mid-flight bulge vector, enveloped by sin(πp). */
  bx: number;
  by: number;
};

type FacetTriangle = {
  a: CrumpleVertex;
  b: CrumpleVertex;
  c: CrumpleVertex;
  /** Flat-state area — the reference the crease shading collapses against. */
  restArea: number;
};

type WadLobe = {
  left: number;
  top: number;
  size: number;
  rot: number;
  radius: string;
};

/** A vertex's position at progress `p`, with the sin(πp) bulge applied. */
const vertexAt = (
  v: CrumpleVertex,
  p: number,
  bulge: number,
): { x: number; y: number } => ({
  x: v.rx + (v.fx - v.rx) * p + v.bx * bulge,
  y: v.ry + (v.fy - v.ry) * p + v.by * bulge,
});

const triangleArea = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number => Math.abs(ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2;

/**
 * Build the triangulated sheet. Every vertex owns a rest position on the flat
 * grid and a final position inside the wad: its offset from the sheet centre,
 * compressed to BALL_SCALE and re-aimed by per-vertex angle + radius noise
 * from seeded(djb2(uid)) — deterministic per instance, identical on server
 * and client. The wad centre sits bottom-centre, exactly where the wad chip
 * mounts (height is a prop, so the px→viewBox conversion needs no measuring).
 */
const buildFacets = (uid: string, height: number): FacetTriangle[] => {
  const rng = seeded(djb2(uid));
  const unitsPerPx = VIEW_H / Math.max(height, 1);
  const ballCx = VIEW_W / 2;
  const ballCy = clamp(
    VIEW_H - (WAD_BOTTOM + WAD_H / 2) * unitsPerPx,
    118,
    188,
  );

  const verts: CrumpleVertex[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const rx = (col / (COLS - 1)) * VIEW_W;
      const ry = (row / (ROWS - 1)) * VIEW_H;
      const dx = rx - VIEW_W / 2;
      const dy = ry - VIEW_H / 2;
      // Angle noise up to ±0.9rad and radius noise 0.6–1.15 turn the uniform
      // shrink into a clump — neighbouring vertices land shuffled, which is
      // what makes the ball read as crumpled paper rather than a scaled sheet.
      const angle = Math.atan2(dy, dx) + (rng() - 0.5) * 1.8;
      const radius = Math.hypot(dx, dy) * BALL_SCALE * (0.6 + rng() * 0.55);
      verts.push({
        rx,
        ry,
        fx: ballCx + Math.cos(angle) * radius,
        fy: ballCy + Math.sin(angle) * radius,
        bx: (rng() - 0.5) * BULGE_X,
        by: (rng() - 0.5) * BULGE_Y,
      });
    }
  }

  const facets: FacetTriangle[] = [];
  for (let row = 0; row < ROWS - 1; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      const i00 = row * COLS + col;
      const i01 = i00 + 1;
      const i10 = i00 + COLS;
      const i11 = i10 + 1;
      // Alternate the cell diagonal so creases zigzag instead of raking one way.
      const pairs =
        (row + col) % 2 === 0
          ? ([
              [i00, i01, i10],
              [i01, i11, i10],
            ] as const)
          : ([
              [i00, i01, i11],
              [i00, i11, i10],
            ] as const);
      for (const [ia, ib, ic] of pairs) {
        const a = verts[ia];
        const b = verts[ib];
        const c = verts[ic];
        if (!a || !b || !c) continue;
        facets.push({
          a,
          b,
          c,
          restArea: triangleArea(a.rx, a.ry, b.rx, b.ry, c.rx, c.ry),
        });
      }
    }
  }
  return facets;
};

/**
 * The static wad chip's lobes — 6 overlapping squashed blobs, hashed from the
 * same instance id (separate stream via a `:wad` suffix) so the ball you press
 * is the same ball on every visit.
 */
const buildLobes = (uid: string): WadLobe[] => {
  const rng = seeded(djb2(`${uid}:wad`));
  const lobes: WadLobe[] = [];
  for (let i = 0; i < 6; i++) {
    const size = 16 + rng() * 10;
    const r1 = Math.round(35 + rng() * 30);
    const r2 = Math.round(35 + rng() * 30);
    const r3 = Math.round(35 + rng() * 30);
    const r4 = Math.round(35 + rng() * 30);
    lobes.push({
      size,
      left: 4 + rng() * (WAD_W - size - 8),
      top: 3 + rng() * (WAD_H - size * 0.82 - 6),
      rot: (rng() - 0.5) * 70,
      radius: `${r1}% ${100 - r1}% ${r2}% ${100 - r2}% / ${r3}% ${100 - r3}% ${r4}% ${100 - r4}%`,
    });
  }
  return lobes;
};

/**
 * One facet of the paper. Both derivations ride the master progress value:
 * the `points` string re-triangulates per frame, and the fill opacity shades
 * by how much this triangle's area has collapsed — flattened facets stack
 * semi-transparent `--muted` over each other, which is what draws the creases.
 */
function FacetPolygon({
  progress,
  facet,
}: {
  progress: MotionValue<number>;
  facet: FacetTriangle;
}): React.JSX.Element {
  const points = useTransform(progress, (p) => {
    const bulge = Math.sin(p * Math.PI);
    const a = vertexAt(facet.a, p, bulge);
    const b = vertexAt(facet.b, p, bulge);
    const c = vertexAt(facet.c, p, bulge);
    return `${a.x.toFixed(2)},${a.y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)} ${c.x.toFixed(2)},${c.y.toFixed(2)}`;
  });
  const fillOpacity = useTransform(progress, (p) => {
    const bulge = Math.sin(p * Math.PI);
    const a = vertexAt(facet.a, p, bulge);
    const b = vertexAt(facet.b, p, bulge);
    const c = vertexAt(facet.c, p, bulge);
    const area = triangleArea(a.x, a.y, b.x, b.y, c.x, c.y);
    const collapse =
      facet.restArea > 0 ? clamp(1 - area / facet.restArea, 0, 1) : 1;
    // Facets materialize over the first quarter of the travel (while the
    // content is still fading), then darken as they crumple shut.
    return clamp(p * 4, 0, 1) * (0.35 + 0.55 * collapse);
  });
  return (
    <motion.polygon
      points={points}
      fill="var(--muted)"
      fillOpacity={fillOpacity}
      stroke="var(--ink-3)"
      strokeWidth={0.75}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
}

export type CrumpleSheetProps = {
  /** The sheet's content — the printed matter that crumples with it. */
  children: React.ReactNode;
  /** Controlled crumple state. */
  crumpled?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultCrumpled?: boolean;
  onCrumpleChange?: (crumpled: boolean) => void;
  /** Label on the dismiss chip. @default "Crumple" */
  dismissLabel?: string;
  /** Accessible label carried by the wad chip. @default "Smooth out" */
  restoreLabel?: string;
  /** Plate height in px. @default 220 */
  height?: number;
  className?: string;
};

/**
 * Dismiss crumples the content into a paper ball; restore uncrumples it.
 *
 * A triangulated facet mesh (SVG, same box as the content) carries the
 * gesture: one master `progress` value (0 flat → 1 ball) is driven by
 * `animate` tweens — `durations.page` with the exit ease crumpling, the enter
 * ease restoring — and every vertex derives its position from it, converging
 * on a bottom-centre wad with per-vertex djb2 jitter. Facet fills shade by
 * area collapse, the content fades out inside the first 40% of the travel
 * (back in over the last 40%), and the plate's border tightens. At the ball
 * the mesh swaps for a static wad chip — a real button of deterministic
 * overlapping lobes — and pressing it reverses the fold, landing with one
 * `recoil` flatten wobble on the plate. Mid-flight toggles stop the tween and
 * retarget from wherever the paper sits.
 *
 * A polite sr-only status announces "Crumpled" / "Smoothed out"; the content
 * unmounts once crumpled (the wad chip carries focus, one rAF after the swap)
 * and focus returns to the dismiss chip on restore. Reduced motion: no mesh —
 * an instant swap between sheet and wad at `durations.fast`, same
 * announcements and focus moves.
 */
export function CrumpleSheet({
  children,
  crumpled,
  defaultCrumpled = false,
  onCrumpleChange,
  dismissLabel = "Crumple",
  restoreLabel = "Smooth out",
  height = 220,
  className,
}: CrumpleSheetProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState(defaultCrumpled);
  const target = crumpled ?? uncontrolled;

  const [phase, setPhase] = React.useState<Phase>(target ? "wad" : "flat");
  const [announcement, setAnnouncement] = React.useState("");

  // Adjust-state-during-render (not an effect): whenever the resolved target
  // flips — chip press or controlled prop — enter the matching transit phase.
  // The transit effect below owns the tween; its cleanup stops any in-flight
  // leg first, so mid-flight toggles retarget from wherever the paper sits.
  const [prevTarget, setPrevTarget] = React.useState(target);
  if (prevTarget !== target) {
    setPrevTarget(target);
    setPhase(target ? "crumpling" : "restoring");
  }

  // Deterministic geometry, rebuilt only if the instance or height changes.
  const facets = React.useMemo(() => buildFacets(uid, height), [uid, height]);
  const lobes = React.useMemo(() => buildLobes(uid), [uid]);

  // THE master value: 0 flat → 1 ball. Every facet, the content fade, and the
  // plate's border all derive from it — nothing else animates during transit.
  const progress = useMotionValue(target ? 1 : 0);
  const plateScaleY = useMotionValue(1);

  // Content is gone within the first 40% of the crumple and returns across
  // the last 40% of the restore — the same curve read in both directions.
  // Reduced motion fades linearly across its fast swap instead.
  const contentOpacity = useTransform(progress, (p) =>
    motionSafe ? 1 - clamp(p / CONTENT_FADE_SPAN, 0, 1) : 1 - p,
  );
  // The dismiss chip stays mounted through transit so a restore can retarget,
  // but it must not be an invisible click target deep in the crumple.
  const chipPointerEvents = useTransform(progress, (p) =>
    p > 0.6 ? "none" : "auto",
  );
  // The plate's frame tightens as the sheet balls up: radius pulls in,
  // hairline firms toward ink.
  const plateRadius = useTransform(progress, (p) => `${12 - p * 5}px`);
  const plateBorder = useTransform(
    progress,
    (p) =>
      `color-mix(in oklab, var(--ink-3) ${Math.round(18 + p * 30)}%, transparent)`,
  );
  // Crease lines surface as the paper folds — one inherited stroke opacity.
  const meshStrokeOpacity = useTransform(progress, (p) => p * 0.45);

  const dismissRef = React.useRef<HTMLButtonElement | null>(null);
  const wadRef = React.useRef<HTMLButtonElement | null>(null);
  const focusRafRef = React.useRef(0);
  const settleRef = React.useRef<ReturnType<typeof animate> | null>(null);
  // True only when a chip press initiated the flip — controlled flips from
  // outside must not steal focus into the sheet.
  const userIntentRef = React.useRef(false);

  // Never leave a queued focus hop or a settle wobble behind on unmount.
  React.useEffect(() => {
    return () => {
      cancelAnimationFrame(focusRafRef.current);
      settleRef.current?.stop();
    };
  }, []);

  const queueFocus = (ref: React.RefObject<HTMLButtonElement | null>) => {
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      ref.current?.focus();
    });
  };

  // The transit engine. Runs when a leg begins; cleanup stops the tween, so a
  // retarget (or unmount) always stops first and the next leg picks up from
  // the live progress value. Reduced motion rides the same rails at
  // durations.fast with no mesh mounted — an instant swap with a short fade.
  React.useEffect(() => {
    if (phase !== "crumpling" && phase !== "restoring") return;
    const toBall = phase === "crumpling";
    settleRef.current?.stop();
    plateScaleY.set(1);
    const controls = animate(progress, toBall ? 1 : 0, {
      ...(motionSafe
        ? {
            duration: durations.page,
            ease: toBall ? easings.exit : easings.enter,
          }
        : { duration: durations.fast }),
      onComplete: () => {
        const followFocus = userIntentRef.current;
        userIntentRef.current = false;
        if (toBall) {
          setPhase("wad");
          setAnnouncement("Crumpled");
          // The dismiss chip unmounts with this commit — hand focus to the
          // wad one frame later, once it exists. Programmatic flips skip it.
          if (followFocus) queueFocus(wadRef);
        } else {
          setPhase("flat");
          setAnnouncement("Smoothed out");
          if (motionSafe) {
            // Paper-settle: one flatten wobble. Exactly two keyframes —
            // seat at 1.02, ring home to 1 on recoil.
            plateScaleY.set(1.02);
            settleRef.current = animate(plateScaleY, 1, springs.recoil);
          }
        }
      },
    });
    return () => controls.stop();
  }, [phase, motionSafe, progress, plateScaleY, queueFocus]);

  const requestCrumple = (next: boolean) => {
    if (crumpled === undefined) setUncontrolled(next);
    onCrumpleChange?.(next);
  };

  const handleDismiss = () => {
    userIntentRef.current = true;
    requestCrumple(true);
  };

  const handleRestore = () => {
    userIntentRef.current = true;
    requestCrumple(false);
    // The wad unmounts with this press; the dismiss chip mounts in the same
    // commit, so focus hops there one frame later and is never dropped.
    queueFocus(dismissRef);
  };

  const inTransit = phase === "crumpling" || phase === "restoring";

  return (
    <div data-state={phase} className={cn("relative w-full", className)}>
      <motion.div
        className="bg-surface-2 relative w-full overflow-hidden border"
        style={{
          height,
          scaleY: plateScaleY,
          transformOrigin: "50% 100%",
          borderRadius: plateRadius,
          borderColor: plateBorder,
        }}
      >
        {phase !== "wad" && (
          <>
            <motion.div
              aria-hidden={phase === "crumpling" ? true : undefined}
              inert={phase === "crumpling" ? true : undefined}
              className="absolute inset-0"
              style={{ opacity: contentOpacity }}
            >
              {children}
            </motion.div>
            <motion.button
              ref={dismissRef}
              type="button"
              onClick={handleDismiss}
              className="border-hairline bg-surface-1 text-ink-3 hover:text-ink hover:border-hairline-strong focus-visible:ring-cobalt-bright/50 absolute top-2 right-2 z-20 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-wide outline-none focus-visible:ring-2"
              style={{
                opacity: contentOpacity,
                pointerEvents: chipPointerEvents,
              }}
            >
              {dismissLabel}
            </motion.button>
          </>
        )}

        {motionSafe && inTransit && (
          <svg
            aria-hidden
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          >
            <motion.g strokeOpacity={meshStrokeOpacity}>
              {facets.map((facet, i) => (
                // Facets are positional; index keys are stable.
                <FacetPolygon key={i} progress={progress} facet={facet} />
              ))}
            </motion.g>
          </svg>
        )}

        {phase === "wad" && (
          <motion.button
            ref={wadRef}
            type="button"
            onClick={handleRestore}
            title={restoreLabel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast }}
            className="focus-visible:ring-cobalt-bright/50 absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full outline-none focus-visible:ring-2"
            style={{ width: WAD_W, height: WAD_H }}
          >
            <span className="sr-only">{restoreLabel}</span>
            {lobes.map((lobe, i) => (
              <span
                key={i}
                aria-hidden
                className="absolute"
                style={{
                  left: lobe.left,
                  top: lobe.top,
                  width: lobe.size,
                  height: lobe.size * 0.82,
                  transform: `rotate(${lobe.rot}deg)`,
                  borderRadius: lobe.radius,
                  background: "var(--muted)",
                  border:
                    "1px solid color-mix(in oklab, var(--ink-3) 45%, transparent)",
                }}
              />
            ))}
            {/* One glint in the folds — the cue that the wad is live. */}
            <span
              aria-hidden
              className="absolute rounded-full"
              style={{
                left: WAD_W / 2 - 5,
                top: WAD_H / 2 - 7,
                width: 5,
                height: 5,
                background: "var(--accent-bright)",
                opacity: 0.75,
              }}
            />
          </motion.button>
        )}
      </motion.div>

      <span className="sr-only" aria-live="polite" role="status">
        {announcement}
      </span>
    </div>
  );
}
