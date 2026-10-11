"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SalonWalkItem = {
  /** An image URL; without one a painting is drawn in code. */
  src?: string;
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** The title on the wall plaque. */
  caption?: string;
  /** A second line on the plaque: medium, year. */
  note?: string;
};

export type SalonWalkLighting = "warm" | "daylight" | "candle" | "night";

export type SalonWalkProps = {
  /** The pictures, hung left, right, left… down the corridor. @default eight paintings drawn in code */
  items?: SalonWalkItem[];
  /** Controlled: the picture you stand level with. */
  value?: number;
  /** Initial picture when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the scroll, key or click that brought you level with a new picture. */
  onValueChange?: (index: number) => void;
  /** Distance between the two walls, as a multiple of the corridor's height, 0.6 to 1.6. @default 1 */
  wallGap?: number;
  /** Distance between pictures along the corridor, 0.6 to 1.8. @default 1 */
  spacing?: number;
  /** How far a picture swings toward you and how freely, 0 (hangs flat) to 1. @default 0.6 */
  sway?: number;
  /** The light: tungsten, daylight, candle, or the corridor dark and only the pictures lit. @default "warm" */
  lighting?: SalonWalkLighting;
  /** Overrides the picture lights' colour; any CSS colour. */
  lightColor?: string;
  /** Wall plaster. @default a salon-red pigment */
  wallColor?: string;
  /** Frame moulding. @default a gilt pigment */
  frameColor?: string;
  /** Eye height, 0 (low) to 1 (high). @default 0.5 */
  eyeHeight?: number;
  /** Scroll distance per picture, 0.5 to 2. @default 1 */
  walk?: number;
  /** The corridor's accessible name. @default "Picture corridor" */
  label?: string;
  /** No stepping by key or click; scrolling still walks. @default false */
  disabled?: boolean;
  className?: string;
};

const LIGHTS: Record<SalonWalkLighting, { light: string; ambient: number }> = {
  warm: { light: "oklch(0.88 0.1 78)", ambient: 0.82 },
  daylight: { light: "oklch(0.95 0.025 235)", ambient: 1 },
  candle: { light: "oklch(0.8 0.14 58)", ambient: 0.56 },
  night: { light: "oklch(0.86 0.09 82)", ambient: 0.4 },
};

const WALL = "oklch(0.44 0.095 24)";
const GILT = "oklch(0.74 0.11 82)";
const PLASTER = "oklch(0.82 0.025 78)";
const BOARDS = "oklch(0.34 0.035 52)";
const RUNNER = "oklch(0.36 0.075 28)";

