"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PlumbState =
  "resting" | "true" | "swinging" | "orbiting" | "dropped";

export type PlumbCursorProps = {
  /** Thread length, px; kept to 70% of the box's height. @default 84 */
  length?: number;
  /** How quickly a swing dies, 0 (it swings for ages) to 1 (it settles in one swing). @default 0.3 */
  damping?: number;
  /** The bob's weight, 0.5 to 2: a heavy bob is bigger, coasts longer against the air and stretches the thread further when it drops. @default 1 */
  weight?: number;
  /** How much thread a click pays out, as a share of the length, 0 to 1.5. @default 0.6 */
  drop?: number;
  /** How long the bob hangs at the end of its thread before it is reeled back, ms. @default 900 */
  hold?: number;
  /** Gravity, as a multiple of the house value, 0.5 to 2. @default 1 */
  gravity?: number;
  /** The thread's colour. @default "var(--ink-2)" */
  color?: string;
  /** The bob's metal, a pigment that reads on both themes. @default brass, from the warn token's hue */
  bobColor?: string;
  /** Where the nail sits that the bob hangs from with no pointer, as fractions of the box. @default [0.9, 0.12] */
  restAt?: readonly [number, number];
  /** Drop a hairline to the floor when the bob hangs dead vertical. @default true */
  plumbLine?: boolean;
  /** Keyboard focus inside moves the thread over the focused control. @default true */
  followFocus?: boolean;
  /** On touch, the bob hangs from the finger while it is down. @default true */
  touch?: boolean;
  /** The bob stays on its nail. @default false */
  disabled?: boolean;
  /** What the bob is doing: on its nail, hanging true, swinging, orbiting the pointer, or dropped to the end of its thread. */
  onStateChange?: (state: PlumbState) => void;
  /** The content the bob hangs over; it stays fully interactive. */
  children?: React.ReactNode;
  className?: string;
};

const STEP = 1 / 240;
const G = 2200;
/** The thread's stretch stiffness, per unit of weight: it rings at about 60 rad/s. */
const THREAD = 3600;
/** The most a carried pivot accelerates, px/s², at gravity 1: below g. */
const CARRY = 1500;
/** The bob's length at weight 1, px, tip to eye. */
const BOB = 24;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Knobs = {
  length: number;
  damping: number;
  weight: number;
  drop: number;
  hold: number;
  gravity: number;
  restAt: readonly [number, number];
  plumbLine: boolean;
  motionSafe: boolean;
};

type Parts = {
  thread: SVGPathElement;
  bob: SVGGElement;
  line: SVGGElement;
  lineDrop: SVGLineElement;
  tick: SVGPathElement;
};

type Plumb = {
  configure: (k: Knobs) => void;
  resize: (w: number, h: number) => void;
  pointer: (x: number, y: number) => void;
  focusAt: (x: number, y: number) => void;
  away: () => void;
  drop: () => void;
  wake: () => void;
  dispose: () => void;
};

/**
 * The plumb outside React: a point mass under gravity on a one-sided
 * elastic thread, a pivot that follows the hand, and a reel.
 */
