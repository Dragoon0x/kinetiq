"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type GearedPenInk = "cobalt" | "rose" | "lime";

export type GearedPenProps = {
  /** What is being made. The loader's accessible name, and shown beside the glyph unless `hideLabel`. @default "Loading" */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px. Detail simplifies below 40 and below 24. @default 24 */
  size?: number;
  /** How fast the wheel goes round, 0.5 to 2. @default 1 */
  speed?: number;
  /** The ring's size over the wheel's, 2 to 9: the figure's lobes. @default 5 */
  ratio?: number;
  /** How long the fading trail is, 0 to 1. @default 0.6 */
  trail?: number;
  /** The pen's colour. @default "cobalt" */
  ink?: GearedPenInk;
  /** Determinate, 0 to 1: how much of the closed figure is drawn. Without it the pen never stops. */
  progress?: number;
  /** The wheel was turned by hand or by key. */
  onTurn?: () => void;
  /** Keep drawing, but refuse the hand: the glyph is a picture, not a button. @default false */
  disabled?: boolean;
  className?: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const BOX = 64;
const MID = 32;
/** Where the wheel's rim runs: the ring's inside edge. */
const TRACK = 28;
const RING = 29.4;
/** The pen sits this far out from the wheel's centre, as a share of its radius. */
const PEN = 0.8;
/** The most chunks a trail is drawn in. */
const CHUNKS = 12;
/** How long a hand's (or a key's) spin takes to ease back to the wheel's pace, in s. */
const EASE_BACK = 0.8;
/** The wheel's own pace, rad/s at speed 1. */
const PACE = 2.2;

// The theme's bright accent, or the danger and success tokens' own
// lightness and chroma at the ink's hue: a thin line keeps its contrast in
// both themes.
const INKS: Record<GearedPenInk, string> = {
  cobalt: "var(--accent-bright)",
  rose: "oklch(from var(--danger) l c 8)",
  lime: "oklch(from var(--success) calc(l + 0.04) calc(c + 0.02) 130)",
};

type Tier = {
  chunks: number;
  /** Trail width at the head, in units. */
  width: number;
  /** Samples per radian of orbit, per lobe. */
  density: number;
  /** The longest trail, in radians. */
  most: number;
  teeth: boolean;
  wheel: boolean;
  holes: boolean;
};

/**
 * Strokes stay at least a pixel wide at every size. Under 24px the glyph is
 * the ring, the trail and the pen; under 40px the wheel joins them; the
 * teeth, the wheel's holes and its spoke come in at 40px.
 */
function tierOf(s: number): Tier {
  const width = r2(Math.max(1.3, BOX / s));
  if (s < 24) {
    return {
      chunks: 5,
      width,
      density: 1.2,
      most: 3 * Math.PI,
      teeth: false,
      wheel: false,
      holes: false,
    };
  }
  if (s < 40) {
    return {
      chunks: 8,
      width,
      density: 1.8,
      most: 5 * Math.PI,
      teeth: false,
      wheel: true,
      holes: false,
    };
  }
  return {
    chunks: CHUNKS,
    width,
    density: 2.4,
    most: 6 * Math.PI,
    teeth: true,
    wheel: true,
    holes: true,
  };
}

/** The turn that closes the figure: 2π times the ratio's denominator. */
function closureOf(k: number): number {
  for (let q = 1; q <= 12; q += 1) {
    if (Math.abs(k * q - Math.round(k * q)) < 1e-6) return 2 * Math.PI * q;
  }
  return 2 * Math.PI * 12;
}

type Pose = {
  theta: number;
  psi: number;
  k: number;
};

/** The pen at orbit θ and wheel turn ψ, for a ring-to-wheel ratio k. */
function penAt(theta: number, psi: number, k: number) {
  const r = TRACK / k;
  const a = TRACK - r;
  const d = PEN * r;
  return {
    x: MID + a * Math.cos(theta) + d * Math.cos(psi),
    y: MID + a * Math.sin(theta) - d * Math.sin(psi),
  };
}

/** A stretch of the figure: `count` samples ending at the pose, `span` radians long. */
function stretch(pose: Pose, span: number, count: number) {
  const out: string[] = [];
  const turn = pose.k - 1;
  for (let i = 0; i <= count; i += 1) {
    const s = span * (1 - i / count);
    const p = penAt(pose.theta - s, pose.psi - turn * s, pose.k);
    out.push(`${r2(p.x)} ${r2(p.y)}`);
  }
  return out;
}

type Frame = {
  chunks: string[];
  solid: string;
  ghost: string;
  wheelX: number;
  wheelY: number;
  wheelR: number;
  penX: number;
  penY: number;
  spoke: string;
  holes: string;
};

/**
 * Everything drawn, for one pose: the trail in chunks that taper to the
 * tail, the solid figure a determinate run has drawn, the faint whole figure
 * reduced motion steps along, and the wheel with its pen.
 */
function frameOf(
  T: Tier,
  pose: Pose,
  span: number,
  drawn: number | null,
  ghost: number | null,
): Frame {
  const perRadian = 3 + T.density * pose.k;
  const count = Math.max(
    T.chunks * 2,
    Math.min(520, Math.ceil(span * perRadian)),
  );
  const pts = stretch(pose, span, count);
  const chunks: string[] = [];
  for (let c = 0; c < CHUNKS; c += 1) {
    if (c >= T.chunks) {
      chunks.push("");
      continue;
    }
    // Neighbouring chunks share a sample, so the trail has no seams.
    const from = Math.floor((c * count) / T.chunks);
    const to = Math.floor(((c + 1) * count) / T.chunks);
    chunks.push(`M ${pts.slice(from, to + 1).join(" L ")}`);
  }

  const turn = pose.k - 1;
  let solid = "";
  if (drawn !== null && drawn > 0.001) {
    const n = Math.max(2, Math.min(900, Math.ceil(drawn * perRadian)));
    solid = `M ${stretch({ theta: drawn, psi: turn * drawn, k: pose.k }, drawn, n).join(" L ")}`;
  }
  let whole = "";
  if (ghost !== null) {
    const n = Math.min(900, Math.ceil(ghost * perRadian));
    whole = `M ${stretch({ theta: ghost, psi: turn * ghost, k: pose.k }, ghost, n).join(" L ")} Z`;
  }

  const r = TRACK / pose.k;
  const cx = MID + (TRACK - r) * Math.cos(pose.theta);
  const cy = MID + (TRACK - r) * Math.sin(pose.theta);
  const pen = penAt(pose.theta, pose.psi, pose.k);
  let holes = "";
  if (T.holes) {
    // The wheel's holes turn with it: its own turn is the pen's angle.
    const h = Math.min(1.1, r * 0.14);
    for (let j = 0; j < 3; j += 1) {
      const a = -pose.psi + Math.PI / 3 + (j * 2 * Math.PI) / 3;
      const x = cx + r * 0.5 * Math.cos(a);
      const y = cy + r * 0.5 * Math.sin(a);
      holes += `M ${r2(x + h)} ${r2(y)} A ${r2(h)} ${r2(h)} 0 1 0 ${r2(x - h)} ${r2(y)} A ${r2(h)} ${r2(h)} 0 1 0 ${r2(x + h)} ${r2(y)} `;
    }
  }
  return {
    chunks,
    solid,
    ghost: whole,
    wheelX: r2(cx),
    wheelY: r2(cy),
    wheelR: r2(r),
    penX: r2(pen.x),
    penY: r2(pen.y),
    spoke: T.holes ? `M ${r2(cx)} ${r2(cy)} L ${r2(pen.x)} ${r2(pen.y)}` : "",
    holes: holes.trim(),
  };
}

/** The ring's teeth, pointing in toward the wheel. */
function teethPath(): string {
  const out: string[] = [];
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * 2 * Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push(
      `M ${r2(MID + c * RING)} ${r2(MID + s * RING)} L ${r2(MID + c * (RING - 1.1))} ${r2(MID + s * (RING - 1.1))}`,
    );
  }
  return out.join(" ");
}
const TEETH = teethPath();

