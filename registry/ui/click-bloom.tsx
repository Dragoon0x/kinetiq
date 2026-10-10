"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ClickBloomTrigger = "press" | "click";

export type ClickBloomHandle = {
  /** Opens a bloom at [x, y] in the box's own pixels (its centre when omitted). Silent: sound only ever answers the visitor. */
  bloom: (x?: number, y?: number) => void;
};

export type ClickBloomProps = {
  /** What blooms when clicked. It stays fully interactive; the petals never take a click. */
  children?: React.ReactNode;
  /** Petals in each bloom, 3 to 12. @default 7 */
  petals?: number;
  /** How far the petals are thrown when they let go, as a multiple of the house throw. @default 1 */
  spread?: number;
  /** How hard petals and seeds fall, in px/s². @default 700 */
  gravity?: number;
  /** Seeds thrown with each bloom, 0 to 12; heavier and quicker than the petals. @default 4 */
  seeds?: number;
  /** A petal's length, in CSS pixels. @default 12 */
  size?: number;
  /** Air resistance, 0 (petals drop like stones) to 1 (they float and drift). @default 0.5 */
  drag?: number;
  /** How hard petals turn over as they fall, 0 (they slide down flat) to 1. @default 0.6 */
  tumble?: number;
  /** How long a bloom lives, in ms, before its last petal has faded. @default 1400 */
  duration?: number;
  /** The blooms' colours, any CSS colours resolved on the element; each bloom takes the next. @default pigments of --accent, --signal and --warn */
  colors?: string[];
  /** The most blooms in the air at once; the oldest retires early to make room. @default 8 */
  max?: number;
  /** Bloom on the press itself, or on the completed click. Keyboard clicks bloom either way. @default "press" */
  trigger?: ClickBloomTrigger;
  /** No blooms. @default false */
  disabled?: boolean;
  /** Fires with each bloom the visitor opens, at its point in the box's own pixels. */
  onBloom?: (point: { x: number; y: number }) => void;
  /** A soft pop with each bloom the visitor opens. Off unless asked for. @default false */
  sound?: boolean;
  /** Seed for every petal's throw, spin and lifetime. @default 11 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Classes for the box. */
  className?: string;
  /** Exposes `bloom()`. */
  ref?: React.Ref<ClickBloomHandle>;
};

type Rgb = [number, number, number];

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

