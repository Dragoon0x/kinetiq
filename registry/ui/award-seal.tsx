"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AwardSealFoil = "gold" | "silver" | "bronze";

export type AwardSealProps = {
  /** Who awards it, printed in spaced capitals at the top. */
  issuer: string;
  /** The award itself, e.g. "Certificate of Completion". */
  award: string;
  /** Who receives it. */
  recipient: string;
  /** One or two lines on what it is for. */
  citation?: string;
  /** The date as it should be printed. */
  date: string;
  /** Whose signature writes itself on the line. */
  signer: string;
  /** Printed after the signer's name. */
  signerTitle?: string;
  /** Controlled: whether the certificate is signed and sealed. */
  sealed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultSealed?: boolean;
  /** Fires from the press that signs and seals it, with true. */
  onSealedChange?: (sealed: boolean) => void;
  /** The rosette's foil. @default "gold" */
  foil?: AwardSealFoil;
  /** Two ribbon tails hang from the seal and swing. @default true */
  ribbons?: boolean;
  /** How loosely the ribbons swing, 0 to 1. @default 0.5 */
  swing?: number;
  /** Play the press and the foil's flash. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type FoilDef = {
  base: string;
  hi: string;
  lo: string;
  /** Printed accents on the paper, matched to the foil. */
  accent: string;
  ribbon: string;
  ribbonHi: string;
};

// Foil, satin and paper are pigment: the certificate is the same object in
// either theme.
const FOILS: Record<AwardSealFoil, FoilDef> = {
  gold: {
    base: "0.79 0.12 82",
    hi: "0.97 0.07 95",
    lo: "0.48 0.1 64",
    accent: "oklch(0.5 0.09 70)",
    ribbon: "oklch(0.4 0.11 262)",
    ribbonHi: "0.78 0.07 262",
  },
  silver: {
    base: "0.8 0.012 250",
    hi: "0.985 0.004 250",
    lo: "0.48 0.016 250",
    accent: "oklch(0.44 0.025 250)",
    ribbon: "oklch(0.42 0.13 20)",
    ribbonHi: "0.8 0.06 20",
  },
  bronze: {
    base: "0.67 0.1 52",
    hi: "0.88 0.08 64",
    lo: "0.4 0.08 40",
    accent: "oklch(0.46 0.08 46)",
    ribbon: "oklch(0.4 0.07 160)",
    ribbonHi: "0.78 0.05 160",
  },
};

const PAPER = "oklch(0.975 0.013 88)";
const INK = "oklch(0.27 0.02 60)";
const FAINT = "oklch(0.48 0.02 60)";
const PEN = "oklch(0.33 0.09 262)";

/** Where the lamp rests over the seal: up and to the left. */
const REST_AZ = -2.3;
const REST_S = 0.55;
/** A crimped pleat's tilt along the ring, and the ring's dome. */
const PLEAT = (32 * Math.PI) / 180;
const DOME = (18 * Math.PI) / 180;
const RIM = (40 * Math.PI) / 180;
/** The ribbons' drawing space, its origin at the seal's centre. */
const RIB_W = 104;
const RIB_H = 74;
const RIB_LEN = 64;
const RIB_WIDTH = 14;
const RIB_REST = 0.22;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Pt = readonly [number, number];

