"use client";

import * as React from "react";

import { animate } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MagpieCursorProps = {
  /** The area the magpie works in. Mark anything collectable with `attribute` (default `data-magpie`). */
  children?: React.ReactNode;
  /** How far apart the tags hang in depth, px: 0 is a flat pile, 60 a long string into the page. @default 22 */
  depth?: number;
  /** How loosely the stack trails the cursor, 0 (tight) to 1 (loose and swinging). @default 0.5 */
  lag?: number;
  /** The most tags it carries, 1 to 8; past that the oldest lets go and falls away. @default 5 */
  maxTags?: number;
  /** The collected labels, newest first (controlled). */
  value?: string[];
  /** The labels it starts with (uncontrolled). @default [] */
  defaultValue?: string[];
  /** Fires from the hover, focus, click or key that changed the stack, with the new labels. */
  onValueChange?: (labels: string[]) => void;
  /** The attribute that marks a collectable item; its value is the label, or the item's text when empty. @default "data-magpie" */
  attribute?: string;
  /** Where the stack hangs from the pointer, px. @default [14, 18] */
  offset?: [number, number];
  /** How far the ends of a dropped arc tip, degrees. @default 11 */
  spread?: number;
  /** How long a dropped arc rests before it gathers up, ms. @default 1400 */
  hold?: number;
  /** A click drops the stack where you stand. @default true */
  dropOnClick?: boolean;
  /** Keyboard focus on a tagged item collects it; Enter or Space there drops the stack. @default true */
  followFocus?: boolean;
  /** The pointer collects. @default true */
  interactive?: boolean;
  /** A label was picked up, or brought back to the front. */
  onPick?: (label: string) => void;
  /** The stack was dropped, with the labels it held, newest first. */
  onDrop?: (labels: string[]) => void;
  /** Classes for the box. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** How long a gathering fan takes to shrink away, s. */
const GATHER_TIME = 0.42;
/** How long a tag that let go takes to fall out of sight, s. */
const LEAVE_TIME = 0.55;

type Role = "stack" | "fan" | "leave";
type Item = { key: string; label: string };

type Body = {
  key: string;
  label: string;
  role: Role;
  el: HTMLElement | null;
  w: number;
  h: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  vrot: number;
  scale: number;
  opacity: number;
  index: number;
  tx: number;
  ty: number;
  trot: number;
  gx: number;
  gy: number;
  gatherAt: number;
};

type Config = {
  depth: number;
  lag: number;
  offset: [number, number];
  spread: number;
  hold: number;
  motionSafe: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  register: (key: string, el: HTMLElement | null) => void;
  setStack: (labels: string[]) => void;
  arriveFrom: (label: string, rect: DOMRect) => void;
  anchor: (x: number, y: number) => void;
  head: () => { x: number; y: number };
  fan: (
    labels: string[],
    keys: string[],
    x: number,
    y: number,
    hold: number,
  ) => void;
  leave: (label: string, key: string) => void;
  outline: (rect: DOMRect) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
};

/** The last spring step's result: written in place, so a frame allocates nothing. */
const step2 = { v: 0, w: 0 };

function springStep(
  value: number,
  vel: number,
  target: number,
  k: number,
  c: number,
  m: number,
  dt: number,
): void {
  let v = value;
  let w = vel;
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i += 1) {
    w += ((k * (target - v) - c * w) / m) * h;
    v += w * h;
  }
  step2.v = v;
  step2.w = w;
}

