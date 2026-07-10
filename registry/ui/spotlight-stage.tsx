"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { springs } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type StageAct = {
  id: string;
  label: string;
  node: React.ReactNode;
};

export type SpotlightStageProps = {
  /** Two to four acts, standing in a row on the stage. */
  acts: StageAct[];
  /** Controlled spotlit act id, or null for an open stage. */
  value?: string | null;
  /** Initial spotlit act for uncontrolled usage. */
  defaultValue?: string | null;
  /** Fires with the act id on spot, null on release. */
  onSpot?: (id: string | null) => void;
  /** Stage height in px. @default 250 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** Overhead rig point: the cone's apex hangs at (stage width / 2, RIG_Y). */
const RIG_Y = 12;

/** Cone spread — floor width per px of throw, ≈ 2·tan(16°) of half-angle. */
const CONE_SPREAD = 0.58;

/** Floor pool ellipse, squashed for perspective. */
const POOL_W = 120;
const POOL_H = 34;

/** An act commits on click only once the beam has it at least this lit. */
const LIT_COMMIT = 0.4;

/** Resting glow of an unlit act; the darker floor for outshone acts. */
const REST_FLOOR = 0.28;
const DIMMED_FLOOR = 0.18;

/** Where each rig lamp housing hangs, in % of stage width. */
const LAMP_STOPS = [22, 50, 78] as const;

/** Self-lit scenery — the stage is intentionally a dark room in both themes. */
const STAGE_BG =
  "linear-gradient(180deg, oklch(0.17 0.02 262) 0%, oklch(0.12 0.015 262) 62%, oklch(0.1 0.012 262) 100%)";
const CONE_FILL =
  "linear-gradient(180deg, oklch(0.93 0.06 95 / 0.34) 0%, oklch(0.93 0.06 95 / 0.16) 55%, oklch(0.93 0.06 95 / 0.05) 100%)";
const POOL_FILL =
  "radial-gradient(closest-side, oklch(0.95 0.07 95 / 0.5) 0%, oklch(0.95 0.07 95 / 0.18) 45%, transparent 72%)";
const TRUSS_LINE = "oklch(0.85 0.02 262 / 0.18)";
const LAMP_BODY = "oklch(0.28 0.02 262)";
const LAMP_RIM = "0 0 0 1px oklch(1 0 0 / 0.12)";
const FLOOR_EDGE = "1px solid oklch(0.9 0.03 95 / 0.09)";
const FLOOR_SEAMS =
  "repeating-linear-gradient(90deg, oklch(1 0 0 / 0.04) 0 1px, transparent 1px 44px)";

type ActRect = { cx: number; cy: number; w: number };

/** Spot channel → effective light: a spot pins full light, dim leaves the
 * beam free to preview a summoned act over the darker floor. */
const litEffective = (lit: number, spot: number): number =>
  clamp(lit + Math.max(spot, 0) * (1 - lit), 0, 1);

/**
 * A dark stage where spotlight cones follow the pointer and content steps
 * into the light. One sprung beam position (x/y on `glide`) is the single
 * source of truth: the overhead cone, the floor pool, and every act's lit
 * factor all derive from it. Acts rest dim and desaturated; the beam's
 * gaussian falloff (σ ≈ one plate width) lifts whichever act it crosses.
 * Clicking a lit act — or pressing Enter on a focused one — spots it: the
 * beam locks to its center, the act steps forward on `snap`, the others drop
 * darker, and `onSpot` fires. Clicking the dark stage or pressing Escape
 * releases. Focus summons the beam, so keyboard users sweep it too. Under
 * reduced motion the house lights come up even: no beam, all acts fully
 * visible, selection is an accent border with a slight fast-tween scale.
 */
export function SpotlightStage({
  acts,
  value,
  defaultValue,
  onSpot,
  height = 250,
  className,
  "aria-label": ariaLabel = "Spotlight stage",
}: SpotlightStageProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  /** The beam chases the pointer only for fine pointers with motion on. */
  const beamLive = motionSafe && pointerFine;

  const list = acts.slice(0, 4);

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue ?? null,
  );
  const isControlled = value !== undefined;
  const spotted = isControlled ? value : uncontrolled;
  const spottedAct = list.find((act) => act.id === spotted) ?? null;

  const stageRef = React.useRef<HTMLDivElement>(null);
  /** Live act geometry, stage-local — written by the ResizeObserver and read
   * from event handlers and per-frame transforms, never during render. */
  const rectsRef = React.useRef(new Map<string, ActRect>());
  const actElsRef = React.useRef(new Map<string, HTMLButtonElement>());
  const spottedRef = React.useRef(spotted);
  const measuredRef = React.useRef(false);

  /** The beam's floor position — the one sprung truth everything lights from. */
  const beamX = useSpring(0, GLIDE);
  const beamY = useSpring(0, GLIDE);
  /** Stage width as a motion value so cone math re-derives without renders. */
  const stageW = useMotionValue(0);

  const setSpot = (next: string | null) => {
    if (next === spotted) return;
    if (!isControlled) setUncontrolled(next);
    onSpot?.(next);
  };

  /** Aim the beam at an act's center — focus and near-miss clicks call this. */
  const summon = (id: string) => {
    if (!motionSafe) return;
    const rect = rectsRef.current.get(id);
    if (!rect) return;
    beamX.set(rect.cx);
    beamY.set(rect.cy);
  };

  const commitAct = (id: string, litNow: number) => {
    // Under a live beam an act must already be lit enough to hold; a click
    // on a dark act summons the beam instead of committing. Keyboard commits
    // arrive with litNow = 1, so Enter always spots.
    if (beamLive && spotted !== id && litNow <= LIT_COMMIT) {
      summon(id);
      return;
    }
    setSpot(id);
  };

  const registerEl = (id: string, element: HTMLButtonElement | null) => {
    if (element) {
      actElsRef.current.set(id, element);
    } else {
      actElsRef.current.delete(id);
      rectsRef.current.delete(id);
    }
  };

  const aimAtPointer = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    beamX.set(clamp(clientX - rect.left, 16, rect.width - 16));
    beamY.set(clamp(clientY - rect.top, RIG_Y + 28, rect.height - 8));
  };

  // Keep the lock honest across renders, controlled updates included: when a
  // spot lands, snap the beam target to the act's center (springs carry it).
  React.useEffect(() => {
    spottedRef.current = spotted;
    if (!spotted) return;
    const rect = rectsRef.current.get(spotted);
    if (!rect) return;
    beamX.set(rect.cx);
    beamY.set(rect.cy);
  }, [spotted, beamX, beamY]);

  // One ResizeObserver on the stage keeps the rects map current. Writes are
  // deduped: stage width only updates on real change, the beam only jumps on
  // first measure (to idle center, or the locked act), and later measures
  // just re-aim a locked beam. Motion values only — no state, no loops.
  const actIdsKey = list.map((act) => act.id).join("|");
  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const stageRect = stage.getBoundingClientRect();
      if (stageRect.width === 0 || stageRect.height === 0) return;
      if (Math.abs(stageW.get() - stageRect.width) > 0.5) {
        stageW.set(stageRect.width);
      }
      for (const [id, element] of actElsRef.current) {
        const r = element.getBoundingClientRect();
        rectsRef.current.set(id, {
          cx: r.left - stageRect.left + r.width / 2,
          cy: r.top - stageRect.top + r.height / 2,
          w: r.width,
        });
      }
      const locked = spottedRef.current
        ? rectsRef.current.get(spottedRef.current)
        : undefined;
      if (!measuredRef.current) {
        measuredRef.current = true;
        beamX.jump(locked ? locked.cx : stageRect.width / 2);
        beamY.jump(locked ? locked.cy : stageRect.height * 0.62);
      } else if (locked) {
        beamX.set(locked.cx);
        beamY.set(locked.cy);
      }
    };
    // observe() delivers an initial callback, so mount measures itself.
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [actIdsKey, beamX, beamY, stageW]);

  // THE CONE — a wedge hung from the rig point R = (W/2, RIG_Y), reaching the
  // sprung beam floor point B = (bx, by). With d = B − R, the wedge is a div
  // of height |d| whose unrotated axis points straight down, rotated about
  // its apex (transform-origin "50% 0") by θ = atan2(dx, dy): CSS rotation is
  // clockwise in screen space, so θ maps the down vector (0, 1) onto d/|d|.
  // Its floor width grows with throw length at the fixed CONE_SPREAD, and a
  // triangle clip-path carves the wedge from the gradient-filled div.
  const coneRotate = useTransform([beamX, beamY, stageW], (values) => {
    const [bx, by, w] = values as [number, number, number];
    return (Math.atan2(bx - w / 2, by - RIG_Y) * 180) / Math.PI;
  });
  const coneLen = useTransform([beamX, beamY, stageW], (values) => {
    const [bx, by, w] = values as [number, number, number];
    return Math.hypot(bx - w / 2, by - RIG_Y);
  });
  const coneW = useTransform(coneLen, (len) => clamp(len * CONE_SPREAD, 56, 190));
  const coneX = useTransform([stageW, coneW], (values) => {
    const [w, cw] = values as [number, number];
    return w / 2 - cw / 2;
  });
  // THE FLOOR POOL — the same beam point, as an ellipse of thrown light.
  const poolX = useTransform(beamX, (bx) => bx - POOL_W / 2);
  const poolY = useTransform(beamY, (by) => by - POOL_H / 2);

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label={ariaLabel}
      style={{ height, background: STAGE_BG }}
      onPointerMove={
        beamLive && !spotted
          ? (event) => aimAtPointer(event.clientX, event.clientY)
          : undefined
      }
      onClick={spotted ? () => setSpot(null) : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && spotted) {
          event.stopPropagation();
          setSpot(null);
        }
      }}
      className={cn(
        "border-hairline relative w-full overflow-hidden rounded-3 border select-none",
        className,
      )}
    >
      {/* Overhead rig — hairline truss with three lamp housings. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-4 top-0 z-20 h-4">
        <span
          className="absolute inset-x-0 top-1.5 h-px"
          style={{ background: TRUSS_LINE }}
        />
        {LAMP_STOPS.map((stop) => (
          <span
            key={stop}
            className="absolute top-1.5 h-2.5 w-4 -translate-x-1/2 rounded-b-[3px]"
            style={{ left: `${stop}%`, background: LAMP_BODY, boxShadow: LAMP_RIM }}
          />
        ))}
      </div>

      {/* Faint floorboards along the foot of the scenery. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-7"
        style={{ borderTop: FLOOR_EDGE, background: FLOOR_SEAMS }}
      />

      {motionSafe ? (
        <>
          {/* The cone, apex pinned under the center lamp. */}
          <motion.div
            aria-hidden
            style={{
              top: RIG_Y,
              left: 0,
              x: coneX,
              width: coneW,
              height: coneLen,
              rotate: coneRotate,
              transformOrigin: "50% 0",
              background: CONE_FILL,
              clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
              filter: "blur(5px)",
            }}
            className="pointer-events-none absolute z-[1] mix-blend-screen"
          />
          {/* The pool of light where the beam meets the floor. */}
          <motion.div
            aria-hidden
            style={{
              x: poolX,
              y: poolY,
              width: POOL_W,
              height: POOL_H,
              background: POOL_FILL,
            }}
            className="pointer-events-none absolute top-0 left-0 z-[2] rounded-full mix-blend-screen"
          />
        </>
      ) : null}

      {/* The acts, standing in a row at the front of the stage. */}
      <div className="relative z-10 flex h-full items-end justify-center gap-2 px-3 pt-6 pb-8">
        {list.map((act) => (
          <ActPlate
            key={act.id}
            act={act}
            mode={
              spotted === act.id ? "spotted" : spotted ? "dimmed" : "free"
            }
            motionSafe={motionSafe}
            beamX={beamX}
            rectsRef={rectsRef}
            registerEl={registerEl}
            onCommit={commitAct}
            onSummon={summon}
          />
        ))}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spottedAct ? `${spottedAct.label} in the spotlight` : "Stage open"}
      </span>
    </div>
  );
}

