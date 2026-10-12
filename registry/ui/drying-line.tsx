"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, useDrag, wheelPixels } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type DryingLineItem = {
  /** The print's picture. @default a drawn black-and-white photograph */
  src?: string;
  /** What the print shows, for assistive technology. */
  alt: string;
  /** Its title, shown when it is unclipped. */
  caption?: string;
  /** A darkroom note shown under the unclipped print, e.g. "Neg 14 · f/8 · 12 s". */
  note?: string;
  /** Width over height. @default the picture's own, once loaded */
  aspect?: number;
};

export type DryingLinePegs = "wood" | "binder" | "film";

export type DryingLineProps = {
  /** The prints along the line. @default defaultDryingPrints (eight) */
  items?: DryingLineItem[];
  /** How freely the prints swing and twist, 0 (stiff, quickly still) to 1 (loose, long and wide). @default 0.5 */
  sway?: number;
  /** How deep the cord sags between its hooks, 0 (taut) to 1 (a deep curve). @default 0.45 */
  sag?: number;
  /** What holds each print: a wooden spring peg, a steel binder clip or a film clip. @default "wood" */
  pegs?: DryingLinePegs;
  /** The print at the middle of the room (controlled). A new value pulls the line there. */
  value?: number;
  /** The print at the middle when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, scroll or key that brought a new print to the middle. */
  onValueChange?: (index: number) => void;
  /** Fires when a print is unclipped to the front (its index) and when it goes back (null). */
  onUnclip?: (index: number | null) => void;
  /** Distance between prints on the line, px. The loop is always wider than the room. @default 112 */
  spacing?: number;
  /** The page's scroll (or the nearest scroll container's) pulls the line too. @default true */
  scroll?: boolean;
  /** The safelight's colour, any CSS colour. @default "oklch(0.66 0.19 32)" */
  light?: string;
  /** Names the line for assistive technology. @default "Drying line" */
  label?: string;
  /** Shows the line but takes no pulls, clicks or keys. @default false */
  disabled?: boolean;
  /** Sizes the room. @default "h-56 w-full" */
  className?: string;
};

/* ---------------------------------- prints --------------------------------- */

