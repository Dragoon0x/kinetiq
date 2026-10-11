"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GlassTrioState = "idle" | "listening" | "thinking" | "speaking";
export type GlassTrioTint = "accent" | "signal" | "warn" | "clear";

export type GlassTrioProps = {
  /** What the assistant is doing. @default "idle" */
  state?: GlassTrioState;
  /** The input level while listening, the voice level while speaking, 0 to 1: a number, or a function read every frame (an analyser's level) so a live level never re-renders. @default 0 */
  level?: number | (() => number);
  /** The glass's colour: cobalt, mint, amber or clear — or any CSS colour. @default "accent" */
  tint?: GlassTrioTint | (string & {});
  /** How wet the glass looks, 0 (a soft, matte sheen) to 1 (a small, sharp highlight). @default 0.6 */
  gloss?: number;
  /** Radius of each bead, px. @default 16 */
  size?: number;
  /** How long one idle breath takes, ms. @default 5200 */
  breath?: number;
  /** How fast the beads orbit while thinking, turns per second. @default 0.45 */
  orbit?: number;
  /** How readily the speaking bead sheds drops, 0 (never) to 1 (on every syllable). @default 0.6 */
  shed?: number;
  /** Lean a little toward a pointer over the trio. @default true */
  follow?: boolean;
  /** Hold everything still. @default false */
  paused?: boolean;
  /** Who the trio is, for its accessible name. @default "Assistant" */
  label?: string;
  /** Makes the trio a button (tap to talk); a press squeezes the beads together. */
  onPress?: () => void;
  /** Dims the trio, and a press does nothing. @default false */
  disabled?: boolean;
  /** Classes for the trio's box; its size comes from `size`. */
  className?: string;
};

const TINTS: Record<GlassTrioTint, string> = {
  accent: "var(--accent-bright)",
  signal: "var(--signal)",
  warn: "oklch(from var(--warn) 0.78 0.14 h)",
  clear: "oklch(from var(--ink-3) 0.82 0.012 h)",
};

const WORDS: Record<GlassTrioState, string> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** The radius of three beads' volume in one. */
const MERGED = Math.cbrt(3);
const DROPS = 4;
/** Two beads closer than this many summed radii are joined by a neck. */
const REACH = 1.3;

type Bead = { x: number; y: number; vx: number; vy: number; r: number };
type Drop = { on: boolean; a: number; d: number; v: number };

type Sim = {
  t: number;
  beads: Bead[];
  drops: Drop[];
  env: number;
  hist: Float32Array;
  histAt: number;
  orbitA: number;
  /** Seconds since the state began. */
  since: number;
  state: GlassTrioState;
  /** How merged the beads are, 0 to 1, eased. */
  merge: number;
  think: number;
  lastShed: number;
  shedN: number;
  fx: number;
  fy: number;
  fvx: number;
  fvy: number;
  aim: { x: number; y: number };
  light: number;
};

/**
 * The neck between two circles, as a closed path: tangent points spread
 * round each circle, joined by curves whose handles shorten as the circles
 * part — the metaball bridge, in any direction. Drawn with the circles it
 * reads as one liquid body, crisp at any size and cheap to rebuild each frame.
 */
