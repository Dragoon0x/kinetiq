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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CantileverAction = {
  id: string;
  /** One or two words: the tool's accessible name, shown on the latch plate. */
  label: string;
  /** 16px, drawn in currentColor. Without one, the label's first letters stand in. */
  icon?: React.ReactNode;
  /** A shortcut to show beside the label, e.g. "⌘D". */
  shortcut?: string;
  /** A destructive tool is drawn in the danger colour. @default "default" */
  tone?: "default" | "danger";
};

export type CantileverGroup = {
  id: string;
  /** The tray's name, stamped on its front. Up to four actions sit in a tray. */
  label: string;
  actions: CantileverAction[];
};

export type CantileverFinish = "red" | "steel" | "green";

export type CantileverMenuProps = {
  /** One group per tray, from the top tray down; groups beyond the trays share the box. */
  groups: CantileverGroup[];
  /** The menu's name: the latch's accessible name, shown on its plate while shut. */
  label: string;
  /** A tool was chosen. Fires as it lifts out, before the box folds shut. */
  onAction?: (id: string) => void;
  /** Controlled: whether the box is open. */
  open?: boolean;
  /** Open at first when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, pull or key that opened or shut it. */
  onOpenChange?: (open: boolean) => void;
  /** How many tiers of trays the box has, 1 to 3. @default 3 */
  trays?: number;
  /** How springy the linked arms are, 0 to 1: 0 moves the trays as one stiff unit, 1 lets each lag and bounce at its stop. @default 0.5 */
  arms?: number;
  /** The paint: red enamel, bare steel or green. @default "red" */
  finish?: CantileverFinish;
  /** Play the trays and the latch. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type FinishDef = {
  face: string;
  /** Stamped lettering on the face. */
  ink: string;
  pitch: number;
};

// Paint is pigment: a token's hue at a fixed lightness, the same box on a
// light page and a dark one. Rims and shadows mix toward white or black in
// oklab, which keeps the hue.
const FINISHES: Record<CantileverFinish, FinishDef> = {
  red: {
    face: "oklch(from var(--danger) 0.55 0.17 h)",
    ink: "oklch(from var(--danger) 0.95 0.02 h)",
    pitch: 1,
  },
  steel: {
    face: "oklch(from var(--ink-3) 0.74 0.014 h)",
    ink: "oklch(from var(--ink-3) 0.3 0.02 h)",
    pitch: 1.14,
  },
  green: {
    face: "oklch(from var(--success) 0.5 0.1 h)",
    ink: "oklch(from var(--success) 0.95 0.02 h)",
    pitch: 0.9,
  },
};

const STEEL_LIGHT = "oklch(from var(--ink-3) 0.86 0.008 h)";
const STEEL = "oklch(from var(--ink-3) 0.62 0.012 h)";
const STEEL_DARK = "oklch(from var(--ink-3) 0.42 0.014 h)";

/** The drawing's width; it scales down in a narrower container. */
const W = 300;
const BASE_W = 150;
const BASE_H = 58;
const BASE_X = (W - BASE_W) / 2;
const TRAY_W = 132;
/** A tray: its tools stand 22 px above a 14 px front. */
const TRAY_H = 36;
const LIP = 14;
const TOOL = 28;
/** How far the open trays stay from the drawing's sides. */
const MARGIN = 8;
/** How far a chosen tool lifts out of its tray. */
const LIFT = 18;
/** Pivots sit this far inside the box's top. */
const PIVOT = 8;
/** The pull: how far the grip travels for a full opening. */
const PULL = 70;

type Pt = { x: number; y: number };

type Arc = {
  /** 1 is the tray on the box, `n` the top one. */
  level: number;
  side: -1 | 1;
  pivot: Pt;
  radius: number;
  from: number;
  to: number;
  /** The second arm's offset: parallel, so the tray stays level. */
  offset: number;
};

type Geometry = {
  arcs: Arc[];
  /** The box's top edge, from the drawing's top. */
  top: number;
  height: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const safeId = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "");

/**
 * Where each tray rides. A tray hangs on two equal, parallel arms, so it
 * stays level while the point it hangs from travels a true circle round its
 * pivot. The pivot sits inside the box on the perpendicular bisector of the
 * tray's two places — in the stack and in the staircase — so the arm is
 * exactly as long at both ends. Coordinates are relative to the box's top
 * edge until the last step, which finds how much room the tallest pose needs.
 */