/**
 * Free-running, the wheel is a little off its setting and drifts on a slow
 * sine: each orbit lands the lobes a few degrees round from the last, so the
 * trail weaves a rosette that precesses at a changing rate and never closes.
 */
const drifted = (k: number, clock: number) =>
  Math.max(1.6, k + 0.18 + 0.14 * Math.sin((2 * Math.PI * clock) / 26));

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageShown = () => !document.hidden;
const serverShown = () => true;

/** Where the free-running pen starts, so the first paint has a trail. */
const START = 1.3;

type Machine = {
  mode: "d" | "i";
  /** Free-running pose: the wheel's orbit, its own turn, and the drift clock. */
  theta: number;
  psi: number;
  clock: number;
  /** Angular velocity, rad/s: the wheel's pace plus whatever a hand added. */
  omega: number;
  turning: boolean;
  angle: number;
  samples: { t: number; theta: number }[];
  raf: number;
  lastT: number;
  timer: number;
  timers: Set<number>;
  running: Map<string, AnimationPlaybackControls>;
};

type Api = {
  draw: () => void;
  start: () => void;
  halt: () => void;
  settle: () => void;
};

/**
 * An inline loader drawn by a geared pen. A wheel rolls inside a toothed
 * ring and a pen in the wheel traces a hypotrochoid — the ring over the
 * wheel is `ratio`, so the figure has that many lobes. Free-running, the
 * trail fades behind the pen so the drawing is always in motion, and the
 * ratio drifts on a slow sine, so the lobes precess and the figure never
 * quite repeats: the wheel's own turn is accumulated rather than computed
 * from the orbit, so a changing ratio never makes the pen jump. Given
 * `progress`, the ratio holds still and the figure is drawn solid, closing
 * at 1, when the pen lifts.
 *
 * The glyph is a button: drag around its centre and the wheel follows the
 * pointer's angle 1:1; let go and a free-running wheel keeps the throw and
 * eases back to its own pace, while a determinate one glides home to the
 * progress carrying the release velocity. Arrow keys turn it a notch, Enter
 * or Space spins it round. The frame loop runs only on screen in a visible
 * page. Under reduced motion there is no loop and no drift: the whole figure
 * is drawn faintly and a bright stretch steps along it.
 */