function createPlumb(
  root: HTMLElement,
  parts: Parts,
  visible: { current: boolean },
  report: { current: (s: PlumbState) => void },
): Plumb {
  let k: Knobs | null = null;
  let w = 0;
  let h = 0;
  let raf = 0;
  let last = 0;
  let carry = 0;
  let disposed = false;
  let live = false;
  let holdTimer = 0;
  let state: PlumbState = "resting";
  let overTop = 0;
  /** The pivot, its velocity, and where it is headed. */
  const pivot = { x: 0, y: 0, vx: 0, vy: 0 };
  const goal = { x: 0, y: 0 };
  let leash: "locked" | "glide" | "drift" = "drift";
  let source: "nail" | "pointer" | "focus" = "nail";
  /** The bob. */
  const bob = { x: 0, y: 0, vx: 0, vy: 0 };
  /** The thread's rest length now, its speed, and where the reel is taking it. */
  const reel = { len: 0, v: 0, to: 0 };
  let dropped = false;

  const length = () => Math.max(20, Math.min(k?.length ?? 84, h * 0.7));
  const weight = () => clamp(k?.weight ?? 1, 0.5, 2);
  const scale = () => 0.8 + 0.25 * weight();
  const nail = () => {
    const r = k?.restAt ?? [0.9, 0.12];
    return { x: clamp01(r[0]) * w, y: clamp01(r[1]) * h };
  };

  const say = (next: PlumbState) => {
    if (next === state) return;
    state = next;
    report.current(next);
  };

  const hangStill = () => {
    bob.x = pivot.x;
    bob.y = pivot.y + reel.len;
    bob.vx = 0;
    bob.vy = 0;
  };

  const draw = () => {
    if (!visible.current || w < 1) return;
    const dx = bob.x - pivot.x;
    const dy = bob.y - pivot.y;
    const d = Math.hypot(dx, dy);
    // Taut, the thread is straight; slack, it sags into a curve.
    const slack = reel.len - d;
    if (slack > 0.6) {
      const sag = Math.min(reel.len * 0.5, Math.sqrt(slack * reel.len) * 0.5);
      const mx = (pivot.x + bob.x) / 2;
      const my = (pivot.y + bob.y) / 2 + sag;
      parts.thread.setAttribute(
        "d",
        `M${r2(pivot.x)} ${r2(pivot.y)} Q${r2(mx)} ${r2(my)} ${r2(bob.x)} ${r2(bob.y)}`,
      );
    } else {
      parts.thread.setAttribute(
        "d",
        `M${r2(pivot.x)} ${r2(pivot.y)} L${r2(bob.x)} ${r2(bob.y)}`,
      );
    }
    const angle = d > 0.5 ? (Math.atan2(dx, dy) * 180) / Math.PI : 0;
    parts.bob.setAttribute(
      "transform",
      `translate(${r2(bob.x)} ${r2(bob.y)}) rotate(${r2(-angle)}) scale(${r2(scale())})`,
    );
    // True: a hairline from the tip to the floor, and a tick where it lands.
    const tip = bob.y + BOB * scale();
    const isTrue = state === "true" && (k?.plumbLine ?? true) && tip < h - 6;
    parts.lineDrop.setAttribute("x1", String(r2(bob.x)));
    parts.lineDrop.setAttribute("x2", String(r2(bob.x)));
    parts.lineDrop.setAttribute("y1", String(r2(tip + 3)));
    parts.lineDrop.setAttribute("y2", String(r2(h - 4)));
    parts.tick.setAttribute(
      "d",
      `M${r2(bob.x - 5)} ${r2(h - 4)} H${r2(bob.x + 5)}`,
    );
    parts.line.style.opacity = isTrue ? "1" : "0";
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  /** Where a locked pivot began this frame: the hand's move is spread over its steps. */
  const frameFrom = { x: 0, y: 0 };

  const step = (dt: number, along: number) => {
    const kn = k;
    if (!kn) return;
    // The pivot: 1:1 with a hand once it has caught up, on a spring otherwise.
    if (leash === "locked") {
      const nx = lerp(frameFrom.x, goal.x, along);
      const ny = lerp(frameFrom.y, goal.y, along);
      pivot.vx = (nx - pivot.x) / dt;
      pivot.vy = (ny - pivot.y) / dt;
      pivot.x = nx;
      pivot.y = ny;
    } else {
      const S = leash === "glide" ? springs.glide : springs.drift;
      let ax =
        (S.stiffness * (goal.x - pivot.x) - S.damping * pivot.vx) / S.mass;
      let ay =
        (S.stiffness * (goal.y - pivot.y) - S.damping * pivot.vy) / S.mass;
      // A hand carrying a plumb never jerks it harder than gravity pulls,
      // so a long carry swings the bob across instead of throwing it over.
      const a = Math.hypot(ax, ay);
      const cap = CARRY * clamp(kn.gravity, 0.5, 2);
      if (a > cap) {
        ax *= cap / a;
        ay *= cap / a;
      }
      pivot.vx += ax * dt;
      pivot.vy += ay * dt;
      pivot.x += pivot.vx * dt;
      pivot.y += pivot.vy * dt;
      if (
        source === "pointer" &&
        Math.hypot(goal.x - pivot.x, goal.y - pivot.y) < 1.5
      ) {
        leash = "locked";
      }
    }
    // The reel: paying out is instant, reeling in rides the glide spring.
    if (reel.len < reel.to) {
      reel.len = reel.to;
      reel.v = 0;
    } else if (reel.len > reel.to) {
      const S = springs.glide;
      const a =
        (S.stiffness * (reel.to - reel.len) - S.damping * reel.v) / S.mass;
      reel.v += a * dt;
      reel.len += reel.v * dt;
      if (Math.abs(reel.len - reel.to) < 0.05 && Math.abs(reel.v) < 1) {
        reel.len = reel.to;
        reel.v = 0;
      }
    }
    // The bob: gravity, air, and the thread when it is taut.
    const m = weight();
    const g = G * clamp(kn.gravity, 0.5, 2);
    const air = lerp(0.15, 4.5, clamp01(kn.damping)) / m;
    let ax = -air * bob.vx;
    let ay = g - air * bob.vy;
    const dx = bob.x - pivot.x;
    const dy = bob.y - pivot.y;
    const d = Math.hypot(dx, dy) || 0.0001;
    if (d > reel.len) {
      const ux = dx / d;
      const uy = dy / d;
      const stretch = d - reel.len;
      const radial = (bob.vx - pivot.vx) * ux + (bob.vy - pivot.vy) * uy;
      const ks = THREAD;
      const cs = 2 * 0.22 * Math.sqrt(THREAD * m);
      const pull = (ks * stretch + cs * radial) / m;
      if (pull > 0) {
        ax -= pull * ux;
        ay -= pull * uy;
      }
    }
    bob.vx += ax * dt;
    bob.vy += ay * dt;
    bob.x += bob.vx * dt;
    bob.y += bob.vy * dt;
  };

  /** Which state the bob is in, and whether anything still moves. */
  const assess = (): boolean => {
    const dx = bob.x - pivot.x;
    const dy = bob.y - pivot.y;
    const angle = Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
    if (angle > 105) overTop = 0.45;
    const speed = Math.hypot(bob.vx, bob.vy);
    const pivotMoving =
      leash !== "locked" &&
      (Math.hypot(goal.x - pivot.x, goal.y - pivot.y) > 0.1 ||
        Math.hypot(pivot.vx, pivot.vy) > 1);
    const hanging =
      !pivotMoving && reel.len === reel.to && Math.abs(dy - reel.len) < 3;
    // It reads as true a little before the last hair of swing has gone.
    const looksTrue = hanging && speed < 10 && angle < 1;
    const settled = hanging && speed < 1.2 && angle < 0.4;
    if (dropped) say("dropped");
    else if (overTop > 0) say("orbiting");
    else if (!looksTrue) say("swinging");
    else say(source === "nail" ? "resting" : "true");
    if (settled) {
      // Rest exactly true, the thread stretched by the bob's own weight.
      bob.x = pivot.x;
      bob.y =
        pivot.y + reel.len + (G * clamp(k?.gravity ?? 1, 0.5, 2)) / THREAD;
      bob.vx = 0;
      bob.vy = 0;
      pivot.vx = 0;
      pivot.vy = 0;
    }
    return !settled || dropped || overTop > 0;
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed || !visible.current || document.hidden || !k) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving: boolean;
    if (!k.motionSafe) {
      pivot.x = goal.x;
      pivot.y = goal.y;
      pivot.vx = 0;
      pivot.vy = 0;
      reel.len = reel.to;
      hangStill();
      moving = false;
      say(dropped ? "dropped" : source === "nail" ? "resting" : "true");
    } else {
      carry += dt;
      const n = Math.min(16, Math.floor(carry / STEP));
      carry -= n * STEP;
      if (n === 16) carry = 0;
      frameFrom.x = pivot.x;
      frameFrom.y = pivot.y;
      for (let i = 0; i < n; i += 1) step(STEP, (i + 1) / n);
      overTop = Math.max(0, overTop - dt);
      moving = assess();
    }
    draw();
    if (moving) raf = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || raf || !visible.current || document.hidden) return;
    raf = window.requestAnimationFrame(tick);
  };

  const toNail = () => {
    const p = nail();
    goal.x = p.x;
    goal.y = p.y;
    source = "nail";
    // Carried to the nail or a control on the drift spring: slow enough
    // that the bob swings across rather than being flung.
    leash = "drift";
  };

  return {
    configure(next) {
      const was = k;
      k = next;
      if (!was) return;
      if (!dropped) reel.to = length();
      if (source === "nail") toNail();
      kick();
    },
    resize(nw, nh) {
      if (nw < 1 || nh < 1) return;
      const first = w === 0;
      w = nw;
      h = nh;
      if (first) {
        reel.to = length();
        reel.len = reel.to;
        toNail();
        pivot.x = goal.x;
        pivot.y = goal.y;
        hangStill();
        say("resting");
      } else {
        if (!dropped) reel.to = length();
        if (source === "nail") toNail();
      }
      draw();
      kick();
    },
    pointer(x, y) {
      if (source !== "pointer") {
        source = "pointer";
        // The thread is handed from wherever it hangs to the hand on the
        // glide spring, then follows it 1:1.
        leash = "glide";
      }
      goal.x = x;
      goal.y = y;
      kick();
    },
    focusAt(x, y) {
      if (source === "pointer") return;
      source = "focus";
      leash = "drift";
      goal.x = x;
      goal.y = y - reel.to - BOB * scale() - 6;
      kick();
    },
    away() {
      toNail();
      kick();
    },
    drop() {
      if (!k) return;
      window.clearTimeout(holdTimer);
      dropped = true;
      reel.to = length() * (1 + clamp(k.drop, 0, 1.5));
      say("dropped");
      kick();
      holdTimer = window.setTimeout(
        () => {
          holdTimer = 0;
          dropped = false;
          reel.to = length();
          kick();
        },
        Math.max(0, k.hold) + (k.motionSafe ? 260 : 0),
      );
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      window.clearTimeout(holdTimer);
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/**
 * A cursor effect bounded to its own box: a small brass plumb bob hangs
 * from the pointer on a fine thread. The system cursor stays — the thread
 * hangs from it — and the painted layer never takes the pointer, so the
 * content underneath stays fully interactive.
 *
 * The bob is a point mass under gravity on a thread that only pulls when it
 * is taut, with a little stretch, integrated at 240 Hz: every movement
 * swings it and it settles slowly to dead vertical, at which a hairline
 * drops from its tip to the floor; fast circles pump it into an orbit round
 * the pointer; and a click pays out the reel, so it falls freely to the end
 * of its thread and bounces on the stretch before it is reeled back up on
 * the glide spring. With no pointer it hangs from a nail; the thread is
 * handed to the pointer on the glide spring and carried back to the nail,
 * or over a focused control, on the drift spring. Keyboard
 * focus inside carries the thread over the focused control, and Enter drops
 * it as a click does. Under reduced motion it hangs dead vertical wherever
 * it is held, at once.
 */
export function PlumbCursor({
  length = 84,
  damping = 0.3,
  weight = 1,
  drop = 0.6,
  hold = 900,
  gravity = 1,
  color = "var(--ink-2)",
  bobColor = "oklch(from var(--warn) 0.78 0.12 h)",
  restAt = [0.9, 0.12],
  plumbLine = true,
  followFocus = true,
  touch = true,
  disabled = false,
  onStateChange,
  children,
  className,
}: PlumbCursorProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const brass = `${uid}-brass`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const threadRef = React.useRef<SVGPathElement | null>(null);
  const bobRef = React.useRef<SVGGElement | null>(null);
  const lineRef = React.useRef<SVGGElement | null>(null);
  const dropRef = React.useRef<SVGLineElement | null>(null);
  const tickRef = React.useRef<SVGPathElement | null>(null);
  const plumb = React.useRef<Plumb | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef<(s: PlumbState) => void>(() => {});
  const pressed = React.useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  const rx = clamp01(restAt[0]);
  const ry = clamp01(restAt[1]);

  const knobs: Knobs = {
    length,
    damping,
    weight,
    drop,
    hold,
    gravity,
    restAt: [rx, ry],
    plumbLine,
    motionSafe,
  };
  const latest = React.useRef(knobs);

  React.useEffect(() => {
    report.current = (s) => onStateChange?.(s);
    latest.current = knobs;
    plumb.current?.configure(knobs);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const thread = threadRef.current;
    const bob = bobRef.current;
    const line = lineRef.current;
    const lineDrop = dropRef.current;
    const tick = tickRef.current;
    if (!root || !thread || !bob || !line || !lineDrop || !tick) return;
    const p = createPlumb(
      root,
      { thread, bob, line, lineDrop, tick },
      visible,
      report,
    );
    p.configure(latest.current);
    plumb.current = p;
    p.resize(root.clientWidth, root.clientHeight);
    return () => {
      p.dispose();
      if (plumb.current === p) plumb.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) plumb.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() =>
      plumb.current?.resize(node.clientWidth, node.clientHeight),
    );
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) plumb.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const rect = root.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /** Back to the focused control if focus is inside, otherwise to the nail. */
  const release = () => {
    const root = rootRef.current;
    const active = document.activeElement;
    const p = plumb.current;
    if (!p) return;
    p.away();
    if (
      followFocus &&
      root &&
      active instanceof HTMLElement &&
      active !== root &&
      root.contains(active) &&
      active.matches(":focus-visible")
    ) {
      hangOver(active);
    }
  };

  const hangOver = (el: HTMLElement) => {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    plumb.current?.focusAt(r.left + r.width / 2 - box.left, r.top - box.top);
  };

  const live = !disabled;

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!live) return;
        if (event.pointerType === "touch" && (!touch || event.buttons === 0))
          return;
        const p = local(event.clientX, event.clientY);
        plumb.current?.pointer(p.x, p.y);
      }}
      onPointerDown={(event) => {
        if (!live) return;
        if (event.pointerType === "touch") {
          if (!touch) return;
          const p = local(event.clientX, event.clientY);
          pressed.current = {
            x: event.clientX,
            y: event.clientY,
            t: event.timeStamp,
          };
          plumb.current?.pointer(p.x, p.y);
          return;
        }
        if (event.button !== 0) return;
        const p = local(event.clientX, event.clientY);
        plumb.current?.pointer(p.x, p.y);
        plumb.current?.drop();
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") return;
        const from = pressed.current;
        pressed.current = null;
        // A quick tap drops the bob; lifting the finger hands it back.
        if (
          from &&
          event.timeStamp - from.t < 260 &&
          Math.hypot(event.clientX - from.x, event.clientY - from.y) < 8
        ) {
          plumb.current?.drop();
        }
        release();
      }}
      onPointerCancel={(event) => {
        if (event.pointerType === "touch") {
          pressed.current = null;
          release();
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") release();
      }}
      onFocus={(event) => {
        if (!live || !followFocus) return;
        const el = event.target;
        if (el instanceof HTMLElement && el.matches(":focus-visible")) {
          hangOver(el);
        }
      }}
      onBlur={(event) => {
        if (!live) return;
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          plumb.current?.away();
        }
      }}
      onKeyDown={(event) => {
        if (!live || !followFocus || event.repeat) return;
        // A press made from the keyboard drops the bob as a click would.
        if (event.key === "Enter" || event.key === " ") plumb.current?.drop();
      }}
      className={cn(
        "group/plumb-cursor relative isolate",
        live && touch && "touch-none",
        className,
      )}
    >
      {children}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full overflow-hidden"
      >
        <defs>
          <linearGradient id={brass} x1="0" y1="0" x2="1" y2="0">
            <stop
              offset="0"
              style={{
                stopColor: `color-mix(in oklab, ${bobColor} 58%, black)`,
              }}
            />
            <stop
              offset="0.32"
              style={{
                stopColor: `color-mix(in oklab, ${bobColor} 55%, white)`,
              }}
            />
            <stop offset="0.6" style={{ stopColor: bobColor }} />
            <stop
              offset="1"
              style={{
                stopColor: `color-mix(in oklab, ${bobColor} 50%, black)`,
              }}
            />
          </linearGradient>
        </defs>
        {/* The nail the bob hangs from when no hand holds it. */}
        <svg x={`${r2(rx * 100)}%`} y={`${r2(ry * 100)}%`} overflow="visible">
          <circle r={2.6} className="fill-surface-2 stroke-hairline-strong" />
          <circle r={0.9} className="fill-ink-3" />
          {/* The designed first frame: hanging true from the nail. */}
          <g className="transition-opacity duration-300 group-data-live/plumb-cursor:opacity-0">
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={length}
              strokeWidth={1}
              style={{ stroke: color }}
            />
            <g
              transform={`translate(0 ${length}) scale(${r2(0.8 + 0.25 * clamp(weight, 0.5, 2))})`}
            >
              <BobShape fill={`url(#${brass})`} />
            </g>
          </g>
        </svg>
        <g className="opacity-0 transition-opacity duration-300 group-data-live/plumb-cursor:opacity-100">
          <g
            ref={lineRef}
            className="transition-opacity duration-300"
            style={{ opacity: 0 }}
          >
            <line
              ref={dropRef}
              strokeWidth={1}
              strokeDasharray="2 3"
              className="stroke-ink-3"
            />
            <path ref={tickRef} strokeWidth={1} className="stroke-ink-3" />
          </g>
          <path
            ref={threadRef}
            fill="none"
            strokeWidth={1}
            strokeLinecap="round"
            style={{ stroke: color }}
          />
          <g ref={bobRef}>
            <BobShape fill={`url(#${brass})`} />
          </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * The bob, eye at the origin and point down +y: a turned brass body with a
 * collar and a steel tip, BOB px long at scale 1.
 */
function BobShape({ fill }: { fill: string }) {
  return (
    <>
      <circle
        cx={0}
        cy={1.6}
        r={1.5}
        fill="none"
        strokeWidth={0.9}
        className="stroke-ink-2"
      />
      <rect
        x={-3.6}
        y={3}
        width={7.2}
        height={2.6}
        rx={0.9}
        fill={fill}
        className="stroke-ink-3"
        strokeWidth={0.4}
      />
      <path
        d="M-5.4 5.8 H5.4 V9.4 L1.1 20.6 Q0 22 -1.1 20.6 L-5.4 9.4 Z"
        fill={fill}
        className="stroke-ink-3"
        strokeWidth={0.4}
      />
      <path
        d="M-1.1 20.6 L0 24 L1.1 20.6 Q0 22 -1.1 20.6 Z"
        className="fill-ink-2"
      />
      <path
        d="M-2.6 7 V12.5"
        stroke="white"
        strokeOpacity={0.55}
        strokeWidth={0.9}
        strokeLinecap="round"
      />
    </>
  );
}
