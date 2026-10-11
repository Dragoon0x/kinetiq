"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type MoireBandProps = {
  /** The content above the ribbons: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** Wires in each ribbon, 8 to 120. @default 40 */
  wireCount?: number;
  /** Distance between neighbouring wires, in px; ribbons wider than 80% of the box tighten to fit. @default 3.5 */
  spacing?: number;
  /** The twist between the two ribbons, in degrees, where the band starts; changing it moves the band there. @default 6 */
  twist?: number;
  /** The twist when you control it, in degrees; pair with `onValueChange`. */
  value?: number;
  /** Fires from the pointer or the keys that turned the twist, with the new twist in degrees. */
  onValueChange?: (degrees: number) => void;
  /** The furthest the pointer or keys can turn the twist either way, in degrees. @default 24 */
  maxTwist?: number;
  /** How restless the ribbons are, 0 (still) to 1. @default 0.35 */
  drift?: number;
  /** How far each ribbon turns over as it runs, 0 (flat) to 1 (edge-on at its narrowest). @default 0.5 */
  roll?: number;
  /** A wire's width as a share of the spacing, 0.15 to 0.7. @default 0.4 */
  wireWidth?: number;
  /** The wires' colour, or one colour for each ribbon, as CSS colours. @default ["var(--foreground)", "var(--accent-bright)"] */
  tint?: string | readonly [string, string];
  /** The pointer and keys turn the twist. @default true */
  interactive?: boolean;
  /** The first time the band comes into view, the twist arrives from wider so the fringes spread into calm bands. @default true */
  intro?: boolean;
  /** Hold the ribbons still; the twist still turns. @default false */
  paused?: boolean;
  /** Names the twist control for assistive technology. @default "Ribbon twist" */
  label?: string;
  /** Seeds the ribbons' curves and turns, so two bands never match. @default 2 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the band but takes no input. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const STEP = 1 / 120;
const DEG = Math.PI / 180;
/** The keys' steps, in degrees. */
const FINE = 0.5;
const COARSE = 4;
/** The intro's twist starts this much wider than the value. */
const INTRO_WIDEN = 14;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A small seeded generator: the same ribbons for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** The ribbons' curve and turn phases for a seed. */
function phasesOf(seed: number): Float32Array {
  const rand = lcg(seed);
  const a = rand() * Math.PI * 2;
  const b = rand() * Math.PI * 2;
  const c = rand() * Math.PI * 2;
  // The second ribbon follows close to the first, so the two cross and part
  // rather than lie apart.
  return new Float32Array([
    a,
    b,
    c,
    0,
    a + 0.7 + rand() * 0.4,
    b + 1.3,
    c + 1.9 + rand(),
    0,
  ]);
}

/** The fringes, put into words for the slider's reading. */
function describe(degrees: number): string {
  const a = Math.abs(degrees);
  const look =
    a < 3
      ? "broad calm fringes"
      : a < 9
        ? "steady fringes"
        : "fine racing fringes";
  return `${r1(degrees).toFixed(1)} degrees, ${look}`;
}