const svg = (w: number, h: number, body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`,
  )}`;

const g = (v: number) => `rgb(${v},${v},${v})`;

const PIER = svg(
  300,
  220,
  `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g(150)}"/><stop offset="1" stop-color="${g(226)}"/></linearGradient></defs>
<rect width="300" height="220" fill="url(#s)"/><rect y="118" width="300" height="102" fill="${g(120)}"/><rect y="160" width="300" height="60" fill="${g(178)}"/>
<path d="M120 118 L300 96 L300 104 L120 122Z" fill="${g(40)}"/>${[
    0, 1, 2, 3, 4, 5, 6, 7,
  ]
    .map((i) => {
      const x = 130 + i * 22;
      const top = 120 - i * 3;
      return `<rect x="${x}" y="${top}" width="${(3 - i * 0.2).toFixed(1)}" height="${42 - i * 4}" fill="${g(36)}"/>`;
    })
    .join(
      "",
    )}<path d="M0 170 q 80 -6 160 2 t 140 -4" stroke="${g(210)}" stroke-width="3" fill="none"/>`,
);

const LIGHTHOUSE = svg(
  220,
  300,
  `<rect width="220" height="300" fill="${g(206)}"/><circle cx="160" cy="70" r="26" fill="${g(232)}"/>
<path d="M92 230 L100 92 L120 92 L128 230Z" fill="${g(236)}"/><path d="M95 180 h30 M97 140 h26" stroke="${g(60)}" stroke-width="10"/>
<rect x="96" y="76" width="28" height="16" fill="${g(50)}"/><path d="M93 76 L110 60 L127 76Z" fill="${g(40)}"/><rect x="104" y="80" width="12" height="9" fill="${g(250)}"/>
<path d="M0 240 C 40 220 70 214 110 226 C 150 238 180 220 220 230 L220 300 L0 300Z" fill="${g(52)}"/><path d="M0 268 C 60 260 140 270 220 262 L220 300 L0 300Z" fill="${g(96)}"/>`,
);

const CYCLIST = svg(
  300,
  220,
  `<rect width="300" height="220" fill="${g(214)}"/><path d="M0 150 L300 140 L300 220 L0 220Z" fill="${g(150)}"/>
${[20, 70, 230, 270].map((x, i) => `<circle cx="${x}" cy="${110 + (i % 2) * 8}" r="${26 - i * 2}" fill="${g(70 + i * 12)}"/><rect x="${x - 2}" y="${120 + (i % 2) * 8}" width="4" height="30" fill="${g(60)}"/>`).join("")}
<circle cx="132" cy="168" r="18" fill="none" stroke="${g(30)}" stroke-width="3"/><circle cx="182" cy="168" r="18" fill="none" stroke="${g(30)}" stroke-width="3"/>
<path d="M132 168 L152 140 L182 168 M152 140 L172 140 M150 134 L156 116 L170 118" stroke="${g(30)}" stroke-width="3" fill="none"/><circle cx="160" cy="104" r="7" fill="${g(30)}"/><path d="M156 112 L168 134 L176 140" stroke="${g(30)}" stroke-width="5" fill="none"/>`,
);

const WINDOW = svg(
  220,
  300,
  `<rect width="220" height="300" fill="${g(46)}"/><rect x="50" y="40" width="120" height="170" fill="${g(236)}"/>
<path d="M110 40 v170 M50 125 h120" stroke="${g(46)}" stroke-width="6"/><path d="M50 40 C 70 120 60 170 76 214 L50 214Z" fill="${g(140)}" opacity="0.8"/>
<path d="M60 214 L 30 300 L 200 300 L 170 214Z" fill="${g(110)}" opacity="0.5"/><rect x="44" y="210" width="132" height="8" fill="${g(90)}"/>
<circle cx="140" cy="200" r="7" fill="${g(70)}"/><path d="M134 200 q 6 -22 14 -28" stroke="${g(70)}" stroke-width="2" fill="none"/>`,
);

const ORCHARD = svg(
  300,
  220,
  `<rect width="300" height="220" fill="${g(222)}"/><path d="M0 120 L300 112 L300 220 L0 220Z" fill="${g(168)}"/>
${[0, 1, 2, 3]
  .map((row) =>
    [0, 1, 2, 3, 4, 5, 6]
      .map((c) => {
        const x = 20 + c * 44 + (row % 2) * 22;
        const y = 120 + row * 26;
        const r = 12 + row * 4;
        return `<circle cx="${x}" cy="${y - r}" r="${r}" fill="${g(90 - row * 14)}"/><rect x="${x - 1.5}" y="${y - 4}" width="3" height="${8 + row * 3}" fill="${g(40)}"/>`;
      })
      .join(""),
  )
  .join("")}`,
);

const PROFILE = svg(
  220,
  300,
  `<rect width="220" height="300" fill="${g(222)}"/>
<path d="M80 300 C 80 250 70 230 76 210 C 60 200 58 186 66 178 C 58 170 60 160 70 156 C 62 140 64 110 80 92 C 100 66 150 62 168 92 C 186 120 178 170 160 196 C 150 214 150 240 158 300Z" fill="${g(34)}"/>
<path d="M150 82 C 160 70 178 74 180 92" stroke="${g(60)}" stroke-width="6" fill="none"/>`,
);

const CRANE = svg(
  220,
  300,
  `<rect width="220" height="300" fill="${g(196)}"/><rect y="236" width="220" height="64" fill="${g(120)}"/>
<path d="M60 236 L70 90 L86 90 L96 236" fill="none" stroke="${g(30)}" stroke-width="4"/><path d="M62 210 L94 180 M64 170 L92 140 M66 130 L90 104" stroke="${g(30)}" stroke-width="2"/>
<path d="M30 92 L200 76 L200 84 L30 98Z" fill="${g(30)}"/><rect x="66" y="78" width="26" height="18" fill="${g(36)}"/><path d="M180 84 v70" stroke="${g(30)}" stroke-width="1.5"/><rect x="172" y="154" width="16" height="12" fill="${g(40)}"/>
<rect x="120" y="214" width="70" height="22" fill="${g(70)}"/><rect x="128" y="200" width="30" height="14" fill="${g(90)}"/>`,
);

const CAT = svg(
  300,
  220,
  `<rect width="300" height="220" fill="${g(70)}"/><circle cx="226" cy="58" r="30" fill="${g(232)}"/><rect y="150" width="300" height="70" fill="${g(150)}"/>
${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${i * 46} 150 v70 M${i * 46 + 23} 172 v48" stroke="${g(110)}" stroke-width="2"/>`).join("")}<path d="M0 172 h300 M0 196 h300" stroke="${g(110)}" stroke-width="2"/>
<path d="M98 150 C 96 128 104 116 118 112 L114 98 L124 108 L134 106 L140 94 L142 112 C 150 120 150 140 146 150Z" fill="${g(18)}"/><path d="M98 148 C 80 150 72 170 78 186" stroke="${g(18)}" stroke-width="5" fill="none"/>`,
);

/** Eight black-and-white prints drawn in code: the default line. */
export const defaultDryingPrints: DryingLineItem[] = [
  {
    src: PIER,
    alt: "A wooden pier running out over a flat sea at low tide",
    caption: "Pier at low tide",
    note: "Neg 4 · f/11 · 9 s",
    aspect: 300 / 220,
  },
  {
    src: LIGHTHOUSE,
    alt: "A striped lighthouse on dark rocks under a pale sun",
    caption: "The light at Basin Head",
    note: "Neg 7 · f/8 · 14 s",
    aspect: 220 / 300,
  },
  {
    src: CYCLIST,
    alt: "A cyclist riding along a road between round trees",
    caption: "Cyclist, Fieldline road",
    note: "Neg 12 · f/8 · 11 s",
    aspect: 300 / 220,
  },
  {
    src: WINDOW,
    alt: "A bright window in a dark room, a curtain and a plant on the sill",
    caption: "North window",
    note: "Neg 15 · f/5.6 · 20 s",
    aspect: 220 / 300,
  },
  {
    src: ORCHARD,
    alt: "Rows of round orchard trees receding across a field",
    caption: "Orchard in rows",
    note: "Neg 19 · f/11 · 10 s",
    aspect: 300 / 220,
  },
  {
    src: PROFILE,
    alt: "A portrait of a person in profile against a pale wall",
    caption: "Portrait, profile",
    note: "Neg 22 · f/4 · 16 s",
    aspect: 220 / 300,
  },
  {
    src: CRANE,
    alt: "A harbour crane over a quay with a small shed",
    caption: "Crane, Coldbrook quay",
    note: "Neg 27 · f/8 · 12 s",
    aspect: 220 / 300,
  },
  {
    src: CAT,
    alt: "A cat sitting on a brick wall under the moon",
    caption: "Cat on the yard wall",
    note: "Neg 31 · f/5.6 · 18 s",
    aspect: 300 / 220,
  },
];

/* ----------------------------------- pegs ---------------------------------- */

const WOODC = "oklch(0.66 0.07 62)";
const STEEL = "oklch(0.3 0.01 260)";
const BRIGHT = "oklch(0.78 0.01 260)";

function Peg({
  kind,
  open,
  motionSafe,
}: {
  kind: DryingLinePegs;
  open: boolean;
  motionSafe: boolean;
}) {
  // The jaw opens quickly (flick) and shuts with a crisp overshoot (snap).
  const transition = motionSafe
    ? open
      ? springs.flick
      : springs.snap
    : { duration: 0 };
  if (kind === "binder") {
    return (
      <svg
        aria-hidden
        viewBox="-12 -16 24 40"
        width={24}
        height={40}
        className="absolute -top-4 -left-3 overflow-visible"
      >
        <motion.path
          d="M-7 0 C -9 -10 -4 -14 0 -14 C 4 -14 9 -10 7 0"
          fill="none"
          stroke={BRIGHT}
          strokeWidth={1.4}
          animate={{ rotate: open ? -24 : 0 }}
          transition={transition}
          style={{ originX: "50%", originY: "100%" }}
        />
        <path d="M-9 2 L9 2 L7 16 L-7 16Z" fill={STEEL} />
        <path d="M-9 2 L9 2" stroke={BRIGHT} strokeWidth={0.8} />
      </svg>
    );
  }
  if (kind === "film") {
    return (
      <svg
        aria-hidden
        viewBox="-12 -16 24 40"
        width={24}
        height={40}
        className="absolute -top-4 -left-3 overflow-visible"
      >
        <path
          d="M0 4 L0 -6 C 0 -12 -7 -12 -7 -6"
          fill="none"
          stroke={BRIGHT}
          strokeWidth={1.6}
        />
        <rect x={-5} y={3} width={10} height={14} rx={1.5} fill={BRIGHT} />
        <motion.rect
          x={-5}
          y={3}
          width={10}
          height={14}
          rx={1.5}
          fill="oklch(0.62 0.01 260)"
          animate={{ rotate: open ? 20 : 0 }}
          transition={transition}
          style={{ originX: "50%", originY: "0%" }}
        />
        <path d="M-4 15 h8" stroke={STEEL} strokeWidth={1} />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="-12 -16 24 40"
      width={24}
      height={40}
      className="absolute -top-4 -left-3 overflow-visible"
    >
      <rect x={-4.5} y={-12} width={4.5} height={32} rx={1.6} fill={WOODC} />
      <motion.rect
        x={0}
        y={-12}
        width={4.5}
        height={32}
        rx={1.6}
        fill="oklch(0.6 0.07 58)"
        animate={{ rotate: open ? -16 : 0 }}
        transition={transition}
        style={{ originX: "0%", originY: "45%" }}
      />
      <circle
        cx={0}
        cy={2}
        r={3}
        fill="none"
        stroke={BRIGHT}
        strokeWidth={1.2}
      />
    </svg>
  );
}

/* --------------------------------- component -------------------------------- */

type PrintSim = {
  phi: number;
  phiV: number;
  psi: number;
  psiV: number;
  /** Seeded: which way and how much the air turns this print. */
  bias: number;
};

type Sim = {
  pos: number;
  vel: number;
  target: number;
  dragging: boolean;
  /** Line acceleration in px/s², smoothed, for the pendulums. */
  acc: number;
  lastVel: number;
  prints: PrintSim[];
  frame: number;
  last: number;
  visible: boolean;
  idle: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) {
      return el;
    }
  }
  return null;
}

const biasOf = (i: number) => {
  let h = (i + 1) * 2654435761;
  h = (h ^ (h >>> 15)) >>> 0;
  return ((h % 1000) / 1000) * 2 - 1;
};

/**
 * Darkroom prints pegged to a sagging cord under a red safelight. The cord is
 * a pulley loop: drag it (1:1, released by projection to the nearest print and
 * carried there on the glide spring with the release velocity), scroll the
 * page, or use the arrow keys, and the prints travel along its curve, each peg
 * tilting with the cord's slope. Every print is a real pendulum and a torsion
 * pendulum: the line's acceleration swings it about its peg and the air it
 * moves through twists it about its hanging line, each its own way, damped by
 * `sway`, so the glossy faces turn and a band of red light slides across them;
 * when the line stops they swing down to rest and the loop stops.
 *
 * Click or press Enter on a print and it unclips: the peg's jaw opens on the
 * flick spring, the print glides to the front of the room with its darkroom
 * note, and the room dims. Back on the line (or Escape) carries it back, the
 * jaw snaps shut and the print gives a little swing. The prints are one tab
 * stop: Left and Right pull the line a print, Home and End go to the ends.
 * Under reduced motion nothing swings: the line steps and the print fades in
 * and out of the front.
 */
export function DryingLine({
  items = defaultDryingPrints,
  sway = 0.5,
  sag = 0.45,
  pegs = "wood",
  value,
  defaultValue = 0,
  onValueChange,
  onUnclip,
  spacing = 112,
  scroll = true,
  light = "oklch(0.66 0.19 32)",
  label = "Drying line",
  disabled = false,
  className,
}: DryingLineProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const list = items.length ? items : defaultDryingPrints;
  const n = list.length;

  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), n));
  const current = mod(Math.round(value ?? own), n);
  const [centre, setCentre] = React.useState(current);
  // A new value from the host is the new middle print, set in render.
  const [seenValue, setSeenValue] = React.useState(current);
  if (seenValue !== current) {
    setSeenValue(current);
    setCentre(current);
  }
  const [open, setOpen] = React.useState<number | null>(null);
  const [shown, setShown] = React.useState<number | null>(null);
  const [size, setSize] = React.useState({ w: 640, h: 208 });
  const [aspects, setAspects] = React.useState<Record<number, number>>({});
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cordRef = React.useRef<SVGPathElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLDivElement>());
  const glosses = React.useRef(new Map<number, HTMLSpanElement>());
  const buttons = React.useRef(new Map<number, HTMLButtonElement>());
  const backRef = React.useRef<HTMLButtonElement | null>(null);
  const focusNext = React.useRef<number | null>(null);
  const settleTimer = React.useRef<number | null>(null);
  const flight = React.useRef<ReturnType<typeof animate>[]>([]);

  const sim = React.useRef<Sim>({
    pos: current,
    vel: 0,
    target: current,
    dragging: false,
    acc: 0,
    lastVel: 0,
    prints: [],
    frame: 0,
    last: 0,
    visible: false,
    idle: 0,
  });

  /* ------------------------------ geometry ------------------------------ */

  const W = size.w;
  const H = size.h;
  const printH = Math.round(clamp(H * 0.42, 60, 150));
  const aspectOf = (i: number) =>
    list[i]?.aspect ??
    aspects[i] ??
    defaultDryingPrints[i % defaultDryingPrints.length]?.aspect ??
    0.8;
  const dims = list.map((_, i) => {
    const a = aspectOf(i);
    const h = a >= 1 ? Math.round(printH * 0.86) : printH;
    return { w: Math.round(h * a), h };
  });
  const widest = Math.max(...dims.map((d) => d.w), 40);
  const gap = Math.max(clamp(spacing, 60, 400), widest + 18);
  const pitch = Math.max(gap, (W + 2 * widest + 24) / Math.max(1, n));
  const loop = pitch * n;
  const y0 = 24;
  const sagPx = clamp(sag, 0, 1) * Math.min(48, H * 0.22);
  const lineY = (x: number) => {
    const t = clamp(x / Math.max(1, W), 0, 1);
    return y0 + sagPx * (1 - (2 * t - 1) * (2 * t - 1));
  };
  const slope = (x: number) => {
    const t = clamp(x / Math.max(1, W), 0, 1);
    return (-4 * sagPx * (2 * t - 1)) / Math.max(1, W);
  };

  // The server's (and the first frame's) pose: every print at rest about
  // the first middle print. Computed once, so React never writes it again —
  // after mount the loop owns the transforms.
  const [pose0] = React.useState(() =>
    list.map((_, i) => {
      const x = mod((i - current) * pitch + loop / 2, loop) - loop / 2 + W / 2;
      const a = (Math.atan(slope(x)) * 0.5 * 180) / Math.PI;
      return `translate3d(${r2(x)}px, ${r2(lineY(x))}px, 0) rotate(${r2(a)}deg) perspective(520px) rotateY(0deg)`;
    }),
  );

  const config = {
    W,
    n,
    pitch,
    loop,
    lineY,
    slope,
    sway: clamp(sway, 0, 1),
    motionSafe,
    scroll,
    disabled,
    open,
    onValueChange,
    value,
  };
  const latest = React.useRef(config);

  /** Where print i sits now: x on the room and its peg's slope. */
  const placeOf = (i: number, pos: number) => {
    const c = latest.current;
    const x =
      mod((i - pos) * c.pitch + c.loop / 2, c.loop) - c.loop / 2 + c.W / 2;
    return { x, y: c.lineY(x), a: Math.atan(c.slope(x)) };
  };

  const write = () => {
    const s = sim.current;
    const c = latest.current;
    for (const [i, node] of nodes.current) {
      const p = placeOf(i, s.pos);
      const ps = s.prints[i];
      const phi = c.motionSafe && ps ? ps.phi : 0;
      const psi = c.motionSafe && ps ? ps.psi : 0;
      const tilt = ((p.a * 0.5 + phi) * 180) / Math.PI;
      node.style.transform = `translate3d(${r2(p.x)}px, ${r2(p.y)}px, 0) rotate(${r2(tilt)}deg) perspective(520px) rotateY(${r2((psi * 180) / Math.PI)}deg)`;
      const gl = glosses.current.get(i);
      if (gl) {
        // The glossy face catches the lamp (up and to the left) as it turns.
        const face = Math.cos(psi + 0.42 - phi * 0.4);
        const shine = Math.pow(Math.max(0, face), 10);
        gl.style.opacity = String(r2(0.1 + 0.75 * shine));
        gl.style.backgroundPosition = `${r2(50 + psi * 90)}% 0%`;
      }
    }
    const cord = cordRef.current;
    // The cord's twist runs with the prints.
    if (cord) cord.style.strokeDashoffset = String(r2(s.pos * c.pitch));
  };

  const tickRef = React.useRef<(now: number) => void>(() => {});
  React.useEffect(() => {
    latest.current = config;
    const s = sim.current;
    while (s.prints.length < n) {
      s.prints.push({
        phi: 0,
        phiV: 0,
        psi: 0,
        psiV: 0,
        bias: biasOf(s.prints.length),
      });
    }
    tickRef.current = (now: number) => {
      s.frame = 0;
      const c = latest.current;
      if (!s.visible || document.hidden) {
        s.last = 0;
        return;
      }
      const dt = s.last ? Math.min(0.04, (now - s.last) / 1000) : 1 / 60;
      s.last = now;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      const k = springs.glide.stiffness / springs.glide.mass;
      const d = springs.glide.damping / springs.glide.mass;
      if (!c.motionSafe) {
        if (!s.dragging) s.pos = s.target;
        s.vel = 0;
        s.acc = 0;
      } else if (!s.dragging) {
        let a = 0;
        for (let i = 0; i < steps; i += 1) {
          a = -k * (s.pos - s.target) - d * s.vel;
          s.vel += a * h;
          s.pos += s.vel * h;
        }
        s.acc = a * c.pitch;
      } else {
        // While held the line follows the hand; its acceleration is read
        // from the change in velocity, smoothed.
        const raw = (s.vel - s.lastVel) / Math.max(dt, 1e-3);
        s.acc += (raw * c.pitch - s.acc) * 0.35;
      }
      s.lastVel = s.vel;
      const zeta = lerp(0.6, 0.1, c.sway);
      const ws = 7;
      const wt = 5;
      const ks = 0.006 * c.sway;
      const kt = 0.0005 * c.sway;
      let moving =
        Math.abs(s.pos - s.target) > 1e-4 ||
        Math.abs(s.vel) > 1e-3 ||
        s.dragging;
      if (c.motionSafe) {
        const v = s.vel * c.pitch;
        for (const p of s.prints) {
          for (let i = 0; i < steps; i += 1) {
            p.phiV +=
              (-ws * ws * p.phi - 2 * zeta * ws * p.phiV - ks * s.acc) * h;
            p.phi += p.phiV * h;
            const torque = kt * p.bias * v * 6 + 0.6 * p.bias * p.phiV;
            p.psiV += (-wt * wt * p.psi - 2 * zeta * wt * p.psiV + torque) * h;
            p.psi += p.psiV * h;
          }
          p.phi = clamp(p.phi, -0.7, 0.7);
          p.psi = clamp(p.psi, -1.1, 1.1);
          if (
            Math.abs(p.phi) > 0.002 ||
            Math.abs(p.psi) > 0.002 ||
            Math.abs(p.phiV) > 0.01 ||
            Math.abs(p.psiV) > 0.01
          ) {
            moving = true;
          }
        }
      }
      write();
      if (moving) {
        s.frame = window.requestAnimationFrame(tickRef.current);
        return;
      }
      s.last = 0;
      s.pos = s.target;
      s.vel = 0;
      s.acc = 0;
      for (const p of s.prints) p.phi = p.phiV = p.psi = p.psiV = 0;
      write();
    };
  });

  const kick = React.useCallback(() => {
    const s = sim.current;
    if (s.frame || !s.visible || document.hidden) return;
    s.frame = window.requestAnimationFrame((t) => tickRef.current(t));
  }, []);

  /** The wrap-equivalent of index i nearest to where the line is now. */
  const nearestOf = (i: number, from: number) =>
    from + mod(i - from + n / 2, n) - n / 2;

  /** A print has come to the middle: state, report, speech. */
  const arrive = (i: number) => {
    const c = latest.current;
    setCentre(i);
    if (i === mod(Math.round(c.value ?? own), n) && c.value !== undefined) {
      return;
    }
    if (c.value === undefined) setOwn(i);
    c.onValueChange?.(i);
    const item = list[i];
    setSaid((p) => ({
      n: p.n + 1,
      text: `Print ${i + 1} of ${n}${item?.caption ? `: ${item.caption}` : ""}.`,
    }));
  };

  /** Pull the line so print i comes to the middle. */
  const pullTo = (i: number, velocity = 0) => {
    const s = sim.current;
    const index = mod(Math.round(i), n);
    s.target = nearestOf(index, s.pos);
    s.vel = velocity;
    kick();
    if (index !== centre) arrive(index);
  };

  /** After a drag, a scroll or a wheel: commit to the print it would rest at. */
  const settle = (velocity: number) => {
    const s = sim.current;
    const c = latest.current;
    const landing = c.motionSafe
      ? project(s.pos * c.pitch, velocity * c.pitch, 0.997) / c.pitch
      : s.pos;
    const index = mod(Math.round(landing), n);
    s.target = Math.round(landing);
    s.vel = c.motionSafe ? velocity : 0;
    kick();
    if (index !== centre) arrive(index);
  };

  const api = React.useRef({ settle, kick });
  React.useEffect(() => {
    api.current = { settle, kick };
  });

  // A host that moves `value` pulls the line there.
  const asked = React.useRef(current);
  React.useEffect(() => {
    if (asked.current === current) return;
    asked.current = current;
    const s = sim.current;
    if (mod(Math.round(s.target), n) === current) return;
    s.target = s.pos + mod(current - s.pos + n / 2, n) - n / 2;
    kick();
  }, [current, n, kick]);

  // Visibility, size, the page's scroll and the wheel.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const s = sim.current;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      s.visible = Boolean(entry?.isIntersecting);
      if (s.visible) {
        write();
        kick();
      }
    });
    watcher.observe(root);
    const sizer = new ResizeObserver(() => {
      const w = Math.round(root.clientWidth);
      const h = Math.round(root.clientHeight);
      if (w > 0 && h > 0) {
        setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
      }
    });
    sizer.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const restSoon = (velocity: number) => {
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        s.dragging = false;
        api.current.settle(velocity);
      }, 140);
    };

    const scroller = scrollParent(root);
    const target: HTMLElement | Window = scroller ?? window;
    const read = () =>
      scroller
        ? scroller.scrollTop
        : (document.scrollingElement?.scrollTop ?? 0);
    let lastTop = read();
    let lastT = performance.now();
    const onScroll = () => {
      const c = latest.current;
      const top = read();
      const dy = top - lastTop;
      const t = performance.now();
      const dt = Math.max(8, t - lastT) / 1000;
      lastTop = top;
      lastT = t;
      if (!c.scroll || c.disabled || c.open !== null || !s.visible || !dy) {
        return;
      }
      // The page's scroll pulls the line half as far, as if wound on a drum.
      const move = (dy * 0.5) / c.pitch;
      s.dragging = true;
      s.pos += move;
      s.vel = move / dt;
      api.current.kick();
      restSoon(s.vel * 0.5);
    };
    target.addEventListener("scroll", onScroll, { passive: true });

    const onWheel = (event: WheelEvent) => {
      const c = latest.current;
      if (c.disabled || c.open !== null) return;
      const d = wheelPixels(event);
      if (Math.abs(d.x) <= Math.abs(d.y)) return;
      event.preventDefault();
      const move = -d.x / c.pitch;
      s.dragging = true;
      s.pos += move;
      s.vel = move * 60;
      api.current.kick();
      restSoon(s.vel * 0.4);
    };
    root.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      watcher.disconnect();
      sizer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      target.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", onWheel);
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
      if (s.frame) window.cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.last = 0;
      s.visible = false;
      s.dragging = false;
    };
    // write reads refs only; the listeners are bound once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kick]);

  // A new layout places the prints again at once.
  React.useEffect(() => {
    write();
    // write reads the latest geometry from its ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, pitch, sagPx, n, motionSafe, open]);

  React.useEffect(
    () => () => {
      for (const f of flight.current) f.stop();
    },
    [],
  );

  // Focus follows the line to the print that arrived at the middle, and
  // returns to a print once it is back on the line and visible again.
  React.useEffect(() => {
    if (shown !== null) return;
    const i = focusNext.current;
    if (i === null) return;
    focusNext.current = null;
    buttons.current.get(i)?.focus();
  }, [centre, shown]);

  /* ------------------------------- unclip -------------------------------- */

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fr = useMotionValue(0);
  const fo = useMotionValue(0);
  const dim = useMotionValue(0);

  const front = (i: number) => {
    const d = dims[i] ?? { w: 80, h: 100 };
    const wide = W >= 440;
    const maxH = wide ? H - 40 : H - 66;
    const s = Math.min(maxH / d.h, (wide ? W * 0.5 : W - 32) / d.w);
    const w = d.w * s;
    const h = d.h * s;
    const x = wide ? W / 2 - w / 2 - 70 : (W - w) / 2;
    return { x, y: wide ? (H - h) / 2 : 14, w, h, s };
  };

  const unclip = (i: number) => {
    if (disabled || open !== null) return;
    const c = latest.current;
    const node = nodes.current.get(i);
    const root = rootRef.current;
    if (!node || !root) return;
    for (const f of flight.current) f.stop();
    const at = front(i);
    const r = (buttons.current.get(i) ?? node).getBoundingClientRect();
    const box = root.getBoundingClientRect();
    setOpen(i);
    setShown(i);
    onUnclip?.(i);
    setSaid((p) => ({
      n: p.n + 1,
      text: `${list[i]?.caption ?? `Print ${i + 1}`} unclipped.`,
    }));
    const fromX = r.left - box.left;
    const fromY = r.top - box.top;
    if (!c.motionSafe) {
      fx.jump(at.x);
      fy.jump(at.y);
      fs.jump(at.s);
      fr.jump(0);
      fo.jump(0);
      flight.current = [
        animate(fo, 1, { duration: durations.base, ease: easings.enter }),
        animate(dim, 1, { duration: durations.base, ease: easings.enter }),
      ];
      return;
    }
    fx.jump(fromX);
    fy.jump(fromY);
    fs.jump(1);
    fr.jump(0);
    fo.jump(1);
    flight.current = [
      // A short drop out of the jaws, then the glide to the front.
      animate(fy, [fromY, fromY + 8, at.y], {
        duration: 0.52,
        times: [0, 0.18, 1],
        ease: [easings.exit, easings.enter],
      }),
      animate(fx, at.x, { ...springs.glide, delay: 0.08 }),
      animate(fs, at.s, { ...springs.glide, delay: 0.08 }),
      animate(dim, 1, { duration: durations.slow, ease: easings.enter }),
    ];
  };

  const clipBack = () => {
    if (open === null) return;
    const i = open;
    const c = latest.current;
    const node = nodes.current.get(i);
    const root = rootRef.current;
    for (const f of flight.current) f.stop();
    const done = () => {
      setShown(null);
      const p = sim.current.prints[i];
      if (p && c.motionSafe) p.phiV += 2.2 * (0.4 + c.sway);
      kick();
    };
    setOpen(null);
    onUnclip?.(null);
    setSaid((p) => ({ n: p.n + 1, text: "Back on the line." }));
    focusNext.current = i;
    if (!c.motionSafe || !node || !root) {
      flight.current = [
        animate(fo, 0, { ...exitFor(durations.base), onComplete: done }),
        animate(dim, 0, exitFor(durations.base)),
      ];
      return;
    }
    // The print on the line is hidden but laid out: fly back to its box.
    const r = (buttons.current.get(i) ?? node).getBoundingClientRect();
    const box = root.getBoundingClientRect();
    flight.current = [
      animate(fx, r.left - box.left, springs.glide),
      animate(fy, r.top - box.top, springs.glide),
      animate(fs, 1, { ...springs.glide, onComplete: done }),
      animate(dim, 0, exitFor(durations.slow)),
    ];
  };

  // Focus moves into the front print's controls when it arrives.
  const bindBack = React.useCallback((node: HTMLButtonElement | null) => {
    backRef.current = node;
    node?.focus();
  }, []);

  /* ------------------------------ gestures ------------------------------- */

  const dragFrom = React.useRef(0);
  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: disabled || open !== null,
    onStart: () => {
      const s = sim.current;
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      s.dragging = true;
      dragFrom.current = s.pos;
      s.vel = 0;
      kick();
    },
    onMove: ({ offset }) => {
      const s = sim.current;
      const c = latest.current;
      const next = dragFrom.current - offset.x / c.pitch;
      s.vel = (next - s.pos) * 60;
      s.pos = next;
      kick();
    },
    onEnd: ({ velocity }) => {
      const s = sim.current;
      const c = latest.current;
      s.dragging = false;
      settle(-velocity.x / c.pitch);
    },
    onCancel: () => {
      sim.current.dragging = false;
      settle(0);
    },
    onTap: (event) => {
      const el = (event.target as Element | null)?.closest("[data-print]");
      const i = Number(el?.getAttribute("data-print"));
      if (Number.isFinite(i) && el) unclip(i);
    },
  });

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    if (disabled) return;
    const moves: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: n - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const index = mod(to, n);
    focusNext.current = index;
    pullTo(event.key === "Home" || event.key === "End" ? index : to);
  };

  /* -------------------------------- render ------------------------------- */

  const capId = `${uid}-cap`;
  const openItem = shown !== null ? list[shown] : null;
  const openAt = shown !== null ? front(shown) : null;
  const openDims = shown !== null ? dims[shown] : null;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="drying line"
      aria-label={label}
      aria-disabled={disabled || undefined}
      {...drag}
      className={cn(
        "group/drying-line relative isolate h-56 w-full touch-pan-y overflow-clip rounded-3 select-none [-webkit-tap-highlight-color:transparent]",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={{
        backgroundColor: "oklch(0.16 0.014 30)",
        backgroundImage: `radial-gradient(120% 150% at 4% -10%, color-mix(in oklab, ${light} 34%, transparent), transparent 62%)`,
      }}
    >
      {/* The safelight, its housing just inside the top-left corner. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-3 flex h-4 w-12 items-end justify-center rounded-b-2 bg-[oklch(0.2_0.012_30)] pb-1"
      >
        <span
          className="h-1 w-9 rounded-full"
          style={{
            backgroundColor: `color-mix(in oklab, ${light} 85%, white)`,
            boxShadow: `0 2px 18px 6px color-mix(in oklab, ${light} 50%, transparent)`,
          }}
        />
      </span>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
      >
        <circle cx={8} cy={y0} r={2.6} fill="oklch(0.5 0.02 40)" />
        <circle cx={W - 8} cy={y0} r={2.6} fill="oklch(0.5 0.02 40)" />
        <path
          d={`M8 ${y0} Q ${r2(W / 2)} ${r2(y0 + 2 * sagPx)} ${W - 8} ${y0}`}
          fill="none"
          stroke="oklch(0.52 0.06 40)"
          strokeWidth={1.6}
        />
        <path
          ref={cordRef}
          d={`M8 ${y0} Q ${r2(W / 2)} ${r2(y0 + 2 * sagPx)} ${W - 8} ${y0}`}
          fill="none"
          stroke="oklch(0.32 0.04 35)"
          strokeWidth={1.6}
          strokeDasharray="2 3"
        />
      </svg>
      {list.map((item, i) => {
        const d = dims[i] ?? { w: 80, h: 100 };
        const out = shown === i;
        return (
          <div
            key={i}
            ref={(node) => {
              if (node) nodes.current.set(i, node);
              else nodes.current.delete(i);
            }}
            data-print={i}
            className="absolute top-0 left-0 size-0"
            style={{ transformOrigin: "0 0", transform: pose0[i] }}
          >
            <Peg kind={pegs} open={open === i} motionSafe={motionSafe} />
            <button
              ref={(node) => {
                if (node) buttons.current.set(i, node);
                else buttons.current.delete(i);
              }}
              type="button"
              tabIndex={i === centre ? 0 : -1}
              aria-label={`${item.caption ?? `Print ${i + 1}`}: ${item.alt}`}
              aria-haspopup="dialog"
              disabled={disabled}
              onClick={(event) => {
                if (event.detail === 0) unclip(i);
              }}
              onKeyDown={(event) => onKeyDown(event, i)}
              className={cn(
                "absolute top-2.5 block cursor-pointer p-1 shadow-[0_6px_12px_color-mix(in_oklab,black_45%,transparent)] outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                out && "invisible",
              )}
              style={{
                left: -(d.w + 8) / 2,
                width: d.w + 8,
                height: d.h + 8,
                backgroundColor: "oklch(0.95 0.008 85)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.src ?? defaultDryingPrints[i % 8]?.src}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  if (item.aspect) return;
                  const el = event.currentTarget;
                  const a = el.naturalWidth / Math.max(1, el.naturalHeight);
                  setAspects((p) =>
                    Math.abs((p[i] ?? 0) - a) < 0.01 ? p : { ...p, [i]: a },
                  );
                }}
                className="block size-full object-cover"
              />
              {/* Under the safelight every white is warm. */}
              <span
                aria-hidden
                className="absolute inset-0 mix-blend-multiply"
                style={{
                  backgroundColor: `color-mix(in oklab, ${light} 46%, white)`,
                }}
              />
              <span
                ref={(node) => {
                  if (node) glosses.current.set(i, node);
                  else glosses.current.delete(i);
                }}
                aria-hidden
                className="absolute inset-0 mix-blend-screen"
                style={{
                  opacity: 0.1,
                  backgroundImage: `linear-gradient(105deg, transparent 30%, color-mix(in oklab, ${light} 70%, white) 50%, transparent 70%)`,
                  backgroundSize: "260% 100%",
                  backgroundPosition: "50% 0%",
                }}
              />
            </button>
          </div>
        );
      })}

      {/* The front of the room: the unclipped print and its note. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,black_62%,transparent)]"
        style={{ opacity: dim }}
      />
      {shown !== null && openItem && openAt && openDims ? (
        <div
          role="dialog"
          aria-labelledby={capId}
          className="absolute inset-0"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            if (event.target === event.currentTarget) clipBack();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              clipBack();
            } else if (event.key === "Tab") {
              event.preventDefault();
              backRef.current?.focus();
            }
          }}
        >
          <motion.div
            className="pointer-events-none absolute top-0 left-0 origin-top-left p-1 shadow-[0_18px_40px_color-mix(in_oklab,black_55%,transparent)]"
            style={{
              x: fx,
              y: fy,
              scale: fs,
              rotate: fr,
              opacity: fo,
              width: openDims.w + 8,
              height: openDims.h + 8,
              backgroundColor: "oklch(0.95 0.008 85)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={openItem.src ?? defaultDryingPrints[shown % 8]?.src}
              alt={openItem.alt}
              draggable={false}
              className="block size-full object-cover"
            />
            <span
              aria-hidden
              className="absolute inset-0 mix-blend-multiply"
              style={{
                backgroundColor: `color-mix(in oklab, ${light} 30%, white)`,
              }}
            />
          </motion.div>
          <motion.div
            className={cn(
              "absolute flex flex-col gap-1.5",
              W >= 440
                ? "w-44"
                : "inset-x-4 flex-row flex-wrap items-center justify-between gap-x-3",
            )}
            style={
              W >= 440
                ? {
                    left: openAt.x + openAt.w + 20,
                    top: openAt.y + openAt.h / 2 - 44,
                    opacity: dim,
                  }
                : { bottom: 10, opacity: dim }
            }
          >
            <div className="min-w-0">
              <p
                id={capId}
                className="truncate text-sm font-medium text-[oklch(0.95_0.01_80)]"
                title={openItem.caption}
              >
                {openItem.caption ?? `Print ${shown + 1}`}
              </p>
              {openItem.note ? (
                <p className="font-mono text-[10px] tracking-[0.06em] text-[oklch(0.78_0.04_40)]">
                  {openItem.note}
                </p>
              ) : null}
            </div>
            <button
              ref={bindBack}
              type="button"
              onClick={clipBack}
              className="inline-flex h-7 shrink-0 items-center self-start rounded-2 border border-[oklch(0.6_0.05_40/0.5)] px-2.5 text-[11px] text-[oklch(0.92_0.02_70)] transition-colors outline-none hover:bg-[oklch(1_0_0/0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              Back on the line
            </button>
          </motion.div>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