export const defaultSalonItems: SalonWalkItem[] = [
  {
    alt: "A harbour at dusk, boats against an orange sky",
    caption: "Harbour at dusk",
    note: "Oil on board, 1911",
  },
  {
    alt: "An orchard in blossom on a green hill",
    caption: "Orchard in bloom",
    note: "Oil on canvas, 1908",
  },
  {
    alt: "Pale dunes under a high sun",
    caption: "The dunes at noon",
    note: "Gouache, 1922",
  },
  {
    alt: "A cliff path above a blue sea",
    caption: "Cliff path",
    note: "Oil on canvas, 1914",
  },
  {
    alt: "A water mill by a slow river",
    caption: "River mill",
    note: "Watercolour, 1903",
  },
  {
    alt: "Lanterns over a night market",
    caption: "Night market",
    note: "Oil on board, 1926",
  },
  {
    alt: "A snowy field with a line of dark trees",
    caption: "Winter field",
    note: "Oil on canvas, 1919",
  },
  {
    alt: "A lighthouse on a rock in a green sea",
    caption: "The light",
    note: "Oil on canvas, 1930",
  },
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
/** A length in container-height units: the whole corridor scales with its box. */
const u = (v: number) => `${r2(v)}cqh`;

/** Geometry, in cqh. */
const PERSPECTIVE = 80;
const FLOOR = 36;
const SPRING = -30;
const FRAME_W = 30;
const FRAME_H = 22;

type Geo = {
  half: number;
  step: number;
  ahead: number;
  start: number;
  end: number;
};

const geoOf = (wallGap: number, spacing: number, count: number): Geo => {
  const gap = clamp(wallGap, 0.6, 1.6);
  const half = 50 * gap;
  const step = 46 * clamp(spacing, 0.6, 1.8);
  // Far enough that a picture you are level with sits well inside the frame:
  // with the half-width held to 36cqw, it lands about 60% of the way out.
  const ahead = 90 * gap;
  // The eye sits PERSPECTIVE in front of the world's plane: lengths along
  // the corridor are measured from it, so "level with a picture" means the
  // picture is `ahead` from the eye, not from the screen.
  return {
    half,
    step,
    ahead,
    start: PERSPECTIVE + 20,
    end: PERSPECTIVE - (ahead + (count - 1) * step + step * 1.6),
  };
};

/** How level you are with a picture: 1 beside it, 0 a picture's step away. */
const levelWith = (d: number) => {
  const x = clamp(1 - (d / 0.8) * (d / 0.8), 0, 1);
  return x * x;
};

const cameraOf = (p: number, yaw: number, geo: Geo, eye: number) =>
  `translateZ(${u(PERSPECTIVE)}) rotateY(${r2(yaw)}deg) translateZ(${u(-PERSPECTIVE)}) translate3d(0, ${u((eye - 0.5) * 24)}, ${u(p * geo.step)})`;

/** One painting drawn in code: a few flat shapes in fixed pigments. */
function Painting({ index }: { index: number }) {
  const k = ((index % 8) + 8) % 8;
  const common = {
    viewBox: "0 0 120 88",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
  } as const;
  if (k === 0)
    return (
      <svg {...common}>
        <rect width="120" height="88" fill="oklch(0.72 0.13 52)" />
        <rect y="30" width="120" height="20" fill="oklch(0.8 0.11 70)" />
        <circle cx="78" cy="46" r="10" fill="oklch(0.9 0.1 85)" />
        <rect y="52" width="120" height="36" fill="oklch(0.42 0.07 250)" />
        <path
          d="M 20 60 h 26 l -4 6 h -18 z M 30 60 v -18 l 10 16 z"
          fill="oklch(0.25 0.03 260)"
        />
        <path
          d="M 70 64 h 20 l -3 5 h -14 z M 78 64 v -14 l 8 12 z"
          fill="oklch(0.28 0.03 260)"
        />
      </svg>
    );
  if (k === 1)
    return (
      <svg {...common}>
        <rect width="120" height="88" fill="oklch(0.86 0.05 220)" />
        <path
          d="M 0 52 Q 60 30 120 50 V 88 H 0 Z"
          fill="oklch(0.62 0.12 140)"
        />
        <path
          d="M 0 70 Q 50 56 120 66 V 88 H 0 Z"
          fill="oklch(0.52 0.11 145)"
        />
        {[18, 40, 64, 88, 104].map((x, i) => (
          <g key={x}>
            <rect
              x={x - 1}
              y={50 - (i % 2) * 4}
              width="2"
              height="10"
              fill="oklch(0.36 0.05 60)"
            />
            <circle
              cx={x}
              cy={46 - (i % 2) * 4}
              r="7"
              fill="oklch(0.84 0.07 350)"
            />
          </g>
        ))}
      </svg>
    );
  if (k === 2)
    return (
      <svg {...common}>
        <rect width="120" height="88" fill="oklch(0.88 0.06 230)" />
        <circle cx="90" cy="20" r="8" fill="oklch(0.96 0.06 95)" />
        <path
          d="M 0 50 Q 40 36 80 50 T 120 46 V 88 H 0 Z"
          fill="oklch(0.84 0.08 80)"
        />
        <path
          d="M 0 66 Q 30 54 70 64 T 120 60 V 88 H 0 Z"
          fill="oklch(0.76 0.09 72)"
        />
      </svg>
    );
  if (k === 3)
    return (
      <svg {...common}>
        <rect width="120" height="88" fill="oklch(0.84 0.05 230)" />
        <rect y="44" width="120" height="44" fill="oklch(0.5 0.1 235)" />
        <path d="M 0 30 L 46 40 L 60 88 H 0 Z" fill="oklch(0.58 0.08 130)" />
        <path d="M 0 44 L 40 50 L 50 88 H 0 Z" fill="oklch(0.5 0.06 70)" />
        <path
          d="M 6 36 Q 26 46 44 78"
          stroke="oklch(0.86 0.04 80)"
          strokeWidth="1.6"
          fill="none"
        />
      </svg>
    );
  if (k === 4)
    return (
      <svg {...common}>
        <rect width="120" height="88" fill="oklch(0.82 0.04 200)" />
        <path
          d="M 0 54 Q 60 44 120 56 V 88 H 0 Z"
          fill="oklch(0.56 0.09 150)"
        />
        <path
          d="M 0 68 Q 60 60 120 70 V 80 Q 60 72 0 80 Z"
          fill="oklch(0.58 0.07 220)"
        />
        <rect x="58" y="36" width="26" height="22" fill="oklch(0.66 0.04 60)" />
        <path d="M 56 36 L 71 26 L 86 36 Z" fill="oklch(0.42 0.06 30)" />
        <circle
          cx="54"
          cy="56"
          r="8"
          fill="none"
          stroke="oklch(0.36 0.04 60)"
          strokeWidth="2"
        />
      </svg>
    );
  if (k === 5)
    return (
      <svg {...common}>
        <rect width="120" height="88" fill="oklch(0.24 0.05 270)" />
        <path
          d="M 0 30 Q 60 40 120 28"
          stroke="oklch(0.4 0.03 270)"
          strokeWidth="0.8"
          fill="none"
        />
        {[10, 26, 42, 58, 74, 90, 106].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={32 + (i % 3)}
            r="3.4"
            fill={i % 2 ? "oklch(0.82 0.15 70)" : "oklch(0.72 0.17 35)"}
          />
        ))}
        <rect y="62" width="120" height="26" fill="oklch(0.3 0.04 40)" />
        {[14, 46, 80].map((x) => (
          <rect
            key={x}
            x={x}
            y="50"
            width="22"
            height="14"
            fill="oklch(0.5 0.1 45)"
          />
        ))}
      </svg>
    );
  if (k === 6)
    return (
      <svg {...common}>
        <rect width="120" height="88" fill="oklch(0.8 0.02 240)" />
        <rect y="50" width="120" height="38" fill="oklch(0.95 0.008 240)" />
        {[12, 30, 46, 66, 82, 100].map((x, i) => (
          <path
            key={x}
            d={`M ${x} 52 L ${x + 5} ${30 + (i % 3) * 3} L ${x + 10} 52 Z`}
            fill="oklch(0.3 0.03 200)"
          />
        ))}
      </svg>
    );
  return (
    <svg {...common}>
      <rect width="120" height="88" fill="oklch(0.78 0.05 210)" />
      <rect y="52" width="120" height="36" fill="oklch(0.5 0.09 185)" />
      <path d="M 70 60 L 96 60 L 104 72 L 62 72 Z" fill="oklch(0.4 0.03 60)" />
      <path d="M 78 60 L 80 22 L 88 22 L 90 60 Z" fill="oklch(0.95 0.01 90)" />
      <rect x="79" y="32" width="10" height="5" fill="oklch(0.6 0.18 28)" />
      <path d="M 77 22 L 84 14 L 91 22 Z" fill="oklch(0.6 0.18 28)" />
    </svg>
  );
}