type ActPlateProps = {
  act: StageAct;
  mode: "free" | "spotted" | "dimmed";
  motionSafe: boolean;
  beamX: MotionValue<number>;
  rectsRef: React.RefObject<Map<string, ActRect>>;
  registerEl: (id: string, element: HTMLButtonElement | null) => void;
  onCommit: (id: string, litNow: number) => void;
  onSummon: (id: string) => void;
};

function ActPlate({
  act,
  mode,
  motionSafe,
  beamX,
  rectsRef,
  registerEl,
  onCommit,
  onSummon,
}: ActPlateProps) {
  // LIT — gaussian falloff of horizontal distance from the beam center,
  // σ = one plate width: exp(−d² / 2σ²). beamX is already sprung, so the
  // light rolls across the row without any extra smoothing.
  const lit = useTransform(beamX, (bx) => {
    const rect = rectsRef.current.get(act.id);
    if (!rect || rect.w === 0) return 0;
    const d = (bx - rect.cx) / rect.w;
    return Math.exp(-0.5 * d * d);
  });

  // SPOT — the committed channel: +1 spotted, −1 outshone, 0 free. It rides
  // `snap` between those poles so stepping forward has one crisp overshoot.
  const spot = useMotionValue(
    mode === "spotted" ? 1 : mode === "dimmed" ? -1 : 0,
  );
  const spotControls = React.useRef<ReturnType<typeof animate> | null>(null);
  React.useEffect(() => {
    const target = mode === "spotted" ? 1 : mode === "dimmed" ? -1 : 0;
    spotControls.current?.stop();
    if (!motionSafe) {
      spot.jump(target);
      return;
    }
    spotControls.current = animate(spot, target, springs.snap);
    return () => spotControls.current?.stop();
  }, [mode, motionSafe, spot]);

  const opacity = useTransform([lit, spot], (values) => {
    const [l, s] = values as [number, number];
    // Outshone acts sink to a darker floor, but a summoned beam still lights them.
    const floor = REST_FLOOR - Math.max(-s, 0) * (REST_FLOOR - DIMMED_FLOOR);
    return floor + (1 - floor) * litEffective(l, s);
  });
  const scale = useTransform([lit, spot], (values) => {
    const [l, s] = values as [number, number];
    // Beam light adds up to +0.02; a spot steps the act forward to 1.05.
    return 1 + litEffective(l, s) * 0.02 + Math.max(s, 0) * 0.03;
  });
  const filter = useTransform([lit, spot], (values) => {
    const [l, s] = values as [number, number];
    const e = litEffective(l, s);
    const saturateAmt = mapRange(e, 0, 1, 0.55, 1);
    const brightnessAmt = mapRange(e, 0, 1, 0.85, 1.12);
    const contrastAmt = mapRange(e, 0, 1, 0.96, 1.04);
    return `saturate(${saturateAmt}) brightness(${brightnessAmt}) contrast(${contrastAmt})`;
  });

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // The stage click behind us releases; an act click must not double as one.
    event.stopPropagation();
    // Keyboard activations (Enter/Space) arrive with detail 0 — they always
    // commit, so focus-then-Enter never races the beam spring.
    onCommit(act.id, event.detail === 0 ? 1 : lit.get());
  };

  return (
    <motion.button
      ref={(element) => {
        registerEl(act.id, element);
      }}
      type="button"
      aria-pressed={mode === "spotted"}
      onClick={handleClick}
      onFocus={() => onSummon(act.id)}
      style={motionSafe ? { opacity, scale, filter } : undefined}
      className={cn(
        "border-hairline bg-surface-2 focus-visible:ring-cobalt-bright/60 flex w-full max-w-32 min-w-0 flex-1 origin-bottom flex-col items-center justify-end gap-2 rounded-2 border p-3 outline-none focus-visible:ring-2",
        mode === "spotted" && "border-cobalt-bright",
        !motionSafe &&
          "hover:border-hairline-strong transition-[transform,border-color] duration-150",
        !motionSafe && mode === "spotted" && "scale-[1.02]",
      )}
    >
      <span aria-hidden className="flex h-8 items-center justify-center">
        {act.node}
      </span>
      <span className="text-ink w-full truncate text-center font-mono text-[10px] tracking-[0.08em]">
        {act.label}
      </span>
    </motion.button>
  );
}
