"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, useDrag, wheelPixels } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type RubberBeltItem = {
  /** An image URL. Without one, the belt draws a landscape of its own. */
  src?: string;
  /** What the picture shows: its accessible name. */
  alt: string;
  /** A short line under the picture. */
  caption?: string;
};

export type RubberBeltDirection = "left" | "right" | "still";

export type RubberBeltProps = {
  /** The pictures on the belt. */
  items?: RubberBeltItem[];
  /** How soft the rubber is, 0 (a stiff belt, almost rigid) to 1 (a soft one that stretches far and wobbles). @default 0.5 */
  elasticity?: number;
  /** Space between pictures at rest, px. @default 16 */
  gap?: number;
  /** Which way the belt drifts on its own; "still" holds it. @default "left" */
  direction?: RubberBeltDirection;
  /** The idle drift's speed, px/s. @default 22 */
  speed?: number;
  /** How much a picture's height answers its stretch, 0 (width only) to 1 (it keeps its area). @default 0.6 */
  squash?: number;
  /** Picture width, px. By default 30% of the belt's width, between 104 and 176. */
  itemWidth?: number;
  /** Picture height as a share of its width. @default 0.72 */
  aspect?: number;
  /** Controlled index of the picture pulled to the centre. */
  value?: number;
  /** Initial centred picture when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the click, key, drag or wheel that pulls a new picture to the centre. */
  onValueChange?: (index: number) => void;
  /** Fires when the centred picture is clicked or Enter is pressed on it. */
  onSelect?: (index: number) => void;
  /** What the belt is doing: drifting on its own, held by a hand, pulling a picture in, or at rest. */
  onMotionChange?: (state: RubberBeltState) => void;
  /** Quiet time after a hand or key before the drift resumes, ms. @default 2400 */
  resumeAfter?: number;
  /** The mouse wheel and trackpad drive the belt. @default true */
  wheel?: boolean;
  /** Show each picture's caption. @default true */
  captions?: boolean;
  /** Hold the idle drift; hands and keys still move the belt. @default false */
  paused?: boolean;
  /** No input at all, and no drift. @default false */
  disabled?: boolean;
  /** The carousel's accessible name. @default "Pictures" */
  label?: string;
  className?: string;
};

export type RubberBeltState = "drifting" | "held" | "pulling" | "resting";

export const defaultBeltItems: RubberBeltItem[] = [
  { alt: "White salt flats under a pale sky", caption: "Salt flats" },
  { alt: "Pine ridges fading into mist", caption: "Pine ridge" },
  {
    alt: "A harbour at dusk, the sun low over the water",
    caption: "Harbour at dusk",
  },
  { alt: "Warm dunes rolling under a blue sky", caption: "Dune field" },
  { alt: "Snow peaks above a turquoise lake", caption: "Glacier lake" },
  { alt: "Rows of orchard trees over green hills", caption: "Orchard rows" },
  { alt: "Dark basalt cliffs over a grey sea", caption: "Basalt coast" },
  { alt: "A meadow at night under a moon and stars", caption: "Night meadow" },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const STEP = 1 / 240;
const MAX_COPIES = 6;
/** Headroom above and below a picture for its squash, as a share of its height. */
const HEADROOM = 0.09;
const CAPTION = 26;
/** Below this share of the pitch two pictures touch, and the rubber turns hard. */
const CONTACT = 0.55;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x2545f491) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Grip =
  | { kind: "rest" }
  | { kind: "drift" }
  | { kind: "hand"; to: number }
  | { kind: "pull"; to: number }
  | { kind: "tween"; from: number; to: number; t: number }
  | { kind: "chase"; to: number };

type Knobs = {
  elasticity: number;
  direction: RubberBeltDirection;
  speed: number;
  squash: number;
  motionSafe: boolean;
  drifting: boolean;
};

type Belt = {
  configure: (k: Knobs) => void;
  layout: (count: number, pitch: number, width: number, centre: number) => void;
  bind: (
    j: number,
    frame: HTMLElement | null,
    face: HTMLElement | null,
  ) => void;
  nearest: (shift?: number) => number;
  nodeOf: (item: number, copies: number, count: number) => number;
  grab: (j: number) => void;
  hand: (offset: number) => void;
  /** Brings node j in without choosing it (a keyboard visitor arriving). */
  centre: (j: number) => void;
  letGo: (velocity: number) => number;
  pull: (j: number) => void;
  wheel: (delta: number) => void;
  wheelEnd: () => number;
  drift: () => void;
  wake: () => void;
  dispose: () => void;
};

/**
 * The belt outside React: a ring of masses joined by damped springs, one of
 * them driven, integrated at 240 Hz; every frame each picture is drawn on
 * the stretch of belt it rides.
 */