function neck(
  x1: number,
  y1: number,
  ra: number,
  x2: number,
  y2: number,
  rb: number,
): string {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d < 0.5 || d > (ra + rb) * REACH || d <= Math.abs(ra - rb)) return "";
  const dir = Math.atan2(y2 - y1, x2 - x1);
  const u1 =
    d < ra + rb
      ? Math.acos(clamp((ra * ra + d * d - rb * rb) / (2 * ra * d), -1, 1))
      : 0;
  const u2 =
    d < ra + rb
      ? Math.acos(clamp((rb * rb + d * d - ra * ra) / (2 * rb * d), -1, 1))
      : 0;
  const spread = 0.5;
  const maxSpread = Math.acos(clamp((ra - rb) / d, -1, 1));
  const a1 = dir + u1 + (maxSpread - u1) * spread;
  const b1 = dir - u1 - (maxSpread - u1) * spread;
  const a2 = dir + Math.PI - u2 - (Math.PI - u2 - maxSpread) * spread;
  const b2 = dir - Math.PI + u2 + (Math.PI - u2 - maxSpread) * spread;
  const p = (x: number, y: number, r: number, a: number) =>
    [x + r * Math.cos(a), y + r * Math.sin(a)] as const;
  const p1a = p(x1, y1, ra, a1);
  const p1b = p(x1, y1, ra, b1);
  const p2a = p(x2, y2, rb, a2);
  const p2b = p(x2, y2, rb, b2);
  const handle =
    Math.min(
      spread * 2.4,
      Math.hypot(p1a[0] - p2a[0], p1a[1] - p2a[1]) / (ra + rb),
    ) * Math.min(1, (d * 2) / (ra + rb));
  const h = (pt: readonly [number, number], r: number, a: number) =>
    [
      pt[0] + r * handle * Math.cos(a),
      pt[1] + r * handle * Math.sin(a),
    ] as const;
  const h1 = h(p1a, ra, a1 - Math.PI / 2);
  const h2 = h(p2a, rb, a2 + Math.PI / 2);
  const h3 = h(p2b, rb, b2 - Math.PI / 2);
  const h4 = h(p1b, ra, b1 + Math.PI / 2);
  const f = (pt: readonly [number, number]) => `${r2(pt[0])} ${r2(pt[1])}`;
  return `M ${f(p1a)} C ${f(h1)} ${f(h2)} ${f(p2a)} L ${f(p2b)} C ${f(h3)} ${f(h4)} ${f(p1b)} Z`;
}

/** The idle triangle at a moment, relative to the centre. */
function idlePose(t: number, r: number, breath: number) {
  const b = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / Math.max(0.8, breath));
  const rho = r * (1.42 + 0.6 * b);
  const turn = (2 * Math.PI * t) / 40;
  return [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3 + turn;
    return { x: rho * Math.cos(a), y: rho * Math.sin(a) };
  });
}

/**
 * An assistant's presence as three small glass beads, drawn as one liquid
 * body: every bead is a circle and any two that come close are joined by a
 * metaball neck, so they merge and pinch apart like drops. The body is lit by
 * an SVG lighting filter whose height map is its own blurred outline, so the
 * union of beads reads as one piece of glass — a tinted body, a darker
 * refracting rim, a specular highlight from the upper left (sharpness
 * `gloss`) and a soft caustic low on the far side.
 *
 * Idle, the beads breathe apart and together while the triangle turns, necks
 * forming as they meet. Listening, they slide into a line on the snap spring
 * and bob with the input level, each a beat behind the last. Thinking, they
 * orbit and spiral in on the glide spring until they merge into one bead of
 * the same volume with a slow light turning inside. Speaking, that bead pulses
 * with the voice and sheds drops on loud syllables that fly out, slow and fall
 * back through a neck; leaving speaking splits it back into three.
 *
 * It is an image named for its state (a button when `onPress` is given) with a
 * polite status that announces each state once. Under reduced motion each
 * state is a still pose reached at once, and levels show as light, not travel.
 */