function geometry(n: number): Geometry {
  // Open places, from the tray on the box up: alternate sides, climbing.
  const plans: { side: -1 | 1; lip: number }[] =
    n >= 3
      ? [
          { side: -1, lip: -26 },
          { side: 1, lip: -48 },
          { side: -1, lip: -70 },
        ]
      : n === 2
        ? [
            { side: 1, lip: -26 },
            { side: -1, lip: -26 },
          ]
        : [{ side: -1, lip: -30 }];
  let top = -(n - 1) * LIP - TRAY_H - 12;
  const arcs = plans.map((plan, i): Arc => {
    const level = i + 1;
    const a: Pt = { x: W / 2, y: -(level - 1) * LIP };
    const b: Pt = {
      x: plan.side < 0 ? MARGIN + TRAY_W / 2 : W - MARGIN - TRAY_W / 2,
      y: plan.lip,
    };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const t = (PIVOT - mid.y) / (ny || 1);
    const pivot = { x: mid.x + nx * t, y: PIVOT };
    const radius = Math.hypot(a.x - pivot.x, a.y - pivot.y);
    const from = Math.atan2(a.x - pivot.x, pivot.y - a.y);
    const to = Math.atan2(b.x - pivot.x, pivot.y - b.y);
    // The arc's highest point, if it passes over the pivot, is its peak.
    const peak =
      Math.sign(from) !== Math.sign(to) ? pivot.y - radius : Math.min(a.y, b.y);
    top = Math.min(top, peak - TRAY_H, b.y - TRAY_H - LIFT - 4);
    return {
      level,
      side: plan.side,
      pivot,
      radius,
      from,
      to,
      offset: pivot.x < W / 2 ? 22 : -22,
    };
  });
  top = Math.min(top, -22 - LIFT - 4);
  const boxTop = Math.ceil(-top) + 2;
  return { arcs, top: boxTop, height: boxTop + BASE_H };
}

const GEOMETRY = [geometry(1), geometry(2), geometry(3)];

/** The attachment point at travel `u`: on the circle, at the swept angle. */
const along = (arc: Arc, u: number, boxTop: number): Pt => {
  const phi = arc.from + (arc.to - arc.from) * clamp(u, -0.1, 1.06);
  return {
    x: arc.pivot.x + arc.radius * Math.sin(phi),
    y: boxTop + arc.pivot.y - arc.radius * Math.cos(phi),
  };
};

/**
 * A tool's rise out of its tray over the last half of the tray's travel,
 * each a beat after the one before; every one is standing by the stop.
 */
const riseOf = (u: number, index: number) =>
  clamp01((u - (0.5 + 0.06 * Math.min(index, 4))) / 0.26);

type ToolProps = {
  action: CantileverAction;
  index: number;
  travel: MotionValue<number>;
  active: boolean;
  picked: boolean;
  motionSafe: boolean;
  size: number;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onPick: () => void;
  onPoint: () => void;
};

/** One tool standing in its tray; stowed below the tray's front while shut. */
function Tool({
  action,
  index,
  travel,
  active,
  picked,
  motionSafe,
  size,
  nodeRef,
  onPick,
  onPoint,
}: ToolProps) {
  const y = useTransform(travel, (u) =>
    r2((1 - riseOf(u, index)) * (TOOL + 4)),
  );
  const initials = action.label
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <motion.button
      ref={nodeRef}
      type="button"
      role="menuitem"
      tabIndex={-1}
      aria-label={action.label}
      aria-keyshortcuts={action.shortcut}
      data-tool={action.id}
      onClick={onPick}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") onPoint();
      }}
      onFocus={onPoint}
      className={cn(
        "relative shrink-0 cursor-pointer rounded-2 outline-none",
        // A tool lifted out leaves its ring behind, so it has none.
        !picked &&
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
      )}
      style={{ y, width: size, height: TOOL }}
    >
      <motion.span
        className={cn(
          "flex size-full items-center justify-center rounded-2 border shadow-[0_1px_2px_color-mix(in_oklab,black_22%,transparent)] transition-colors",
          active
            ? "border-cobalt-bright/60 bg-cobalt-wash"
            : "border-hairline-strong bg-card",
          action.tone === "danger"
            ? "text-danger"
            : active
              ? "text-cobalt-bright"
              : "text-foreground",
        )}
        initial={false}
        animate={
          picked && motionSafe ? { y: -LIFT, scale: 1.12 } : { y: 0, scale: 1 }
        }
        transition={picked ? springs.snap : springs.flick}
      >
        {action.icon ? (
          <span
            aria-hidden
            className="flex size-4 shrink-0 items-center justify-center"
          >
            {action.icon}
          </span>
        ) : (
          <span aria-hidden className="font-mono text-[10px] font-medium">
            {initials}
          </span>
        )}
      </motion.span>
    </motion.button>
  );
}