/**
 * A long barrel-vaulted corridor in CSS 3D with pictures hung on both walls
 * under small picture lights. Every length is in container units, so the
 * server's frame is the browser's frame at any size. Scroll walks you
 * forward: the corridor is a real scroll container with the view held
 * sticky inside it, so wheel, trackpad, touch and keys all scroll natively,
 * and the camera follows the scroll on the drift spring — a walk has
 * weight — with a slight lean of the head toward the picture ahead.
 *
 * As you draw level with a picture it swings toward you on its wire, about
 * its far edge, on a spring at glide stiffness whose damping ratio falls as
 * `sway` rises, so a free-hanging picture overshoots and swings back once;
 * its plaque brightens on the wall beside it and its light comes up. Walking
 * on, it settles flat again. The corridor is one tab stop: Down and Right
 * step to the next picture, Up and Left to the one before, Home and End to
 * either end, and a click on a picture walks to it. Under reduced motion the
 * camera follows the scroll directly, pictures hang flat, and the plaques and
 * lights still say which picture you are beside.
 */
export function SalonWalk({
  items = defaultSalonItems,
  value,
  defaultValue = 0,
  onValueChange,
  wallGap = 1,
  spacing = 1,
  sway = 0.6,
  lighting = "warm",
  lightColor,
  wallColor = WALL,
  frameColor = GILT,
  eyeHeight = 0.5,
  walk = 1,
  label = "Picture corridor",
  disabled = false,
  className,
}: SalonWalkProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const count = Math.max(1, items.length);
  const geo = geoOf(wallGap, spacing, count);
  const preset = LIGHTS[lighting] ?? LIGHTS.warm;
  const light = lightColor ?? preset.light;
  const ambient = preset.ambient;
  const shade = (colour: string, extra = 0) =>
    `color-mix(in oklab, ${colour} ${Math.round(clamp(ambient - extra, 0.08, 1) * 100)}%, black)`;
  /** Things under a picture light keep most of their colour in the dark. */
  const lit = (colour: string, extra = 0) =>
    `color-mix(in oklab, ${colour} ${Math.round(clamp(Math.max(ambient, 0.78) - extra, 0.08, 1) * 100)}%, black)`;
  const eye = clamp(eyeHeight, 0, 1);

  const [own, setOwn] = React.useState(() =>
    Math.round(clamp(defaultValue, 0, count - 1)),
  );
  const index =
    value !== undefined ? Math.round(clamp(value, 0, count - 1)) : own;
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [first] = React.useState(index);

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const worldRef = React.useRef<HTMLDivElement | null>(null);
  const swingRefs = React.useRef(new Map<string, HTMLDivElement>());
  const plaqueRefs = React.useRef(new Map<string, HTMLDivElement>());
  const washRefs = React.useRef(new Map<string, HTMLDivElement>());
  const reported = React.useRef(index);
  const engine = React.useRef<{
    target: number;
    p: number;
    v: number;
    yaw: number;
    swing: Float64Array;
    swingV: Float64Array;
    raf: number;
    last: number;
    visible: boolean;
  }>({
    target: index,
    p: index,
    v: 0,
    yaw: 0,
    swing: new Float64Array(0),
    swingV: new Float64Array(0),
    raf: 0,
    last: 0,
    visible: true,
  });

  const keyOf = (i: number) => `${i}:${items[i]?.alt ?? ""}`;

  const latest = React.useRef({ geo, sway, motionSafe, eye, count, keyOf });
  React.useLayoutEffect(() => {
    latest.current = { geo, sway, motionSafe, eye, count, keyOf };
  });

  /** Writes the camera, the swings, the plaques and the light pools. */
  const paint = React.useCallback(() => {
    const e = engine.current;
    const L = latest.current;
    const world = worldRef.current;
    if (!world) return;
    world.style.transform = cameraOf(e.p, e.yaw, L.geo, L.eye);
    for (let i = 0; i < L.count; i += 1) {
      const key = L.keyOf(i);
      const level = levelWith(e.p - i);
      const left = i % 2 === 0;
      const swing = e.swing[i] ?? 0;
      const frame = swingRefs.current.get(key);
      if (frame) {
        frame.style.transform = `rotateY(${r2(left ? -swing : swing)}deg)`;
      }
      const plaque = plaqueRefs.current.get(key);
      if (plaque) plaque.style.opacity = String(r2(0.35 + 0.65 * level));
      const wash = washRefs.current.get(key);
      if (wash) wash.style.opacity = String(r2(0.5 + 0.5 * level));
    }
  }, []);

  /** The loop re-requests itself through this ref: no self-reference. */
  const loopRef = React.useRef<FrameRequestCallback>(() => {});
  const step = React.useCallback(
    (now: number) => {
      const e = engine.current;
      e.raf = 0;
      if (!e.visible || document.hidden) return;
      const L = latest.current;
      const dt = Math.min(0.05, Math.max(0, (now - e.last) / 1000));
      e.last = now;
      let moving = false;
      if (!L.motionSafe) {
        e.p = e.target;
        e.v = 0;
        e.yaw = 0;
      } else {
        // The walk: drift spring, integrated in small steps.
        const { stiffness: k, damping: c, mass: m } = springs.drift;
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / n;
        for (let s = 0; s < n; s += 1) {
          const a = (-k * (e.p - e.target) - c * e.v) / m;
          e.v += a * h;
          e.p += e.v * h;
        }
        if (Math.abs(e.p - e.target) < 0.0005 && Math.abs(e.v) < 0.001) {
          e.p = e.target;
          e.v = 0;
        } else moving = true;
        // Lean toward the picture coming up, more while walking.
        const ahead = Math.round(e.p + 0.3);
        // Even pictures hang on the left: the head turns left toward them.
        const side = ahead % 2 === 0 ? -1 : 1;
        const lean = side * 3 * clamp(Math.abs(e.v) * 4, 0, 1);
        e.yaw += (lean - e.yaw) * Math.min(1, dt * 4);
        if (Math.abs(lean - e.yaw) > 0.01) moving = true;
      }
      // The swings: a pendulum per picture, glide stiffness, damping by sway.
      const sw = clamp(L.sway, 0, 1);
      const k = springs.glide.stiffness;
      const zeta = 0.98 - sw * 0.5;
      const c = 2 * zeta * Math.sqrt(k);
      for (let i = 0; i < L.count; i += 1) {
        const target = L.motionSafe ? sw * 40 * levelWith(e.p - i) : 0;
        let x = e.swing[i] ?? 0;
        let v = e.swingV[i] ?? 0;
        if (!L.motionSafe) {
          x = target;
          v = 0;
        } else {
          const n = Math.max(1, Math.ceil(dt / (1 / 240)));
          const h = dt / n;
          for (let s = 0; s < n; s += 1) {
            const a = -k * (x - target) - c * v;
            v += a * h;
            x += v * h;
          }
          if (Math.abs(x - target) < 0.01 && Math.abs(v) < 0.01) {
            x = target;
            v = 0;
          } else moving = true;
        }
        e.swing[i] = x;
        e.swingV[i] = v;
      }
      paint();
      if (moving) e.raf = window.requestAnimationFrame(loopRef.current);
    },
    [paint],
  );
  React.useLayoutEffect(() => {
    loopRef.current = step;
  }, [step]);

  const kick = React.useCallback(() => {
    const e = engine.current;
    if (e.raf || !e.visible || document.hidden) return;
    e.last = performance.now();
    e.raf = window.requestAnimationFrame(loopRef.current);
  }, []);

  // A render that rebuilt the camera string from the first picture is put
  // back where the walk actually is before the browser paints it.
  React.useLayoutEffect(() => {
    paint();
  });

  // Pendulum state follows the number of pictures.
  React.useEffect(() => {
    const e = engine.current;
    if (e.swing.length !== count) {
      e.swing = new Float64Array(count);
      e.swingV = new Float64Array(count);
    }
    kick();
  }, [count, kick, sway, motionSafe, wallGap, spacing, eyeHeight]);

  const stopOf = React.useCallback(
    (i: number) => {
      const el = scrollerRef.current;
      if (!el) return 0;
      const range = Math.max(1, el.scrollHeight - el.clientHeight);
      return (range * i) / Math.max(1, count - 1);
    },
    [count],
  );

  // Place the scroll at the starting picture, and keep watch on screen.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = stopOf(engine.current.target);
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      engine.current.visible = Boolean(entry?.isIntersecting);
      if (engine.current.visible) kick();
    });
    io.observe(el);
    const onVis = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVis);
    const e = engine.current;
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (e.raf) window.cancelAnimationFrame(e.raf);
      e.raf = 0;
    };
    // The scroll is placed once; later moves come from the visitor or `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = (i: number) => {
    if (i === reported.current) return;
    reported.current = i;
    if (value === undefined) setOwn(i);
    onValueChange?.(i);
    const item = items[i];
    setSaid((s) => ({
      n: s.n + 1,
      text: `${i + 1} of ${count}: ${item?.caption ?? item?.alt ?? ""}${item?.note ? `, ${item.note}` : ""}`,
    }));
  };

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const to = Math.round(clamp(i, 0, count - 1));
    engine.current.target = to;
    el.scrollTop = stopOf(to);
    report(to);
    kick();
  };

  // A host that moves `value` walks the corridor there.
  React.useEffect(() => {
    if (value === undefined) return;
    const to = Math.round(clamp(value, 0, count - 1));
    if (to === reported.current) return;
    reported.current = to;
    const el = scrollerRef.current;
    engine.current.target = to;
    if (el) el.scrollTop = stopOf(to);
    kick();
  }, [value, count, stopOf, kick]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const range = Math.max(1, el.scrollHeight - el.clientHeight);
    const p = (el.scrollTop / range) * (count - 1);
    engine.current.target = clamp(p, 0, count - 1);
    report(Math.round(engine.current.target));
    kick();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const at = Math.round(engine.current.target);
    let to: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = at + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = count - 1;
    else if (event.key === "PageDown") to = at + 2;
    else if (event.key === "PageUp") to = at - 2;
    if (to === null) return;
    event.preventDefault();
    goTo(to);
  };

  // The server's frame: the camera level with the starting picture. Later
  // renders keep this string, so React never fights the frame loop for it.
  const camera = cameraOf(first, 0, geo, eye);
  const length = geo.start - geo.end;
  const midZ = (geo.start + geo.end) / 2;
  const strips = 8;
  const chord = 2 * Math.sin(Math.PI / (2 * strips));
  const ribs: number[] = [];
  for (let i = -1; i <= count; i += 1) ribs.push(i);

  const place = (
    x: number | string,
    y: number | string,
    z: number | string,
    rest = "",
  ) =>
    `translate(-50%, -50%) translate3d(${typeof x === "number" ? u(x) : x}, ${typeof y === "number" ? u(y) : y}, ${typeof z === "number" ? u(z) : z})${rest ? ` ${rest}` : ""}`;
  /** A length that scales with the corridor's half-width: `k × half + add`. */
  const hw = (k: number, add = 0) =>
    add === 0
      ? `calc(var(--half) * ${r2(k)})`
      : `calc(var(--half) * ${r2(k)} + ${u(add)})`;

  return (
    <div
      className={cn(
        "group/salon-walk [container-type:size] relative isolate overflow-hidden",
        className,
      )}
      style={{ background: shade(PLASTER, 0.55) }}
    >
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="gallery"
        aria-label={label}
        aria-describedby={`${uid}-hint`}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 [scrollbar-width:none] overflow-x-hidden overflow-y-auto overscroll-auto rounded-[inherit] outline-none [&::-webkit-scrollbar]:hidden",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      >
        <div
          aria-hidden
          className="sticky top-0 h-full w-full overflow-hidden"
          style={{ perspective: u(PERSPECTIVE) }}
        >
          <div
            ref={worldRef}
            className="absolute inset-0 [transform-style:preserve-3d]"
            style={
              {
                transform: camera,
                // Half the corridor's width: by the height, but held to the
                // box's width so a phone still sees both walls.
                "--half": `calc(min(50cqh, 36cqw) * ${r2(clamp(wallGap, 0.6, 1.6))})`,
              } as React.CSSProperties
            }
          >
            {/* Floor: boards and a runner down the middle. */}
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                width: hw(2),
                height: u(length),
                transform: place(0, FLOOR, midZ, "rotateX(90deg)"),
                background: `linear-gradient(90deg, transparent 32%, ${shade(RUNNER)} 32% 68%, transparent 68%), repeating-linear-gradient(90deg, ${shade(BOARDS)} 0 ${u(5.6)}, ${shade(BOARDS, 0.08)} ${u(5.6)} ${u(6)})`,
              }}
            />
            {/* Walls, with a dado rail and a skirting. */}
            {[-1, 1].map((side) => (
              <div
                key={side}
                className="absolute top-1/2 left-1/2"
                style={{
                  width: u(length),
                  height: u(FLOOR - SPRING),
                  transform: place(
                    hw(side),
                    (FLOOR + SPRING) / 2,
                    midZ,
                    `rotateY(${side < 0 ? 90 : -90}deg)`,
                  ),
                  background: `linear-gradient(180deg, ${shade(wallColor, 0.1)} 0 4%, ${shade(wallColor)} 4% 70%, ${shade(frameColor, 0.25)} 70% 71%, ${shade(wallColor, 0.12)} 71% 95%, ${shade(BOARDS)} 95%)`,
                }}
              />
            ))}
            {/* The vault: eight strips round a half cylinder, darker at the crown. */}
            {Array.from({ length: strips }, (_, k) => {
              const a = Math.PI - ((k + 0.5) * Math.PI) / strips;
              const tilt = 90 - (a * 180) / Math.PI;
              const dark = 0.12 + 0.28 * Math.sin(a);
              return (
                <div
                  key={k}
                  className="absolute top-1/2 left-1/2"
                  style={{
                    width: hw(chord, 0.9),
                    height: u(length),
                    transform: place(
                      hw(Math.cos(a)),
                      hw(-Math.sin(a), SPRING),
                      midZ,
                      `rotateZ(${r2(tilt)}deg) rotateX(90deg)`,
                    ),
                    background: shade(PLASTER, dark),
                  }}
                />
              );
            })}
            {/* Transverse ribs across the vault, between the pictures. */}
            {ribs.map((i) => (
              <div
                key={i}
                className="absolute top-1/2 left-1/2"
                style={{
                  width: hw(2),
                  height: hw(1),
                  transform: place(
                    0,
                    hw(-0.5, SPRING),
                    PERSPECTIVE - geo.ahead - (i + 0.5) * geo.step,
                  ),
                  borderStyle: "solid",
                  borderWidth: `${u(1.6)} ${u(1.6)} 0`,
                  borderColor: shade(PLASTER, 0.06),
                  borderRadius: "var(--half) var(--half) 0 0",
                }}
              />
            ))}
            {/* The far door, lit. */}
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                width: hw(2),
                height: hw(1, FLOOR - SPRING),
                transform: place(0, hw(-0.5, (FLOOR + SPRING) / 2), geo.end),
                background: `radial-gradient(ellipse 22% 34% at 50% 62%, ${light}, color-mix(in oklab, ${light} 40%, transparent) 60%, transparent 100%), ${shade(wallColor, 0.2)}`,
                borderRadius: "var(--half) var(--half) 0 0",
              }}
            />
            {/* The pictures. */}
            {items.map((item, i) => {
              const left = i % 2 === 0;
              const side = left ? -1 : 1;
              const z = PERSPECTIVE - geo.ahead - i * geo.step;
              const key = keyOf(i);
              return (
                <div
                  key={key}
                  className="absolute top-1/2 left-1/2 [transform-style:preserve-3d]"
                  style={{
                    width: u(FRAME_W + 24),
                    height: u(FRAME_H + 16),
                    transform: place(
                      hw(side, -side * 0.3),
                      -4,
                      z,
                      `rotateY(${left ? 90 : -90}deg)`,
                    ),
                  }}
                >
                  {/* The pool of light on the wall. */}
                  <div
                    ref={(node) => {
                      if (node) washRefs.current.set(key, node);
                      else washRefs.current.delete(key);
                    }}
                    className="absolute inset-0"
                    style={{
                      opacity: r2(0.5 + 0.5 * levelWith(first - i)),
                      background: `radial-gradient(ellipse 46% 60% at 50% 30%, color-mix(in oklab, ${light} 55%, transparent), transparent 70%)`,
                    }}
                  />
                  {/* The plaque, on the side nearer the visitor. */}
                  <div
                    ref={(node) => {
                      if (node) plaqueRefs.current.set(key, node);
                      else plaqueRefs.current.delete(key);
                    }}
                    className="absolute rounded-[0.4cqh] px-[0.9cqh] py-[0.6cqh] leading-tight"
                    style={{
                      width: u(14),
                      bottom: u(4),
                      [left ? "left" : "right"]: u(-1),
                      fontSize: u(1.75),
                      background: "oklch(0.95 0.012 85)",
                      color: "oklch(0.25 0.02 60)",
                      opacity: r2(0.35 + 0.65 * levelWith(first - i)),
                      transform: "translateZ(0.2cqh)",
                    }}
                  >
                    <p className="font-medium">{item.caption ?? item.alt}</p>
                    {item.note ? (
                      <p className="mt-[0.3cqh] opacity-70">{item.note}</p>
                    ) : null}
                  </div>
                  {/* The picture, hung on its wire, swinging about its far edge. */}
                  <div
                    ref={(node) => {
                      if (node) swingRefs.current.set(key, node);
                      else swingRefs.current.delete(key);
                    }}
                    onClick={() => {
                      if (!disabled) goTo(i);
                    }}
                    className="absolute cursor-pointer [transform-style:preserve-3d]"
                    style={{
                      width: u(FRAME_W),
                      height: u(FRAME_H),
                      top: u(10),
                      // The plaque takes the near side; the picture the rest.
                      left: u(left ? 15 : 9),
                      transformOrigin: left ? "0% 50%" : "100% 50%",
                      transform: "rotateY(0deg)",
                    }}
                  >
                    <svg
                      className="absolute overflow-visible"
                      viewBox="0 0 30 8"
                      preserveAspectRatio="none"
                      style={{
                        left: 0,
                        width: u(FRAME_W),
                        height: u(8),
                        top: u(-8),
                      }}
                    >
                      <path
                        d="M 4 8 L 15 0.6 L 26 8"
                        fill="none"
                        stroke={shade(frameColor, 0.3)}
                        strokeWidth="0.25"
                      />
                    </svg>
                    {/* Brass picture light. */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 rounded-full"
                      style={{
                        width: u(12),
                        height: u(1.2),
                        top: u(-2.4),
                        background: `linear-gradient(${lit(frameColor, 0.1)}, ${lit(frameColor, 0.45)})`,
                        boxShadow: `0 ${u(0.6)} ${u(1.6)} color-mix(in oklab, ${light} 70%, transparent)`,
                      }}
                    />
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{
                        padding: u(1.6),
                        background: `linear-gradient(135deg, ${lit(frameColor, -0.1)}, ${lit(frameColor, 0.2)} 50%, ${lit(frameColor, 0.05)})`,
                        boxShadow: `0 ${u(1)} ${u(2.4)} oklch(0 0 0 / 0.35)`,
                      }}
                    >
                      <div className="relative size-full overflow-hidden bg-black/10">
                        {item.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.src}
                            alt=""
                            draggable={false}
                            className="block size-full object-cover"
                          />
                        ) : (
                          <Painting index={i} />
                        )}
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(180deg, color-mix(in oklab, ${light} 30%, transparent), transparent 55%, oklch(0 0 0 / ${r2(0.32 * (1 - ambient))}))`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* A soft vignette, and where you are. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 70% at 50% 45%, transparent 55%, oklch(0 0 0 / 0.28))",
            }}
          />
          <div className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1">
            {items.map((item, i) => (
              <span
                key={keyOf(i)}
                className={cn(
                  "h-1 rounded-full transition-[width,background-color] duration-300",
                  i === index ? "w-4 bg-white/90" : "w-1 bg-white/45",
                )}
              />
            ))}
          </div>
        </div>
        <div
          aria-hidden
          style={{
            height: `calc(${Math.max(0, count - 1)} * ${r2(45 * clamp(walk, 0.5, 2))}cqh)`,
          }}
        />
      </div>
      <ol className="sr-only">
        {items.map((item, i) => (
          <li key={keyOf(i)}>
            {item.alt}
            {item.caption ? `. ${item.caption}` : ""}
            {item.note ? `, ${item.note}` : ""}
          </li>
        ))}
      </ol>
      <span id={`${uid}-hint`} className="sr-only">
        Scroll to walk. Arrow keys step from picture to picture; Home and End go
        to either end.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
