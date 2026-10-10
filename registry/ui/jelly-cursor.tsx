"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type JellyCursorTone = "cobalt" | "mint" | "ember" | "ink";

export type JellyCursorProps = {
  /** The area the jelly lives in. Its buttons and links keep every click, focus and key. */
  children?: React.ReactNode;
  /** The jelly ball's diameter, in px. @default 28 */
  size?: number;
  /** How long it jiggles once it stops: 0 settles at once (flick), 0.5 bounces twice (recoil), 1 keeps on jiggling. @default 0.5 */
  wobble?: number;
  /** Its colour: a named pigment from the theme tokens, or any CSS colour. @default "cobalt" */
  color?: JellyCursorTone | (string & {});
  /** How far it draws out behind a fast pointer, 0 to 1. @default 0.6 */
  stretch?: number;
  /** How deep a press squashes it, 0 to 1. @default 0.5 */
  squash?: number;
  /** Which children it wraps itself round, as a CSS selector. @default "button, a[href], [role='button'], [data-jelly]" */
  targets?: string;
  /** Room it leaves round a wrapped child, in px; a bigger jelly is puffier. @default size × 0.22 (6 at the default size) */
  padding?: number;
  /** How far it clings to a child you leave before it lets go, 0 to 1. @default 0.5 */
  stickiness?: number;
  /** Its body's opacity while wrapped round a child, so the label reads through, 0 to 1. @default 0.16 */
  tint?: number;
  /** The child it rests on with no pointer inside, as a CSS selector; with none it hides. @default "[data-jelly-rest]" */
  restOn?: string;
  /** Hide the system cursor while the jelly leads (never over text fields, never after a key press). @default true */
  hideCursor?: boolean;
  /** Keyboard focus on a child wraps the jelly round it; Enter or Space squashes it. @default true */
  followFocus?: boolean;
  /** The pointer leads the jelly (mouse and pen; a tap moves it to the tapped child). @default true */
  interactive?: boolean;
  /** Fires when the child it is wrapped round changes, with that child or null. */
  onTargetChange?: (target: HTMLElement | null) => void;
  /** Classes for the box. */
  className?: string;
};

const TONES: Record<JellyCursorTone, string> = {
  // A filled body is pigment: token hue and chroma at a fixed lightness.
  cobalt: "oklch(from var(--accent-bright) 0.6 0.19 h)",
  mint: "oklch(from var(--signal) 0.76 0.13 h)",
  ember: "oklch(from var(--danger) 0.66 0.19 h)",
  // Ink is the one that should flip with the theme: dark on paper, pale at night.
  ink: "var(--ink)",
};

const N = 40;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const f1 = (v: number) => (Math.round(v * 10) / 10).toString();
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Distance from a box's centre to its rounded edge along a direction. */
function boxRay(
  dx: number,
  dy: number,
  hw: number,
  hh: number,
  rc: number,
): number {
  const iw = Math.max(0, hw - rc);
  const ih = Math.max(0, hh - rc);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > 1e-6) {
    const t = hw / ax;
    if (t * ay <= ih) return t;
  }
  if (ay > 1e-6) {
    const t = hh / ay;
    if (t * ax <= iw) return t;
  }
  // The corner arc: |t·d − c| = rc, c the corner circle's centre.
  const cx = iw;
  const cy = ih;
  const dc = ax * cx + ay * cy;
  const disc = dc * dc - (cx * cx + cy * cy) + rc * rc;
  return dc + Math.sqrt(Math.max(0, disc));
}

/**
 * Inside its own box the pointer becomes a small ball of jelly — a real soft
 * body: a ring of 40 points, each on a damped spring toward a target outline
 * and damped against the pointer's own velocity, with a neighbour term that
 * keeps the rim smooth, drawn as one Catmull-Rom path. Moving fast, the
 * target becomes an area-keeping ellipse drawn out behind the pointer; when
 * it stops, the points carry on and spring back, and the ball wobbles with
 * a damping ratio set by `wobble` across the house springs (flick, recoil,
 * and looser).
 *
 * Over a child that matches `targets` it reaches for it — the side facing
 * it first — and wraps the child's own rounded box, thinning to a tint so
 * the label reads through. Leaving, it clings: the far side holds the box
 * while the near side follows the pointer, until it lets go and snaps back
 * into a ball. A press squashes it. With no pointer inside it rests wrapped
 * round `restOn`. The jelly never takes a click; the system cursor returns
 * over text fields, on any key press and outside the box, and keyboard
 * focus on a child gets the same wrap. Under reduced motion it follows 1:1
 * as a plain disc with no stretch, wobble or squash, and wraps by changing
 * outline at once.
 */