type TrayProps = {
  group: CantileverGroup;
  arc: Arc;
  boxTop: number;
  travel: MotionValue<number>;
  veil: MotionValue<number>;
  fin: FinishDef;
  /** The arms' bar width: stiff arms are stout, springy ones slender. */
  gauge: number;
  active: string | null;
  picked: string | null;
  motionSafe: boolean;
  nodeRef: (id: string) => (node: HTMLButtonElement | null) => void;
  onPick: (id: string) => void;
  onPoint: (id: string) => void;
};

/** A tray on its arms. Its place and the arms' ends are read from `travel`. */
function Tray({
  group,
  arc,
  boxTop,
  travel,
  veil,
  fin,
  gauge,
  active,
  picked,
  motionSafe,
  nodeRef,
  onPick,
  onPoint,
}: TrayProps) {
  const at = useTransform(travel, (u) => along(arc, u, boxTop));
  const x = useTransform(at, (p) => r2(p.x - TRAY_W / 2));
  const y = useTransform(at, (p) => r2(p.y - TRAY_H));
  const arm = (dx: number) => ({
    x1: r2(arc.pivot.x + dx),
    y1: r2(boxTop + arc.pivot.y),
  });
  const front = arm(0);
  const back = arm(arc.offset);
  const x2a = useTransform(at, (p) => r2(p.x));
  const x2b = useTransform(at, (p) => r2(p.x + arc.offset));
  const y2 = useTransform(at, (p) => r2(p.y - 3));
  // The tray's inside shows only once it has lifted off the one below.
  const inside = useTransform(travel, (u) => r2(clamp01(u * 4)));
  const actions = group.actions;
  const size =
    actions.length > 4
      ? Math.floor((TRAY_W - 8 - (actions.length - 1) * 4) / actions.length)
      : TOOL;

  return (
    <>
      <motion.svg
        aria-hidden
        width={W}
        height={boxTop + BASE_H}
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        style={{ opacity: veil }}
      >
        {[back, front].map((end, i) => (
          <g key={i}>
            <motion.line
              x1={end.x1}
              y1={end.y1}
              x2={i === 0 ? x2b : x2a}
              y2={y2}
              strokeWidth={gauge}
              strokeLinecap="round"
              style={{ stroke: STEEL_DARK }}
            />
            <motion.line
              x1={end.x1}
              y1={end.y1}
              x2={i === 0 ? x2b : x2a}
              y2={y2}
              strokeWidth={r2(gauge - 2)}
              strokeLinecap="round"
              style={{ stroke: i === 0 ? STEEL : STEEL_LIGHT }}
            />
            <motion.circle
              cx={i === 0 ? x2b : x2a}
              cy={y2}
              r={2}
              style={{ fill: STEEL_DARK }}
            />
          </g>
        ))}
      </motion.svg>
      <motion.div
        role="group"
        aria-label={group.label}
        className="absolute top-0 left-0 z-10"
        style={{
          x,
          y,
          width: TRAY_W,
          height: TRAY_H,
          opacity: veil,
          // Tools stowed below the front are hidden; one lifted out is not.
          clipPath: `inset(-${LIFT + 16}px -12px 0 -12px)`,
        }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-x-1 bottom-[10px] h-3 rounded-t-1"
          style={{
            background: `color-mix(in oklab, ${fin.face} 42%, black)`,
            opacity: inside,
          }}
        />
        <div className="absolute inset-x-0 bottom-[8px] flex justify-center gap-1">
          {actions.map((action, i) => (
            <Tool
              key={action.id}
              action={action}
              index={i}
              travel={travel}
              active={active === action.id}
              picked={picked === action.id}
              motionSafe={motionSafe}
              size={size}
              nodeRef={nodeRef(action.id)}
              onPick={() => onPick(action.id)}
              onPoint={() => onPoint(action.id)}
            />
          ))}
        </div>
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex items-center justify-center rounded-1 font-mono text-[9px] leading-none font-medium tracking-[0.12em] uppercase"
          style={{
            height: LIP,
            color: fin.ink,
            background: `linear-gradient(180deg, color-mix(in oklab, ${fin.face} 62%, white) 0 2px, ${fin.face} 2px calc(100% - 2px), color-mix(in oklab, ${fin.face} 70%, black) calc(100% - 2px))`,
          }}
        >
          {group.label}
        </span>
      </motion.div>
    </>
  );
}

type GripProps = {
  arc: Arc;
  boxTop: number;
  travel: MotionValue<number>;
  veil: MotionValue<number>;
  live: boolean;
  disabled: boolean;
  handlers: ReturnType<typeof useDrag>;
};

/**
 * The grip on the top tray, outside the menu so it can be pulled while the
 * menu is shut (and inert). It rides the top tray and fades as it opens.
 */
function Grip({
  arc,
  boxTop,
  travel,
  veil,
  live,
  disabled,
  handlers,
}: GripProps) {
  const at = useTransform(travel, (u) => along(arc, u, boxTop));
  const x = useTransform(at, (p) => r2(p.x - 28));
  const y = useTransform(at, (p) => r2(p.y - LIP - 12));
  const opacity = useTransform(
    [travel, veil] as MotionValue<number>[],
    ([u = 0, v = 1]: number[]) => r2((1 - clamp01(u * 3)) * v),
  );
  return (
    <motion.span
      aria-hidden
      {...handlers}
      className={cn(
        "absolute top-0 left-0 z-10 flex h-4 w-14 touch-pan-x items-end justify-center pb-0.5",
        live ? "pointer-events-auto" : "pointer-events-none",
        disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
      )}
      style={{ x, y, opacity }}
    >
      <span
        className="h-2 w-12 rounded-full shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]"
        style={{
          background: `linear-gradient(180deg, ${STEEL_LIGHT}, ${STEEL} 60%, ${STEEL_DARK})`,
        }}
      />
    </motion.span>
  );
}

type Arm = "open" | "shut" | null;

/**
 * An actions menu drawn as a cantilever toolbox. Shut, its trays sit stacked
 * on the box with their tools stowed; the latch plate on the front is the
 * menu button. Opening lifts the trays up and outward on linked arms into a
 * staircase that climbs away from the box, alternating sides, and as each
 * tray clears the one below its tools stand up out of it. Each tray holds one
 * group; groups beyond the trays sit in the box itself.
 *
 * Every tray rides a parallelogram: two equal arms pivot inside the box, so
 * the tray stays level while its hanging point travels a true circle, up over
 * the top of the arc and out. One motion value per tray drives the arc, the
 * arms and the tools; `arms` sets how springy the linkage is, from one stiff
 * unit to trays that lag and bounce at their stops with a clack each. The
 * grip on top can be pulled open 1:1 and thrown. Choosing a tool lifts it
 * clean out, and the box folds shut from the bottom tray up until the latch
 * catches with a click.
 *
 * It is a menu button and a `role="menu"` of tray groups: arrows walk the
 * tools and cross trays, Up and Down move between trays, Home and End jump, a
 * letter jumps ahead, Escape and Tab shut it and hand focus back to the
 * latch. Under reduced motion the trays fade between the stack and the
 * staircase with their tools already standing.
 */
export function CantileverMenu({
  groups,
  label,
  onAction,
  open,
  defaultOpen = false,
  onOpenChange,
  trays = 3,
  arms = 0.5,
  finish = "red",
  sound = false,
  disabled = false,
  className,
}: CantileverMenuProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = safeId(React.useId());
  const triggerId = `${uid}-latch`;
  const menuId = `${uid}-menu`;
  const fin = FINISHES[finish] ?? FINISHES.red;
  const play = clamp01(arms);

  const n = clamp(
    Math.round(trays),
    1,
    Math.max(1, Math.min(3, groups.length)),
  );
  const geo = GEOMETRY[n - 1] ?? GEOMETRY[2];
  const boxTop = geo?.top ?? 132;
  const height = geo?.height ?? 190;
  const trayGroups = groups.slice(0, n);
  const spare = groups.slice(n);
  const boxActions = spare.flatMap((g) => g.actions);
  const boxLabel = spare.map((g) => g.label).join(" and ");

  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const [active, setActive] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [scale, setScale] = React.useState(1);

  // One travel per tray, bottom up; the box's own tools ride the bottom one.
  const u1 = useMotionValue(isOpen ? 1 : 0);
  const u2 = useMotionValue(isOpen ? 1 : 0);
  const u3 = useMotionValue(isOpen ? 1 : 0);
  const veil = useMotionValue(1);
  const travels = React.useMemo(() => [u1, u2, u3], [u1, u2, u3]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const latchRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const tools = React.useRef(new Map<string, HTMLButtonElement>());
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef(new Set<number>());
  const armed = React.useRef<Arm>(null);
  const landed = React.useRef(new Set<number>());
  const pendingFocus = React.useRef<string | null>(null);
  const dragging = React.useRef(false);
  const fling = React.useRef(0);
  /** The pending change came from the visitor, so it may be heard. */
  const byHand = React.useRef(false);
  const typed = React.useRef({ text: "", at: 0 });

  const order = React.useMemo(() => {
    const out: { id: string; tray: number; action: CantileverAction }[] = [];
    trayGroups.forEach((g, i) =>
      g.actions.forEach((action) =>
        out.push({ id: action.id, tray: i, action }),
      ),
    );
    boxActions.forEach((action) =>
      out.push({ id: action.id, tray: trayGroups.length, action }),
    );
    return out;
  }, [trayGroups, boxActions]);

  const nodeRef = (id: string) => (node: HTMLButtonElement | null) => {
    if (node) tools.current.set(id, node);
    else tools.current.delete(id);
  };

  const panOf = (el: Element | null | undefined) => {
    const r = el?.getBoundingClientRect();
    return r ? panFrom(r.left + r.width / 2, null) : 0;
  };

  const halt = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  };

  /**
   * The trays swing to `to`: opening from the top tray down, folding from the
   * bottom tray up, each on the linkage's spring. Stiff arms move as one;
   * springy ones stagger and bounce.
   */
  const swing = (to: boolean, velocity = 0) => {
    halt();
    landed.current.clear();
    const target = to ? 1 : 0;
    if (!motionSafe) {
      // No arcs: the trays fade out of one place and into the other.
      const out = animate(veil, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          travels.forEach((u, k) => u.set(k < n ? target : 0));
          anims.current.push(
            animate(veil, 1, { duration: durations.base, ease: easings.enter }),
          );
        },
      });
      anims.current = [out];
      return;
    }
    veil.set(1);
    const stagger = 0.08 * play;
    const stiffness = to ? lerp(620, 320, play) : lerp(640, 380, play);
    const ratio = to ? lerp(0.9, 0.46, play) : lerp(1, 0.78, play);
    for (let k = 0; k < 3; k += 1) {
      const u = travels[k];
      if (!u) continue;
      if (k >= n) {
        u.set(0);
        continue;
      }
      // Opening, the top tray leaves first; shutting, the bottom one lands first.
      const rank = to ? n - 1 - k : k;
      anims.current.push(
        animate(u, target, {
          type: "spring",
          stiffness,
          damping: 2 * ratio * Math.sqrt(stiffness),
          mass: 1,
          velocity,
          delay: Math.max(0, rank) * stagger,
          restDelta: 0.001,
        }),
      );
    }
  };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  const change = (next: boolean) => {
    if (next === isOpen) return;
    armed.current = next ? "open" : "shut";
    byHand.current = true;
    // A host that refuses the change leaves nothing armed for its own later.
    later(() => {
      byHand.current = false;
    }, 120);
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  // The trays follow the open state, whoever changed it.
  const shown = React.useRef(isOpen);
  const latest = React.useRef({ swing, change });
  React.useEffect(() => {
    latest.current = { swing, change };
  });
  React.useEffect(() => {
    if (shown.current === isOpen) return;
    shown.current = isOpen;
    // A host that opens or shuts the box does it silently.
    if (!byHand.current) armed.current = null;
    byHand.current = false;
    if (dragging.current) return;
    const v = fling.current;
    fling.current = 0;
    latest.current.swing(isOpen, v);
  }, [isOpen]);

  // The clack of each tray at its stop, the click of the latch: only for a
  // box the visitor moved, and timed to the trays themselves.
  React.useEffect(() => {
    const offs = travels.map((u, k) => {
      let last = u.get();
      return u.on("change", (v) => {
        const before = last;
        last = v;
        const level = k + 1;
        if (level > n) return;
        const node = latchRef.current;
        if (armed.current === "open" && before < 0.99 && v >= 0.99) {
          if (landed.current.has(level)) return;
          landed.current.add(level);
          audio.play("clack", {
            pitch: r2(fin.pitch * (0.94 + 0.08 * level)),
            gain: 0.46,
            pan: panOf(node),
          });
        } else if (
          armed.current === "shut" &&
          level === n &&
          before > 0.02 &&
          v <= 0.02
        ) {
          armed.current = null;
          audio.play("click", {
            pitch: r2(fin.pitch),
            gain: 0.6,
            pan: panOf(node),
          });
        }
      });
    });
    return () => {
      for (const off of offs) off();
    };
  }, [audio, fin.pitch, n, travels]);

  // A change in the number of tiers puts every tray straight where the box
  // says it is: the new tiers in place, the dropped ones home.
  React.useEffect(() => {
    for (const a of anims.current) a.stop();
    anims.current = [];
    travels.forEach((u, k) => u.set(k < n && shown.current ? 1 : 0));
    veil.set(1);
  }, [n, travels, veil]);

  /** Focus a tool now if it can take it, or once the menu stops being inert. */
  const reach = (id: string | null) => {
    const node = id ? tools.current.get(id) : menuRef.current;
    if (node && !node.closest("[inert]")) {
      pendingFocus.current = null;
      node.focus({ preventScroll: true });
    } else {
      pendingFocus.current = id ?? "";
    }
  };
  React.useLayoutEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    const node = key ? tools.current.get(key) : menuRef.current;
    if (!node || node.closest("[inert]")) return;
    pendingFocus.current = null;
    node.focus({ preventScroll: true });
  });

  const shut = (focusLatch: boolean) => {
    change(false);
    setActive(null);
    if (focusLatch) latchRef.current?.focus({ preventScroll: true });
  };

  const openWith = (focus: "first" | "last" | "menu") => {
    if (disabled) return;
    change(true);
    const target =
      focus === "first"
        ? (order[0]?.id ?? null)
        : focus === "last"
          ? (order[order.length - 1]?.id ?? null)
          : null;
    setActive(target);
    reach(target);
  };

  const pick = (id: string) => {
    if (disabled || !isOpen || picked) return;
    const node = tools.current.get(id);
    setPicked(id);
    setActive(id);
    audio.play("clack", {
      pitch: r2(fin.pitch * 1.5),
      gain: 0.3,
      pan: panOf(node),
    });
    onAction?.(id);
    // A chosen tool is latched: nothing cancels the fold once it is lifted.
    later(
      () => {
        shut(true);
        later(() => setPicked(null), 320);
      },
      motionSafe ? 280 : 120,
    );
  };

  const onLatchKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      if (isOpen && event.key !== "ArrowDown") shut(false);
      else openWith("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openWith("last");
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      shut(false);
    }
  };

  /** Nearest tool in another tray, by where the tools actually stand. */
  const nearestIn = (tray: number, fromId: string) => {
    const from = tools.current.get(fromId)?.getBoundingClientRect();
    const cx = from ? from.left + from.width / 2 : 0;
    let best: string | null = null;
    let dist = Infinity;
    for (const t of order) {
      if (t.tray !== tray) continue;
      const r = tools.current.get(t.id)?.getBoundingClientRect();
      const d = r ? Math.abs(r.left + r.width / 2 - cx) : Infinity;
      if (d < dist) {
        dist = d;
        best = t.id;
      }
    }
    return best;
  };

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || order.length === 0) return;
    const at = order.findIndex((t) => t.id === active);
    const go = (id: string | null | undefined) => {
      if (!id) return;
      setActive(id);
      tools.current.get(id)?.focus({ preventScroll: true });
    };
    const trayCount = trayGroups.length + (boxActions.length ? 1 : 0);
    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        const from = at === -1 ? (step > 0 ? -1 : 0) : at;
        go(order[(from + step + order.length) % order.length]?.id);
        return;
      }
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (at === -1) {
          go(order[event.key === "ArrowDown" ? 0 : order.length - 1]?.id);
          return;
        }
        const here = order[at];
        if (!here) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        const tray = (here.tray + step + trayCount) % trayCount;
        go(nearestIn(tray, here.id));
        return;
      }
      case "Home":
        event.preventDefault();
        go(order[0]?.id);
        return;
      case "End":
        event.preventDefault();
        go(order[order.length - 1]?.id);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (active) pick(active);
        return;
      case "Escape":
      case "Tab":
        // Handled here, where focus is: the stage must not also see Escape.
        event.preventDefault();
        shut(true);
        return;
    }
    const key = event.key;
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = event.timeStamp;
      const t = typed.current;
      t.text =
        now - t.at < 700 ? t.text + key.toLowerCase() : key.toLowerCase();
      t.at = now;
      const count = order.length;
      for (let k = t.text.length > 1 ? 0 : 1; k <= count; k += 1) {
        const cand = order[(Math.max(0, at) + k) % count];
        if (cand?.action.label.toLowerCase().startsWith(t.text)) {
          event.preventDefault();
          go(cand.id);
          return;
        }
      }
    }
  };

  // The grip: pulled up, every tray follows the hand; thrown, it commits.
  const dragFrom = React.useRef(0);
  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onStart: () => {
      dragging.current = true;
      halt();
      veil.set(1);
      dragFrom.current = u1.get();
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current - offset.y / PULL;
      const u =
        raw > 1
          ? 1 + rubberband(raw - 1, 0.25)
          : raw < 0
            ? rubberband(raw, 0.12)
            : raw;
      const v = Number(u.toFixed(4));
      for (let k = 0; k < n; k += 1) travels[k]?.set(v);
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(u1.get() * PULL, -velocity.y, 0.99) / PULL;
      const want = landing > 0.5;
      const v = -velocity.y / PULL;
      armed.current = want ? "open" : "shut";
      if (want !== isOpen) {
        fling.current = v;
        change(want);
        if (want) {
          setActive(null);
          reach(null);
        }
      } else {
        swing(isOpen, v);
      }
    },
    onCancel: () => {
      dragging.current = false;
      swing(isOpen);
    },
    onTap: () => {
      if (isOpen) shut(false);
      else openWith("menu");
    },
  });

  // A press outside shuts it; so does the page going away.
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !shown.current) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      latest.current.change(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  React.useEffect(() => {
    const pending = timers.current;
    const running = anims;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      for (const a of running.current) a.stop();
      running.current = [];
    };
  }, []);

  // The drawing is 300 px wide; in a narrower container it scales down whole.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const measure = () => {
      const w = node.clientWidth;
      if (w > 0) setScale(Number(Math.min(1, w / W).toFixed(4)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const boxTravel = travels[0] ?? u1;
  const shown2 = active
    ? order.find((t) => t.id === active)?.action
    : undefined;
  const plate = isOpen
    ? shown2
      ? `${shown2.label}${shown2.shortcut ? ` · ${shown2.shortcut}` : ""}`
      : `${order.length} ${order.length === 1 ? "tool" : "tools"}`
    : label;

  const topArc = geo?.arcs[n - 1];
  const topTravel = travels[n - 1] ?? u1;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative w-full max-w-[300px] min-w-0 select-none",
        disabled && "opacity-50",
        className,
      )}
      style={{ height: Math.round(height * scale) }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: W, height, transform: `scale(${scale})` }}
      >
        {/* The box's own compartment, seen when the trays part. */}
        <span
          aria-hidden
          className="absolute rounded-t-1"
          style={{
            left: (W - TRAY_W) / 2 + 2,
            width: TRAY_W - 4,
            top: boxTop - 12,
            height: 12,
            background: `color-mix(in oklab, ${fin.face} 42%, black)`,
          }}
        />
        <div
          ref={menuRef}
          role="menu"
          id={menuId}
          aria-labelledby={triggerId}
          tabIndex={-1}
          inert={!isOpen}
          aria-hidden={isOpen ? undefined : true}
          onKeyDown={onMenuKey}
          className="absolute inset-0 outline-none"
        >
          {/* Drawn from the top tray down, so each lower tray lies over the
              arms of the ones above it. */}
          {trayGroups
            .map((group, i) => ({ group, level: n - i }))
            .reverse()
            .map(({ group, level }) => {
              const arc = geo?.arcs[level - 1];
              const travel = travels[level - 1];
              if (!arc || !travel) return null;
              return (
                <Tray
                  key={group.id}
                  group={group}
                  arc={arc}
                  boxTop={boxTop}
                  travel={travel}
                  veil={veil}
                  fin={fin}
                  gauge={r2(lerp(6, 4, play))}
                  active={active}
                  picked={picked}
                  motionSafe={motionSafe}
                  nodeRef={nodeRef}
                  onPick={pick}
                  onPoint={setActive}
                />
              );
            })}
          {boxActions.length ? (
            <div
              role="group"
              aria-label={boxLabel}
              className="absolute flex justify-center gap-1"
              style={{ left: BASE_X, width: BASE_W, top: boxTop - 22 }}
            >
              {boxActions.map((action, i) => (
                <Tool
                  key={action.id}
                  action={action}
                  index={i}
                  travel={boxTravel}
                  active={active === action.id}
                  picked={picked === action.id}
                  motionSafe={motionSafe}
                  size={TOOL}
                  nodeRef={nodeRef(action.id)}
                  onPick={() => pick(action.id)}
                  onPoint={() => setActive(action.id)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {topArc ? (
          <Grip
            arc={topArc}
            boxTop={boxTop}
            travel={topTravel}
            veil={veil}
            live={!isOpen}
            disabled={disabled}
            handlers={drag}
          />
        ) : null}

        {/* The box itself, in front of the arms' pivots and stowed tools. */}
        <span
          aria-hidden
          className="absolute z-20 rounded-t-1"
          style={{
            left: BASE_X - 2,
            width: BASE_W + 4,
            top: boxTop - 3,
            height: 5,
            background: `color-mix(in oklab, ${fin.face} 62%, white)`,
          }}
        />
        <button
          ref={latchRef}
          type="button"
          id={triggerId}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={menuId}
          disabled={disabled}
          onClick={() => {
            // Keys are handled on the way down; this is a pointer or
            // assistive technology, and toggles the box.
            if (isOpen) shut(false);
            else openWith("menu");
          }}
          onKeyDown={onLatchKey}
          onKeyUp={(event) => {
            if (event.key === " ") event.preventDefault();
          }}
          className={cn(
            "absolute z-20 flex flex-col items-center justify-end gap-1 rounded-b-2 pb-2 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          style={{
            left: BASE_X,
            width: BASE_W,
            top: boxTop + 2,
            height: BASE_H - 2,
            background: `linear-gradient(180deg, ${fin.face}, color-mix(in oklab, ${fin.face} 82%, black))`,
            boxShadow: `inset 0 -3px 0 color-mix(in oklab, ${fin.face} 70%, black)`,
          }}
        >
          {/* The hasp: shut, its loop sits over the staple. */}
          <span
            aria-hidden
            className="absolute top-1 left-1/2 flex h-4 w-6 -translate-x-1/2 items-start justify-center rounded-b-1"
            style={{
              background: `linear-gradient(180deg, ${STEEL_LIGHT}, ${STEEL})`,
              boxShadow: `0 1px 1px color-mix(in oklab, black 30%, transparent)`,
            }}
          >
            <motion.span
              className="mt-1 h-1.5 w-2.5 rounded-full border-2"
              style={{ borderColor: STEEL_DARK }}
              initial={false}
              animate={{ opacity: isOpen ? 0.35 : 1 }}
              transition={{ duration: durations.fast }}
            />
          </span>
          <span
            aria-hidden
            className="flex h-5 max-w-[124px] items-center rounded-1 border border-hairline-strong bg-card px-2 shadow-[inset_0_1px_2px_color-mix(in_oklab,black_16%,transparent)]"
          >
            <span className="truncate font-mono text-[10px] tracking-[0.04em] text-foreground">
              {plate}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