function createBelt(
  visible: { current: boolean },
  report: { current: (state: RubberBeltState) => void },
): Belt {
  let s = new Float64Array(0);
  let v = new Float64Array(0);
  let frames: (HTMLElement | null)[] = [];
  let faces: (HTMLElement | null)[] = [];
  let m = 0;
  let pitch = 1;
  let width = 1;
  let grip = 0;
  let g: Grip = { kind: "rest" };
  let gv = 0;
  let k: Knobs = {
    elasticity: 0.5,
    direction: "left",
    speed: 22,
    squash: 0.6,
    motionSafe: true,
    drifting: false,
  };
  let raf = 0;
  let last = 0;
  let carry = 0;
  let disposed = false;
  let state: RubberBeltState = "resting";
  /** Where the grip was when this frame began, and where the hand took it. */
  let handFrom = 0;
  let handStart = 0;

  const loop = () => (m ? m * pitch : 1);
  const wrapped = (x: number) => {
    const L = loop();
    return x - L * Math.round(x / L);
  };

  const say = (next: RubberBeltState) => {
    if (next === state) return;
    state = next;
    report.current(next);
  };

  /** Spring constants from the elasticity: soft rubber is slow and stretches far. */
  const rubber = () => {
    const e = clamp01(k.elasticity);
    const stiff = lerp(9000, 520, Math.pow(e, 0.8));
    return {
      stiff,
      // Damping along each link, and against the driven picture's speed,
      // so a soft belt wobbles a little and a stiff one hardly at all.
      link: 2 * lerp(0.22, 0.12, e) * Math.sqrt(stiff),
      drag: lerp(14, 3.5, e),
    };
  };

  const nearest = (shift = 0) => {
    let best = 0;
    let d = Infinity;
    for (let j = 0; j < m; j += 1) {
      const x = Math.abs(wrapped((s[j] ?? 0) + shift));
      if (x < d) {
        d = x;
        best = j;
      }
    }
    return best;
  };

  /** Hands the drive to node j without a jump: it keeps its place and speed. */
  const handTo = (j: number) => {
    gv = v[j] ?? 0;
    grip = j;
  };

  const centreOf = (j: number) => {
    const x = s[j] ?? 0;
    return x - wrapped(x);
  };

  /** One 240 Hz step: the driven picture, then the rubber. */
  const step = (dt: number, handT: number) => {
    const L = loop();
    let sg = s[grip] ?? 0;
    switch (g.kind) {
      case "drift": {
        const want =
          k.direction === "still"
            ? 0
            : (k.direction === "left" ? -1 : 1) * k.speed;
        gv += (want - gv) * (1 - Math.exp(-dt * 2.2));
        sg += gv * dt;
        break;
      }
      case "hand": {
        const next = lerp(handFrom, g.to, handT);
        gv = (next - sg) / dt;
        sg = next;
        break;
      }
      case "pull": {
        const S = springs.snap;
        const a = (S.stiffness * (g.to - sg) - S.damping * gv) / S.mass;
        gv += a * dt;
        sg += gv * dt;
        break;
      }
      case "chase": {
        const a = 420 * (g.to - sg) - 2 * Math.sqrt(420) * gv;
        gv += a * dt;
        sg += gv * dt;
        break;
      }
      case "tween": {
        g.t = Math.min(1, g.t + dt / 0.24);
        const e = 1 - Math.pow(1 - g.t, 3);
        const next = lerp(g.from, g.to, e);
        gv = (next - sg) / dt;
        sg = next;
        break;
      }
      default:
        gv = 0;
    }
    s[grip] = sg;
    v[grip] = gv;
    if (!k.motionSafe) {
      // Reduced motion: the belt is rigid; every picture keeps its pitch.
      for (let j = 0; j < m; j += 1) {
        if (j === grip) continue;
        const off = j - grip;
        s[j] = sg + off * pitch;
        v[j] = gv;
      }
      return;
    }
    const { stiff, link, drag } = rubber();
    const hard = stiff * 8;
    for (let j = 0; j < m; j += 1) {
      if (j === grip) continue;
      const jl = j === 0 ? m - 1 : j - 1;
      const jr = j === m - 1 ? 0 : j + 1;
      const sl = (s[jl] ?? 0) - (j === 0 ? L : 0);
      const sr = (s[jr] ?? 0) + (j === m - 1 ? L : 0);
      const sj = s[j] ?? 0;
      const vj = v[j] ?? 0;
      const gl = sj - sl;
      const gr = sr - sj;
      let f =
        stiff * (gr - pitch) -
        stiff * (gl - pitch) +
        link * ((v[jr] ?? 0) - vj) -
        link * (vj - (v[jl] ?? 0)) -
        drag * (vj - gv);
      if (gl < pitch * CONTACT) f += hard * (pitch * CONTACT - gl);
      if (gr < pitch * CONTACT) f -= hard * (pitch * CONTACT - gr);
      v[j] = vj + f * dt;
    }
    for (let j = 0; j < m; j += 1) {
      if (j === grip) continue;
      s[j] = (s[j] ?? 0) + (v[j] ?? 0) * dt;
    }
  };

  /** Writes every picture's place and stretch. */
  const paint = () => {
    const L = loop();
    const f = width / (2 * pitch);
    const squash = k.motionSafe ? clamp01(k.squash) : 0;
    for (let j = 0; j < m; j += 1) {
      const frame = frames[j];
      const face = faces[j];
      if (!frame) continue;
      const jl = j === 0 ? m - 1 : j - 1;
      const jr = j === m - 1 ? 0 : j + 1;
      const sj = s[j] ?? 0;
      const gl = sj - ((s[jl] ?? 0) - (j === 0 ? L : 0));
      const gr = (s[jr] ?? 0) + (j === m - 1 ? L : 0) - sj;
      // The picture spans its share of the belt either side of its centre,
      // so pictures stretch and bunch with the rubber and never overlap.
      const span = k.motionSafe ? (gl + gr) * f : width;
      const shift = k.motionSafe ? ((gr - gl) * f) / 2 : 0;
      const sx = clamp(span / width, 0.4, 2.4);
      const sy = clamp(
        1 + squash * (1 / Math.sqrt(sx) - 1),
        0.82,
        1 + HEADROOM * 2,
      );
      const x = wrapped(sj) + shift - width / 2;
      frame.style.transform = `translate3d(${r2(x)}px, 0, 0)`;
      if (face) face.style.transform = `scale(${r3(sx)}, ${r3(sy)})`;
    }
  };

  /** Whether the rubber and the drive have settled. */
  const settled = () => {
    if (g.kind === "drift" || g.kind === "hand" || g.kind === "chase")
      return false;
    if (g.kind === "pull" || g.kind === "tween") {
      const sg = s[grip] ?? 0;
      const done =
        g.kind === "tween"
          ? g.t >= 1
          : Math.abs(g.to - sg) < 0.2 && Math.abs(gv) < 4;
      if (!done) return false;
      s[grip] = g.to;
      v[grip] = 0;
      gv = 0;
      g = { kind: "rest" };
      say("resting");
    }
    const L = loop();
    for (let j = 0; j < m; j += 1) {
      const jr = j === m - 1 ? 0 : j + 1;
      const gap = (s[jr] ?? 0) + (j === m - 1 ? L : 0) - (s[j] ?? 0);
      if (Math.abs(gap - pitch) > 0.15 || Math.abs(v[j] ?? 0) > 2) return false;
    }
    // Snap the last hair so the belt rests exactly true.
    const base = s[grip] ?? 0;
    for (let j = 0; j < m; j += 1) {
      const off = j - grip;
      s[j] = base + off * pitch;
      v[j] = 0;
    }
    return true;
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed || !visible.current || document.hidden || m === 0) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    carry += dt;
    const n = Math.min(24, Math.floor(carry / STEP));
    carry -= n * STEP;
    if (n === 24) carry = 0;
    handFrom = s[grip] ?? 0;
    for (let i = 0; i < n; i += 1) step(STEP, (i + 1) / n);
    paint();
    if (!settled()) raf = window.requestAnimationFrame(tick);
    else {
      paint();
      last = 0;
    }
  };

  const kick = () => {
    if (disposed || raf || !visible.current || document.hidden) return;
    raf = window.requestAnimationFrame(tick);
  };

  return {
    configure(next) {
      const was = k;
      k = next;
      if (next.drifting && g.kind === "rest") {
        handTo(nearest());
        g = { kind: "drift" };
        say("drifting");
      } else if (!next.drifting && g.kind === "drift") {
        // The drift hands over to a pull that brings the nearest picture in.
        const j = nearest(gv * 0.4);
        handTo(j);
        g = next.motionSafe
          ? { kind: "pull", to: centreOf(j) }
          : { kind: "tween", from: s[j] ?? 0, to: centreOf(j), t: 0 };
        say("pulling");
      }
      if (was.motionSafe !== next.motionSafe || was.squash !== next.squash)
        paint();
      kick();
    },
    layout(count, nextPitch, nextWidth, centre) {
      const fresh = count !== m;
      if (fresh) {
        s = new Float64Array(count);
        v = new Float64Array(count);
        frames = Array.from({ length: count }, (_, j) => frames[j] ?? null);
        faces = Array.from({ length: count }, (_, j) => faces[j] ?? null);
        m = count;
        for (let j = 0; j < m; j += 1) {
          // Positions run in index order round the ring; only the drawing
          // wraps, so every link, the last one included, starts one pitch long.
          const off = j - centre;
          s[j] = off * nextPitch;
        }
        grip = clamp(centre, 0, m - 1);
        // A belt laid while it drifts keeps drifting.
        if (g.kind !== "drift") g = { kind: "rest" };
      } else if (nextPitch !== pitch) {
        // A new pitch keeps the picture nearest the centre where it is.
        const ratio = nextPitch / (pitch || nextPitch);
        for (let j = 0; j < m; j += 1) s[j] = (s[j] ?? 0) * ratio;
        if (g.kind === "pull" || g.kind === "chase" || g.kind === "hand") {
          g = { kind: "pull", to: centreOf(nearest()) };
        }
      }
      pitch = nextPitch;
      width = nextWidth;
      paint();
      kick();
    },
    bind(j, frame, face) {
      frames[j] = frame;
      faces[j] = face;
    },
    nearest,
    nodeOf(item, copies, count) {
      // The copy of this picture nearest the centre.
      let best = item;
      let d = Infinity;
      for (let c = 0; c < copies; c += 1) {
        const j = c * count + item;
        const x = Math.abs(wrapped(s[j] ?? 0));
        if (x < d) {
          d = x;
          best = j;
        }
      }
      return best;
    },
    grab(j) {
      handTo(j);
      handStart = s[j] ?? 0;
      g = { kind: "hand", to: handStart };
      say("held");
      kick();
    },
    hand(offset) {
      if (g.kind !== "hand") return;
      g.to = handStart + offset;
      if (!k.motionSafe) s[grip] = g.to;
      kick();
    },
    centre(j) {
      if (g.kind === "hand" || g.kind === "chase") return;
      if (Math.abs(wrapped(s[j] ?? 0)) < 0.5 && g.kind === "rest") return;
      if (grip !== j) handTo(j);
      g = k.motionSafe
        ? { kind: "pull", to: centreOf(j) }
        : { kind: "tween", from: s[j] ?? 0, to: centreOf(j), t: 0 };
      say("pulling");
      kick();
    },
    letGo(velocity) {
      // The landing of a throw decides which picture the belt brings in.
      const sg = s[grip] ?? 0;
      const landing = project(sg, velocity, 0.995);
      const j = nearest(landing - sg);
      handTo(j);
      if (k.motionSafe) {
        // Aim for where that picture comes to rest centred after the throw.
        const ahead = (s[j] ?? 0) + (landing - sg);
        g = { kind: "pull", to: ahead - wrapped(ahead) };
      } else {
        gv = 0;
        g = { kind: "tween", from: s[j] ?? 0, to: centreOf(j), t: 0 };
      }
      say("pulling");
      kick();
      return j;
    },
    pull(j) {
      const from = s[j] ?? 0;
      if (grip !== j) handTo(j);
      g = k.motionSafe
        ? { kind: "pull", to: centreOf(j) }
        : { kind: "tween", from, to: centreOf(j), t: 0 };
      say("pulling");
      kick();
    },
    wheel(delta) {
      if (g.kind !== "chase") {
        handTo(nearest());
        g = { kind: "chase", to: s[grip] ?? 0 };
        say("held");
      }
      g.to -= delta;
      if (!k.motionSafe) {
        s[grip] = g.to;
        gv = 0;
      }
      kick();
    },
    wheelEnd() {
      const j = nearest(gv * 0.25);
      handTo(j);
      g = k.motionSafe
        ? { kind: "pull", to: centreOf(j) }
        : { kind: "tween", from: s[j] ?? 0, to: centreOf(j), t: 0 };
      say("pulling");
      kick();
      return j;
    },
    drift() {
      if (g.kind !== "rest") return;
      handTo(nearest());
      g = { kind: "drift" };
      say("drifting");
      kick();
    },
    wake() {
      paint();
      kick();
    },
    dispose() {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/**
 * An endless strip of pictures riding a rubber belt across the frame. The
 * belt is a ring of masses — one per picture — joined by damped springs: one
 * picture is driven (the one in your hand, the one being pulled to the
 * centre, or the one leading the idle drift) and the rest follow through the
 * rubber, so when the belt speeds up the pictures behind stretch apart and
 * the ones ahead bunch, and when it brakes the trailing ones catch up and
 * bunch. Each picture is drawn on its own stretch of belt — its width from
 * the spacing either side, its height answering the other way — so it
 * squashes and stretches with the belt's acceleration and relaxes back to
 * true as the springs settle.
 *
 * Click a picture and the belt pulls it to the centre on the snap spring,
 * with one elastic overshoot the rubber carries down the strip. A drag holds
 * a picture 1:1 and a throw lands on the picture its projection reaches; the
 * wheel drives it too. It is a carousel: the centred picture is the tab stop,
 * arrows pull the next one in, Home and End the first and last, Enter picks
 * it. Under reduced motion the belt is rigid, does not drift, and moves on a
 * short tween.
 */
export function RubberBelt({
  items = defaultBeltItems,
  elasticity = 0.5,
  gap = 16,
  direction = "left",
  speed = 22,
  squash = 0.6,
  itemWidth,
  aspect = 0.72,
  value,
  defaultValue = 0,
  onValueChange,
  onSelect,
  onMotionChange,
  resumeAfter = 2400,
  wheel = true,
  captions = true,
  paused = false,
  disabled = false,
  label = "Pictures",
  className,
}: RubberBeltProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const count = items.length;
  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, Math.max(0, count - 1)),
  );
  const current = clamp(Math.round(value ?? own), 0, Math.max(0, count - 1));
  const [copies, setCopies] = React.useState(1);
  const [announce, setAnnounce] = React.useState("");
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [quiet, setQuiet] = React.useState(true);
  const [onScreen, setOnScreen] = React.useState(false);

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const belt = React.useRef<Belt | null>(null);
  // Server and client agree on where the pictures first sit; after that the
  // belt owns their transforms, so a new value never re-renders them.
  const [anchor] = React.useState(current);
  const visible = React.useRef(false);
  const reportState = React.useRef<(state: RubberBeltState) => void>(() => {});
  const buttons = React.useRef(new Map<number, HTMLButtonElement>());
  const dragStart = React.useRef(0);
  const quietTimer = React.useRef(0);
  const wheelTimer = React.useRef(0);
  const geometry = React.useRef({ width: 0, pitch: 0, nodes: 0 });
  const shown = React.useRef(current);
  const gapPx = clamp(gap, 0, 64);
  const ratio = clamp(aspect, 0.4, 1.6);

  const drifting =
    motionSafe &&
    !disabled &&
    !paused &&
    direction !== "still" &&
    quiet &&
    !hovered &&
    !focused &&
    onScreen;

  React.useEffect(() => {
    reportState.current = (state) => onMotionChange?.(state);
  });

  const knobs: Knobs = {
    elasticity,
    direction,
    speed: clamp(speed, 0, 400),
    squash,
    motionSafe,
    drifting,
  };
  const latestKnobs = React.useRef(knobs);
  const measureRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    const b = createBelt(visible, reportState);
    belt.current = b;
    geometry.current = { width: 0, pitch: 0, nodes: 0 };
    measureRef.current();
    b.configure(latestKnobs.current);
    return () => {
      b.dispose();
      if (belt.current === b) belt.current = null;
    };
  }, []);

  React.useEffect(() => {
    latestKnobs.current = knobs;
    belt.current?.configure(knobs);
    // Every knob is listed; the object itself is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elasticity, direction, speed, squash, motionSafe, drifting]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) belt.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(
    () => () => {
      window.clearTimeout(quietTimer.current);
      window.clearTimeout(wheelTimer.current);
    },
    [],
  );

  /** Any hand or key holds the drift until the belt has been quiet a while. */
  const touched = React.useCallback(() => {
    setQuiet(false);
    window.clearTimeout(quietTimer.current);
    quietTimer.current = window.setTimeout(
      () => setQuiet(true),
      Math.max(0, resumeAfter),
    );
  }, [resumeAfter]);

  const measure = React.useCallback(() => {
    const viewport = viewportRef.current;
    const b = belt.current;
    if (!viewport || !b) return;
    const first = viewport.querySelector<HTMLElement>("[data-belt-frame]");
    const width = first?.offsetWidth || 152;
    const pitch = width + gapPx;
    const room = viewport.clientWidth;
    const want = clamp(
      Math.ceil((room + 3 * pitch) / Math.max(1, count * pitch)),
      1,
      MAX_COPIES,
    );
    if (want !== copies) {
      // The new copies render first; the belt is laid once they exist.
      setCopies(want);
      return;
    }
    const nodes = count * want;
    const g = geometry.current;
    if (g.width !== width || g.pitch !== pitch || g.nodes !== nodes) {
      geometry.current = { width, pitch, nodes };
      b.layout(nodes, pitch, width, shown.current);
    }
    for (const el of viewport.querySelectorAll<HTMLElement>(
      "[data-belt-node]",
    )) {
      b.bind(
        Number(el.dataset.beltNode),
        el,
        el.querySelector<HTMLElement>("[data-belt-face]"),
      );
    }
    b.wake();
  }, [count, gapPx, copies]);

  React.useEffect(() => {
    measureRef.current = measure;
    measure();
  }, [measure, itemWidth, ratio, captions]);

  const bindViewport = React.useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => measureRef.current());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      setOnScreen(visible.current);
      if (visible.current) belt.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const choose = React.useCallback(
    (item: number, via: "key" | "hand") => {
      const next = clamp(item, 0, count - 1);
      if (next !== current) {
        if (value === undefined) setOwn(next);
        onValueChange?.(next);
      }
      shown.current = next;
      const caption = items[next]?.caption ?? items[next]?.alt ?? "";
      setAnnounce(`${caption}, ${next + 1} of ${count}`);
      if (via === "key") {
        // Roving focus follows the key to the picture it brought in.
        window.requestAnimationFrame(() => buttons.current.get(next)?.focus());
      }
    },
    [count, current, items, onValueChange, value],
  );

  // A host that moves the value pulls that picture in.
  React.useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    const b = belt.current;
    if (b) b.pull(b.nodeOf(current, copies, count));
  }, [current, copies, count]);

  const live = !disabled && count > 0;

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !live,
    onStart: ({ event }) => {
      const b = belt.current;
      if (!b) return;
      touched();
      const target = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-belt-node]",
      );
      const j = target ? Number(target.dataset.beltNode) : b.nearest();
      b.grab(j);
      dragStart.current = 0;
    },
    onMove: ({ offset }) => {
      belt.current?.hand(offset.x);
    },
    onEnd: ({ velocity }) => {
      const b = belt.current;
      if (!b) return;
      touched();
      const j = b.letGo(velocity.x);
      choose(j % Math.max(1, count), "hand");
    },
    onCancel: () => {
      const b = belt.current;
      if (!b) return;
      const j = b.letGo(0);
      choose(j % Math.max(1, count), "hand");
    },
    onTap: (event) => {
      const b = belt.current;
      if (!b) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-belt-node]",
      );
      if (!target) return;
      const j = Number(target.dataset.beltNode);
      const item = j % Math.max(1, count);
      touched();
      if (item === current && b.nearest() === j) {
        onSelect?.(item);
        return;
      }
      b.pull(j);
      choose(item, "hand");
    },
  });

  const keyTo = (item: number) => {
    const b = belt.current;
    if (!b || !live) return;
    touched();
    const wrappedItem = ((item % count) + count) % count;
    b.pull(b.nodeOf(wrappedItem, copies, count));
    choose(wrappedItem, "key");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        keyTo(current + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        keyTo(current - 1);
        break;
      case "Home":
        keyTo(0);
        break;
      case "End":
        keyTo(count - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // The wheel has to be able to say no to the page scrolling, so it is a
  // native listener; it drives the belt while it spins and lands it after.
  const wheelRef = React.useRef<(event: WheelEvent) => void>(() => {});
  React.useEffect(() => {
    wheelRef.current = (event: WheelEvent) => {
      const b = belt.current;
      if (!b || !live || !wheel) return;
      const d = wheelPixels(event);
      const delta = Math.abs(d.x) > Math.abs(d.y) ? d.x : d.y;
      if (delta === 0) return;
      event.preventDefault();
      touched();
      b.wheel(delta);
      window.clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => {
        const j = b.wheelEnd();
        choose(j % Math.max(1, count), "hand");
      }, 140);
    };
  });
  React.useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const handler = (event: WheelEvent) => wheelRef.current(event);
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, []);

  const nodes = count * copies;
  const widthCss =
    itemWidth !== undefined
      ? `${clamp(itemWidth, 48, 480)}px`
      : "clamp(104px, 30cqw, 176px)";
  const faceHeight = `calc(var(--belt-w) * ${r3(ratio)})`;
  const stageHeight = `calc(var(--belt-w) * ${r3(ratio * (1 + HEADROOM * 2))} + ${captions ? CAPTION : 0}px)`;

  return (
    <div
      className={cn("@container relative w-full", className)}
      style={{ ["--belt-w" as string]: widthCss }}
    >
      <div
        ref={bindViewport}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        aria-describedby={hintId}
        {...drag}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={() => setHovered(false)}
        onFocus={(event) => {
          setFocused(true);
          // A keyboard visitor arriving on the belt finds their picture in
          // the middle, wherever the drift had carried it.
          const node = (event.target as Element).closest<HTMLElement>(
            "[data-belt-node]",
          );
          if (node && event.target.matches(":focus-visible")) {
            belt.current?.centre(Number(node.dataset.beltNode));
          }
        }}
        onBlur={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setFocused(false);
          }
        }}
        className={cn(
          "relative w-full touch-pan-y overflow-clip select-none",
          "[mask-image:linear-gradient(90deg,transparent,black_7%,black_93%,transparent)]",
          live ? "cursor-grab active:cursor-grabbing" : "opacity-60",
        )}
        style={{ height: stageHeight }}
      >
        {Array.from({ length: nodes }, (_, j) => {
          const item = j % Math.max(1, count);
          const copy = Math.floor(j / Math.max(1, count));
          const entry = items[item];
          if (!entry) return null;
          let off = j - anchor;
          if (off > nodes / 2) off -= nodes;
          if (off < -nodes / 2) off += nodes;
          const caption = entry.caption ?? entry.alt;
          const isTab = copy === 0 && item === current;
          return (
            <div
              key={j}
              data-belt-node={j}
              data-belt-frame=""
              role={copy === 0 ? "group" : undefined}
              aria-roledescription={copy === 0 ? "slide" : undefined}
              aria-label={
                copy === 0 ? `${item + 1} of ${count}: ${caption}` : undefined
              }
              aria-hidden={copy === 0 ? undefined : true}
              inert={copy !== 0}
              className="absolute top-0 left-1/2 flex flex-col items-center will-change-transform"
              style={{
                width: "var(--belt-w)",
                paddingTop: `calc(var(--belt-w) * ${r3(ratio * HEADROOM)})`,
                transform: `translate3d(calc(${off} * (var(--belt-w) + ${gapPx}px) - 50%), 0, 0)`,
              }}
            >
              <button
                ref={(node) => {
                  if (copy !== 0) return;
                  if (node) buttons.current.set(item, node);
                  else buttons.current.delete(item);
                }}
                type="button"
                data-belt-face=""
                tabIndex={isTab && live ? 0 : -1}
                aria-label={entry.alt}
                aria-current={item === current ? "true" : undefined}
                aria-disabled={!live || undefined}
                onKeyDown={onKeyDown}
                onClick={(event) => {
                  // Pointer presses arrive through the drag's tap; Enter and
                  // Space arrive here with no pointer behind them.
                  if (event.detail !== 0 || !live) return;
                  // The focused picture is the centred one (or on its way):
                  // Enter picks it.
                  if (item === current) onSelect?.(item);
                  else keyTo(item);
                }}
                className={cn(
                  "relative block w-full overflow-clip rounded-3 border border-hairline bg-surface-2 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
                style={{ height: faceHeight }}
              >
                {entry.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none size-full object-cover"
                  />
                ) : (
                  <BeltArt index={item} id={`${uid}-${j}`} />
                )}
              </button>
              {captions ? (
                <span
                  className="block w-full truncate text-center text-xs text-ink-2"
                  title={caption}
                  style={{
                    marginTop: `calc(var(--belt-w) * ${r3(ratio * HEADROOM)} + 6px)`,
                  }}
                >
                  {caption}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <p id={hintId} className="sr-only">
        Arrow keys pull the next picture to the centre, Home and End the first
        and last; Enter picks the centred picture. Drag or scroll to drive the
        belt.
      </p>
      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </div>
  );
}

type Art = {
  sky: readonly [string, string];
  sun?: readonly [number, number, number, string];
  stars?: boolean;
  glitter?: string;
  rows?: string;
  layers: readonly (readonly [string, number, number, number, number])[];
};

/**
 * Eight landscapes drawn in code: a sky gradient, a sun or moon, and layered
 * ridges. Fixed art, the same on either theme, like a photograph.
 * Each layer is [fill, horizon %, height %, jaggedness 0–1, seed].
 */
const ART: readonly Art[] = [
  {
    sky: ["oklch(0.93 0.03 230)", "oklch(0.9 0.04 70)"],
    sun: [70, 26, 7, "oklch(0.97 0.03 90)"],
    layers: [
      ["oklch(0.72 0.05 300)", 52, 8, 0.6, 11],
      ["oklch(0.95 0.01 90)", 60, 1.5, 0.1, 12],
    ],
  },
  {
    sky: ["oklch(0.86 0.03 200)", "oklch(0.93 0.02 160)"],
    layers: [
      ["oklch(0.66 0.04 175)", 40, 16, 0.9, 21],
      ["oklch(0.5 0.05 165)", 52, 18, 0.95, 22],
      ["oklch(0.36 0.05 160)", 64, 18, 1, 23],
    ],
  },
  {
    sky: ["oklch(0.62 0.12 30)", "oklch(0.84 0.1 70)"],
    sun: [38, 50, 9, "oklch(0.95 0.09 85)"],
    glitter: "oklch(0.92 0.09 80)",
    layers: [
      ["oklch(0.38 0.06 280)", 58, 4, 0.3, 31],
      ["oklch(0.3 0.06 270)", 62, 0.5, 0, 32],
    ],
  },
  {
    sky: ["oklch(0.72 0.1 240)", "oklch(0.88 0.05 220)"],
    layers: [
      ["oklch(0.8 0.09 75)", 50, 14, 0.15, 41],
      ["oklch(0.72 0.11 60)", 60, 14, 0.15, 42],
      ["oklch(0.64 0.12 50)", 70, 10, 0.1, 43],
    ],
  },
  {
    sky: ["oklch(0.8 0.06 235)", "oklch(0.94 0.02 220)"],
    layers: [
      ["oklch(0.96 0.01 240)", 40, 26, 1, 51],
      ["oklch(0.62 0.05 245)", 52, 12, 0.8, 52],
      ["oklch(0.74 0.09 195)", 64, 0.5, 0, 53],
    ],
  },
  {
    sky: ["oklch(0.86 0.05 210)", "oklch(0.94 0.04 120)"],
    rows: "oklch(0.42 0.08 145)",
    layers: [
      ["oklch(0.74 0.1 135)", 46, 10, 0.2, 61],
      ["oklch(0.62 0.11 140)", 58, 10, 0.2, 62],
    ],
  },
  {
    sky: ["oklch(0.7 0.02 250)", "oklch(0.82 0.02 240)"],
    layers: [
      ["oklch(0.52 0.03 240)", 56, 3, 0.4, 71],
      ["oklch(0.3 0.02 260)", 34, 30, 0.85, 72],
    ],
  },
  {
    sky: ["oklch(0.22 0.05 270)", "oklch(0.36 0.06 260)"],
    sun: [72, 22, 5, "oklch(0.95 0.03 90)"],
    stars: true,
    layers: [
      ["oklch(0.28 0.05 230)", 56, 12, 0.3, 81],
      ["oklch(0.2 0.04 220)", 66, 10, 0.2, 82],
    ],
  },
];

/** A ridge across the picture: seeded heights, smoothed as far as the layer is not jagged. */
function ridge(horizon: number, height: number, jag: number, seed: number) {
  const rand = lcg(seed);
  const n = jag > 0.6 ? 13 : 25;
  const raw = Array.from({ length: n + 2 }, () => rand());
  const pts: string[] = [];
  for (let i = 0; i <= n; i += 1) {
    const a = raw[i] ?? 0.5;
    const b = raw[i + 1] ?? 0.5;
    const c = raw[i + 2] ?? 0.5;
    const smooth = (a + 2 * b + c) / 4;
    const h = lerp(smooth, b, clamp01(jag));
    pts.push(`${r2((i / n) * 100)} ${r2(horizon - h * height)}`);
  }
  return `M0 72 L${pts.join(" L")} L100 72 Z`;
}

function BeltArt({ index, id }: { index: number; id: string }) {
  const art = ART[index % ART.length] ?? ART[0];
  if (!art) return null;
  const sky = `${id}-sky`;
  const starRand = lcg(index * 97 + 5);
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 72"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none block size-full"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={art.sky[0]} />
          <stop offset="1" stopColor={art.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="100" height="72" fill={`url(#${sky})`} />
      {art.stars
        ? Array.from({ length: 22 }, (_, i) => (
            <circle
              key={i}
              cx={r2(starRand() * 100)}
              cy={r2(starRand() * 40)}
              r={r2(0.25 + starRand() * 0.35)}
              fill="oklch(0.95 0.02 90)"
              opacity={r2(0.5 + starRand() * 0.5)}
            />
          ))
        : null}
      {art.sun ? (
        <circle
          cx={art.sun[0]}
          cy={art.sun[1]}
          r={art.sun[2]}
          fill={art.sun[3]}
        />
      ) : null}
      {art.layers.map(([fill, horizon, height, jag, seed], i) => (
        <path key={i} d={ridge(horizon, height, jag, seed)} fill={fill} />
      ))}
      {art.glitter ? (
        <g fill={art.glitter} opacity={0.75}>
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={r2(38 - (3 + i * 1.6))}
              y={63 + i * 1.8}
              width={r2(6 + i * 3.2)}
              height={0.7}
              rx={0.35}
            />
          ))}
        </g>
      ) : null}
      {art.rows ? (
        <g fill={art.rows}>
          {[0, 1, 2].map((row) =>
            Array.from({ length: 9 + row * 2 }, (_, i) => (
              <circle
                key={`${row}-${i}`}
                cx={r2(((i + 0.5) / (9 + row * 2)) * 100)}
                cy={56 + row * 6}
                r={r2(1.2 + row * 0.5)}
              />
            )),
          )}
        </g>
      ) : null}
    </svg>
  );
}