export function GearedPen({
  label = "Loading",
  hideLabel = false,
  size = 24,
  speed = 1,
  ratio = 5,
  trail = 0.6,
  ink = "cobalt",
  progress,
  onTurn,
  disabled = false,
  className,
}: GearedPenProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const S = Math.round(clamp(size, 12, 256));
  const T = tierOf(S);
  const k = clamp(ratio, 2, 9);
  const pace = clamp(speed, 0.5, 2);
  const span = Math.min(
    T.most,
    lerp(0.9 * Math.PI, 6 * Math.PI, clamp(trail, 0, 1)),
  );
  const comet = Math.min(
    T.most,
    lerp(0.6 * Math.PI, 2.4 * Math.PI, clamp(trail, 0, 1)),
  );
  const closure = closureOf(k);
  const determinate = progress !== undefined;
  const p = clamp(progress ?? 0, 0, 1);
  const home = p * closure;
  const colour = INKS[ink] ?? INKS.cobalt;

  const [onScreen, setOnScreen] = React.useState(true);
  const pageVisible = React.useSyncExternalStore(
    subscribeVisibility,
    pageShown,
    serverShown,
  );
  const live = onScreen && pageVisible;

  const head = useMotionValue(home);
  const drawn = useMotionValue(home);
  const [mv] = React.useState(() => {
    const first = determinate
      ? frameOf(T, { theta: home, psi: (k - 1) * home, k }, comet, home, null)
      : frameOf(
          T,
          { theta: START, psi: (drifted(k, 0) - 1) * START, k: drifted(k, 0) },
          span,
          null,
          motionSafe ? null : closure,
        );
    return {
      chunks: first.chunks.map((d) => motionValue(d)),
      solid: motionValue(first.solid),
      ghost: motionValue(first.ghost),
      wheelX: motionValue(first.wheelX),
      wheelY: motionValue(first.wheelY),
      wheelR: motionValue(first.wheelR),
      penX: motionValue(first.penX),
      penY: motionValue(first.penY),
      spoke: motionValue(first.spoke),
      holes: motionValue(first.holes),
      comet: motionValue(determinate ? 0 : 1),
      lift: motionValue(determinate && p >= 1 ? 0.3 : 1),
    };
  });

  const machine = React.useRef<Machine>({
    mode: determinate ? "d" : "i",
    theta: START,
    psi: (drifted(k, 0) - 1) * START,
    clock: 0,
    omega: PACE * pace,
    turning: false,
    angle: 0,
    samples: [],
    raf: 0,
    lastT: 0,
    timer: 0,
    timers: new Set(),
    running: new Map(),
  });
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    const m = machine.current;
    m.running.get(key)?.stop();
    m.running.set(key, controls);
  };

  const after = (ms: number, fn: () => void) => {
    const m = machine.current;
    const id = window.setTimeout(() => {
      m.timers.delete(id);
      fn();
    }, Math.round(ms));
    m.timers.add(id);
  };

  /** Writes one frame into the motion values: no React render per frame. */
  const draw = () => {
    const m = machine.current;
    let f: Frame;
    if (determinate) {
      const th = head.get();
      const dr = drawn.get();
      f = frameOf(T, { theta: th, psi: (k - 1) * th, k }, comet, dr, null);
      const away = Math.abs(th - dr);
      mv.comet.set(r2(Math.min(1, away / 0.6)));
      mv.lift.set(p >= 1 && away < 0.05 ? 0.3 : 1);
    } else {
      const pose = motionSafe
        ? { theta: m.theta, psi: m.psi, k: drifted(k, m.clock) }
        : { theta: m.theta, psi: (k - 1) * m.theta, k };
      f = frameOf(T, pose, span, null, motionSafe ? null : closure);
      mv.comet.set(1);
      mv.lift.set(1);
    }
    f.chunks.forEach((d, i) => mv.chunks[i]?.set(d));
    mv.solid.set(f.solid);
    mv.ghost.set(f.ghost);
    mv.wheelX.set(f.wheelX);
    mv.wheelY.set(f.wheelY);
    mv.wheelR.set(f.wheelR);
    mv.penX.set(f.penX);
    mv.penY.set(f.penY);
    mv.spoke.set(f.spoke);
    mv.holes.set(f.holes);
  };

  /** Free-running: the wheel's pace, a hand's spin easing back into it, the drift. */
  const tick = (now: number) => {
    const m = machine.current;
    m.raf = window.requestAnimationFrame((t) => tickRef.current(t));
    const dt = Math.min(0.05, Math.max(0, (now - (m.lastT || now)) / 1000));
    m.lastT = now;
    // A wheel under the hand does not drift: only the hand moves it.
    if (!m.turning) {
      m.clock += dt;
      const own = PACE * pace;
      m.omega += (own - m.omega) * (1 - Math.exp(-dt / EASE_BACK));
      const kk = drifted(k, m.clock);
      m.theta += m.omega * dt;
      m.psi += (kk - 1) * m.omega * dt;
    }
    draw();
  };
  const tickRef = React.useRef(tick);

  /** Reduced motion: the bright stretch steps along the faint whole figure. */
  const step = () => {
    const m = machine.current;
    m.timer = window.setTimeout(step, Math.round(650 / pace));
    if (m.turning) return;
    m.theta += span / 2;
    m.psi = (k - 1) * m.theta;
    draw();
  };
  const stepRef = React.useRef(step);

  const halt = () => {
    const m = machine.current;
    window.cancelAnimationFrame(m.raf);
    m.raf = 0;
    window.clearTimeout(m.timer);
    m.timer = 0;
    for (const id of m.timers) window.clearTimeout(id);
    m.timers.clear();
    for (const c of m.running.values()) c.stop();
    m.running.clear();
    m.lastT = 0;
    // Stopped means finished: a spin still easing out is given all at once,
    // and a determinate pen lands on its progress.
    const own = PACE * pace;
    if (m.mode === "i" && !m.turning && motionSafe) {
      const extra = (m.omega - own) * EASE_BACK;
      m.theta += extra;
      m.psi += (drifted(k, m.clock) - 1) * extra;
    }
    m.omega = own;
    if (m.mode === "d" && !m.turning) {
      head.set(home);
      drawn.set(home);
    }
    draw();
  };

  const start = () => {
    const m = machine.current;
    const mode = determinate ? "d" : "i";
    if (m.mode !== mode) {
      m.mode = mode;
      if (mode === "i") {
        // Free again: it carries on from where the pen is.
        m.theta = head.get();
        m.psi = (k - 1) * m.theta;
        m.omega = PACE * pace;
      } else {
        head.set(home);
        drawn.set(home);
      }
    }
    if (!determinate && live) {
      if (motionSafe) {
        m.lastT = 0;
        m.raf = window.requestAnimationFrame((t) => tickRef.current(t));
      } else {
        m.timer = window.setTimeout(
          () => stepRef.current(),
          Math.round(650 / pace),
        );
      }
    }
    draw();
  };

  /** A determinate wheel let go, or turned by a key: it glides home. */
  const settle = (velocity = 0) => {
    const m = machine.current;
    if (m.turning) return;
    if (!motionSafe || !live) {
      m.running.get("head")?.stop();
      head.set(home);
      return;
    }
    run("head", animate(head, home, { ...springs.glide, velocity }));
  };

  /** A notch (or a spin) from the keyboard or a tap. */
  const turn = (delta: number) => {
    const m = machine.current;
    if (disabled) return;
    onTurn?.();
    if (determinate) {
      if (!motionSafe || !live) {
        head.set(head.get() + delta);
        after(500, () => api.current?.settle());
        return;
      }
      run(
        "head",
        animate(head, head.get() + delta, {
          ...springs.snap,
          onComplete: () => after(420, () => api.current?.settle()),
        }),
      );
      return;
    }
    if (!motionSafe || !live) {
      m.theta += delta;
      m.psi += (drifted(k, m.clock) - 1) * delta;
      draw();
      return;
    }
    // An impulse whose excess over the pace decays in EASE_BACK: it adds
    // exactly `delta` of turn, spread over a smooth second.
    m.omega += delta / EASE_BACK;
  };

  const angleOf = (x: number, y: number) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const dx = x - (rect.left + rect.width / 2);
    const dy = y - (rect.top + rect.height / 2);
    // Near the middle the angle means nothing: the wheel waits.
    if (Math.hypot(dx, dy) < rect.width * 0.1) return null;
    return Math.atan2(dy, dx);
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset, event }) => {
      const m = machine.current;
      m.turning = true;
      m.running.get("head")?.stop();
      m.angle =
        angleOf(point.x - offset.x, point.y - offset.y) ??
        angleOf(point.x, point.y) ??
        0;
      const theta = determinate ? head.get() : m.theta;
      m.samples = [{ t: event.timeStamp, theta }];
      onTurn?.();
    },
    onMove: ({ point, event }) => {
      const m = machine.current;
      const a = angleOf(point.x, point.y);
      if (a === null) return;
      let delta = a - m.angle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      m.angle = a;
      let theta: number;
      if (determinate) {
        theta = head.get() + delta;
        head.set(theta);
      } else {
        m.theta += delta;
        m.psi += (drifted(k, m.clock) - 1) * delta;
        theta = m.theta;
        if (!m.raf) draw();
      }
      m.samples.push({ t: event.timeStamp, theta });
      while (
        m.samples.length > 2 &&
        event.timeStamp - (m.samples[0]?.t ?? 0) > 80
      ) {
        m.samples.shift();
      }
    },
    onEnd: () => {
      const m = machine.current;
      m.turning = false;
      const first = m.samples[0];
      const last = m.samples[m.samples.length - 1];
      const dt = first && last ? (last.t - first.t) / 1000 : 0;
      const omega =
        first && last && dt > 0.008
          ? clamp((last.theta - first.theta) / dt, -40, 40)
          : 0;
      if (determinate) {
        settle(omega);
      } else if (motionSafe && live) {
        // The throw carries on and eases back into the wheel's own pace.
        m.omega = omega;
      }
    },
    onCancel: () => {
      machine.current.turning = false;
      if (determinate) settle(0);
    },
    onTap: () => turn(2 * Math.PI),
  });

  React.useEffect(() => {
    api.current = { draw, start, halt, settle };
    tickRef.current = tick;
    stepRef.current = step;
  });

  // The loop lives while the glyph is on screen in a visible page; stopping
  // lands every part, so a StrictMode re-run or a scroll resumes cleanly.
  React.useEffect(() => {
    const now = api.current;
    now?.start();
    return () => now?.halt();
  }, [live, motionSafe, determinate]);

  // Determinate: the figure draws on to the progress, and the pen with it
  // unless a hand is holding the wheel.
  React.useEffect(() => {
    const m = machine.current;
    if (!determinate) return;
    if (!motionSafe || !live) {
      m.running.get("drawn")?.stop();
      drawn.set(home);
      if (!m.turning) {
        m.running.get("head")?.stop();
        head.set(home);
      }
      api.current?.draw();
      return;
    }
    run("drawn", animate(drawn, home, springs.glide));
    if (!m.turning) run("head", animate(head, home, springs.glide));
    // Only a new target moves the figure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [determinate, home]);

  // Anything else that changes the drawing (ratio, trail, size) redraws it.
  React.useEffect(() => {
    api.current?.draw();
  }, [k, span, comet, S, p]);

  React.useEffect(() => {
    const redraw = () => api.current?.draw();
    const offHead = head.on("change", redraw);
    const offDrawn = drawn.on("change", redraw);
    return () => {
      offHead();
      offDrawn();
    };
  }, [head, drawn]);

  const bindRoot = React.useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) return;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        setOnScreen(Boolean(entry?.isIntersecting));
      });
      watcher.observe(node);
      return () => watcher.disconnect();
    },
    [setOnScreen],
  );

  const pct = Math.round(p * 100);
  const ring = r2(Math.max(0.8, (BOX / S) * 0.8));
  const fine = r2(Math.max(0.6, (BOX / S) * 0.6));

  const glyph = (
    <svg
      aria-hidden
      width={S}
      height={S}
      viewBox={`0 0 ${BOX} ${BOX}`}
      className="block overflow-hidden"
    >
      <circle
        cx={MID}
        cy={MID}
        r={RING}
        fill="none"
        strokeWidth={ring}
        className={cn(
          "stroke-ink-3/50 transition-colors",
          !T.wheel &&
            !disabled &&
            "group-hover/geared-pen:stroke-ink-2 group-focus-visible/geared-pen:stroke-ink-2",
        )}
      />
      {T.teeth ? (
        <path
          d={TEETH}
          fill="none"
          strokeWidth={0.6}
          className="stroke-ink-3/40"
        />
      ) : null}
      <motion.path
        d={mv.ghost}
        fill="none"
        strokeWidth={r2(T.width * 0.7)}
        strokeLinejoin="round"
        opacity={0.2}
        style={{ stroke: colour }}
      />
      <motion.path
        d={mv.solid}
        fill="none"
        strokeWidth={T.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
        style={{ stroke: colour }}
      />
      <motion.g style={{ opacity: mv.comet }}>
        {mv.chunks.slice(0, T.chunks).map((d, i) => {
          const share = (i + 1) / T.chunks;
          return (
            <motion.path
              key={i}
              d={d as MotionValue<string>}
              fill="none"
              strokeWidth={r2(T.width * (0.45 + 0.55 * share))}
              // Butt ends where chunks meet, so no seam paints twice; only
              // the head is rounded, under the pen.
              strokeLinecap={i === T.chunks - 1 ? "round" : "butt"}
              strokeLinejoin="round"
              opacity={r2(share ** 1.5)}
              style={{ stroke: colour }}
            />
          );
        })}
      </motion.g>
      {T.wheel ? (
        <motion.circle
          cx={mv.wheelX}
          cy={mv.wheelY}
          r={mv.wheelR}
          strokeWidth={fine}
          className={cn(
            "fill-ink-3/[0.06] stroke-ink-3/70 transition-colors",
            !disabled &&
              "group-hover/geared-pen:stroke-ink-2 group-focus-visible/geared-pen:stroke-ink-2",
          )}
        />
      ) : null}
      {T.holes ? (
        <>
          <motion.path
            d={mv.holes}
            fill="none"
            strokeWidth={0.5}
            className="stroke-ink-3/70"
          />
          <motion.path
            d={mv.spoke}
            fill="none"
            strokeWidth={0.5}
            className="stroke-ink-3/50"
          />
        </>
      ) : null}
      <motion.circle
        cx={mv.penX}
        cy={mv.penY}
        r={r2(T.width * 1.25)}
        className="transition-opacity duration-300"
        style={{ fill: colour, opacity: mv.lift }}
      />
    </svg>
  );

  return (
    <span
      ref={bindRoot}
      className={cn(
        "relative inline-flex max-w-full items-center gap-2 align-middle text-sm",
        className,
      )}
    >
      {disabled ? (
        <span className="inline-flex shrink-0" style={{ width: S, height: S }}>
          {glyph}
        </span>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label="Turn the wheel"
          aria-describedby={hintId}
          onClick={(event) => {
            // Pointer turns arrive through the drag; a click with no pointer
            // behind it — Enter, Space, assistive technology — spins it.
            if (event.detail === 0) turn(2 * Math.PI);
          }}
          onKeyDown={(event) => {
            const notch = Math.PI / 4;
            if (event.key === "ArrowRight" || event.key === "ArrowUp") {
              event.preventDefault();
              turn(notch);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
              event.preventDefault();
              turn(-notch);
            }
          }}
          {...drag}
          className={cn(
            "group/geared-pen relative inline-flex shrink-0 cursor-grab touch-none rounded-full outline-none select-none [-webkit-touch-callout:none] active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
          style={{ width: S, height: S }}
        >
          {glyph}
        </button>
      )}
      <span
        role={determinate ? "progressbar" : "status"}
        aria-labelledby={labelId}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        aria-valuenow={determinate ? pct : undefined}
        aria-valuetext={determinate ? `${pct}%` : undefined}
        className={hideLabel ? "sr-only" : "min-w-0"}
      >
        <span id={labelId} title={label} className="block truncate text-ink-2">
          {label}
        </span>
      </span>
      {disabled ? null : (
        <span id={hintId} className="sr-only">
          Drag around the centre to turn the wheel; arrow keys turn it a notch,
          Enter spins it.
        </span>
      )}
    </span>
  );
}