/** The props a band must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='tab'],[contenteditable='true']";

const FRAGMENT = /* glsl */ `
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_time;
uniform float u_twist;
uniform vec4 u_wire;
uniform vec3 u_coef;
uniform vec4 u_phaseA;
uniform vec4 u_phaseB;
uniform vec4 u_colA;
uniform vec4 u_colB;

const float PI = 3.14159265359;

// A ribbon's wire phase (continuous, so its derivatives are exact), its
// coverage mask with an anti-aliased edge, and how it faces: the cosine of
// its turn, negative where its back shows.
void ribbon(vec2 p, float ang, vec4 ph, float dir, out float phase, out float mask, out float face) {
  float c = cos(ang);
  float s = sin(ang);
  vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  float t = u_time;
  float centre =
    u_res.y * 0.13 * sin(q.x / (0.3 * u_res.x + 60.0) + ph.x + t * 0.31 * dir) +
    u_res.y * 0.05 * sin(q.x / (0.11 * u_res.x + 30.0) + ph.y - t * 0.47);
  float turn = q.x / (0.24 * u_res.x + 80.0) + ph.z + t * 0.43 * dir;
  face = cos(turn);
  float hw = 0.5 * u_wire.x * u_wire.y * mix(1.0, 0.2 + 0.8 * sqrt(face * face + 0.03), u_wire.w);
  float off = q.y - centre;
  float aa = fwidth(off) + 1e-3;
  mask = 1.0 - smoothstep(hw - aa, hw + aa, abs(off));
  phase = PI * u_wire.x * off / hw;
}

// A grating term's response to a pixel's footprint: a term finer than the
// pixel fades to its mean instead of aliasing into false fringes.
float pass(vec2 g) { return exp(-dot(g, g) * 0.125); }

void main() {
  vec2 p = (v_uv - 0.5) * u_res;
  float pa;
  float ma;
  float fa;
  float pb;
  float mb;
  float fb;
  ribbon(p, -0.12 - 0.5 * u_twist, u_phaseA, 1.0, pa, ma, fa);
  ribbon(p, -0.12 + 0.5 * u_twist, u_phaseB, -1.0, pb, mb, fb);
  vec2 ga = vec2(dFdx(pa), dFdy(pa));
  vec2 gb = vec2(dFdx(pb), dFdy(pb));
  float a0 = u_coef.x;
  float a1 = u_coef.y;
  float a2 = u_coef.z;
  // Each grating as a short Fourier series of its wire profile.
  float ca = a0 + a1 * pass(ga) * cos(pa) + a2 * pass(2.0 * ga) * cos(2.0 * pa);
  float cb = a0 + a1 * pass(gb) * cos(pb) + a2 * pass(2.0 * gb) * cos(2.0 * pb);
  // Their product, expanded into sum and difference terms, each filtered by
  // its own frequency: the difference terms are the moire, and they survive
  // at any scale because they are slow.
  float prod = a0 * (ca + cb) - a0 * a0;
  prod += 0.5 * a1 * a1 * (pass(ga - gb) * cos(pa - pb) + pass(ga + gb) * cos(pa + pb));
  prod += 0.5 * a2 * a2 * (pass(2.0 * (ga - gb)) * cos(2.0 * (pa - pb)) + pass(2.0 * (ga + gb)) * cos(2.0 * (pa + pb)));
  prod += 0.5 * a1 * a2 * (pass(ga - 2.0 * gb) * cos(pa - 2.0 * pb) + pass(ga + 2.0 * gb) * cos(pa + 2.0 * pb));
  prod += 0.5 * a2 * a1 * (pass(2.0 * ga - gb) * cos(2.0 * pa - pb) + pass(2.0 * ga + gb) * cos(2.0 * pa + pb));
  ca = clamp(ca, 0.0, 1.0);
  cb = clamp(cb, 0.0, 1.0);
  prod = clamp(prod, 0.0, min(ca, cb));
  // A ribbon's back reads a shade fainter than its face.
  float da = ma * mix(0.72, 1.0, smoothstep(-0.15, 0.15, fa));
  float db = mb * mix(0.72, 1.0, smoothstep(-0.15, 0.15, fb));
  float alA = da * ca * u_colA.a;
  float alB = db * cb * u_colB.a;
  float both = da * db * prod * min(u_colA.a, u_colB.a);
  // B lies over A: what shows of A is what B's wires leave uncovered.
  vec3 rgb = u_colA.rgb * (alA - both) + u_colB.rgb * alB;
  float alpha = clamp(alA + alB - both, 0.0, 1.0);
  vec3 straight = alpha > 1e-4 ? clamp(rgb / alpha, 0.0, 1.0) : vec3(0.0);
  o_color = vec4(kx_linearToSrgb(straight) * alpha, alpha);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Sim = {
  /** The drift's clock, s. */
  t: number;
  last: number;
  carry: number;
  /** The twist shown, degrees, and how fast it is turning. */
  tw: number;
  twV: number;
  /** The intro's arrival runs on the drift spring until it lands. */
  arriving: boolean;
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/**
 * Two ribbons of fine parallel wires drifting across the box, drawn per pixel
 * in one WebGL2 pass on a transparent canvas, with optional content above.
 * Each ribbon runs along a gently S-curved line and turns over as it goes,
 * so its width and its wire spacing breathe; the second is turned from the
 * first by the twist, and where they overlap broad interference fringes bloom
 * and slide far faster than the wires move.
 *
 * The fringes are computed, not aliased: each grating is a short Fourier
 * series of its wire, and the product of the two is expanded into sum and
 * difference terms, each filtered by its own frequency — the wires fade to
 * their mean only when finer than a pixel, while the slow difference terms,
 * the moire, survive at any scale.
 *
 * The pointer sets the twist: its place across the band maps to the twist on
 * a curve that is fine near the middle, where nearly parallel ribbons give
 * calm wide bands, and coarse at the ends, and the twist follows on the glide
 * spring. It is a real slider: arrow keys, Page Up and Down, Home and End.
 * The first sighting brings the twist in from wider on the drift spring, so
 * the fringes start fine and spread. Under reduced motion one crossing is
 * frozen; a drag or the keys still set the twist, drawn at once.
 */
export function MoireBand({
  children,
  wireCount = 40,
  spacing = 3.5,
  twist = 6,
  value,
  onValueChange,
  maxTwist = 24,
  drift = 0.35,
  roll = 0.5,
  wireWidth = 0.4,
  tint = ["var(--foreground)", "var(--accent-bright)"],
  interactive = true,
  intro = true,
  paused = false,
  label = "Ribbon twist",
  seed = 2,
  dpr = 2,
  disabled = false,
  className,
}: MoireBandProps) {
  const motionSafe = useMotionSafe();
  const range = clamp(maxTwist, 1, 60);
  const [own, setOwn] = React.useState(() => clamp(twist, -range, range));
  // A new `twist` moves the band there, as a fresh start would.
  const [seenTwist, setSeenTwist] = React.useState(twist);
  if (seenTwist !== twist) {
    setSeenTwist(twist);
    setOwn(clamp(twist, -range, range));
  }
  const current = clamp(value ?? own, -range, range);
  const tints: readonly [string, string] =
    typeof tint === "string" ? [tint, tint] : [tint[0], tint[1]];
  const paintKey = tints.join("|");
  const duty = clamp(wireWidth, 0.15, 0.7);

  const k = {
    wires: clamp(Math.round(wireCount), 8, 120),
    spacing: clamp(spacing, 1.5, 12),
    target: current,
    range,
    drift: clamp01(drift),
    roll: clamp01(roll),
    coef: [
      duty,
      (2 * Math.sin(Math.PI * duty)) / Math.PI,
      Math.sin(2 * Math.PI * duty) / Math.PI,
    ] as const,
    intro,
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    enabled: interactive && !disabled,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(8));
  const phases = React.useMemo(() => phasesOf(seed), [seed]);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const arrived = React.useRef(false);
  const shown = React.useRef(false);
  const scrubbing = React.useRef(false);
  const sim = React.useRef<Sim>({
    t: 0,
    last: 0,
    carry: 0,
    tw: current,
    twV: 0,
    arriving: false,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onValueChange);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const out = colour.current;
    for (let i = 0; i < 2; i += 1) {
      const span = carriers.children[i];
      if (!span) continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[i * 4] = toLinear(d[0] ?? 0);
      out[i * 4 + 1] = toLinear(d[1] ?? 0);
      out[i * 4 + 2] = toLinear(d[2] ?? 0);
      out[i * 4 + 3] = (d[3] ?? 255) / 255;
    }
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    size.current = {
      w: r.width / r.dpr,
      h: r.height / r.dpr,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
    };
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz || !visible.current) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    const ph = phases;
    // Ribbons wider than most of the box tighten their spacing to fit.
    const pitch = Math.min(k.spacing, (sz.h * 0.8) / k.wires);
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform1f(u.u_twist ?? null, s.tw * DEG);
    gl.uniform4f(u.u_wire ?? null, k.wires, pitch, 0, k.roll);
    gl.uniform3f(u.u_coef ?? null, k.coef[0], k.coef[1], k.coef[2]);
    gl.uniform4f(u.u_phaseA ?? null, ph[0] ?? 0, ph[1] ?? 0, ph[2] ?? 0, 0);
    gl.uniform4f(u.u_phaseB ?? null, ph[4] ?? 0, ph[5] ?? 0, ph[6] ?? 0, 0);
    gl.uniform4f(u.u_colA ?? null, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1);
    gl.uniform4f(u.u_colB ?? null, c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, c[7] ?? 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the drift and the twist's spring; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    if (!k.motionSafe) {
      s.tw = k.target;
      s.twV = 0;
      s.arriving = false;
      return false;
    }
    const drifting = !k.paused && k.drift > 0;
    if (drifting) s.t += dt * k.drift * 1.6;
    // The twist follows on the glide spring; the intro arrives on drift.
    const sp = s.arriving ? springs.drift : springs.glide;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      const a =
        (-sp.stiffness * (s.tw - k.target) - sp.damping * s.twV) / sp.mass;
      s.twV += a * STEP;
      s.tw += s.twV * STEP;
    }
    if (steps === 8) s.carry = 0;
    const turning = Math.abs(s.tw - k.target) > 0.005 || Math.abs(s.twV) > 0.02;
    if (!turning) {
      s.tw = k.target;
      s.twV = 0;
      s.arriving = false;
    }
    return drifting || turning;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** The first sighting: the twist comes in from wider, and the fringes spread. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    if (k.intro && k.motionSafe) {
      s.tw = k.target + (k.target < 0 ? -INTRO_WIDEN : INTRO_WIDEN);
      s.twV = 0;
      s.arriving = true;
    }
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, arrive };
    report.current = onValueChange;
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, lost: false };
      api.current?.readColours();
      api.current?.resize();
      api.current?.draw();
      api.current?.kick();
      return true;
    };
    if (!build()) {
      rootRef.current?.setAttribute("data-fallback", "");
      return;
    }
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        shown.current = false;
        rootRef.current?.removeAttribute("data-live");
      },
      () => {
        gpu.current = null;
        build();
      },
    );
    return () => {
      detach();
      const g = gpu.current;
      gpu.current = null;
      if (g && !g.lost) {
        g.tri.dispose();
        g.program.dispose();
      }
    };
  }, []);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.wires,
    k.spacing,
    k.target,
    k.drift,
    k.roll,
    duty,
    phases,
    paused,
    motionSafe,
  ]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.arrive();
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** A new twist from the visitor: held here unless the host holds it. */
  const commit = (next: number) => {
    const v = r1(clamp(next, -range, range));
    if (v === r1(current)) return;
    if (value === undefined) setOwn(v);
    report.current?.(v);
    // The visitor is steering: the intro yields to the hand.
    sim.current.arriving = false;
  };

  /** The twist for a place across the band: fine near the middle, coarse at the ends. */
  const twistAt = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return current;
    const r = root.getBoundingClientRect();
    const u = clamp((clientX - r.left - r.width / 2) / (r.width * 0.46), -1, 1);
    return range * Math.sign(u) * Math.pow(Math.abs(u), 1.6);
  };

  const drag = useDrag({
    threshold: 2,
    axis: "x",
    disabled: !k.enabled,
    onStart: ({ point }) => {
      scrubbing.current = true;
      commit(twistAt(point.x));
    },
    onMove: ({ point }) => commit(twistAt(point.x)),
    onEnd: () => {
      scrubbing.current = false;
    },
    onCancel: () => {
      scrubbing.current = false;
    },
    onTap: (event) => commit(twistAt(event.clientX)),
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!k.enabled || fromContent(event.target)) return;
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    // A mouse steers by hovering; touch and pen steer while they drag.
    if (
      !k.enabled ||
      !k.motionSafe ||
      scrubbing.current ||
      event.pointerType !== "mouse" ||
      event.buttons !== 0
    )
      return;
    commit(twistAt(event.clientX));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!k.enabled) return;
    const steps: Record<string, number> = {
      ArrowRight: FINE,
      ArrowUp: FINE,
      ArrowLeft: -FINE,
      ArrowDown: -FINE,
      PageUp: COARSE,
      PageDown: -COARSE,
    };
    const by = steps[event.key];
    if (by !== undefined) {
      event.preventDefault();
      commit(current + by);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      commit(event.key === "Home" ? -range : range);
    }
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  const still = standIn(tints, current, k.wires, k.spacing, duty);

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/moire-band relative isolate h-full w-full overflow-clip",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/moire-band:invisible group-data-live/moire-band:opacity-0"
      >
        {still}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {tints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div
        role="slider"
        tabIndex={k.enabled ? 0 : -1}
        aria-label={label}
        aria-valuemin={0 - range}
        aria-valuemax={range}
        aria-valuenow={r1(current)}
        aria-valuetext={describe(current)}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-ew-resize" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the two ribbons as striped bands crossing at the centre,
 * turned by the twist, each faded at its edges.
 */
function standIn(
  tints: readonly [string, string],
  twist: number,
  wires: number,
  spacing: number,
  duty: number,
): React.ReactNode {
  const pitch = r1(spacing);
  const line = r1(spacing * duty);
  const half = Math.round((wires * spacing) / 2);
  return tints.map((paint, i) => {
    const turn = r1(-6.9 + (i === 0 ? -0.5 : 0.5) * twist);
    return (
      <span
        key={i}
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(${r1(turn + 180)}deg, color-mix(in oklab, ${paint} ${i === 0 ? 70 : 80}%, transparent) 0 ${line}px, transparent ${line}px ${pitch}px)`,
          maskImage: `linear-gradient(${r1(turn + 180)}deg, transparent calc(50% - ${half}px), black calc(50% - ${half - 12}px), black calc(50% + ${half - 12}px), transparent calc(50% + ${half}px))`,
        }}
      />
    );
  });
}