/** A Catmull-Rom spline through the points, as cubic Béziers. */
function spline(pts: readonly Pt[]): string {
  if (pts.length < 2) return "";
  const at = (i: number) => pts[clamp(i, 0, pts.length - 1)] as Pt;
  let d = `M${r2(at(0)[0])} ${r2(at(0)[1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r2(c1[0] ?? 0)} ${r2(c1[1] ?? 0)} ${r2(c2[0] ?? 0)} ${r2(c2[1] ?? 0)} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d;
}

const ASCENDERS = "bdfhklt";
const DESCENDERS = "gjpqyz";

/**
 * A signature in the signer's hand, deterministic from the name: a capital
 * loop for the first initial, then the surname as connected strokes — arches
 * for small letters, tall loops for ascenders, low loops for descenders —
 * with a seeded wobble and a forward slant, finished by an underline that
 * swoops back under the name. Illegible the way signatures are.
 */
function signatureOf(name: string): { d: string; width: number } {
  const rand = lcg(hash(name));
  const words = name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  // The initial's loop: its height and lean differ from letter to letter.
  const first = (words[0] ?? "A").charCodeAt(0) || 65;
  const tall = 19 + (first % 5);
  const lean = (first % 3) - 1;
  const surname = (words.length > 1 ? words[words.length - 1] : "") ?? "";
  const base = 27;
  const xh = 7;
  const pts: Pt[] = [];
  const j = () => (rand() - 0.5) * 1.6;
  let x = 3;
  // The initial: up in a tall stroke, a loop back over the top, out low.
  pts.push(
    [x, base - 2],
    [x + 5 + lean, base - tall + j()],
    [x + 10 + lean, base - tall - 2 + j()],
    [x + 8, base - 12],
    [x + 3, base - 6],
    [x + 10, base - 8 + j()],
  );
  x += 14;
  if (surname) {
    pts.push([x, base - 18 + j()], [x - 1.5, base - 8], [x + 2, base]);
    x += 4;
    for (const ch of surname.slice(1, 9).toLowerCase()) {
      if (ASCENDERS.includes(ch)) {
        pts.push(
          [x + 1.5, base - 6],
          [x + 4.5, base - 19 + j()],
          [x + 2.4, base - 19.5 + j()],
          [x + 3.4, base],
        );
        x += 6;
      } else if (DESCENDERS.includes(ch)) {
        pts.push(
          [x + 2, base - xh + j()],
          [x + 3.6, base + 8 + j()],
          [x + 1.6, base + 9],
          [x + 4, base - 1],
        );
        x += 6;
      } else {
        pts.push([x + 1.9, base - xh + j() * 0.6], [x + 3.8, base + j() * 0.4]);
        x += 4.4;
      }
    }
  }
  // The flourish: off the last letter, down and back under the name.
  pts.push(
    [x + 5, base - 4],
    [x + 3, base + 5],
    [x * 0.55, base + 8 + j()],
    [8, base + 6],
    [x * 0.45, base + 3],
  );
  const slanted = pts.map(([px, py]): Pt => [px + (base - py) * 0.3 + 2, py]);
  return { d: spline(slanted), width: Math.ceil(x + 16) };
}

/** The rosette's serrated edge: 36 teeth, as a clip-path polygon. */
const SERRATION = (() => {
  const pts: string[] = [];
  for (let k = 0; k < 72; k += 1) {
    const a = ((k * 5 - 90) * Math.PI) / 180;
    const r = k % 2 ? 45.5 : 50;
    pts.push(
      `${Number((50 + Math.cos(a) * r).toFixed(2))}% ${Number((50 + Math.sin(a) * r).toFixed(2))}%`,
    );
  }
  return `polygon(${pts.join(", ")})`;
})();

const band = (a: number, b: number) =>
  `radial-gradient(circle closest-side, transparent ${a}%, black ${a + 1}%, black ${b - 1}%, transparent ${b}%)`;
const CRIMP_MASK = band(64, 100);
const RIM_MASK = band(80, 100);

type Lit = { az: number; s: number; lz: number };

const tone = (delta: number, f: FoilDef, gain = 2.4) =>
  delta >= 0
    ? `oklch(${f.hi} / ${r3(Math.min(0.95, delta * gain))})`
    : `oklch(${f.lo} / ${r3(Math.min(0.8, -delta * gain * 0.85))})`;

/**
 * Crimped foil: each pleat is two facets tilted along the ring, so a facet's
 * brightness is ±sin(pleat)·s·sin(az − m), on top of the ring's dome. Pleats
 * square to the light flash in alternating stripes while pleats facing it
 * stay even: the sparkle of real crimped foil, as 72 conic stops.
 */
function crimp(l: Lit, f: FoilDef): string {
  const stops: string[] = [];
  for (let k = 0; k < 72; k += 1) {
    const from = k * 5;
    const m = ((from + 2.5 - 90) * Math.PI) / 180;
    const sign = k % 2 ? -1 : 1;
    const delta =
      sign * Math.sin(PLEAT) * l.s * Math.sin(l.az - m) +
      Math.sin(DOME) * l.s * Math.cos(m - l.az) +
      (Math.cos(PLEAT) * Math.cos(DOME) - 1) * l.lz;
    stops.push(`${tone(delta, f)} ${from}deg ${from + 5}deg`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}

/** A bevelled rim: a cosine around the ring, peaking toward the light. */
function rim(l: Lit, f: FoilDef): string {
  const stops: string[] = [];
  for (let k = 0; k <= 12; k += 1) {
    const css = k * 30;
    const m = ((css - 90) * Math.PI) / 180;
    const delta =
      Math.sin(RIM) * l.s * Math.cos(m - l.az) + (Math.cos(RIM) - 1) * l.lz;
    stops.push(`${tone(delta, f, 1.8)} ${css}deg`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}

/** The laurel and star on the medallion, in a 40-unit box. */
const EMBLEM = (() => {
  const leaves: { cx: number; cy: number; a: number }[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) {
      const t = (i + 0.5) / 6;
      const ang = Math.PI / 2 + side * (0.25 + t * 1.75);
      const cx = 20 + Math.cos(ang) * 13.5;
      const cy = 21 + Math.sin(ang) * 13.5;
      const out = i % 2 ? 1.8 : -0.4;
      leaves.push({
        cx: Number((cx + Math.cos(ang) * out).toFixed(3)),
        cy: Number((cy + Math.sin(ang) * out).toFixed(3)),
        a: Number(
          (((ang + (side * Math.PI) / 2) * 180) / Math.PI + side * 28).toFixed(
            2,
          ),
        ),
      });
    }
  }
  const star: string[] = [];
  for (let k = 0; k < 10; k += 1) {
    const a = ((-90 + k * 36) * Math.PI) / 180;
    const r = k % 2 ? 2.9 : 7;
    star.push(
      `${Number((20 + Math.cos(a) * r).toFixed(3))} ${Number((20.5 + Math.sin(a) * r).toFixed(3))}`,
    );
  }
  return { leaves, star: `M${star.join("L")}Z` };
})();

function Emblem({ fill }: { fill: string }) {
  return (
    <g style={{ fill }}>
      <path d={EMBLEM.star} />
      {EMBLEM.leaves.map((leaf, i) => (
        <ellipse
          key={i}
          cx={leaf.cx}
          cy={leaf.cy}
          rx={2.7}
          ry={1.15}
          transform={`rotate(${leaf.a} ${leaf.cx} ${leaf.cy})`}
        />
      ))}
    </g>
  );
}

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** One tail: two segments, the lower lagging the upper, ending in a V-notch. */
function ribbonPath(ax: number, theta: number, lower: number, unfurl: number) {
  const len = RIB_LEN * clamp(unfurl, 0, 1);
  if (len < 1) return { body: "", sheen: "" };
  const l1 = len * 0.55;
  const l2 = len * 0.45;
  const p0: Pt = [ax, 0];
  const p1: Pt = [ax + Math.sin(theta) * l1, Math.cos(theta) * l1];
  const p2: Pt = [p1[0] + Math.sin(lower) * l2, p1[1] + Math.cos(lower) * l2];
  const n = (a: number): Pt => [Math.cos(a), -Math.sin(a)];
  const mid = (theta + lower) / 2;
  const w = RIB_WIDTH / 2;
  const off = (p: Pt, a: number, k: number): string =>
    `${r2(p[0] + n(a)[0] * k)} ${r2(p[1] + n(a)[1] * k)}`;
  const notch: Pt = [
    p2[0] - Math.sin(lower) * w * 1.1,
    p2[1] - Math.cos(lower) * w * 1.1,
  ];
  const body = `M${off(p0, theta, w)}Q${off(p1, mid, w)} ${off(p2, lower, w)}L${r2(notch[0])} ${r2(notch[1])}L${off(p2, lower, -w)}Q${off(p1, mid, -w)} ${off(p0, theta, -w)}Z`;
  const sheen = `M${off(p0, theta, w * 0.15)}Q${off(p1, mid, w * 0.15)} ${off(p2, lower, w * 0.15)}L${off(p2, lower, -w * 0.35)}Q${off(p1, mid, -w * 0.35)} ${off(p0, theta, -w * 0.35)}Z`;
  return { body, sheen };
}

function Ribbon({
  ax,
  theta,
  unfurl,
  lag,
  f,
}: {
  ax: number;
  theta: MotionValue<number>;
  unfurl: MotionValue<number>;
  lag: number;
  f: FoilDef;
}) {
  const omega = useVelocity(theta);
  const shape = useTransform(
    [theta, omega, unfurl] as MotionValue<number>[],
    ([t = 0, w = 0, u = 0]: number[]) =>
      ribbonPath(ax, t, t - clamp(w * lag, -0.9, 0.9), u),
  );
  const body = useTransform(shape, (s) => s.body);
  const sheenD = useTransform(shape, (s) => s.sheen);
  // Satin catches the light as the tail turns toward it.
  const sheen = useTransform(theta, (t) =>
    r2(0.18 + 0.32 * Math.max(0, Math.sin(t * 2.2 + (ax < 0 ? 0.9 : -0.2)))),
  );
  return (
    <g>
      <motion.path d={body} style={{ fill: f.ribbon }} />
      <motion.path
        d={sheenD}
        style={{ fill: `oklch(${f.ribbonHi})`, opacity: sheen }}
      />
      <motion.path
        d={body}
        fill="none"
        strokeWidth={0.8}
        style={{ stroke: `oklch(${f.base} / 0.85)` }}
      />
    </g>
  );
}

function ReplayGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" />
      <path d="M2.6 2.2v2.8h2.8" />
    </svg>
  );
}

type Ceremony = { timers: number[]; anims: AnimationPlaybackControls[] };

/**
 * A certificate that is signed and sealed in front of you. The signature —
 * generated from the signer's name, a capital loop, connected strokes and a
 * flourish — writes itself along its own path; then an embosser presses a
 * crimped foil rosette onto the paper (an accelerating press, a thud, the
 * paper dimpling round it), the foil flashes as the light sweeps round its
 * crimps, and two ribbon tails drop from under it and swing as damped
 * pendulums whose looseness is `swing`.
 *
 * The foil is lit analytically from one light: pleats square to it flash in
 * stripes, the medallion's rim follows a cosine, the laurel is raised by a
 * highlight and a shadow shifted along the light. Hovering the seal moves
 * the light with the pointer; brushing the ribbons pushes them, and a tail
 * can be grabbed and thrown. The seal is a real button (sign and seal, then
 * burnish; Left and Right swing the ribbons) and Replay plays it all again.
 * Under reduced motion everything fades into place and nothing swings.
 */
export function AwardSeal({
  issuer,
  award,
  recipient,
  citation,
  date,
  signer,
  signerTitle,
  sealed,
  defaultSealed = false,
  onSealedChange,
  foil = "gold",
  ribbons = true,
  swing = 0.5,
  sound = false,
  disabled = false,
  className,
}: AwardSealProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const f = FOILS[foil] ?? FOILS.gold;
  const sw = clamp(swing, 0, 1);
  const pendulum = spring(lerpN(150, 70, sw), lerpN(0.62, 0.1, sw));
  const kick = lerpN(1.4, 4.6, sw);
  const lag = lerpN(0.03, 0.11, sw);
  const sig = React.useMemo(() => signatureOf(signer), [signer]);

  const [own, setOwn] = React.useState(defaultSealed);
  const isSealed = sealed ?? own;
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const write = useMotionValue(isSealed ? 1 : 0);
  const sigOpacity = useMotionValue(isSealed ? 1 : 0);
  const sealOpacity = useMotionValue(isSealed ? 1 : 0);
  const sealScale = useMotionValue(1);
  const hover = useMotionValue(0);
  const dent = useMotionValue(isSealed ? 1 : 0);
  const unfurl = useMotionValue(isSealed ? 1 : 0);
  const thetaL = useMotionValue(-RIB_REST);
  const thetaR = useMotionValue(RIB_REST);
  const az = useMotionValue(REST_AZ);
  const power = useMotionValue(REST_S);

  const sealRef = React.useRef<HTMLButtonElement | null>(null);
  const ribbonRef = React.useRef<HTMLDivElement | null>(null);
  const shown = React.useRef(isSealed);
  const voicedAt = React.useRef(-Infinity);
  const ceremony = React.useRef<Ceremony>({ timers: [], anims: [] });
  const swings = React.useRef(new Map<string, AnimationPlaybackControls>());
  const lights = React.useRef<AnimationPlaybackControls[]>([]);
  const grabbed = React.useRef<{
    side: "L" | "R";
    ax: number;
    ay: number;
  } | null>(null);
  const brushAt = React.useRef(0);
  const api = React.useRef<{
    play: (voiced: boolean, replay: boolean) => void;
  } | null>(null);

  const panOfSeal = () => {
    const rect = sealRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const stopCeremony = () => {
    for (const t of ceremony.current.timers) window.clearTimeout(t);
    for (const a of ceremony.current.anims) a.stop();
    ceremony.current = { timers: [], anims: [] };
  };

  const swingTo = (side: "L" | "R", velocity: number) => {
    const theta = side === "L" ? thetaL : thetaR;
    const rest = side === "L" ? -RIB_REST : RIB_REST;
    swings.current.get(side)?.stop();
    if (!motionSafe) {
      theta.jump(rest);
      return;
    }
    swings.current.set(side, animate(theta, rest, { ...pendulum, velocity }));
  };

  /** A push on both tails, the far one a little behind. */
  const push = (direction: number, strength = 1) => {
    if (!ribbons || !motionSafe) return;
    const v = direction * kick * strength;
    swingTo("L", thetaL.getVelocity() + v * (direction < 0 ? 1 : 0.8));
    swingTo("R", thetaR.getVelocity() + v * (direction > 0 ? 1 : 0.8));
  };

  /** The light goes round the crimps once: the foil's flash. */
  const flash = (voiced: boolean) => {
    if (voiced) audio.play("shimmer", { gain: 0.42, pan: panOfSeal() });
    if (!motionSafe) return;
    for (const l of lights.current) l.stop();
    const t = { duration: 0.62, ease: easings.move };
    lights.current = [
      animate(az, az.get() + TAU * 0.85, t),
      animate(power, [power.get(), 0.92, REST_S], { ...t, times: [0, 0.5, 1] }),
    ];
  };

  const play = (voiced: boolean, replay: boolean) => {
    stopCeremony();
    const c = ceremony.current;
    const at = (ms: number, fn: () => void) =>
      c.timers.push(window.setTimeout(fn, ms));
    if (replay) {
      // The old ink and seal leave quickly, then the ceremony starts over.
      const out = { duration: durations.fast, ease: easings.exit };
      c.anims.push(
        animate(sigOpacity, 0, out),
        animate(sealOpacity, 0, out),
        animate(dent, 0, out),
        animate(unfurl, 0, out),
      );
    }
    const lead = replay ? 200 : 0;
    if (!motionSafe) {
      at(lead, () => {
        write.jump(1);
        c.anims.push(
          animate(sigOpacity, 1, {
            duration: durations.slow,
            ease: easings.enter,
          }),
        );
        say(`Signed by ${signer}.`);
      });
      at(lead + 450, () => {
        if (voiced) audio.play("thud", { gain: 0.65, pan: panOfSeal() });
        sealScale.jump(1);
        hover.jump(0);
        unfurl.jump(1);
        thetaL.jump(-RIB_REST);
        thetaR.jump(RIB_REST);
        c.anims.push(
          animate(sealOpacity, 1, { duration: durations.base }),
          animate(dent, 1, { duration: durations.base }),
        );
        flash(voiced);
        say("Sealed.");
      });
      return;
    }
    at(lead, () => {
      write.jump(0);
      sigOpacity.jump(1);
      c.anims.push(animate(write, 1, { duration: 1.15, ease: easings.move }));
    });
    at(lead + 1180, () => say(`Signed by ${signer}.`));
    at(lead + 1250, () => {
      // The press: from above the paper, accelerating into it.
      sealScale.jump(1.08);
      hover.jump(1);
      unfurl.jump(0);
      thetaL.jump(-RIB_REST);
      thetaR.jump(RIB_REST);
      c.anims.push(
        animate(sealOpacity, 1, { duration: 0.08 }),
        animate(sealScale, 1, { duration: 0.14, ease: easings.exit }),
        animate(hover, 0, { duration: 0.14, ease: easings.exit }),
      );
    });
    at(lead + 1390, () => {
      if (voiced) audio.play("thud", { gain: 0.7, pan: panOfSeal() });
      sealScale.jump(0.985);
      c.anims.push(
        animate(sealScale, 1, springs.flick),
        animate(dent, 1, { duration: durations.base, ease: easings.enter }),
      );
      say("Sealed.");
    });
    at(lead + 1460, () => flash(voiced));
    at(lead + 1500, () => {
      if (!ribbons) return;
      c.anims.push(animate(unfurl, 1, springs.glide));
      swingTo("L", -kick * 0.9);
      swingTo("R", kick * 0.9);
    });
  };

  React.useEffect(() => {
    api.current = { play };
  });

  // Sealed from here or by the host: the ceremony plays. Unsealed by the
  // host: the ink and seal leave.
  React.useEffect(() => {
    if (shown.current === isSealed) return;
    shown.current = isSealed;
    const voiced = performance.now() - voicedAt.current < 600;
    if (isSealed) {
      api.current?.play(voiced, false);
      return;
    }
    for (const t of ceremony.current.timers) window.clearTimeout(t);
    for (const a of ceremony.current.anims) a.stop();
    const out = { duration: durations.fast, ease: easings.exit };
    ceremony.current = {
      timers: [],
      anims: [
        animate(sigOpacity, 0, out),
        animate(sealOpacity, 0, out),
        animate(dent, 0, out),
        animate(unfurl, 0, out),
      ],
    };
  }, [isSealed, sigOpacity, sealOpacity, dent, unfurl]);

  React.useEffect(() => {
    const swinging = swings.current;
    const lit = lights;
    const cer = ceremony;
    return () => {
      for (const t of cer.current.timers) window.clearTimeout(t);
      for (const a of cer.current.anims) a.stop();
      cer.current = { timers: [], anims: [] };
      for (const s of swinging.values()) s.stop();
      swinging.clear();
      for (const l of lit.current) l.stop();
      lit.current = [];
    };
  }, []);

  const pressSeal = () => {
    if (disabled) return;
    if (!isSealed) {
      voicedAt.current = performance.now();
      if (sealed === undefined) setOwn(true);
      onSealedChange?.(true);
      return;
    }
    // Pressed again: burnished. A softer press, the flash, a kick.
    audio.play("thud", { pitch: 1.35, gain: 0.35, pan: panOfSeal() });
    if (motionSafe) {
      sealScale.jump(0.97);
      swings.current.set("press", animate(sealScale, 1, springs.flick));
    }
    flash(true);
    push(1, 0.6);
  };

  const replay = () => {
    if (disabled || !isSealed) return;
    voicedAt.current = performance.now();
    say("Replaying the seal.");
    play(true, true);
  };

  // The light: the glide spring while it follows the pointer over the seal,
  // drift back to rest. The azimuth takes the short way round.
  const aimLight = (target: number, s: number, how: "follow" | "rest") => {
    for (const l of lights.current) l.stop();
    const now = az.get();
    let delta = (target - now) % TAU;
    if (delta > Math.PI) delta -= TAU;
    if (delta < -Math.PI) delta += TAU;
    if (!motionSafe) {
      az.jump(r3(now + delta));
      power.jump(r3(s));
      lights.current = [];
      return;
    }
    const sp = how === "rest" ? springs.drift : springs.glide;
    lights.current = [
      animate(az, r3(now + delta), sp),
      animate(power, r3(s), sp),
    ];
  };

  const onSealMove = (event: React.PointerEvent) => {
    if (disabled || !isSealed) return;
    const rect = sealRef.current?.getBoundingClientRect();
    if (!rect || rect.width < 1) return;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    aimLight(
      Math.atan2(dy, dx),
      clamp(Math.hypot(dx, dy) / (rect.width * 0.55), 0.18, 0.92),
      "follow",
    );
  };

  const drag = useDrag({
    disabled: disabled || !ribbons || !isSealed,
    threshold: 4,
    onStart: ({ point, offset }) => {
      const rect = ribbonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const k = rect.width / RIB_W;
      const ax = rect.left + rect.width / 2;
      const ay = rect.top;
      const side = point.x - offset.x < ax ? "L" : "R";
      grabbed.current = { side, ax: ax + (side === "L" ? -7 : 7) * k, ay };
      swings.current.get(side)?.stop();
    },
    onMove: ({ point }) => {
      const g = grabbed.current;
      if (!g || !motionSafe) return;
      const raw = Math.atan2(point.x - g.ax, Math.max(8, point.y - g.ay));
      const theta = rubberClamp(raw, -0.87, 0.87, 0.5);
      (g.side === "L" ? thetaL : thetaR).set(r3(theta));
    },
    onEnd: ({ velocity }) => {
      const g = grabbed.current;
      grabbed.current = null;
      if (!g) return;
      const rect = ribbonRef.current?.getBoundingClientRect();
      const reach = rect ? (RIB_LEN * rect.width) / RIB_W : 50;
      // The finger's speed across the tail, as the tail's angular speed.
      const omega = clamp(velocity.x / Math.max(20, reach), -9, 9);
      swingTo(g.side, omega);
      swingTo(g.side === "L" ? "R" : "L", omega * 0.4);
    },
    onCancel: () => {
      grabbed.current = null;
      swingTo("L", 0);
      swingTo("R", 0);
    },
  });

  const lit = useTransform(
    [az, power] as MotionValue<number>[],
    ([a = REST_AZ, s = REST_S]: number[]): Lit => ({
      az: a,
      s,
      lz: Math.sqrt(Math.max(0.05, 1 - s * s)),
    }),
  );
  const crimpShade = useTransform(lit, (l) => crimp(l, f));
  const rimShade = useTransform(lit, (l) => rim(l, f));
  const glint = useTransform(
    lit,
    (l) =>
      `radial-gradient(circle at ${r2(50 + Math.cos(l.az) * 30 * l.s)}% ${r2(50 + Math.sin(l.az) * 30 * l.s)}%, oklch(1 0 0 / ${r2(0.25 + 0.5 * l.s)}) 0%, oklch(1 0 0 / 0) 42%)`,
  );
  const raise = useTransform(lit, (l) => ({
    x: r2(Math.cos(l.az) * 0.7),
    y: r2(Math.sin(l.az) * 0.7),
  }));
  const hiX = useTransform(raise, (p) => p.x);
  const hiY = useTransform(raise, (p) => p.y);
  const loX = useTransform(raise, (p) => -p.x);
  const loY = useTransform(raise, (p) => -p.y);
  const sealShadow = useTransform(
    hover,
    (h) =>
      `drop-shadow(0 ${r2(1 + h * 5)}px ${r2(1.2 + h * 6)}px oklch(0.25 0.03 60 / ${r2(0.38 - h * 0.18)}))`,
  );
  const sigVisible = useTransform(
    [write, sigOpacity] as MotionValue<number>[],
    ([w = 0, o = 0]: number[]) => (w > 0.002 ? o : 0),
  );
  const placeholder = useTransform(sealOpacity, (o) => r2(1 - o));

  return (
    <article
      aria-label={`${award}, ${recipient}`}
      className={cn(
        "@container w-full max-w-[460px]",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        className="rounded-2 p-1.5"
        style={{
          backgroundColor: PAPER,
          boxShadow:
            "0 1px 2px oklch(0.2 0.02 260 / 0.16), 0 6px 18px -8px oklch(0.2 0.02 260 / 0.28)",
        }}
      >
        <div
          className="relative flex gap-2.5 rounded-1 px-3 py-2.5 @sm:gap-3 @sm:px-4 @sm:py-3"
          style={{
            boxShadow: `inset 0 0 0 1px ${f.accent}, inset 0 0 0 3px ${PAPER}, inset 0 0 0 3.6px ${f.accent}`,
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col">
            <p
              className="truncate font-mono text-[9px] leading-3 tracking-[0.14em] uppercase @sm:tracking-[0.22em]"
              style={{ color: f.accent }}
            >
              {issuer}
            </p>
            <h3
              className="mt-1 text-[13px] leading-4 font-semibold tracking-[0.01em] @sm:text-sm"
              style={{ color: INK }}
            >
              {award}
            </h3>
            <p
              className="mt-2 font-mono text-[8.5px] leading-3 tracking-[0.16em] uppercase"
              style={{ color: FAINT }}
            >
              Presented to
            </p>
            <p
              className="text-lg leading-6 font-semibold tracking-[-0.01em] @sm:text-xl @sm:leading-7"
              style={{ color: INK }}
            >
              {recipient}
            </p>
            {citation ? (
              <p
                className="mt-0.5 text-[10.5px] leading-3.5 @sm:text-[11px]"
                style={{ color: FAINT }}
              >
                {citation}
              </p>
            ) : null}
            <div className="mt-2.5 flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <svg
                  aria-hidden
                  viewBox={`0 0 ${sig.width} 40`}
                  preserveAspectRatio="xMinYMax meet"
                  className="block h-7 w-full max-w-36 overflow-visible"
                >
                  <motion.path
                    d={sig.d}
                    fill="none"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(isSealed && "print:[stroke-dasharray:none]")}
                    style={{
                      stroke: PEN,
                      pathLength: write,
                      opacity: sigVisible,
                    }}
                  />
                </svg>
                <div className="border-t" style={{ borderColor: FAINT }} />
                <p
                  className="mt-0.5 text-[10px] leading-3.5"
                  style={{ color: INK }}
                >
                  <span className="sr-only">
                    {isSealed ? "Signed by " : "To be signed by "}
                  </span>
                  {signer}
                  {signerTitle ? (
                    <span
                      className="whitespace-nowrap"
                      style={{ color: FAINT }}
                    >
                      {" "}
                      · {signerTitle}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className="text-[10px] leading-3.5 whitespace-nowrap"
                  style={{ color: INK }}
                >
                  {date}
                </p>
                <p
                  className="font-mono text-[8.5px] leading-3 tracking-[0.16em] uppercase"
                  style={{ color: FAINT }}
                >
                  Date
                </p>
              </div>
            </div>
          </div>

          <div className="relative flex w-16 shrink-0 flex-col items-center @sm:w-21">
            <div className="flex h-6 items-center">
              {isSealed ? (
                <button
                  type="button"
                  onClick={replay}
                  disabled={disabled}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-1 px-1.5 text-[10px] font-medium transition-colors outline-none print:hidden",
                    "hover:bg-[oklch(0.3_0.02_60/0.07)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed",
                  )}
                  style={{ color: FAINT }}
                >
                  <ReplayGlyph />
                  Replay
                </button>
              ) : null}
            </div>
            <div className="relative mt-1.5 size-14 @sm:size-[68px]">
              {ribbons ? (
                <div
                  ref={ribbonRef}
                  {...drag}
                  onPointerMove={(event) => {
                    drag.onPointerMove(event);
                    if (event.pointerType !== "mouse" || grabbed.current)
                      return;
                    // Brushing past the tails pushes them by the pointer's speed.
                    const now = event.timeStamp;
                    if (now - brushAt.current < 90) return;
                    const speed =
                      event.movementX / Math.max(1, now - brushAt.current);
                    brushAt.current = now;
                    if (Math.abs(event.movementX) > 3) {
                      push(
                        Math.sign(speed),
                        Math.min(0.8, Math.abs(event.movementX) / 14),
                      );
                    }
                  }}
                  className={cn(
                    "absolute top-1/2 left-1/2 aspect-[104/74] w-[153%] -translate-x-1/2 touch-none",
                    isSealed && !disabled
                      ? "cursor-grab active:cursor-grabbing"
                      : "pointer-events-none",
                  )}
                >
                  <svg
                    aria-hidden
                    viewBox={`${-RIB_W / 2} 0 ${RIB_W} ${RIB_H}`}
                    className="block size-full overflow-visible"
                  >
                    <motion.g style={{ opacity: sealOpacity }}>
                      <Ribbon
                        ax={-7}
                        theta={thetaL}
                        unfurl={unfurl}
                        lag={lag}
                        f={f}
                      />
                      <Ribbon
                        ax={7}
                        theta={thetaR}
                        unfurl={unfurl}
                        lag={lag}
                        f={f}
                      />
                    </motion.g>
                  </svg>
                </div>
              ) : null}

              <motion.div
                aria-hidden
                className="pointer-events-none absolute -inset-[7%] rounded-full"
                style={{
                  opacity: dent,
                  boxShadow:
                    "inset 0 0 0 1px oklch(1 0 0 / 0.7), 0 0 0 1.5px oklch(0.35 0.03 60 / 0.07), 0 1px 4px 1px oklch(0.35 0.03 60 / 0.16)",
                }}
              />

              <button
                ref={sealRef}
                type="button"
                disabled={disabled}
                aria-describedby={isSealed ? hintId : undefined}
                aria-label={
                  isSealed
                    ? `Seal of ${issuer}. Press to burnish`
                    : "Sign and seal the certificate"
                }
                onClick={pressSeal}
                onPointerMove={onSealMove}
                onPointerLeave={() => {
                  if (isSealed) aimLight(REST_AZ, REST_S, "rest");
                }}
                onKeyDown={(event) => {
                  if (!isSealed) return;
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    push(event.key === "ArrowLeft" ? -1 : 1);
                  }
                }}
                className={cn(
                  "absolute inset-0 rounded-full outline-none select-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring focus-visible:outline-solid",
                  disabled ? "cursor-not-allowed" : "cursor-pointer",
                )}
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-full border border-dashed text-center text-[9px] leading-3 font-medium @sm:text-[10px]"
                  style={{
                    opacity: placeholder,
                    borderColor: f.accent,
                    color: f.accent,
                  }}
                >
                  Sign &amp;
                  <br />
                  seal
                </motion.span>
                <motion.span
                  aria-hidden
                  className={cn(
                    "absolute inset-0 block",
                    isSealed && "print:opacity-100!",
                  )}
                  style={{
                    opacity: sealOpacity,
                    scale: sealScale,
                    filter: sealShadow,
                  }}
                >
                  <span
                    className="absolute inset-0 block"
                    style={{
                      clipPath: SERRATION,
                      backgroundColor: `oklch(${f.base})`,
                    }}
                  >
                    <motion.span
                      className="absolute inset-0 block"
                      style={{
                        backgroundImage: crimpShade,
                        maskImage: CRIMP_MASK,
                        WebkitMaskImage: CRIMP_MASK,
                      }}
                    />
                  </span>
                  <span
                    className="absolute inset-[19%] block overflow-clip rounded-full"
                    style={{
                      backgroundImage: `radial-gradient(circle at 50% 38%, oklch(${f.hi}) 0%, oklch(${f.base}) 58%, oklch(${f.lo}) 120%)`,
                      boxShadow: `0 0 0 0.8px oklch(${f.lo} / 0.6)`,
                    }}
                  >
                    <motion.span
                      className="absolute inset-0 block"
                      style={{
                        backgroundImage: rimShade,
                        maskImage: RIM_MASK,
                        WebkitMaskImage: RIM_MASK,
                      }}
                    />
                    <svg
                      viewBox="0 0 40 40"
                      className="absolute inset-[14%] block"
                    >
                      <motion.g style={{ x: hiX, y: hiY }}>
                        <Emblem fill={`oklch(${f.hi} / 0.95)`} />
                      </motion.g>
                      <motion.g style={{ x: loX, y: loY }}>
                        <Emblem fill={`oklch(${f.lo} / 0.85)`} />
                      </motion.g>
                      <Emblem fill={`oklch(${f.base})`} />
                    </svg>
                    <motion.span
                      className="absolute inset-0 block"
                      style={{ backgroundImage: glint }}
                    />
                  </span>
                </motion.span>
              </button>
            </div>
          </div>
        </div>
      </div>
      <p id={hintId} className="sr-only">
        Left and Right swing its ribbons.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </article>
  );
}

function lerpN(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
