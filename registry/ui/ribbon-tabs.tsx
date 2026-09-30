"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RibbonFabric = "satin" | "linen" | "velvet";

export type RibbonTab = {
  id: string;
  /** One or two short words: the ribbon's label and the tab's name. */
  label: string;
  /** What the panel under the rail shows while this ribbon is chosen. */
  content: React.ReactNode;
  disabled?: boolean;
};

export type RibbonTabsProps = {
  tabs: RibbonTab[];
  /** Controlled: the chosen tab's id. */
  value?: string;
  /** The tab chosen first when uncontrolled. @default the first enabled tab */
  defaultValue?: string;
  /** Fires from the tap, tug or key that chose a tab, with its id. */
  onValueChange?: (id: string) => void;
  /** The tab list's accessible name. */
  label: string;
  /** How freely the ribbons swing, 0 to 1: 0 hangs rigid, 1 swings long and lazily. @default 0.5 */
  sway?: number;
  /** The cloth: glossy satin, matte linen or heavy velvet — its look, its cut and its weight. @default "satin" */
  fabric?: RibbonFabric;
  /** How much further the chosen ribbon drops than the rest, in px (24 to 64). @default 40 */
  length?: number;
  /** The fabric's colour, any CSS colour. Pale and deep shades are drawn from it. @default "var(--accent)" */
  color?: string;
  /** Play a swish when the visitor changes tab. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type FabricDef = {
  /** The resting shade and the chosen shade, as pigments: same in both themes. */
  pale: string;
  deep: string;
  /** Pendulum stiffness for a 60 px ribbon; longer ribbons swing slower. */
  swing: number;
  /** Multiplies the damping ratio: linen is stiff, satin free. */
  damp: number;
  /** The drop spring: stiffness and damping ratio. */
  dropK: number;
  dropZ: number;
  /** The swish's register. */
  pitch: number;
};

// Every shade is the fabric colour at a fixed lightness (pigment, not text
// colour), so a ribbon looks like the same cloth on a light page and a dark one.
const FABRICS: Record<RibbonFabric, FabricDef> = {
  satin: {
    pale: "oklch(from var(--rib) 0.88 calc(c * 0.32) h)",
    deep: "oklch(from var(--rib) 0.53 calc(c * 0.95) h)",
    swing: 300,
    damp: 1,
    dropK: 420,
    dropZ: 0.42,
    pitch: 1.12,
  },
  linen: {
    pale: "oklch(from var(--rib) 0.9 calc(c * 0.22) h)",
    deep: "oklch(from var(--rib) 0.58 calc(c * 0.6) h)",
    swing: 380,
    damp: 1.7,
    dropK: 520,
    dropZ: 0.8,
    pitch: 0.95,
  },
  velvet: {
    pale: "oklch(from var(--rib) 0.8 calc(c * 0.42) h)",
    deep: "oklch(from var(--rib) 0.41 calc(c * 0.85) h)",
    swing: 210,
    damp: 1.25,
    dropK: 300,
    dropZ: 0.62,
    pitch: 0.78,
  },
};

const INK_DARK = "oklch(from var(--rib) 0.3 calc(c * 0.5) h)";
const INK_LIGHT = "oklch(from var(--rib) 0.97 0.02 h)";

/** The rod's centre, from the top of the band. The ribbons pivot here. */
const ROD_Y = 7;
/** Where a resting ribbon ends: its label zone and a short tail. */
const REST = 50;
/** Where the edges start to bend: just under the rod. */
const EDGE = 14;
/** How deep the swallowtail and the chevron are cut. */
const NOTCH = 9;
/** A pull past the full drop gives at most this much more. */
const PULL = 24;
/** The drawing's height: every length, overshoot and pull fits in it. */
const SVG_H = REST + 64 + PULL + NOTCH + 8;
/** The widest swing, in degrees. */
const MAX_DEG = 8;
/** How long the tug on the rail takes to reach the next ribbon, in ms. */
const WAVE_MS = 45;
/** The drawing is 100 units wide whatever the ribbon's width; this is ~1 px. */
const UNIT = 1.3;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const safeId = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "");

type Outline = {
  body: string;
  /** Satin's sheen or velvet's crushed pile: a band that moves with the swing. */
  band: string;
  /** Velvet's lighter nap along both edges. */
  nap: string;
  /** Linen's stitched hem and fringe. */
  stitch: string;
  fringe: string;
};