export function GlassTrio({
  state = "idle",
  level = 0,
  tint = "accent",
  gloss = 0.6,
  size = 16,
  breath = 5200,
  orbit = 0.45,
  shed = 0.6,
  follow = true,
  paused = false,
  label = "Assistant",
  onPress,
  disabled = false,
  className,
}: GlassTrioProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const r = clamp(size, 6, 32);
  const W = Math.round(r * 8.4);
  const H = Math.round(r * 6.6);
  const cx = W / 2;
  const cy = H / 2;
  const colour = (TINTS as Record<string, string>)[tint] ?? tint;
  const k = clamp(gloss, 0, 1);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seen, setSeen] = React.useState(state);
  if (seen !== state) {
    setSeen(state);
    setSaid((s) => ({
      n: s.n + 1,
      text: `${WORDS[state].charAt(0).toUpperCase()}${WORDS[state].slice(1)}.`,
    }));
  }

  const rootRef = React.useRef<HTMLElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const followRef = React.useRef<SVGGElement | null>(null);
  const beadRefs = React.useRef<(SVGCircleElement | null)[]>([]);
  const auraRefs = React.useRef<(SVGCircleElement | null)[]>([]);
  const dropRefs = React.useRef<(SVGCircleElement | null)[]>([]);
  const neckRefs = React.useRef<(SVGPathElement | null)[]>([]);
  const innerRef = React.useRef<SVGCircleElement | null>(null);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  // Assumed on screen until the observer's first report, so the first frame
  // is drawn (and an off-screen mount stops after it).
  const visible = React.useRef(true);

  // The server and the first client render draw the idle pose at t = 0.
  const start = idlePose(0, r, breath / 1000);
  const sim = React.useRef<Sim | null>(null);

  const latest = React.useRef({
    state,
    level,
    r,
    breath,
    orbit,
    shed,
    follow,
    paused,
    motionSafe,
  });
  React.useEffect(() => {
    latest.current = {
      state,
      level,
      r,
      breath,
      orbit,
      shed,
      follow,
      paused,
      motionSafe,
    };
  });

  const ensureSim = (): Sim => {
    if (!sim.current) {
      sim.current = {
        t: 0,
        beads: start.map((p) => ({ x: p.x, y: p.y, vx: 0, vy: 0, r })),
        drops: Array.from({ length: DROPS }, () => ({
          on: false,
          a: 0,
          d: 0,
          v: 0,
        })),
        env: 0,
        hist: new Float32Array(64),
        histAt: 0,
        orbitA: 0,
        since: 0,
        state: latest.current.state,
        merge: 0,
        think: 0,
        lastShed: -1,
        shedN: 0,
        fx: 0,
        fy: 0,
        fvx: 0,
        fvy: 0,
        aim: { x: 0, y: 0 },
        light: 0,
      };
    }
    return sim.current;
  };

  const readLevel = () => {
    const lv = latest.current.level;
    const v = typeof lv === "function" ? lv() : lv;
    return Number.isFinite(v) ? clamp(v, 0, 1) : 0;
  };

  /** The level as it was `ago` seconds back, from the frame history. */
  const levelAgo = (s: Sim, ago: number) => {
    const n = s.hist.length;
    const back = Math.min(n - 1, Math.round(ago * 60));
    return s.hist[(s.histAt - back + n * 4) % n] ?? 0;
  };

  /** Where each bead wants to be now, and how big. */
  const targets = (s: Sim) => {
    const L = latest.current;
    const R = L.r;
    const out: { x: number; y: number; r: number }[] = [];
    if (s.state === "idle") {
      const pose = L.motionSafe
        ? idlePose(s.t, R, L.breath / 1000)
        : idlePose(L.breath / 4000, R, L.breath / 1000);
      for (const p of pose) out.push({ x: p.x, y: p.y, r: R });
    } else if (s.state === "listening") {
      for (let i = 0; i < 3; i += 1) {
        const lv = L.motionSafe ? levelAgo(s, i * 0.075) : 0;
        out.push({
          x: (i - 1) * 2.95 * R,
          y: 0.15 * R - lv * 1.3 * R,
          r: R * (1 + 0.14 * lv),
        });
      }
    } else if (s.state === "thinking") {
      // Spiralling in, and turning faster as they close: the orbit keeps its
      // angular momentum, within reason.
      const rho = L.motionSafe
        ? 1.55 * R * Math.pow(Math.max(0, 1 - s.since / 1.5), 1.4)
        : 0;
      for (let i = 0; i < 3; i += 1) {
        const a = s.orbitA + (i * 2 * Math.PI) / 3;
        out.push({ x: rho * Math.cos(a), y: rho * Math.sin(a), r: R });
      }
    } else {
      for (let i = 0; i < 3; i += 1) out.push({ x: 0, y: 0, r: R });
    }
    return out;
  };

  const step = (s: Sim, dt: number) => {
    const L = latest.current;
    const R = L.r;
    s.t += dt;
    s.since += dt;
    if (s.state !== L.state) {
      s.state = L.state;
      s.since = 0;
    }
    const raw = readLevel();
    const tau = raw > s.env ? 0.04 : 0.2;
    s.env += (raw - s.env) * (1 - Math.exp(-dt / tau));
    s.histAt = (s.histAt + 1) % s.hist.length;
    s.hist[s.histAt] = s.env;

    if (s.state === "thinking") {
      const rho = Math.max(0.25, 1.55 * Math.max(0, 1 - s.since / 1.5));
      s.orbitA += 2 * Math.PI * L.orbit * Math.min(3, 1 / rho) * dt;
    }
    s.think +=
      ((s.state === "thinking" ? 1 : 0) - s.think) * (1 - Math.exp(-dt / 0.35));
    s.light += dt * 0.9;

    const tg = targets(s);
    const spring =
      s.state === "listening"
        ? springs.snap
        : s.state === "idle"
          ? springs.drift
          : springs.glide;
    if (!L.motionSafe) {
      for (let i = 0; i < 3; i += 1) {
        const b = s.beads[i];
        const g = tg[i];
        if (!b || !g) continue;
        b.x = g.x;
        b.y = g.y;
        b.vx = 0;
        b.vy = 0;
      }
    } else {
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(1 / 240, left);
        left -= h;
        for (let i = 0; i < 3; i += 1) {
          const b = s.beads[i];
          const g = tg[i];
          if (!b || !g) continue;
          const ax =
            (spring.stiffness * (g.x - b.x) - spring.damping * b.vx) /
            spring.mass;
          const ay =
            (spring.stiffness * (g.y - b.y) - spring.damping * b.vy) /
            spring.mass;
          b.vx += ax * h;
          b.vy += ay * h;
          b.x += b.vx * h;
          b.y += b.vy * h;
        }
      }
    }

    // Volume is kept: the nearer the beads, the more they are one bead.
    let sum = 0;
    for (let i = 0; i < 3; i += 1) {
      const a = s.beads[i];
      const b = s.beads[(i + 1) % 3];
      if (a && b) sum += Math.hypot(a.x - b.x, a.y - b.y);
    }
    const spread = sum / 3;
    const m = clamp(1 - spread / (1.6 * R), 0, 1);
    s.merge = m;
    const pulse =
      s.state === "speaking" ? 1 + 0.16 * s.env * (L.motionSafe ? 1 : 0) : 1;
    for (let i = 0; i < 3; i += 1) {
      const b = s.beads[i];
      const g = tg[i];
      if (!b || !g) continue;
      b.r = g.r * (1 + (MERGED - 1) * m * m) * pulse;
    }

    // Speaking sheds drops on loud syllables; surface tension pulls them home.
    const merged = R * MERGED * pulse;
    if (s.state === "speaking" && L.motionSafe && m > 0.9) {
      const threshold = 0.62 - 0.32 * clamp(L.shed, 0, 1);
      const gap = 0.5 - 0.3 * clamp(L.shed, 0, 1);
      if (L.shed > 0 && s.env > threshold && s.t - s.lastShed > gap) {
        const slot = s.drops.find((d) => !d.on);
        if (slot) {
          s.shedN += 1;
          s.lastShed = s.t;
          slot.on = true;
          // Golden-angle turns, so drops leave from all round the bead.
          slot.a = -Math.PI / 2 + s.shedN * 2.39996;
          slot.d = 0;
          slot.v = (12 + 10 * s.env) * R;
        }
      }
    }
    for (const d of s.drops) {
      if (!d.on) continue;
      const kk = 52;
      const cc = 2 * 0.82 * Math.sqrt(kk);
      d.v += (-kk * d.d - cc * d.v) * dt;
      d.d += d.v * dt;
      if (d.d <= 0 && d.v < 0) d.on = false;
      if (s.state !== "speaking" && d.d < merged * 0.2) d.on = false;
    }

    // The lean toward the hand.
    const want = L.follow && L.motionSafe ? s.aim : { x: 0, y: 0 };
    const f = springs.drift;
    s.fvx +=
      ((f.stiffness * (want.x - s.fx) - f.damping * s.fvx) / f.mass) * dt;
    s.fvy +=
      ((f.stiffness * (want.y - s.fy) - f.damping * s.fvy) / f.mass) * dt;
    s.fx += s.fvx * dt;
    s.fy += s.fvy * dt;
  };

  const draw = (s: Sim) => {
    const L = latest.current;
    const R = L.r;
    const g = followRef.current;
    if (g) g.setAttribute("transform", `translate(${r2(s.fx)} ${r2(s.fy)})`);
    const beads = s.beads;
    for (let i = 0; i < 3; i += 1) {
      const b = beads[i];
      const el = beadRefs.current[i];
      if (!b || !el) continue;
      el.setAttribute("cx", String(r2(cx + b.x)));
      el.setAttribute("cy", String(r2(cy + b.y)));
      el.setAttribute("r", String(r2(b.r)));
      const aura = auraRefs.current[i];
      if (aura) {
        const lv =
          s.state === "listening"
            ? levelAgo(s, i * 0.075)
            : s.state === "speaking"
              ? s.env
              : 0;
        aura.setAttribute("cx", String(r2(cx + b.x)));
        aura.setAttribute("cy", String(r2(cy + b.y)));
        aura.setAttribute("r", String(r2(b.r * (1.5 + 0.7 * lv))));
        aura.setAttribute("opacity", String(r2(0.12 + 0.6 * lv)));
      }
    }
    let ni = 0;
    const put = (d: string) => {
      const el = neckRefs.current[ni];
      ni += 1;
      if (el && el.getAttribute("d") !== d) el.setAttribute("d", d);
    };
    for (let i = 0; i < 3; i += 1) {
      const a = beads[i];
      const b = beads[(i + 1) % 3];
      if (!a || !b) continue;
      put(neck(cx + a.x, cy + a.y, a.r, cx + b.x, cy + b.y, b.r));
    }
    const center = beads.reduce(
      (acc, b) => ({
        x: acc.x + b.x / 3,
        y: acc.y + b.y / 3,
        r: Math.max(acc.r, b.r),
      }),
      { x: 0, y: 0, r: 0 },
    );
    const dropR = R * 0.34;
    for (let i = 0; i < DROPS; i += 1) {
      const d = s.drops[i];
      const el = dropRefs.current[i];
      if (!d || !el) continue;
      if (!d.on) {
        if (el.getAttribute("r") !== "0") el.setAttribute("r", "0");
        put("");
        continue;
      }
      const dist = center.r + d.d - dropR * 0.4;
      const x = cx + center.x + Math.cos(d.a) * dist;
      const y = cy + center.y + Math.sin(d.a) * dist;
      el.setAttribute("cx", String(r2(x)));
      el.setAttribute("cy", String(r2(y)));
      el.setAttribute("r", String(r2(dropR)));
      put(neck(cx + center.x, cy + center.y, center.r, x, y, dropR));
    }
    const inner = innerRef.current;
    if (inner) {
      const glow = clamp(
        s.think * 0.9 + (s.state === "speaking" ? 0.25 + 0.6 * s.env : 0),
        0,
        1,
      );
      const a = L.motionSafe ? s.light : 0.8;
      const rr = center.r * 0.42;
      inner.setAttribute("cx", String(r2(cx + center.x + Math.cos(a) * rr)));
      inner.setAttribute(
        "cy",
        String(r2(cy + center.y + Math.sin(a) * rr * 0.8)),
      );
      inner.setAttribute("r", String(r2(center.r * 0.46)));
      inner.setAttribute("opacity", String(r2(glow * s.merge)));
    }
  };

  /* ------------------------------ the loop ------------------------------- */

  const shouldRun = () => {
    const L = latest.current;
    if (!visible.current || document.hidden || L.paused) return false;
    if (L.motionSafe) return true;
    // Reduced: only a live level needs frames.
    return L.state === "listening" || L.state === "speaking";
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = ensureSim();
    if (!shouldRun()) {
      last.current = 0;
      step(s, 0);
      draw(s);
      return;
    }
    const dt = last.current
      ? Math.min(1 / 30, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    step(s, dt);
    draw(s);
    frame.current = window.requestAnimationFrame(tick);
  };

  const run = () => {
    // Off screen or hidden, nothing is drawn; the observer starts it again.
    if (!visible.current || document.hidden) return;
    if (!frame.current) frame.current = window.requestAnimationFrame(tick);
  };

  const api = React.useRef({ run });
  React.useEffect(() => {
    api.current = { run };
  });

  // A state change in reduced motion is a short dip of light, not travel.
  const shownState = React.useRef(state);
  React.useEffect(() => {
    if (shownState.current === state) return;
    shownState.current = state;
    if (!motionSafe) {
      svgRef.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], {
        duration: durations.base * 1000,
        easing: "ease-out",
      });
    }
    api.current.run();
  }, [state, motionSafe]);

  React.useEffect(() => {
    api.current.run();
  }, [paused, motionSafe, size, breath, follow]);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      api.current.run();
    });
    io.observe(node);
    const onVisibility = () => api.current.run();
    document.addEventListener("visibilitychange", onVisibility);
    const raf = frame;
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, []);

  const onPointerMove = (event: React.PointerEvent) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const s = ensureSim();
    const R = r;
    s.aim = {
      x: clamp(
        (event.clientX - rect.left - rect.width / 2) * 0.12,
        -0.45 * R,
        0.45 * R,
      ),
      y: clamp(
        (event.clientY - rect.top - rect.height / 2) * 0.12,
        -0.45 * R,
        0.45 * R,
      ),
    };
    api.current.run();
  };
  const onPointerLeave = () => {
    const s = ensureSim();
    s.aim = { x: 0, y: 0 };
    api.current.run();
  };

  const squeeze = () => {
    if (!motionSafe) return;
    const s = ensureSim();
    for (const b of s.beads) {
      b.vx -= b.x * 9;
      b.vy -= b.y * 9;
    }
    api.current.run();
  };

  const name = `${label}, ${WORDS[state]}`;
  const filterId = `${uid}-glass`;
  const rim = `color-mix(in oklab, ${colour} 62%, black)`;
  const caustic = `color-mix(in oklab, ${colour} 45%, white)`;

  const art = (
    <svg
      ref={svgRef}
      aria-hidden
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="block"
    >
      <defs>
        <filter
          id={filterId}
          filterUnits="userSpaceOnUse"
          x={r2(-W * 0.2)}
          y={r2(-H * 0.2)}
          width={r2(W * 1.4)}
          height={r2(H * 1.4)}
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            in="SourceAlpha"
            stdDeviation={r2(r * 0.42)}
            result="height"
          />
          <feFlood
            style={{ floodColor: colour }}
            floodOpacity={0.36}
            result="tintF"
          />
          <feComposite
            in="tintF"
            in2="SourceAlpha"
            operator="in"
            result="body"
          />
          <feGaussianBlur
            in="SourceAlpha"
            stdDeviation={r2(r * 0.17)}
            result="soft"
          />
          <feComposite
            in="SourceAlpha"
            in2="soft"
            operator="arithmetic"
            k2={1.6}
            k3={-1.6}
            result="edge"
          />
          <feFlood style={{ floodColor: rim }} result="rimF" />
          <feComposite in="rimF" in2="edge" operator="in" result="rim" />
          <feSpecularLighting
            in="height"
            surfaceScale={r2(2.4 + 2 * k)}
            specularConstant={r2(0.55 + 0.75 * k)}
            specularExponent={r2(8 + 34 * k)}
            style={{ lightingColor: "white" }}
            result="spec"
          >
            <fePointLight x={r2(W * 0.2)} y={r2(-H * 0.3)} z={r2(r * 5)} />
          </feSpecularLighting>
          <feComposite
            in="spec"
            in2="SourceAlpha"
            operator="in"
            result="specIn"
          />
          <feSpecularLighting
            in="height"
            surfaceScale={2.6}
            specularConstant={0.75}
            specularExponent={3}
            style={{ lightingColor: caustic }}
            result="caus"
          >
            <fePointLight x={r2(W * 0.85)} y={r2(H * 1.35)} z={r2(r * 2.5)} />
          </feSpecularLighting>
          <feComposite
            in="caus"
            in2="SourceAlpha"
            operator="in"
            result="causIn"
          />
          <feComponentTransfer in="causIn" result="causSoft">
            <feFuncA type="linear" slope={0.55} />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="body" />
            <feMergeNode in="rim" />
            <feMergeNode in="causSoft" />
            <feMergeNode in="specIn" />
          </feMerge>
        </filter>
        <radialGradient id={`${uid}-aura`}>
          <stop offset="0" style={{ stopColor: colour }} stopOpacity={0.55} />
          <stop offset="1" style={{ stopColor: colour }} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${uid}-inner`}>
          <stop offset="0" stopColor="white" stopOpacity={0.95} />
          <stop
            offset="0.45"
            style={{ stopColor: caustic }}
            stopOpacity={0.5}
          />
          <stop offset="1" style={{ stopColor: colour }} stopOpacity={0} />
        </radialGradient>
      </defs>
      <g ref={followRef}>
        {[0, 1, 2].map((i) => (
          <circle
            key={`a${i}`}
            ref={(node) => {
              auraRefs.current[i] = node;
            }}
            cx={r2(cx + (start[i]?.x ?? 0))}
            cy={r2(cy + (start[i]?.y ?? 0))}
            r={r2(r * 1.5)}
            fill={`url(#${uid}-aura)`}
            opacity={0.12}
          />
        ))}
        <g filter={`url(#${filterId})`}>
          {[0, 1, 2].map((i) => (
            <circle
              key={`b${i}`}
              ref={(node) => {
                beadRefs.current[i] = node;
              }}
              cx={r2(cx + (start[i]?.x ?? 0))}
              cy={r2(cy + (start[i]?.y ?? 0))}
              r={r2(r)}
              fill="black"
            />
          ))}
          {Array.from({ length: DROPS }, (_, i) => (
            <circle
              key={`d${i}`}
              ref={(node) => {
                dropRefs.current[i] = node;
              }}
              cx={r2(cx)}
              cy={r2(cy)}
              r={0}
              fill="black"
            />
          ))}
          {Array.from({ length: 3 + DROPS }, (_, i) => {
            const a = start[i];
            const b = start[(i + 1) % 3];
            return (
              <path
                key={`n${i}`}
                ref={(node) => {
                  neckRefs.current[i] = node;
                }}
                d={
                  i < 3 && a && b
                    ? neck(cx + a.x, cy + a.y, r, cx + b.x, cy + b.y, r)
                    : ""
                }
                fill="black"
              />
            );
          })}
        </g>
        <circle
          ref={innerRef}
          cx={r2(cx)}
          cy={r2(cy)}
          r={r2(r * 0.8)}
          fill={`url(#${uid}-inner)`}
          opacity={0}
        />
      </g>
    </svg>
  );

  const shared = {
    onPointerMove,
    onPointerLeave,
    style: { width: W, height: H },
  };

  return (
    <>
      {onPress ? (
        <button
          ref={(node) => {
            rootRef.current = node;
          }}
          type="button"
          aria-label={name}
          disabled={disabled}
          onPointerDown={() => {
            if (!disabled) squeeze();
          }}
          onClick={() => {
            if (disabled) return;
            onPress();
          }}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") squeeze();
          }}
          {...shared}
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center rounded-full",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          {art}
        </button>
      ) : (
        <div
          ref={(node) => {
            rootRef.current = node;
          }}
          role="img"
          aria-label={name}
          {...shared}
          className={cn(
            "relative inline-flex shrink-0 items-center justify-center",
            disabled && "opacity-50",
            className,
          )}
        >
          {art}
        </div>
      )}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </>
  );
}