export function JellyCursor({
  children,
  size = 28,
  wobble = 0.5,
  color = "cobalt",
  stretch = 0.6,
  squash = 0.5,
  targets = "button, a[href], [role='button'], [data-jelly]",
  padding,
  stickiness = 0.5,
  tint = 0.16,
  restOn = "[data-jelly-rest]",
  hideCursor = true,
  followFocus = true,
  interactive = true,
  onTargetChange,
  className,
}: JellyCursorProps) {
  const motionSafe = useMotionSafe();
  const clipId = `jelly-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const groupRef = React.useRef<SVGGElement | null>(null);
  const bodyRef = React.useRef<SVGPathElement | null>(null);
  const clipRef = React.useRef<SVGPathElement | null>(null);
  const sheenRef = React.useRef<SVGPathElement | null>(null);
  const rimRef = React.useRef<SVGPathElement | null>(null);
  const nucleusRef = React.useRef<SVGCircleElement | null>(null);
  const api = React.useRef<{ wake: () => void; kick: () => void } | null>(null);
  const feel = React.useRef<string | null>(null);

  const fill =
    typeof color === "string" && color in TONES
      ? TONES[color as JellyCursorTone]
      : color;

  const pad = padding ?? Math.round(size * 0.22);

  const params = React.useRef({
    size,
    wobble,
    stretch,
    squash,
    targets,
    padding: pad,
    stickiness,
    tint,
    restOn,
    hideCursor,
    followFocus,
    interactive,
    motionSafe,
    onTargetChange,
  });
  React.useEffect(() => {
    params.current = {
      size,
      wobble,
      stretch,
      squash,
      targets,
      padding: pad,
      stickiness,
      tint,
      restOn,
      hideCursor,
      followFocus,
      interactive,
      motionSafe,
      onTargetChange,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const group = groupRef.current;
    const body = bodyRef.current;
    const clip = clipRef.current;
    const sheen = sheenRef.current;
    const rim = rimRef.current;
    const nucleus = nucleusRef.current;
    if (!root || !group || !body || !clip || !sheen || !rim || !nucleus) {
      return;
    }

    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const tx = new Float32Array(N);
    const ty = new Float32Array(N);
    const dirX = new Float32Array(N);
    const dirY = new Float32Array(N);
    // A few per cent of stiffness either way per point, so the higher modes
    // show a little and the wobble never looks machined.
    const grain = new Float32Array(N);
    for (let i = 0; i < N; i += 1) {
      const a = (i / N) * Math.PI * 2;
      dirX[i] = Math.cos(a);
      dirY[i] = Math.sin(a);
      grain[i] = 1 + 0.04 * Math.sin(i * 2.3 + 0.7) * Math.cos(i * 0.9);
    }

    type Mode = "free" | "wrap" | "release" | "rest" | "hidden";
    let mode: Mode = "hidden";
    let target: HTMLElement | null = null;
    let reported: HTMLElement | null | undefined = undefined;
    const pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, inside: false };
    let keyboard = false;
    let alpha = 0;
    let alphaGoal = 0;
    let wrapMix = 0;
    let press = 0;
    let pressGoal = 0;
    let reachUntil = 0;
    let releaseAt = 0;
    const releaseFrom = { cx: 0, cy: 0, hw: 0, hh: 0, rc: 0 };
    let raf = 0;
    let last = 0;
    let inView = true;
    let placed = false;
    let pulse = 0;
    let restTarget: HTMLElement | null = null;
    let tapped: HTMLElement | null = null;

    const box = { cx: 0, cy: 0, hw: 0, hh: 0, rc: 0 };
    const measure = (el: HTMLElement, out: typeof box) => {
      const r = el.getBoundingClientRect();
      const b = root.getBoundingClientRect();
      const pad = Math.max(0, params.current.padding);
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      out.cx = r.left - b.left + r.width / 2;
      out.cy = r.top - b.top + r.height / 2;
      out.hw = r.width / 2 + pad;
      out.hh = r.height / 2 + pad;
      out.rc = Math.min(radius + pad, out.hw, out.hh);
    };

    const report = (el: HTMLElement | null) => {
      if (el === reported) return;
      reported = el;
      params.current.onTargetChange?.(el);
    };

    const setCursor = () => {
      const p = params.current;
      const on = p.hideCursor && p.interactive && pointer.inside && !keyboard;
      if (on) root.dataset.jelly = "on";
      else delete root.dataset.jelly;
    };

    const findRest = () => {
      const sel = params.current.restOn;
      if (tapped && tapped.isConnected && root.contains(tapped)) return tapped;
      if (!sel) return null;
      try {
        const el = root.querySelector(sel);
        return el instanceof HTMLElement ? el : null;
      } catch {
        return null;
      }
    };

    const matchTarget = (node: EventTarget | null): HTMLElement | null => {
      if (!(node instanceof Element)) return null;
      try {
        const el = node.closest(params.current.targets);
        return el instanceof HTMLElement && el !== root && root.contains(el)
          ? el
          : null;
      } catch {
        return null;
      }
    };

    /** The spring constants for the rim's points, from `wobble`. */
    const physics = () => {
      const p = params.current;
      const wob = clamp(p.wobble, 0, 1);
      const ratio =
        wob <= 0.5
          ? lerp(0.99, 0.53, wob / 0.5)
          : lerp(0.53, 0.2, (wob - 0.5) / 0.5);
      const k = springs.recoil.stiffness;
      return { k, c: 2 * ratio * Math.sqrt(k) };
    };

    /** Where every rim point is headed this frame. */
    const aim = (now: number) => {
      const p = params.current;
      const R = Math.max(4, p.size / 2);
      const squeeze = 1 - 0.2 * clamp(p.squash, 0, 1) * press;
      if (mode === "wrap" || mode === "rest") {
        const el = mode === "rest" ? restTarget : target;
        if (el && el.isConnected) measure(el, box);
        // Wrapped round a child under the pointer, it leans a little toward it.
        let lx = 0;
        let ly = 0;
        if (mode === "wrap" && pointer.inside && !keyboard) {
          lx = clamp((pointer.x - box.cx) * 0.1, -6, 6);
          ly = clamp((pointer.y - box.cy) * 0.1, -4, 4);
        }
        for (let i = 0; i < N; i += 1) {
          const d = boxRay(
            dirX[i] ?? 1,
            dirY[i] ?? 0,
            box.hw * squeeze,
            box.hh * squeeze,
            box.rc * squeeze,
          );
          tx[i] = box.cx + lx + (dirX[i] ?? 1) * d;
          ty[i] = box.cy + ly + (dirY[i] ?? 0) * d;
        }
        return;
      }
      const speed = Math.hypot(pointer.vx, pointer.vy);
      const ux = speed > 1 ? pointer.vx / speed : 1;
      const uy = speed > 1 ? pointer.vy / speed : 0;
      // An area-keeping ellipse along the travel, drawn out behind the nose.
      const s = p.motionSafe
        ? clamp(p.stretch, 0, 1) * 0.9 * Math.min(1, speed / 1400)
        : 0;
      const a = R * (1 + s) * squeeze;
      const b = (R / (1 + s)) * squeeze;
      const cx = pointer.x - ux * R * s;
      const cy = pointer.y - uy * R * s;
      if (mode === "release") {
        const rb = releaseFrom;
        const dx = pointer.x - rb.cx;
        const dy = pointer.y - rb.cy;
        const dl = Math.hypot(dx, dy) || 1;
        const qx = dx / dl;
        const qy = dy / dl;
        for (let i = 0; i < N; i += 1) {
          const ex = dirX[i] ?? 1;
          const ey = dirY[i] ?? 0;
          const along = ex * ux + ey * uy;
          const r = (a * b) / Math.hypot(b * along, a * (ex * -uy + ey * ux));
          const cx2 = cx + ex * r;
          const cy2 = cy + ey * r;
          const d = boxRay(ex, ey, rb.hw, rb.hh, rb.rc);
          const bx = rb.cx + ex * d;
          const by = rb.cy + ey * d;
          // The side facing the pointer goes with it; the far side clings.
          const wgt = smooth(-0.25, 0.4, ex * qx + ey * qy);
          tx[i] = lerp(bx, cx2, wgt);
          ty[i] = lerp(by, cy2, wgt);
        }
        if (now >= releaseAt) mode = "free";
        return;
      }
      for (let i = 0; i < N; i += 1) {
        const ex = dirX[i] ?? 1;
        const ey = dirY[i] ?? 0;
        const along = ex * ux + ey * uy;
        const across = ex * -uy + ey * ux;
        const r = (a * b) / Math.hypot(b * along, a * across);
        tx[i] = cx + ex * r;
        ty[i] = cy + ey * r;
      }
    };

    let energy = 0;
    // The frame the jelly lives in: the pointer while it follows, the
    // wrapped child's centre while it wraps. The rim is carried rigidly with
    // that frame — so the cursor is exactly where the pointer is — and only
    // the frame's acceleration (a start, a stop) shakes it, as it would a
    // real jelly held in a moving hand.
    const frame = { kind: "", x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0 };
    const integrate = (dt: number, now: number) => {
      const p = params.current;
      aim(now);
      const following = mode === "free" || mode === "release";
      const kind = following ? "pointer" : `box:${mode}`;
      const fx0 = following ? pointer.x : box.cx;
      const fy0 = following ? pointer.y : box.cy;
      if (!p.motionSafe || !placed) {
        for (let i = 0; i < N; i += 1) {
          px[i] = tx[i] ?? 0;
          py[i] = ty[i] ?? 0;
          vx[i] = 0;
          vy[i] = 0;
        }
        frame.kind = kind;
        frame.x = fx0;
        frame.y = fy0;
        frame.vx = 0;
        frame.vy = 0;
        placed = true;
        energy = 0;
        return;
      }
      let carryX = 0;
      let carryY = 0;
      let accelX = 0;
      let accelY = 0;
      // Felt across the whole frame: a stop from full speed shakes the rim by
      // `inertia` of that speed, then the springs answer it.
      if (frame.kind === kind && dt > 0) {
        carryX = fx0 - frame.x;
        carryY = fy0 - frame.y;
        const nvx = following ? pointer.vx : 0;
        const nvy = following ? pointer.vy : 0;
        // The frame's acceleration, smoothed and held to a sane range so a
        // jittery mouse never throws the rim about.
        frame.ax +=
          (clamp((nvx - frame.vx) / dt, -24000, 24000) - frame.ax) * 0.5;
        frame.ay +=
          (clamp((nvy - frame.vy) / dt, -24000, 24000) - frame.ay) * 0.5;
        frame.vx = nvx;
        frame.vy = nvy;
        accelX = frame.ax;
        accelY = frame.ay;
      } else {
        // A new frame (pointer to child or back): the rim stays where it is
        // and its springs carry it to the new outline.
        frame.kind = kind;
        frame.vx = 0;
        frame.vy = 0;
        frame.ax = 0;
        frame.ay = 0;
      }
      frame.x = fx0;
      frame.y = fy0;
      const { k, c } = physics();
      const inertia = 0.05 + 0.1 * clamp(p.stretch, 0, 1);
      const reaching = now < reachUntil && mode === "wrap";
      let rx = 0;
      let ry = 0;
      if (reaching) {
        // Reaching for a child: the side facing it is quicker than the rest.
        const dx = box.cx - pointer.x;
        const dy = box.cy - pointer.y;
        const dl = Math.hypot(dx, dy) || 1;
        rx = dx / dl;
        ry = dy / dl;
      }
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < N; i += 1) {
        px[i] = (px[i] ?? 0) + carryX;
        py[i] = (py[i] ?? 0) + carryY;
      }
      energy = 0;
      for (let s = 0; s < steps; s += 1) {
        for (let i = 0; i < N; i += 1) {
          const prev = (i + N - 1) % N;
          const next = (i + 1) % N;
          const ox = (px[i] ?? 0) - (tx[i] ?? 0);
          const oy = (py[i] ?? 0) - (ty[i] ?? 0);
          // Neighbours share their displacement: the rim moves as a rim.
          const lx =
            ((px[prev] ?? 0) -
              (tx[prev] ?? 0) +
              (px[next] ?? 0) -
              (tx[next] ?? 0)) /
              2 -
            ox;
          const ly =
            ((py[prev] ?? 0) -
              (ty[prev] ?? 0) +
              (py[next] ?? 0) -
              (ty[next] ?? 0)) /
              2 -
            oy;
          let kk = k * (grain[i] ?? 1);
          if (reaching) {
            const facing = (dirX[i] ?? 0) * rx + (dirY[i] ?? 0) * ry;
            kk *= facing > 0 ? 1 + 0.9 * facing : 0.55;
          }
          const ax =
            -kk * ox + 1.2 * k * lx - c * (vx[i] ?? 0) - inertia * accelX;
          const ay =
            -kk * oy + 1.2 * k * ly - c * (vy[i] ?? 0) - inertia * accelY;
          vx[i] = (vx[i] ?? 0) + ax * h;
          vy[i] = (vy[i] ?? 0) + ay * h;
        }
        for (let i = 0; i < N; i += 1) {
          px[i] = (px[i] ?? 0) + (vx[i] ?? 0) * h;
          py[i] = (py[i] ?? 0) + (vy[i] ?? 0) * h;
        }
      }
      for (let i = 0; i < N; i += 1) {
        energy = Math.max(
          energy,
          Math.abs(vx[i] ?? 0) + Math.abs(vy[i] ?? 0),
          Math.abs((px[i] ?? 0) - (tx[i] ?? 0)) +
            Math.abs((py[i] ?? 0) - (ty[i] ?? 0)),
        );
      }
    };

    const sx = new Float32Array(N);
    const sy = new Float32Array(N);
    /** A closed Catmull-Rom spline through the rim, as cubic Béziers. */
    const ring = (
      cx: number,
      cy: number,
      scale: number,
      ox: number,
      oy: number,
    ) => {
      for (let i = 0; i < N; i += 1) {
        sx[i] = cx + ((px[i] ?? 0) - cx) * scale + ox;
        sy[i] = cy + ((py[i] ?? 0) - cy) * scale + oy;
      }
      let d = `M${f1(sx[0] ?? 0)} ${f1(sy[0] ?? 0)}`;
      for (let i = 0; i < N; i += 1) {
        const a = (i + N - 1) % N;
        const b = (i + 1) % N;
        const c = (i + 2) % N;
        const xi = sx[i] ?? 0;
        const yi = sy[i] ?? 0;
        const xb = sx[b] ?? 0;
        const yb = sy[b] ?? 0;
        d += `C${f1(xi + (xb - (sx[a] ?? 0)) / 6)} ${f1(yi + (yb - (sy[a] ?? 0)) / 6)} ${f1(xb - ((sx[c] ?? 0) - xi) / 6)} ${f1(yb - ((sy[c] ?? 0) - yi) / 6)} ${f1(xb)} ${f1(yb)}`;
      }
      return `${d}Z`;
    };

    const draw = () => {
      const p = params.current;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < N; i += 1) {
        cx += (px[i] ?? 0) / N;
        cy += (py[i] ?? 0) / N;
      }
      const d = ring(cx, cy, 1, 0, 0);
      body.setAttribute("d", d);
      clip.setAttribute("d", d);
      rim.setAttribute("d", d);
      const R = Math.max(4, p.size / 2);
      // The sheen: the body shrunk toward its middle and lifted up-left,
      // clipped to the body, so it wobbles with it.
      sheen.setAttribute(
        "d",
        ring(cx, cy, 0.62, -R * 0.22 * (1 - wrapMix), -R * 0.26 - wrapMix * 2),
      );
      body.setAttribute(
        "fill-opacity",
        f3(lerp(0.92, clamp(p.tint, 0, 1), wrapMix)),
      );
      rim.setAttribute(
        "stroke-opacity",
        f3(lerp(0.3, mode === "rest" ? 0.45 : 0.75, wrapMix)),
      );
      sheen.setAttribute("fill-opacity", f3(lerp(0.42, 0.06, wrapMix)));
      group.style.opacity = f3(alpha);
      const showNucleus = pointer.inside && !keyboard && mode !== "rest";
      nucleus.setAttribute("cx", f1(pointer.x));
      nucleus.setAttribute("cy", f1(pointer.y));
      nucleus.setAttribute("opacity", showNucleus ? "1" : "0");
    };

    const settleMix = (dt: number) => {
      const p = params.current;
      const wrapped = mode === "wrap" || mode === "rest" || mode === "release";
      const goal = wrapped ? 1 : 0;
      // Opacity is a tween, never a spring: a tint has no mass. Reduced
      // motion keeps the crossfade (it is not travel) and drops the squash.
      wrapMix += (goal - wrapMix) * (1 - Math.exp(-dt / 0.06));
      if (Math.abs(goal - wrapMix) < 0.002) wrapMix = goal;
      if (!p.motionSafe) press = 0;
      else press += (pressGoal - press) * (1 - Math.exp(-dt / 0.05));
      alpha += (alphaGoal - alpha) * (1 - Math.exp(-dt / 0.1));
      if (Math.abs(alphaGoal - alpha) < 0.002) alpha = alphaGoal;
    };

    const canRun = () => inView && !document.hidden;
    const busy = () =>
      energy > 0.3 ||
      Math.abs(alphaGoal - alpha) > 0.002 ||
      Math.abs(press - pressGoal) > 0.002 ||
      mode === "release" ||
      Math.abs(wrapMix - (mode === "free" || mode === "hidden" ? 0 : 1)) >
        0.002 ||
      performance.now() - pointer.t < 120;

    const tick = (t: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      // Pointer velocity eases out when the pointer stops sending moves.
      if (performance.now() - pointer.t > 40) {
        pointer.vx *= Math.exp(-dt / 0.03);
        pointer.vy *= Math.exp(-dt / 0.03);
      }
      settleMix(dt);
      integrate(dt, t / 1000);
      draw();
      if (canRun() && busy()) raf = requestAnimationFrame(tick);
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

    const toRest = () => {
      restTarget = findRest();
      if (restTarget) {
        mode = "rest";
        alphaGoal = 1;
        report(restTarget);
      } else {
        mode = "hidden";
        alphaGoal = 0;
        report(null);
      }
    };

    const local = (clientX: number, clientY: number) => {
      const b = root.getBoundingClientRect();
      return { x: clientX - b.left, y: clientY - b.top };
    };

    const onMove = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive || event.pointerType === "touch") return;
      const pt = local(event.clientX, event.clientY);
      const now = performance.now();
      const wasInside = pointer.inside;
      if (wasInside && now - pointer.t < 100) {
        const dt = Math.max(1 / 240, (now - pointer.t) / 1000);
        pointer.vx = pointer.vx * 0.5 + ((pt.x - pointer.x) / dt) * 0.5;
        pointer.vy = pointer.vy * 0.5 + ((pt.y - pointer.y) / dt) * 0.5;
      } else {
        pointer.vx = 0;
        pointer.vy = 0;
      }
      pointer.x = pt.x;
      pointer.y = pt.y;
      pointer.t = now;
      pointer.inside = true;
      keyboard = false;
      setCursor();
      alphaGoal = 1;
      const over = matchTarget(event.target);
      if (over) {
        if (target !== over || mode !== "wrap") {
          target = over;
          mode = "wrap";
          measure(over, box);
          reachUntil = now / 1000 + 0.16;
          report(over);
        }
      } else if (mode === "wrap" && target) {
        // Leaving a child: cling, stretch, then let go.
        measure(target, releaseFrom);
        const stick = clamp(p.stickiness, 0, 1);
        releaseAt = now / 1000 + 0.12 + 0.4 * stick;
        mode = p.motionSafe && stick > 0 ? "release" : "free";
        target = null;
        report(null);
      } else if (mode !== "release") {
        if (mode === "rest" || mode === "hidden") report(null);
        mode = "free";
      }
      if (mode === "release") {
        const rb = releaseFrom;
        const gap = Math.max(
          Math.abs(pointer.x - rb.cx) - rb.hw,
          Math.abs(pointer.y - rb.cy) - rb.hh,
        );
        if (gap > p.size * (0.4 + 1.6 * clamp(p.stickiness, 0, 1)) + 6) {
          mode = "free";
        }
      }
      wake();
    };

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.inside = false;
      pointer.vx = 0;
      pointer.vy = 0;
      target = null;
      setCursor();
      const focused = document.activeElement;
      if (
        params.current.followFocus &&
        focused instanceof HTMLElement &&
        root.contains(focused) &&
        focused.matches(":focus-visible")
      ) {
        target = matchTarget(focused) ?? focused;
        mode = "wrap";
        report(target);
      } else toRest();
      wake();
    };

    const onDown = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive) return;
      if (event.pointerType === "touch") {
        // No hover on glass: a tap moves the jelly to the child it tapped.
        const over = matchTarget(event.target);
        if (!over) return;
        tapped = over;
        target = null;
        toRest();
        wake();
        return;
      }
      if (event.button !== 0) return;
      pressGoal = 1;
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      wake();
    };
    const onUp = () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pressGoal = 0;
      wake();
    };

    const onKey = () => {
      if (keyboard || !pointer.inside) return;
      keyboard = true;
      setCursor();
      wake();
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!params.current.followFocus || !el.matches(":focus-visible")) return;
      keyboard = true;
      setCursor();
      target = el;
      mode = "wrap";
      alphaGoal = 1;
      reachUntil = 0;
      report(el);
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      if (pointer.inside && !keyboard) return;
      target = null;
      toRest();
      wake();
    };
    const onClick = (event: MouseEvent) => {
      // Enter or Space on a child: a click with no pointer behind it.
      if (event.detail !== 0 || !params.current.followFocus) return;
      window.clearTimeout(pulse);
      pressGoal = 1;
      pulse = window.setTimeout(() => {
        pressGoal = 0;
        wake();
      }, 120);
      wake();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerover", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown);
    // Any key, wherever focus is, hands the pointer back its own cursor.
    window.addEventListener("keydown", onKey);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    root.addEventListener("click", onClick);

    const sizer = new ResizeObserver(() => {
      if (mode === "rest" || mode === "wrap") wake();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // The first frame: resting, already in place, already visible.
    toRest();
    alpha = alphaGoal;
    wrapMix = restTarget ? 1 : 0;
    integrate(0, performance.now() / 1000);
    draw();

    api.current = {
      wake: () => {
        if (!params.current.interactive && pointer.inside) {
          pointer.inside = false;
          setCursor();
          toRest();
        }
        if (mode === "rest" || mode === "hidden") toRest();
        setCursor();
        wake();
      },
      kick: () => {
        // A changed knob gives the rim a squeeze, so the new size, wobble
        // or stretch is felt at once rather than at the next visit.
        if (!params.current.motionSafe || !placed || alpha < 0.5) return;
        for (let i = 0; i < N; i += 1) {
          const push = 70 * Math.cos(2 * ((i / N) * Math.PI * 2));
          vx[i] = (vx[i] ?? 0) + (dirX[i] ?? 0) * push;
          vy[i] = (vy[i] ?? 0) + (dirY[i] ?? 0) * push;
        }
        energy = Math.max(energy, 1);
        wake();
      },
    };

    return () => {
      halt();
      window.clearTimeout(pulse);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerover", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      root.removeEventListener("click", onClick);
      delete root.dataset.jelly;
      api.current = null;
    };
  }, []);

  // Only a real change of feel squeezes the rim — not the first run, and
  // not StrictMode's rehearsal of it.
  const feelKey = `${size}|${wobble}|${stretch}|${pad}`;
  React.useEffect(() => {
    if (feel.current !== null && feel.current !== feelKey) api.current?.kick();
    feel.current = feelKey;
  }, [feelKey]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    size,
    wobble,
    stretch,
    squash,
    targets,
    pad,
    stickiness,
    tint,
    restOn,
    hideCursor,
    followFocus,
    interactive,
    motionSafe,
  ]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate overflow-clip",
        // While the jelly leads, it is the cursor — except over text
        // fields, where a caret has to show where typing will go.
        "data-[jelly=on]:cursor-none data-[jelly=on]:[&_*]:cursor-none",
        "data-[jelly=on]:[&_:is(input,textarea,select,[contenteditable])]:cursor-text",
        className,
      )}
    >
      <div className="relative z-0 size-full">{children}</div>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full overflow-visible"
      >
        <defs>
          <clipPath id={clipId}>
            <path ref={clipRef} />
          </clipPath>
        </defs>
        <g ref={groupRef} style={{ opacity: 0 }}>
          <path ref={bodyRef} style={{ fill }} fillOpacity={0.92} />
          <path
            ref={sheenRef}
            clipPath={`url(#${clipId})`}
            className="fill-primary-foreground"
            fillOpacity={0.42}
          />
          <path
            ref={rimRef}
            fill="none"
            strokeWidth={1.5}
            strokeOpacity={0.3}
            style={{ stroke: fill }}
          />
          <circle
            ref={nucleusRef}
            r={2.5}
            strokeWidth={1.5}
            opacity={0}
            className="stroke-primary-foreground"
            style={{ fill }}
          />
        </g>
      </svg>
    </div>
  );
}