/**
 * The ribbon's outline in its own 100-unit-wide frame (y is in px): straight
 * under the rod, then each edge bends toward a tail displaced by `bend`, the
 * lag of the cloth behind the swing. Rebuilt every frame from motion values;
 * every number rounded so the path string is stable.
 */
function outline(
  fabric: RibbonFabric,
  len: number,
  bendDeg: number,
  angle: number,
): Outline {
  const y1 = REST + Math.max(-6, len);
  const drop = y1 - EDGE;
  const bx = r2(Math.sin((bendDeg * Math.PI) / 180) * drop * UNIT);
  const ye = fabric === "velvet" ? y1 - NOTCH : y1;
  const mid = r2((EDGE + ye) / 2);
  const end = r2(ye);
  const tip =
    fabric === "satin"
      ? ` L ${r2(50 + bx)} ${r2(y1 - NOTCH)}`
      : fabric === "velvet"
        ? ` L ${r2(50 + bx)} ${r2(y1)}`
        : "";
  const body = `M 0 3 L 100 3 L 100 ${EDGE} Q 100 ${mid} ${r2(100 + bx)} ${end}${tip} L ${bx} ${end} Q 0 ${mid} 0 ${EDGE} Z`;
  let band = "";
  let nap = "";
  let stitch = "";
  let fringe = "";
  if (fabric === "satin") {
    const x0 = r2(22 - angle * 5);
    band = `M ${x0} 0 L ${r2(x0 + 26)} 0 L ${r2(x0 + 26 + bx)} ${r2(y1)} L ${r2(x0 + bx)} ${r2(y1)} Z`;
  } else if (fabric === "velvet") {
    const x0 = r2(52 + angle * 4);
    band = `M ${x0} 0 L ${r2(x0 + 24)} 0 L ${r2(x0 + 24 + bx)} ${r2(y1)} L ${r2(x0 + bx)} ${r2(y1)} Z`;
    nap = `M 0 0 L 9 0 L ${r2(9 + bx)} ${r2(y1)} L ${bx} ${r2(y1)} Z M 91 0 L 100 0 L ${r2(100 + bx)} ${r2(y1)} L ${r2(91 + bx)} ${r2(y1)} Z`;
  } else {
    const ys = r2(y1 - 6);
    const sx = r2(bx * 0.86);
    stitch = `M ${r2(4 + sx)} ${ys} L ${r2(96 + sx)} ${ys}`;
    const ticks: string[] = [];
    for (let x = 5; x <= 95; x += 6) {
      ticks.push(`M ${r2(x + bx)} ${r2(y1)} L ${r2(x + bx)} ${r2(y1 + 2.5)}`);
    }
    fringe = ticks.join(" ");
  }
  return { body, band, nap, stitch, fringe };
}

type RibbonApi = {
  /** Adds an angular impulse (deg/s), after `delay` ms. */
  kick: (velocity: number, delay?: number) => void;
  node: () => HTMLButtonElement | null;
};