function createMagpie(root: HTMLDivElement, ring: HTMLDivElement): Engine {
  let cfg: Config | null = null;
  const bodies = new Map<string, Body>();
  const arrivals = new Map<string, { x: number; y: number }>();
  let stack: string[] = [];
  const anchorAt = { x: 0, y: 0, set: false };
  const box = { w: 0, h: 0 };
  let raf = 0;
  let last = 0;
  let clock = 0;
  let visible = false;
  let disposed = false;
  let ringAnim: ReturnType<typeof animate> | null = null;

  const headAt = () => {
    const off = cfg?.offset ?? [14, 18];
    return {
      x: clamp(anchorAt.x + off[0], 0, box.w),
      y: clamp(anchorAt.y + off[1], 0, box.h),
    };
  };

  const fresh = (key: string, label: string, role: Role): Body => ({
    key,
    label,
    role,
    el: null,
    w: 64,
    h: 24,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rot: 0,
    vrot: 0,
    scale: 1,
    opacity: 0,
    index: 0,
    tx: 0,
    ty: 0,
    trot: 0,
    gx: 0,
    gy: 0,
    gatherAt: -1,
  });

  const write = (b: Body) => {
    const el = b.el;
    if (!el) return;
    const motion = cfg?.motionSafe ?? true;
    const flat = b.role === "fan";
    const tiltY = motion && !flat ? clamp(b.vx * 0.022, -24, 24) : 0;
    const tiltX = motion && !flat ? clamp(-b.vy * 0.022, -24, 24) : 0;
    el.style.transform = `translate3d(${r1(b.x - b.w / 2)}px, ${r1(b.y - b.h / 2)}px, ${r1(b.z)}px) rotateX(${r1(tiltX)}deg) rotateY(${r1(tiltY)}deg) rotate(${r1(b.rot)}deg) scale(${r3(b.scale)})`;
    el.style.opacity = String(r3(clamp(b.opacity, 0, 1)));
    // DOM order never changes; depth order is z-index alone.
    el.style.zIndex = String(b.role === "fan" ? 60 - b.index : 30 - b.index);
  };

  /** One frame of every tag; returns how much is still moving. */
  const step = (dt: number) => {
    const c = cfg;
    if (!c) return 0;
    const motion = c.motionSafe;
    const lag = clamp(c.lag, 0, 1);
    const depth = clamp(c.depth, 0, 80);
    let energy = 0;
    let front: Body | null = null;
    const h = headAt();
    const hang = anchorAt.y > box.h * 0.55 ? -1 : 1;
    stack.forEach((label, index) => {
      const b = bodies.get(`s-${label}`);
      if (!b) return;
      b.index = index;
      // The head hangs off the pointer; each next tag hangs off the one in
      // front, a little down and to the right, a little further back.
      // Each tag hangs below the one in front, far enough down that its
      // label still reads; near the bottom of the box the string hangs up.
      const ax: number = front ? front.x + 6 + depth * 0.1 : h.x + b.w / 2;
      const ay: number = front ? front.y + hang * (b.h * 0.72) : h.y + b.h / 2;
      const az = -depth * index;
      const fade = 1 - index * 0.1;
      if (!motion) {
        b.x = ax;
        b.y = ay;
        b.z = az;
        b.vx = 0;
        b.vy = 0;
        b.rot = 0;
      } else {
        // Each tag on its own spring with the snap character (ζ 0.82),
        // stiffness falling with `lag` and down the string.
        const k = (900 - 740 * lag) * (1 - 0.07 * index);
        const damp = 2 * 0.82 * Math.sqrt(k);
        springStep(b.x, b.vx, ax, k, damp, 1, dt);
        b.x = step2.v;
        b.vx = step2.w;
        springStep(b.y, b.vy, ay, k, damp, 1, dt);
        b.y = step2.v;
        b.vy = step2.w;
        const s = springs.snap;
        springStep(b.z, b.vz, az, s.stiffness, s.damping, s.mass, dt);
        b.z = step2.v;
        b.vz = step2.w;
        springStep(
          b.rot,
          b.vrot,
          clamp(b.vx * 0.012, -9, 9),
          s.stiffness,
          s.damping,
          s.mass,
          dt,
        );
        b.rot = step2.v;
        b.vrot = step2.w;
        b.scale += (1 - b.scale) * (1 - Math.exp(-dt / 0.08));
      }
      b.opacity = Math.min(fade, b.opacity + dt / durations.fast);
      energy = Math.max(
        energy,
        Math.abs(b.vx) +
          Math.abs(b.vy) +
          Math.abs(b.vz) * 0.2 +
          Math.abs(b.vrot),
        (Math.abs(b.x - ax) + Math.abs(b.y - ay) + Math.abs(b.z - az)) * 10,
        Math.abs(fade - b.opacity) * 100,
      );
      front = b;
      write(b);
    });
    for (const b of bodies.values()) {
      if (b.role === "stack") continue;
      if (b.role === "leave") {
        // Let go: it falls away, turning, and fades on the way out.
        if (motion) {
          b.vy += 1400 * dt;
          b.y += b.vy * dt;
          b.x += b.vx * dt;
          b.rot += b.vrot * dt;
        }
        b.opacity -= dt / LEAVE_TIME;
        if (b.opacity > 0) energy = Math.max(energy, 100);
        write(b);
        continue;
      }
      // The fan lands on recoil (two small bounces), holds, then gathers on
      // glide to the point it was dropped at and fades.
      const gathering = b.gatherAt >= 0 && clock >= b.gatherAt;
      const tx = gathering ? b.gx : b.tx;
      const ty = gathering ? b.gy : b.ty;
      const trot = gathering ? 0 : b.trot;
      if (!motion) {
        b.x = tx;
        b.y = ty;
        b.z = 0;
        b.rot = trot;
      } else {
        const s = gathering ? springs.glide : springs.recoil;
        springStep(b.x, b.vx, tx, s.stiffness, s.damping, s.mass, dt);
        b.x = step2.v;
        b.vx = step2.w;
        springStep(b.y, b.vy, ty, s.stiffness, s.damping, s.mass, dt);
        b.y = step2.v;
        b.vy = step2.w;
        springStep(b.z, b.vz, 0, s.stiffness, s.damping, s.mass, dt);
        b.z = step2.v;
        b.vz = step2.w;
        springStep(b.rot, b.vrot, trot, s.stiffness, s.damping, s.mass, dt);
        b.rot = step2.v;
        b.vrot = step2.w;
      }
      if (gathering) {
        const u = clamp((clock - b.gatherAt) / GATHER_TIME, 0, 1);
        b.opacity = Math.min(b.opacity, 1 - u * u);
        if (motion) b.scale = 1 - 0.35 * u;
      } else b.opacity = Math.min(1, b.opacity + dt / durations.fast);
      if (b.opacity > 0.005) energy = Math.max(energy, 100);
      write(b);
    }
    return energy;
  };

  const canRun = () => visible && !document.hidden && !disposed;
  const tick = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    const energy = step(dt);
    if (canRun() && energy > 0.4) raf = requestAnimationFrame(tick);
  };
  const wake = () => {
    if (raf || !canRun()) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const halt = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const centreOf = (rect: DOMRect) => {
    const r = root.getBoundingClientRect();
    return {
      x: rect.left - r.left - root.clientLeft + rect.width / 2,
      y: rect.top - r.top - root.clientTop + rect.height / 2,
    };
  };

  return {
    configure: (next) => {
      cfg = next;
      wake();
    },
    register: (key, el) => {
      let b = bodies.get(key);
      if (!el) {
        if (b) b.el = null;
        return;
      }
      if (!b) {
        const label = el.dataset.label ?? "";
        b = fresh(key, label, "stack");
        bodies.set(key, b);
        const from = arrivals.get(label);
        arrivals.delete(label);
        const h = headAt();
        b.x = from ? from.x : h.x + 24;
        b.y = from ? from.y : h.y + 12;
        if (cfg?.motionSafe && from) {
          // Picked up: it lifts toward you off the item before it joins.
          b.vz = 620;
          b.scale = 1.06;
        }
      }
      b.el = el;
      b.w = el.offsetWidth || b.w;
      b.h = el.offsetHeight || b.h;
      write(b);
      wake();
    },
    setStack: (labels) => {
      stack = labels;
      for (const [key, b] of bodies) {
        if (b.role === "stack" && !labels.includes(b.label)) bodies.delete(key);
      }
      wake();
    },
    arriveFrom: (label, rect) => {
      arrivals.set(label, centreOf(rect));
    },
    anchor: (x, y) => {
      anchorAt.x = x;
      anchorAt.y = y;
      anchorAt.set = true;
      wake();
    },
    head: () => headAt(),
    fan: (labels, keys, x, y, hold) => {
      const c = cfg;
      if (!c) return;
      const n = labels.length;
      // Dealt in a shallow arc, side by side so every label reads: oldest
      // at the left, newest at the right, the ends tipped by `spread` and
      // dipping a little like a smile. Too wide for the box, they overlap.
      const widths = labels.map((label) => bodies.get(`s-${label}`)?.w ?? 72);
      const gap = 8;
      const natural = widths.reduce((sum, w) => sum + w + gap, -gap);
      const room = Math.max(40, box.w - 16);
      const squeeze =
        natural > room
          ? (room - (widths.at(-1) ?? 72)) /
            Math.max(1, natural - (widths.at(-1) ?? 72))
          : 1;
      const total = natural > room ? room : natural;
      const cx = clamp(
        x,
        total / 2 + 8,
        Math.max(total / 2 + 8, box.w - total / 2 - 8),
      );
      const cy = clamp(y, 20, Math.max(20, box.h - 36));
      let run = cx - total / 2;
      const order = labels.map((label, i) => ({ label, i })).reverse();
      order.forEach(({ label, i }, k) => {
        const w = widths[i] ?? 72;
        const from = bodies.get(`s-${label}`);
        const key = keys[i] ?? `f-${label}`;
        const b = fresh(key, label, "fan");
        if (from) {
          b.x = from.x;
          b.y = from.y;
          b.z = from.z;
          b.vx = from.vx;
          b.vy = from.vy;
          b.rot = from.rot;
          b.opacity = from.opacity;
          b.w = from.w;
          b.h = from.h;
        } else {
          b.x = cx;
          b.y = cy;
        }
        const px = run + w / 2;
        run += (w + gap) * squeeze;
        const u = total > 0 ? clamp((px - cx) / (total / 2), -1, 1) : 0;
        b.index = n - 1 - k;
        b.tx = px;
        b.ty = clamp(
          cy + u * u * 14,
          b.h / 2 + 2,
          Math.max(b.h / 2 + 2, box.h - b.h / 2 - 2),
        );
        b.trot = u * clamp(c.spread, 0, 30);
        b.gx = cx;
        b.gy = cy;
        b.gatherAt = clock + hold / 1000;
        bodies.set(key, b);
      });
      wake();
    },
    leave: (label, key) => {
      const from = bodies.get(`s-${label}`);
      const b = fresh(key, label, "leave");
      if (from) {
        b.x = from.x;
        b.y = from.y;
        b.z = from.z;
        b.opacity = from.opacity;
        b.w = from.w;
        b.h = from.h;
        b.index = from.index;
      }
      b.vx = 40;
      b.vy = -140;
      b.vrot = 150;
      bodies.set(key, b);
      wake();
    },
    outline: (rect) => {
      const p = centreOf(rect);
      ring.style.left = `${r1(p.x - rect.width / 2 - 3)}px`;
      ring.style.top = `${r1(p.y - rect.height / 2 - 3)}px`;
      ring.style.width = `${r1(rect.width + 6)}px`;
      ring.style.height = `${r1(rect.height + 6)}px`;
      ringAnim?.stop();
      // The item's outline contracts into the tag leaving it.
      ringAnim = animate(
        ring,
        cfg?.motionSafe
          ? { opacity: [0.9, 0], scale: [1, 0.86] }
          : { opacity: [0.9, 0] },
        { duration: durations.slow, ease: easings.exit },
      );
    },
    resize: () => {
      box.w = root.clientWidth;
      box.h = root.clientHeight;
      if (!anchorAt.set) {
        anchorAt.x = box.w * 0.62;
        anchorAt.y = box.h * 0.3;
      }
      wake();
    },
    setVisible: (on) => {
      visible = on;
      if (on) wake();
      else halt();
    },
    dispose: () => {
      disposed = true;
      halt();
      ringAnim?.stop();
    },
  };
}