const hash = (i: number, seed: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** A unit step response of a damped spring, in closed form (ζ < 1). */
const stepResponse = (
  t: number,
  spring: { stiffness: number; damping: number; mass: number },
) => {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(spring.stiffness / spring.mass);
  const zeta = spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return (
    1 -
    Math.exp(-zeta * w0 * t) *
      (Math.cos(wd * t) +
        (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t))
  );
};

/** Each bloom's slots: up to 12 petals and 12 seeds. */
const SLOT = 24;
/** When a bloom's petals let go, after it has opened. */
const RELEASE = 0.18;
const RING_LIFE = 0.48;

/**
 * A wrapper whose every click opens a small flower. On the press its petals
 * unfold out of the point — each swinging from edge-on to flat and sliding
 * out to its ring on springs.snap's response, the pollen at its heart popping
 * on springs.recoil's — then, a beat later and each in its own moment, the
 * petals let go: thrown outward by `spread`, they fall under `gravity`
 * through air that slows them by `drag`, tumbling in 3D on two axes so they
 * thin to an edge, show their darker backs, and slip sideways as they turn
 * over, while a few seeds burst out heavier and faster. Rapid clicks layer
 * blooms up to `max`. Keyboard clicks (Enter or Space on anything inside)
 * bloom from the centre of what was activated. Under reduced motion a soft
 * ring appears at the point and fades instead.
 */
export function ClickBloom({
  children,
  petals = 7,
  spread = 1,
  gravity = 700,
  seeds = 4,
  size = 12,
  drag = 0.5,
  tumble = 0.6,
  duration = 1400,
  colors,
  max = 8,
  trigger = "press",
  disabled = false,
  onBloom,
  sound = false,
  seed = 11,
  dpr = 2,
  className,
  ref,
}: ClickBloomProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);

  const palette = (
    colors && colors.length > 0
      ? colors
      : [
          "oklch(from var(--accent) 0.72 0.13 h)",
          "oklch(from var(--signal) 0.78 0.12 h)",
          "oklch(from var(--warn) 0.82 0.12 h)",
        ]
  ).join("|");
  const slots = Math.round(clamp(max, 1, 24));

  const params = React.useRef({
    petals,
    spread,
    gravity,
    seeds,
    size,
    drag,
    tumble,
    duration,
    seed,
    dpr,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      petals,
      spread,
      gravity,
      seeds,
      size,
      drag,
      tumble,
      duration,
      seed,
      dpr,
      motionSafe,
    };
  });

  const api = React.useRef<{
    open: (x: number, y: number) => void;
    restyle: () => void;
  } | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      bloom: (x, y) => {
        const root = rootRef.current;
        if (!root || disabled) return;
        api.current?.open(
          x ?? root.clientWidth / 2,
          y ?? root.clientHeight / 2,
        );
      },
    }),
    [disabled],
  );

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const g = ctx;
    const read = rgbReader();

    let w = 0;
    let h = 0;
    let ratio = 1;
    let raf = 0;
    let last = 0;
    let inView = false;
    let clock = 0;
    let count = 0;

    // The pool: every bloom owns a fixed run of SLOT particles.
    const total = slots * SLOT;
    const px = new Float32Array(total);
    const py = new Float32Array(total);
    const vx = new Float32Array(total);
    const vy = new Float32Array(total);
    const rz = new Float32Array(total);
    const wz = new Float32Array(total);
    const rx = new Float32Array(total);
    const wx = new Float32Array(total);
    const age = new Float32Array(total);
    const life = new Float32Array(total);
    const release = new Float32Array(total);
    const ring = new Float32Array(total);
    const scale = new Float32Array(total);
    const jolt = new Float32Array(total);
    const kind = new Uint8Array(total);
    const alive = new Uint8Array(total);
    // The blooms themselves: where, when, which colour, reduced or not.
    const bx = new Float32Array(slots);
    const by = new Float32Array(slots);
    const bt = new Float32Array(slots);
    const bc = new Uint8Array(slots);
    const bOn = new Uint8Array(slots);
    const bStill = new Uint8Array(slots);
    let next = 0;

    let base: string[] = [];
    let light: string[] = [];
    let deep: string[] = [];

    const restyle = () => {
      const probe = probeRef.current;
      if (!probe) return;
      const list = palette.split("|");
      base = [];
      light = [];
      deep = [];
      const rgb = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      for (const colour of list) {
        // The blush toward white and the back toward black are mixed in
        // oklab, which keeps the hue where oklch would lose it.
        probe.style.color = colour;
        base.push(rgb(read(getComputedStyle(probe).color)));
        probe.style.color = `color-mix(in oklab, ${colour} 55%, white)`;
        light.push(rgb(read(getComputedStyle(probe).color)));
        probe.style.color = `color-mix(in oklab, ${colour} 74%, black)`;
        deep.push(rgb(read(getComputedStyle(probe).color)));
      }
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
      ratio = Math.min(
        2,
        Math.max(1, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
    };

    const open = (x: number, y: number) => {
      const p = params.current;
      const slot = next;
      next = (next + 1) % slots;
      // The bloom whose slot comes up next is the oldest: it retires early.
      const after = next * SLOT;
      for (let k = after; k < after + SLOT; k += 1) {
        if (alive[k]) life[k] = Math.min(life[k]!, age[k]! + 0.3);
      }
      const n0 = slot * SLOT;
      for (let k = n0; k < n0 + SLOT; k += 1) alive[k] = 0;
      const b = count;
      count += 1;
      bx[slot] = x;
      by[slot] = y;
      bt[slot] = clock;
      bc[slot] = b % Math.max(1, base.length);
      bOn[slot] = 1;
      bStill[slot] = p.motionSafe ? 0 : 1;
      if (!p.motionSafe) {
        wake();
        return;
      }
      const seedBase = p.seed * 977 + b * 131;
      const nPetals = Math.round(clamp(p.petals, 3, 12));
      const nSeeds = Math.round(clamp(p.seeds, 0, 12));
      const lifeS = Math.max(0.4, p.duration / 1000);
      const spin = clamp(p.tumble, 0, 1);
      const turn = hash(1, seedBase) * TAU;
      for (let i = 0; i < nPetals; i += 1) {
        const k = n0 + i;
        const r = (n: number) => hash(i * 7 + n, seedBase);
        alive[k] = 1;
        kind[k] = 0;
        age[k] = 0;
        life[k] = lifeS * (0.8 + 0.4 * r(1));
        release[k] = RELEASE + 0.08 * r(2);
        ring[k] = turn + (i / nPetals) * TAU + (r(3) - 0.5) * 0.3;
        scale[k] = 0.85 + 0.3 * r(4);
        jolt[k] = r(8);
        px[k] = x;
        py[k] = y;
        vx[k] = 0;
        vy[k] = 0;
        rz[k] = ring[k]!;
        wz[k] = (r(5) - 0.5) * 2 * lerp(1.5, 7, spin);
        rx[k] = 0;
        wx[k] = (r(6) > 0.5 ? 1 : -1) * lerp(1, 11, spin) * (0.6 + 0.4 * r(7));
      }
      for (let i = 0; i < nSeeds; i += 1) {
        const k = n0 + 12 + i;
        const r = (n: number) => hash(i * 5 + n + 400, seedBase);
        alive[k] = 1;
        kind[k] = 1;
        age[k] = 0;
        life[k] = lifeS * (0.7 + 0.3 * r(1));
        release[k] = RELEASE * 0.6 + 0.05 * r(2);
        ring[k] = turn + r(3) * TAU;
        scale[k] = 0.8 + 0.5 * r(4);
        jolt[k] = r(8);
        px[k] = x;
        py[k] = y;
        vx[k] = 0;
        vy[k] = 0;
        rz[k] = 0;
        wz[k] = 0;
        rx[k] = 0;
        wx[k] = 0;
      }
      wake();
    };

    const step = (dt: number) => {
      const p = params.current;
      const thrust = 210 * clamp(p.spread, 0.1, 4);
      const gy = p.gravity;
      const air = lerp(0.6, 4.5, clamp(p.drag, 0, 1));
      const sway = clamp(p.tumble, 0, 1);
      const L = Math.max(3, p.size);
      for (let k = 0; k < total; k += 1) {
        if (!alive[k]) continue;
        const a0 = age[k]!;
        const a = a0 + dt;
        age[k] = a;
        if (a >= life[k]!) {
          alive[k] = 0;
          continue;
        }
        const rel = release[k]!;
        if (a < rel) {
          // Still on the flower: it opens in place (drawn from age).
          continue;
        }
        if (a0 < rel) {
          // The moment it lets go: thrown out along its ring, a little up.
          const r = jolt[k]!;
          const speed =
            kind[k] === 1 ? thrust * (1.3 + 0.6 * r) : thrust * (0.7 + 0.5 * r);
          const open = stepResponse(rel, springs.snap) * (L * 0.62 * scale[k]!);
          px[k] = px[k]! + Math.cos(ring[k]!) * open;
          py[k] = py[k]! + Math.sin(ring[k]!) * open;
          vx[k] = Math.cos(ring[k]!) * speed;
          vy[k] = Math.sin(ring[k]!) * speed - thrust * 0.35;
        }
        if (kind[k] === 1) {
          const kAir = air * 0.25;
          vx[k] = vx[k]! * Math.exp(-kAir * dt);
          vy[k] = (vy[k]! + gy * dt) * Math.exp(-kAir * dt);
        } else {
          // A flat petal catches the air; an edge-on one slices through it,
          // and the turning sends it sideways.
          const face = Math.abs(Math.cos(rx[k]!));
          const kAir = air * (0.6 + 1.4 * face);
          vy[k] = (vy[k]! + gy * dt) * Math.exp(-kAir * dt);
          vx[k] =
            (vx[k]! +
              Math.sin(2 * rx[k]!) * Math.abs(vy[k]!) * sway * 2.2 * dt) *
            Math.exp(-air * dt);
          rx[k] = rx[k]! + wx[k]! * dt;
          rz[k] = rz[k]! + wz[k]! * dt;
        }
        px[k] = px[k]! + vx[k]! * dt;
        py[k] = py[k]! + vy[k]! * dt;
      }
      for (let s = 0; s < slots; s += 1) {
        if (!bOn[s]) continue;
        const t = clock - bt[s]!;
        if (bStill[s] ? t > RING_LIFE : t > 0.7) bOn[s] = 0;
      }
    };

    const petal = (L: number, W: number) => {
      g.beginPath();
      g.moveTo(-L / 2, 0);
      g.bezierCurveTo(-L / 6, -W, L / 2, -W * 0.8, L / 2, 0);
      g.bezierCurveTo(L / 2, W * 0.8, -L / 6, W, -L / 2, 0);
      g.fill();
    };

    const draw = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      const p = params.current;
      const L0 = Math.max(3, p.size);
      for (let s = 0; s < slots; s += 1) {
        if (!bOn[s]) continue;
        const t = clock - bt[s]!;
        const c = bc[s]!;
        g.setTransform(ratio, 0, 0, ratio, 0, 0);
        if (bStill[s]) {
          // Reduced motion: a soft ring, in and out on opacity alone.
          const fadeIn = clamp(t / 0.12, 0, 1);
          const fadeOut = 1 - clamp((t - 0.2) / (RING_LIFE - 0.2), 0, 1);
          g.globalAlpha = 0.7 * fadeIn * fadeOut;
          g.strokeStyle = base[c] ?? "rgb(120, 120, 120)";
          g.lineWidth = 2;
          g.beginPath();
          g.arc(bx[s]!, by[s]!, 14 * clamp(p.spread, 0.4, 2), 0, TAU);
          g.stroke();
          continue;
        }
        // The pollen at the heart pops on the recoil spring, then fades.
        const pop = stepResponse(t, springs.recoil);
        const fade = 1 - clamp((t - 0.3) / 0.4, 0, 1);
        if (fade > 0) {
          g.globalAlpha = fade;
          g.fillStyle = light[c] ?? "rgb(220, 220, 220)";
          g.beginPath();
          g.arc(bx[s]!, by[s]!, Math.max(0, 2.4 * pop), 0, TAU);
          g.fill();
        }
      }
      for (let k = 0; k < total; k += 1) {
        if (!alive[k]) continue;
        const s = Math.floor(k / SLOT);
        const c = bc[s]!;
        const a = age[k]!;
        const lf = life[k]!;
        const alpha = 1 - clamp((a - lf * 0.6) / (lf * 0.4), 0, 1);
        const L = L0 * scale[k]!;
        if (kind[k] === 1) {
          if (a < release[k]!) continue;
          g.setTransform(ratio, 0, 0, ratio, 0, 0);
          g.globalAlpha = alpha;
          g.fillStyle = deep[c] ?? "rgb(80, 80, 80)";
          g.beginPath();
          g.arc(px[k]!, py[k]!, 1.2 * scale[k]!, 0, TAU);
          g.fill();
          continue;
        }
        let x = px[k]!;
        let y = py[k]!;
        let lengthScale = 1;
        let widthScale = 1;
        let angle = rz[k]!;
        if (a < release[k]!) {
          // Opening: out of edge-on, out to its ring.
          const u = stepResponse(a, springs.snap);
          const out = u * L * 0.62;
          x += Math.cos(ring[k]!) * out;
          y += Math.sin(ring[k]!) * out;
          lengthScale = Math.sin((Math.PI / 2) * clamp(u, 0, 1.2));
          angle = ring[k]!;
        } else {
          widthScale = Math.cos(rx[k]!);
        }
        const cs = Math.cos(angle) * ratio;
        const sn = Math.sin(angle) * ratio;
        g.setTransform(cs, sn, -sn, cs, x * ratio, y * ratio);
        g.globalAlpha = alpha;
        const W = L * 0.42 * Math.abs(widthScale);
        const len = L * Math.max(0.05, lengthScale);
        // A petal shows its darker back as it turns over.
        g.fillStyle =
          (widthScale < 0 ? deep[c] : base[c]) ?? "rgb(150, 150, 150)";
        petal(len, Math.max(0.3, W));
        if (widthScale > 0.35) {
          g.globalAlpha = alpha * 0.55;
          g.fillStyle = light[c] ?? "rgb(220, 220, 220)";
          g.save();
          g.translate(-len * 0.08, 0);
          petal(len * 0.55, W * 0.45);
          g.restore();
        }
      }
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
    };

    const anything = () => {
      for (let s = 0; s < slots; s += 1) if (bOn[s]) return true;
      for (let k = 0; k < total; k += 1) if (alive[k]) return true;
      return false;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!inView || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      clock += dt;
      step(dt);
      draw();
      if (anything()) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    function wake() {
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    api.current = {
      open,
      restyle: () => {
        restyle();
        draw();
      },
    };

    restyle();
    const sizer = new ResizeObserver(() => {
      layout();
      draw();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, [slots, palette]);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  /** A bloom the visitor opened: drawn, reported and, if asked for, heard. */
  const visit = (clientX: number, clientY: number) => {
    if (disabled) return;
    const at = local(clientX, clientY);
    api.current?.open(at.x, at.y);
    onBloom?.({ x: Math.round(at.x), y: Math.round(at.y) });
    audio.play("pop", {
      pitch: 0.82 + clamp(petals, 3, 12) * 0.035,
      gain: 0.5,
      pan: panFrom(clientX, rootRef.current),
    });
  };
  const pressed = React.useRef(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressed.current = false;
    if (trigger !== "press" || disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A finger may be starting a scroll: touch blooms on the tap instead.
    if (event.pointerType === "touch") return;
    pressed.current = true;
    visit(event.clientX, event.clientY);
  };
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.detail === 0) {
      // A click with no pointer behind it — Enter or Space — blooms from the
      // middle of whatever was activated.
      const target = event.target as HTMLElement;
      const rect = target.getBoundingClientRect();
      visit(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return;
    }
    if (pressed.current) {
      pressed.current = false;
      return;
    }
    visit(event.clientX, event.clientY);
  };

  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onClick={onClick}
      className={cn("relative isolate overflow-clip", className)}
    >
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
      />
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.restyle()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