type RibbonProps = {
  tab: RibbonTab;
  tabId: string;
  panelId: string;
  selected: boolean;
  focusable: boolean;
  length: number;
  fabric: RibbonFabric;
  sway: number;
  motionSafe: boolean;
  disabled: boolean;
  register: (id: string, api: RibbonApi | null) => void;
  onSelect: (id: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * One ribbon: a pendulum hung from the rod. Its drop, swing and colour are
 * motion values, so nothing it does per frame goes through React.
 */
function Ribbon({
  tab,
  tabId,
  panelId,
  selected,
  focusable,
  length,
  fabric,
  sway,
  motionSafe,
  disabled,
  register,
  onSelect,
  onKeyDown,
}: RibbonProps) {
  const fab = FABRICS[fabric] ?? FABRICS.satin;
  const clipId = `${tabId}-clip`;
  const weaveId = `${tabId}-weave`;
  const off = disabled || !!tab.disabled;
  const target = selected ? length : 0;

  const len = useMotionValue(target);
  const angle = useMotionValue(0);
  const tint = useMotionValue(selected ? 1 : 0);
  const [hovered, setHovered] = React.useState(false);
  const [check, setCheck] = React.useState(0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const lenAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const swingAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const tintAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const timers = React.useRef(new Set<number>());
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const pressAt = React.useRef(0);
  const latest = React.useRef<{
    kick: (velocity: number) => void;
    settle: (to: number) => void;
  }>({ kick: () => {}, settle: () => {} });

  /** The drop falls on the fabric's spring; the rise is a crisp snap. */
  const settle = React.useCallback(
    (to: number) => {
      lenAnim.current?.stop();
      if (!motionSafe) {
        len.set(to);
        return;
      }
      const velocity = len.getVelocity();
      if (to > 0) {
        // Less sway means a stiffer cloth: it drops without the bounce.
        const zeta = Math.min(1, fab.dropZ + (1 - sway) * 0.3);
        lenAnim.current = animate(len, to, {
          type: "spring",
          stiffness: fab.dropK,
          damping: 2 * zeta * Math.sqrt(fab.dropK),
          mass: 1,
          velocity,
        });
      } else {
        lenAnim.current = animate(len, to, { ...springs.snap, velocity });
      }
    },
    [fab.dropK, fab.dropZ, len, motionSafe, sway],
  );

  const kickNow = (v: number) => {
    if (!motionSafe || v === 0) return;
    // A pendulum: the longer the ribbon hangs, the slower it swings.
    const hang = REST + Math.max(0, len.get());
    const stiffness = (fab.swing * 60) / hang;
    const omega = Math.sqrt(stiffness);
    const zeta = Math.min(1, lerp(0.8, 0.1, sway) * fab.damp);
    // Kicks add to whatever it is already doing, but never past MAX_DEG.
    const limit = omega * MAX_DEG;
    const velocity = clamp(angle.getVelocity() + v, -limit, limit);
    swingAnim.current?.stop();
    swingAnim.current = animate(angle, 0, {
      type: "spring",
      stiffness,
      damping: 2 * zeta * omega,
      mass: 1,
      velocity,
      restDelta: 0.02,
      restSpeed: 0.5,
    });
  };

  React.useEffect(() => {
    latest.current = { kick: kickNow, settle };
  });

  // The ribbon answers to the rail through this handle; it is keyed by the
  // tab's id, so a reordered list never kicks the wrong ribbon.
  React.useEffect(() => {
    const pending = timers.current;
    register(tab.id, {
      kick: (velocity, delay = 0) => {
        if (delay <= 0) {
          latest.current.kick(velocity);
          return;
        }
        const t = window.setTimeout(() => {
          pending.delete(t);
          latest.current.kick(velocity);
        }, delay);
        pending.add(t);
      },
      node: () => buttonRef.current,
    });
    return () => register(tab.id, null);
  }, [register, tab.id]);

  // The length follows the choice (and a changed `length`); after a tug it
  // is checked again, so a host that refused the choice gets it back.
  React.useEffect(() => {
    if (dragging.current) return;
    settle(target);
  }, [target, check, settle]);

  React.useEffect(() => {
    tintAnim.current?.stop();
    tintAnim.current = animate(tint, selected ? 1 : hovered && !off ? 0.2 : 0, {
      duration: durations.base,
      ease: easings.enter,
    });
  }, [selected, hovered, off, tint]);

  // A theme or reduced-motion switch leaves the ribbon hanging straight.
  React.useEffect(() => {
    if (motionSafe) return;
    swingAnim.current?.stop();
    angle.set(0);
  }, [motionSafe, angle]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      lenAnim.current?.stop();
      swingAnim.current?.stop();
      tintAnim.current?.stop();
    };
  }, []);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: off,
    onStart: () => {
      dragging.current = true;
      lenAnim.current?.stop();
      dragFrom.current = len.get();
    },
    onMove: ({ offset }) => {
      // 1:1 under the finger, resisting past the full drop and above rest.
      const raw = dragFrom.current + offset.y;
      const next =
        raw > length
          ? length + rubberband(raw - length, PULL)
          : raw < 0
            ? rubberband(raw, 12)
            : raw;
      len.set(r2(next));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(len.get(), velocity.y, 0.99);
      if (!selected && landing > length / 2) {
        onSelect(tab.id);
        // Heading for the drop; if the host says no, the check brings it up.
        latest.current.settle(length);
      } else {
        latest.current.settle(target);
      }
      React.startTransition(() => setCheck((c) => c + 1));
    },
    onCancel: () => {
      dragging.current = false;
      latest.current.settle(target);
    },
    onTap: (event) => {
      // A finger that brushed sideways across the rail was not choosing.
      if (Math.abs(event.clientX - pressAt.current) < 10) onSelect(tab.id);
      React.startTransition(() => setCheck((c) => c + 1));
    },
  });

  const rotate = useTransform(angle, (a) => r2(a));
  const spin = useVelocity(angle);
  // The tail trails the swing: cloth lags behind the rod it hangs from.
  const bend = useTransform(spin, (v) => r2(clamp(-v * 0.035, -10, 10)));
  const shape = useTransform(
    [len, bend, angle] as MotionValue<number>[],
    ([l = 0, b = 0, a = 0]: number[]) => outline(fabric, l, b, a),
  );
  const bodyPath = useTransform(shape, (o) => o.body);
  const bandPath = useTransform(shape, (o) => o.band);
  const napPath = useTransform(shape, (o) => o.nap);
  const stitchPath = useTransform(shape, (o) => o.stitch);
  const fringePath = useTransform(shape, (o) => o.fringe);
  const cloth = useTransform(
    tint,
    (p) =>
      `color-mix(in oklab, ${fab.deep} ${Math.round(clamp01(p) * 100)}%, ${fab.pale})`,
  );
  const foldColor = useTransform(
    cloth,
    (c) => `color-mix(in oklab, ${c} 78%, black)`,
  );
  const ink = useTransform(
    tint,
    (p) =>
      `color-mix(in oklab, ${INK_LIGHT} ${Math.round(clamp01((p - 0.35) / 0.65) * 100)}%, ${INK_DARK})`,
  );

  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      id={tabId}
      aria-selected={selected}
      aria-controls={selected ? panelId : undefined}
      tabIndex={focusable ? 0 : -1}
      disabled={off}
      title={tab.label}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it (Enter, Space, assistive technology) chooses too.
        if (event.detail === 0) onSelect(tab.id);
      }}
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      {...drag}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        pressAt.current = event.clientX;
        // Pressed, the cloth gives a little under the hand.
        if (!off && motionSafe && !selected) {
          lenAnim.current?.stop();
          lenAnim.current = animate(len, 3, springs.flick);
        }
      }}
      onPointerCancel={(event) => {
        drag.onPointerCancel(event);
        if (!dragging.current) latest.current.settle(target);
      }}
      className={cn(
        "relative h-[50px] max-w-28 min-w-0 flex-1 touch-pan-x rounded-2 outline-none select-none [-webkit-touch-callout:none]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        off ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 block"
        style={{ rotate, transformOrigin: `50% ${ROD_Y}px`, height: SVG_H }}
      >
        <svg
          width="100%"
          height={SVG_H}
          viewBox={`0 0 100 ${SVG_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 block overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.path d={bodyPath} />
            </clipPath>
            {/* Cloth curls away at its edges, so they sit a shade darker. */}
            <linearGradient id={`${tabId}-edge`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="black" stopOpacity={0.16} />
              <stop offset="0.16" stopColor="black" stopOpacity={0} />
              <stop offset="0.84" stopColor="black" stopOpacity={0} />
              <stop offset="1" stopColor="black" stopOpacity={0.16} />
            </linearGradient>
            <linearGradient id={`${tabId}-shade`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="black" stopOpacity={0.22} />
              <stop offset="1" stopColor="black" stopOpacity={0} />
            </linearGradient>
            {fabric === "satin" ? (
              <linearGradient id={`${tabId}-sheen`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="white" stopOpacity={0} />
                <stop offset="0.5" stopColor="white" stopOpacity={0.5} />
                <stop offset="1" stopColor="white" stopOpacity={0} />
              </linearGradient>
            ) : null}
            {fabric === "velvet" ? (
              <>
                <linearGradient id={`${tabId}-nap`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="white" stopOpacity={0.28} />
                  <stop offset="0.09" stopColor="white" stopOpacity={0} />
                  <stop offset="0.91" stopColor="white" stopOpacity={0} />
                  <stop offset="1" stopColor="white" stopOpacity={0.28} />
                </linearGradient>
                <linearGradient
                  id={`${tabId}-crush`}
                  x1="0"
                  x2="1"
                  y1="0"
                  y2="0"
                >
                  <stop offset="0" stopColor="black" stopOpacity={0} />
                  <stop offset="0.5" stopColor="black" stopOpacity={0.2} />
                  <stop offset="1" stopColor="black" stopOpacity={0} />
                </linearGradient>
              </>
            ) : null}
            {fabric === "linen" ? (
              <pattern
                id={weaveId}
                width={3}
                height={3}
                patternUnits="userSpaceOnUse"
              >
                <rect width={3} height={1} fill="black" opacity={0.07} />
                <rect width={1} height={3} fill="white" opacity={0.16} />
              </pattern>
            ) : null}
          </defs>
          <motion.path
            d="M 2 6 Q 2 0 10 0 L 90 0 Q 98 0 98 6 Z"
            style={{ fill: foldColor }}
          />
          <motion.path d={bodyPath} style={{ fill: cloth }} />
          <g clipPath={`url(#${clipId})`}>
            {fabric === "linen" ? (
              <rect width={100} height={SVG_H} fill={`url(#${weaveId})`} />
            ) : null}
            {fabric === "satin" ? (
              <motion.path d={bandPath} fill={`url(#${tabId}-sheen)`} />
            ) : null}
            {fabric === "velvet" ? (
              <>
                <motion.path d={napPath} fill={`url(#${tabId}-nap)`} />
                <motion.path d={bandPath} fill={`url(#${tabId}-crush)`} />
              </>
            ) : null}
            <motion.path d={bodyPath} fill={`url(#${tabId}-edge)`} />
            {/* Shade under the rod, where the cloth turns over it. */}
            <rect
              width={100}
              height={10}
              y={10}
              fill={`url(#${tabId}-shade)`}
            />
          </g>
          {fabric === "linen" ? (
            <>
              <motion.path
                d={stitchPath}
                fill="none"
                strokeWidth={1}
                strokeDasharray="3 2"
                style={{ stroke: foldColor }}
              />
              <motion.path
                d={fringePath}
                fill="none"
                strokeWidth={0.9}
                style={{ stroke: cloth }}
              />
            </>
          ) : null}
        </svg>
        <motion.span
          className="absolute inset-x-0 top-[11px] flex h-[30px] items-center justify-center px-2"
          style={{ color: ink }}
        >
          <span className="truncate text-xs font-medium">{tab.label}</span>
        </motion.span>
      </motion.span>
    </button>
  );
}

type Travel = { dir: number; safe: boolean };

type PanelProps = {
  id: string;
  labelledBy: string;
  travel: Travel;
  children: React.ReactNode;
};

const PANEL = {
  enter: ({ dir, safe }: Travel) => ({
    opacity: 0,
    x: safe ? dir * distances.step : 0,
  }),
  center: ({ safe }: Travel) => ({
    opacity: 1,
    x: 0,
    transition: safe
      ? { ...springs.glide, opacity: { duration: durations.base } }
      : { duration: durations.base, ease: easings.enter },
  }),
  exit: ({ dir, safe }: Travel) => ({
    opacity: 0,
    x: safe ? -dir * distances.step : 0,
    transition: exitFor(),
  }),
};

/** A panel that is leaving keeps its place in the cell but leaves the page's order. */
function Panel({ id, labelledBy, travel, children }: PanelProps) {
  const present = useIsPresent();
  return (
    <motion.div
      role="tabpanel"
      id={present ? id : undefined}
      aria-labelledby={labelledBy}
      aria-hidden={present ? undefined : true}
      inert={!present}
      tabIndex={present ? 0 : -1}
      custom={travel}
      variants={PANEL}
      initial="enter"
      animate="center"
      exit="exit"
      className="col-start-1 row-start-1 min-w-0 rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
    >
      {children}
    </motion.div>
  );
}

/**
 * Tabs drawn as lengths of fabric hanging from a rail. The chosen ribbon
 * drops `length` px further than the rest on a spring set by the cloth —
 * satin falls and bounces once, linen stops short, velvet is heavy — and its
 * colour deepens from a pale tint to the full pigment on a tween. Changing tab
 * tugs the rail: every ribbon is a pendulum, the new one swings through the
 * hardest, and a wave of smaller kicks runs along the rail from the old tab.
 * Each tail lags its swing, so the cloth bends rather than turning like a
 * card. Running the pointer across the ribbons brushes them into motion; a
 * ribbon pulled down like a cord follows the hand 1:1 and, let go past half
 * its drop, becomes the chosen tab.
 *
 * Under the rail, the panel cross-fades in the direction of travel and its
 * height glides to fit. It is a real `role="tablist"`: arrow keys move and
 * choose with the same sway, Home and End jump, and the panel is a labelled
 * `tabpanel`. Under reduced motion nothing swings or bounces: the chosen
 * ribbon's length switches at once and its colour still deepens, because the
 * choice is information.
 */
export function RibbonTabs({
  tabs,
  value,
  defaultValue,
  onValueChange,
  label,
  sway = 0.5,
  fabric = "satin",
  length = 40,
  color = "var(--accent)",
  sound = false,
  disabled = false,
  className,
}: RibbonTabsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = safeId(React.useId());
  const fab = FABRICS[fabric] ?? FABRICS.satin;
  const cloth: RibbonFabric = FABRICS[fabric] ? fabric : "satin";
  const s = clamp01(sway);
  const drop = Math.round(clamp(length, 0, 64));
  const bandH = REST + drop + 12;

  const firstEnabled = tabs.find((t) => !t.disabled)?.id ?? tabs[0]?.id ?? "";
  const [own, setOwn] = React.useState(defaultValue ?? firstEnabled);
  const raw = value ?? own;
  const current = tabs.some((t) => t.id === raw) ? raw : firstEnabled;
  const index = tabs.findIndex((t) => t.id === current);
  const shownTab = tabs[index];

  // Which way the choice last travelled, frozen in the render that moved it.
  const [trail, setTrail] = React.useState({ id: current, dir: 1 });
  if (trail.id !== current) {
    const from = tabs.findIndex((t) => t.id === trail.id);
    setTrail({ id: current, dir: from !== -1 && index < from ? -1 : 1 });
  }

  const ribbons = React.useRef(new Map<string, RibbonApi>());
  const register = React.useCallback((id: string, api: RibbonApi | null) => {
    if (api) ribbons.current.set(id, api);
    else ribbons.current.delete(id);
  }, []);

  const tabIdOf = (id: string) => `${uid}-tab-${safeId(id)}`;
  const panelIdOf = (id: string) => `${uid}-panel-${safeId(id)}`;

  const select = (id: string) => {
    if (disabled) return;
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.disabled) return;
    const node = ribbons.current.get(id)?.node();
    if (id === current) {
      // The chosen ribbon, tapped again, gives a small shrug and no more.
      ribbons.current.get(id)?.kick(s * 40);
      return;
    }
    const from = tabs.findIndex((t) => t.id === current);
    const to = tabs.findIndex((t) => t.id === id);
    const rect = node?.getBoundingClientRect();
    audio.play("swish", {
      pitch: r2(fab.pitch * (1 + 0.06 * Math.min(4, Math.abs(to - from)))),
      gain: 0.42,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
    if (value === undefined) setOwn(id);
    onValueChange?.(id);
  };

  // A change of tab — from a press, a key or the host — tugs the rail. The
  // wave starts at the old ribbon and reaches each other one a beat later.
  const shown = React.useRef(current);
  React.useEffect(() => {
    const from = shown.current;
    if (from === current) return;
    shown.current = current;
    if (!motionSafe || s <= 0) return;
    const fromIdx = tabs.findIndex((t) => t.id === from);
    const toIdx = tabs.findIndex((t) => t.id === current);
    if (toIdx === -1) return;
    const start = fromIdx === -1 ? toIdx : fromIdx;
    const dir = fromIdx === -1 ? 1 : Math.sign(toIdx - fromIdx) || 1;
    tabs.forEach((t, i) => {
      const api = ribbons.current.get(t.id);
      if (!api) return;
      const strength =
        i === toIdx
          ? 150
          : i === fromIdx
            ? 80
            : 90 / (1 + 0.7 * Math.abs(i - toIdx));
      api.kick(dir * strength * s, Math.abs(i - start) * WAVE_MS);
    });
  }, [current, motionSafe, s, tabs]);

  const move = (from: number, step: number) => {
    const n = tabs.length;
    for (let k = 1; k <= n; k += 1) {
      const i = (((from + step * k) % n) + n) % n;
      const t = tabs[i];
      if (t && !t.disabled) return t;
    }
    return undefined;
  };

  const choose = (tab: RibbonTab | undefined) => {
    if (!tab) return;
    select(tab.id);
    ribbons.current.get(tab.id)?.node()?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const at = tabs.findIndex((t) => tabIdOf(t.id) === event.currentTarget.id);
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        choose(move(at, 1));
        return;
      case "ArrowLeft":
        event.preventDefault();
        choose(move(at, -1));
        return;
      case "Home":
        event.preventDefault();
        choose(move(-1, 1));
        return;
      case "End":
        event.preventDefault();
        choose(move(tabs.length, -1));
        return;
    }
  };

  // Brushing: a pointer crossing into a ribbon pushes it the way it went.
  const brush = React.useRef({ id: "", x: 0, t: 0 });
  const onBrush = (event: React.PointerEvent<HTMLDivElement>) => {
    const b = brush.current;
    const dt = Math.max(8, event.timeStamp - b.t);
    const vx = b.t ? ((event.clientX - b.x) / dt) * 1000 : 0;
    b.x = event.clientX;
    b.t = event.timeStamp;
    if (disabled || !motionSafe || s <= 0) return;
    let hit = "";
    for (const [id, api] of ribbons.current) {
      const r = api.node()?.getBoundingClientRect();
      if (
        r &&
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top - 8 &&
        event.clientY <= r.bottom + drop
      ) {
        hit = id;
      }
    }
    if (hit === b.id) return;
    b.id = hit;
    if (!hit || Math.abs(vx) < 40) return;
    const push = clamp(vx, -1400, 1400);
    ribbons.current.get(hit)?.kick(-push * 0.14 * s);
    if (Math.abs(push) > 700) {
      audio.play("swish", {
        pitch: r2(fab.pitch * 1.3),
        gain: 0.16,
        pan: panFrom(event.clientX, null),
      });
    }
  };

  // The panel's height is measured and glides; the first reading is taken
  // as it is, so the page never animates on arrival.
  const panelH = useMotionValue(0);
  const [sized, setSized] = React.useState(false);
  const sizeAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const safeNow = React.useRef(motionSafe);
  React.useEffect(() => {
    safeNow.current = motionSafe;
  }, [motionSafe]);
  const bindPanel = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      let first = true;
      const observer = new ResizeObserver(() => {
        const h = node.offsetHeight;
        if (first) {
          first = false;
          panelH.jump(h);
          setSized(true);
          return;
        }
        sizeAnim.current?.stop();
        if (safeNow.current) {
          sizeAnim.current = animate(panelH, h, springs.glide);
        } else {
          panelH.set(h);
        }
      });
      observer.observe(node);
      return () => {
        observer.disconnect();
        sizeAnim.current?.stop();
      };
    },
    [panelH],
  );

  const focusId = shownTab && !shownTab.disabled ? current : firstEnabled;
  const travel: Travel = { dir: trail.dir, safe: motionSafe };

  return (
    <div
      className={cn("flex w-full min-w-0 flex-col gap-3", className)}
      style={{ "--rib": color } as React.CSSProperties}
    >
      <div className="relative px-3.5" style={{ height: bandH }}>
        <div
          role="tablist"
          aria-label={label}
          aria-orientation="horizontal"
          onPointerMove={onBrush}
          onPointerLeave={() => {
            brush.current = { id: "", x: 0, t: 0 };
          }}
          className="relative flex h-full items-start justify-center gap-2.5"
        >
          {tabs.map((tab) => (
            <Ribbon
              key={tab.id}
              tab={tab}
              tabId={tabIdOf(tab.id)}
              panelId={panelIdOf(tab.id)}
              selected={tab.id === current}
              focusable={tab.id === focusId}
              length={drop}
              fabric={cloth}
              sway={s}
              motionSafe={motionSafe}
              disabled={disabled}
              register={register}
              onSelect={select}
              onKeyDown={onKeyDown}
            />
          ))}
        </div>
        {/* The rod lies over the ribbons' tops, so they read as hung over it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 top-1 h-1.5 rounded-full"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--ink-3) 35%, white), var(--ink-3) 55%, color-mix(in oklab, var(--ink-3) 55%, black))",
          }}
        >
          {["left-0", "right-0"].map((side) => (
            <span
              key={side}
              className={cn("absolute -top-[3px] size-3 rounded-full", side)}
              style={{
                background:
                  "radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--ink-3) 25%, white), var(--ink-3) 60%, color-mix(in oklab, var(--ink-3) 50%, black))",
              }}
            />
          ))}
        </div>
      </div>

      <motion.div
        className="relative overflow-clip rounded-3 border border-hairline bg-card [contain:paint]"
        style={sized ? { height: panelH } : undefined}
      >
        <div ref={bindPanel} className="grid">
          <AnimatePresence initial={false} custom={travel}>
            {shownTab ? (
              <Panel
                key={shownTab.id}
                id={panelIdOf(shownTab.id)}
                labelledBy={tabIdOf(shownTab.id)}
                travel={travel}
              >
                {shownTab.content}
              </Panel>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