/**
 * A cursor that collects. Point at anything marked `data-magpie` and its
 * label lifts off the item as a small paper tag — starting at the item's own
 * box, rising toward you — and flies to the head of a stack hanging off the
 * cursor in 3D: each tag follows the one in front on its own spring, softer
 * down the string by `lag`, sitting `depth` px further back, tilting with its
 * own speed. Point at a label already collected and it comes back to the
 * front; past `maxTags` the oldest lets go and falls away. Click and the
 * stack is dealt out where you stand, side by side in a shallow arc so every
 * label reads, landing on springs.recoil; it holds for `hold` ms, then
 * gathers up on springs.glide and clears. Keyboard focus on a tagged item collects it, Enter or Space there
 * drops the fan, and Escape gathers the stack away. Under reduced motion
 * the tags appear in place with a fade and move 1:1 with the pointer.
 */
export function MagpieCursor({
  children,
  depth = 22,
  lag = 0.5,
  maxTags = 5,
  value,
  defaultValue = [],
  onValueChange,
  attribute = "data-magpie",
  offset = [14, 18],
  spread = 11,
  hold = 1400,
  dropOnClick = true,
  followFocus = true,
  interactive = true,
  onPick,
  onDrop,
  className,
}: MagpieCursorProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const ringRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const [fan, setFan] = React.useState<Item[]>([]);
  const [leaving, setLeaving] = React.useState<Item[]>([]);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const serial = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  const over = React.useRef<Element | null>(null);
  const lastType = React.useRef("mouse");

  const cap = clamp(Math.round(maxTags), 1, 8);
  const labels = (value ?? own).slice(0, cap);
  const labelsKey = labels.join("\u0000");
  const labelsRef = React.useRef(labels);

  const cfg: Config = { depth, lag, offset, spread, hold, motionSafe };
  const cfgRef = React.useRef(cfg);
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    labelsRef.current = labels;
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const overlay = overlayRef.current;
    const ring = ringRef.current;
    if (!root || !overlay || !ring) return;
    const e = createMagpie(root, ring);
    engine.current = e;
    e.configure(cfgRef.current);
    e.resize();
    e.setStack(labelsRef.current);
    // Tags already on the page (a default stack) join the engine now.
    for (const el of overlay.querySelectorAll<HTMLElement>("[data-key]")) {
      e.register(el.dataset.key ?? "", el);
    }
    e.setVisible(visible.current);
    const pending = timers.current;
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  React.useLayoutEffect(() => {
    engine.current?.setStack(labelsRef.current);
  }, [labelsKey]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visible.current);
    });
    watcher.observe(node);
    const onVisibility = () =>
      engine.current?.setVisible(visible.current && !document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      visible.current = false;
    };
  }, []);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };

  const commit = (next: string[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const tagOf = (node: EventTarget | null): HTMLElement | null => {
    if (!(node instanceof Element)) return null;
    const root = rootRef.current;
    try {
      const el = node.closest(`[${attribute}]`);
      return el instanceof HTMLElement && root?.contains(el) ? el : null;
    } catch {
      return null;
    }
  };

  const labelOf = (el: HTMLElement) =>
    (el.getAttribute(attribute) || el.textContent || "").trim().slice(0, 48);

  const pick = (el: HTMLElement) => {
    const label = labelOf(el);
    if (!label) return;
    const current = labelsRef.current;
    if (current[0] === label) return;
    const rect = el.getBoundingClientRect();
    if (!current.includes(label)) {
      engine.current?.arriveFrom(label, rect);
      engine.current?.outline(rect);
    }
    let next = [label, ...current.filter((l) => l !== label)];
    if (next.length > cap) {
      const gone = next.slice(cap);
      next = next.slice(0, cap);
      const items = gone.map((l) => {
        serial.current += 1;
        const key = `l-${serial.current}`;
        engine.current?.leave(l, key);
        return { key, label: l };
      });
      setLeaving((prev) => [...prev, ...items]);
      const keys = items.map((i) => i.key);
      later(LEAVE_TIME * 1000 + 80, () =>
        setLeaving((prev) => prev.filter((i) => !keys.includes(i.key))),
      );
    }
    commit(next);
    onPick?.(label);
    say(
      `Picked ${label}. ${next.length} ${next.length === 1 ? "label" : "labels"}.`,
    );
  };

  const drop = (
    x: number,
    y: number,
    holdFor: number,
    words: "dropped" | "cleared",
  ) => {
    const current = labelsRef.current;
    if (current.length === 0) return false;
    const items = current.map((label) => {
      serial.current += 1;
      return { key: `f-${serial.current}`, label };
    });
    const keys = items.map((i) => i.key);
    engine.current?.fan(current, keys, x, y, holdFor);
    setFan((prev) => [...prev, ...items]);
    commit([]);
    if (words === "dropped") onDrop?.(current);
    const n = current.length;
    say(
      words === "dropped"
        ? `Dropped ${n} ${n === 1 ? "label" : "labels"}.`
        : "Stack cleared.",
    );
    later(holdFor + GATHER_TIME * 1000 + 120, () =>
      setFan((prev) => prev.filter((i) => !keys.includes(i.key))),
    );
    return true;
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.anchor(at.x, at.y);
    const el = tagOf(event.target);
    if (el !== over.current) {
      over.current = el;
      if (el) pick(el);
    }
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = tagOf(event.target);
    if (event.detail === 0) {
      // Enter or Space on a tagged item: drop the fan where focus is.
      if (!followFocus || !el) return;
      const rect = el.getBoundingClientRect();
      const r = rootRef.current?.getBoundingClientRect();
      if (!r) return;
      drop(
        rect.left - r.left + rect.width / 2,
        rect.top - r.top + rect.height / 2,
        hold,
        "dropped",
      );
      return;
    }
    const at = local(event.clientX, event.clientY);
    if (lastType.current === "touch") {
      // No hover on glass: a tap on an item collects it, a tap elsewhere drops.
      engine.current?.anchor(at.x, at.y);
      if (el) {
        pick(el);
        return;
      }
    }
    if (dropOnClick) drop(at.x, at.y, hold, "dropped");
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!followFocus || !interactive) return;
    const el = tagOf(event.target);
    if (!el || !el.matches(":focus-visible")) return;
    const rect = el.getBoundingClientRect();
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    // The stack hangs off the focused item's right edge, as it would off a pointer there.
    engine.current?.anchor(
      rect.right - r.left - 10,
      rect.top - r.top + rect.height / 2 - 8,
    );
    pick(el);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || labelsRef.current.length === 0) return;
    // Escape is ours while there is a stack to clear: the stage must not close.
    event.preventDefault();
    const h = engine.current?.head() ?? { x: 0, y: 0 };
    drop(h.x, h.y, 0, "cleared");
  };

  const tag = (item: Item, role: Role) => (
    <div
      key={item.key}
      data-key={item.key}
      data-label={item.label}
      data-role={role}
      ref={(el) => engine.current?.register(item.key, el)}
      className="absolute top-0 left-0 flex h-6 max-w-40 items-center gap-1.5 rounded-2 border border-hairline-strong bg-popover pr-2 pl-1.5 text-[11px] font-medium text-foreground opacity-0 shadow-[0_6px_14px_-6px_oklch(0_0_0/0.4)] [backface-visibility:hidden]"
    >
      <span className="size-2 shrink-0 rounded-full border border-hairline-strong bg-background" />
      <span className="truncate">{item.label}</span>
    </div>
  );

  // Stack tags render in a fixed (alphabetical) order so a re-order never
  // moves DOM nodes; their depth order is z-index alone.
  const stackItems = [...labels]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((label) => ({ key: `s-${label}`, label }));

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerOver={onPointerMove}
      onPointerDown={(event) => {
        lastType.current = event.pointerType;
      }}
      onPointerLeave={() => {
        over.current = null;
      }}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        "group/magpie-cursor relative isolate overflow-clip",
        className,
      )}
    >
      <div className="relative z-0 size-full">{children}</div>
      <div
        ref={overlayRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 overflow-clip [perspective:700px]"
      >
        <div
          ref={ringRef}
          className="absolute rounded-2 border border-cobalt-bright opacity-0"
        />
        {leaving.map((item) => tag(item, "leave"))}
        {fan.map((item) => tag(item, "fan"))}
        {stackItems.map((item) => tag(item, "stack"))}
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
